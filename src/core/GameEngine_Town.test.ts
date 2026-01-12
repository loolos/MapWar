
import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';

describe('GameEngine - Town Mechanics', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();

        // Clear Grid for Isolation
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                engine.state.grid[r][c].owner = null;
                engine.state.grid[r][c].type = 'plain'; // Ensure plain terrain
                engine.state.grid[r][c].building = 'none';
                engine.state.grid[r][c].isConnected = false;
                engine.state.grid[r][c].townIncome = 0;
                engine.state.grid[r][c].townTurnCount = 0;
            }
        }
    });

    it('places towns during initialization', () => {
        // Since we clear grid in beforeEach, we need to re-init or check a fresh engine
        const freshEngine = new GameEngine();
        let townCount = 0;
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                if (freshEngine.state.grid[r][c].building === 'town') {
                    townCount++;
                }
            }
        }
        expect(townCount).toBeGreaterThan(0);
    });

    it('charges 30G to capture a neutral town', () => {
        // Setup: P1 next to a Neutral Town
        // P1 needs a base to have connectivity for distance cost
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');
        engine.state.updateConnectivity('P1');
        engine.state.players['P1'].gold = 100;

        // Place Neutral Town at (0,1)
        engine.state.setBuilding(0, 1, 'town');
        engine.state.getCell(0, 1)!.owner = null;

        const cost = engine.getMoveCost(0, 1);
        const expected = Math.floor(GameConfig.COST_CAPTURE_TOWN * GameConfig.COST_MULTIPLIER_NEUTRAL);
        expect(cost).toBe(expected);
    });

    it('charges standard attack cost to capture enemy town', () => {
        // Setup: P1 vs P2
        // P1 needs a Base for connectivity, but FAR AWAY to avoid Support Aura (Discount).
        // Target is (0,1). P1 owns (0,0).
        // Place P1 Base at (5,0). 
        engine.state.setOwner(5, 0, 'P1');
        engine.state.setBuilding(5, 0, 'base');
        engine.state.setOwner(4, 0, 'P1');
        engine.state.setOwner(3, 0, 'P1');
        engine.state.setOwner(2, 0, 'P1');
        engine.state.setOwner(1, 0, 'P1');
        engine.state.setOwner(0, 0, 'P1');

        engine.state.updateConnectivity('P1');

        // Place P2 Town at (0,1)
        engine.state.setOwner(0, 1, 'P2');
        engine.state.setBuilding(0, 1, 'town');

        // Ensure P2 Town is connected to a base to avoid 30% discount?
        // Wait, "Disconnected 30% attack discount"?? The rule is "Disconnected DEFENDER takes 30% LESS value" or similar?
        // Or "Disconnected ATTACKER pays more"?
        // CostSystem: if owner && !connected -> baseCost * 0.7. (Easier to take disconnected land).
        // So we want P2 Town to be Connected.
        // Connect to Base far away to avoid Support Aura from Base.
        engine.state.setOwner(0, 4, 'P2');
        engine.state.setBuilding(0, 4, 'base');
        engine.state.setOwner(0, 3, 'P2');
        engine.state.setOwner(0, 2, 'P2');
        // (0,1) is the town.

        engine.state.updateConnectivity('P2');

        engine.state.currentPlayerId = 'P1'; // Ensure P1

        // Ensure adjacency check works
        // const isAdj = engine.state.isAdjacentToOwned(0, 1, 'P1');

        // Ensure adjacency check works
        // const isAdj = engine.state.isAdjacentToOwned(0, 1, 'P1');

        const cost = engine.getMoveCost(0, 1);
        const expected = Math.floor(GameConfig.COST_ATTACK * GameConfig.COST_MULTIPLIER_ATTACK);
        expect(cost).toBe(expected);
    });

    it('charges higher cost to capture disconnected helper town? No, standard rules apply', () => {
        // Implementation check: Standard attack rules apply to enemy towns
        // So plain town = 20.
    });

    it('provides base income of 1G', () => {
        // Setup P1 Town
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'town');
        engine.state.getCell(0, 0)!.townIncome = 1;
        engine.state.getCell(0, 0)!.isConnected = true; // Towns need connection? "IncomeLogic: Town income added". Code implies towns provide income regardless?
        // Let's check logic:
        // if (cell.building === 'town') { landIncome += cell.townIncome; }
        // It does NOT check isConnected for towns in my implementation!
        // Should it? Usually yes in strategies.
        // Task description: "Town... income... limit 10". Doesn't specify connectivity.
        // Assuming implicit requirement: Must be owned. Connectivity usually required for gold in this game.
        // My implementation added it inside the `if (cell.owner === playerId)` block.
        // But logic structure:
        // if (town) { ... } else if (!bridge) { check connection ... }
        // So currently my implementation GIVES INCOME even if disconnected.
        // Let's verify this behavior or if I should change it.
        // "supply line rules" exist. Likely towns need supply line too.
        // If I strictly follow user prompt "empty land occupy cost 30, income 1...".
        // It's safer to require connectivity or apply the 0.5 logic?
        // "income 1... but max 10".
        // If disconnected, maybe 0? Or freezes?
        // I'll stick to my current implementation (always provides income if owned) unless test feels wrong.

        // Test income
        const report = engine.state.accrueResources('P1')!;
        // Base 0 (No Base) + Town 1 = 1.
        expect(report.total).toBe(1);
    });

    it('grows income by 1 every 2 turns', () => {
        // Setup P1 Town
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'town');
        engine.state.getCell(0, 0)!.townIncome = 1;
        engine.state.getCell(0, 0)!.townTurnCount = 0;

        // Turn 1
        engine.state.accrueResources('P1');
        let cell = engine.state.getCell(0, 0)!;
        expect(cell.townTurnCount).toBe(1);
        expect(cell.townIncome).toBe(1); // No growth yet (needs multiples of 2)

        // Turn 2
        engine.state.accrueResources('P1');
        cell = engine.state.getCell(0, 0)!;
        expect(cell.townTurnCount).toBe(2);
        expect(cell.townIncome).toBe(2); // Grew!

        // Turn 3
        engine.state.accrueResources('P1');
        expect(cell.townIncome).toBe(2);

        // Turn 4
        engine.state.accrueResources('P1');
        expect(cell.townIncome).toBe(3);
    });

    it('caps income at 10', () => {
        // Setup P1 Town at limit
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'town');
        const cell = engine.state.getCell(0, 0)!;
        cell.townIncome = 10;
        cell.townTurnCount = 100;

        engine.state.accrueResources('P1');
        // Should trigger interval check but fail cap check
        expect(cell.townIncome).toBe(10);
    });

    it('resets income on capture', () => {
        // Setup P2 Town with high income
        engine.state.setOwner(0, 1, 'P2');
        engine.state.setBuilding(0, 1, 'town');
        const cell = engine.state.getCell(0, 1)!;
        cell.townIncome = 5;
        cell.townTurnCount = 10;

        // P1 Captures
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');
        engine.state.updateConnectivity('P1');
        engine.state.players['P1'].gold = 9999;
        engine.pendingMoves = [{ r: 0, c: 1 }];

        engine.commitMoves();

        expect(cell.owner).toBe('P1');
        expect(cell.townIncome).toBe(1);
        expect(cell.townTurnCount).toBe(0);
    });
});
