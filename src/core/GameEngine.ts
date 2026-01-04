import { GameState } from './GameState';
import { type PlayerID, GameConfig } from './GameConfig';

type EventCallback = (data?: any) => void;

export class GameEngine {
    state: GameState;
    private listeners: Record<string, EventCallback[]> = {};

    constructor() {
        this.state = new GameState();
    }

    on(event: string, callback: EventCallback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    emit(event: string, data?: any) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data)); // Pass data
        }
    }

    // State for Planning Phase
    pendingMoves: { r: number, c: number }[] = [];
    lastError: string | null = null;

    // Actions
    endTurn() {
        // Auto-commit valid moves before ending turn?
        // Or should we clear them? User usually expects "End Turn" to "Finish up".
        // Let's try to commit. If fails, we might just end turn anyway (discarding moves) or block?
        // Rules assumption: End Turn executes what it can or just ends. 
        // Better UX: Commit pending if possible.
        this.commitMoves();

        const incomeReport = this.state.endTurn();
        this.emit('turnChange');
        if (incomeReport) {
            this.emit('incomeReport', incomeReport);
        }
    }

    // New: Toggle a move in the plan
    togglePlan(row: number, col: number) {
        const existingIndex = this.pendingMoves.findIndex(m => m.r === row && m.c === col);

        if (existingIndex >= 0) {
            // Remove (Cancel)
            this.pendingMoves.splice(existingIndex, 1);
            this.lastError = null; // Clear error on successful toggle
        } else {
            // Try to Add
            const validation = this.validateMove(row, col);
            if (validation.valid) {
                this.pendingMoves.push({ r: row, c: col });
                this.lastError = null;
            } else {
                this.lastError = validation.reason || "Invalid move";
            }
        }
        this.emit('planUpdate');
    }

    // Helper to get cost of a specific move
    getMoveCost(row: number, col: number): number {
        const cell = this.state.getCell(row, col);
        if (!cell) return 0;

        // If owned by enemy, it's an attack
        const curr = this.state.currentPlayerId;
        if (cell.owner !== null && cell.owner !== curr) {
            // Distance Rule: If adjacent to OWNED land, normal cost.
            // If only adjacent to PENDING land (chained), double cost.
            if (curr && this.isAdjacentToOwned(row, col, curr)) {
                return GameConfig.COST_ATTACK;
            } else {
                return GameConfig.COST_ATTACK * 2;
            }
        }
        return GameConfig.COST_CAPTURE;
    }

    validateMove(row: number, col: number): { valid: boolean, reason?: string } {
        const playerId = this.state.currentPlayerId;
        if (!playerId) return { valid: false, reason: "No active player" };
        const player = this.state.players[playerId];

        // 1. Basic Cell Checks
        const cell = this.state.getCell(row, col);
        if (!cell) return { valid: false, reason: "Out of bounds" };
        if (cell.owner === playerId) return { valid: false, reason: "Already owned" }; // Self-own check

        // 2. Cost Check
        // Calculate total cost of pending moves + this move
        let plannedCost = 0;
        for (const m of this.pendingMoves) {
            plannedCost += this.getMoveCost(m.r, m.c);
        }
        const thisMoveCost = this.getMoveCost(row, col);

        if (player.gold < plannedCost + thisMoveCost) {
            return { valid: false, reason: `Not enough gold (Need ${thisMoveCost})` };
        }

        // 3. Adjacency Check
        // must be adjacent to OWNED or PENDING
        const isAdjToOwned = this.isAdjacentToOwned(row, col, playerId);
        const isAdjToPending = this.isAdjacentToPending(row, col);

        if (!isAdjToOwned && !isAdjToPending) {
            return { valid: false, reason: "Must be adjacent to your territory" };
        }

        return { valid: true };
    }

    private isAdjacentToPending(row: number, col: number): boolean {
        // Check if adjacent to any cell in pendingMoves
        const neighbors = [
            { r: row - 1, c: col }, { r: row + 1, c: col },
            { r: row, c: col - 1 }, { r: row, c: col + 1 }
        ];
        return neighbors.some(n =>
            this.pendingMoves.some(p => p.r === n.r && p.c === n.c)
        );
    }

    commitMoves() {
        const pid = this.state.currentPlayerId;
        if (!pid) return;

        let totalCost = 0;
        let gameWon = false;

        for (const move of this.pendingMoves) {
            const cost = this.getMoveCost(move.r, move.c);
            const cell = this.state.getCell(move.r, move.c);

            // Win Condition Check: Capture Enemy Base
            if (cell && cell.building === 'base' && cell.owner !== pid) {
                gameWon = true;
            }

            this.state.setOwner(move.r, move.c, pid);
            totalCost += cost;
        }

        if (totalCost > 0) {
            this.state.players[pid].gold -= totalCost;
            this.emit('mapUpdate');
        }

        this.pendingMoves = []; // Clear
        this.lastError = null;
        this.emit('planUpdate');

        if (gameWon) {
            this.emit('gameOver', pid); // Winner is current player
        }
    }

    // Kept for internal logic if needed, but mostly unused
    canCapture(row: number, col: number): boolean {
        return this.validateMove(row, col).valid;
    }

    private isAdjacentToOwned(row: number, col: number, playerId: PlayerID): boolean {
        const neighbors = [
            { r: row - 1, c: col }, { r: row + 1, c: col },
            { r: row, c: col - 1 }, { r: row, c: col + 1 }
        ];

        return neighbors.some(n => {
            const cell = this.state.getCell(n.r, n.c);
            return cell && cell.owner === playerId;
        });
    }

    // captureLand(row: number, col: number) { ... } // REMOVED/REPLACED by togglePlan & commit
}
