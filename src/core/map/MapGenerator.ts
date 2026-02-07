import { Cell } from '../Cell';
import { GameConfig } from '../GameConfig';

export type MapType = 'default' | 'archipelago' | 'pangaea' | 'mountains' | 'rivers';

export class MapGenerator {
    private static getSpawnPoints(count: number, width: number, height: number, mapType?: MapType) {
        if (mapType === 'mountains' || mapType === 'rivers') {
            return this.getRandomSpawnPoints(count, width, height);
        }
        const spawns: { r: number; c: number }[] = [];
        for (let i = 0; i < count; i++) {
            spawns.push(this.getSpawnPoint(i, count, width, height, mapType));
        }
        return spawns;
    }

    static generate(grid: Cell[][], type: MapType, width: number, height: number, playerCount: number = 2): { r: number; c: number }[] {
        // Reset to default state
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                grid[r][c].type = 'plain';
                grid[r][c].building = 'none';
                grid[r][c].owner = null;
                grid[r][c].treasureGold = null;
            }
        }

        const spawns = this.getSpawnPoints(playerCount, width, height, type);

        switch (type) {
            case 'archipelago':
                this.generateArchipelago(grid, width, height, playerCount, spawns);
                break;
            case 'pangaea':
                this.generatePangaea(grid, width, height, playerCount, spawns);
                this.placePangaeaCitadel(grid, width, height);
                break;
            case 'mountains':
                this.generateMountains(grid, width, height, playerCount, spawns);
                break;
            case 'rivers':
                this.generateRivers(grid, width, height, playerCount, spawns);
                break;
            case 'default':
            default:
                this.generateDefault(grid, width, height, playerCount, type, undefined, spawns);
                break;
        }

        // Post-Processing: Distribute Towns (zone-aware for default map)
        const area = width * height;
        const zoneRadius = Math.max(3, Math.floor(Math.sqrt(area / playerCount) / 2));
        this.distributeTowns(grid, width, height, (type === 'default' || type === 'rivers') ? { playerCount, spawns, zoneRadius } : undefined);

        // Post-Processing: Ensure Spawn Accessibility
        this.ensureAccessibility(grid, width, height, playerCount, spawns);

        // Post-Processing: Distribute Treasures/Flotsam (fair per-player)
        this.distributeTreasures(grid, width, height, playerCount, spawns);

        // Post-Processing: Balance per zone (always after distributeTowns & distributeTreasures). Mountains/Pangaea also get light terrain balance.
        const isMountainsOrPangaea = type === 'mountains' || type === 'pangaea';
        this.balanceZone(grid, width, height, spawns, zoneRadius, isMountainsOrPangaea
            ? { minimal: true, balanceTerrainTypes: ['water', 'hill', 'plain'], balanceGoldMines: type === 'mountains' }
            : { balanceTerrainTypes: [], maxRounds: 40, tolerance: 2 }
        );
        return spawns;
    }

    private static getSpawnPoint(index: number, total: number, width: number, height: number, mapType?: MapType): { r: number, c: number } {
        const margin = 2;
        const boundedW = Math.max(1, width - 2 * margin);
        const boundedH = Math.max(1, height - 2 * margin);
        const usePerimeterSpawns = mapType === 'pangaea' || mapType === 'archipelago';

        let r = Math.floor(height / 2);
        let c = Math.floor(width / 2);
        if (usePerimeterSpawns) {
            const spawn = this.getPerimeterSpawnPoint(index, total, width, height, margin);
            r = spawn.r;
            c = spawn.c;
        } else {
            // Angle fraction matching GameState.setupBases
            const angle = (index / total) * 2 * Math.PI - (Math.PI / 2);
            // Start offset matching setupBases (-3*PI/4)
            const startOffset = -3 * Math.PI / 4;
            const finalAngle = angle + startOffset;

            const cx = width / 2;
            const cy = height / 2;

            r = Math.round(cy + (boundedH / 2) * Math.sin(finalAngle));
            c = Math.round(cx + (boundedW / 2) * Math.cos(finalAngle));
        }

        r = Math.max(0, Math.min(height - 1, r));
        c = Math.max(0, Math.min(width - 1, c));

        return { r, c };
    }

    private static getRandomSpawnPoints(count: number, width: number, height: number) {
        const margin = 2;
        const minSide = Math.min(width, height);
        const minDist = Math.max(2, Math.floor(minSide / 3));
        const sumTolerance = Math.max(2, Math.floor(minDist * 0.5));
        const edgeTolerance = Math.max(2, Math.floor(sumTolerance * 1.5));
        const maxAttempts = 500;
        const maxPointAttempts = 200;
        const manhattan = (a: { r: number; c: number }, b: { r: number; c: number }) =>
            Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
        const randomPoint = () => ({
            r: margin + Math.floor(Math.random() * Math.max(1, height - 2 * margin)),
            c: margin + Math.floor(Math.random() * Math.max(1, width - 2 * margin))
        });

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const spawns: { r: number; c: number }[] = [];
            for (let i = 0; i < count; i++) {
                let placed = false;
                for (let tries = 0; tries < maxPointAttempts; tries++) {
                    const candidate = randomPoint();
                    if (spawns.some((s) => manhattan(s, candidate) < minDist)) continue;
                    spawns.push(candidate);
                    placed = true;
                    break;
                }
                if (!placed) break;
            }
            if (spawns.length !== count) continue;

            const sums = spawns.map((s) => {
                const dists = spawns
                    .filter((o) => o !== s)
                    .map((o) => manhattan(s, o))
                    .sort((a, b) => a - b);
                if (dists.length === 0) return 0;
                if (dists.length === 1) return dists[0];
                return dists[0] + dists[1];
            });
            const minSum = Math.min(...sums);
            const maxSum = Math.max(...sums);
            const edgeDists = spawns.map((s) =>
                Math.min(s.r, s.c, height - 1 - s.r, width - 1 - s.c)
            );
            const minEdge = Math.min(...edgeDists);
            const maxEdge = Math.max(...edgeDists);
            if (maxSum - minSum <= sumTolerance && maxEdge - minEdge <= edgeTolerance) {
                return spawns;
            }
        }

        const fallback: { r: number; c: number }[] = [];
        for (let i = 0; i < count; i++) {
            fallback.push(this.getSpawnPoint(i, count, width, height, 'default'));
        }
        return fallback;
    }

    private static getPerimeterSpawnPoint(index: number, total: number, width: number, height: number, margin: number) {
        const boundedW = Math.max(1, width - 2 * margin);
        const boundedH = Math.max(1, height - 2 * margin);
        const perimeter = 2 * ((boundedW - 1) + (boundedH - 1));
        if (perimeter <= 0) {
            return { r: Math.floor(height / 2), c: Math.floor(width / 2) };
        }
        let t = Math.floor((index / total) * perimeter);
        const topLen = boundedW - 1;
        const rightLen = boundedH - 1;
        const bottomLen = boundedW - 1;
        let r = margin;
        let c = margin;
        if (t < topLen) {
            c += t;
        } else if (t < topLen + rightLen) {
            c += topLen;
            r += (t - topLen);
        } else if (t < topLen + rightLen + bottomLen) {
            c += topLen - (t - topLen - rightLen);
            r += rightLen;
        } else {
            r += rightLen - (t - topLen - rightLen - bottomLen);
        }
        return { r, c };
    }

    /**
     * Generate base terrain with optional terrain types. Default ['water','hill','plain'].
     * Omit 'water' e.g. for rivers map so water is created only in addRiversAlongBisectors.
     */
    private static generateDefault(
        grid: Cell[][],
        width: number,
        height: number,
        playerCount: number,
        mapType?: MapType,
        terrainTypes: ('water' | 'hill' | 'plain')[] = ['water', 'hill', 'plain'],
        spawns?: { r: number; c: number }[]
    ) {
        const area = width * height;
        const scaleFactor = area / 100;

        // 1. Random phase: clusters only for requested terrain types
        if (terrainTypes.includes('water')) {
            const waterClusters = Math.max(2, Math.floor(2 * scaleFactor));
            for (let i = 0; i < waterClusters; i++) this.growCluster(grid, 'water', 6);
        }
        if (terrainTypes.includes('hill')) {
            const hillClusters = Math.max(3, Math.floor(3 * scaleFactor));
            for (let i = 0; i < hillClusters; i++) this.growCluster(grid, 'hill', 5);
        }

        // 2. Balance per-player zones for the requested terrain types
        const zoneSpawns = spawns ?? this.getSpawnPoints(playerCount, width, height, mapType);
        const zoneRadius = Math.max(3, Math.floor(Math.sqrt(area / playerCount) / 2));
        this.balanceZone(grid, width, height, zoneSpawns, zoneRadius, { balanceTerrainTypes: terrainTypes });
    }

    /**
     * Zone = cells within Manhattan distance zoneRadius of each spawn.
     * Balance selected terrain (water/hill/plain), towns, treasures per zone; changes kept minimal (one flip per zone per type per round).
     * balanceTerrainTypes: which terrain to balance (default ['water','hill','plain']). Omit water e.g. in rivers.
     * balanceTowns / balanceTreasures: run after towns/treasures are placed (default true).
     * balanceGoldMines: balance gold mines per zone (default false; used for mountains).
     */
    static balanceZone(
        grid: Cell[][],
        width: number,
        height: number,
        spawns: { r: number; c: number }[],
        zoneRadius: number,
        options?: {
            minimal?: boolean;
            maxRounds?: number;
            tolerance?: number;
            /** Terrain types to balance; default ['water','hill','plain']. Omit water e.g. in rivers to preserve river layout. */
            balanceTerrainTypes?: ('water' | 'hill' | 'plain')[];
            balanceTowns?: boolean;
            balanceTreasures?: boolean;
            balanceGoldMines?: boolean;
        }
    ) {
        const minimal = options?.minimal ?? false;
        const maxRounds = options?.maxRounds ?? (minimal ? 25 : 120);
        const tolerance = options?.tolerance ?? (minimal ? 3 : 2);
        const balanceTypes = options?.balanceTerrainTypes ?? ['water', 'hill', 'plain'];
        const balanceWater = balanceTypes.includes('water');
        const balanceHill = balanceTypes.includes('hill');
        const balancePlain = balanceTypes.includes('plain');
        const balanceTowns = options?.balanceTowns ?? true;
        const balanceTreasures = options?.balanceTreasures ?? true;
        const balanceGoldMines = options?.balanceGoldMines ?? false;

        const manhattan = (r1: number, c1: number, r2: number, c2: number) =>
            Math.abs(r1 - r2) + Math.abs(c1 - c2);

        const getZoneIndices = (r: number, c: number): number[] => {
            const indices: number[] = [];
            for (let i = 0; i < spawns.length; i++) {
                if (manhattan(r, c, spawns[i].r, spawns[i].c) <= zoneRadius) indices.push(i);
            }
            return indices;
        };

        // Per-zone counts: cell in zone i adds to plain[i]/water[i]/hill[i]; overlapping cells count in each zone.
        const countPerZone = () => {
            const plain = new Array<number>(spawns.length).fill(0);
            const water = new Array<number>(spawns.length).fill(0);
            const hill = new Array<number>(spawns.length).fill(0);
            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    const zones = getZoneIndices(r, c);
                    const cell = grid[r][c];
                    const type = cell.type;
                    for (const i of zones) {
                        if (type === 'plain') plain[i]++;
                        else if (type === 'water') water[i]++;
                        else if (type === 'hill') hill[i]++;
                    }
                }
            }
            return { plain, water, hill };
        };

        const hasPlainNeighbor = (r: number, c: number): boolean => {
            const neighbors = [
                [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]
            ];
            return neighbors.some(([nr, nc]) => this.isValid(grid, nr, nc) && grid[nr][nc].type === 'plain');
        };

        const hasWaterNeighbor = (r: number, c: number): boolean => {
            const neighbors = [
                [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]
            ];
            return neighbors.some(([nr, nc]) => this.isValid(grid, nr, nc) && grid[nr][nc].type === 'water');
        };

        const n = spawns.length;
        // Targets are based on initial per-zone totals and stay fixed across rounds.
        const initialTerrain = countPerZone();
        const tWater = initialTerrain.water.reduce((a, b) => a + b, 0) / n;
        const tHill = initialTerrain.hill.reduce((a, b) => a + b, 0) / n;
        const tPlain = initialTerrain.plain.reduce((a, b) => a + b, 0) / n; // 各区内平原总计之和 ÷ n
        const countTownPerZone = (): number[] => {
            const townCounts = new Array<number>(spawns.length).fill(0);
            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    if (grid[r][c].building !== 'town') continue;
                    for (const i of getZoneIndices(r, c)) townCounts[i]++;
                }
            }
            return townCounts;
        };
        const countTreasurePerZone = (): number[] => {
            const treasureCounts = new Array<number>(spawns.length).fill(0);
            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    const gold = grid[r][c].treasureGold;
                    if (gold == null || gold <= 0) continue;
                    for (const i of getZoneIndices(r, c)) treasureCounts[i]++;
                }
            }
            return treasureCounts;
        };
        const countMinePerZone = (): number[] => {
            const mineCounts = new Array<number>(spawns.length).fill(0);
            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    if (grid[r][c].building !== 'gold_mine') continue;
                    for (const i of getZoneIndices(r, c)) mineCounts[i]++;
                }
            }
            return mineCounts;
        };
        const tTown = countTownPerZone().reduce((a, b) => a + b, 0) / n; // 各区内村落总计之和 ÷ n
        const tTreasure = countTreasurePerZone().reduce((a, b) => a + b, 0) / n; // 各区内宝箱总计之和 ÷ n
        const tMine = countMinePerZone().reduce((a, b) => a + b, 0) / n; // 各区内金矿总计之和 ÷ n

        for (let round = 0; round < maxRounds; round++) {
            const { water, hill, plain } = countPerZone();

            let changed = false;

            if (balanceWater) {
                // Balance water: remove one boundary water from an excess zone, add one adjacent to water in a deficit zone (keeps clustering)
                for (let i = 0; i < n; i++) {
                    if (water[i] <= tWater + tolerance) continue;
                    const candidates: { r: number; c: number }[] = [];
                    for (let r = 0; r < height; r++) {
                        for (let c = 0; c < width; c++) {
                            if (grid[r][c].type !== 'water') continue;
                            if (!getZoneIndices(r, c).includes(i)) continue;
                            if (!hasPlainNeighbor(r, c)) continue;
                            candidates.push({ r, c });
                        }
                    }
                    if (candidates.length > 0) {
                        const pick = candidates[Math.floor(Math.random() * candidates.length)];
                        grid[pick.r][pick.c].type = 'plain';
                        changed = true;
                    }
                }
                for (let i = 0; i < n; i++) {
                    if (water[i] >= tWater - tolerance) continue;
                    const candidates: { r: number; c: number }[] = [];
                    for (let r = 0; r < height; r++) {
                        for (let c = 0; c < width; c++) {
                            if (grid[r][c].type !== 'plain') continue;
                            if (!getZoneIndices(r, c).includes(i)) continue;
                            if (!hasWaterNeighbor(r, c)) continue;
                            candidates.push({ r, c });
                        }
                    }
                    if (candidates.length > 0) {
                        const pick = candidates[Math.floor(Math.random() * candidates.length)];
                        grid[pick.r][pick.c].type = 'water';
                        changed = true;
                    }
                }
            }

            if (balanceHill) {
                // Balance hill: remove one from excess zone, add one in deficit zone
                for (let i = 0; i < n; i++) {
                    if (hill[i] <= tHill + tolerance) continue;
                    const candidates: { r: number; c: number }[] = [];
                    for (let r = 0; r < height; r++) {
                        for (let c = 0; c < width; c++) {
                            if (grid[r][c].type !== 'hill') continue;
                            if (!getZoneIndices(r, c).includes(i)) continue;
                            candidates.push({ r, c });
                        }
                    }
                    if (candidates.length > 0) {
                        const pick = candidates[Math.floor(Math.random() * candidates.length)];
                        grid[pick.r][pick.c].type = 'plain';
                        changed = true;
                    }
                }
                for (let i = 0; i < n; i++) {
                    if (hill[i] >= tHill - tolerance) continue;
                    const candidates: { r: number; c: number }[] = [];
                    for (let r = 0; r < height; r++) {
                        for (let c = 0; c < width; c++) {
                            if (grid[r][c].type !== 'plain') continue;
                            if (!getZoneIndices(r, c).includes(i)) continue;
                            candidates.push({ r, c });
                        }
                    }
                    if (candidates.length > 0) {
                        const pick = candidates[Math.floor(Math.random() * candidates.length)];
                        grid[pick.r][pick.c].type = 'hill';
                        changed = true;
                    }
                }
            }

            if (balancePlain) {
                for (let i = 0; i < n; i++) {
                    if (plain[i] <= tPlain + tolerance) continue;
                    const candidates: { r: number; c: number }[] = [];
                    for (let r = 0; r < height; r++) {
                        for (let c = 0; c < width; c++) {
                            if (grid[r][c].type !== 'plain') continue;
                            if (!getZoneIndices(r, c).includes(i)) continue;
                            candidates.push({ r, c });
                        }
                    }
                    if (candidates.length > 0) {
                        const pick = candidates[Math.floor(Math.random() * candidates.length)];
                        grid[pick.r][pick.c].type = 'hill';
                        changed = true;
                    }
                }
                for (let i = 0; i < n; i++) {
                    if (plain[i] >= tPlain - tolerance) continue;
                    const candidates: { r: number; c: number }[] = [];
                    for (let r = 0; r < height; r++) {
                        for (let c = 0; c < width; c++) {
                            if (grid[r][c].type !== 'hill') continue;
                            if (!getZoneIndices(r, c).includes(i)) continue;
                            candidates.push({ r, c });
                        }
                    }
                    if (candidates.length > 0) {
                        const pick = candidates[Math.floor(Math.random() * candidates.length)];
                        grid[pick.r][pick.c].type = 'plain';
                        changed = true;
                    }
                }
            }

            if (balanceTowns) {
                const townCounts = countTownPerZone();
                for (let i = 0; i < n; i++) {
                    if (townCounts[i] <= tTown + tolerance) continue;
                    const candidates: { r: number; c: number }[] = [];
                    for (let r = 0; r < height; r++) {
                        for (let c = 0; c < width; c++) {
                            if (grid[r][c].building !== 'town') continue;
                            if (!getZoneIndices(r, c).includes(i)) continue;
                            candidates.push({ r, c });
                        }
                    }
                    if (candidates.length > 0) {
                        const pick = candidates[Math.floor(Math.random() * candidates.length)];
                        grid[pick.r][pick.c].building = 'none';
                        grid[pick.r][pick.c].townIncome = 0;
                        townCounts[i]--;
                        changed = true;
                    }
                }
                for (let i = 0; i < n; i++) {
                    if (townCounts[i] >= tTown - tolerance) continue;
                    const candidates: { r: number; c: number }[] = [];
                    for (let r = 0; r < height; r++) {
                        for (let c = 0; c < width; c++) {
                            if (grid[r][c].type !== 'plain' || grid[r][c].building !== 'none') continue;
                            if (!getZoneIndices(r, c).includes(i)) continue;
                            let tooClose = false;
                            for (let tr = r - 2; tr <= r + 2; tr++) {
                                for (let tc = c - 2; tc <= c + 2; tc++) {
                                    if (this.isValid(grid, tr, tc) && (grid[tr][tc].building === 'town' || grid[tr][tc].building === 'base')) tooClose = true;
                                }
                            }
                            if (!tooClose) candidates.push({ r, c });
                        }
                    }
                    if (candidates.length > 0) {
                        const pick = candidates[Math.floor(Math.random() * candidates.length)];
                        grid[pick.r][pick.c].building = 'town';
                        grid[pick.r][pick.c].townIncome = GameConfig.TOWN_INCOME_BASE;
                        changed = true;
                    }
                }
            }

            if (balanceTreasures) {
                const treasureCounts = countTreasurePerZone();
                for (let i = 0; i < n; i++) {
                    if (treasureCounts[i] <= tTreasure + tolerance) continue;
                    const candidates: { r: number; c: number }[] = [];
                    for (let r = 0; r < height; r++) {
                        for (let c = 0; c < width; c++) {
                            const gold = grid[r][c].treasureGold;
                            if (gold == null || gold <= 0) continue;
                            if (!getZoneIndices(r, c).includes(i)) continue;
                            candidates.push({ r, c });
                        }
                    }
                    if (candidates.length > 0) {
                        const pick = candidates[Math.floor(Math.random() * candidates.length)];
                        grid[pick.r][pick.c].treasureGold = null;
                        treasureCounts[i]--;
                        changed = true;
                    }
                }
                for (let i = 0; i < n; i++) {
                    if (treasureCounts[i] >= tTreasure - tolerance) continue;
                    const candidates: { r: number; c: number }[] = [];
                    for (let r = 0; r < height; r++) {
                        for (let c = 0; c < width; c++) {
                            if ((grid[r][c].type !== 'plain' && grid[r][c].type !== 'water') || grid[r][c].building !== 'none' || grid[r][c].owner != null) continue;
                            if (grid[r][c].treasureGold != null) continue;
                            if (!getZoneIndices(r, c).includes(i)) continue;
                            candidates.push({ r, c });
                        }
                    }
                    if (candidates.length > 0) {
                        const pick = candidates[Math.floor(Math.random() * candidates.length)];
                        const minG = GameConfig.TREASURE_GOLD_MIN;
                        const maxG = GameConfig.TREASURE_GOLD_MAX;
                        grid[pick.r][pick.c].treasureGold = minG + Math.floor(Math.random() * (maxG - minG + 1));
                        changed = true;
                    }
                }
            }

            if (balanceGoldMines) {
                const mineCounts = countMinePerZone();
                const hasAdjacentGoldMine = (r: number, c: number): boolean => {
                    const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
                    return neighbors.some(([nr, nc]) => this.isValid(grid, nr, nc) && grid[nr][nc].building === 'gold_mine');
                };
                for (let i = 0; i < n; i++) {
                    if (mineCounts[i] <= tMine + tolerance) continue;
                    const candidates: { r: number; c: number }[] = [];
                    for (let r = 0; r < height; r++) {
                        for (let c = 0; c < width; c++) {
                            if (grid[r][c].building !== 'gold_mine') continue;
                            if (!getZoneIndices(r, c).includes(i)) continue;
                            candidates.push({ r, c });
                        }
                    }
                    if (candidates.length > 0) {
                        const pick = candidates[Math.floor(Math.random() * candidates.length)];
                        grid[pick.r][pick.c].building = 'none';
                        mineCounts[i]--;
                        changed = true;
                    }
                }
                for (let i = 0; i < n; i++) {
                    if (mineCounts[i] >= tMine - tolerance) continue;
                    const candidates: { r: number; c: number }[] = [];
                    for (let r = 0; r < height; r++) {
                        for (let c = 0; c < width; c++) {
                            if (grid[r][c].type !== 'hill' || grid[r][c].building !== 'none') continue;
                            if (!getZoneIndices(r, c).includes(i)) continue;
                            if (hasAdjacentGoldMine(r, c)) continue;
                            candidates.push({ r, c });
                        }
                    }
                    if (candidates.length > 0) {
                        const pick = candidates[Math.floor(Math.random() * candidates.length)];
                        grid[pick.r][pick.c].building = 'gold_mine';
                        changed = true;
                    }
                }
            }

            if (!changed) break;
        }
    }

    private static generateArchipelago(grid: Cell[][], width: number, height: number, playerCount: number, spawns: { r: number; c: number }[]) {
        // Start with WATER
        this.fillGrid(grid, 'water');

        const area = width * height;
        const targetLand = Math.floor(area * 0.45);
        const playerIslandRatio = 0.65;
        const targetPlayerIsland = Math.max(10, Math.floor((targetLand / playerCount) * playerIslandRatio));
        const minPlayerIsland = Math.max(8, Math.floor(targetPlayerIsland * 0.85));

        // Generate Player Islands first (disconnected)
        for (let i = 0; i < playerCount; i++) {
            const spawn = spawns[i] ?? this.getSpawnPoint(i, playerCount, width, height, 'archipelago');
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
        this.separateSpawnIslands(grid, width, height, spawns);

        const playerLandSet = this.collectPlayerLand(grid, spawns);
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

    private static generatePangaea(grid: Cell[][], width: number, height: number, playerCount: number = 2, spawns: { r: number; c: number }[]) {
        // 1. Start with Land, then carve edge water inward until ~30% water
        this.fillGrid(grid, 'plain');
        const minDim = Math.min(width, height);
        const edgeBand = Math.max(1, Math.floor(minDim * 0.1));
        const maxEdgeDist = Math.max(edgeBand + 1, Math.floor(minDim / 2));
        const edgeWaterProb = 0.97;
        const minWaterProb = 0.08;
        const targetWater = Math.floor(width * height * 0.35);
        let waterCount = 0;
        const order: { r: number; c: number; edgeDist: number }[] = [];
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                const edgeDist = Math.min(r, c, height - 1 - r, width - 1 - c);
                order.push({ r, c, edgeDist });
            }
        }
        order.sort((a, b) => a.edgeDist - b.edgeDist || Math.random() - 0.5);
        // Extra randomness per ring to avoid overly uniform inward expansion
        for (let i = 0; i < order.length; ) {
            const d = order[i].edgeDist;
            let j = i + 1;
            while (j < order.length && order[j].edgeDist === d) j++;
            for (let k = j - 1; k > i; k--) {
                const swap = i + Math.floor(Math.random() * (k - i + 1));
                [order[k], order[swap]] = [order[swap], order[k]];
            }
            i = j;
        }
        for (const { r, c, edgeDist } of order) {
            if (waterCount >= targetWater) break;
            let waterProb = edgeWaterProb;
            if (edgeDist > edgeBand) {
                const t = (edgeDist - edgeBand) / (maxEdgeDist - edgeBand);
                waterProb = Math.max(minWaterProb, edgeWaterProb * (1 - t));
            }
            if (Math.random() < waterProb) {
                grid[r][c].type = 'water';
                waterCount++;
            }
        }
        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);

        // 2. Spawn Clusters (Anchor Points)
        const spawnPoints = spawns;
        for (let i = 0; i < playerCount; i++) {
            const spawn = spawns[i] ?? this.getSpawnPoint(i, playerCount, width, height, 'pangaea');
            // Large cluster at spawn to guarantee start area
            const spawnClusterSize = Math.max(8, Math.floor((width * height) / playerCount / 5));
            this.growClusterAt(grid, spawn.r, spawn.c, 'plain', spawnClusterSize, 'water');
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

        // 4. Add Texture (Hills, Forests?)
        this.scatterTerrain(grid, 'hill', 0.15, 'plain');

        // Ensure each spawn is connected to the main landmass
        this.ensureSpawnsOnMainland(grid, width, height, spawnPoints);
        this.trimToMainland(grid, width, height);
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

    private static trimToMainland(grid: Cell[][], width: number, height: number) {
        const { masses } = this.getLandmasses(grid, width, height);
        if (masses.length <= 1) return;
        masses.sort((a, b) => b.cells.length - a.cells.length);
        for (let i = 1; i < masses.length; i++) {
            for (const cell of masses[i].cells) {
                const c = grid[cell.r][cell.c];
                c.type = 'water';
                c.building = 'none';
                c.owner = null;
                c.treasureGold = null;
            }
        }
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

    private static generateMountains(grid: Cell[][], width: number, height: number, playerCount: number, spawns: { r: number; c: number }[]) {
        // Default land gen (with zone balance)
        this.generateDefault(grid, width, height, playerCount, 'mountains', undefined, spawns);

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
        this.distributeGoldMines(grid, width, height, spawns);
    }

    private static generateRivers(grid: Cell[][], width: number, height: number, playerCount: number = 2, spawns: { r: number; c: number }[]) {
        // 1. Base terrain without water: plain + hill only; water is created in step 2
        this.generateDefault(grid, width, height, playerCount, 'rivers', ['hill', 'plain'], spawns);
        const area = width * height;
        const zoneRadius = Math.max(3, Math.floor(Math.sqrt(area / playerCount) / 2));

        // 2. Place all rivers/water along bisectors (no pre-existing water)
        this.addRiversAlongBisectors(grid, width, height, spawns);

        // 3. Re-apply zone balance for hill and plain only (do not balance water so river layout is preserved)
        this.balanceZone(grid, width, height, spawns, zoneRadius, { balanceTerrainTypes: ['hill', 'plain'] });
    }

    /**
     * Rivers: cells equidistant from two nearest spawns are preferred; water forms thin continuous lines
     * (exactly 1 river-neighbor when extending = no branching, no widening). Total water target ~18%
     * so rivers stay narrow; cap remains 35% if design allows.
     */
    private static addRiversAlongBisectors(
        grid: Cell[][],
        width: number,
        height: number,
        spawns: { r: number; c: number }[]
    ) {
        const area = width * height;
        // Target ~18% water so rivers stay narrow; hard cap remains 35% if needed
        const targetWaterRatio = 0.18;
        const maxWaterCells = Math.floor(area * targetWaterRatio);

        const manhattan = (r1: number, c1: number, r2: number, c2: number) =>
            Math.abs(r1 - r2) + Math.abs(c1 - c2);

        const neighborsOf = (r: number, c: number) => [
            { r: r - 1, c }, { r: r + 1, c }, { r, c: c - 1 }, { r, c: c + 1 }
        ].filter((n) => this.isValid(grid, n.r, n.c));

        const getScore = (r: number, c: number): number => {
            const dists = spawns.map((s) => manhattan(r, c, s.r, s.c)).sort((a, b) => a - b);
            const d1 = dists[0];
            const d2 = dists[1];
            return 1 / (1 + Math.abs(d2 - d1));
        };
        // Pick randomly among top N by score so rivers meander instead of straight lines
        const pickFromTop = <T>(arr: T[], scoreDesc: (t: T) => number, topN: number): T => {
            if (arr.length === 0) throw new Error('empty');
            const sorted = [...arr].sort((a, b) => scoreDesc(b) - scoreDesc(a));
            const n = Math.min(topN, sorted.length);
            return sorted[Math.floor(Math.random() * n)];
        };

        let currentWater = 0;
        for (let r = 0; r < height; r++)
            for (let c = 0; c < width; c++)
                if (grid[r][c].type === 'water') currentWater++;
        const riverBudget = Math.max(0, maxWaterCells - currentWater);
        if (riverBudget <= 0) return;

        const riverSet = new Set<string>();
        const key = (r: number, c: number) => `${r},${c}`;
        const centerR = Math.floor(height / 2);
        const centerC = Math.floor(width / 2);
        if (this.isValid(grid, centerR, centerC) && grid[centerR][centerC].type !== 'water') {
            riverSet.add(key(centerR, centerC));
        }
        const riverNeighborCount = (r: number, c: number): number =>
            neighborsOf(r, c).filter((n) => riverSet.has(key(n.r, n.c))).length;

        // isAdjacentToRiver no longer needed after center re-seed change.

        // All non-water cells with score, sorted by score desc (for picking seeds)
        let scoredCells: { r: number; c: number; score: number }[] = [];
        const refreshScoredCells = () => {
            scoredCells = [];
            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    if (grid[r][c].type === 'water' || riverSet.has(key(r, c))) continue;
                    scoredCells.push({ r, c, score: getScore(r, c) });
                }
            }
            scoredCells.sort((a, b) => b.score - a.score);
        };
        refreshScoredCells();

        // isAdjacentToExistingWater no longer needed after center re-seed change.

        while (riverSet.size < riverBudget) {
            const seen = new Set<string>();
            const tipCandidates: { r: number; c: number; score: number; neighbors: number }[] = [];
            for (const k of riverSet) {
                const [r, c] = k.split(',').map(Number);
                for (const n of neighborsOf(r, c)) {
                    if (riverSet.has(key(n.r, n.c)) || grid[n.r][n.c].type === 'water') continue;
                    if (seen.has(key(n.r, n.c))) continue;
                    seen.add(key(n.r, n.c));
                    const cnt = riverNeighborCount(n.r, n.c);
                    if (cnt >= 1 && cnt <= 2) {
                        const base = getScore(n.r, n.c);
                        const score = base + (Math.random() - 0.5) * 0.12;
                        tipCandidates.push({ r: n.r, c: n.c, score, neighbors: cnt });
                    }
                }
            }
            // Prefer extend (1 neighbor) then bridge (2 neighbors); pick from top 2–3 only for mild meander
            if (tipCandidates.length > 0) {
                tipCandidates.sort((a, b) => a.neighbors - b.neighbors || b.score - a.score);
                const bestNeighbors = tipCandidates[0].neighbors;
                const sameTier = tipCandidates.filter((t) => t.neighbors === bestNeighbors);
                const chosen = sameTier.length <= 2
                    ? sameTier[Math.floor(Math.random() * sameTier.length)]
                    : pickFromTop(sameTier, (t) => t.score, 3);
                riverSet.add(key(chosen.r, chosen.c));
                continue;
            }

            // No adjacent candidate: re-seed from map center (or stop if already river).
            if (!riverSet.has(key(centerR, centerC))) {
                riverSet.add(key(centerR, centerC));
            } else {
                break;
            }
        }

        // Final pass: fill enclosed holes (all 4 neighbors are water/river) with high probability
        const surrounded: { r: number; c: number }[] = [];
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                if (grid[r][c].type === 'water' || riverSet.has(key(r, c))) continue;
                const neighbors = neighborsOf(r, c);
                if (neighbors.length < 4) continue;
                const allWaterLike = neighbors.every((n) => riverSet.has(key(n.r, n.c)) || grid[n.r][n.c].type === 'water');
                if (allWaterLike && Math.random() < 0.7) surrounded.push({ r, c });
            }
        }
        for (const cell of surrounded) {
            riverSet.add(key(cell.r, cell.c));
        }

        for (const k of riverSet) {
            const [r, c] = k.split(',').map(Number);
            grid[r][c].type = 'water';
        }
    }

    private static ensureAccessibility(grid: Cell[][], width: number, height: number, playerCount: number, spawns: { r: number; c: number }[]) {
        // Ensure no player is boxed in by Water or Hills immediately
        for (let i = 0; i < playerCount; i++) {
            const spawn = spawns[i] ?? this.getSpawnPoint(i, playerCount, width, height, 'default');
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

    private static distributeTreasures(grid: Cell[][], width: number, height: number, playerCount: number, spawns: { r: number; c: number }[]) {
        const manhattan = (r1: number, c1: number, r2: number, c2: number) =>
            Math.abs(r1 - r2) + Math.abs(c1 - c2);

        // Flotsam: 8%~15% of all water tiles get treasure
        let waterCells: { r: number; c: number }[] = [];
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                const cell = grid[r][c];
                if (cell.type !== 'water') continue;
                if (cell.owner !== null || cell.building !== 'none' || cell.treasureGold !== null) continue;
                waterCells.push({ r, c });
            }
        }
        const flotsamRatio = 0.08 + Math.random() * 0.07;
        const flotsamTarget = Math.floor(waterCells.length * flotsamRatio);
        waterCells.sort(() => Math.random() - 0.5);
        const minGold = GameConfig.TREASURE_GOLD_MIN;
        const maxGold = GameConfig.TREASURE_GOLD_MAX;
        for (let i = 0; i < flotsamTarget && i < waterCells.length; i++) {
            const { r, c } = waterCells[i];
            grid[r][c].treasureGold = minGold + Math.floor(Math.random() * (maxGold - minGold + 1));
        }

        // Per-player treasure chests on land only: ~2%~4% of plain tiles
        let validPlainCount = 0;
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                const cell = grid[r][c];
                if (cell.type !== 'plain') continue;
                if (cell.owner !== null || cell.building !== 'none' || cell.treasureGold !== null) continue;
                validPlainCount++;
            }
        }
        const chestRatio = 0.02 + Math.random() * 0.02;
        const totalCount = Math.max(playerCount * 1, Math.floor(validPlainCount * chestRatio));
        const minDistance = Math.max(3, Math.floor(Math.min(width, height) / 6));
        const shortSide = Math.min(width, height);
        const scoreThreshold = shortSide / 3;
        const scoreNearbyPlayersTarget = 3;
        const chestMinSpacing = Math.max(2, Math.floor(Math.min(width, height) / 8));

        const candidates: { r: number; c: number }[] = [];
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                const cell = grid[r][c];
                if (cell.type !== 'plain') continue;
                if (cell.owner !== null || cell.building !== 'none') continue;
                if (cell.treasureGold !== null) continue;
                let minSpawnDist = Infinity;
                for (const sp of spawns) {
                    const d = manhattan(r, c, sp.r, sp.c);
                    if (d < minSpawnDist) minSpawnDist = d;
                }
                if (minSpawnDist >= minDistance) candidates.push({ r, c });
            }
        }

        const playerScores = new Array<number>(playerCount).fill(0);
        for (let i = 0; i < flotsamTarget && i < waterCells.length; i++) {
            const { r, c } = waterCells[i];
            const dists = spawns.map((s, idx) => ({ idx, d: manhattan(r, c, s.r, s.c) }));
            dists.sort((a, b) => a.d - b.d);
            const nearest3 = dists.slice(0, Math.min(3, dists.length));
            const effectiveCount = dists.filter((x) => x.d <= scoreThreshold).length;
            for (const { idx, d } of nearest3) {
                playerScores[idx] += 0.5 * Math.max(scoreNearbyPlayersTarget - effectiveCount, scoreThreshold - d);
            }
        }

        const pickedSet = new Set<string>();
        const picks: { r: number; c: number }[] = [];
        const minPickedDistance = (r: number, c: number): number | null => {
            if (picks.length === 0) return null;
            let best = Infinity;
            for (const p of picks) {
                const d = manhattan(r, c, p.r, p.c);
                if (d < best) best = d;
            }
            return Number.isFinite(best) ? best : null;
        };

        for (let i = 0; i < totalCount; i++) {
            let bestCell: { r: number; c: number } | null = null;
            let bestImbalance = Infinity;
            let bestContributions: number[] | null = null;

            for (const { r, c } of candidates) {
                if (pickedSet.has(`${r},${c}`)) continue;
                const minChestDist = minPickedDistance(r, c);
                if (minChestDist !== null && minChestDist < chestMinSpacing) continue;
                const dists = spawns.map((s, idx) => ({ idx, d: manhattan(r, c, s.r, s.c) }));
                dists.sort((a, b) => a.d - b.d);
                const nearest3 = dists.slice(0, Math.min(3, dists.length));
                const effectiveCount = dists.filter((x) => x.d <= scoreThreshold).length;
                const contributions = new Array<number>(playerCount).fill(0);
                for (const { idx, d } of nearest3) {
                    contributions[idx] = Math.max(scoreNearbyPlayersTarget - effectiveCount, scoreThreshold - d);
                }
                const newScores = playerScores.map((s, j) => s + contributions[j]);
                const avgScore = newScores.reduce((a, b) => a + b, 0) / playerCount;
                const imbalance = newScores.reduce((sum, s) => sum + Math.abs(s - avgScore), 0);
                if (imbalance < bestImbalance || (imbalance === bestImbalance && Math.random() < 0.5)) {
                    bestImbalance = imbalance;
                    bestCell = { r, c };
                    bestContributions = contributions;
                }
            }
            if (!bestCell || !bestContributions) break;
            pickedSet.add(`${bestCell.r},${bestCell.c}`);
            picks.push(bestCell);
            for (let j = 0; j < playerCount; j++) playerScores[j] += bestContributions[j];
        }

        for (const { r, c } of picks) {
            grid[r][c].treasureGold = minGold + Math.floor(Math.random() * (maxGold - minGold + 1));
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
                    }
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

    private static distributeTowns(
        grid: Cell[][],
        width: number,
        height: number,
        zoneOptions?: { playerCount: number; spawns: { r: number; c: number }[]; zoneRadius: number }
    ) {
        const area = width * height;
        const townCount = Math.max(5, Math.floor(area / 15)); // ~6-7 towns per 100 tiles

        const manhattan = (r1: number, c1: number, r2: number, c2: number) =>
            Math.abs(r1 - r2) + Math.abs(c1 - c2);

        const canPlaceTown = (r: number, c: number): boolean => {
            if (grid[r][c].type !== 'plain' || grid[r][c].building !== 'none') return false;
            for (let tr = r - 2; tr <= r + 2; tr++) {
                for (let tc = c - 2; tc <= c + 2; tc++) {
                    if (this.isValid(grid, tr, tc) && (grid[tr][tc].building === 'town' || grid[tr][tc].building === 'base')) {
                        return false;
                    }
                }
            }
            return true;
        };

        if (zoneOptions) {
            const { playerCount, spawns, zoneRadius } = zoneOptions;
            const targetPerZone = Math.max(1, Math.floor(townCount / playerCount));
            for (let i = 0; i < spawns.length; i++) {
                const spawn = spawns[i];
                const candidates: { r: number; c: number }[] = [];
                for (let r = 0; r < height; r++) {
                    for (let c = 0; c < width; c++) {
                        if (manhattan(r, c, spawn.r, spawn.c) > zoneRadius) continue;
                        if (canPlaceTown(r, c)) candidates.push({ r, c });
                    }
                }
                let placedInZone = 0;
                while (placedInZone < targetPerZone && candidates.length > 0) {
                    const idx = Math.floor(Math.random() * candidates.length);
                    const { r, c } = candidates[idx];
                    candidates.splice(idx, 1);
                    if (!canPlaceTown(r, c)) continue;
                    grid[r][c].building = 'town';
                    grid[r][c].townIncome = GameConfig.TOWN_INCOME_BASE;
                    placedInZone++;
                }
            }
            return;
        }

        let placed = 0;
        let attempts = 0;
        while (placed < townCount && attempts < 500) {
            attempts++;
            const r = Math.floor(Math.random() * height);
            const c = Math.floor(Math.random() * width);
            if (canPlaceTown(r, c)) {
                grid[r][c].building = 'town';
                grid[r][c].townIncome = GameConfig.TOWN_INCOME_BASE;
                placed++;
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
