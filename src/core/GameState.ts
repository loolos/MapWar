import { Cell } from './Cell';
import { GameConfig, type Player, type PlayerID } from './GameConfig';
import { MapGenerator, type MapType } from './map/MapGenerator';
import { AuraSystem } from './AuraSystem';

export class GameState {
    grid: Cell[][];
    players: Record<string, Player>;
    playerOrder: string[];
    allPlayerIds: string[]; // Persist full roster including eliminated players
    currentPlayerId: PlayerID;
    turnCount: number;
    turnsTakenInRound: number;
    currentMapType: MapType = 'default';
    citadelLocation: { r: number; c: number } | null = null;
    /** Per-player owned cell index: Map<PlayerID, Set<cellKey>> where cellKey = r*width + c */
    private ownedCellsByPlayer: Map<PlayerID, Set<number>> = new Map();

    constructor(playerConfigs: { id: string, isAI: boolean, color: number }[] = [], mapType: MapType = 'default') {
        this.grid = [];
        this.players = {};
        this.playerOrder = [];
        this.allPlayerIds = [];
        this.currentMapType = mapType;
        this.ownedCellsByPlayer = new Map();

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
                isAI: cfg.isAI,
                attackCostFactor: 1,
                citadelTurnsHeld: 0
            };
            this.playerOrder.push(cfg.id);
        });

        this.allPlayerIds = [...this.playerOrder]; // Initialize full roster

        this.currentPlayerId = this.playerOrder[0];
        this.turnCount = 1;
        this.turnsTakenInRound = 0;
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

        // 3. Cache Citadel Location
        this.cacheCitadelLocation();

        this.setupBases();
    }

    private cacheCitadelLocation() {
        this.citadelLocation = null;
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                if (this.grid[r][c].building === 'citadel') {
                    this.citadelLocation = { r, c };
                    return;
                }
            }
        }
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

            // If spawn lands on citadel, use nearest plain non-citadel cell
            if (this.grid[r][c].building === 'citadel') {
                const alt = this.findNearestPlainNonCitadel(r, c);
                if (alt) { r = alt.r; c = alt.c; }
            }

            // Set Base - Ensure Valid (If water, make plain or bridge?)
            // Force Plain for base
            this.grid[r][c].type = 'plain';

            this.setOwner(r, c, playerId);
            this.setBuilding(r, c, 'base');
        }
    }

    private findNearestPlainNonCitadel(fromR: number, fromC: number): { r: number; c: number } | null {
        const w = GameConfig.GRID_WIDTH;
        const h = GameConfig.GRID_HEIGHT;
        for (let d = 1; d <= Math.max(w, h); d++) {
            for (let dr = -d; dr <= d; dr++) {
                for (let dc = -d; dc <= d; dc++) {
                    if (Math.abs(dr) + Math.abs(dc) !== d) continue;
                    const r = fromR + dr;
                    const c = fromC + dc;
                    if (r < 0 || r >= h || c < 0 || c >= w) continue;
                    const cell = this.grid[r][c];
                    if (cell.type !== 'water' && cell.type !== 'bridge' && cell.building !== 'citadel') {
                        return { r, c };
                    }
                }
            }
        }
        return null;
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
                    isAI: cfg.isAI,
                    attackCostFactor: 1,
                    citadelTurnsHeld: 0
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
                    this.players[pid].attackCostFactor = 1;
                    this.players[pid].citadelTurnsHeld = 0;
                }
            });
        }

        this.currentPlayerId = this.playerOrder[0];
        this.turnCount = 1;
        this.turnsTakenInRound = 0;

        // Clear owned cells index
        this.ownedCellsByPlayer.clear();
        
        if (keepMap) {
            // Preserve Terrain Types, Reset Ownership/Buildings
            for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
                for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                    const cell = this.grid[r][c];
                    cell.owner = null;
                    cell.isConnected = false;
                    cell.unit = null;

                    // Reset Buildings but KEEP TOWNS and CITADEL
                    if (cell.building === 'town') {
                        cell.townIncome = GameConfig.TOWN_INCOME_BASE;
                        cell.townTurnCount = 0;
                    } else if (cell.building !== 'citadel') {
                        cell.building = 'none';
                        cell.defenseLevel = 0;
                        cell.incomeLevel = 0;
                        cell.watchtowerLevel = 0;
                        cell.farmLevel = 0;
                    }

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
        const height = this.grid.length;
        const width = height > 0 ? this.grid[0].length : 0;
        if (row < 0 || row >= height || col < 0 || col >= width) {
            return null;
        }
        return this.grid[row][col];
    }

    /**
     * Quickly mark all cells owned by the given player as disconnected.
     * Used when a player is eliminated; afterwards we no longer care about
     * their connectivity, so a full BFS is unnecessary.
     */
    public markPlayerCellsDisconnected(playerId: PlayerID): void {
        if (!playerId) return;
        const ownedSet = this.ownedCellsByPlayer.get(playerId);
        if (!ownedSet) return;
        const width = this.grid.length > 0 ? this.grid[0].length : 0;
        for (const cellKey of ownedSet) {
            const r = Math.floor(cellKey / width);
            const c = cellKey % width;
            const cell = this.getCell(r, c);
            if (cell && cell.owner === playerId) {
                cell.isConnected = false;
            }
        }
    }
    
    /**
     * Get owned cells for a player (O(1) lookup via index, no full grid scan).
     * Returns array of {r, c} positions.
     * If index is empty but cells exist (e.g., from direct cell.owner assignment in tests),
     * rebuilds the index automatically by scanning the grid once.
     */
    public getOwnedCells(playerId: PlayerID): { r: number; c: number }[] {
        let ownedSet = this.ownedCellsByPlayer.get(playerId);
        const width = this.grid.length > 0 ? this.grid[0].length : 0;
        
        // If index is empty, check if we need to rebuild (for test compatibility)
        // This happens when tests directly set cell.owner without calling setOwner()
        if (!ownedSet || ownedSet.size === 0) {
            // Quick check: scan grid to see if index might be stale
            const height = this.grid.length;
            let foundAny = false;
            for (let r = 0; r < height && !foundAny; r++) {
                for (let c = 0; c < width && !foundAny; c++) {
                    if (this.grid[r][c].owner === playerId) {
                        foundAny = true;
                    }
                }
            }
            
            // If we found owned cells but index is empty, rebuild index for this player
            if (foundAny) {
                this.rebuildOwnedCellsIndexForPlayer(playerId);
                ownedSet = this.ownedCellsByPlayer.get(playerId);
            }
        }
        
        if (!ownedSet || ownedSet.size === 0) return [];
        
        const result: { r: number; c: number }[] = [];
        for (const cellKey of ownedSet) {
            result.push({ r: Math.floor(cellKey / width), c: cellKey % width });
        }
        return result;
    }
    
    /**
     * Rebuild owned cells index for a specific player (used when index gets out of sync).
     * Public for test compatibility when tests directly set cell.owner.
     */
    public rebuildOwnedCellsIndexForPlayer(playerId: PlayerID): void {
        const width = this.grid.length > 0 ? this.grid[0].length : 0;
        const ownedSet = new Set<number>();
        const height = this.grid.length;
        
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                if (this.grid[r][c].owner === playerId) {
                    ownedSet.add(r * width + c);
                }
            }
        }
        
        this.ownedCellsByPlayer.set(playerId, ownedSet);
    }
    
    /**
     * Rebuild owned cells index for all players (used when index gets out of sync).
     * Public for test compatibility.
     */
    public rebuildAllOwnedCellsIndex(): void {
        this.ownedCellsByPlayer.clear();
        const width = this.grid.length > 0 ? this.grid[0].length : 0;
        const height = this.grid.length;
        
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                const owner = this.grid[r][c].owner;
                if (owner) {
                    if (!this.ownedCellsByPlayer.has(owner)) {
                        this.ownedCellsByPlayer.set(owner, new Set());
                    }
                    this.ownedCellsByPlayer.get(owner)!.add(r * width + c);
                }
            }
        }
    }

    setOwner(row: number, col: number, owner: PlayerID) {
        const cell = this.getCell(row, col);
        if (!cell) return;
        
        const width = this.grid.length > 0 ? this.grid[0].length : 0;
        const cellKey = row * width + col;
        
        // Remove from previous owner's set
        if (cell.owner) {
            const prevSet = this.ownedCellsByPlayer.get(cell.owner);
            if (prevSet) {
                prevSet.delete(cellKey);
            }
        }
        
        // Update cell
        cell.owner = owner;
        
        // Add to new owner's set
        if (owner) {
            if (!this.ownedCellsByPlayer.has(owner)) {
                this.ownedCellsByPlayer.set(owner, new Set());
            }
            this.ownedCellsByPlayer.get(owner)!.add(cellKey);
        }
    }

    setBuilding(row: number, col: number, type: 'base' | 'town' | 'gold_mine' | 'wall' | 'farm' | 'citadel' | 'none') {
        const cell = this.getCell(row, col);
        if (cell) cell.building = type;
    }

    getCurrentPlayer(): Player {
        if (!this.currentPlayerId) {
            throw new Error('No current player set');
        }
        const player = this.players[this.currentPlayerId];
        if (!player) {
            throw new Error(`Player ${this.currentPlayerId} not found`);
        }
        return player;
    }

    endTurn(): { total: number, base: number, land: number, town: number, mine: number, farm: number, landCount: number, depletedMines: { r: number, c: number }[] } | null {
        // Switch player
        const currentIndex = this.playerOrder.indexOf(this.currentPlayerId!);
        const nextIndex = (currentIndex + 1) % this.playerOrder.length;
        this.currentPlayerId = this.playerOrder[nextIndex];

        // Resource Accrual
        // Increment turn count after all alive players act once.
        const roundSize = Math.max(1, this.playerOrder.length);
        this.turnsTakenInRound = Math.min(this.turnsTakenInRound + 1, roundSize);
        if (this.turnsTakenInRound >= roundSize) {
            this.turnCount++;
            this.turnsTakenInRound = 0;
        }
        return this.accrueResources(this.currentPlayerId!);
    }

    public accrueResources(playerId: PlayerID) {
        if (!playerId) return null;

        // Note: Connectivity should already be up-to-date from commitMoves() in the previous turn.
        // We only need to recalculate if ownership changed, which is handled in commitMoves().
        // No need to update connectivity here for performance optimization.

        // Citadel: update turns held for accruing player
        for (let r = 0; r < this.grid.length; r++) {
            for (let c = 0; c < (this.grid[0]?.length ?? 0); c++) {
                const cell = this.grid[r][c];
                if (cell.building === 'citadel' && cell.owner === playerId) {
                    const held = (this.players[playerId].citadelTurnsHeld ?? 0) + 1;
                    this.players[playerId].citadelTurnsHeld = held;
                    break;
                }
            }
        }

        const previousAttackFactor = Math.max(1, this.players[playerId].attackCostFactor ?? 1);
        const height = this.grid.length;
        const width = height > 0 ? this.grid[0].length : 0;
        let totalOwnableCount = 0;
        let ownedCount = 0;
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                const cell = this.grid[r][c];
                if (cell.type === 'water' || cell.type === 'bridge') continue;
                totalOwnableCount++;
                if (cell.owner === playerId) {
                    ownedCount++;
                }
            }
        }
        if (!Number.isFinite(this.players[playerId].attackCostFactor)) {
            this.players[playerId].attackCostFactor = 1;
        }
        if (this.turnCount >= GameConfig.ATTACK_DOMINANCE_TURN_MIN && totalOwnableCount > 0) {
            const ratio = ownedCount / totalOwnableCount;
            // Dynamic threshold: 1/sqrt(起始玩家数量)
            const minRatio = 1 / Math.sqrt(this.allPlayerIds.length);
            if (ratio > minRatio) {
                const t = Math.min(1, Math.max(0,
                    (ratio - minRatio) / (1 - minRatio)
                ));
                const factor = 1 + (GameConfig.ATTACK_DOMINANCE_MAX_FACTOR - 1) * t;
                this.players[playerId].attackCostFactor = Math.max(1, Math.min(GameConfig.ATTACK_DOMINANCE_MAX_FACTOR, factor));
            } else {
                this.players[playerId].attackCostFactor = 1;
            }
        } else {
            this.players[playerId].attackCostFactor = 1;
        }
        // Citadel dominance: if held 3+ turns, multiply attack factor (capped)
        const held = this.players[playerId].citadelTurnsHeld ?? 0;
        if (held >= GameConfig.CITADEL_DOMINANCE_TURNS_MIN) {
            const f = Math.max(1, this.players[playerId].attackCostFactor ?? 1) * GameConfig.CITADEL_DOMINANCE_FACTOR;
            this.players[playerId].attackCostFactor = Math.min(GameConfig.ATTACK_DOMINANCE_MAX_FACTOR, f);
        }
        const currentAttackFactor = Math.max(1, this.players[playerId].attackCostFactor ?? 1);
        const powerActivated = previousAttackFactor <= 1 && currentAttackFactor > 1;

        // Single Source of Truth for Income
        // const totalIncome = this.calculateIncome(playerId); // Not needed anymore

        let landCount = 0;
        const depletedMines: { r: number, c: number }[] = [];

        // Iterate for side effects (town growth, mine depletion) and count land
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                const cell = this.grid[r][c];
                if (cell.owner === playerId) {
                    if (cell.building === 'town') {
                        // Town Growth Logic (Side Effect)
                        cell.townTurnCount++;
                        if (cell.townTurnCount % GameConfig.TOWN_GROWTH_INTERVAL === 0) {
                            if (cell.townIncome < GameConfig.TOWN_INCOME_CAP) {
                                cell.townIncome += GameConfig.TOWN_INCOME_GROWTH;
                            }
                        }
                        landCount++;
                    }
                    else if (cell.building === 'gold_mine') {
                        landCount++;
                        // Depletion Check (Side Effect)
                        if (Math.random() < GameConfig.GOLD_MINE_DEPLETION_RATE) {
                            cell.building = 'none';
                            depletedMines.push({ r, c });
                        }
                    } else if (cell.type !== 'bridge') {
                        landCount++;
                    }
                }
            }
        }

        // Detailed Breakdown for Logging (calculated in single pass)
        let farmIncome = 0;
        let mineIncome = 0;
        let townIncome = 0;
        let landIncome = 0; // Pure land
        let baseIncome = 0;

        // Single pass: calculate breakdown and total simultaneously
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                const cell = this.grid[r][c];
                if (cell.owner === playerId) {
                    const inc = this.getTileIncome(r, c);

                    if (cell.building === 'base') {
                        baseIncome += inc;
                    } else if (cell.building === 'town') {
                        townIncome += inc;
                    } else if (cell.building === 'gold_mine') {
                        mineIncome += inc;
                    } else if (cell.building === 'farm') {
                        farmIncome += inc;
                    } else if (cell.type !== 'bridge') {
                        landIncome += inc;
                    }
                }
            }
        }

        // Validate Total (Sanity Check)
        const checkTotal = baseIncome + landIncome + townIncome + mineIncome + farmIncome;

        // Apply Income
        this.players[playerId].gold += checkTotal;

        return {
            total: checkTotal,
            base: baseIncome,
            land: landIncome,
            town: townIncome,
            mine: mineIncome,
            farm: farmIncome,
            landCount,
            depletedMines,
            upgradeBonus: 0,
            powerActivated,
            attackCostFactor: currentAttackFactor,
            citadelDominanceActive: held >= GameConfig.CITADEL_DOMINANCE_TURNS_MIN
        };
    }

    public calculateIncome(playerId: PlayerID): number {
        if (!playerId) return 0;

        // Ensure connectivity is current
        this.updateConnectivity(playerId);

        let totalIncome = 0;

        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                const cell = this.grid[r][c];
                if (cell.owner === playerId) {
                    totalIncome += this.getTileIncome(r, c);
                }
            }
        }

        return totalIncome; // Return float for precise display
    }


    public updateConnectivity(playerId: PlayerID) {
        if (!playerId) return;

        // Use dynamic grid dimensions instead of GameConfig constants
        const height = this.grid.length;
        const width = height > 0 ? this.grid[0].length : 0;
        if (height === 0 || width === 0) return;

        // 1. Find Base(s) and Reset Connectivity
        const queue: { r: number, c: number }[] = [];
        const ownedCells: { r: number, c: number }[] = [];

        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
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

                // Bounds Check using dynamic dimensions
                if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
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
            turnsTakenInRound: this.turnsTakenInRound,
            currentPlayerId: this.currentPlayerId
        });
    }

    // Helper for UI to query income of a specific tile
    public getTileIncome(r: number, c: number): number {
        const cell = this.getCell(r, c);
        if (!cell || !cell.owner) return 0;

        let income = 0;

        if (cell.building === 'base') {
            income = GameConfig.GOLD_PER_TURN_BASE;
            income += this.getSingleBaseUpgradeBonus(cell);
        } else if (cell.building === 'town') {
            income = cell.townIncome;
        } else if (cell.building === 'gold_mine') {
            income = GameConfig.GOLD_MINE_INCOME;
        } else if (cell.building === 'citadel') {
            income = GameConfig.CITADEL_INCOME_PER_TURN;
        } else if (cell.building === 'farm') {
            const level = Math.min(cell.farmLevel, GameConfig.FARM_MAX_LEVEL);
            income = GameConfig.FARM_INCOME[level];
        } else if (cell.type !== 'bridge') {
            income = GameConfig.GOLD_PER_LAND;
        }

        // Halve income if disconnected (Except Base)
        if (!cell.isConnected && cell.building !== 'base') {
            income *= 0.5;
        }

        // Apply Aura Bonus (50%)
        // Apply Aura Bonus
        const auraBonus = AuraSystem.getIncomeAuraBonus(this, r, c, cell.owner!);
        if (income > 0 && auraBonus > 0) {
            income *= (1 + auraBonus);
        }

        return income;
    }

    private getSingleBaseUpgradeBonus(cell: Cell): number {
        let bonus = 0;
        if (cell.incomeLevel > 0) {
            for (let i = 0; i < cell.incomeLevel; i++) {
                bonus += GameConfig.UPGRADE_INCOME_BONUS[i];
            }
        }
        return bonus;
    }

    deserialize(json: string) {
        const data = JSON.parse(json);
        this.players = data.players;
        this.turnCount = data.turnCount;
        this.currentPlayerId = data.currentPlayerId;
        this.turnsTakenInRound = data.turnsTakenInRound ?? 0;

        // Restore persistent list or fallback to players keys
        this.allPlayerIds = data.allPlayerIds || Object.keys(this.players);
        this.playerOrder = data.playerOrder || [...this.allPlayerIds]; // Fallback
        for (const playerId of Object.keys(this.players)) {
            if (!Number.isFinite(this.players[playerId].attackCostFactor)) {
                this.players[playerId].attackCostFactor = 1;
            }
        }

        // Reconstruct Grid
        // Use loaded data dimensions
        const height = data.grid.length;
        const width = height > 0 ? data.grid[0].length : 0;

        // Reset grid to new size
        this.grid = [];
        
        // Rebuild owned cells index
        this.ownedCellsByPlayer.clear();

        for (let r = 0; r < height; r++) {
            this.grid[r] = [];
            if (!data.grid[r] || !Array.isArray(data.grid[r])) {
                throw new Error(`Invalid grid data at row ${r}`);
            }
            for (let c = 0; c < width; c++) {
                if (data.grid[r][c] === undefined || data.grid[r][c] === null) {
                    throw new Error(`Invalid grid data at row ${r}, col ${c}`);
                }
                this.grid[r][c] = Cell.deserialize(data.grid[r][c]);
                
                // Rebuild owned cells index
                const cell = this.grid[r][c];
                if (cell.owner) {
                    const cellKey = r * width + c;
                    if (!this.ownedCellsByPlayer.has(cell.owner)) {
                        this.ownedCellsByPlayer.set(cell.owner, new Set());
                    }
                    this.ownedCellsByPlayer.get(cell.owner)!.add(cellKey);
                }
            }
        }
    }
    getNeighbors(r: number, c: number): Cell[] {
        const neighbors: Cell[] = [];
        const directions = [
            { r: -1, c: 0 }, { r: 1, c: 0 },
            { r: 0, c: -1 }, { r: 0, c: 1 }
        ];

        for (const d of directions) {
            const nr = r + d.r;
            const nc = c + d.c;
            const cell = this.getCell(nr, nc);
            if (cell) {
                neighbors.push(cell);
            }
        }
        return neighbors;
    }
}
