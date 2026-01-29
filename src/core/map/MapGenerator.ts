import { Cell } from '../Cell';
import { GameConfig } from '../GameConfig';

export type MapType = 'default' | 'archipelago' | 'pangaea' | 'mountains' | 'rivers';

export class MapGenerator {
    private static getSpawnPoints(count: number, width: number, height: number) {
        const spawns: { r: number; c: number }[] = [];
        for (let i = 0; i < count; i++) {
            spawns.push(this.getSpawnPoint(i, count, width, height));
        }
        return spawns;
    }

    static generate(grid: Cell[][], type: MapType, width: number, height: number, playerCount: number = 2) {
        // Reset to default state
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                grid[r][c].type = 'plain';
                grid[r][c].building = 'none';
                grid[r][c].owner = null;
                grid[r][c].treasureGold = null;
            }
        }

        switch (type) {
            case 'archipelago':
                this.generateArchipelago(grid, width, height, playerCount);
                break;
            case 'pangaea':
                this.generatePangaea(grid, width, height, playerCount);
                this.placePangaeaCitadel(grid, width, height);
                break;
            case 'mountains':
                this.generateMountains(grid, width, height, playerCount);
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

        // Post-Processing: Distribute Treasures/Flotsam (fair per-player)
        this.distributeTreasures(grid, width, height, playerCount);
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

        const area = width * height;
        const targetLand = Math.floor(area * 0.45);
        const playerIslandRatio = 0.65;
        const targetPlayerIsland = Math.max(10, Math.floor((targetLand / playerCount) * playerIslandRatio));
        const minPlayerIsland = Math.max(8, Math.floor(targetPlayerIsland * 0.85));

        // Generate Player Islands first (disconnected)
        const spawnPoints: { r: number; c: number }[] = [];
        for (let i = 0; i < playerCount; i++) {
            const spawn = this.getSpawnPoint(i, playerCount, width, height);
            spawnPoints.push(spawn);
            const island = this.growIslandFromSeed(
                grid,
                spawn,
                targetPlayerIsland,
                (r, c, islandSet) => {
                    if (grid[r][c].type !== 'water') return false;
                    return !this.hasAdjacentForeignLand(grid, r, c, islandSet);
                }
            );

            if (island.cells.length < minPlayerIsland) {
                this.expandIsland(
                    grid,
                    island.cells,
                    island.set,
                    minPlayerIsland,
                    (r, c, islandSet) => {
                        if (grid[r][c].type !== 'water') return false;
                        return !this.hasAdjacentForeignLand(grid, r, c, islandSet);
                    }
                );
            }
        }

        // Ensure player islands are separated (safety pass)
        this.separateSpawnIslands(grid, width, height, spawnPoints);

        const playerLandSet = this.collectPlayerLand(grid, spawnPoints);
        let currentLand = this.countLand(grid);
        let remainingLand = Math.max(0, targetLand - currentLand);

        // Fill remaining land with neutral islands (avoid connecting to players)
        const maxAttempts = area * 3;
        let attempts = 0;
        while (remainingLand > 0 && attempts < maxAttempts) {
            attempts++;
            const seed = {
                r: Math.floor(Math.random() * height),
                c: Math.floor(Math.random() * width)
            };

            if (!this.isValid(grid, seed.r, seed.c)) continue;
            if (grid[seed.r][seed.c].type !== 'water') continue;
            if (this.isAdjacentToSet(seed, playerLandSet)) continue;

            const islandSize = Math.min(remainingLand, Math.floor(Math.random() * 5) + 3);
            const island = this.growIslandFromSeed(
                grid,
                seed,
                islandSize,
                (r, c) => {
                    if (grid[r][c].type !== 'water') return false;
                    return !this.isAdjacentToSet({ r, c }, playerLandSet);
                }
            );

            if (island.cells.length > 0) {
                remainingLand -= island.cells.length;
            }
        }

        // Add some hills on islands
        this.scatterTerrain(grid, 'hill', 0.2, 'plain'); // 20% of plains become hills

        // Place 5 lighthouses: four corners + center (uninhabited islands or tiles)
        const lighthousePositions: { r: number; c: number }[] = [
            { r: 0, c: 0 },
            { r: 0, c: width - 1 },
            { r: height - 1, c: 0 },
            { r: height - 1, c: width - 1 },
            { r: Math.floor(height / 2), c: Math.floor(width / 2) }
        ];
        for (const { r, c } of lighthousePositions) {
            if (!this.isValid(grid, r, c)) continue;
            const cell = grid[r][c];
            // Only place on water or neutral land; skip if already player-owned (e.g. spawn)
            if (cell.owner !== null) continue;
            cell.type = 'plain';
            cell.building = 'lighthouse';
            cell.owner = null;
        }
    }

    private static generatePangaea(grid: Cell[][], width: number, height: number, playerCount: number = 2) {
        // 1. Start with Water
        this.fillGrid(grid, 'water');

        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);

        // 2. Spawn Clusters (Anchor Points)
        const spawnPoints: { r: number, c: number }[] = [];
        for (let i = 0; i < playerCount; i++) {
            const spawn = this.getSpawnPoint(i, playerCount, width, height);
            spawnPoints.push(spawn);
            // Large cluster at spawn to guarantee start area
            this.growClusterAt(grid, spawn.r, spawn.c, 'plain', 25, 'water');
        }

        // 3. Connect Spawns to Center (Land Arms)
        // Ensure the center itself is land
        this.growClusterAt(grid, centerY, centerX, 'plain', 20, 'water');

        for (const spawn of spawnPoints) {
            let currR = spawn.r;
            let currC = spawn.c;

            // March towards center
            // March ALL THE WAY to center to ensure strict connectivity
            while (currR !== centerY || currC !== centerX) {
                const dr = centerY - currR;
                const dc = centerX - currC;

                // Move one step closer
                if (Math.abs(dr) > Math.abs(dc)) {
                    currR += Math.sign(dr);
                } else {
                    currC += Math.sign(dc);
                }

                if (this.isValid(grid, currR, currC)) {
                    grid[currR][currC].type = 'plain';
                    // Thicken the arm
                    this.growClusterAt(grid, currR, currC, 'plain', 6, undefined);
                }
            }
        }

        // Integrity Check & Repair: Force path tiles to be Plain (Double Tap)
        // This ensures that even if organic growth or overlaps caused issues, the skeleton remains connected.
        for (const spawn of spawnPoints) {
            let currR = spawn.r, currC = spawn.c;
            const targetR = centerY, targetC = centerX;

            // Re-trace exact path logic
            while (currR !== targetR || currC !== targetC) {
                const dr = targetR - currR;
                const dc = targetC - currC;

                // Deterministic Move
                if (Math.abs(dr) > Math.abs(dc)) {
                    currR += Math.sign(dr);
                } else {
                    currC += Math.sign(dc);
                }

                if (this.isValid(grid, currR, currC)) {
                    grid[currR][currC].type = 'plain';
                }
            }
        }

        // 4. Organic Filling (Expand to target %)
        // Target roughly 65-75% land for Pangea
        const targetLand = Math.floor(width * height * 0.70);
        let currentLand = grid.flat().filter(c => c.type === 'plain').length;
        let safety = 0;

        while (currentLand < targetLand && safety < 200) {
            safety++;
            // Pick a random existing land tile to grow from (maintains connectivity)
            const r = Math.floor(Math.random() * height);
            const c = Math.floor(Math.random() * width);

            if (grid[r][c].type === 'plain') {
                // Find a water neighbor to expand into
                const neighbors = [
                    { r: r + 1, c }, { r: r - 1, c },
                    { r, c: c + 1 }, { r, c: c - 1 }
                ];
                const validWater = neighbors.filter(n =>
                    this.isValid(grid, n.r, n.c) && grid[n.r][n.c].type === 'water'
                );

                if (validWater.length > 0) {
                    const target = validWater[Math.floor(Math.random() * validWater.length)];
                    this.growClusterAt(grid, target.r, target.c, 'plain', 12, 'water');
                    currentLand = grid.flat().filter(c => c.type === 'plain').length;
                }
            }
        }

        // 5. Add Texture (Hills, Forests?)
        this.scatterTerrain(grid, 'hill', 0.15, 'plain');

        // Ensure each spawn is connected to the main landmass
        this.ensureSpawnsOnMainland(grid, width, height, spawnPoints);
    }

    private static placePangaeaCitadel(grid: Cell[][], width: number, height: number) {
        const centerR = Math.floor(height / 2);
        const centerC = Math.floor(width / 2);
        if (this.isValid(grid, centerR, centerC)) {
            grid[centerR][centerC].type = 'plain';
            grid[centerR][centerC].building = 'citadel';
            grid[centerR][centerC].owner = null;
        }
    }

    private static growIslandFromSeed(
        grid: Cell[][],
        seed: { r: number; c: number },
        targetSize: number,
        canPlace: (r: number, c: number, islandSet: Set<string>) => boolean
    ) {
        const cells: { r: number; c: number }[] = [];
        const islandSet = new Set<string>();

        if (!this.isValid(grid, seed.r, seed.c)) return { cells, set: islandSet };

        if (grid[seed.r][seed.c].type === 'water') {
            grid[seed.r][seed.c].type = 'plain';
        }
        const seedKey = `${seed.r},${seed.c}`;
        islandSet.add(seedKey);
        cells.push({ r: seed.r, c: seed.c });

        this.expandIsland(grid, cells, islandSet, targetSize, canPlace);

        return { cells, set: islandSet };
    }

    private static expandIsland(
        grid: Cell[][],
        cells: { r: number; c: number }[],
        islandSet: Set<string>,
        targetSize: number,
        canPlace: (r: number, c: number, islandSet: Set<string>) => boolean
    ) {
        const frontier = [...cells];
        let guard = 0;
        const limit = grid.length * grid[0].length * 4;

        while (cells.length < targetSize && frontier.length > 0 && guard < limit) {
            guard++;
            const index = Math.floor(Math.random() * frontier.length);
            const current = frontier.splice(index, 1)[0];
            const neighbors = [
                { r: current.r + 1, c: current.c },
                { r: current.r - 1, c: current.c },
                { r: current.r, c: current.c + 1 },
                { r: current.r, c: current.c - 1 }
            ].sort(() => Math.random() - 0.5);

            for (const n of neighbors) {
                if (cells.length >= targetSize) break;
                if (!this.isValid(grid, n.r, n.c)) continue;
                const key = `${n.r},${n.c}`;
                if (islandSet.has(key)) continue;
                if (!canPlace(n.r, n.c, islandSet)) continue;

                grid[n.r][n.c].type = 'plain';
                islandSet.add(key);
                cells.push({ r: n.r, c: n.c });
                frontier.push({ r: n.r, c: n.c });
            }
        }
    }

    private static hasAdjacentForeignLand(
        grid: Cell[][],
        r: number,
        c: number,
        islandSet: Set<string>
    ) {
        const neighbors = [
            { r: r + 1, c },
            { r: r - 1, c },
            { r, c: c + 1 },
            { r, c: c - 1 }
        ];

        for (const n of neighbors) {
            if (!this.isValid(grid, n.r, n.c)) continue;
            const key = `${n.r},${n.c}`;
            if (grid[n.r][n.c].type !== 'water' && !islandSet.has(key)) {
                return true;
            }
        }

        return false;
    }

    private static isAdjacentToSet(
        cell: { r: number; c: number },
        cellSet: Set<string>
    ) {
        const neighbors = [
            { r: cell.r + 1, c: cell.c },
            { r: cell.r - 1, c: cell.c },
            { r: cell.r, c: cell.c + 1 },
            { r: cell.r, c: cell.c - 1 }
        ];

        for (const n of neighbors) {
            if (cellSet.has(`${n.r},${n.c}`)) return true;
        }

        return false;
    }

    private static collectPlayerLand(
        grid: Cell[][],
        spawnPoints: { r: number; c: number }[]
    ) {
        const land = new Set<string>();
        for (const spawn of spawnPoints) {
            const { cells } = this.getLandmassAt(grid, spawn.r, spawn.c);
            for (const cell of cells) {
                land.add(`${cell.r},${cell.c}`);
            }
        }
        return land;
    }

    private static countLand(grid: Cell[][]) {
        return grid.flat().filter((cell) => cell.type !== 'water').length;
    }

    private static ensureSpawnsOnMainland(
        grid: Cell[][],
        width: number,
        height: number,
        spawnPoints: { r: number; c: number }[]
    ) {
        const { masses } = this.getLandmasses(grid, width, height);
        if (masses.length === 0) return;
        masses.sort((a, b) => b.cells.length - a.cells.length);
        const main = masses[0];
        const mainSet = new Set(main.cells.map((c) => `${c.r},${c.c}`));

        for (const spawn of spawnPoints) {
            const key = `${spawn.r},${spawn.c}`;
            if (mainSet.has(key)) continue;

            const target = this.findClosestCell(spawn, main.cells);
            if (!target) continue;
            this.carvePath(grid, spawn, target);
        }
    }

    private static getLandmassAt(grid: Cell[][], r: number, c: number) {
        if (!this.isValid(grid, r, c)) return { size: 0, cells: [] as { r: number; c: number }[] };
        if (grid[r][c].type === 'water') return { size: 0, cells: [] as { r: number; c: number }[] };
        const visited = new Set<string>();
        const queue: { r: number; c: number }[] = [{ r, c }];
        const cells: { r: number; c: number }[] = [];

        while (queue.length > 0) {
            const current = queue.pop()!;
            const key = `${current.r},${current.c}`;
            if (visited.has(key)) continue;
            visited.add(key);
            cells.push(current);
            const neighbors = [
                { r: current.r + 1, c: current.c },
                { r: current.r - 1, c: current.c },
                { r: current.r, c: current.c + 1 },
                { r: current.r, c: current.c - 1 }
            ];
            for (const n of neighbors) {
                if (!this.isValid(grid, n.r, n.c)) continue;
                if (grid[n.r][n.c].type === 'water') continue;
                const nKey = `${n.r},${n.c}`;
                if (!visited.has(nKey)) queue.push(n);
            }
        }

        return { size: cells.length, cells };
    }

    private static getLandmasses(grid: Cell[][], width: number, height: number) {
        const visited = new Set<string>();
        const masses: { cells: { r: number; c: number }[] }[] = [];

        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                if (grid[r][c].type === 'water') continue;
                const key = `${r},${c}`;
                if (visited.has(key)) continue;

                const queue: { r: number; c: number }[] = [{ r, c }];
                const cells: { r: number; c: number }[] = [];
                while (queue.length > 0) {
                    const current = queue.pop()!;
                    const currentKey = `${current.r},${current.c}`;
                    if (visited.has(currentKey)) continue;
                    visited.add(currentKey);
                    cells.push(current);
                    const neighbors = [
                        { r: current.r + 1, c: current.c },
                        { r: current.r - 1, c: current.c },
                        { r: current.r, c: current.c + 1 },
                        { r: current.r, c: current.c - 1 }
                    ];
                    for (const n of neighbors) {
                        if (!this.isValid(grid, n.r, n.c)) continue;
                        if (grid[n.r][n.c].type === 'water') continue;
                        const nKey = `${n.r},${n.c}`;
                        if (!visited.has(nKey)) queue.push(n);
                    }
                }

                masses.push({ cells });
            }
        }

        return { masses };
    }

    private static findClosestCell(origin: { r: number; c: number }, cells: { r: number; c: number }[]) {
        let best: { r: number; c: number } | null = null;
        let bestDist = Infinity;
        for (const cell of cells) {
            const dist = Math.abs(origin.r - cell.r) + Math.abs(origin.c - cell.c);
            if (dist < bestDist) {
                bestDist = dist;
                best = cell;
            }
        }
        return best;
    }

    private static carvePath(
        grid: Cell[][],
        start: { r: number; c: number },
        target: { r: number; c: number }
    ) {
        let currR = start.r;
        let currC = start.c;
        while (currR !== target.r || currC !== target.c) {
            const dr = target.r - currR;
            const dc = target.c - currC;
            if (Math.abs(dr) > Math.abs(dc)) {
                currR += Math.sign(dr);
            } else {
                currC += Math.sign(dc);
            }
            if (!this.isValid(grid, currR, currC)) break;
            grid[currR][currC].type = 'plain';
            this.growClusterAt(grid, currR, currC, 'plain', 4, 'water');
        }
    }

    private static separateSpawnIslands(
        grid: Cell[][],
        width: number,
        height: number,
        spawnPoints: { r: number; c: number }[]
    ) {
        let safety = 0;
        while (safety < 8) {
            safety++;
            let changed = false;

            for (const spawn of spawnPoints) {
                const { cells } = this.getLandmassAt(grid, spawn.r, spawn.c);
                if (cells.length === 0) continue;
                const cellSet = new Set(cells.map((c) => `${c.r},${c.c}`));
                const neighbors = spawnPoints.filter((p) => (p.r !== spawn.r || p.c !== spawn.c) && cellSet.has(`${p.r},${p.c}`));

                for (const other of neighbors) {
                    this.carveWaterPath(grid, width, height, spawn, other);
                    changed = true;
                }
            }

            if (!changed) break;
        }
    }

    private static carveWaterPath(
        grid: Cell[][],
        width: number,
        height: number,
        start: { r: number; c: number },
        target: { r: number; c: number }
    ) {
        let currR = start.r;
        let currC = start.c;
        let guard = 0;
        const limit = width * height;

        while ((currR !== target.r || currC !== target.c) && guard < limit) {
            guard++;
            const dr = target.r - currR;
            const dc = target.c - currC;
            if (Math.abs(dr) > Math.abs(dc)) {
                currR += Math.sign(dr);
            } else {
                currC += Math.sign(dc);
            }
            if (!this.isValid(grid, currR, currC)) break;
            if (currR === target.r && currC === target.c) break;
            grid[currR][currC].type = 'water';
        }
    }

    private static generateMountains(grid: Cell[][], width: number, height: number, playerCount: number) {
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

        // Gold Mines: Fair distribution replacing Hills
        this.distributeGoldMines(grid, width, height, this.getSpawnPoints(playerCount, width, height));
    }

    private static generateRivers(grid: Cell[][], width: number, height: number, playerCount: number = 2) {
        this.generateDefault(grid, width, height);

        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);

        // 1. Create a Central Lake to block easy crossing
        // Size proportional to map
        const lakeSize = Math.max(3, Math.floor(Math.min(width, height) / 6));
        this.growClusterAt(grid, centerY, centerX, 'water', lakeSize * lakeSize); // Square-ish area

        // 2. Strategic Rivers: Barriers BETWEEN players
        for (let i = 0; i < playerCount; i++) {
            // Angle for Player i
            // We use the same angle offset logic as spawns (-3PI/4) to align checking
            const offset = -3 * Math.PI / 4;
            const angleI = (i / playerCount) * 2 * Math.PI - (Math.PI / 2) + offset;
            const angleNext = ((i + 1) / playerCount) * 2 * Math.PI - (Math.PI / 2) + offset;

            // Average Angle is the Bisector (Between players)
            // Use vector addition to handle wrap-around correctly
            const v1x = Math.cos(angleI);
            const v1y = Math.sin(angleI);
            const v2x = Math.cos(angleNext);
            const v2y = Math.sin(angleNext);

            let dx = v1x + v2x;
            let dy = v1y + v2y;

            // Normalize
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0.001) {
                dx /= len;
                dy /= len;
            } else {
                // Opposite vectors (180 deg) - Pick orthogonal
                dx = -v1y;
                dy = v1x;
            }

            // Start from Center Lake Edge
            // Move out in direction (dy, dx) -> Row is Y, Col is X
            let currentR = centerY + dy * (lakeSize / 2);
            let currentC = centerX + dx * (lakeSize / 2);

            const maxDist = Math.max(width, height) * 1.5;
            let dist = 0;

            while (this.isValid(grid, Math.floor(currentR), Math.floor(currentC)) && dist < maxDist) {
                const cellR = Math.floor(currentR);
                const cellC = Math.floor(currentC);

                grid[cellR][cellC].type = 'water'; // River

                // Widen River occasionally
                if (dist % 3 === 0) {
                    // Make it width 2
                    const neighbors = [
                        { r: cellR + 1, c: cellC }, { r: cellR - 1, c: cellC },
                        { r: cellR, c: cellC + 1 }, { r: cellR, c: cellC - 1 }
                    ];
                    for (const n of neighbors) {
                        if (this.isValid(grid, n.r, n.c)) grid[n.r][n.c].type = 'water';
                    }
                }

                // Move outwards
                // Reduced Meander to ensure separation
                const noise = (Math.random() - 0.5) * 0.3;
                currentR += dy + (dx * noise);
                currentC += dx + (-dy * noise);

                dist++;
            }
        }

        // 3. Additional Random Rivers for Scaling
        const extraRivers = Math.floor((width * height) / 150); // One per ~150 tiles
        for (let j = 0; j < extraRivers; j++) {
            this.generateRandomRiver(grid, width, height);
        }
    }

    private static generateRandomRiver(grid: Cell[][], width: number, height: number) {
        // Pick a random edge point
        const side = Math.floor(Math.random() * 4);
        let r = 0;
        let c = 0;
        let dr = 0;
        let dc = 0;

        if (side === 0) { // Top
            c = Math.floor(Math.random() * width);
            dr = 1;
            dc = (Math.random() - 0.5) * 2;
        } else if (side === 1) { // Bottom
            r = height - 1;
            c = Math.floor(Math.random() * width);
            dr = -1;
            dc = (Math.random() - 0.5) * 2;
        } else if (side === 2) { // Left
            r = Math.floor(Math.random() * height);
            dc = 1;
            dr = (Math.random() - 0.5) * 2;
        } else { // Right
            r = Math.floor(Math.random() * height);
            c = width - 1;
            dc = -1;
            dr = (Math.random() - 0.5) * 2;
        }

        let currR = r;
        let currC = c;
        let dist = 0;
        const maxDist = Math.max(width, height);

        while (this.isValid(grid, Math.floor(currR), Math.floor(currC)) && dist < maxDist) {
            const cellR = Math.floor(currR);
            const cellC = Math.floor(currC);
            grid[cellR][cellC].type = 'water';

            // Slight meander
            dr += (Math.random() - 0.5) * 0.4;
            dc += (Math.random() - 0.5) * 0.4;

            // Normalize vector slightly to keep moving
            const mag = Math.sqrt(dr * dr + dc * dc);
            if (mag > 0) {
                currR += dr / mag;
                currC += dc / mag;
            }

            dist++;
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

    private static distributeTreasures(grid: Cell[][], width: number, height: number, playerCount: number) {
        // Minimum distance increased to 1.5x: at least 1.5x the base distance
        const baseDistance = Math.max(3, Math.floor(Math.min(width, height) / 5));
        const minDistance = Math.floor(baseDistance * 1.5);
        const area = width * height;
        // Reduced to ~50%: at least 1 per player, or ~0.75% of map area
        const totalCount = Math.max(playerCount * 1, Math.floor(area * 0.0075));
        const treasuresPerPlayer = Math.floor(totalCount / playerCount);
        const remainder = totalCount % playerCount;

        const spawns = this.getSpawnPoints(playerCount, width, height);

        const manhattan = (r1: number, c1: number, r2: number, c2: number) =>
            Math.abs(r1 - r2) + Math.abs(c1 - c2);

        const bucketSize = 4;

        for (let p = 0; p < playerCount; p++) {
            const spawn = spawns[p];
            const candidates: { r: number; c: number; dist: number }[] = [];

            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    const cell = grid[r][c];
                    if (cell.type !== 'plain' && cell.type !== 'water') continue;
                    if (cell.owner !== null || cell.building !== 'none') continue;
                    if (cell.treasureGold !== null) continue;

                    const d = manhattan(r, c, spawn.r, spawn.c);
                    if (d < minDistance) continue;
                    let ok = true;
                    for (let i = 0; i < spawns.length; i++) {
                        if (manhattan(r, c, spawns[i].r, spawns[i].c) < minDistance) {
                            ok = false;
                            break;
                        }
                    }
                    if (!ok) continue;
                    candidates.push({ r, c, dist: d });
                }
            }

            const groups = new Map<number, { r: number; c: number }[]>();
            for (const { r, c, dist } of candidates) {
                const bucket = minDistance + bucketSize * Math.floor((dist - minDistance) / bucketSize);
                if (!groups.has(bucket)) groups.set(bucket, []);
                groups.get(bucket)!.push({ r, c });
            }

            const buckets = [...groups.keys()].sort((a, b) => a - b);
            for (const k of buckets) {
                const arr = groups.get(k)!;
                arr.sort(() => Math.random() - 0.5);
            }

            let remaining = treasuresPerPlayer;
            const used = new Set<string>();
            const picks: { r: number; c: number }[] = [];

            while (remaining > 0) {
                let took = false;
                for (const b of buckets) {
                    const arr = groups.get(b)!;
                    if (arr.length === 0) continue;
                    const x = arr.shift()!;
                    const key = `${x.r},${x.c}`;
                    if (used.has(key)) continue;
                    used.add(key);
                    picks.push(x);
                    remaining--;
                    took = true;
                    if (remaining <= 0) break;
                }
                if (!took) break;
            }

            for (const { r, c } of picks) {
                const minGold = GameConfig.TREASURE_GOLD_MIN;
                const maxGold = GameConfig.TREASURE_GOLD_MAX;
                grid[r][c].treasureGold = minGold + Math.floor(Math.random() * (maxGold - minGold + 1));
            }
        }

        if (remainder <= 0) return;

        const pool: { r: number; c: number }[] = [];
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                const cell = grid[r][c];
                if (cell.type !== 'plain' && cell.type !== 'water') continue;
                if (cell.owner !== null || cell.building !== 'none') continue;
                if (cell.treasureGold !== null) continue;
                let ok = true;
                for (const sp of spawns) {
                    if (manhattan(r, c, sp.r, sp.c) < minDistance) {
                        ok = false;
                        break;
                    }
                }
                if (ok) pool.push({ r, c });
            }
        }

        pool.sort(() => Math.random() - 0.5);
        let rem = remainder;
        for (const { r, c } of pool) {
            if (rem <= 0) break;
            if (grid[r][c].treasureGold !== null) continue;
            const minGold = GameConfig.TREASURE_GOLD_MIN;
            const maxGold = GameConfig.TREASURE_GOLD_MAX;
            grid[r][c].treasureGold = minGold + Math.floor(Math.random() * (maxGold - minGold + 1));
            rem--;
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

                const isTargetType = cell.type === type;
                const canOverwrite = !overwriteType || cell.type === overwriteType;

                if (isTargetType || canOverwrite) {
                    if (!isTargetType) {
                        cell.type = type as any; // Cast safely
                        size++;
                    }

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

    private static distributeGoldMines(
        grid: Cell[][],
        width: number,
        height: number,
        spawnPoints: { r: number; c: number }[]
    ) {
        // Configuration for Fair Bands
        // Band: [minDist, maxDist, count]
        const bands = [
            { min: 3, max: 7, count: 1 },   // Early game boost
            { min: 8, max: 14, count: 2 },  // Mid game expansion
            { min: 15, max: 25, count: 2 }  // Contestable/Late
        ];

        const manhattan = (r1: number, c1: number, r2: number, c2: number) =>
            Math.abs(r1 - r2) + Math.abs(c1 - c2);

        for (let i = 0; i < spawnPoints.length; i++) {
            const spawn = spawnPoints[i];

            for (const band of bands) {
                const candidates: { r: number; c: number }[] = [];

                for (let r = 0; r < height; r++) {
                    for (let c = 0; c < width; c++) {
                        if (grid[r][c].type !== 'hill') continue;
                        if (grid[r][c].building !== 'none') continue;

                        const dist = manhattan(r, c, spawn.r, spawn.c);
                        if (dist >= band.min && dist <= band.max) {
                            // Verify it's not significantly closer to another player
                            let isCloserToOther = false;
                            for (let j = 0; j < spawnPoints.length; j++) {
                                if (i === j) continue;
                                const otherDist = manhattan(r, c, spawnPoints[j].r, spawnPoints[j].c);
                                if (otherDist < dist * 0.8) { // If it's >20% closer to someone else, skip
                                    isCloserToOther = true;
                                    break;
                                }
                            }

                            if (!isCloserToOther) {
                                candidates.push({ r, c });
                            }
                        }
                    }
                }

                // Randomly select 'count' candidates
                // Shuffle
                candidates.sort(() => Math.random() - 0.5);

                let placedCount = 0;
                for (let k = 0; k < candidates.length && placedCount < band.count; k++) {
                    const target = candidates[k];

                    // Ensure no adjacent gold mine (from previous placements)
                    let hasAdjacentMine = false;
                    const neighbors = [
                        { r: target.r + 1, c: target.c },
                        { r: target.r - 1, c: target.c },
                        { r: target.r, c: target.c + 1 },
                        { r: target.r, c: target.c - 1 },
                        // Check diagonals too for better separation? User said "dispersed", non-adjacent usually means 4-neighbors.
                        // Let's stick to 4-neighbors for "not adjacent".
                        // Actually, let's include diagonals to make them "more dispersed" as requested ("起码不会彼此相邻").
                        // Standard adjacency is 4. "Slightly dispersed" might benefit from 8-check or just 4.
                        // Let's use 8-way check to ensure they aren't touching at corners either, making them strictly non-adjacent visually.
                        { r: target.r + 1, c: target.c + 1 },
                        { r: target.r + 1, c: target.c - 1 },
                        { r: target.r - 1, c: target.c + 1 },
                        { r: target.r - 1, c: target.c - 1 }
                    ];

                    for (const n of neighbors) {
                        if (n.r >= 0 && n.r < height && n.c >= 0 && n.c < width) {
                            if (grid[n.r][n.c].building === 'gold_mine') {
                                hasAdjacentMine = true;
                                break;
                            }
                        }
                    }

                    if (!hasAdjacentMine) {
                        grid[target.r][target.c].building = 'gold_mine';
                        placedCount++;
                    }
                }
            }
        }
    }
}
