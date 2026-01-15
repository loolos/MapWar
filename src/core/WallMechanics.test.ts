
import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';

describe('Wall Mechanics', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();
        // Clean grid
        const height = engine.state.grid.length;
        const width = height > 0 ? engine.state.grid[0].length : 0;
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                engine.state.grid[r][c].owner = null;
                engine.state.grid[r][c].building = 'none';
                engine.state.grid[r][c].isConnected = false;
                engine.state.grid[r][c].type = 'plain';
                engine.state.grid[r][c].defenseLevel = 0;
            }
        }
        engine.state.players['P1'].gold = 1000;
        engine.state.players['P2'].gold = 1000;
    });

    it('can build a wall', () => {
        // Setup P1 Cell
        engine.state.setOwner(0, 0, 'P1');
        engine.state.getCell(0, 0)!.isConnected = true;

        // Plan Build
        engine.planInteraction(0, 0, 'BUILD_WALL');
        expect(engine.pendingInteractions).toHaveLength(1);

        // Commit
        engine.commitMoves();
        const cell = engine.state.getCell(0, 0)!;
        expect(cell.building).toBe('wall');
        expect(cell.defenseLevel).toBe(1);
        expect(engine.state.players['P1'].gold).toBe(1000 - GameConfig.COST_BUILD_WALL);
    });

    it('wall increases capture cost', () => {
        // Setup P1 Wall at (0,0)
        engine.state.setOwner(0, 0, 'P1');
        engine.state.getCell(0, 0)!.building = 'wall';
        engine.state.getCell(0, 0)!.defenseLevel = 1;

        // Give P1 a Layout for connectivity: Base at (1,0) -> Wall at (0,0)
        engine.state.setOwner(1, 0, 'P1');
        engine.state.setBuilding(1, 0, 'base');
        engine.state.updateConnectivity('P1');

        // Setup P2 Attacker
        engine.state.setOwner(0, 1, 'P2');
        engine.state.setBuilding(0, 1, 'base'); // Ensure P2 connectivity
        engine.state.updateConnectivity('P2');
        engine.state.currentPlayerId = 'P2';

        const cost = engine.getMoveCost(0, 0);
        // Base Cost (Attack 20 + WallBase 10 + WallLv1 30 = 60) * Multiplier (1.2) = 72.
        // Base Defense Aura (P1 Base nearby): +20% of 72 = 14.4 -> 86.4 -> 86.
        // Aura Discount (P2 Base nearby): 20% of 86 = 17.2 -> 17.
        // 86 - 17 = 69.
        expect(cost).toBe(69);
    });

    it('can upgrade wall', () => {
        // Setup P1 Wall at (0,0) with Base at (1,0)
        engine.state.setOwner(0, 0, 'P1');
        const cell = engine.state.getCell(0, 0)!;
        cell.building = 'wall';
        cell.defenseLevel = 1;

        engine.state.setOwner(1, 0, 'P1');
        engine.state.setBuilding(1, 0, 'base');
        engine.state.updateConnectivity('P1');

        // Upgrade
        engine.state.currentPlayerId = 'P1';

        // Plan & Commit
        engine.planInteraction(0, 0, 'UPGRADE_DEFENSE');
        engine.commitMoves();

        expect(cell.defenseLevel).toBe(2);

        // Check Cost Increase
        // P2 Attacker
        engine.state.setOwner(0, 1, 'P2');
        engine.state.setBuilding(0, 1, 'base');
        engine.state.updateConnectivity('P2');
        engine.state.currentPlayerId = 'P2';
        const cost = engine.getMoveCost(0, 0);

        // Base(20) + WallBase(10) + WallLv2(30*2=60) = 90.
        // 90 * 1.2 = 108.
        // Base Defense Aura (P1 Base): 108 * 1.2 = 129.6 -> 129.
        // Aura Discount (P2 Base): 20% of 129 = 25.8 -> 25.
        // 129 - 25 = 104.
        expect(cost).toBe(104);
    });

    it('capture degrades wall', () => {
        // Setup P1 Wall Lv 1
        engine.state.setOwner(0, 0, 'P1');
        const cell = engine.state.getCell(0, 0)!;
        cell.building = 'wall';
        cell.defenseLevel = 1;

        // P2 Captures
        engine.state.setOwner(0, 1, 'P2');
        engine.state.setBuilding(0, 1, 'base');
        engine.state.updateConnectivity('P2');
        engine.state.currentPlayerId = 'P2';

        // P2 attacks (0,0)
        engine.togglePlan(0, 0);
        engine.commitMoves();

        // Check Result
        expect(cell.owner).toBe('P2');
        expect(cell.building).toBe('none'); // Destroyed (1 -> 0)
        expect(cell.defenseLevel).toBe(0);
    });

    it('capture degrades wall level 2 to 1', () => {
        // Setup P1 Wall Lv 2
        engine.state.setOwner(0, 0, 'P1');
        const cell = engine.state.getCell(0, 0)!;
        cell.building = 'wall';
        cell.defenseLevel = 2;

        // P2 Captures
        engine.state.setOwner(0, 1, 'P2');
        engine.state.setBuilding(0, 1, 'base');
        engine.state.updateConnectivity('P2');
        engine.state.currentPlayerId = 'P2';

        engine.togglePlan(0, 0);
        engine.commitMoves();

        // Check Result
        expect(cell.owner).toBe('P2');
        expect(cell.building).toBe('wall'); // Kept
        expect(cell.defenseLevel).toBe(1); // Degraded
    });

    it('disconnected wall provides no defense bonus', () => {
        // Setup P1 Wall Lv 1 at (0,0)
        engine.state.setOwner(0, 0, 'P1');
        const cell = engine.state.getCell(0, 0)!;
        cell.building = 'wall';
        cell.defenseLevel = 1;
        cell.isConnected = false; // Manually set disconnected

        // Setup P2 Attacker
        engine.state.setOwner(0, 1, 'P2');
        engine.state.setBuilding(0, 1, 'base');
        engine.state.updateConnectivity('P2');
        engine.state.currentPlayerId = 'P2';

        const cost = engine.getMoveCost(0, 0);

        // Calculation:
        // Base Attack: 20
        // Wall Bonus: 0 (Disconnected)
        // Subtotal: 20
        // Attack Multiplier: 20 * 1.2 = 24
        // Disconnect Penalty: 24 * 0.7 = 16.8 -> 16
        // Aura Discount (P2 Base): 20% of 16 = 3.2 -> 3.
        // 16 - 3 = 13.
        expect(cost).toBe(13);
    });
});
