import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';

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

                            // 5. Look-Ahead Bonus (Proximity to targets)
                            // Check neighbors of this candidate cell
                            const neighbors = [
                                { r: r + 1, c: c }, { r: r - 1, c: c },
                                { r: r, c: c + 1 }, { r: r, c: c - 1 }
                            ];

                            for (const n of neighbors) {
                                if (n.r >= 0 && n.r < GameConfig.GRID_HEIGHT && n.c >= 0 && n.c < GameConfig.GRID_WIDTH) {
                                    const nCell = grid[n.r][n.c];
                                    // If moving here puts us next to a Town/Base we don't own, that's good!
                                    if (nCell.owner !== aiPlayer.id) {
                                        if (nCell.building === 'town') score += 100; // Path to Town
                                        if (nCell.building === 'base') score += 200; // Path to Base
                                    }
                                }
                            }

                            // 6. Cost Penalty (Optimize spending)
                            // Ideally we want high value for low cost
                            score -= (cost * 0.5);

                            // Random noise to prevent identical loops
                            score += Math.random() * 10;

                            moves.push({ r, c, score, cell, cost });
                        }
                    }
                }
                moves.sort((a, b) => b.score - a.score);
                return moves;
            };

            // PASS 1: EXECUTION LOOP
            // We loop until we can't afford any more moves or no valid moves exist
            let safetyCounter = 0;
            const MAX_MOVES = 50; // Prevent infinite loops

            while (safetyCounter < MAX_MOVES) {
                // Re-evaluate moves every step because state changes (gold, connectivity)
                const potentialMoves = getValidMoves();

                if (potentialMoves.length === 0) break; // No moves possible

                const bestMove = potentialMoves[0];

                // Try to Execute
                this.engine.togglePlan(bestMove.r, bestMove.c);

                if (this.engine.lastError) {
                    // Check if error is 'Not enough gold'
                    // If so, we are done (since we sorted by score, maybe a cheaper move is lower? 
                    // But getValidMoves checks validateMove which checks gold)
                    // So this error shouldn't theoretically happen if validateMove is accurate.
                    // But if it does, break to avoid infinite loop of trying same failing move.
                    console.warn(`AI Failed to execute valid move at ${bestMove.r},${bestMove.c}: ${this.engine.lastError}`);
                    break;
                } else {
                    // Success - Commit immediately
                    this.engine.lastAiMoves.push({ r: bestMove.r, c: bestMove.c });
                    this.engine.commitMoves();
                }

                safetyCounter++;
            }

            if (safetyCounter === 0) {
                // If we did nothing, log why (Debugging)
                // console.log(`AI (${aiPlayer.id}) passed turn (No valid moves). Gold: ${aiPlayer.gold}`);
            }

            // Post-Move Interactions (Spend excess gold on Upgrades)
            // Re-fetch player state as gold has changed
            const playerAfterMoves = this.engine.state.getCurrentPlayer();

            if (playerAfterMoves.gold > 0) {
                // console.log("[AI] Checking for upgrades. Gold:", playerAfterMoves.gold);
                // Check My Bases
                const myBases = [];
                for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
                    for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                        const cell = this.engine.state.getCell(r, c);
                        if (cell && cell.building === 'base' && cell.owner === aiPlayer.id) {
                            myBases.push({ r, c, cell });
                        }
                    }
                }
                // console.log("[AI] Found Bases:", myBases.length);

                for (const base of myBases) {
                    const { r, c, cell } = base;

                    // Priority 1: Income (Early Game or Low Level)
                    // If income level < max, and cost is affordable
                    const incomeCost = GameConfig.UPGRADE_INCOME_COST;
                    if (cell.incomeLevel < GameConfig.UPGRADE_INCOME_MAX && playerAfterMoves.gold >= incomeCost) {
                        // console.log("[AI] Planning Income Upgrade at", r, c);
                        // Simple Heuristic: Always buy income if we have spare cash?
                        // Maybe reserve some for units next turn?
                        // Let's say: Buy if we have > 30g (so we can still move next turn) OR if it's very early.
                        // For now: Aggressive Economy.

                        // Use Interaction
                        this.engine.planInteraction(r, c, 'UPGRADE_INCOME');
                        // Deduct specific to this local reasoning (Engine handles real deduction on commit)
                        playerAfterMoves.gold -= incomeCost;
                        continue; // Done with this base for now (one upgrade per turn?)
                    }

                    // Priority 2: Defense (If threatened)
                    // Heuristic: If enemy within 3 tiles
                    // Scan nearby? Expensive.
                    // Simple check: Random or if gold is high?
                    // Let's maintain "If Gold > 50", buy defense.
                    const defenseCost = GameConfig.UPGRADE_DEFENSE_COST;
                    if (cell.defenseLevel < GameConfig.UPGRADE_DEFENSE_MAX && playerAfterMoves.gold >= defenseCost + 20) {
                        this.engine.planInteraction(r, c, 'UPGRADE_DEFENSE');
                        playerAfterMoves.gold -= defenseCost;
                    }
                }
            }

        } catch (err) {
            console.error("AI Logic Exception:", err);
        } finally {
            // End Turn ALWAYS to prevent hang
            this.engine.endTurn();
        }
    }
}
