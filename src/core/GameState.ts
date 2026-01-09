import { Cell } from './Cell';
import { GameConfig, type Player, type PlayerID } from './GameConfig';
import { MapGenerator, type MapType } from './map/MapGenerator';

export class GameState {
    grid: Cell[][];
    players: Record<string, Player>;
    playerOrder: string[];
    allPlayerIds: string[]; // Persist full roster including eliminated players
    currentPlayerId: PlayerID;
    turnCount: number;
    currentMapType: MapType = 'default';

    constructor(playerConfigs: { id: string, isAI: boolean, color: number }[] = [], mapType: MapType = 'default') {
        this.grid = [];
        this.players = {};
        this.playerOrder = [];
        this.allPlayerIds = [];
        this.currentMapType = mapType;

        // specific default for 2 players if none provided (Backwards compatibility)
        if (playerConfigs.length === 0) {
            playerConfigs = [
                { id: 'P1', isAI: false, color: GameConfig.COLORS.P1 },
                { id: 'P2', isAI: true, color: GameConfig.COLORS.P2 }
            ];
        }

        playerConfigs.forEach(cfg => {
            this.players[cfg.id] = {
                id: cfg.id,
                color: cfg.color,
                gold: GameConfig.INITIAL_GOLD,
                isAI: cfg.isAI
            };
            this.playerOrder.push(cfg.id);
        });

        this.allPlayerIds = [...this.playerOrder]; // Initialize full roster

        this.currentPlayerId = this.playerOrder[0];
        this.turnCount = 1;
        this.initializeGrid();
    }

    private initializeGrid() {
        // 1. Initialize empty plain grid
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            this.grid[r] = [];
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                this.grid[r][c] = new Cell(r, c);
                this.grid[r][c].type = 'plain'; // Default
            }
        }

        // 2. Delegate to Generator
        MapGenerator.generate(this.grid, this.currentMapType, GameConfig.GRID_WIDTH, GameConfig.GRID_HEIGHT, this.playerOrder.length);

        this.setupBases();
    }

    private setupBases() {
        // Distributed Spawning Logic
        // Place players evenly along an inset rectangle/ellipse
        const count = this.playerOrder.length;
        if (count === 0) return;

        const w = GameConfig.GRID_WIDTH;
        const h = GameConfig.GRID_HEIGHT;

        // Inset by 2 tiles
        const margin = 2;
        const boundedW = w - 2 * margin;
        const boundedH = h - 2 * margin;

        for (let i = 0; i < count; i++) {
            const playerId = this.playerOrder[i];

            // Angle fraction
            const angle = (i / count) * 2 * Math.PI - (Math.PI / 2); // Start top -PI/2
            // Let's adjust angle so P1 at Top Left: That is roughly -3PI/4 or 5PI/4.
            const startOffset = -3 * Math.PI / 4;
            const finalAngle = angle + startOffset;

            // Simple Ellipse Projection
            // x = center + cos(a) * w/2
            const cx = w / 2;
            const cy = h / 2;

            // Use round to snap to grid
            let r = Math.round(cy + (boundedH / 2) * Math.sin(finalAngle));
            let c = Math.round(cx + (boundedW / 2) * Math.cos(finalAngle));

            // Clamp just in case
            r = Math.max(0, Math.min(h - 1, r));
            c = Math.max(0, Math.min(w - 1, c));

            // Set Base - Ensure Valid (If water, make plain or bridge?)
            // Force Plain for base
            this.grid[r][c].type = 'plain';

            this.setOwner(r, c, playerId);
            this.setBuilding(r, c, 'base');
        }
    }

    // Reset Game State
    reset(configs?: { id: string, isAI: boolean, color: number }[], keepMap: boolean = false, mapType?: MapType) {
        if (mapType) {
            this.currentMapType = mapType;
        }

        if (configs) {
            // Full Reset with new configs
            this.players = {};
            this.playerOrder = [];
            this.allPlayerIds = [];
            configs.forEach(cfg => {
                this.players[cfg.id] = {
                    id: cfg.id,
                    color: cfg.color,
                    gold: GameConfig.INITIAL_GOLD,
                    isAI: cfg.isAI
                };
                this.playerOrder.push(cfg.id);
            });
            this.allPlayerIds = [...this.playerOrder];
        } else {
            // Soft Reset (Keep Players)
            // Restore full player order from persistent roster
            this.playerOrder = [...this.allPlayerIds];

            this.playerOrder.forEach(pid => {
                if (this.players[pid]) {
                    this.players[pid].gold = GameConfig.INITIAL_GOLD;
                }
            });
        }

        this.currentPlayerId = this.playerOrder[0];
        this.turnCount = 1;

        if (keepMap) {
            // Preserve Terrain Types, Reset Ownership/Buildings
            for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
                for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                    const cell = this.grid[r][c];
                    cell.owner = null;
                    cell.isConnected = false;

                    // Reset Buildings but KEEP TOWNS (and potentially other map features)
                    // If it was a base, remove it (setupBases will restore).
                    // If it was a town, keep it.
                    if (cell.building === 'base') {
                        cell.building = 'none';
                    }
                    // If building is town, leave it.

                    // Revert bridges to water
                    if (cell.type === 'bridge') {
                        cell.type = 'water';
                        cell.building = 'none'; // Ensure no building on bridge
                    }
                }
            }
            // Re-spawn Bases
            this.setupBases();
            // For this strictly typed edit, I can't call private method.
            // I will skip town regen for "keepMap" for now or expose it differently?
            // Actually, if I modify MapGenerator to have public `distributeTowns`, I can call it.
            // I'll update MapGenerator in separate step if needed. 
            // For now, "Keep Map" will result in No Towns unless I handle it. 
            // Actually, `generateTerrain` was integrated.
            // I'll make a public static method on GameState or MapGenerator?
            // I'll stick to simple logic: If keepMap, terrain stays. Towns are gone. 
            // Proceed with edit.
        } else {
            // Full Map Regenerate
            this.grid = [];
            this.initializeGrid();
        }
    }


    // isValidCell removed as it was unused and duplicate of GameEngine logic


    getCell(row: number, col: number): Cell | null {
        if (row < 0 || row >= GameConfig.GRID_HEIGHT || col < 0 || col >= GameConfig.GRID_WIDTH) {
            return null;
        }
        return this.grid[row][col];
    }

    setOwner(row: number, col: number, owner: PlayerID) {
        const cell = this.getCell(row, col);
        if (cell) cell.owner = owner;
    }

    setBuilding(row: number, col: number, type: 'base' | 'town' | 'gold_mine' | 'none') {
        const cell = this.getCell(row, col);
        if (cell) cell.building = type;
    }

    getCurrentPlayer(): Player {
        return this.players[this.currentPlayerId!];
    }

    endTurn(): { total: number, base: number, land: number, landCount: number, depletedMines: { r: number, c: number }[] } | null {
        // Switch player
        const currentIndex = this.playerOrder.indexOf(this.currentPlayerId!);
        const nextIndex = (currentIndex + 1) % this.playerOrder.length;
        this.currentPlayerId = this.playerOrder[nextIndex];

        // Resource Accrual
        // Increment turn count only when cycling back to first player? 
        // Or just global turn count? Usually "Day 1" implies everyone moves once.
        if (nextIndex === 0) {
            this.turnCount++;
        }
        return this.accrueResources(this.currentPlayerId!);
    }

    public accrueResources(playerId: PlayerID) {
        if (!playerId) return null;

        // User Request: Determine connectivity state BEFORE calculating income
        this.updateConnectivity(playerId);

        let landCount = 0;
        let landIncome = 0;
        const depletedMines: { r: number, c: number }[] = [];

        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                const cell = this.grid[r][c];
                if (cell.owner === playerId) {

                    if (cell.building === 'town') {
                        // Town Growth Logic
                        cell.townTurnCount++;
                        if (cell.townTurnCount % GameConfig.TOWN_GROWTH_INTERVAL === 0) {
                            if (cell.townIncome < GameConfig.TOWN_INCOME_CAP) {
                                cell.townIncome += GameConfig.TOWN_INCOME_GROWTH;
                            }
                        }
                        landIncome += cell.townIncome;
                        landCount++;
                    }
                    else if (cell.building === 'gold_mine') {
                        // Gold Mine Logic
                        landIncome += GameConfig.GOLD_MINE_INCOME;
                        landCount++;

                        // Depletion Check (Only if owned and active)
                        if (Math.random() < GameConfig.GOLD_MINE_DEPLETION_RATE) {
                            // Collapse!
                            cell.building = 'none';
                            depletedMines.push({ r, c });
                        }
                    }
                    else if (cell.type !== 'bridge') { // Bridges provide 0 income
                        landCount++;
                        // Income Logic: Full (1) if connected, Half (0.5) if disconnected
                        if (cell.isConnected) {
                            landIncome += GameConfig.GOLD_PER_LAND;
                        } else {
                            landIncome += GameConfig.GOLD_PER_LAND * 0.5;
                        }
                    }
                }
            }
        }

        const baseIncome = GameConfig.GOLD_PER_TURN_BASE;

        // Calculate Base Upgrade Bonuses
        let upgradeBonus = 0;
        // Scan all bases owned by player to add their upgrade bonuses
        // Wait, baseIncome is global "base" income? Or "from Base buildings"?
        // Original logic: "baseIncome = 10". Then adding land logic.
        // If I own multiple bases (from capturing), do I get multiple base incomes?
        // Currently: "active bases" logic isn't explicit, it's just a flat 10.
        // I should probably add the upgrade bonus based on the cell's level.

        // Re-scan or integrate into loop above? 
        // Iterate grid for Base Upgrades (since they are properties of the cell)
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                const cell = this.grid[r][c];
                if (cell.owner === playerId && cell.building === 'base' && cell.incomeLevel > 0) {
                    // Arrays are 0-indexed. Level 1 -> index 0.
                    // Bonus is cumulative? "Increases income BY 1, 2...". 
                    // User said: "Upgrade 4 times... increase income 1G, 2G... total 20".
                    // Implicit: Level 1 adds 1. Level 2 adds 2? Or Total is 1, 2, 3?
                    // "respectively increase income 1G, 2G... total 20"
                    // 1+2+3+4 = 10. 
                    // Base is 10. Total 20.
                    // So Level 1 adds +1. Level 2 adds +2 (Total +3). 
                    // I will implement as: Sum of bonuses up to current level.
                    let bonus = 0;
                    for (let i = 0; i < cell.incomeLevel; i++) {
                        bonus += GameConfig.UPGRADE_INCOME_BONUS[i];
                    }
                    upgradeBonus += bonus;
                }
            }
        }

        const total = baseIncome + landIncome + upgradeBonus;
        const finalTotal = Math.floor(total);

        this.players[playerId].gold += finalTotal;

        return { total: finalTotal, base: baseIncome, land: landIncome, landCount, depletedMines };
    }

    public calculateIncome(playerId: PlayerID): number {
        if (!playerId) return 0;

        // Ensure connectivity is current
        this.updateConnectivity(playerId);

        let landIncome = 0;

        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                const cell = this.grid[r][c];
                if (cell.owner === playerId) {
                    if (cell.building === 'town') {
                        landIncome += cell.townIncome;
                    } else if (cell.building === 'gold_mine') {
                        landIncome += GameConfig.GOLD_MINE_INCOME;
                    } else if (cell.type !== 'bridge') {
                        if (cell.isConnected) {
                            landIncome += GameConfig.GOLD_PER_LAND;
                        } else {
                            landIncome += GameConfig.GOLD_PER_LAND * 0.5;
                        }
                    }
                }
            }
        }

        return Math.floor(GameConfig.GOLD_PER_TURN_BASE + landIncome + this.calculateBaseUpgradeBonus(playerId));
    }

    private calculateBaseUpgradeBonus(playerId: PlayerID): number {
        let upgradeBonus = 0;
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                const cell = this.grid[r][c];
                if (cell.owner === playerId && cell.building === 'base' && cell.incomeLevel > 0) {
                    let bonus = 0;
                    for (let i = 0; i < cell.incomeLevel; i++) {
                        bonus += GameConfig.UPGRADE_INCOME_BONUS[i];
                    }
                    upgradeBonus += bonus;
                }
            }
        }
        return upgradeBonus;
    }

    public updateConnectivity(playerId: PlayerID) {
        if (!playerId) return;

        // 1. Find Base(s) and Reset Connectivity
        const queue: { r: number, c: number }[] = [];
        const ownedCells: { r: number, c: number }[] = [];

        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                const cell = this.grid[r][c];
                if (cell.owner === playerId) {
                    ownedCells.push({ r, c });
                    // Default to false first, we will mark true if found
                    cell.isConnected = false;

                    if (cell.building === 'base') {
                        cell.isConnected = true; // Base is always connected to itself
                        queue.push({ r, c });
                    }
                }
            }
        }

        // 2. BFS
        const visited = new Set<string>();
        queue.forEach(q => visited.add(`${q.r},${q.c}`));

        // Directions: Up, Down, Left, Right
        const dirs = [
            { r: -1, c: 0 }, { r: 1, c: 0 },
            { r: 0, c: -1 }, { r: 0, c: 1 }
        ];

        let head = 0;
        while (head < queue.length) {
            const curr = queue[head++];

            for (const d of dirs) {
                const nr = curr.r + d.r;
                const nc = curr.c + d.c;

                // Bounds Check
                if (nr >= 0 && nr < GameConfig.GRID_HEIGHT && nc >= 0 && nc < GameConfig.GRID_WIDTH) {
                    const key = `${nr},${nc}`;
                    const neighbor = this.grid[nr][nc];

                    // If owned by same player and not visited
                    if (neighbor.owner === playerId && !visited.has(key)) {
                        visited.add(key);
                        neighbor.isConnected = true;
                        queue.push({ r: nr, c: nc });
                    }
                }
            }
        }
    }

    public isAdjacentToOwned(row: number, col: number, playerId: PlayerID): boolean {
        const neighbors = [
            { r: row - 1, c: col }, { r: row + 1, c: col },
            { r: row, c: col - 1 }, { r: row, c: col + 1 }
        ];

        return neighbors.some(n => {
            const cell = this.getCell(n.r, n.c);
            return cell && cell.owner === playerId;
        });
    }

    public isAdjacentToConnected(row: number, col: number, playerId: PlayerID): boolean {
        const neighbors = [
            { r: row - 1, c: col }, { r: row + 1, c: col },
            { r: row, c: col - 1 }, { r: row, c: col + 1 }
        ];

        return neighbors.some(n => {
            const cell = this.getCell(n.r, n.c);
            return cell && cell.owner === playerId && cell.isConnected;
        });
    }

    serialize(): string {
        return JSON.stringify({
            grid: this.grid.map(row => row.map(cell => cell.serialize())),
            players: this.players,
            playerOrder: this.playerOrder,
            allPlayerIds: this.allPlayerIds, // Save persistence list
            turnCount: this.turnCount,
            currentPlayerId: this.currentPlayerId
        });
    }

    deserialize(json: string) {
        const data = JSON.parse(json);
        this.players = data.players;
        this.turnCount = data.turnCount;
        this.currentPlayerId = data.currentPlayerId;

        // Restore persistent list or fallback to players keys
        this.allPlayerIds = data.allPlayerIds || Object.keys(this.players);
        this.playerOrder = data.playerOrder || [...this.allPlayerIds]; // Fallback

        // Reconstruct Grid
        // Use loaded data dimensions
        const height = data.grid.length;
        const width = height > 0 ? data.grid[0].length : 0;

        // Reset grid to new size
        this.grid = [];

        for (let r = 0; r < height; r++) {
            this.grid[r] = [];
            for (let c = 0; c < width; c++) {
                this.grid[r][c] = Cell.deserialize(data.grid[r][c]);
            }
        }
    }
}
