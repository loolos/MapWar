
import { Cell } from '../Cell';
import { GameConfig } from '../GameConfig';
import { GameState } from '../GameState';
import { MapGenerator } from '../map/MapGenerator';

export const GoldRushPreset = {
    name: 'Gold Rush (Debug)',
    description: 'High hill density and 1000 gold start for testing mines.',
    getData: (): string => {
        // Create a temporary GameState to leverage generation logic
        // We can manually construct a state or just use MapGenerator on a dummy grid

        const width = 15;
        const height = 15;
        const grid: Cell[][] = [];
        for (let r = 0; r < height; r++) {
            grid[r] = [];
            for (let c = 0; c < width; c++) {
                grid[r][c] = new Cell(r, c);
                grid[r][c].type = 'plain';
            }
        }

        // Custom Generation Logic (Inline from removed MapGenerator method)
        // 1. Hills (60%)
        const hillClusters = 12;
        // Helper to mimic MapGenerator.growCluster
        const growInfo = (type: 'hill' | 'water', size: number) => {
            const r = Math.floor(Math.random() * (height - 2)) + 1;
            const c = Math.floor(Math.random() * (width - 2)) + 1;

            let currentSize = 0;
            const queue: { r: number, c: number }[] = [{ r, c }];
            const visited = new Set<string>();

            while (currentSize < size && queue.length > 0) {
                const index = Math.floor(Math.random() * queue.length);
                const curr = queue.splice(index, 1)[0];
                const key = `${curr.r},${curr.c}`;
                if (visited.has(key)) continue;
                visited.add(key);

                if (curr.r >= 0 && curr.r < height && curr.c >= 0 && curr.c < width) {
                    grid[curr.r][curr.c].type = type;
                    currentSize++;
                    queue.push({ r: curr.r + 1, c: curr.c });
                    queue.push({ r: curr.r - 1, c: curr.c });
                    queue.push({ r: curr.r, c: curr.c + 1 });
                    queue.push({ r: curr.r, c: curr.c - 1 });
                }
            }
        };

        for (let i = 0; i < hillClusters; i++) growInfo('hill', 8);

        // Scatter
        grid.forEach(row => row.forEach(c => {
            if (c.type === 'plain' && Math.random() < 0.3) c.type = 'hill';
        }));


        // Create State Object
        const state = {
            grid: grid.map(row => row.map(c => c.serialize())),
            players: {
                'P1': { id: 'P1', color: 0x3333ff, gold: 1000, isAI: false }, // 1000 Gold!
                'P2': { id: 'P2', color: 0xff3333, gold: 1000, isAI: true }
            },
            playerOrder: ['P1', 'P2'],
            currentPlayerId: 'P1',
            turnCount: 1,
            currentMapType: 'default'
        };

        // Bases
        // P1 Top Left
        state.grid[2][2].owner = 'P1';
        state.grid[2][2].building = 'base';
        state.grid[2][2].type = 'plain';

        // P2 Bottom Right
        state.grid[height - 3][width - 3].owner = 'P2';
        state.grid[height - 3][width - 3].building = 'base';
        state.grid[height - 3][width - 3].type = 'plain';

        return JSON.stringify(state);
    }
};
