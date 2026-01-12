import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';
import { AuraSystem } from './AuraSystem';

describe('AuraSystem Logic', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();
        // Setup Grid
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                engine.state.grid[r][c].owner = null;
                engine.state.grid[r][c].building = 'none';
                engine.state.grid[r][c].watchtowerLevel = 0;
            }
        }
    });

    it('base provides support discount in range', () => {
        // P1 Base at (0,0)
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');
        engine.state.getCell(0, 0)!.defenseLevel = 0; // Base Range
        engine.state.getCell(0, 0)!.isConnected = true;

        // Target: (0,2) - Range 2 (Base Base Range is 2)
        // Attack Logic: P1 attacking Enemy or Neutral?
        // Support is for ATTACKS.
        // P1 attacking P2 at (0,2)
        engine.state.setOwner(0, 2, 'P2');

        const { discount, source } = AuraSystem.getSupportDiscount(engine.state, 0, 2, 'P1');

        expect(discount).toBe(GameConfig.BASE_SUPPORT_DISCOUNT_BASE); // 0.20
        expect(source).toBeDefined();
        expect(source!.row).toBe(0);
        expect(source!.col).toBe(0);
    });

    it('base support range scales with defense level', () => {
        // P1 Base at (0,0)
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');
        const base = engine.state.getCell(0, 0)!;
        base.isConnected = true;

        // Lv 0: Range 2. Target (0,3) is Dist 3. No Support.
        let result = AuraSystem.getSupportDiscount(engine.state, 0, 3, 'P1');
        expect(result.discount).toBe(0);

        // Upgrade Base to Lv 1 -> Range 3
        base.defenseLevel = 1;
        result = AuraSystem.getSupportDiscount(engine.state, 0, 3, 'P1');
        expect(result.discount).toBeGreaterThan(0);
        // Bonus Discount: Base 0.20 + (1 * 0.05) = 0.25
        expect(result.discount).toBe(0.25);
    });

    it('watchtower provides support discount', () => {
        // P1 Tower at (5,5)
        engine.state.setOwner(5, 5, 'P1');
        engine.state.setBuilding(5, 5, 'wall');
        const tower = engine.state.getCell(5, 5)!;
        tower.watchtowerLevel = 1; // Range 2
        tower.defenseLevel = 1; // Wall Lv 1
        tower.isConnected = true;

        // Target (5,7) - Dist 2.
        engine.state.setOwner(5, 7, 'P2');

        const result = AuraSystem.getSupportDiscount(engine.state, 5, 7, 'P1');
        expect(result.discount).toBe(0.20); // Base Watchtower discount
    });

    it('chooses best discount from multiple sources', () => {
        // P1 Base at (0,0) - Lv 0 (20%)
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');
        engine.state.getCell(0, 0)!.isConnected = true;

        // P1 Tower at (0,4) - Lv 2 (Range 3), High Wall Lv 3 (Bonus: 20 + 2*5 = 30%)
        engine.state.setOwner(0, 4, 'P1');
        engine.state.setBuilding(0, 4, 'wall');
        const tower = engine.state.getCell(0, 4)!;
        tower.watchtowerLevel = 2; // Range 3
        tower.defenseLevel = 3;
        tower.isConnected = true;

        // Target (0,2). 
        // Dist to Base(0,0): 2 (In Range 2) -> 20%
        // Dist to Tower(0,4): 2 (In Range 3) -> 30%

        engine.state.setOwner(0, 2, 'P2');

        const result = AuraSystem.getSupportDiscount(engine.state, 0, 2, 'P1');
        expect(result.discount).toBeCloseTo(0.30, 5);
        expect(result.source).toBe(tower);
    });

    it('verifies rhombus shape (Manhattan distance)', () => {
        // P1 Tower at (2,2) with Level 1 (Range 2)
        // Range 2 Manhattan:
        // (2,0), (2,4), (0,2), (4,2) are edge 2.
        // (1,1) is dist abs(1-2)+abs(1-2) = 1+1=2. (In Range)
        // (0,0) is dist abs(0-2)+abs(0-2) = 2+2=4. (Out of Range of 2)
        // Note: Chebyshev would say (0,0) is dist 2.

        engine.state.setOwner(2, 2, 'P1');
        engine.state.setBuilding(2, 2, 'wall');
        const tower = engine.state.getCell(2, 2)!;
        tower.watchtowerLevel = 1; // Range 2
        tower.isConnected = true;

        // Target (1,1) -> Dist 2. Should be in range.
        const inRange = AuraSystem.getSupportDiscount(engine.state, 1, 1, 'P1');
        expect(inRange.discount).toBeGreaterThan(0);

        // Target (0,0) -> Dist 4. Should be OUT of range (Manhattan). 
        // If calculation was Chebyshev, this would be in range.
        const outRange = AuraSystem.getSupportDiscount(engine.state, 0, 0, 'P1');
        expect(outRange.discount).toBe(0);
    });

    it('calculates income aura range based on income level', () => {
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');
        const base = engine.state.getCell(0, 0)!;

        // Lv 0: Range 0
        expect(AuraSystem.getIncomeAuraRange(base)).toBe(0);

        // Lv 3: Range 3
        base.incomeLevel = 3;
        expect(AuraSystem.getIncomeAuraRange(base)).toBe(3);

        engine.state.setBuilding(0, 0, 'wall');
        expect(AuraSystem.getIncomeAuraRange(base)).toBe(0);
    });

    it('verifies isInIncomeAura logic', () => {
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');
        const base = engine.state.getCell(0, 0)!;
        base.incomeLevel = 1; // Range 1

        // (0,1) is Dist 1 -> In Range
        expect(AuraSystem.isInIncomeAura(engine.state, 0, 1, 'P1')).toBe(true);
        // (1,1) is Dist 2 -> Out of Range 1
        expect(AuraSystem.isInIncomeAura(engine.state, 1, 1, 'P1')).toBe(false);
        // (0,0) is Source -> Should return false (dist > 0)
        expect(AuraSystem.isInIncomeAura(engine.state, 0, 0, 'P1')).toBe(false);
    });
});
