import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';
import { AIController } from './AIController';

describe('AIController Logic', () => {
    let engine: GameEngine;
    let ai: AIController;

    beforeEach(() => {
        engine = new GameEngine();
        // Setup P1 as AI
        engine.state.players['P1'].isAI = true;
        engine.state.currentPlayerId = 'P1';
        ai = engine.ai;

        // Clean grid
        const height = engine.state.grid.length;
        const width = height > 0 ? engine.state.grid[0].length : 0;
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                engine.state.grid[r][c].owner = null;
                engine.state.grid[r][c].building = 'none';
                engine.state.grid[r][c].isConnected = false;
                engine.state.grid[r][c].type = 'plain';
            }
        }
    });

    it('AI prioritizes Towns over Plains if affordable', () => {
        // Force Base at (5,5)
        engine.state.setOwner(5, 5, 'P1');
        engine.state.setBuilding(5, 5, 'base');
        engine.state.getCell(5, 5)!.isConnected = true;

        const townLoc = { r: 5, c: 6 };
        const plainLoc = { r: 6, c: 5 };

        // Block everything else with Water
        const gridH = engine.state.grid.length;
        const gridW = gridH > 0 ? engine.state.grid[0].length : 0;
        for (let r = 0; r < gridH; r++) {
            for (let c = 0; c < gridW; c++) {
                const isTestCell = (r === townLoc.r && c === townLoc.c) || (r === plainLoc.r && c === plainLoc.c);
                const isBase = (r === 5 && c === 5);
                if (!isTestCell && !isBase) {
                    engine.state.grid[r][c].type = 'water';
                }
            }
        }

        // Setup Targets
        engine.state.setBuilding(townLoc.r, townLoc.c, 'town');
        engine.state.grid[townLoc.r][townLoc.c].type = 'plain';
        engine.state.grid[townLoc.r][townLoc.c].owner = null;

        engine.state.setBuilding(plainLoc.r, plainLoc.c, 'none');
        engine.state.grid[plainLoc.r][plainLoc.c].type = 'plain';
        engine.state.grid[plainLoc.r][plainLoc.c].owner = null;

        // Reset moves
        engine.lastAiMoves = [];

        // Gold 50
        engine.state.players['P1'].gold = 50;

        ai.playTurn();

        // Should have captured the town
        const capturedTown = engine.state.grid[townLoc.r][townLoc.c].owner === 'P1';
        expect(capturedTown).toBe(true);
    });

    it('AI cannot bypass long-range attack distance penalty in one turn', () => {
        // P1 AI base
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');
        engine.state.getCell(0, 0)!.isConnected = true;

        // Enemy chain target at distance 3 from connected land
        engine.state.setOwner(0, 3, 'P2');
        engine.state.setOwner(0, 4, 'P2');
        engine.state.setBuilding(0, 4, 'base');
        engine.state.updateConnectivity('P2');

        // Neutral bridge cells that make the attack legal as a planned chain
        engine.state.setOwner(0, 1, null);
        engine.state.setOwner(0, 2, null);

        // Block all other options so the scenario is deterministic.
        const gridH = engine.state.grid.length;
        const gridW = gridH > 0 ? engine.state.grid[0].length : 0;
        for (let r = 0; r < gridH; r++) {
            for (let c = 0; c < gridW; c++) {
                const keep = (r === 0 && c >= 0 && c <= 4);
                if (!keep) {
                    engine.state.grid[r][c].type = 'water';
                }
            }
        }

        // 20 gold allows two neutral captures but not the long-range enemy attack.
        // Enemy at (0,3) attack cost should be heavily distance-penalized (x4 at distance 3).
        engine.state.players['P1'].gold = 20;

        ai.playTurn();

        expect(engine.state.grid[0][3].owner).toBe('P2');
    });
});
