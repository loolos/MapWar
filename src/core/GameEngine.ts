import { GameState } from './GameState';
import { GameConfig } from './GameConfig';
import { AIController } from './AIController';
import type { Action, EndTurnAction } from './Actions';

type EventCallback = (data?: any) => void;

export class GameEngine {
    state: GameState;
    listeners: Record<string, EventCallback[]>;

    // State for Planning Phase
    pendingMoves: { r: number, c: number }[];
    lastError: string | null = null;

    // AI Visualization
    lastAiMoves: { r: number, c: number }[] = [];

    // Game Config State
    isSwapped: boolean = false;
    isGameOver: boolean = false;

    // AI
    ai: AIController;

    constructor() {
        this.state = new GameState();
        this.listeners = {};
        this.pendingMoves = [];
        this.ai = new AIController(this);

        // Initial Income for P1 (Start of Game)
        this.state.accrueResources('P1');
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

    // Actions
    // Actions
    restartGame() {
        this.isSwapped = !this.isSwapped;
        this.state.reset(this.isSwapped);
        this.pendingMoves = [];
        this.lastAiMoves = [];
        this.lastError = null;
        this.isGameOver = false;

        // Initial Income for P1 (Restart)
        this.state.accrueResources('P1');

        this.emit('mapUpdate'); // Redraw grid
        this.emit('turnChange'); // Update UI text
        this.emit('gameRestart');
    }

    // Execute an Action (Command Pattern)
    executeAction(action: Action) {
        if (this.isGameOver) return; // Block actions if game over

        switch (action.type) {
            case 'END_TURN':
                this.handleEndTurn(action as EndTurnAction);
                break;
            // Future actions: PLAN_MOVE, CHAT, etc.
        }
    }

    endTurn() {
        if (this.isGameOver) return;
        // Construct the Action
        // In the future, this is what gets sent to the server.
        const action: EndTurnAction = {
            type: 'END_TURN',
            playerId: this.state.currentPlayerId!, // Assume not null for local
            payload: {
                moves: [...this.pendingMoves] // Copy pending moves
            }
        };

        // For local game, execute immediately
        this.executeAction(action);
    }

    private handleEndTurn(action: EndTurnAction) {
        // Validate Player? (Server authority would do this)
        if (action.playerId !== this.state.currentPlayerId) {
            console.warn("Action received for wrong player");
            return;
        }

        // Apply Moves from Payload (Architecture Recommendation)
        // Note: Currently pendingMoves is local state. 
        // If we trust the payload, we calculate costs/apply based on THAT.
        // For now, let's keep using local pendingMoves for consistency in single player,
        // but ideally we'd use action.payload.moves for replayability.

        // Let's use the payload moves to be "Multiplayer Ready"
        // Need to set pendingMoves to the payload's moves (if they differ?)
        // Or just iteration over payload.moves?
        this.pendingMoves = action.payload.moves;

        this.commitMoves();

        // Check if game ended in commitMoves
        if (this.isGameOver) return;

        const incomeReport = this.state.endTurn();
        this.emit('turnChange');
        if (incomeReport) {
            this.emit('incomeReport', incomeReport);
        }

        // AI Check
        const nextPlayer = this.state.getCurrentPlayer();
        console.log(`Turn Ended. Next Player: ${nextPlayer.id}, isAI: ${nextPlayer.isAI}`);

        if (nextPlayer.isAI) {
            console.log("Triggering AI Turn...");
            setTimeout(() => {
                if (!this.isGameOver) {
                    this.ai.playTurn();
                }
            }, 500);
        }
    }

    // New: Toggle a move in the plan
    togglePlan(row: number, col: number) {
        if (this.isGameOver) return;
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

        // Base Cost (Terrain)
        let baseCost = GameConfig.COST_CAPTURE;
        if (cell.type === 'hill') baseCost = GameConfig.COST_CAPTURE * 2;
        // Plain is default (1x)

        // For Attack, use Attack Cost Base
        let isAttack = false;
        const curr = this.state.currentPlayerId;
        if (cell.owner !== null && cell.owner !== curr) {
            isAttack = true;
            baseCost = GameConfig.COST_ATTACK;
            if (cell.type === 'hill') baseCost = GameConfig.COST_ATTACK * 2;
        }

        // Distance Penalty Logic (Double if chained)
        if (isAttack) {
            // Distance Rule: If adjacent to OWNED land, normal cost.
            // If only adjacent to PENDING land (chained), double cost.
            if (curr && this.state.isAdjacentToOwned(row, col, curr)) { // Use state method
                return baseCost;
            } else {
                return baseCost * 2;
            }
        }

        return baseCost;
    }

    validateMove(row: number, col: number): { valid: boolean, reason?: string } {
        const playerId = this.state.currentPlayerId;
        if (!playerId) return { valid: false, reason: "No active player" };
        const player = this.state.players[playerId];

        // 1. Basic Cell Checks
        const cell = this.state.getCell(row, col);
        if (!cell) return { valid: false, reason: "Out of bounds" };
        if (cell.type === 'water') return { valid: false, reason: "Cannot move to Water" };
        if (cell.owner === playerId) return { valid: false, reason: "Already owned" }; // Self-own check

        // 2. Cost Check
        // Calculate total cost of pending moves + this move
        let plannedCost = 0;
        for (const m of this.pendingMoves) {
            plannedCost += this.getMoveCost(m.r, m.c);
        }
        const thisMoveCost = this.getMoveCost(row, col);

        if (player.gold < plannedCost + thisMoveCost) {
            return { valid: false, reason: `Not enough gold(Need ${thisMoveCost})` };
        }

        // 3. Adjacency Check
        // must be adjacent to OWNED or PENDING
        const isAdjToOwned = this.state.isAdjacentToOwned(row, col, playerId);
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

            // Update Connectivity for visuals immediately
            this.state.updateConnectivity('P1');
            this.state.updateConnectivity('P2');

            this.emit('mapUpdate');
        }

        this.pendingMoves = []; // Clear
        this.lastError = null;
        this.emit('planUpdate');

        if (gameWon) {
            this.isGameOver = true;
            this.emit('gameOver', pid); // Winner is current player
        }
    }

    // Kept for internal logic if needed, but mostly unused
    canCapture(row: number, col: number): boolean {
        return this.validateMove(row, col).valid;
    }



    // captureLand(row: number, col: number) { ... } // REMOVED/REPLACED by togglePlan & commit
}
