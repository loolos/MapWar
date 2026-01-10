
import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';

describe('Wall Mechanics', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();
        // Clean grid
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
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
        // Base Cost (Attack 20 + Wall 20 = 40) * Multiplier (1.2) = 48.
        expect(cost).toBe(48);
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

        // Base(20) + Wall(20*2=40) = 60.
        // 60 * 1.2 = 72.
        expect(cost).toBe(72);
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
});
