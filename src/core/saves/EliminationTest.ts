import { GameConfig } from '../GameConfig';
import type { SaveScenario } from './SaveRegistry';

export const EliminationTest: SaveScenario = {
    name: "Elimination & Connectivity",
    description: "Testing elimination rules. P2 is already dead (disconnected). P3 is about to die.",
    getData: () => {
        const width = 10;
        const height = 10;

        // Players
        const p1 = { id: 'P1', color: GameConfig.COLORS.P1, gold: 1000, isAI: false };
        const p2 = { id: 'P2', color: GameConfig.COLORS.P2, gold: 0, isAI: true }; // Eliminated
        const p3 = { id: 'P3', color: GameConfig.COLORS.P3, gold: 50, isAI: true }; // Critical
        const p4 = { id: 'P4', color: GameConfig.COLORS.P4, gold: 100, isAI: true }; // Observer

        // Turn Order: P2 is REMOVED from order if eliminated.
        // So order is P1, P3, P4.
        const playerOrder = ['P1', 'P3', 'P4'];

        const grid: any[][] = [];
        for (let r = 0; r < height; r++) {
            const row: any[] = [];
            for (let c = 0; c < width; c++) {
                let owner = null;
                let building = 'none';
                let isConnected = false;
                let type = 'plain';

                // --- Center Ocean (Event Test) ---
                if ((r === 4 && (c >= 4 && c <= 6)) || (r === 5 && (c >= 4 && c <= 6))) {
                    type = 'water';
                }

                // --- P1 (Strong) ---
                // Top Left Block (0,0 to 3,3)
                if (r <= 3 && c <= 3) {
                    owner = 'P1';
                    isConnected = true;
                    if (r === 0 && c === 0) building = 'base';
                }

                // --- P2 (Eliminated) ---
                // Cluster at Top Right (0,7 to 2,9)
                // NO BASE. DISCONNECTED.
                if (r <= 2 && c >= 7) {
                    owner = 'P2';
                    isConnected = false; // Dead player cells are disconnected
                    building = 'none'; // Base destroyed
                }

                // --- P3 (Critical) ---
                // Bottom Left (8,0). Base is at 9,0.
                if (r >= 8 && c === 0) {
                    owner = 'P3';
                    isConnected = true;
                    if (r === 9 && c === 0) building = 'base';
                }

                // --- P1 Threatening P3 ---
                // P1 owns (8,1) - Right next to P3 non-base tile
                // And P1 owns (9,1) - Right next to P3 BASE
                if ((r === 8 && c === 1) || (r === 9 && c === 1)) {
                    owner = 'P1';
                    isConnected = true;
                }

                // --- P4 (Observer) ---
                // Bottom Right Base
                if (r === 9 && c === 9) {
                    owner = 'P4';
                    isConnected = true;
                    building = 'base';
                }

                row.push({
                    row: r, col: c,
                    owner, building, isConnected, type
                });
            }
            grid.push(row);
        }

        return JSON.stringify({
            players: { 'P1': p1, 'P2': p2, 'P3': p3, 'P4': p4 },
            playerOrder: playerOrder,
            turnCount: 10,
            currentPlayerId: 'P1',
            events: {
                forced: [
                    {
                        round: 13,
                        event: {
                            id: 'flood',
                            name: 'Flood',
                            message: 'Flood waters rise across the land.',
                            sfxKey: 'sfx:turn_event_flood'
                        }
                    }
                ]
            },
            grid: grid
        });
    }
};
