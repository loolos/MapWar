
import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';

describe('AI Wall Logic', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();
        // Setup simple grid
        const height = engine.state.grid.length;
        const width = height > 0 ? engine.state.grid[0].length : 0;
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
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


        // Max out Base levels so AI doesn't spend on upgrades (Priority 1 & 2)
        engine.state.grid[0][0].incomeLevel = 5; // Max Income
        engine.state.grid[0][0].defenseLevel = 3; // Max Defense

        engine.state.setOwner(0, 1, 'P2');
        engine.state.grid[0][1].type = 'plain'; // Ensure buildable


        // Surround with Water to prevent cheap expansion
        engine.state.grid[1][0].type = 'water';
        engine.state.grid[1][1].type = 'water';
        engine.state.grid[0][2].type = 'plain'; // Enemy Base needs to be on plain to be valid for "Base" logic usually, or just high defense

        engine.state.setOwner(0, 2, 'P1'); // Enemy
        engine.state.setBuilding(0, 2, 'base'); // Hard target
        engine.state.grid[0][2].defenseLevel = 3; // Make it too expensive to capture (~100+)

        engine.state.updateConnectivity('P2');

        // Give AI just enough gold for Wall (10) + Reserve, but not Bridge (30) or Base Capture (100+)
        engine.state.players['P2'].gold = 25;

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

        // Max out Base levels so AI doesn't spend on upgrades (Priority 1 & 2)
        engine.state.grid[0][0].incomeLevel = 5; // Max Income
        engine.state.grid[0][0].defenseLevel = 3; // Max Defense

        engine.state.setOwner(0, 1, 'P2');
        engine.state.setBuilding(0, 1, 'wall'); // Exists
        engine.state.grid[0][1].defenseLevel = 1;

        // Surround with Water
        engine.state.grid[1][0].type = 'water';
        engine.state.grid[1][1].type = 'water';

        engine.state.setOwner(0, 2, 'P1');
        engine.state.setBuilding(0, 2, 'base');
        engine.state.grid[0][2].defenseLevel = 3;
        engine.state.grid[0][2].type = 'plain';

        engine.state.updateConnectivity('P2');
        engine.state.players['P2'].gold = 25;
        engine.state.currentPlayerId = 'P2';

        engine.ai.playTurn();

        // Expectation: Wall Upgraded
        const wallCell = engine.state.getCell(0, 1);
        expect(wallCell?.building).toBe('wall');
        expect(wallCell?.defenseLevel).toBe(2);
    });
});
