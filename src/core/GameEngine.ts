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

    // Actions
    endTurn() {
        this.state.endTurn();
        this.emit('turnChange');
    }

    canCapture(row: number, col: number, playerId: PlayerID): boolean {
        const player = this.state.players[playerId!];
        if (player.gold < GameConfig.COST_CAPTURE) return false;

        const cell = this.state.getCell(row, col);
        if (!cell || cell.owner !== null) return false; // Must be empty land to capture directly? Or just capture enemy land? 
        // Rules V0.1: Occupy empty land.

        // Adjacency check
        return this.isAdjacentToOwned(row, col, playerId);
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

    captureLand(row: number, col: number) {
        const pid = this.state.currentPlayerId;
        if (this.canCapture(row, col, pid)) {
            this.state.players[pid!].gold -= GameConfig.COST_CAPTURE;
            this.state.setOwner(row, col, pid);
            this.emit('mapUpdate');
        }
    }
}
