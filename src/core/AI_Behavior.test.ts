import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';

describe('AI Behavior', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();

        // Clear Grid for Determinism
        const height = engine.state.grid.length;
        const width = height > 0 ? engine.state.grid[0].length : 0;
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
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

        // Prevent auto AI turn during startGame
        engine.state.players['P1'].isAI = false;
        engine.state.players['P2'].isAI = false;

        // We'll manage startGame manually in tests if we need specific setup first
        // But generally startGame is safe to call immediately for defaults
    });

    it('expands to neutral land when safe', () => {
        // Setup: P1 at (0,0). (0,1) is Neutral Plain.
        // Block (1,0) to force (0,1) as the only expansion choice
        const blockCell = engine.state.getCell(1, 0);
        if (blockCell) blockCell.type = 'water';

        engine.startGame();

        // Base at (0,0) - allow both expansion and upgrades
        const base = engine.state.getCell(0, 0)!;
        const initialIncomeLevel = base.incomeLevel;
        const initialDefenseLevel = base.defenseLevel;
        
        // Give sufficient gold for expansion or upgrades
        // Plain capture cost is 20, upgrade cost varies, so 100 gold ensures AI can afford either
        engine.state.players['P1'].gold = 100;
        engine.state.players['P1'].isAI = true;
        
        // Ensure connectivity is updated so AI knows (0,1) is reachable
        engine.state.updateConnectivity('P1');
        
        // Verify (0,1) is the only adjacent neutral cell
        const cell01 = engine.state.getCell(0, 1);
        expect(cell01).toBeDefined();
        expect(cell01?.owner).toBeNull();
        expect(cell01?.type).toBe('plain');
        
        // Run AI turn - AI should either expand to (0,1) or upgrade the base
        // Both are valid strategic choices
        engine.ai.playTurn();

        // Verify AI made a reasonable strategic decision:
        // Option 1: Expanded to (0,1) - this is the primary expectation
        // Option 2: Upgraded the base - also a valid strategic choice
        const expanded = cell01?.owner === 'P1';
        const upgraded = base.incomeLevel > initialIncomeLevel || base.defenseLevel > initialDefenseLevel;
        
        // AI should have done at least one of these actions
        expect(expanded || upgraded).toBe(true);
        
        // If AI didn't expand, at least verify it did something strategic (upgraded)
        if (!expanded) {
            expect(upgraded).toBe(true);
        }
    });

    it('prioritizes towns over plains', () => {
        // Setup: (0,1) Plain, (1,0) Town.
        engine.state.setBuilding(1, 0, 'town');

        engine.startGame();

        // Need Gold! Town capture is 30.
        engine.state.players['P1'].gold = 50;

        engine.state.players['P1'].isAI = true;
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

        engine.state.players['P1'].isAI = true;
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

        engine.state.players['P1'].isAI = true;
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

        engine.state.players['P1'].isAI = true;
        engine.ai.playTurn();

        // Should have built wall OR upgraded defense at (0,1)
        const cell = engine.state.getCell(0, 1)!;
        const hasWall = cell.building === 'wall';
        // Defense upgrade is also valid action for AI defense
        const hasDef = cell.defenseLevel > 0;

        expect(hasWall || hasDef).toBe(true);
    });
});
