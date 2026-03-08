import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';
import { Cell } from './Cell';

describe('Farm Logic', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine([], 'default', () => 0.5);
        engine.state.players['P2'].isAI = false;
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
        engine.endTurn();

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
        engine.endTurn();

        // Upgrade to Lv 2
        engine.endTurn();
        engine.planInteraction(0, 1, 'UPGRADE_FARM');
        engine.endTurn();

        const cell = engine.state.getCell(0, 1) as Cell;
        expect(cell.farmLevel).toBe(2);

        // Base Income Lv 2 = 4 gold.
        // With Aura (30%) = 4 * 1.3 = 5.2.
        const income = engine.state.getTileIncome(0, 1);
        expect(income).toBeCloseTo(5.2, 5);
    });


    it('awards farm capture loot with deterministic variance at end of attacker turn', () => {
        const logs: string[] = [];
        engine.on('logMessage', (event) => logs.push(event.text));

        engine.state.setOwner(0, 1, 'P1');
        engine.state.setBuilding(0, 1, 'farm');
        const target = engine.state.getCell(0, 1)!;
        target.farmLevel = 3;

        // End P1 turn so P2 can attack.
        engine.endTurn();

        engine.state.players['P2'].gold = 200;
        engine.state.setOwner(0, 2, 'P2');
        engine.state.setBuilding(0, 2, 'base');

        const attackCost = engine.getMoveCost(0, 1);
        engine.togglePlan(0, 1);
        engine.endTurn();

        expect(engine.state.players['P2'].gold).toBe(200 - attackCost + 30);
        expect(logs.some(msg => msg.includes('captured 1 enemy farm and plundered 30G.'))).toBe(true);
    });

    it('settles farm capture loot only when attacker turn ends (not during commit)', () => {
        engine.state.setOwner(0, 1, 'P1');
        engine.state.setBuilding(0, 1, 'farm');
        const target = engine.state.getCell(0, 1)!;
        target.farmLevel = 2;

        // End P1 turn so P2 can attack.
        engine.endTurn();

        engine.state.players['P2'].gold = 200;
        engine.state.setOwner(0, 2, 'P2');
        engine.state.setBuilding(0, 2, 'base');

        const attackCost = engine.getMoveCost(0, 1);
        engine.togglePlan(0, 1);
        engine.commitActions();

        // Loot has not settled yet.
        expect(engine.state.players['P2'].gold).toBe(200 - attackCost);

        (engine as any).advanceTurn();

        expect(engine.state.players['P2'].gold).toBe(200 - attackCost + 20);
    });

    it('applies ±10% loot variance for farm capture', () => {
        const runCapture = (randomValue: number) => {
            const local = new GameEngine([], 'default', () => randomValue);
            local.state.players['P2'].isAI = false;
            local.startGame();
            local.state.setOwner(0, 0, 'P1');
            local.state.setBuilding(0, 0, 'base');
            local.state.currentPlayerId = 'P1';

            local.state.setOwner(0, 1, 'P1');
            local.state.setBuilding(0, 1, 'farm');
            local.state.getCell(0, 1)!.farmLevel = 3;

            local.endTurn();
            local.state.players['P2'].gold = 200;
            local.state.setOwner(0, 2, 'P2');
            local.state.setBuilding(0, 2, 'base');

            const attackCost = local.getMoveCost(0, 1);
            local.togglePlan(0, 1);
            local.endTurn();
            return local.state.players['P2'].gold - (200 - attackCost);
        };

        expect(runCapture(0)).toBe(27);
        expect(runCapture(1)).toBe(33);
    });

    it('destroys farm on capture', () => {
        engine.state.setOwner(0, 1, 'P1');
        engine.state.setBuilding(0, 1, 'none'); // Ensure clean slate (no random towns)
        engine.planInteraction(0, 1, 'BUILD_FARM');
        engine.endTurn();

        // P2 Captures
        engine.state.players['P2'].gold = 100;

        // P2 is at (0,2)
        engine.state.setOwner(0, 2, 'P2');
        engine.state.setBuilding(0, 2, 'base'); // Connected

        engine.togglePlan(0, 1); // Attack
        engine.endTurn();

        const cell = engine.state.getCell(0, 1) as Cell;
        expect(cell.owner).toBe('P2');
        expect(cell.building).toBe('none'); // Destroyed
        expect(cell.farmLevel).toBe(0);
    });
});
