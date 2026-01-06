
import { GameConfig } from '../GameConfig';

export const LargeMap = {
    name: "Large Map (40x40)",
    description: "Stress test with 40x40 grid.",
    getData: () => {
        const width = 40;
        const height = 40;

        // P1
        const p1 = {
            id: 'P1',
            color: GameConfig.COLORS.P1,
            gold: 1000,
            income: 50,
            isAI: false
        };

        // P2
        const p2 = {
            id: 'P2',
            color: GameConfig.COLORS.P2,
            gold: 1000,
            income: 50,
            isAI: true
        };

        const grid: any[][] = [];
        for (let r = 0; r < height; r++) {
            const row: any[] = [];
            for (let c = 0; c < width; c++) {
                let type = 'plain';
                let owner = null;
                let building = 'none';

                if (Math.random() < 0.1) type = 'water';
                else if (Math.random() < 0.1) type = 'hill';

                if (r === 0 && c === 0) { owner = 'P1'; building = 'base'; }
                if (r === height - 1 && c === width - 1) { owner = 'P2'; building = 'base'; }

                row.push({
                    row: r,
                    col: c,
                    owner: owner,
                    building: building,
                    isConnected: !!owner,
                    type: type
                });
            }
            grid.push(row);
        }

        return JSON.stringify({
            players: { 'P1': p1, 'P2': p2 },
            turnCount: 1,
            currentPlayerId: 'P1',
            grid: grid
        });
    }
};
