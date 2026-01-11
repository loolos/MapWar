import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';
import { AuraSystem } from './AuraSystem';

export class AIController {
    engine: GameEngine;

    constructor(engine: GameEngine) {
        this.engine = engine;
    }

    // AI Logic (Robust & Strategic)
    playTurn() {
        try {
            const aiPlayer = this.engine.state.getCurrentPlayer();
            if (!aiPlayer.isAI) return;

            // Clear previous stats
            this.engine.lastAiMoves = [];

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
                            const cell = grid[r][c];
                            const cost = this.engine.getMoveCost(r, c);

                            // HEURISTIC SCORING
                            let score = 10; // Base value

                            // 1. Objectives
                            if (cell.building === 'base' && cell.owner !== aiPlayer.id) score += 10000; // WIN CONDITION
                            else if (cell.building === 'town' && cell.owner !== aiPlayer.id) score += 500; // HIGH VALUE

                            // 2. Aggression
                            else if (cell.owner && cell.owner !== aiPlayer.id) {
                                score += 100; // Capture Enemy Land
                                if (!cell.isConnected) score += 50; // Cut off enemy (Mock logic: if we could detect it)

                                // Check threat to Base
                                for (const base of myBases) {
                                    const dist = Math.abs(r - base.r) + Math.abs(c - base.c);
                                    if (dist <= 2) {
                                        score += 2000; // DEFENSE PRIORITY: Remove threat near base
                                    }
                                }
                            }

                            // 3. Defense / tactical
                            else if (cell.type === 'hill') score += 50; // High Ground
                            else if (cell.type === 'bridge') score += 60; // Chokepoint

                            // 4. Expansion (Neutral)
                            else if (cell.owner === null) {
                                score += 20;
                            }

                            // 5. Aura Support Bonus
                            if (cell.owner !== aiPlayer.id) {
                                const { discount } = AuraSystem.getSupportDiscount(this.engine.state, r, c, aiPlayer.id);
                                if (discount > 0) {
                                    score += (discount * 200);
                                }
                            }

                            // 5. Look-Ahead Bonus
                            const neighbors = [
                                { r: r + 1, c: c }, { r: r - 1, c: c },
                                { r: r, c: c + 1 }, { r: r, c: c - 1 }
                            ];

                            for (const n of neighbors) {
                                if (n.r >= 0 && n.r < GameConfig.GRID_HEIGHT && n.c >= 0 && n.c < GameConfig.GRID_WIDTH) {
                                    const nCell = grid[n.r][n.c];
                                    if (nCell.owner !== aiPlayer.id) {
                                        if (nCell.building === 'town') score += 100;
                                        if (nCell.building === 'base') score += 200;
                                    }
                                }
                            }

                            // 6. Cost Penalty
                            score -= (cost * 0.5);

                            // Random noise
                            score += Math.random() * 10;

                            moves.push({ r, c, score, cell, cost });
                        }
                    }
                }
                moves.sort((a, b) => b.score - a.score);
                return moves;
            };

            // PASS 1: EXECUTION LOOP
            let safetyCounter = 0;
            const MAX_MOVES = 50;
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

                // 1. Identify Key Assets
                const myBases: { r: number, c: number, cell: any }[] = [];
                const myFrontLines: { r: number, c: number, cell: any, threat: number }[] = [];

                for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
                    for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                        const cell = this.engine.state.getCell(r, c);
                        if (!cell || cell.owner !== aiPlayer.id) continue;

                        if (cell.building === 'base') {
                            myBases.push({ r, c, cell });
                        }

                        // Check for Front Line (Adjacent to Enemy)
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
                            myFrontLines.push({ r, c, cell, threat });
                        }
                    }
                }

                // Priority 1: Base Income
                for (const base of myBases) {
                    const { r, c, cell } = base;
                    const incomeCost = GameConfig.UPGRADE_INCOME_COST;
                    if (cell.incomeLevel < GameConfig.UPGRADE_INCOME_MAX && simulatedGold >= incomeCost) {
                        this.engine.planInteraction(r, c, 'UPGRADE_INCOME');
                        simulatedGold -= incomeCost;
                    }
                }

                // Priority 2: Base Defense
                for (const base of myBases) {
                    const { r, c, cell } = base;
                    const defenseCost = GameConfig.UPGRADE_DEFENSE_COST;
                    if (cell.defenseLevel < GameConfig.UPGRADE_DEFENSE_MAX && simulatedGold >= defenseCost) {
                        const isThreatened = myFrontLines.some(f => f.r === r && f.c === c);
                        if (isThreatened || simulatedGold > 50) {
                            this.engine.planInteraction(r, c, 'UPGRADE_DEFENSE');
                            simulatedGold -= defenseCost;
                        }
                    }
                }

                // Priority 3: Wall Construction / Upgrades / Watchtowers
                myFrontLines.sort((a, b) => b.threat - a.threat);

                for (const spot of myFrontLines) {
                    const { r, c, cell } = spot;

                    // A. Build New Wall
                    if (cell.building === 'none' && cell.type === 'plain') {
                        const buildCost = GameConfig.COST_BUILD_WALL;
                        if (simulatedGold >= buildCost + 10) {
                            this.engine.planInteraction(r, c, 'BUILD_WALL');
                            simulatedGold -= buildCost;
                        }
                    }
                    // B. Existing Wall Assets
                    else if (cell.building === 'wall') {
                        const upgCost = GameConfig.UPGRADE_WALL_COST;
                        const wtCost = GameConfig.COST_BUILD_WATCHTOWER;

                        // 1. Build Watchtower if missing
                        if (cell.watchtowerLevel === 0 && simulatedGold >= wtCost + 20) {
                            this.engine.planInteraction(r, c, 'BUILD_WATCHTOWER');
                            simulatedGold -= wtCost;
                        }
                        // 2. Upgrade Watchtower if exists
                        else if (cell.watchtowerLevel > 0 && cell.watchtowerLevel < GameConfig.WATCHTOWER_MAX_LEVEL && simulatedGold >= GameConfig.COST_UPGRADE_WATCHTOWER + 30) {
                            this.engine.planInteraction(r, c, 'UPGRADE_WATCHTOWER');
                            simulatedGold -= GameConfig.COST_UPGRADE_WATCHTOWER;
                        }
                        // 3. Upgrade Wall Defense
                        else if (cell.defenseLevel < GameConfig.UPGRADE_WALL_MAX && simulatedGold >= upgCost + 10) {
                            this.engine.planInteraction(r, c, 'UPGRADE_DEFENSE');
                            simulatedGold -= upgCost;
                        }
                    }
                }

                // Commit Post-Move Upgrades
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
}
