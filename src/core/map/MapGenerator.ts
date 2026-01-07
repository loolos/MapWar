import { Cell } from '../Cell';
import { GameConfig } from '../GameConfig';

export type MapType = 'default' | 'archipelago' | 'pangaea' | 'mountains' | 'rivers';

export class MapGenerator {
    static generate(grid: Cell[][], type: MapType, width: number, height: number, playerCount: number = 2) {
        // Reset to default state
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                grid[r][c].type = 'plain';
                grid[r][c].building = 'none';
                grid[r][c].owner = null;
            }
        }

        switch (type) {
            case 'archipelago':
                this.generateArchipelago(grid, width, height, playerCount);
                break;
            case 'pangaea':
                this.generatePangaea(grid, width, height);
                break;
            case 'mountains':
                this.generateMountains(grid, width, height);
                break;
            case 'rivers':
                this.generateRivers(grid, width, height);
                break;
            case 'default':
            default:
                this.generateDefault(grid, width, height);
                break;
        }

        // Post-Processing: Distribute Towns
        this.distributeTowns(grid, width, height);

        // Post-Processing: Ensure Spawn Accessibility
        this.ensureAccessibility(grid, width, height, playerCount);
    }

    private static getSpawnPoint(index: number, total: number, width: number, height: number): { r: number, c: number } {
        const margin = 2;
        const boundedW = width - 2 * margin;
        const boundedH = height - 2 * margin;

        // Angle fraction matching GameState.setupBases
        const angle = (index / total) * 2 * Math.PI - (Math.PI / 2);
        // Start offset matching setupBases (-3*PI/4)
        const startOffset = -3 * Math.PI / 4;
        const finalAngle = angle + startOffset;

        const cx = width / 2;
        const cy = height / 2;

        let r = Math.round(cy + (boundedH / 2) * Math.sin(finalAngle));
        let c = Math.round(cx + (boundedW / 2) * Math.cos(finalAngle));

        r = Math.max(0, Math.min(height - 1, r));
        c = Math.max(0, Math.min(width - 1, c));

        return { r, c };
    }

    private static generateDefault(grid: Cell[][], width: number, height: number) {
        const area = width * height;
        const scaleFactor = area / 100;

        // ~2% Water Clusters
        const waterClusters = Math.max(2, Math.floor(2 * scaleFactor));
        for (let i = 0; i < waterClusters; i++) this.growCluster(grid, 'water', 6);

        // ~3% Hill Clusters
        const hillClusters = Math.max(3, Math.floor(3 * scaleFactor));
        for (let i = 0; i < hillClusters; i++) this.growCluster(grid, 'hill', 5);
    }

    private static generateArchipelago(grid: Cell[][], width: number, height: number, playerCount: number) {
        // Start with WATER
        this.fillGrid(grid, 'water');

        // Create Random Islands
        const area = width * height;
        const islandCount = Math.max(4, Math.floor(area / 25)); // Lots of small islands

        for (let i = 0; i < islandCount; i++) {
            // Random seed
            const r = Math.floor(Math.random() * height);
            const c = Math.floor(Math.random() * width);
            // Grow Island (Plain)
            this.growClusterAt(grid, r, c, 'plain', Math.floor(Math.random() * 5) + 3, 'water');
        }

        // GUARANTEE: Starting Islands for Each Player using exact spawn logic
        for (let i = 0; i < playerCount; i++) {
            const spawn = this.getSpawnPoint(i, playerCount, width, height);
            // Ensure island at spawn (Size 15 is substantial)
            this.growClusterAt(grid, spawn.r, spawn.c, 'plain', 15, 'water');
        }

        // Add some hills on islands
        this.scatterTerrain(grid, 'hill', 0.2, 'plain'); // 20% of plains become hills
    }

    private static generatePangaea(grid: Cell[][], width: number, height: number) {
        // Start with WATER
        this.fillGrid(grid, 'water');

        // Single Large Landmass
        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);

        // Grow massive cluster
        const targetLand = Math.floor(width * height * 0.6); // 60% land
        this.growClusterAt(grid, centerY, centerX, 'plain', targetLand, 'water');

        // Add Hills
        this.scatterTerrain(grid, 'hill', 0.15, 'plain');
    }

    private static generateMountains(grid: Cell[][], width: number, height: number) {
        // Default land gen
        this.generateDefault(grid, width, height);

        // Heavy Hills
        // Add ranges? Or just high density scatter?
        // Let's do clusters of hills to form ranges
        const rangeCount = Math.max(3, Math.floor(width * height / 40));
        for (let i = 0; i < rangeCount; i++) {
            this.growCluster(grid, 'hill', 8);
        }

        // Scatter more
        this.scatterTerrain(grid, 'hill', 0.2, 'plain');
    }

    private static generateRivers(grid: Cell[][], width: number, height: number) {
        this.generateDefault(grid, width, height);

        // Create Rivers
        const riverCount = Math.max(1, Math.floor(width / 6)); // Fewer rivers to avoid mess

        for (let i = 0; i < riverCount; i++) {
            // Determine Axis (Vertical vs Horizontal)
            const isVertical = Math.random() > 0.5;

            let r = isVertical ? 0 : Math.floor(Math.random() * height);
            let c = isVertical ? Math.floor(Math.random() * width) : 0;

            // Random Walk with Momentum
            let len = 0;
            const maxLen = Math.max(width, height) * 1.5;

            while (this.isValid(grid, r, c) && len < maxLen) {
                // Paint River
                grid[r][c].type = 'water';

                // Move Logic (High Momentum)
                const moveForward = Math.random() < 0.8; // 80% chance to continue straight-ish

                if (isVertical) {
                    if (moveForward) {
                        r += 1; // Down
                        // Slight jitter
                        if (Math.random() > 0.8) c += (Math.random() > 0.5 ? 1 : -1);
                    } else {
                        // Meander sideways
                        c += (Math.random() > 0.5 ? 1 : -1);
                    }
                } else {
                    if (moveForward) {
                        c += 1; // Right
                        if (Math.random() > 0.8) r += (Math.random() > 0.5 ? 1 : -1);
                    } else {
                        r += (Math.random() > 0.5 ? 1 : -1);
                    }
                }

                // Clamp
                if (r < 0 || r >= height || c < 0 || c >= width) break;
                len++;
            }
        }
    }

    private static ensureAccessibility(grid: Cell[][], width: number, height: number, playerCount: number) {
        // Ensure no player is boxed in by Water or Hills immediately
        for (let i = 0; i < playerCount; i++) {
            const spawn = this.getSpawnPoint(i, playerCount, width, height);
            const { r, c } = spawn;

            // Force spawn itself to be plain (just in case)
            if (this.isValid(grid, r, c)) grid[r][c].type = 'plain';

            // Check neighbors (Up, Down, Left, Right)
            const neighbors = [
                { r: r - 1, c }, { r: r + 1, c },
                { r, c: c - 1 }, { r, c: c + 1 }
            ];

            const validNeighbors = [];
            let walkableCount = 0;

            for (const n of neighbors) {
                if (this.isValid(grid, n.r, n.c)) {
                    validNeighbors.push(n);
                    const cell = grid[n.r][n.c];
                    // Plain is best. Hill is walkable but slow. Water is blocked.
                    // We want at least 2 PLAIN neighbors for easy start.
                    if (cell.type === 'plain') {
                        walkableCount++;
                    }
                }
            }

            // If boxed in (fewer than 2 plain neighbors), clear some space
            if (walkableCount < 2 && validNeighbors.length > 0) {
                // Shuffle validNeighbors
                validNeighbors.sort(() => Math.random() - 0.5);

                // Force convert to plain until we have 2
                for (const n of validNeighbors) {
                    const cell = grid[n.r][n.c];
                    if (cell.type !== 'plain') {
                        cell.type = 'plain';
                        cell.owner = null; // Clear if needed
                        walkableCount++;
                        if (walkableCount >= 2) break;
                    }
                }
            }
        }
    }

    // --- Helpers ---

    private static fillGrid(grid: Cell[][], type: 'plain' | 'water') {
        grid.forEach(row => row.forEach(cell => cell.type = type));
    }

    private static isValid(grid: Cell[][], r: number, c: number) {
        return r >= 0 && r < grid.length && c >= 0 && c < grid[0].length;
    }

    private static growCluster(grid: Cell[][], type: 'water' | 'hill', size: number) {
        const h = grid.length;
        const w = grid[0].length;
        const r = Math.floor(Math.random() * (h - 2)) + 1;
        const c = Math.floor(Math.random() * (w - 2)) + 1;
        this.growClusterAt(grid, r, c, type, size, 'plain');
    }

    private static growClusterAt(grid: Cell[][], r: number, c: number, type: string, targetSize: number, overwriteType?: string) {
        let size = 0;
        const queue: { r: number, c: number }[] = [{ r, c }];
        const visited = new Set<string>();

        while (size < targetSize && queue.length > 0) {
            const index = Math.floor(Math.random() * queue.length); // Random pick for organic shape
            const curr = queue.splice(index, 1)[0];
            const key = `${curr.r},${curr.c}`;

            if (visited.has(key)) continue;
            visited.add(key);

            if (this.isValid(grid, curr.r, curr.c)) {
                const cell = grid[curr.r][curr.c];

                // If overwriteType specified, only overwrite that. Else overwrite anything.
                if (!overwriteType || cell.type === overwriteType) {
                    cell.type = type as any; // Cast safely
                    size++;

                    // Add neighbors
                    queue.push({ r: curr.r + 1, c: curr.c });
                    queue.push({ r: curr.r - 1, c: curr.c });
                    queue.push({ r: curr.r, c: curr.c + 1 });
                    queue.push({ r: curr.r, c: curr.c - 1 });
                }
            }
        }
    }

    private static scatterTerrain(grid: Cell[][], type: string, chance: number, onType: string) {
        grid.forEach(row => row.forEach(cell => {
            if (cell.type === onType && Math.random() < chance) {
                cell.type = type as any;
            }
        }));
    }

    private static distributeTowns(grid: Cell[][], width: number, height: number) {
        const area = width * height;
        const townCount = Math.max(5, Math.floor(area / 15)); // ~6-7 towns per 100 tiles

        let placed = 0;
        let attempts = 0;
        while (placed < townCount && attempts < 500) {
            attempts++;
            const r = Math.floor(Math.random() * height);
            const c = Math.floor(Math.random() * width);
            const cell = grid[r][c];

            if (cell.type === 'plain' && cell.building === 'none') {
                // Check isolation
                let tooClose = false;
                // (Simple local scan for other towns to avoid importing state helpers)
                for (let tr = r - 2; tr <= r + 2; tr++) {
                    for (let tc = c - 2; tc <= c + 2; tc++) {
                        if (this.isValid(grid, tr, tc)) {
                            if (grid[tr][tc].building === 'town' || grid[tr][tc].building === 'base') {
                                tooClose = true;
                            }
                        }
                    }
                }

                if (!tooClose) {
                    cell.building = 'town';
                    cell.townIncome = GameConfig.TOWN_INCOME_BASE;
                    placed++;
                }
            }
        }
    }
}

