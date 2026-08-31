import { describe, it, expect } from 'vitest';
import { GameState } from './GameState';
import { GameConfig } from './GameConfig';

/**
 * The per-player ownership index backs every hot path in the engine (income,
 * connectivity, attack distance, AI candidate generation), so it must mirror the
 * grid exactly — including when a cell's owner is assigned directly rather than
 * through setOwner(), as the flood event does.
 */
const collectOwnedFromGrid = (state: GameState, playerId: string): Set<string> => {
    const owned = new Set<string>();
    for (const row of state.grid) {
        for (const cell of row) {
            if (cell.owner === playerId) owned.add(`${cell.row},${cell.col}`);
        }
    }
    return owned;
};

const collectOwnedFromIndex = (state: GameState, playerId: string): Set<string> =>
    new Set(state.getOwnedCells(playerId).map((p) => `${p.r},${p.c}`));

describe('GameState ownership index', () => {
    const makeState = () => new GameState([
        { id: 'P1', isAI: false, color: 0xff0000 },
        { id: 'P2', isAI: true, color: 0x00ff00 }
    ], 'default');

    it('tracks ownership set through setOwner', () => {
        const state = makeState();
        state.setOwner(4, 4, 'P1');
        state.setOwner(4, 5, 'P1');

        expect(collectOwnedFromIndex(state, 'P1')).toEqual(collectOwnedFromGrid(state, 'P1'));

        state.setOwner(4, 5, 'P2');
        expect(collectOwnedFromIndex(state, 'P1')).toEqual(collectOwnedFromGrid(state, 'P1'));
        expect(collectOwnedFromIndex(state, 'P2')).toEqual(collectOwnedFromGrid(state, 'P2'));
    });

    it('tracks ownership assigned directly on the cell (as the flood event does)', () => {
        const state = makeState();
        state.setOwner(3, 3, 'P1');
        state.setOwner(3, 4, 'P1');

        // Flooding clears the owner in place rather than calling setOwner.
        state.grid[3][4].owner = null;

        expect(collectOwnedFromIndex(state, 'P1')).toEqual(collectOwnedFromGrid(state, 'P1'));
        expect(collectOwnedFromIndex(state, 'P1').has('3,4')).toBe(false);
    });

    it('tracks ownership transferred directly on the cell', () => {
        const state = makeState();
        state.setOwner(2, 2, 'P1');
        state.grid[2][2].owner = 'P2';

        expect(collectOwnedFromIndex(state, 'P1')).toEqual(collectOwnedFromGrid(state, 'P1'));
        expect(collectOwnedFromIndex(state, 'P2')).toEqual(collectOwnedFromGrid(state, 'P2'));
    });

    it('rebuilds an exact index after deserialize', () => {
        const state = makeState();
        state.setOwner(1, 1, 'P1');
        state.setOwner(1, 2, 'P2');
        const saved = state.serialize();

        const restored = makeState();
        restored.deserialize(saved);

        for (const playerId of ['P1', 'P2']) {
            expect(collectOwnedFromIndex(restored, playerId)).toEqual(collectOwnedFromGrid(restored, playerId));
        }
    });

    it('keeps the index exact after reset', () => {
        const state = makeState();
        state.setOwner(5, 5, 'P1');
        state.reset(undefined, true);

        for (const playerId of ['P1', 'P2']) {
            expect(collectOwnedFromIndex(state, playerId)).toEqual(collectOwnedFromGrid(state, playerId));
        }
    });

    it('reports owned cell counts without materialising the list', () => {
        const state = makeState();
        const before = state.getOwnedCellCount('P1');
        state.setOwner(GameConfig.GRID_HEIGHT - 1, GameConfig.GRID_WIDTH - 1, 'P1');
        expect(state.getOwnedCellCount('P1')).toBe(before + 1);
        expect(state.getOwnedCellCount('P1')).toBe(state.getOwnedCells('P1').length);
    });
});
