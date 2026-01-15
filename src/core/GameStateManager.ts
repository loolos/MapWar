import { GameState } from './GameState';
import { type PlayerID } from './GameConfig';
import type { MapType } from './map/MapGenerator';

export class GameStateManager {
    public state: GameState;

    constructor(playerConfigs: { id: string, isAI: boolean, color: number }[] = [], mapType: MapType = 'default') {
        this.state = new GameState(playerConfigs, mapType);
    }

    // --- State Mutations ---

    public spendGold(playerId: PlayerID, amount: number) {
        if (!playerId) return;
        const player = this.state.players[playerId];
        if (player) {
            player.gold -= amount;
        }
    }

    public eliminatePlayer(playerId: PlayerID) {
        // Remove from order
        this.state.playerOrder = this.state.playerOrder.filter(id => id !== playerId);

        // Force connectivity update to ensure their lands disconnect
        this.state.updateConnectivity(playerId);

        // Note: Building destruction (base) is handled by the caller usually, 
        // but could be moved here if we pass coordinates. 
        // For now, eliminating the player structure is the main job.
    }

    public getPlayerIds(): string[] {
        return this.state.playerOrder;
    }

    // --- Delegation ---

    public reset(configs?: { id: string, isAI: boolean, color: number }[], keepMap: boolean = false, mapType?: MapType) {
        this.state.reset(configs, keepMap, mapType);
    }

    public loadState(json: string) {
        this.state.deserialize(json);
    }

    public getState(): GameState {
        return this.state;
    }
}
