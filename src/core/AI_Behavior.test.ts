import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';

describe('AI Behavior', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();

        // Clear Grid for Determinism
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                engine.state.grid[r][c].owner = null;
                engine.state.grid[r][c].building = 'none';
                engine.state.grid[r][c].type = 'plain'; // Default to plain
                engine.state.grid[r][c].isConnected = false;
            }
        }

        // Setup P1 Base at (0,0)
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');
        engine.state.updateConnectivity('P1');
        // Reset Gold
        engine.state.players['P1'].gold = 0;

        // Force P1 to be AI setup
        engine.state.players['P1'].isAI = true;

        // We'll manage startGame manually in tests if we need specific setup first
        // But generally startGame is safe to call immediately for defaults
    });

    it('expands to neutral land when safe', () => {
        // Setup: P1 at (0,0). (0,1) is Neutral Plain.
        // Setup: P1 (0,0). Neutral Neighbors (0,1), (1,0).
        // Block (1,0) to force (0,1) choice
        const blockCell = engine.state.getCell(1, 0);
        if (blockCell) blockCell.type = 'water';

        engine.startGame();

        // Expectation: AI should capture (0,1)
        // Mock playTurn to run synchronously
        engine.ai.playTurn();

        const cell = engine.state.getCell(0, 1);
        expect(cell?.owner).toBe('P1');
    });

    it('prioritizes towns over plains', () => {
        // Setup: (0,1) Plain, (1,0) Town.
        engine.state.setBuilding(1, 0, 'town');

        engine.startGame();

        // Need Gold! Town capture is 30.
        engine.state.players['P1'].gold = 50;

        engine.ai.playTurn();

        // Should have captured (1,0) [Town]
        expect(engine.state.getCell(1, 0)?.owner).toBe('P1');
    });

    it('attacks enemy units when profitable', () => {
        // Setup: P1 (0,0). P2 at (0,1).
        engine.state.setOwner(0, 1, 'P2');
        engine.state.getCell(0, 1)!.unit = 'infantry';
        engine.state.updateConnectivity('P1');

        engine.startGame();
        // Need Gold! Attack cost 20.
        engine.state.players['P1'].gold = 50;

        engine.ai.playTurn();

        // Should have attacked (0,1)
        expect(engine.state.getCell(0, 1)?.owner).toBe('P1');
    });

    it('does not move if no valid moves (Passivity)', () => {
        // Setup imports P1 at (0,0). Block neighbors.
        // Neighbors of (0,0): (0,1) and (1,0).
        engine.state.getCell(0, 1)!.type = 'water';
        engine.state.getCell(1, 0)!.type = 'water';
        engine.state.updateConnectivity('P1');

        // Also ensure no other ownership exists (handled by beforeEach)

        engine.startGame(); // Gives income
        // Fix income gain calculation (11 gold start)
        const lowGold = 5;
        engine.state.players['P1'].gold = lowGold;

        engine.ai.playTurn();

        // Should have done nothing
        expect(engine.state.getCell(0, 1)?.owner).toBeNull();

        // P1 Gold should NOT change during P1 turn (no spending).
        expect(engine.state.players['P1'].gold).toBe(lowGold);
    });

    it('builds walls on threatened borders', () => {
        // Setup: P1 (0,0) and (0,1).
        engine.state.setOwner(0, 1, 'P1');

        // Block Expansion Routes so AI saves gold for Wall
        // (0,0) neighbors (0,1), (1,0)
        // (0,1) neighbors (0,0), (0,2), (1,1)
        engine.state.getCell(1, 0)!.type = 'water';
        engine.state.getCell(1, 1)!.type = 'water';

        // P2 at (0,2) threatening (0,1).
        // High Defense to prevent expensive attack
        engine.state.setOwner(0, 2, 'P2');
        engine.state.setBuilding(0, 2, 'wall'); // Building required for defense cost
        engine.state.getCell(0, 2)!.unit = 'infantry';
        engine.state.getCell(0, 2)!.defenseLevel = 10;
        engine.state.getCell(0, 2)!.isConnected = true; // CRITICAL: Wall must be connected to valid supply for defense bonus

        // Ensure (0,1) can be walled. Not already walled.
        engine.state.setBuilding(0, 1, 'none');

        // MAX OUT BASE (0,0) so AI doesn't spend gold on upgrades
        const base = engine.state.getCell(0, 0)!;
        base.incomeLevel = 5; // Max Income
        base.defenseLevel = 3; // Max Defense

        // CRITICAL: Update Connectivity so AI knows (0,1) is connected and buildable
        engine.state.updateConnectivity('P1');

        engine.startGame();
        // Give P1 Gold
        // Attack (320) > 25.
        // Bridge (30) > 25.
        // Wall (20) <= 25.
        // Update: Attack on plain with 0 defense is 24.
        // We set defenseLevel 10, Wall, and Connected -> Cost > 300.
        // Gold 25 is safe.
        engine.state.players['P1'].gold = 25;

        engine.ai.playTurn();

        // Should have built wall OR upgraded defense at (0,1)
        const cell = engine.state.getCell(0, 1)!;
        const hasWall = cell.building === 'wall';
        // Defense upgrade is also valid action for AI defense
        const hasDef = cell.defenseLevel > 0;

        expect(hasWall || hasDef).toBe(true);
    });
});
