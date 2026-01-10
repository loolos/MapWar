
import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';

describe.skip('AI Wall Logic', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();
        // Setup simple grid
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                engine.state.grid[r][c].owner = null;
                engine.state.grid[r][c].building = 'none';
                engine.state.grid[r][c].type = 'plain';
            }
        }
        // AI Player setup
        engine.state.players['P2'].isAI = true;
    });

    it('AI builds wall on threatened border when has excess gold', () => {
        // Setup:
        // P2 (AI) at (0,0) - Base (Connected)
        // P2 at (0,1) - Plain (Front Line)
        // P1 (Enemy) at (0,2) - Base/Water (Threat)

        engine.state.setOwner(0, 0, 'P2');
        engine.state.setBuilding(0, 0, 'base');

        engine.state.setOwner(0, 1, 'P2');
        engine.state.grid[0][1].type = 'plain'; // Ensure buildable

        engine.state.setOwner(0, 2, 'P1'); // Enemy
        engine.state.grid[0][2].type = 'water'; // Uncapturable threat

        engine.state.updateConnectivity('P2');

        // Give AI lots of gold (enough for Income upgrade + Wall + Expansion)
        engine.state.players['P2'].gold = 1000;

        // Set Turn to P2
        engine.state.currentPlayerId = 'P2';

        // Execute AI Turn
        engine.ai.playTurn();

        // Expectation:
        // (0,1) should have a Wall
        const wallCell = engine.state.getCell(0, 1);
        expect(wallCell?.building).toBe('wall');
        expect(wallCell?.defenseLevel).toBe(1);
    });

    it('AI upgrades wall on threatened border', () => {
        // Setup: P2 (AI) has Wall at (0,1), Enemy at (0,2)
        engine.state.setOwner(0, 0, 'P2');
        engine.state.setBuilding(0, 0, 'base');

        engine.state.setOwner(0, 1, 'P2');
        engine.state.setBuilding(0, 1, 'wall'); // Exists
        engine.state.grid[0][1].defenseLevel = 1;

        engine.state.setOwner(0, 2, 'P1');
        engine.state.grid[0][2].type = 'water'; // Uncapturable threat

        engine.state.updateConnectivity('P2');
        engine.state.players['P2'].gold = 1000;
        engine.state.currentPlayerId = 'P2';

        engine.ai.playTurn();

        // Expectation: Wall Upgraded
        const wallCell = engine.state.getCell(0, 1);
        expect(wallCell?.building).toBe('wall');
        expect(wallCell?.defenseLevel).toBe(2);
    });
});
