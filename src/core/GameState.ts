import { Cell } from './Cell';
import { GameConfig, type Player, type PlayerID } from './GameConfig';

export class GameState {
    grid: Cell[][];
    players: Record<string, Player>;
    playerOrder: string[];
    allPlayerIds: string[]; // Persist full roster including eliminated players
    currentPlayerId: PlayerID;
    turnCount: number;

    constructor(playerConfigs: { id: string, isAI: boolean, color: number }[] = []) {
        this.grid = [];
        this.players = {};
        this.playerOrder = [];
        this.allPlayerIds = [];

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
                this.grid[r][c].type = 'plain';
            }
        }

        // 2. Generate Clustered Terrain
        this.generateTerrain();

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

        // Calculate positions
        // For 2 players: Corners (TL, BR)
        // For 4: Corners
        // For others: Circular calculation mapped to rectangle

        for (let i = 0; i < count; i++) {
            const playerId = this.playerOrder[i];

            // Angle fraction
            const angle = (i / count) * 2 * Math.PI - (Math.PI / 2); // Start top -PI/2 (Actually P1 is usually Top Left?)
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

            // Set Base
            this.setOwner(r, c, playerId);
            this.setBuilding(r, c, 'base');
            this.grid[r][c].type = 'plain'; // Force plain
        }
    }

    // Reset Game State
    reset(configs?: { id: string, isAI: boolean, color: number }[], keepMap: boolean = false) {
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
                // Ensure player object exists (it should, but safety first)
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
                    cell.building = 'none';
                    cell.isConnected = false;
                    // Type (water/hill/plain) remains
                    if (cell.type === 'bridge') cell.type = 'water'; // Revert bridges
                }
            }
            // Re-spawn Bases
            this.setupBases();
        } else {
            // Full Map Regenerate
            this.grid = [];
            this.initializeGrid();
        }
    }

    private generateTerrain() {
        // Config for Clusters
        const area = GameConfig.GRID_WIDTH * GameConfig.GRID_HEIGHT;
        // Scale clusters based on map size? 
        // Base was 10x10=100 cells. Clusters: 2 water, 3 hills.
        // Approx 2% water clusters, 3% hill clusters? Or just fixed?
        // Let's scale simply.
        const scaleFactor = area / 100;

        const waterClusters = Math.max(2, Math.floor(2 * scaleFactor));
        const waterSize = 6;
        const hillClusters = Math.max(3, Math.floor(3 * scaleFactor));
        const hillSize = 5;

        // Generate Water
        for (let i = 0; i < waterClusters; i++) {
            this.growCluster('water', waterSize);
        }

        // Generate Hills
        for (let i = 0; i < hillClusters; i++) {
            this.growCluster('hill', hillSize);
        }

        // Generate Towns
        // Let's place roughly 6-8 towns for a 10x10 map.
        const townCount = Math.max(5, Math.floor(6 * scaleFactor));
        let placedTowns: { r: number, c: number }[] = [];
        let attempts = 0;

        while (placedTowns.length < townCount && attempts < 200) {
            attempts++;
            const r = Math.floor(Math.random() * GameConfig.GRID_HEIGHT);
            const c = Math.floor(Math.random() * GameConfig.GRID_WIDTH);
            const cell = this.grid[r][c];

            // Only place on plain, not on edges (optional), not if already occupied
            if (cell.type === 'plain' && cell.building === 'none') {
                // Ensure not too close to potential bases? 
                // Bases are set later at corners/edges. Avoiding edges helps.
                if (r > 1 && r < GameConfig.GRID_HEIGHT - 2 && c > 1 && c < GameConfig.GRID_WIDTH - 2) {

                    // Check distance to existing towns
                    const tooClose = placedTowns.some(t => {
                        const dist = Math.abs(t.r - r) + Math.abs(t.c - c); // Manhattan
                        return dist < 3; // Minimum distance 3
                    });

                    if (!tooClose) {
                        this.setBuilding(r, c, 'town');
                        cell.townIncome = GameConfig.TOWN_INCOME_BASE;
                        placedTowns.push({ r, c });
                    }
                }
            }
        }
    }

    private growCluster(type: 'water' | 'hill', targetSize: number) {
        // ... (Existing implementation remains same, just ensuring context match for replace)
        // Pick random start (avoid corners roughly to save bases)
        let r = Math.floor(Math.random() * (GameConfig.GRID_HEIGHT - 2)) + 1;
        let c = Math.floor(Math.random() * (GameConfig.GRID_WIDTH - 2)) + 1;

        let size = 0;
        const queue: { r: number, c: number }[] = [{ r, c }];

        while (size < targetSize && queue.length > 0) {
            // Pick random from queue (frontier)
            const index = Math.floor(Math.random() * queue.length);
            const curr = queue.splice(index, 1)[0];

            const cell = this.grid[curr.r][curr.c];
            if (cell.type === 'plain' && cell.building === 'none') { // Only overwrite empty plains
                cell.type = type;
                size++;

                // Add neighbors to frontier
                const neighbors = [
                    { r: curr.r + 1, c: curr.c }, { r: curr.r - 1, c: curr.c },
                    { r: curr.r, c: curr.c + 1 }, { r: curr.c, c: curr.c - 1 }
                ];

                for (const n of neighbors) {
                    if (this.isValidCell(n.r, n.c) && this.grid[n.r][n.c].type === 'plain') {
                        queue.push(n);
                    }
                }
            }
        }
    }

    private isValidCell(r: number, c: number): boolean {
        return r >= 0 && r < GameConfig.GRID_HEIGHT && c >= 0 && c < GameConfig.GRID_WIDTH;
    }

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

    setBuilding(row: number, col: number, type: 'base' | 'town' | 'none') {
        const cell = this.getCell(row, col);
        if (cell) cell.building = type;
    }

    getCurrentPlayer(): Player {
        return this.players[this.currentPlayerId!];
    }

    endTurn(): { total: number, base: number, land: number, landCount: number } | null {
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

        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                const cell = this.grid[r][c];
                if (cell.owner === playerId) {

                    if (cell.building === 'town') {
                        // Town Growth Logic
                        // Assuming this is called ONCE per turn start for the player
                        // We rely on GameEngine only calling this on turn start/end.
                        // Wait, GameEngine calls it on endTurn.

                        // Increment turn count
                        cell.townTurnCount++;

                        // Check for Growth
                        if (cell.townTurnCount % GameConfig.TOWN_GROWTH_INTERVAL === 0) {
                            if (cell.townIncome < GameConfig.TOWN_INCOME_CAP) {
                                cell.townIncome += GameConfig.TOWN_INCOME_GROWTH;
                            }
                        }

                        // Add Income
                        landIncome += cell.townIncome;
                        // Towns count as land? Usually yes.
                        landCount++;
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
        const total = baseIncome + landIncome;
        const finalTotal = Math.floor(total);

        this.players[playerId].gold += finalTotal;

        return { total: finalTotal, base: baseIncome, land: landIncome, landCount };
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
