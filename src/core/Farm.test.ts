import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';
import { Cell } from './Cell';

describe('Farm Logic', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();
        engine.startGame();
        // P1 Base at 0,0
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');
        engine.state.getCell(0, 0)!.incomeLevel = 1; // Lv 1 Income Aura (Radius 1)
        engine.state.players['P1'].gold = 100;
        engine.state.currentPlayerId = 'P1';
        engine.state.setBuilding(0, 0, 'base');
        engine.state.updateConnectivity('P1');

        // Ensure (0,1) is a plain empty tile for testing
        const testCell = engine.state.getCell(0, 1)!;
        testCell.type = 'plain';
        testCell.building = 'none';
        testCell.owner = null;
    });

    it('allows building farm only in income aura', () => {
        // (0,1) is adjacent, within range 1.
        engine.state.setOwner(0, 1, 'P1');

        // (0,2) is range 2. Outside aura.
        engine.state.setOwner(0, 2, 'P1');

        // Check availability
        const actionReg = engine.interactionRegistry;
        const buildFarm = actionReg.get('BUILD_FARM');

        expect(buildFarm?.isAvailable(engine, 0, 1)).toBe(true);
        expect(buildFarm?.isAvailable(engine, 0, 2)).toBe(false);
    });

    it('builds farm and calculates income correctly', () => {
        engine.state.setOwner(0, 1, 'P1');
        engine.planInteraction(0, 1, 'BUILD_FARM');
        engine.commitMoves();

        const cell = engine.state.getCell(0, 1) as Cell;
        expect(cell.building).toBe('farm');
        expect(cell.farmLevel).toBe(1);

        // Verify Income
        // Farm Lv 1 = 2 gold. + Aura (Level 1 Base @ Dist 1 = 30%) = 2 * 1.3 = 2.6.
        const income = engine.getTileIncome(0, 1);
        expect(income).toBeCloseTo(2.6, 5);

        // Verify Aura Bonus (Base + Farm in aura?)
        const incomeWithAura = engine.state.getTileIncome(0, 1);
        expect(incomeWithAura).toBeCloseTo(2.6, 5);
    });

    it('upgrades farm and increases income', () => {
        engine.state.setOwner(0, 1, 'P1');
        // Build
        engine.planInteraction(0, 1, 'BUILD_FARM');
        engine.commitMoves();

        // Upgrade to Lv 2
        engine.planInteraction(0, 1, 'UPGRADE_FARM');
        engine.commitMoves();

        const cell = engine.state.getCell(0, 1) as Cell;
        expect(cell.farmLevel).toBe(2);

        // Base Income Lv 2 = 4 gold.
        // With Aura (30%) = 4 * 1.3 = 5.2.
        const income = engine.state.getTileIncome(0, 1);
        expect(income).toBeCloseTo(5.2, 5);
    });

    it('destroys farm on capture', () => {
        engine.state.setOwner(0, 1, 'P1');
        engine.state.setBuilding(0, 1, 'none'); // Ensure clean slate (no random towns)
        engine.planInteraction(0, 1, 'BUILD_FARM');
        engine.commitMoves();

        // P2 Captures
        engine.state.currentPlayerId = 'P2';
        engine.state.players['P2'].gold = 100;

        // P2 is at (0,2)
        engine.state.setOwner(0, 2, 'P2');
        engine.state.setBuilding(0, 2, 'base'); // Connected

        engine.togglePlan(0, 1); // Attack
        engine.commitMoves();

        const cell = engine.state.getCell(0, 1) as Cell;
        expect(cell.owner).toBe('P2');
        expect(cell.building).toBe('none'); // Destroyed
        expect(cell.farmLevel).toBe(0);
    });
});
