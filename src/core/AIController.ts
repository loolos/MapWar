import { Cell } from './Cell';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';
import { AuraSystem } from './AuraSystem';
import { DefaultAIProfile, mergeAIWeights, type AIProfile, type AIWeights } from './ai/AIProfile';

export class AIController {
    engine: GameEngine;
    private profileByPlayerId: Map<string, AIProfile> = new Map();
    private cachedTreasureLocations: { r: number; c: number; gold: number }[] = [];
    private treasureCacheValid: boolean = false;

    constructor(engine: GameEngine) {
        this.engine = engine;
    }

    public setProfileForPlayer(playerId: string, profile: AIProfile) {
        this.profileByPlayerId.set(playerId, profile);
    }

    public getProfileForPlayer(playerId: string): AIProfile | undefined {
        return this.profileByPlayerId.get(playerId);
    }

    public getProfileLabel(playerId: string): string | null {
        const profile = this.profileByPlayerId.get(playerId);
        if (!profile) return null;
        return profile.label || profile.id;
    }

    public invalidateTreasureCache() {
        this.treasureCacheValid = false;
    }

    private getWeightsForPlayer(playerId: string): AIWeights {
        const profile = this.profileByPlayerId.get(playerId);
        return mergeAIWeights(profile?.weights ?? DefaultAIProfile.weights);
    }

    // AI Logic (Robust & Strategic)
    playTurn() {
        try {
            const aiPlayer = this.engine.state.getCurrentPlayer();
            if (!aiPlayer.isAI) {
                return;
            }

            // Clear previous stats
            this.engine.lastAiMoves = [];

            const weights = this.getWeightsForPlayer(aiPlayer.id as string);
            const nowMs = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const startTime = nowMs();
            const timeBudgetMs = GameConfig.AI_TURN_BUDGET_MS;
            const isOverBudget = () => {
                return (nowMs() - startTime) >= timeBudgetMs;
            };

            // Optional perf collector (used by benchmark / profiling scripts)
            const perf = (this.engine as any).aiPerf as undefined | {
                add: (name: string, ms: number) => void;
            };
            const time = <T>(name: string, fn: () => T): T => {
                if (!perf) return fn();
                const t0 = nowMs();
                const out = fn();
                perf.add(name, nowMs() - t0);
                return out;
            };

            const turnCount = this.engine.state.turnCount;
            const isEarlyGame = turnCount <= weights.STRATEGY_EARLY_TURN_LIMIT;
            const actedTiles = new Set<string>();

            type ActionCategory = 'attack' | 'expand' | 'defense' | 'base_upgrade' | 'farm';
            type ActionCandidate = {
                kind: 'move' | 'interaction';
                category: ActionCategory;
                r: number;
                c: number;
                score: number;
                cost: number;
                actionId?: string;
            };


            const buildCandidates = (): ActionCandidate[] => {
                const candidates: ActionCandidate[] = [];
                const grid = this.engine.state.grid;
                const myBases: { r: number; c: number }[] = [];
                let ownedCells: { r: number; c: number }[] = [];
                const disconnectedOwned = new Set<string>();

                // Use cached treasure locations if available
                if (!this.treasureCacheValid) {
                    time('ai.buildCandidates.scanTreasure', () => {
                        this.cachedTreasureLocations = [];
                        for (let r = 0; r < grid.length; r++) {
                            for (let c = 0; c < grid[r].length; c++) {
                                const cell = grid[r][c];
                                if (cell.treasureGold !== null && cell.treasureGold > 0) {
                                    this.cachedTreasureLocations.push({ r, c, gold: cell.treasureGold });
                                }
                            }
                        }
                    });
                    this.treasureCacheValid = true;
                }
                const treasureLocations = this.cachedTreasureLocations;
                const threatByKey = new Map<string, number>();
                const myFrontLines: { r: number; c: number; cell: any; threat: number }[] = [];
                const farmSpots: { r: number; c: number; auraBonus: number }[] = [];
                let farmIncome = 0;
                let baseIncome = 0;

                // Use indexed owned cells instead of full grid scan (O(owned) vs O(grid))
                time('ai.buildCandidates.scanOwned', () => {
                    ownedCells = this.engine.state.getOwnedCells(aiPlayer.id as string);
                    for (const { r, c } of ownedCells) {
                        if (isOverBudget()) return;
                        const cell = grid[r][c];
                        if (cell.building === 'base') {
                            myBases.push({ r, c });
                        }
                        if (!cell.isConnected) {
                            disconnectedOwned.add(`${r},${c}`);
                        }
                        const income = this.engine.state.getTileIncome(r, c);
                        if (cell.building === 'farm') {
                            farmIncome += income;
                        } else if (cell.building === 'base') {
                            baseIncome += income;
                        }
                    }
                });
                if (isOverBudget()) return candidates;
                const farmToBaseRatio = baseIncome > 0 ? farmIncome / baseIncome : farmIncome > 0 ? 1 : 0;
                const farmBalanceBonus = farmToBaseRatio < weights.ECONOMY_FARM_INCOME_TARGET_RATIO
                    ? weights.ECONOMY_FARM_BALANCE_BONUS
                    : 0;
                const baseBalanceBonus = farmToBaseRatio > weights.ECONOMY_FARM_INCOME_TARGET_RATIO
                    ? weights.ECONOMY_BASE_BALANCE_BONUS
                    : 0;

                const citadelCell = this.engine.state.citadelLocation;

                const countEnemyAdjacent = (r: number, c: number) => {
                    let enemies = 0;
                    const neighbors = [
                        { r: r + 1, c }, { r: r - 1, c },
                        { r, c: c + 1 }, { r, c: c - 1 }
                    ];
                    for (const n of neighbors) {
                        if (!this.engine.isValidCell(n.r, n.c)) continue;
                        const nCell = this.engine.state.getCell(n.r, n.c);
                        if (nCell && nCell.owner && nCell.owner !== aiPlayer.id) {
                            enemies++;
                        }
                    }
                    return enemies;
                };

                const addInteraction = (r: number, c: number, actionId: string, score: number, category: ActionCategory) => {
                    if (actedTiles.has(`${r},${c}`)) return;
                    const action = this.engine.interactionRegistry.get(actionId);
                    if (!action) return;
                    if (!action.isAvailable(this.engine, r, c, true)) return;
                    const cost = typeof action.cost === 'function' ? action.cost(this.engine, r, c) : action.cost;
                    if (cost <= 0) return;
                    candidates.push({ kind: 'interaction', category, r, c, score, cost, actionId });
                };

                // Build candidate positions: owned tiles and their neighbors
                // Use numeric keys (r*width + c) to avoid string split/alloc in hot loop.
                const width = GameConfig.GRID_WIDTH;
                const candidatePositions = new Set<number>();
                time('ai.buildCandidates.buildAdjacencySet', () => {
                    for (const cellPos of ownedCells) {
                        const { r, c } = cellPos;
                        const neighbors = [
                            { r: r + 1, c }, { r: r - 1, c },
                            { r, c: c + 1 }, { r, c: c - 1 }
                        ];
                        for (const n of neighbors) {
                            if (this.engine.isValidCell(n.r, n.c)) {
                                // Only consider non-owned tiles for move candidates.
                                // Owned tiles are handled via interaction candidates and would be rejected by validateMove anyway.
                                const nCell = grid[n.r][n.c];
                                if (nCell.owner === aiPlayer.id) continue;
                                candidatePositions.add(n.r * width + n.c);
                            }
                        }
                    }
                });

                // Move candidates (owned + adjacent)
                time('ai.buildCandidates.moves', () => {
                    for (const key of candidatePositions) {
                        if (isOverBudget()) return;
                        const r = Math.floor(key / width);
                        const c = key % width;
                        if (!this.engine.isValidCell(r, c)) continue;
                        if (actedTiles.has(`${r},${c}`)) continue;

                        const validation = time('ai.validateMove', () => this.engine.validateMove(r, c));
                        if (!validation.valid) continue;
                        const costValidation = time('ai.checkMoveCost', () => this.engine.checkMoveCost(r, c));
                        if (!costValidation.valid) continue;

                        const cell = grid[r][c];
                        const cost = time('ai.getMoveCost', () => this.engine.getMoveCost(r, c));
                        let score = weights.SCORE_BASE_VALUE;
                        score += this.scoreObjectives(cell, aiPlayer.id as string, weights);
                        score += this.scoreAggression(cell, r, c, aiPlayer.id as string, myBases, weights);
                        score += this.scoreTactical(cell, weights);
                        score += this.scoreTreasure(cell, weights);
                        score += this.scoreTreasureProximity(r, c, treasureLocations, weights);
                        score += this.scoreExpansion(cell, turnCount, weights);
                        score += this.scoreAura(r, c, aiPlayer.id as string, weights);
                        score += this.scoreLookAhead(r, c, aiPlayer.id as string, grid, weights);
                        score += this.scoreCitadelProximity(r, c, citadelCell, weights);
                        score += this.scoreReconnect(r, c, disconnectedOwned, weights);
                        const enemyAdj = countEnemyAdjacent(r, c);
                        if (enemyAdj > 0) {
                            score -= enemyAdj * weights.RISK_ENEMY_ADJACENT_PENALTY;
                        }
                        score -= (cost * weights.COST_PENALTY_MULTIPLIER);
                        score += Math.random() * weights.RANDOM_NOISE;

                        const category: ActionCategory = cell.owner && cell.owner !== aiPlayer.id ? 'attack' : 'expand';
                        if (category === 'attack' && turnCount >= weights.STRATEGY_ENDGAME_TURN) {
                            score += weights.STRATEGY_ENDGAME_ATTACK_BONUS;
                        }
                        candidates.push({ kind: 'move', category, r, c, score, cost });
                    }
                });
                if (isOverBudget()) return candidates;

                // Interaction candidates
                for (const cellPos of ownedCells) {
                    if (isOverBudget()) return candidates;
                    const { r, c } = cellPos;
                    if (actedTiles.has(`${r},${c}`)) continue;
                    const cell = this.engine.state.getCell(r, c);
                    if (!cell) continue;

                    const neighbors = [
                        { r: r + 1, c: c }, { r: r - 1, c: c },
                        { r: r, c: c + 1 }, { r: r, c: c - 1 }
                    ];
                    let threat = 0;
                    for (let i = 0; i < neighbors.length; i++) {
                        const n = neighbors[i];
                        const nCell = this.engine.state.getCell(n.r, n.c);
                        if (nCell && nCell.owner && nCell.owner !== aiPlayer.id) {
                            threat++;
                        }
                    }
                    if (threat > 0) {
                        const key = `${r},${c}`;
                        threatByKey.set(key, threat);
                        myFrontLines.push({ r, c, cell, threat });
                    }

                    // Only add to farm spots if not on front line (threat = 0)
                    // Front line cells should prioritize defense over economy
                    if (threat === 0 && cell.building === 'none' && cell.type === 'plain' && cell.isConnected) {
                        const auraBonus = AuraSystem.getIncomeAuraBonus(this.engine.state, r, c, aiPlayer.id as string);
                        if (auraBonus > 0) {
                            farmSpots.push({ r, c, auraBonus });
                        }
                    }
                }

                for (const base of myBases) {
                    if (isOverBudget()) break;
                    const { r, c } = base;
                    const cell = this.engine.state.getCell(r, c);
                    if (!cell) continue;
                    if (cell.incomeLevel < GameConfig.UPGRADE_INCOME_MAX) {
                        const score = weights.ECONOMY_BASE_INCOME
                            + (cell.incomeLevel * weights.ECONOMY_BASE_INCOME_LEVEL)
                            + baseBalanceBonus
                            + (isEarlyGame ? weights.STRATEGY_BASE_UPGRADE_BONUS : 0);
                        addInteraction(r, c, 'UPGRADE_INCOME', score, 'base_upgrade');
                    }
                    if (cell.defenseLevel < GameConfig.UPGRADE_DEFENSE_MAX) {
                        const threat = threatByKey.get(`${r},${c}`) || 0;
                        const score = weights.DEFENSE_BASE_UPGRADE
                            + (threat * weights.DEFENSE_THREAT_MULT)
                            + weights.STRATEGY_BASE_UPGRADE_BONUS;
                        addInteraction(r, c, 'UPGRADE_DEFENSE', score, 'defense');
                    }
                }

                for (const spot of farmSpots) {
                    if (isOverBudget()) break;
                    const score = weights.ECONOMY_FARM_BUILD
                        + (spot.auraBonus * weights.ECONOMY_AURA_BONUS_MULT)
                        + farmBalanceBonus
                        + (isEarlyGame ? weights.STRATEGY_EARLY_FARM_BONUS : 0);
                    addInteraction(spot.r, spot.c, 'BUILD_FARM', score, 'farm');
                }

                for (const r of myFrontLines) {
                    if (isOverBudget()) break;
                    const threatScore = r.threat * weights.DEFENSE_THREAT_MULT;
                    if (r.cell.building === 'none' && r.cell.type === 'plain') {
                        const score = weights.DEFENSE_WALL_BUILD + threatScore + weights.STRATEGY_WALL_PRIORITY_BONUS;
                        addInteraction(r.r, r.c, 'BUILD_WALL', score, 'defense');
                    } else if (r.cell.building === 'wall') {
                        if (r.cell.watchtowerLevel === 0) {
                            const score = weights.DEFENSE_WATCHTOWER_BUILD + threatScore;
                            addInteraction(r.r, r.c, 'BUILD_WATCHTOWER', score, 'defense');
                        } else if (r.cell.watchtowerLevel < GameConfig.WATCHTOWER_MAX_LEVEL) {
                            const score = weights.DEFENSE_WATCHTOWER_UPGRADE + threatScore;
                            addInteraction(r.r, r.c, 'UPGRADE_WATCHTOWER', score, 'defense');
                        }
                        if (r.cell.defenseLevel < GameConfig.UPGRADE_WALL_MAX) {
                            const score = weights.DEFENSE_WALL_UPGRADE + threatScore;
                            addInteraction(r.r, r.c, 'UPGRADE_DEFENSE', score, 'defense');
                        }
                    }
                }

                // Use indexed owned cells instead of full grid scan
                time('ai.buildCandidates.scanFarmUpgrades', () => {
                    for (const { r, c } of ownedCells) {
                        if (actedTiles.has(`${r},${c}`)) continue;
                        const cell = grid[r][c];
                        if (cell.building === 'farm' && cell.farmLevel < GameConfig.FARM_MAX_LEVEL) {
                            const score = weights.ECONOMY_FARM_UPGRADE
                                + (cell.farmLevel * weights.ECONOMY_FARM_LEVEL)
                                + farmBalanceBonus;
                            addInteraction(r, c, 'UPGRADE_FARM', score, 'farm');
                        }
                    }
                });

                return candidates;
            };

            let actionCounter = 0;
            const MAX_ACTIONS = weights.MAX_MOVES_PER_TURN;
            let remainingGold = aiPlayer.gold;
            const skipped = new Set<string>();

            const initialCandidates = time('ai.buildCandidates.total', buildCandidates);
            const bestTarget = initialCandidates
                .filter((c) => c.kind === 'move')
                .map((c) => ({ candidate: c, cell: this.engine.state.getCell(c.r, c.c) }))
                .filter(({ cell }) => !!cell && cell.owner && cell.owner !== aiPlayer.id && (cell.building === 'base' || cell.building === 'town'))
                .sort((a, b) => b.candidate.score - a.candidate.score)[0];

            if (bestTarget && bestTarget.candidate.cost > remainingGold) {
                const income = this.engine.state.calculateIncome(aiPlayer.id as string);
                const incomePerTurn = Math.max(income || 0, 1);
                const shortfall = bestTarget.candidate.cost - remainingGold;
                const turnsNeeded = Math.ceil(shortfall / incomePerTurn);
                if (turnsNeeded <= weights.SAVE_FOR_TARGET_MAX_TURNS && bestTarget.candidate.score >= weights.SAVE_FOR_TARGET_MIN_SCORE) {
                    return;
                }
            }

            while (actionCounter < MAX_ACTIONS) {
                if (isOverBudget()) break;
                const candidates = time('ai.buildCandidates.total', buildCandidates);
                const eligible = candidates.filter((c) => {
                    const key = `${c.kind}:${c.actionId ?? 'move'}:${c.r},${c.c}`;
                    if (skipped.has(key)) return false;
                    if (c.cost > remainingGold) return false;
                    if (actedTiles.has(`${c.r},${c.c}`)) return false;
                    return true;
                });

                if (eligible.length === 0) break;
                time('ai.sortCandidates', () => eligible.sort((a, b) => b.score - a.score));
                const best = eligible[0];
                const key = `${best.kind}:${best.actionId ?? 'move'}:${best.r},${best.c}`;
                let executed = false;

                if (best.kind === 'move') {
                    this.engine.togglePlan(best.r, best.c);
                    if (this.engine.lastError) {
                        skipped.add(key);
                        continue;
                    }
                    this.engine.lastAiMoves.push({ r: best.r, c: best.c });
                    time('ai.commitMoves', () => this.engine.commitMoves());
                    executed = true;
                } else if (best.actionId) {
                    const before = this.engine.pendingInteractions.length;
                    this.engine.planInteraction(best.r, best.c, best.actionId);
                    if (this.engine.pendingInteractions.length > before) {
                        time('ai.commitMoves', () => this.engine.commitMoves());
                        executed = true;
                    } else {
                        skipped.add(key);
                    }
                }

                if (!executed) continue;
                actedTiles.add(`${best.r},${best.c}`);
                remainingGold = this.engine.state.getCurrentPlayer().gold;
                actionCounter++;
            }

        } catch (err) {
            console.error("AI Logic Exception:", err);
        } finally {
            this.engine.endTurn();
        }
    }

    private scoreObjectives(cell: Cell, aiPlayerId: string, weights: AIWeights): number {
        let score = 0;
        if (cell.building === 'base' && cell.owner !== aiPlayerId) score += weights.SCORE_WIN_CONDITION;
        else if (cell.building === 'citadel' && cell.owner !== aiPlayerId) {
            score += weights.SCORE_CITADEL;
            if (cell.owner) score += weights.SCORE_CITADEL; // Extra when enemy-held (take-back priority)
        } else if (cell.building === 'town' && cell.owner !== aiPlayerId) score += weights.SCORE_TOWN;
        else if (cell.building === 'gold_mine' && cell.owner !== aiPlayerId) score += weights.SCORE_GOLD_MINE;
        else if (cell.building === 'lighthouse' && cell.owner !== aiPlayerId) score += weights.SCORE_LIGHTHOUSE;
        return score;
    }

    private scoreAggression(cell: Cell, r: number, c: number, aiPlayerId: string, myBases: { r: number, c: number }[], weights: AIWeights): number {
        let score = 0;
        if (cell.owner && cell.owner !== aiPlayerId) {
            score += weights.SCORE_ENEMY_LAND;
            if (!cell.isConnected) score += weights.SCORE_DISCONNECT_ENEMY;

            for (const base of myBases) {
                const dist = Math.abs(r - base.r) + Math.abs(c - base.c);
                if (dist <= weights.DEFENSE_BASE_THREAT_RADIUS) {
                    const urgency = (weights.DEFENSE_BASE_THREAT_RADIUS - dist + 1);
                    score += (weights.SCORE_DEFEND_BASE + weights.DEFENSE_BASE_THREAT_SCORE) * urgency;
                }
            }
        }
        return score;
    }

    private scoreTactical(cell: Cell, weights: AIWeights): number {
        let score = 0;
        if (cell.type === 'hill') score += weights.SCORE_HILL;
        else if (cell.type === 'bridge') score += weights.SCORE_BRIDGE;
        else if (cell.type === 'water') {
            // New Mechanic: Build Bridge
            // Heuristic: If this water tile is adjacent to valid unowned land (Expansion) or Enemy (Attack), boost it.
            // Bridges are expensive (50), so only do it if useful.
            score -= 20; // Base penalty for cost perception beyond raw gold

            // Check neighbors for opportunity
            const neighbors = [
                { r: cell.row + 1, c: cell.col }, { r: cell.row - 1, c: cell.col },
                { r: cell.row, c: cell.col + 1 }, { r: cell.row, c: cell.col - 1 }
            ];
            for (const n of neighbors) {
                if (this.engine.isValidCell(n.r, n.c)) {
                    const nCell = this.engine.state.getCell(n.r, n.c);
                    if (nCell && nCell.owner !== this.engine.state.currentPlayerId) {
                        score += 30; // Bonus for bridging to stored targets
                    }
                }
            }
        }
        return score;
    }

    private scoreTreasure(cell: Cell, weights: AIWeights): number {
        if (cell.treasureGold === null || cell.treasureGold <= 0) {
            return 0;
        }
        // Use average expected gold from config instead of actual value
        const avgGold = (GameConfig.TREASURE_GOLD_MIN + GameConfig.TREASURE_GOLD_MAX) / 2;
        // Base score for treasure + average gold multiplier
        return weights.SCORE_TREASURE + avgGold * weights.SCORE_TREASURE_GOLD_MULTIPLIER;
    }

    private scoreTreasureProximity(r: number, c: number, treasureLocations: { r: number; c: number; gold: number }[], weights: AIWeights): number {
        if (treasureLocations.length === 0) return 0;

        let bestScore = 0;
        const maxRange = weights.SCORE_TREASURE_PROXIMITY_RANGE;

        for (const treasure of treasureLocations) {
            const dist = Math.abs(r - treasure.r) + Math.abs(c - treasure.c);
            if (dist > maxRange) continue;

            // Score decreases with distance only (not based on actual treasure gold value)
            const distanceFactor = (maxRange - dist + 1) / maxRange; // 1.0 at dist=1, decreasing to 1/maxRange at dist=maxRange
            const score = weights.SCORE_TREASURE_PROXIMITY * distanceFactor;

            if (score > bestScore) {
                bestScore = score;
            }
        }

        return bestScore;
    }

    private scoreExpansion(cell: Cell, turnCount: number, weights: AIWeights): number {
        if (cell.owner === null) {
            const earlyBonus = turnCount <= weights.STRATEGY_EARLY_TURN_LIMIT
                ? weights.STRATEGY_EARLY_EXPANSION_BONUS
                : 0;
            return weights.SCORE_EXPANSION + earlyBonus;
        }
        return 0;
    }

    private scoreAura(r: number, c: number, aiPlayerId: string, weights: AIWeights): number {
        const { discount } = AuraSystem.getSupportDiscount(this.engine.state, r, c, aiPlayerId);
        if (discount > 0) {
            return discount * weights.SCORE_AURA_MULTIPLIER;
        }
        return 0;
    }

    private scoreLookAhead(r: number, c: number, aiPlayerId: string, grid: Cell[][], weights: AIWeights): number {
        let score = 0;
        const neighbors = [
            { r: r + 1, c: c }, { r: r - 1, c: c },
            { r: r, c: c + 1 }, { r: r, c: c - 1 }
        ];

        for (const n of neighbors) {
            if (n.r >= 0 && n.r < GameConfig.GRID_HEIGHT && n.c >= 0 && n.c < GameConfig.GRID_WIDTH) {
                const nCell = grid[n.r][n.c];
                if (nCell.owner !== aiPlayerId) {
                    if (nCell.building === 'town') score += weights.SCORE_LOOKAHEAD_TOWN;
                    if (nCell.building === 'base') score += weights.SCORE_LOOKAHEAD_BASE;
                }
            }
        }
        return score;
    }

    private scoreCitadelProximity(r: number, c: number, citadel: { r: number; c: number } | null, weights: AIWeights): number {
        if (!citadel) return 0;

        const citadelCell = this.engine.state.getCell(citadel.r, citadel.c);
        if (!citadelCell) return 0;

        const maxRange = 6; // Increased from 3 to 6 to detect it earlier
        const dist = Math.abs(r - citadel.r) + Math.abs(c - citadel.c);
        if (dist > maxRange) return 0;

        let score = weights.SCORE_CITADEL_PROXIMITY * (1 - dist / maxRange);

        // STRATEGY: SEEK AND DESTROY
        // If Citadel is owned by someone else (Enemy or Neutral), prioritizing moving closer/capturing
        if (citadelCell.owner !== this.engine.state.currentPlayerId) {
            score *= weights.CITADEL_SEEK_MULTIPLIER; // Seek behavior

            // If owned by Enemy, urgency increases
            if (citadelCell.owner) {
                const holder = this.engine.state.players[citadelCell.owner];
                const held = holder.citadelTurnsHeld ?? 0;

                // Panic Mode: If they define dominance soon
                if (held >= 1) { // They have held it for at least 1 turn
                    score += weights.CITADEL_URGENCY_HELD_SCORE; // Major urgency
                }
                if (held >= GameConfig.CITADEL_DOMINANCE_TURNS_MIN - 1) {
                    score += weights.CITADEL_URGENCY_DOMINANCE_SCORE; // Critical urgency (prevent dominance)
                }
            } else {
                // Neutral: Good to take, but not panic
                score += weights.CITADEL_NEUTRAL_CAPTURE_SCORE;
            }
        } else {
            // I own it: Defend it (Score for staying close?)
            // Maybe less critical if safe, but we want to form a buffer.
            score *= weights.CITADEL_OWNED_DEFENSE_MULTIPLIER;
        }

        return score;
    }

    private scoreReconnect(r: number, c: number, disconnectedOwned: Set<string>, weights: AIWeights): number {
        if (disconnectedOwned.size === 0) return 0;
        let adjacentDisconnected = 0;
        const neighbors = [
            { r: r + 1, c: c },
            { r: r - 1, c: c },
            { r: r, c: c + 1 },
            { r: r, c: c - 1 }
        ];
        for (const n of neighbors) {
            if (!this.engine.isValidCell(n.r, n.c)) continue;
            if (disconnectedOwned.has(`${n.r},${n.c}`)) {
                adjacentDisconnected++;
            }
        }
        if (adjacentDisconnected === 0) return 0;
        let score = adjacentDisconnected * weights.RECONNECT_DISCONNECTED_SCORE;
        if (adjacentDisconnected > 1) {
            score += (adjacentDisconnected - 1) * weights.RECONNECT_MULTI_BONUS;
        }
        return score;
    }
}
