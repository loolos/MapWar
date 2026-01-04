import { GameState } from './GameState';
import { type PlayerID, GameConfig } from './GameConfig';

type EventCallback = () => void;

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

    emit(event: string) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb());
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

        this.state.endTurn();
        this.emit('turnChange');
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

    validateMove(row: number, col: number): { valid: boolean, reason?: string } {
        const playerId = this.state.currentPlayerId;
        const player = this.state.players[playerId];

        // 1. Basic Cell Checks
        const cell = this.state.getCell(row, col);
        if (!cell) return { valid: false, reason: "Out of bounds" };
        if (cell.owner !== null) return { valid: false, reason: "Already owned" };

        // 2. Cost Check
        // Cost = (current pending count + 1) * COST ? No, cost is constant per cell for now.
        const currentCost = this.pendingMoves.length * GameConfig.COST_CAPTURE;
        if (player.gold < currentCost + GameConfig.COST_CAPTURE) {
            return { valid: false, reason: "Not enough gold" };
        }

        // 3. Adjacency Check
        // Must be adjacent to (Owned Land OR Pending Land)
        // We temporarily treat pending moves as "owned" for this check's purpose?
        // Or simple check: Is it adjacent to any owned cell OR any pending cell?

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
        // Execute all pending moves
        // We re-verify? No, assuming they were valid when added, 
        // BUT ordering might matter if we supported chaining which we do.
        // Actually, if we just set them all to owned, it's fine.

        let cost = 0;
        for (const move of this.pendingMoves) {
            this.state.setOwner(move.r, move.c, pid);
            cost += GameConfig.COST_CAPTURE;
        }

        if (cost > 0) {
            this.state.players[pid].gold -= cost;
            this.emit('mapUpdate'); // Global map refresh
        }

        this.pendingMoves = []; // Clear
        this.lastError = null;
        this.emit('planUpdate');
    }

    // Kept for internal logic if needed, but mostly unused
    canCapture(row: number, col: number, playerId: PlayerID): boolean {
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
