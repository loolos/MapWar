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
        const difficulty = GameConfig.AI_DIFFICULTY;

        const validMoves: { r: number, c: number, score: number }[] = [];

        for (let r = 0; r < GameConfig.GRID_SIZE; r++) {
            for (let c = 0; c < GameConfig.GRID_SIZE; c++) {
                const cell = grid[r][c];

                // Skip if already owned
                if (cell.owner === playerId) continue;

                // Check direct adjacency
                if (!this.engine.state.isAdjacentToOwned(r, c, playerId as PlayerID)) continue;

                let score = 0;
                let cost = 0;

                // --- HEURISTICS ---
                if (cell.owner === null) {
                    // Capture Empty
                    score = 10;
                    cost = GameConfig.COST_CAPTURE;
                } else {
                    // Attack Enemy
                    cost = GameConfig.COST_ATTACK;

                    if (difficulty === 'EASY') {
                        score = 5; // Easy AI is timid, prefers empty land
                    } else if (difficulty === 'HARD') {
                        score = 50; // Hard AI is aggressive!
                    } else {
                        score = 20; // Medium AI is balanced
                    }
                }

                // Can afford?
                const player = this.engine.state.players[playerId];
                if (player.gold >= cost) {
                    // Calculate final score with some randomness for lower difficulties
                    let finalScore = score - (cost * 0.1); // Cost penalty

                    // Add slight random jitter to prevent deterministic loops in same-score scenarios
                    finalScore += Math.random() * 2;

                    validMoves.push({ r, c, score: finalScore });
                }
            }
        }

        if (validMoves.length > 0) {
            // Difficulty Selection Logic
            if (difficulty === 'EASY') {
                // Easy: 50% chance to pick purely random valid move (make mistakes)
                if (Math.random() < 0.5) {
                    const randomIndex = Math.floor(Math.random() * validMoves.length);
                    return validMoves[randomIndex];
                }
                // Otherwise pick best (but with timid scores)
                validMoves.sort((a, b) => b.score - a.score);
                return validMoves[0];
            }

            if (difficulty === 'HARD') {
                // Hard: Always strict best
                validMoves.sort((a, b) => b.score - a.score);
                return validMoves[0];
            }

            // Medium: Standard Sort
            validMoves.sort((a, b) => b.score - a.score);
            return validMoves[0];
        }

        return null; // No valid move
    }
}
