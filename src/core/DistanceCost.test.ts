import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';

describe('Distance Cost Logic', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();
        engine.startGame();
        // Clear grid ownership
        const height = engine.state.grid.length;
        const width = height > 0 ? engine.state.grid[0].length : 0;
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                engine.state.grid[r][c].owner = null;
                engine.state.grid[r][c].building = 'none';
                engine.state.grid[r][c].isConnected = false;
                engine.state.grid[r][c].type = 'plain'; // Force plain to ensure deterministic costs
            }
        }
    });

    it('calculates Manhattan distance correctly', () => {
        // Setup P1 base at (0,0)
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');
        engine.state.updateConnectivity('P1');

        // Target at (0, 1) - Distance 1 (Adjacent)
        // Cost should be x1
        let costDetails = engine.getCostDetails(0, 1);
        // Base Cost for Neutral Plain = 10?
        // Wait, current logic: Neural Plain = 10. Multiplier Neutral = 1?
        // Let's test ATTACK.
        // Set Target (0, 1) to P2.
        engine.state.setOwner(0, 1, 'P2');
        engine.state.getCell(0, 1)!.isConnected = true; // Force connected to avoid 0.7x penalty
        engine.state.currentPlayerId = 'P1';

        // Base Attack Cost = 20.
        // Distance 1 (Adjacent) => x1.
        // Support Aura (Range 2) => -20%.
        // Base(20) * 1.2(Atk) * 1(Dist) = 24.
        // Discount 20% of 24 = 4.
        // Result: 20.
        costDetails = engine.getCostDetails(0, 1);
        expect(costDetails.cost).toBe(20);

        // Target at (0, 2) - Distance 2 from (0,0)
        // This is ALSO within range 2 of Base. Support applies.
        engine.state.setOwner(0, 2, 'P2');
        engine.state.getCell(0, 2)!.isConnected = true; // Force connected
        costDetails = engine.getCostDetails(0, 2);

        // Distance is 2. Cost x2.
        // Base: 20 * 1.2 * 2 = 48.
        // Discount: floor(48 * 0.2) = 9.
        // Final: 39.
        expect(costDetails.breakdown).toContain('Distance(x2)');
        expect(costDetails.breakdown).toContain('Support');
        expect(costDetails.cost).toBe(39);

        // Target at (2, 2) - Distance |2-0| + |2-0| = 4.
        // Range 4 is OUTSIDE Base Range (Base Lv0 Range is 2).
        // So NO Support.
        engine.state.setOwner(2, 2, 'P2');
        engine.state.getCell(2, 2)!.isConnected = true; // Force connected
        costDetails = engine.getCostDetails(2, 2);
        expect(costDetails.breakdown).toContain('Distance(x4)');
        expect(costDetails.cost).toBe(Math.floor(GameConfig.COST_ATTACK * GameConfig.COST_MULTIPLIER_ATTACK * 4));
    });

    it('uses nearest connected cell for distance', () => {
        // P1 at (0,0) Connected.
        // P1 at (5,5) Disconnected.

        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');

        engine.state.setOwner(5, 5, 'P1'); // Disconnected
        engine.state.updateConnectivity('P1');

        // Target at (5, 6).
        // Distance to (5,5) is 1. BUT (5,5) is NOT CONNECTED.
        // Distance to (0,0) is |5-0| + |6-0| = 11.

        engine.state.setOwner(5, 6, 'P2');
        engine.state.currentPlayerId = 'P1';

        const costDetails = engine.getCostDetails(5, 6);
        expect(costDetails.breakdown).toContain('Distance(x11)');
    });
});
