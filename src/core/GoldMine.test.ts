
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';

describe('Gold Mine Feature', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();
        // Clear grid
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                engine.state.grid[r][c].owner = null;
                engine.state.grid[r][c].building = 'none';
                engine.state.grid[r][c].type = 'plain'; // Reset type
            }
        }
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('discovers a gold mine on hill capture with 20% chance', () => {
        // Setup: P1 captures a Hill
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');
        engine.state.updateConnectivity('P1');
        engine.state.players['P1'].gold = 100;

        // Target: Hill at (0,1)
        engine.state.getCell(0, 1)!.type = 'hill';
        engine.state.getCell(0, 1)!.owner = null;

        // Mock Math.random to return < 0.2 (hit)
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);

        engine.pendingMoves = [{ r: 0, c: 1 }];
        engine.commitMoves();

        const cell = engine.state.getCell(0, 1)!;
        expect(cell.owner).toBe('P1');
        expect(cell.building).toBe('gold_mine'); // Discovered!
        expect(randomSpy).toHaveBeenCalled();
    });

    it('does NOT discover gold mine if chance fails', () => {
        // Setup
        engine.state.setOwner(0, 0, 'P1');
        engine.state.players['P1'].gold = 100;
        engine.state.getCell(0, 1)!.type = 'hill';
        engine.state.getCell(0, 1)!.owner = null;

        // Mock Math.random to return > 0.2 (miss)
        vi.spyOn(Math, 'random').mockReturnValue(0.5);

        engine.pendingMoves = [{ r: 0, c: 1 }];
        engine.commitMoves();

        const cell = engine.state.getCell(0, 1)!;
        expect(cell.building).toBe('none');
    });

    it('does NOT discover gold mine on non-hill', () => {
        engine.state.setOwner(0, 0, 'P1');
        engine.state.players['P1'].gold = 100;
        engine.state.getCell(0, 1)!.type = 'plain'; // Plain
        engine.state.getCell(0, 1)!.owner = null;

        vi.spyOn(Math, 'random').mockReturnValue(0.1); // Would be a hit

        engine.pendingMoves = [{ r: 0, c: 1 }];
        engine.commitMoves();

        const cell = engine.state.getCell(0, 1)!;
        expect(cell.building).toBe('none');
    });

    it('provides 5 gold income per turn', () => {
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'gold_mine');
        // Add Base for global income check
        engine.state.setOwner(0, 1, 'P1');
        engine.state.setBuilding(0, 1, 'base');

        // Ensure no mock interfererence with depletion (mock > 0.05)
        vi.spyOn(Math, 'random').mockReturnValue(0.9);

        const report = engine.state.accrueResources('P1')!;

        // Base Income (10) + Gold Mine (5) = 15
        expect(report.total).toBe(15);
    });

    it('depletes with 5% chance per turn', () => {
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'gold_mine');

        // Mock Math.random to return < 0.05 (deplete)
        vi.spyOn(Math, 'random').mockReturnValue(0.01);

        engine.state.accrueResources('P1');

        const cell = engine.state.getCell(0, 0)!;
        expect(cell.building).toBe('none'); // Collapsed
    });
});
