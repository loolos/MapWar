
import { GameConfig } from '../GameConfig';

export const NearVictory = {
    name: "Near Victory",
    description: "P1 dominates, separated from P2 base by water.",
    getData: () => {
        // Create a 10x10 grid for simplicity
        const width = 10;
        const height = 10;

        // P1
        const p1 = {
            id: 'P1',
            color: GameConfig.COLORS.P1,
            gold: 9999, // Very Rich for testing layout
            income: 500, // Placeholder, game will recalculate? Or visual only? 
            // GameEngine usually recalculates on load, but let's set high.
            isAI: false
        };

        // P2
        const p2 = {
            id: 'P2',
            color: GameConfig.COLORS.P2,
            gold: 10, // Poor
            income: 10,
            isAI: true
        };

        // Grid
        const grid: any[][] = [];
        for (let r = 0; r < height; r++) {
            const row: any[] = [];
            for (let c = 0; c < width; c++) {
                // Default Plain
                let type = 'plain';
                let owner = null;
                let building = 'none';

                // P1 Base at 0,0
                if (r === 0 && c === 0) {
                    owner = 'P1';
                    building = 'base';
                }

                // P2 Base at 9,9
                else if (r === 9 && c === 9) {
                    owner = 'P2';
                    building = 'base';
                }

                // Scenario: P1 owns nearly everything up to P2
                // Let's say P1 owns rows 0-7
                // And fill with Level 3 Farms for massive income
                else if (r < 8) {
                    owner = 'P1';
                    building = 'farm_lv3';
                }

                // Create a "Bridge Testing" scenario
                // Row 8 is Water. Row 7 is P1 owned Plain.
                // Row 9 is P2.
                if (r === 8) {
                    type = 'water';
                    owner = null; // Unowned water
                    building = 'none';
                }

                // Set Cell
                row.push({
                    row: r,
                    col: c,
                    owner: owner,
                    building: building,
                    isConnected: !!owner, // Simplified connectivity
                    type: type
                });
            }
            grid.push(row);
        }

        return JSON.stringify({
            players: { 'P1': p1, 'P2': p2 },
            turnCount: 25,
            currentPlayerId: 'P1',
            grid: grid
        });
    }
};
