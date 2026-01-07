import type { PlayerID } from './GameConfig';

import { type CellType } from './GameConfig';

export class Cell {
    row: number;
    col: number;
    owner: PlayerID;
    unit: any | null; // Placeholder for Unit class
    building: 'base' | 'town' | 'none';
    isConnected: boolean;
    type: CellType;

    // Town Specific State
    townIncome: number;
    townTurnCount: number;

    constructor(row: number, col: number) {
        this.row = row;
        this.col = col;
        this.owner = null;
        this.unit = null;
        this.building = 'none';
        this.isConnected = true;
        this.type = 'plain';

        this.townIncome = 0; // Config default will apply on creation if town
        this.townTurnCount = 0;
    }

    isOwnedBy(playerId: PlayerID): boolean {
        return this.owner === playerId;
    }

    serialize(): any {
        return {
            row: this.row,
            col: this.col,
            owner: this.owner,
            building: this.building,
            isConnected: this.isConnected,
            type: this.type,
            townIncome: this.townIncome,
            townTurnCount: this.townTurnCount
        };
    }

    static deserialize(data: any): Cell {
        const cell = new Cell(data.row, data.col);
        cell.owner = data.owner;
        cell.building = data.building;
        cell.isConnected = data.isConnected ?? true;
        cell.type = data.type || 'plain';
        cell.townIncome = data.townIncome || 0;
        cell.townTurnCount = data.townTurnCount || 0;
        return cell;
    }
}
