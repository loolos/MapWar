import { GameEngine } from './GameEngine';
import { GameConfig, type PlayerID } from './GameConfig';

export class AIController {
    engine: GameEngine;

    constructor(engine: GameEngine) {
        this.engine = engine;
    }

    // Attempt to play a turn
    playTurn() {
        const playerId = this.engine.state.currentPlayerId;
        if (!playerId) return;

        const player = this.engine.state.players[playerId];
        let attempts = 0;
        const movesMade: { r: number, c: number }[] = [];

        // Simple Loop: Try to find valid moves until out of gold or no valid moves
        while (player.gold >= GameConfig.COST_CAPTURE && attempts < 20) {
            const move = this.findBestMove(playerId);
            if (move) {
                // Plan and Commit immediately for AI simplicity
                // Or togglePlan -> commit.
                // We use togglePlan to ensure validation logic runs
                this.engine.togglePlan(move.r, move.c);

                // If invalid (error set), stop safely
                if (this.engine.lastError) {
                    // console.log("AI Move Failed:", this.engine.lastError);
                    this.engine.pendingMoves = []; // Clear bad move
                    this.engine.lastError = null;
                    break;
                }

                // Commit immediately to update state for next calculation
                this.engine.commitMoves();
                movesMade.push({ r: move.r, c: move.c });
            } else {
                break; // No move found
            }
            attempts++;
        }

        this.engine.lastAiMoves = movesMade;
        this.engine.emit('mapUpdate'); // Ensure UI updates to show highlights

        // End Turn
        this.engine.endTurn();
    }

    private findBestMove(playerId: string): { r: number, c: number } | null {
        const grid = this.engine.state.grid;
        // let bestMove = null;
        // let bestScore = -Infinity;

        // Iterate all cells
        // Heuristic:
        // 1. Must be adjacent to owned.
        // 2. Prioritize: 
        //    - Capture Empty (Cheap)
        //    - Attack Weak Enemy (Costly but good)

        // For simplicity: Just find FIRST valid capture for now, 
        // or random valid capture to avoid getting stuck.

        const validMoves: { r: number, c: number, score: number }[] = [];

        for (let r = 0; r < GameConfig.GRID_SIZE; r++) {
            for (let c = 0; c < GameConfig.GRID_SIZE; c++) {
                const cell = grid[r][c];

                // Skip if already owned
                if (cell.owner === playerId) continue;

                // Check direct adjacency (Cheap logic, Engine will re-validate)
                if (!this.engine.state.isAdjacentToOwned(r, c, playerId as PlayerID)) continue;

                let score = 0;
                let cost = 0;

                if (cell.owner === null) {
                    score = 10; // Capture Empty
                    cost = GameConfig.COST_CAPTURE;
                } else {
                    score = 20; // Attack Enemy
                    cost = GameConfig.COST_ATTACK; // Assume adjacent
                }

                // Can afford?
                const player = this.engine.state.players[playerId];
                if (player.gold >= cost) {
                    validMoves.push({ r, c, score: score - cost * 0.1 }); // Slight penalty for cost
                }
            }
        }

        if (validMoves.length > 0) {
            // Pick based on score, or random top
            validMoves.sort((a, b) => b.score - a.score);
            return validMoves[0];
        }

        return null; // No valid move
    }
}
