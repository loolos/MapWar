import { GameState } from './GameState';
import { GameConfig } from './GameConfig';
import { AIController } from './AIController';
import type { Action, EndTurnAction } from './Actions';
import type { MapType } from './map/MapGenerator';

type EventCallback = (data?: any) => void;

export class GameEngine {
    state: GameState;
    listeners: Record<string, EventCallback[]>;

    // State for Planning Phase
    pendingMoves: { r: number, c: number }[];
    lastError: string | null = null;

    // AI Visualization
    lastAiMoves: { r: number, c: number }[] = [];

    // Game Config State
    isSwapped: boolean = false;
    isGameOver: boolean = false;

    // AI
    ai: AIController;

    // Tutorial State
    hasTriggeredEnclaveTutorial: boolean = false;

    constructor(playerConfigs: { id: string, isAI: boolean, color: number }[] = [], mapType: MapType = 'default') {
        this.state = new GameState(playerConfigs, mapType);
        this.listeners = {};
        this.pendingMoves = [];
        this.ai = new AIController(this);

        // Initial Income for first player
        const firstPlayer = this.state.playerOrder[0];
        if (firstPlayer) {
            this.state.accrueResources(firstPlayer);
        }
    }

    on(event: string, callback: EventCallback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    emit(event: string, data?: any) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => {
                try {
                    cb(data);
                } catch (err) {
                    console.error(`Error in listener for event '${event}':`, err);
                }
            });
        }
    }

    // Actions
    // Actions
    restartGame(keepMap: boolean = false) {
        // Rotate players for "Swap" effect
        if (this.state.allPlayerIds.length > 0) {
            const first = this.state.allPlayerIds.shift();
            if (first) this.state.allPlayerIds.push(first);
        }

        // Pass undefined for configs (keep existing players), and keepMap
        // Pass current mapType to ensure same generator is used if map is reset
        this.state.reset(undefined, keepMap, this.state.currentMapType);
        this.pendingMoves = [];
        this.lastAiMoves = [];
        this.lastError = null;
        this.isGameOver = false;

        // Initial Income for first player (Restart)
        const firstPlayer = this.state.playerOrder[0];
        if (firstPlayer) {
            this.state.accrueResources(firstPlayer);
        }

        this.emit('mapUpdate'); // Redraw grid
        this.emit('turnChange'); // Update UI text
        this.emit('gameRestart');
    }

    loadState(json: string) {
        this.state.deserialize(json);
        this.pendingMoves = [];
        this.lastAiMoves = [];
        this.lastError = null;
        this.isGameOver = false;

        // Ensure Config Grid Size matches loaded state?
        // GameState.deserialize relies on GameConfig.GRID_WIDTH loop.
        // Ideally, we should update Config based on JSON data if variable size.
        // For now, assume preset matches or update Config here if needed.
        // The preset is 10x10. If current config is different, deserialize loop might fail or clip.
        // Let's force update config dimensions based on loaded grid.
        if (this.state.grid.length > 0) {
            (GameConfig as any).GRID_HEIGHT = this.state.grid.length;
            (GameConfig as any).GRID_WIDTH = this.state.grid[0].length;
        }

        this.emit('mapUpdate');
        this.emit('turnChange');
        this.emit('gameRestart'); // Re-init UI
    }

    // Execute an Action (Command Pattern)
    executeAction(action: Action) {
        if (this.isGameOver) return; // Block actions if game over

        switch (action.type) {
            case 'END_TURN':
                this.handleEndTurn(action as EndTurnAction);
                break;
            // Future actions: PLAN_MOVE, CHAT, etc.
        }
    }

    endTurn() {
        if (this.isGameOver) return;
        // Construct the Action
        // In the future, this is what gets sent to the server.
        const action: EndTurnAction = {
            type: 'END_TURN',
            playerId: this.state.currentPlayerId!, // Assume not null for local
            payload: {
                moves: [...this.pendingMoves] // Copy pending moves
            }
        };

        // For local game, execute immediately
        this.executeAction(action);
    }

    private handleEndTurn(action: EndTurnAction) {
        // Validate Player? (Server authority would do this)
        if (action.playerId !== this.state.currentPlayerId) {
            console.warn("Action received for wrong player");
            return;
        }

        // Apply Moves from Payload (Architecture Recommendation)
        // Note: Currently pendingMoves is local state. 
        // If we trust the payload, we calculate costs/apply based on THAT.
        // For now, let's keep using local pendingMoves for consistency in single player,
        // but ideally we'd use action.payload.moves for replayability.

        // Let's use the payload moves to be "Multiplayer Ready"
        // Need to set pendingMoves to the payload's moves (if they differ?)
        // Or just iteration over payload.moves?
        this.pendingMoves = action.payload.moves;

        this.commitMoves();

        // Check if game ended in commitMoves
        if (this.isGameOver) return;

        const incomeReport = this.state.endTurn();
        this.emit('turnChange');
        if (incomeReport) {
            this.emit('incomeReport', incomeReport);
        }

        // AI Check
        const nextPlayer = this.state.getCurrentPlayer();


        if (nextPlayer.isAI) {

            setTimeout(() => {
                if (!this.isGameOver) {
                    try {
                        this.ai.playTurn();
                    } catch (err) {
                        console.error("Critical AI Error:", err);
                        // Force end turn if AI crashes to keep game moving
                        this.endTurn();
                    }
                }
            }, 500);
        }
    }

    // New: Toggle a move in the plan
    togglePlan(row: number, col: number) {
        if (this.isGameOver) return;
        const existingIndex = this.pendingMoves.findIndex(m => m.r === row && m.c === col);

        if (existingIndex >= 0) {
            // Remove (Cancel)
            this.pendingMoves.splice(existingIndex, 1);
            this.lastError = null; // Clear error on successful toggle
        } else {
            // Try to Add
            const validation = this.validateMove(row, col);
            if (validation.valid) {
                this.pendingMoves.push({ r: row, c: col });
                this.lastError = null;
                this.emit('sfx:select');
            } else {
                this.lastError = validation.reason || "Invalid move";
            }
        }
        this.emit('planUpdate');
    }

    // Helper to get cost of a specific move
    getMoveCost(row: number, col: number): number {
        const cell = this.state.getCell(row, col);
        if (!cell) return 0;

        // Base Cost (Terrain)
        let baseCost = GameConfig.COST_CAPTURE;
        if (cell.building === 'town' && (cell.owner === null || cell.owner === 'neutral')) { // Neutral Town
            baseCost = GameConfig.COST_CAPTURE_TOWN;
        }
        else {
            // Standard Terrain
            if (cell.type === 'hill') baseCost = GameConfig.COST_CAPTURE * 2;
            if (cell.type === 'water') baseCost = GameConfig.COST_BUILD_BRIDGE; // Bridge Cost
        }

        // For Attack, use Attack Cost Base
        let isAttack = false;
        const curr = this.state.currentPlayerId;
        if (cell.owner !== null && cell.owner !== curr) {
            isAttack = true;
            baseCost = GameConfig.COST_ATTACK;
            if (cell.building === 'town') {
                // Attack Enemy Town: Standard Attack Rules
                // Basic Attack: 20
                // Hill Town? 40.
            }
            if (cell.type === 'hill') baseCost = GameConfig.COST_ATTACK * 2;
            if (cell.type === 'bridge') baseCost = GameConfig.COST_ATTACK * 2;

            // Wait, normal attack is COST_ATTACK (20). Hill is 40.
            // User said "invade ... like others expense double". If bridge is flat, it's 20. If hill is 40.
            // Let's assume bridge is flat terrain difficulty for attack, so 20. But user said "double".
            // "invade bridge... same double cost". Standard attack IS expensive (20 vs 10 capture).
            // Maybe they mean if disconnected? No, likely just standard attack rules apply.
        }

        // Distance Penalty Logic (Double if chained)
        if (isAttack) {
            // Vulnerability Rule: Disconnected enemy land is CHEAPER (30% off)
            if (cell.owner && !cell.isConnected) {
                baseCost = Math.floor(baseCost * 0.7);
            }

            // Distance Rule: If adjacent to OWNED land, normal cost.
            // If only adjacent to PENDING land (chained), double cost.
            if (curr && this.state.isAdjacentToOwned(row, col, curr)) { // Use state method
                return baseCost;
            } else {
                return baseCost * 2;
            }
        }

        return baseCost;
    }

    validateMove(row: number, col: number): { valid: boolean, reason?: string } {
        const playerId = this.state.currentPlayerId;
        if (!playerId) return { valid: false, reason: "No active player" };
        const player = this.state.players[playerId];

        // 1. Basic Cell Checks
        const cell = this.state.getCell(row, col);
        if (!cell) return { valid: false, reason: "Out of bounds" };
        if (cell.owner === playerId) return { valid: false, reason: "Already owned" }; // Self-own check

        // 2. Adjacency Check (Supply Line Rule)
        // must be adjacent to CONNECTED territory or PENDING
        const isAdjToConnected = this.state.isAdjacentToConnected(row, col, playerId);
        const isAdjToPending = this.isAdjacentToPending(row, col);

        if (!isAdjToConnected && !isAdjToPending) {
            return { valid: false, reason: "Must connect to Main Base supply line" };
        }

        // 3. Terrain Check
        if (cell.type === 'water') {
            // Must be adjacent to ALREADY OWNED land to build a bridge (User Requirement)
            // "If in adjacent area of occupied area, player can click build bridge"
            const isAdjToOwned = this.state.isAdjacentToOwned(row, col, playerId);
            if (!isAdjToOwned) {
                return { valid: false, reason: "Bridges can only be built from existing territory" };
            }
        }

        // 4. Cost Check
        // Calculate total cost of pending moves + this move
        let plannedCost = 0;
        for (const m of this.pendingMoves) {
            plannedCost += this.getMoveCost(m.r, m.c);
        }
        const thisMoveCost = this.getMoveCost(row, col);

        if (player.gold < plannedCost + thisMoveCost) {
            let reason = `Not enough gold(Need ${thisMoveCost})`;
            const isLongRange = !this.state.isAdjacentToOwned(row, col, player.id);
            if (isLongRange) reason += " (Includes Distance Penalty)";
            return { valid: false, reason };
        }

        return { valid: true };
    }

    public isValidCell(r: number, c: number): boolean {
        return r >= 0 && r < GameConfig.GRID_HEIGHT && c >= 0 && c < GameConfig.GRID_WIDTH;
    }



    private isAdjacentToPending(row: number, col: number): boolean {
        // Check if adjacent to any cell in pendingMoves
        const neighbors = [
            { r: row - 1, c: col }, { r: row + 1, c: col },
            { r: row, c: col - 1 }, { r: row, c: col + 1 }
        ];
        return neighbors.some(n =>
            this.pendingMoves.some(p => p.r === n.r && p.c === n.c)
        );
    }

    commitMoves() {
        const pid = this.state.currentPlayerId;
        if (!pid) return;

        let totalCost = 0;
        let gameWon = false;

        let hasCombat = false;
        let hasCapture = false;
        let hasTownCapture = false;
        let hasConquer = false;

        for (const move of this.pendingMoves) {
            const cost = this.getMoveCost(move.r, move.c);
            const cell = this.state.getCell(move.r, move.c);

            if (!cell) continue; // Safety Check

            // Win Condition Check: Capture Enemy Base
            if (cell.building === 'base' && cell.owner !== pid) {
                // ELIMINATION LOGIC
                const loserId = cell.owner;
                this.emit('sfx:eliminate');
                if (loserId) {
                    this.emit('logMessage', `${loserId} has been eliminated by ${pid}!`);

                    if (cell.building === 'base') {
                        this.state.setBuilding(move.r, move.c, 'none'); // Destroy Base
                    }

                    // Remove loser from order (stops them from getting turns)
                    this.state.playerOrder = this.state.playerOrder.filter(id => id !== loserId);

                    // Force update connectivity for eliminated player to disconnect all their lands
                    this.state.updateConnectivity(loserId);



                    // Check Win Condition: Last Man Standing
                    if (this.state.playerOrder.length === 1) {
                        gameWon = true;
                    }
                }
            }

            // Check if Combat (Attack/Conquer)
            if (cell.owner && cell.owner !== pid) {
                hasCombat = true;
                hasConquer = true; // Capturing enemy land
            } else if (cell.owner === null) {
                hasCapture = true;
            }

            // Check for Town Capture
            if (cell.building === 'town' && cell.owner !== pid) {
                hasTownCapture = true; // Distinct flag
                // Reset Income and Growth on Capture (whether from neutral or enemy)
                cell.townIncome = GameConfig.TOWN_INCOME_BASE;
                cell.townTurnCount = 0;
            }

            // Transformation: Water -> Bridge
            if (cell && cell.type === 'water') {
                cell.type = 'bridge';
            }

            this.state.setOwner(move.r, move.c, pid);

            // Gold Mine Discovery (Hill + Neutral Capture)
            if (cell.type === 'hill' && !hasCombat) { // Must be neutral hill
                if (Math.random() < GameConfig.GOLD_MINE_CHANCE) {
                    this.state.setBuilding(move.r, move.c, 'gold_mine');
                    this.emit('logMessage', `Gold Mine discovered at (${move.r}, ${move.c})!`);
                    this.emit('sfx:gold_mine_found'); // We need to add this sfx or reuse one? Re-use 'conquer' for now? Wait, user asked for new sfx? No.
                    // User didn't specify NEW SFX for mine, just mechanics. 
                    // Using 'sfx:capture_town' style chime might be nice, or just let it be silent?
                    // I'll emit 'sfx:capture_town' as a placeholder or add a specific one later.
                    // Let's use 'sfx:capture_town' for the "Good Event" feel.
                    this.emit('sfx:capture_town');
                }
            }

            totalCost += cost;
        }

        // Emit Audio Events based on aggregate actions (Priority Order)
        if (gameWon) {
            this.emit('sfx:victory');
            this.isGameOver = true;
            this.emit('gameOver', pid);
        } else {
            // Priority: Town Capture > Conquer (Enemy) > Combat > Capture (Neutral) > Move
            if (hasTownCapture) this.emit('sfx:capture_town');
            else if (hasConquer) this.emit('sfx:conquer');
            else if (hasCombat) this.emit('sfx:attack');
            else if (hasCapture) this.emit('sfx:capture');
            else this.emit('sfx:move');
        }

        if (totalCost > 0) {
            this.state.players[pid].gold -= totalCost;

            // Update Connectivity for ALL players
            // Check for enclaves for ALL players
            this.state.playerOrder.forEach(p => {
                this.state.updateConnectivity(p);
                this.checkForEnclaves(p);
            });

            this.emit('mapUpdate');
        }

        this.pendingMoves = []; // Clear
        this.lastError = null;
        this.emit('planUpdate');

        if (gameWon) {
            this.isGameOver = true;
            this.emit('gameOver', pid); // Winner is current player
        }
    }
    private checkForEnclaves(playerId: string): boolean {
        // Reset Pending Moves
        this.pendingMoves = [];
        this.lastError = null;

        let enclaveFound = false;

        // Iterate grid to find disconnected cells owned by playerId
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                const cell = this.state.grid[r][c];
                // If I own it, and it is NOT connected
                if (cell.owner === playerId && !cell.isConnected) {
                    enclaveFound = true;
                }
            }
        }

        if (enclaveFound) {
            this.emit('logMessage', `Supply line cut! Enclaves detected for ${playerId}.`);
        }
        return enclaveFound;
    }

    // --- Dynamic Audio / Intensity Calculation ---
    public calculateIntensity(): number {
        // Factors:
        // 1. Progression: Turn Number (Cap at turn 20) -> 0.0 to 0.5
        // 2. Army Size: Total Units (Cap at 20 units) -> 0.0 to 0.5

        const turnComponent = Math.min(this.state.turnCount / 20, 0.5);

        let totalUnits = 0;
        this.state.grid.forEach(row => {
            row.forEach(cell => {
                if (cell.unit) totalUnits++;
            });
        });

        const unitComponent = Math.min(totalUnits / 20, 0.5);

        return turnComponent + unitComponent;
    }
}

