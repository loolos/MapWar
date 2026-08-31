import type { PlayerID } from './GameConfig';

import { type CellType } from './GameConfig';

/**
 * Notified whenever a cell's owner changes, so owners can keep derived indexes in sync.
 */
export type CellOwnerObserver = (cell: Cell, previousOwner: PlayerID, nextOwner: PlayerID) => void;

export class Cell {
    row: number;
    col: number;
    unit: any | null; // Placeholder for Unit class
    building: 'base' | 'town' | 'gold_mine' | 'wall' | 'farm' | 'citadel' | 'lighthouse' | 'none';
    isConnected: boolean;
    type: CellType;

    // Town Specific State
    townIncome: number;
    townTurnCount: number;

    // Base Upgrade State
    defenseLevel: number;
    incomeLevel: number;

    // Watchtower State
    watchtowerLevel: number; // 0 = none

    // Farm State
    farmLevel: number; // 0 = none

    /** Treasure/flotsam overlay: null = none, number = gold amount (50–200). */
    treasureGold: number | null;

    private _owner: PlayerID;

    /**
     * Hook used by GameState to mirror ownership into its per-player index.
     *
     * Ownership is exposed as an accessor rather than a plain field so that the index
     * stays exact no matter how the owner is set — `GameState.setOwner()`, deserialization,
     * or a direct `cell.owner = 'P1'` assignment. Hot paths can therefore iterate a
     * player's tiles from the index instead of scanning the whole grid.
     */
    ownerObserver: CellOwnerObserver | null;

    /** The player owning this cell, or null when unowned. */
    get owner(): PlayerID {
        return this._owner;
    }

    set owner(next: PlayerID) {
        const previous = this._owner;
        if (previous === next) return;
        this._owner = next;
        if (this.ownerObserver) this.ownerObserver(this, previous, next);
    }

    constructor(row: number, col: number) {
        this.row = row;
        this.col = col;
        this._owner = null;
        this.ownerObserver = null;
        this.unit = null;
        this.building = 'none';
        this.isConnected = true;
        this.type = 'plain';

        this.townIncome = 0; // Config default will apply on creation if town
        this.townTurnCount = 0;

        this.defenseLevel = 0;
        this.incomeLevel = 0;
        this.watchtowerLevel = 0;
        this.farmLevel = 0;
        this.treasureGold = null;
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
            townTurnCount: this.townTurnCount,
            defenseLevel: this.defenseLevel,
            incomeLevel: this.incomeLevel,
            watchtowerLevel: this.watchtowerLevel,
            farmLevel: this.farmLevel,
            treasureGold: this.treasureGold
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
        cell.defenseLevel = data.defenseLevel || 0;
        cell.incomeLevel = data.incomeLevel || 0;
        cell.watchtowerLevel = data.watchtowerLevel || 0;
        cell.farmLevel = data.farmLevel || 0;
        cell.treasureGold = data.treasureGold ?? null;
        return cell;
    }
}
