import type { PlayerID } from './GameConfig';

export class Cell {
    row: number;
    col: number;
    owner: PlayerID;
    unit: any | null; // Placeholder for Unit class
    building: 'base' | 'none';

    constructor(row: number, col: number) {
        this.row = row;
        this.col = col;
        this.owner = null;
        this.unit = null;
        this.building = 'none';
    }

    isOwnedBy(playerId: PlayerID): boolean {
        return this.owner === playerId;
    }
}
