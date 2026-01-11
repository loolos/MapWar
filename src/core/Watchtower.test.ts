import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';

describe('Watchtower Logic', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();
        // Setup simple grid
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                engine.state.grid[r][c].owner = null;
                engine.state.grid[r][c].building = 'none';
                engine.state.grid[r][c].type = 'plain';
                engine.state.grid[r][c].watchtowerLevel = 0;
            }
        }
        // Basic P1 Setup
        engine.state.players['P1'].gold = 1000;
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');
        engine.state.updateConnectivity('P1');
    });

    it('can build and upgrade watchtower on connected wall', () => {
        // Setup Wall at (0,1) for P1
        engine.state.setOwner(0, 1, 'P1');
        engine.state.setBuilding(0, 1, 'wall');
        engine.state.updateConnectivity('P1');
        engine.state.currentPlayerId = 'P1';

        const cell = engine.state.getCell(0, 1)!;
        expect(cell.watchtowerLevel).toBe(0);

        // 1. Build Watchtower
        engine.planInteraction(0, 1, 'BUILD_WATCHTOWER');
        engine.commitMoves();
        expect(cell.watchtowerLevel).toBe(1);

        // 2. Upgrade to Lv 2
        engine.planInteraction(0, 1, 'UPGRADE_WATCHTOWER');
        engine.commitMoves();
        expect(cell.watchtowerLevel).toBe(2);

        // 3. Upgrade to Lv 3
        engine.planInteraction(0, 1, 'UPGRADE_WATCHTOWER');
        engine.commitMoves();
        expect(cell.watchtowerLevel).toBe(3);
    });

    it('watchtower reduces attack cost in range (Owner Benefit)', () => {
        // P1 has Watchtower at (2,2)
        engine.state.grid[2][2].type = 'plain';
        engine.state.setOwner(2, 2, 'P1');
        engine.state.setBuilding(2, 2, 'wall');
        engine.state.getCell(2, 2)!.defenseLevel = 1; // Lv 1 Wall implies 20% base
        engine.state.getCell(2, 2)!.watchtowerLevel = 1; // Range 2
        engine.state.getCell(2, 2)!.isConnected = true;

        // P1 Attacker
        engine.state.players['P1'].gold = 1000;
        engine.state.currentPlayerId = 'P1';

        // Target: (2,3) - Adjacent to Tower. Range 1.
        // Needs to be owned by someone else to be an "Attack"
        engine.state.setOwner(2, 3, 'P2');

        // P needs to be adjacent to attack? 
        // P1 owns (2,2). Target is (2,3). Adjacent.

        // Check Cost of (2,3) for P1
        const cost = engine.getMoveCost(2, 3);
        const details = engine.getCostDetails(2, 3);
        // console.log(`Cost: ${cost}, Breakdown: ${details.breakdown}`);

        // Expect reduction
        expect(details.breakdown).toContain('Support(-20%)');
        // Base Attack (20) * 1.2 (Attack Multiplier) = 24.
        // Discount 20% of 24 = 4.8 -> 4.
        // Final: 20.
        expect(cost).toBe(20);
    });

    it('watchtower range scales with level', () => {
        // Setup Tower at (0,0) for P1
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'wall');
        const tower = engine.state.getCell(0, 0)!;
        tower.watchtowerLevel = 1; // Range 2
        tower.defenseLevel = 1;
        tower.isConnected = true;

        // P1 attacking P2 at (0,3) (Distance 3)
        engine.state.setOwner(0, 3, 'P2'); // Target
        // P1 owns (0,2), so adjacent to target
        engine.state.setOwner(0, 2, 'P1');

        engine.state.currentPlayerId = 'P1';

        // Level 1 (Range 2): (0,3) is dist 3. Should NOT have discount.
        let details = engine.getCostDetails(0, 3);
        expect(details.breakdown).not.toContain('Support');

        // Upgrade Tower to Level 2 (Range 3)
        tower.watchtowerLevel = 2;

        // Now (0,3) is in range.
        details = engine.getCostDetails(0, 3);
        expect(details.breakdown).toContain('Support');
    });

    it('watchtower is destroyed on capture', () => {
        // P1 Tower at (0,1)
        engine.state.setOwner(0, 1, 'P1');
        engine.state.setBuilding(0, 1, 'wall'); // Requirement: on wall
        const cell = engine.state.getCell(0, 1)!;
        cell.watchtowerLevel = 1;
        cell.defenseLevel = 1;

        // P2 Captures it
        engine.state.players['P2'].gold = 1000;

        // Give P2 a Base to ensure connectivity
        engine.state.setOwner(0, 2, 'P2');
        engine.state.setBuilding(0, 2, 'base');
        engine.state.updateConnectivity('P2');

        engine.state.currentPlayerId = 'P2';

        // P2 Attacks (0,1)
        engine.planInteraction(0, 1, 'MOVE'); // Attack/Capture
        engine.commitMoves();

        // Check Ownership
        expect(cell.owner).toBe('P2');

        // Check Destruction: Watchtower gone
        expect(cell.watchtowerLevel).toBe(0);

        // Check Wall Degradation: Lv 1 -> 0 -> None
        expect(cell.defenseLevel).toBe(0);
        expect(cell.building).toBe('none');
    });
});
