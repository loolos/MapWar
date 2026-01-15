
import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';

describe('Plan Validation Logic', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();
        engine.startGame();
        // Normalize grid to avoid random map blockers
        const height = engine.state.grid.length;
        const width = height > 0 ? engine.state.grid[0].length : 0;
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                engine.state.grid[r][c].owner = null;
                engine.state.grid[r][c].building = 'none';
                engine.state.grid[r][c].isConnected = false;
                engine.state.grid[r][c].type = 'plain';
            }
        }

        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');

        engine.state.updateConnectivity('P1');
        engine.state.currentPlayerId = 'P1';
    });

    it('rejects adding a move if cost exceeds gold', () => {
        engine.state.players['P1'].gold = 15; // Enough for 1 capture (10G)

        // Move 1: (0,1) - Capture (10G)
        engine.togglePlan(0, 1);
        expect(engine.pendingMoves).toHaveLength(1);

        // Move 2: (0,2) - Capture (10G). Total 20G.
        // Gold 15. Should fail.
        engine.togglePlan(0, 2);

        expect(engine.pendingMoves).toHaveLength(1); // Should NOT add second move
        expect(engine.lastError).toContain('Not enough gold');
    });
});
