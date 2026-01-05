import { Cell } from './Cell';
import { GameConfig, type Player, type PlayerID } from './GameConfig';

export class GameState {
    grid: Cell[][];
    players: Record<string, Player>;
    currentPlayerId: PlayerID;
    turnCount: number;

    constructor() {
        this.grid = [];
        this.players = {
            'P1': { id: 'P1', color: 0xff0000, gold: GameConfig.INITIAL_GOLD, isAI: false },
            'P2': { id: 'P2', color: 0x0000ff, gold: GameConfig.INITIAL_GOLD, isAI: true }
        };
        this.currentPlayerId = 'P1';
        this.turnCount = 1;
        this.initializeGrid();
    }

    private initializeGrid(swapped: boolean = false) {
        // 1. Initialize empty plain grid
        for (let r = 0; r < GameConfig.GRID_SIZE; r++) {
            this.grid[r] = [];
            for (let c = 0; c < GameConfig.GRID_SIZE; c++) {
                this.grid[r][c] = new Cell(r, c);
                this.grid[r][c].type = 'plain';
            }
        }

        // 2. Generate Clustered Terrain
        this.generateTerrain();

        // 3. Setup Bases
        const p1Start = swapped ? { r: 0, c: 0 } : { r: GameConfig.GRID_SIZE - 1, c: GameConfig.GRID_SIZE - 1 };
        const p2Start = swapped ? { r: GameConfig.GRID_SIZE - 1, c: GameConfig.GRID_SIZE - 1 } : { r: 0, c: 0 };

        this.setOwner(p1Start.r, p1Start.c, 'P1');
        this.setBuilding(p1Start.r, p1Start.c, 'base');
        this.grid[p1Start.r][p1Start.c].type = 'plain'; // Force plain

        this.setOwner(p2Start.r, p2Start.c, 'P2');
        this.setBuilding(p2Start.r, p2Start.c, 'base');
        this.grid[p2Start.r][p2Start.c].type = 'plain'; // Force plain
    }

    private generateTerrain() {
        // Config for Clusters
        const waterClusters = 2;
        const waterSize = 6;
        const hillClusters = 3;
        const hillSize = 5;

        // Generate Water
        for (let i = 0; i < waterClusters; i++) {
            this.growCluster('water', waterSize);
        }

        // Generate Hills
        for (let i = 0; i < hillClusters; i++) {
            this.growCluster('hill', hillSize);
        }
    }

    private growCluster(type: 'water' | 'hill', targetSize: number) {
        // Pick random start (avoid corners roughly to save bases)
        let r = Math.floor(Math.random() * (GameConfig.GRID_SIZE - 2)) + 1;
        let c = Math.floor(Math.random() * (GameConfig.GRID_SIZE - 2)) + 1;

        let size = 0;
        const queue: { r: number, c: number }[] = [{ r, c }];

        while (size < targetSize && queue.length > 0) {
            // Pick random from queue (frontier)
            const index = Math.floor(Math.random() * queue.length);
            const curr = queue.splice(index, 1)[0];

            const cell = this.grid[curr.r][curr.c];
            if (cell.type === 'plain') { // Only overwrite plains
                cell.type = type;
                size++;

                // Add neighbors to frontier
                const neighbors = [
                    { r: curr.r + 1, c: curr.c }, { r: curr.r - 1, c: curr.c },
                    { r: curr.r, c: curr.c + 1 }, { r: curr.r, c: curr.c - 1 }
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
        return r >= 0 && r < GameConfig.GRID_SIZE && c >= 0 && c < GameConfig.GRID_SIZE;
    }

    // Reset Game State
    reset(swapped: boolean) {
        this.grid = [];
        this.players['P1'].gold = GameConfig.INITIAL_GOLD;
        this.players['P2'].gold = GameConfig.INITIAL_GOLD;
        this.currentPlayerId = 'P1';
        this.turnCount = 1;
        this.initializeGrid(swapped);
    }

    getCell(row: number, col: number): Cell | null {
        if (row < 0 || row >= GameConfig.GRID_SIZE || col < 0 || col >= GameConfig.GRID_SIZE) {
            return null;
        }
        return this.grid[row][col];
    }

    setOwner(row: number, col: number, owner: PlayerID) {
        const cell = this.getCell(row, col);
        if (cell) cell.owner = owner;
    }

    setBuilding(row: number, col: number, type: 'base' | 'none') {
        const cell = this.getCell(row, col);
        if (cell) cell.building = type;
    }

    getCurrentPlayer(): Player {
        return this.players[this.currentPlayerId!];
    }

    endTurn(): { total: number, base: number, land: number, landCount: number } | null {
        // Switch player
        this.currentPlayerId = this.currentPlayerId === 'P1' ? 'P2' : 'P1';

        // Resource Accrual
        if (this.currentPlayerId === 'P1') {
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

        for (let r = 0; r < GameConfig.GRID_SIZE; r++) {
            for (let c = 0; c < GameConfig.GRID_SIZE; c++) {
                const cell = this.grid[r][c];
                if (cell.owner === playerId) {
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

        const baseIncome = GameConfig.GOLD_PER_TURN_BASE;
        const total = baseIncome + landIncome; // landIncome can now be float? 0.5?
        // Let's ceil or floor? Or keep float? Gold is number. 
        // Usually games floor income.
        const finalTotal = Math.floor(total);

        this.players[playerId].gold += finalTotal;

        return { total: finalTotal, base: baseIncome, land: landIncome, landCount };
    }

    public updateConnectivity(playerId: PlayerID) {
        if (!playerId) return;

        // 1. Find Base(s) and Reset Connectivity
        const queue: { r: number, c: number }[] = [];
        const ownedCells: { r: number, c: number }[] = [];

        for (let r = 0; r < GameConfig.GRID_SIZE; r++) {
            for (let c = 0; c < GameConfig.GRID_SIZE; c++) {
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
                if (nr >= 0 && nr < GameConfig.GRID_SIZE && nc >= 0 && nc < GameConfig.GRID_SIZE) {
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

    serialize(): string {
        return JSON.stringify({
            grid: this.grid.map(row => row.map(cell => cell.serialize())),
            players: this.players,
            turnCount: this.turnCount,
            currentPlayerId: this.currentPlayerId
        });
    }

    deserialize(json: string) {
        const data = JSON.parse(json);
        this.players = data.players;
        this.turnCount = data.turnCount;
        this.currentPlayerId = data.currentPlayerId;

        // Reconstruct Grid
        for (let r = 0; r < GameConfig.GRID_SIZE; r++) {
            if (!this.grid[r]) this.grid[r] = [];
            for (let c = 0; c < GameConfig.GRID_SIZE; c++) {
                this.grid[r][c] = Cell.deserialize(data.grid[r][c]);
            }
        }
    }
}
