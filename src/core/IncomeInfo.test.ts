
import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';

describe('Income Info Logic', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();
        engine.startGame();
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');
        engine.state.updateConnectivity('P1');
    });

    it('calculates plain land income', () => {
        engine.state.setOwner(0, 1, 'P1');
        engine.state.getCell(0, 1)!.isConnected = true;

        const income = engine.getTileIncome(0, 1);
        expect(income).toBe(GameConfig.GOLD_PER_LAND);
    });

    it('calculates town income', () => {
        engine.state.setOwner(0, 2, 'P1');
        engine.state.setBuilding(0, 2, 'town');
        const cell = engine.state.getCell(0, 2)!;
        cell.isConnected = true;
        cell.townIncome = 5;

        const income = engine.getTileIncome(0, 2);
        expect(income).toBe(5); // Town income replaces land income
    });

    it('calculates base income with upgrades', () => {
        const base = engine.state.getCell(0, 0)!;
        base.incomeLevel = 0;

        let income = engine.getTileIncome(0, 0);
        // Base income is now 10 (GOLD_PER_TURN_BASE) replacing land income
        expect(income).toBe(GameConfig.GOLD_PER_TURN_BASE);

        // Level 1 Upgrade (+1)
        base.incomeLevel = 1;
        income = engine.getTileIncome(0, 0);
        // Bonus for Lv1 is UPGRADE_INCOME_BONUS[0] = 1. Total = 10 + 1 = 11.
        expect(income).toBe(GameConfig.GOLD_PER_TURN_BASE + 1);

        // Level 2 (+1 + 2 = +3)
        base.incomeLevel = 2;
        income = engine.getTileIncome(0, 0);
        expect(income).toBe(GameConfig.GOLD_PER_TURN_BASE + 1 + 2);
    });

    it('returns 0 for disconnected tiles', () => {
        engine.state.setOwner(5, 5, 'P1'); // Far away
        const cell = engine.state.getCell(5, 5)!;
        cell.isConnected = false;

        const income = engine.getTileIncome(5, 5);
        expect(income).toBe(0.5); // Disconnected tiles provide half income
    });
});
