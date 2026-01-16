import { Cell } from './Cell';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';
import { AuraSystem } from './AuraSystem';
import { DefaultAIProfile, mergeAIWeights, type AIProfile, type AIWeights } from './ai/AIProfile';

export class AIController {
    engine: GameEngine;
    private profileByPlayerId: Map<string, AIProfile> = new Map();

    constructor(engine: GameEngine) {
        this.engine = engine;
    }

    public setProfileForPlayer(playerId: string, profile: AIProfile) {
        this.profileByPlayerId.set(playerId, profile);
    }

    private getWeightsForPlayer(playerId: string): AIWeights {
        const profile = this.profileByPlayerId.get(playerId);
        return mergeAIWeights(profile?.weights ?? DefaultAIProfile.weights);
    }

    // AI Logic (Robust & Strategic)
    playTurn() {
        console.log("AI playTurn start. Player:", this.engine.state.currentPlayerId);
        try {
            const aiPlayer = this.engine.state.getCurrentPlayer();
            if (!aiPlayer.isAI) {
                console.log("Not AI, skipping.");
                return;
            }
            console.log("AI processing...");

            // Clear previous stats
            this.engine.lastAiMoves = [];

            const weights = this.getWeightsForPlayer(aiPlayer.id as string);

            // Helper: Refresh Valid Moves
            const getValidMoves = () => {
                const moves: { r: number, c: number, score: number, cell: any, cost: number }[] = [];
                const grid = this.engine.state.grid;

                // Pre-calc: Find MY bases to defend
                const myBases: { r: number, c: number }[] = [];
                for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
                    for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                        if (grid[r][c].owner === aiPlayer.id && grid[r][c].building === 'base') {
                            myBases.push({ r, c });
                        }
                    }
                }

                for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
                    for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                        const validation = this.engine.validateMove(r, c);
                        if (validation.valid) {
                            // NEW: Check Cost explicitly (since validateMove purely checks rules now)
                            const costValidation = this.engine.checkMoveCost(r, c);
                            if (!costValidation.valid) continue;

                            const cell = grid[r][c];
                            const cost = this.engine.getMoveCost(r, c);

                            // HEURISTIC SCORING
                            let score = weights.SCORE_BASE_VALUE;

                            // 1. Objectives
                            score += this.scoreObjectives(cell, aiPlayer.id as string, weights);

                            // 2. Aggression
                            score += this.scoreAggression(cell, r, c, aiPlayer.id as string, myBases, weights);

                            // 3. Tactical
                            score += this.scoreTactical(cell, weights);

                            // 4. Expansion
                            score += this.scoreExpansion(cell, weights);

                            // 5. Aura Support
                            score += this.scoreAura(r, c, aiPlayer.id as string, weights);

                            // 6. Look-Ahead
                            score += this.scoreLookAhead(r, c, aiPlayer.id as string, grid, weights);

                            // 7. Cost Penalty
                            score -= (cost * weights.COST_PENALTY_MULTIPLIER);

                            // Random noise
                            score += Math.random() * weights.RANDOM_NOISE;

                            moves.push({ r, c, score, cell, cost });
                        }
                    }
                }
                moves.sort((a, b) => b.score - a.score);
                return moves;
            };

            // ... (rest of playTurn)

            // PASS 1: EXECUTION LOOP
            let safetyCounter = 0;
            const MAX_MOVES = weights.MAX_MOVES_PER_TURN;
            const skippedMoves = new Set<string>();

            while (safetyCounter < MAX_MOVES) {
                let potentialMoves = getValidMoves();

                // Filter out moves that previously failed in this turn
                potentialMoves = potentialMoves.filter(m => !skippedMoves.has(`${m.r},${m.c}`));

                if (potentialMoves.length === 0) break;

                const bestMove = potentialMoves[0];

                // Try to Execute
                this.engine.togglePlan(bestMove.r, bestMove.c);

                if (this.engine.lastError) {
                    // Mark as skipped and continue to next best
                    skippedMoves.add(`${bestMove.r},${bestMove.c}`);
                    continue;
                } else {
                    // Success - Commit immediately
                    this.engine.lastAiMoves.push({ r: bestMove.r, c: bestMove.c });
                    this.engine.commitMoves();
                }

                safetyCounter++;
            }

            // Post-Move Interactions (Spend excess gold on Upgrades)
            const playerAfterMoves = this.engine.state.getCurrentPlayer();

            if (playerAfterMoves.gold > 0) {
                let simulatedGold = playerAfterMoves.gold;

                type UpgradeCandidate = {
                    score: number;
                    cost: number;
                    execute: () => boolean;
                };

                const candidates: UpgradeCandidate[] = [];
                const threatByKey = new Map<string, number>();
                const myBases: { r: number, c: number, cell: any }[] = [];
                const myFarms: { r: number, c: number, cell: any }[] = [];
                const myFrontLines: { r: number, c: number, cell: any, threat: number }[] = [];
                const farmSpots: { r: number, c: number, auraBonus: number }[] = [];

                const tryPlan = (r: number, c: number, actionId: string) => {
                    const before = this.engine.pendingInteractions.length;
                    this.engine.planInteraction(r, c, actionId);
                    return this.engine.pendingInteractions.length > before;
                };

                const addCandidate = (score: number, cost: number, execute: () => boolean) => {
                    if (score <= 0) return;
                    candidates.push({ score, cost, execute });
                };

                for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
                    for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                        const cell = this.engine.state.getCell(r, c);
                        if (!cell || cell.owner !== aiPlayer.id) continue;

                        if (cell.building === 'base') {
                            myBases.push({ r, c, cell });
                        }

                        if (cell.building === 'farm') {
                            myFarms.push({ r, c, cell });
                        }

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

                        if (cell.building === 'none' && cell.type === 'plain' && cell.isConnected) {
                            const auraBonus = AuraSystem.getIncomeAuraBonus(this.engine.state, r, c, aiPlayer.id as string);
                            if (auraBonus > 0) {
                                farmSpots.push({ r, c, auraBonus });
                            }
                        }
                    }
                }

                for (const base of myBases) {
                    const { r, c, cell } = base;
                    if (cell.incomeLevel < GameConfig.UPGRADE_INCOME_MAX) {
                        const score = weights.ECONOMY_BASE_INCOME + (cell.incomeLevel * weights.ECONOMY_BASE_INCOME_LEVEL);
                        addCandidate(score, GameConfig.UPGRADE_INCOME_COST, () => tryPlan(r, c, 'UPGRADE_INCOME'));
                    }

                    if (cell.defenseLevel < GameConfig.UPGRADE_DEFENSE_MAX) {
                        const threat = threatByKey.get(`${r},${c}`) || 0;
                        const score = weights.DEFENSE_BASE_UPGRADE + (threat * weights.DEFENSE_THREAT_MULT);
                        addCandidate(score, GameConfig.UPGRADE_DEFENSE_COST, () => tryPlan(r, c, 'UPGRADE_DEFENSE'));
                    }
                }

                for (const farm of myFarms) {
                    const { r, c, cell } = farm;
                    if (cell.farmLevel < GameConfig.FARM_MAX_LEVEL) {
                        const score = weights.ECONOMY_FARM_UPGRADE + (cell.farmLevel * weights.ECONOMY_FARM_LEVEL);
                        addCandidate(score, GameConfig.COST_UPGRADE_FARM, () => tryPlan(r, c, 'UPGRADE_FARM'));
                    }
                }

                for (const spot of farmSpots) {
                    const score = weights.ECONOMY_FARM_BUILD + (spot.auraBonus * weights.ECONOMY_AURA_BONUS_MULT);
                    addCandidate(score, GameConfig.COST_BUILD_FARM, () => tryPlan(spot.r, spot.c, 'BUILD_FARM'));
                }

                for (const spot of myFrontLines) {
                    const { r, c, cell, threat } = spot;
                    const threatScore = threat * weights.DEFENSE_THREAT_MULT;

                    if (cell.building === 'none' && cell.type === 'plain') {
                        addCandidate(weights.DEFENSE_WALL_BUILD + threatScore, GameConfig.COST_BUILD_WALL, () => tryPlan(r, c, 'BUILD_WALL'));
                    } else if (cell.building === 'wall') {
                        if (cell.watchtowerLevel === 0) {
                            addCandidate(weights.DEFENSE_WATCHTOWER_BUILD + threatScore, GameConfig.COST_BUILD_WATCHTOWER, () => tryPlan(r, c, 'BUILD_WATCHTOWER'));
                        } else if (cell.watchtowerLevel < GameConfig.WATCHTOWER_MAX_LEVEL) {
                            addCandidate(weights.DEFENSE_WATCHTOWER_UPGRADE + threatScore, GameConfig.COST_UPGRADE_WATCHTOWER, () => tryPlan(r, c, 'UPGRADE_WATCHTOWER'));
                        }

                        if (cell.defenseLevel < GameConfig.UPGRADE_WALL_MAX) {
                            addCandidate(weights.DEFENSE_WALL_UPGRADE + threatScore, GameConfig.UPGRADE_WALL_COST, () => tryPlan(r, c, 'UPGRADE_DEFENSE'));
                        }
                    }
                }

                candidates.sort((a, b) => b.score - a.score);

                for (const candidate of candidates) {
                    if (simulatedGold < candidate.cost) continue;
                    if (candidate.execute()) {
                        simulatedGold -= candidate.cost;
                    }
                }

                if (this.engine.pendingInteractions.length > 0) {
                    this.engine.commitMoves();
                }
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
        else if (cell.building === 'town' && cell.owner !== aiPlayerId) score += weights.SCORE_TOWN;
        return score;
    }

    private scoreAggression(cell: Cell, r: number, c: number, aiPlayerId: string, myBases: { r: number, c: number }[], weights: AIWeights): number {
        let score = 0;
        if (cell.owner && cell.owner !== aiPlayerId) {
            score += weights.SCORE_ENEMY_LAND;
            if (!cell.isConnected) score += weights.SCORE_DISCONNECT_ENEMY;

            for (const base of myBases) {
                const dist = Math.abs(r - base.r) + Math.abs(c - base.c);
                if (dist <= 2) {
                    score += weights.SCORE_DEFEND_BASE;
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

    private scoreExpansion(cell: Cell, weights: AIWeights): number {
        if (cell.owner === null) return weights.SCORE_EXPANSION;
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
}
