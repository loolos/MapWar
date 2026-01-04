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

    private initializeGrid() {
        for (let r = 0; r < GameConfig.GRID_SIZE; r++) {
            this.grid[r] = [];
            for (let c = 0; c < GameConfig.GRID_SIZE; c++) {
                this.grid[r][c] = new Cell(r, c);
            }
        }

        // Initial setup
        this.setOwner(0, 0, 'P1');
        this.setBuilding(0, 0, 'base');

        this.setOwner(GameConfig.GRID_SIZE - 1, GameConfig.GRID_SIZE - 1, 'P2');
        this.setBuilding(GameConfig.GRID_SIZE - 1, GameConfig.GRID_SIZE - 1, 'base');
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

    private accrueResources(playerId: PlayerID) {
        if (!playerId) return null;
        let landCount = 0;
        for (let r = 0; r < GameConfig.GRID_SIZE; r++) {
            for (let c = 0; c < GameConfig.GRID_SIZE; c++) {
                if (this.grid[r][c].owner === playerId) {
                    landCount++;
                }
            }
        }

        // Logic: Base Income (Includes the Fortress/Base tile? Or is Base separate?)
        // Currently: Base Income is constant. Land Income is per tile.
        // Usually "Base" tile is also a tile. So it counts towards landCount?
        // Let's assume Base Income is EXTRA from the Fortress building/Funding, and Land is taxes.

        const baseIncome = GameConfig.GOLD_PER_TURN_BASE;
        const landIncome = landCount * GameConfig.GOLD_PER_LAND;
        const total = baseIncome + landIncome;

        this.players[playerId].gold += total;

        return { total, base: baseIncome, land: landIncome, landCount };
    }
}
