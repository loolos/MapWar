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

    private static generatePangaea(grid: Cell[][], width: number, height: number, playerCount: number = 2) {
        // Start with WATER
        this.fillGrid(grid, 'water');

        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);

        // 1. Create Skeleton: Connect Center to All Spawns
        // This ensures everyone is on the main continent
        const targetLand = Math.floor(width * height * 0.85); // Increased from 0.65 to 0.85

        // Add Center Node - Larger Core
        this.growClusterAt(grid, centerY, centerX, 'plain', Math.floor(targetLand * 0.3), 'water'); // 30% at center

        // Draw thick arms to each spawn
        for (let i = 0; i < playerCount; i++) {
            // Force Edge Spawn calculation
            // Use existing angle logic but push to very edge
            const angle = (i / playerCount) * 2 * Math.PI - (Math.PI / 2);
            // Angle matching standard spawn rotation (-3PI/4)
            const finalAngle = angle + (-3 * Math.PI / 4);

            const r = Math.round(centerY + (height * 0.45) * Math.sin(finalAngle)); // 45% radius (90% diam) -> Near edge
            const c = Math.round(centerX + (width * 0.45) * Math.cos(finalAngle));

            // Clamp
            const spawnR = Math.max(1, Math.min(height - 2, r));
            const spawnC = Math.max(1, Math.min(width - 2, c));

            // Force spawn point land immediately
            this.growClusterAt(grid, spawnR, spawnC, 'plain', 20, 'water'); // Ensure spawn has land

            // Draw line from center to spawn using simple march
            let currR = centerY;
            let currC = centerX;

            while (Math.abs(currR - spawnR) > 1 || Math.abs(currC - spawnC) > 1) {
                const dr = spawnR - currR;
                const dc = spawnC - currC;

                if (Math.abs(dr) > Math.abs(dc)) {
                    currR += Math.sign(dr);
                } else {
                    currC += Math.sign(dc);
                }

                if (this.isValid(grid, currR, currC)) {
                    grid[currR][currC].type = 'plain';
                    // Thicken Significantly (Arm width 8-10)
                    this.growClusterAt(grid, currR, currC, 'plain', 12, undefined);
                }
            }
        }

        // 2. Bulk up randomly to reach target %
        // Already did heavy clustering. Let's do a few random fills to fuse gaps
        let currentLand = grid.flat().filter(c => c.type === 'plain').length;
        let safety = 0;

        while (currentLand < targetLand && safety < 100) {
            safety++;
            const rr = Math.floor(Math.random() * height);
            const cc = Math.floor(Math.random() * width);
            if (grid[rr][cc].type === 'plain') {
                this.growClusterAt(grid, rr, cc, 'plain', 20, 'water');
            }
            currentLand = grid.flat().filter(c => c.type === 'plain').length;
        }

        // 3. Add Hills
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

    private static generateRivers(grid: Cell[][], width: number, height: number, playerCount: number = 2) {
        this.generateDefault(grid, width, height);

        // Strategic Rivers: Barriers BETWEEN players
        // Calculate angles between players and flow rivers there
        const centerX = width / 2;
        const centerY = height / 2;

        for (let i = 0; i < playerCount; i++) {
            // Angle for Player i
            const angleI = (i / playerCount) * 2 * Math.PI - (Math.PI / 2) - (3 * Math.PI / 4);
            // Angle for Player i+1
            const angleNext = ((i + 1) / playerCount) * 2 * Math.PI - (Math.PI / 2) - (3 * Math.PI / 4);

            // Mid-Angle (Barrier direction)
            // Handle wrap-around logic roughly
            const midAngle = (angleI + angleNext) / 2; // Simply average acts as mid vector

            // Start river near center but not exactly ON center (keep center passable?)
            // Flow OUTWARDS to edge
            let r = centerY;
            let c = centerX;

            const dr = Math.sin(midAngle); // y component
            const dc = Math.cos(midAngle); // x component

            // Trace river
            // Wiggle variables
            let currentR = r;
            let currentC = c;

            const maxLen = Math.max(width, height) * 1.5;
            let len = 0;

            while (this.isValid(grid, Math.floor(currentR), Math.floor(currentC)) && len < maxLen) {
                const cellR = Math.floor(currentR);
                const cellC = Math.floor(currentC);

                grid[cellR][cellC].type = 'water';

                // Move outwards
                currentR += dr;
                currentC += dc;

                // Add "Meander" noise
                // Perpendicular vector (-dy, dx) = (-cost, sint) or (cost, -sint)
                const noise = (Math.random() - 0.5) * 1.0;
                currentR += dc * noise; // Add perp component
                currentC += -dr * noise;

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
