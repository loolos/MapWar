import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';

describe('Base Upgrades', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();

        // Clear all ownership to ensure clean slate
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                engine.state.grid[r][c].owner = null;
                engine.state.grid[r][c].building = 'none';
            }
        }

        // Setup P1
        engine.state.players['P1'].gold = 100;
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');
        engine.state.grid[0][0].type = 'plain'; // Force plain to ensure deterministic costs
        engine.state.updateConnectivity('P1');
    });

    it('UPGRADE_DEFENSE increases capture cost', () => {
        // P2 as attacker
        engine.state.players['P2'].gold = 1000;

        // Initial Cost (Standard + Attack Multiplier)
        // const baseAttackCost = Math.floor(GameConfig.COST_ATTACK * GameConfig.COST_MULTIPLIER_ATTACK); // 24

        // Need to set P2 adjacent
        // P2 needs a base to be "Connected" for distance calculations.
        // Place Base FAR AWAY to avoid "Support Aura" (Discount).
        // Base at (0, 4). Range default is 2. (0,0) is dist 4. Safe.
        // Chain: (0,1), (0,2), (0,3), (0,4)
        engine.state.setOwner(0, 4, 'P2');
        engine.state.setBuilding(0, 4, 'base');
        engine.state.setOwner(0, 3, 'P2');
        engine.state.setOwner(0, 2, 'P2');
        engine.state.setOwner(0, 1, 'P2'); // Adjacent to target (0,0)

        engine.state.updateConnectivity('P2');
        engine.state.currentPlayerId = 'P2';

        const costBefore = engine.getMoveCost(0, 0);
        console.log("Cost Before:", costBefore);

        // Upgrade Defense (As P1)
        engine.state.currentPlayerId = 'P1';
        engine.planInteraction(0, 0, 'UPGRADE_DEFENSE');

        // Verify Plan
        expect(engine.pendingInteractions.length).toBe(1);

        engine.commitMoves();

        // Check Level
        const cell = engine.state.getCell(0, 0)!;
        expect(cell.defenseLevel).toBe(1);

        // Check New Cost (As P2)
        engine.state.currentPlayerId = 'P2';
        const costAfter = engine.getMoveCost(0, 0);
        console.log("Cost After:", costAfter);

        // Math: (20 + 30) * 1.2 = 60. Cost Before was 24.
        // Difference is 36.
        expect(costAfter).toBeGreaterThan(costBefore);
        expect(costAfter - costBefore).toBe(36);
    });

    it('UPGRADE_INCOME increases next turn income', () => {
        const cell = engine.state.getCell(0, 0)!;
        expect(cell.incomeLevel).toBe(0);

        // 1. Upgrade Level 1
        engine.planInteraction(0, 0, 'UPGRADE_INCOME');
        engine.commitMoves();
        expect(cell.incomeLevel).toBe(1);

        // Calculate Income
        // Base (10) + Land (1) + Level 1 Bonus (1) = 12.
        let report = engine.state.accrueResources('P1');
        console.log("Income Report Lv1:", report);

        expect(report?.land).toBe(0); // Base tile provides 0 land income
        expect(report?.total).toBe(GameConfig.GOLD_PER_TURN_BASE + 1); // Base(10) + Bonus(1)

        // 2. Upgrade Level 2
        engine.planInteraction(0, 0, 'UPGRADE_INCOME');
        engine.commitMoves();
        expect(cell.incomeLevel).toBe(2);

        // Base (10) + Level 1 (1) + Level 2 (2) = 13.
        report = engine.state.accrueResources('P1');
        console.log("Income Report Lv2:", report);
        expect(report?.total).toBe(GameConfig.GOLD_PER_TURN_BASE + 1 + 2);

        // 3. Verify Levels 3, 4, 5
        for (let i = 3; i <= 5; i++) {
            engine.planInteraction(0, 0, 'UPGRADE_INCOME');
            engine.commitMoves();
            expect(cell.incomeLevel).toBe(i);
        }

        // Final Check at Level 5
        // Bonus total: 1+2+3+4+5 = 15
        report = engine.state.accrueResources('P1');
        const expectedTotal = GameConfig.GOLD_PER_TURN_BASE + 15;
        expect(report?.total).toBe(expectedTotal);
    });

    it('AI purchases Income Upgrade', () => {
        engine.state.players['P1'].isAI = true;
        engine.state.players['P1'].gold = 100; // Sufficient for upgrade (20)

        // Fill grid with P1 Plains to PREVENT any movement/spending
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                const cell = engine.state.grid[r][c];
                cell.type = 'plain';
                cell.owner = 'P1';
                cell.building = 'none';
                cell.isConnected = true;
            }
        }

        // Setup Base at (1,1)
        const cell = engine.state.grid[1][1];
        cell.building = 'base';
        cell.defenseLevel = 0;
        cell.incomeLevel = 0;

        // Reset state
        engine.state.currentPlayerId = 'P1';
        engine.pendingInteractions = [];

        // Spy on planInteraction
        const spy = vi.spyOn(engine, 'planInteraction');

        engine.ai.playTurn();

        // Verify AI TRIED to upgrade
        // With no valid moves (map full), AI should skip to upgrades immediately.
        expect(spy).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 'UPGRADE_INCOME');
    });

    it('UPGRADE_DEFENSE stacks amounts', () => {
        // Setup P2 as attacker
        engine.state.players['P2'].gold = 1000;
        // P2 needs connected land for distance cost to be valid (not Infinity)
        // Avoid Support Aura by placing Base far away
        engine.state.setOwner(0, 4, 'P2');
        engine.state.setBuilding(0, 4, 'base');
        engine.state.setOwner(0, 3, 'P2');
        engine.state.setOwner(0, 2, 'P2');
        engine.state.setOwner(0, 1, 'P2');

        engine.state.updateConnectivity('P2');
        engine.state.currentPlayerId = 'P2';

        // Base Cost Calculation: (Base(10) + Attack(20)) * 1.2 = 36?
        // Wait, Base Capture is 10. Attack is 20.
        // If Owned by Enemy: Cost is COST_ATTACK (20).
        // Multiplier: 1.2.
        // Total Base: 24.
        // Base Capture is 10. Attack is 20.
        // If Owned by Enemy: Cost is COST_ATTACK (20).
        // Multiplier: 1.2.
        // Total Base: 24.
        // const baseCost = engine.getMoveCost(0, 0); // Should be 24 (Unused variable removed)

        // Switch to P1 to upgrade
        engine.state.currentPlayerId = 'P1';
        engine.state.players['P1'].gold = 1000;

        // Upgrade Lv 1
        engine.planInteraction(0, 0, 'UPGRADE_DEFENSE');
        engine.commitMoves();

        // Upgrade Lv 2
        engine.planInteraction(0, 0, 'UPGRADE_DEFENSE');
        engine.commitMoves();

        // Switch to P2 to check cost
        engine.state.currentPlayerId = 'P2';
        const costLv2 = engine.getMoveCost(0, 0);

        // Expected: Base(24) + (Level 2 * Bonus 30) * Multiplier?
        // Logic check in GameEngine:
        // Logic check in GameEngine:
        // baseCost += level * UPGRADE_DEFENSE_BONUS;
        // Then Multiplier applied.
        // So: (40 + 2 * 30) * 1.2 = (40 + 60) * 1.2 = 100 * 1.2 = 120.
        // Difference: 120 - 48 = 72.
        expect(costLv2).toBeCloseTo(120, -1);
    });

    it('Income and Defense upgrades coexist', () => {
        const cell = engine.state.getCell(0, 0)!;
        engine.state.players['P1'].gold = 1000;

        // Upgrade Income twice
        engine.planInteraction(0, 0, 'UPGRADE_INCOME'); // Lv1
        engine.commitMoves();
        engine.planInteraction(0, 0, 'UPGRADE_INCOME'); // Lv2
        engine.commitMoves();

        // Upgrade Defense once
        engine.planInteraction(0, 0, 'UPGRADE_DEFENSE'); // Lv1
        engine.commitMoves();

        expect(cell.incomeLevel).toBe(2);
        expect(cell.defenseLevel).toBe(1);

        // Verify Income (Lv 2 means: Lv1(+1) + Lv2(+2) = +3 Bonus)
        const report = engine.state.accrueResources('P1');

        // Base(10) + Bonus(3) = 13. (Base Tile provides 0 Land Income).
        const expectedTotal = GameConfig.GOLD_PER_TURN_BASE + 3;
        expect(report?.total).toBe(expectedTotal);

        // Verify Defense Cost (Lv 1 is +30 pre-multiplier)
        // P2 perspective
        // P2 needs connected land, far from target (0,0)
        engine.state.setOwner(0, 4, 'P2');
        engine.state.setBuilding(0, 4, 'base');
        engine.state.setOwner(0, 3, 'P2');
        engine.state.setOwner(0, 2, 'P2');
        engine.state.setOwner(0, 1, 'P2');

        engine.state.updateConnectivity('P2');
        engine.state.currentPlayerId = 'P2';

        const cost = engine.getMoveCost(0, 0);
        // Base(40) + Bonus(30) = 70. * 1.2 = 84.
        // Normal Base: 40 * 1.2 = 48.
        expect(cost).toBe(84);
    });
});
