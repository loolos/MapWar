
import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';
import { AIController } from './AIController';
import { GameConfig } from './GameConfig';

describe('AI Watchtower Logic', () => {
    let engine: GameEngine;
    let ai: AIController;

    beforeEach(() => {
        engine = new GameEngine();
        // Clean grid
        const height = engine.state.grid.length;
        const width = height > 0 ? engine.state.grid[0].length : 0;
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                engine.state.grid[r][c].owner = null;
                engine.state.grid[r][c].building = 'none';
                engine.state.grid[r][c].isConnected = false;
                engine.state.grid[r][c].type = 'plain';
                engine.state.grid[r][c].watchtowerLevel = 0;
            }
        }
        ai = new AIController(engine);

        // Setup AI Player P2
        engine.state.players['P2'].isAI = true;
        // Gold set in tests
        engine.state.currentPlayerId = 'P2';
    });

    it('builds watchtower on threatened wall if rich', () => {
        // [FIXED] "Ghost Gold Drain" resolved by strictly blocking AI expansion using Hostile Bases.
        // P2 Base at (5,5) - Out of Aura Range
        engine.state.setOwner(5, 5, 'P2');
        engine.state.setBuilding(5, 5, 'base');
        const base = engine.state.getCell(5, 5)!;
        base.incomeLevel = GameConfig.UPGRADE_INCOME_MAX;
        base.defenseLevel = GameConfig.UPGRADE_DEFENSE_MAX;

        // Surround Base with MAX LEVEL WALLS to block EVERYTHING
        // - Cannot Move (Owned)
        // - Cannot Build Wall (Already Built)
        // - Cannot Upgrade Wall (Max Level)
        const neighbors = [{ r: 4, c: 5 }, { r: 6, c: 5 }, { r: 5, c: 4 }, { r: 5, c: 6 }];
        neighbors.forEach(n => {
            engine.state.setOwner(n.r, n.c, 'P1');
            engine.state.setBuilding(n.r, n.c, 'base');
            engine.state.getCell(n.r, n.c)!.defenseLevel = 3;
            engine.state.getCell(n.r, n.c)!.isConnected = true;
        });

        // Wall at (0,1) owned by P2
        engine.state.setOwner(0, 1, 'P2');
        engine.state.setBuilding(0, 1, 'wall');
        engine.state.getCell(0, 1)!.defenseLevel = GameConfig.UPGRADE_WALL_MAX;
        engine.state.getCell(0, 1)!.isConnected = true;

        // Also surround (0,1) to prevent expansion from there
        const wallNeighbors = [{ r: 0, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 0 }];
        wallNeighbors.forEach(n => {
            if (engine.isValidCell(n.r, n.c)) {
                engine.state.setOwner(n.r, n.c, 'P1');
                engine.state.setBuilding(n.r, n.c, 'base');
                engine.state.getCell(n.r, n.c)!.defenseLevel = 3;
                engine.state.getCell(n.r, n.c)!.isConnected = true;
            }
        });

        // Enemy at (0,2)
        // Make enemy Strong (BASE Lv 3) so Cost is PROHIBITIVE even with Aura Discount
        // Base Def Bonus 30 * 3 = 90. Attack 20 + 90 = 110. * 1.2 = 132.
        // Discount 20% -> 105.6. 
        // 80 < 105. Safe from attack.
        engine.state.setOwner(0, 2, 'P1');
        engine.state.setBuilding(0, 2, 'base');
        engine.state.getCell(0, 2)!.defenseLevel = 3;
        engine.state.getCell(0, 2)!.isConnected = true;

        // Gold 80.
        // Priority 1 (Inc): 20. Rem 60.
        // Priority 2 (Def): 10. Rem 50.
        // Priority 3 (Build Tower): 20. Need 40. 
        // 50 >= 40. Success.
        engine.state.players['P2'].gold = 80;

        // Run AI
        ai.playTurn();

        // Check Logic
        const cell = engine.state.getCell(0, 1)!;
        expect(cell.watchtowerLevel).toBe(1);
    });

    it('upgrades watchtower if extra gold available', () => {
        // [FIXED] AI now prioritizes upgrades correctly when expansion is blocked.
        // P2 Base at (5,5)
        engine.state.setOwner(5, 5, 'P2');
        engine.state.setBuilding(5, 5, 'base');
        const base = engine.state.getCell(5, 5)!;
        base.incomeLevel = GameConfig.UPGRADE_INCOME_MAX;
        base.defenseLevel = GameConfig.UPGRADE_DEFENSE_MAX;

        // Surround Base with MAX LEVEL HOSTILE BASES to block EVERYTHING
        const neighbors = [{ r: 4, c: 5 }, { r: 6, c: 5 }, { r: 5, c: 4 }, { r: 5, c: 6 }];
        neighbors.forEach(n => {
            engine.state.setOwner(n.r, n.c, 'P1');
            engine.state.setBuilding(n.r, n.c, 'base');
            engine.state.getCell(n.r, n.c)!.defenseLevel = 3;
            engine.state.getCell(n.r, n.c)!.isConnected = true;
        });

        // Watchtower Lv 1 at (0,1)
        engine.state.setOwner(0, 1, 'P2');
        engine.state.setBuilding(0, 1, 'wall');
        const cell = engine.state.getCell(0, 1)!;
        cell.watchtowerLevel = 1;
        cell.defenseLevel = GameConfig.UPGRADE_WALL_MAX;
        cell.isConnected = true;

        // Also surround (0,1) with Hostile Bases
        const wallNeighbors = [{ r: 0, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 0 }];
        wallNeighbors.forEach(n => {
            if (engine.isValidCell(n.r, n.c)) {
                engine.state.setOwner(n.r, n.c, 'P1');
                engine.state.setBuilding(n.r, n.c, 'base');
                engine.state.getCell(n.r, n.c)!.defenseLevel = 3;
                engine.state.getCell(n.r, n.c)!.isConnected = true;
            }
        });

        // Enemy at (0,2)
        // Make enemy Strong (BASE Lv 3) so AI attacks don't capture it immediately
        engine.state.setOwner(0, 2, 'P1');
        engine.state.setBuilding(0, 2, 'base');
        engine.state.getCell(0, 2)!.defenseLevel = 3;
        engine.state.getCell(0, 2)!.isConnected = true;

        // Gold 80.
        // Inc 20 (Rem 60). Def 10 (Rem 50).
        // Upgrade Tower (Cost 20 + Buffer 30 = 50).
        // 50 >= 50. Success.
        engine.state.players['P2'].gold = 80;

        ai.playTurn();

        // Expect Upgrade
        expect(cell.watchtowerLevel).toBeGreaterThan(1);
    });
});
