import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';

export class AIController {
    engine: GameEngine;

    constructor(engine: GameEngine) {
        this.engine = engine;
    }

    // AI Logic (Simple Greedy / Random)
    playTurn() {
        const aiPlayer = this.engine.state.getCurrentPlayer();
        if (!aiPlayer.isAI) return;

        // Simple Strategy:
        // 1. Identify all owned cells with potential expansion (adjacent unowned)
        // 2. Prioritize capturing high value targets (bases > disconnected lands > hills > plains)
        // 3. Or just random expansion if easy.

        const moves: { r: number, c: number, score: number }[] = [];
        const grid = this.engine.state.grid;

        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                // Check if valid move
                const validation = this.engine.validateMove(r, c);
                if (validation.valid) {
                    let score = 1;
                    const cell = grid[r][c];

                    if (cell.building === 'base') score += 100; // Attack Base!
                    if (cell.type === 'hill') score += 5; // Good defense
                    if (cell.owner && cell.owner !== aiPlayer.id) {
                        score += 10; // Attack Enemy Land
                        if (!cell.isConnected) score += 5; // Cheap attack
                    }

                    // Random noise
                    score += Math.random() * 2;

                    moves.push({ r, c, score });
                }
            }
        }

        // Sort by score
        moves.sort((a, b) => b.score - a.score);

        // Execute as many moves as possible from top of list
        let attempts = 0;
        for (const m of moves) {
            if (attempts > 5) break;

            // Validate again? engine.validateMove checks gold cost.
            // If we run out of gold, this will just fail to add plan or execution.
            // But we are using togglePlan.
            this.engine.togglePlan(m.r, m.c);

            if (this.engine.lastError) {
                // Failed (likely money). Stop trying moves?
                // Or try cheaper ones?
                // Simplest AI: stop on first failure.
                break;
            } else {
                this.engine.commitMoves();
                attempts++;
            }
        }

        // End Turn
        this.engine.endTurn();
    }
}
