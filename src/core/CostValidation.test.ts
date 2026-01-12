
import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';

describe('Cost Validation Bug', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();
        engine.startGame();

        // Clear grid ownership
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                engine.state.grid[r][c].owner = null;
                engine.state.grid[r][c].building = 'none';
                engine.state.grid[r][c].isConnected = false;
                engine.state.grid[r][c].type = 'plain';
            }
        }

        // P1 setup
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');
        engine.state.updateConnectivity('P1');
        engine.state.players['P1'].gold = 15; // Only enough for 1 move (10G capture)
        engine.state.currentPlayerId = 'P1';
    });

    it('prevents selecting multiple tiles if total cost exceeds gold', () => {
        // Move 1: (0,1). Cost 10.
        engine.togglePlan(0, 1);
        expect(engine.pendingMoves).toHaveLength(1);

        // Cost: 10. Gold: 15. OK.

        // Move 2: (0,2). Cost 10. Total 20.
        // P1 has 15. Should fail.
        engine.togglePlan(0, 2);

        // Expectation: Move 2 is rejected OR removed.
        // If bug exists, pendingMoves might be 2.
        if (engine.pendingMoves.length === 2) {
            console.log("Bug Reproduced: Accepted Move 2 despite insufficient funds.");
        }
        expect(engine.pendingMoves).toHaveLength(1); // Should only keep valid ones
        expect(engine.pendingMoves[0].c).toBe(1); // Make sure it kept the first one
    });

    it('prevents committing over-budget moves', () => {
        engine.state.players['P1'].gold = 15;

        // Force inject pending moves 
        // (Simulating race condition or UI bypass, though togglePlan should prevent it)
        // If togglePlan logic is broken, maybe we can inject?
        engine.pendingMoves = [{ r: 0, c: 1 }, { r: 0, c: 2 }];

        // commitMoves should prune or fail?
        // Wait, commitMoves doesn't prune COST. It relies on `togglePlan` to prune.
        // But `commitMoves` iterates.

        engine.commitMoves();

        // Expected: (0,1) captured. (0,2) NOT captured.
        // Or if atomic, neither?
        // Game usually allows partial or atomic? 
        // "Continuous occupation" implies partial success is okay?
        // But preventing overspending is key.

        const cell1 = engine.state.getCell(0, 1);
        const cell2 = engine.state.getCell(0, 2);

        console.log("Cell 1 Owner:", cell1?.owner);
        console.log("Cell 2 Owner:", cell2?.owner);

        expect(cell1?.owner).toBe('P1');
        expect(cell2?.owner).toBeNull(); // Should fail

        // Verify Gold
        // 15 - 10 = 5. Not -5.
        expect(engine.state.players['P1'].gold).toBeGreaterThanOrEqual(0);
        expect(engine.state.players['P1'].gold).toBe(5);
    });
});
