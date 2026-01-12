import { GameConfig } from './GameConfig';
import { AIController } from './AIController';
import { InteractionRegistry } from './interaction/InteractionRegistry';
import { CostSystem } from './CostSystem';

import type { Action, EndTurnAction } from './Actions';
import type { MapType } from './map/MapGenerator';

import { GameStateManager } from './GameStateManager';
import { TypedEventEmitter } from './GameEvents';

export class GameEngine {
    stateManager: GameStateManager;
    events: TypedEventEmitter;

    // Direct access helper for legacy compatibility / ease of use
    get state() { return this.stateManager.state; }

    // State for Planning Phase
    pendingMoves: { r: number, c: number }[];
    // Interactivity
    selectedTile: { r: number, c: number } | null = null;
    pendingInteractions: { r: number, c: number, actionId: string }[] = [];
    interactionRegistry: InteractionRegistry;

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
        this.stateManager = new GameStateManager(playerConfigs, mapType);
        this.events = new TypedEventEmitter();
        this.pendingMoves = [];
        this.interactionRegistry = new InteractionRegistry();
        this.ai = new AIController(this);
    }

    startGame() {
        console.log("GameEngine.startGame called");
        // Initial Income for first player
        const firstPlayer = this.state.playerOrder[0];
        if (firstPlayer) {
            this.state.accrueResources(firstPlayer);
            console.log("Initial resources accrued for", firstPlayer, "Gold:", this.state.players[firstPlayer].gold);
        }

        this.emit('gameStart');

        if (firstPlayer && this.state.players[firstPlayer].isAI) {
            console.log("Triggering AI turn for P1");
            this.triggerAiTurn();
        }
    }

    on<K extends keyof import('./GameEvents').GameEventMap>(event: K, callback: (data: import('./GameEvents').GameEventMap[K]) => void) {
        this.events.on(event, callback);
    }

    emit<K extends keyof import('./GameEvents').GameEventMap>(event: K, data?: import('./GameEvents').GameEventMap[K]) {
        this.events.emit(event, data as any);
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
        // Pass current mapType to ensure same generator is used if map is reset
        this.stateManager.reset(undefined, keepMap, this.state.currentMapType);
        this.pendingMoves = [];
        this.pendingInteractions = [];
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

        if (this.state.getCurrentPlayer().isAI) {
            this.triggerAiTurn();
        }
    }

    loadState(json: string) {
        this.stateManager.loadState(json);
        this.pendingMoves = [];
        this.pendingInteractions = [];
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

    // endTurn removed (duplicate)

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

            // Detailed Income Summary Log (White/Info)
            const parts = [];
            if (incomeReport.base > 0) parts.push(`Base: +${incomeReport.base}`);
            if (incomeReport.town > 0) parts.push(`Towns: +${incomeReport.town}`);
            if (incomeReport.mine > 0) parts.push(`Mines: +${incomeReport.mine}`);
            if (incomeReport.farm > 0) parts.push(`Farms: +${incomeReport.farm}`);
            if (incomeReport.land > 0) parts.push(`Land(${incomeReport.landCount}): +${incomeReport.land}`);

            const summaryText = `Turn Start Income: +${incomeReport.total}G [ ${parts.join(', ')} ]`;
            this.emit('logMessage', { text: summaryText, type: 'info' });

            if (incomeReport.depletedMines && incomeReport.depletedMines.length > 0) {
                incomeReport.depletedMines.forEach(m => {
                    this.emit('logMessage', { text: `Gold Mine collapsed at (${m.r}, ${m.c})!`, type: 'info' });
                });
                this.emit('sfx:gold_depleted');
            }
        }

        // AI Check
        const nextPlayer = this.state.getCurrentPlayer();


        if (nextPlayer.isAI) {
            this.triggerAiTurn();
        }
    }

    private triggerAiTurn() {
        if (this.isGameOver) return;
        setTimeout(() => {
            if (!this.isGameOver && this.state.getCurrentPlayer().isAI) {
                try {
                    this.ai.playTurn();
                } catch (err) {
                    console.error("Critical AI Error:", err);
                    this.endTurn();
                }
            }
        }, 500);
    }

    // Interaction System
    selectTile(row: number, col: number) {
        if (!this.isValidCell(row, col)) return;

        // If same tile, toggle off? or keep? Let's keep for now, UI decides toggle
        this.selectedTile = { r: row, c: col };

        // Get Options
        const options = this.interactionRegistry.getAvailableActions(this, row, col);

        this.emit('tileSelected', { r: row, c: col, options });
        this.emit('sfx:select_tile'); // A softer sound than move plan
    }

    deselectTile() {
        this.selectedTile = null;
        this.emit('tileDeselected');
    }

    planInteraction(row: number, col: number, actionId: string) {
        if (this.isGameOver) return;

        const action = this.interactionRegistry.get(actionId);
        if (!action) return;

        // Check if ALREADY planned (Toggle Off) - Do this BEFORE cost/validation to allow cancellation
        const existingIdx = this.pendingInteractions.findIndex(i => i.r === row && i.c === col && i.actionId === actionId);
        if (existingIdx >= 0) {
            this.pendingInteractions.splice(existingIdx, 1);
            this.lastError = null; // Clear error if toggling off

            // Re-validate everything (Cascade Cancellation for interactions?)
            this.revalidatePendingPlan();

            this.emit('planUpdate');
            this.emit('sfx:select'); // Feedback
            return;
        }

        // Validation
        if (!action.isAvailable(this, row, col)) {
            console.log(`[PlanInteraction] Action ${actionId} not available at ${row},${col}. Owner: ${this.state.getCell(row, col)?.owner}, Current: ${this.state.currentPlayerId}, Building: ${this.state.getCell(row, col)?.building}`);
            this.lastError = "Action not available";
            this.emit('planUpdate');
            return;
        }

        // Resolve Cost (Value or Function)
        let cost = 0;
        if (typeof action.cost === 'function') {
            cost = action.cost(this, row, col);
        } else {
            cost = action.cost;
        }

        const label = typeof action.label === 'function' ? action.label(this, row, col) : action.label;

        // Cost Check
        const player = this.state.getCurrentPlayer();
        const currentCost = this.calculatePlannedCost();
        if (player.gold < currentCost + cost) {
            console.log(`[PlanInteraction] Not enough gold. Gold: ${player.gold}, Cost: ${currentCost + cost}`);
            this.lastError = `Not enough gold for ${label}`;
            this.emit('planUpdate');
            return;
        }

        // IMMEDIATE EXECUTION (e.g. Move)
        if (action.immediate) {
            action.execute(this, row, col);
            // Do NOT add to pendingInteractions list
            // Note: execute for Move calls togglePlan, which calls revalidatePendingPlan.
            return;
        }

        // Add New Interaction
        // Ensure no other interaction exists at this tile (Replace strategy)
        const existingAtTile = this.pendingInteractions.findIndex(i => i.r === row && i.c === col);
        if (existingAtTile >= 0) {
            this.pendingInteractions.splice(existingAtTile, 1);
        }

        this.pendingInteractions.push({ r: row, c: col, actionId });

        // Re-validate everything (e.g. check cost limits)
        this.revalidatePendingPlan();

        this.emit('planUpdate');
        this.emit('sfx:select'); // Feedback
    }

    // Helper to calculate TOTAL cost including moves and interactions
    calculatePlannedCost(): number {
        let total = 0;
        // Moves
        for (const m of this.pendingMoves) {
            total += this.getMoveCost(m.r, m.c);
        }
        // Interactions
        for (const i of this.pendingInteractions) {
            const act = this.interactionRegistry.get(i.actionId);
            if (act) {
                const c = typeof act.cost === 'function' ? act.cost(this, i.r, i.c) : act.cost;
                total += c;
            }
        }
        return total;
    }
    // New: Toggle a move in the plan
    togglePlan(row: number, col: number) {
        if (this.isGameOver) return;
        const existingIndex = this.pendingMoves.findIndex(m => m.r === row && m.c === col);

        if (existingIndex >= 0) {
            // Remove (and all subsequent)
            this.pendingMoves.splice(existingIndex);
            this.lastError = null;
            this.emit('sfx:cancel');
        } else {
            // Try to Add
            const validation = this.validateMove(row, col);
            if (validation.valid) {
                // Double-check cost (redundant but safe)
                const player = this.state.getCurrentPlayer();
                const currentPlanCost = this.calculatePlannedCost();
                const moveCost = this.getMoveCost(row, col);

                if (player.gold < currentPlanCost + moveCost) {
                    this.lastError = `Insufficient funds (Need ${moveCost} G)`;
                    this.emit('sfx:cancel');
                    // Warning Log (Red)
                    // Use exact same formatting logic as before or simplify?
                    const details = this.getCostDetails(row, col);
                    this.emit('logMessage', { text: `Cannot select: Insufficient Funds! Need ${currentPlanCost + moveCost}G (Have ${player.gold}G). ${details.breakdown}`, type: 'error' });
                    // Do NOT add to pendingMoves
                } else {
                    this.pendingMoves.push({ r: row, c: col });
                    this.lastError = null;
                    this.emit('sfx:select');
                    // ... reminders ...
                    // Reminder Log (Yellow) - Distance Multiplier
                    const details = this.getCostDetails(row, col);
                    if (details.breakdown.includes('Distance')) {
                        this.emit('logMessage', { text: `Reminder: Distance Multiplier Active! Cost is higher due to distance.`, type: 'warning' });
                    }
                }
            } else {
                this.lastError = validation.reason || "Invalid move";
                this.emit('sfx:cancel');

                // New: Explicitly Log validation failures?
                // If the reason is "Not enough gold", we should log it as error to match user expectation.
                if (validation.reason?.includes('Not enough gold')) {
                    const player = this.state.getCurrentPlayer();
                    const plannedCost = this.calculatePlannedCost();
                    const thisMoveCost = this.getMoveCost(row, col);
                    // Reconstruct detail message
                    const details = this.getCostDetails(row, col);
                    const logMsg = `Insufficient Funds: Need ${plannedCost + thisMoveCost}G (Have ${player.gold}G). \nCost Logic: ${details.breakdown || 'Base Cost'}`;
                    this.emit('logMessage', { text: logMsg, type: 'error' });
                } else {
                    // Log other reasons as warnings? (e.g. "Must connect to supply line")
                    // User didn't ask for this, but useful feedback.
                    // For now, let's stick to fixing the requested bug.
                    console.log(`Validation Failed: ${validation.reason}`);
                }
            }
        }

        // Cascade Cancellation: Re-validate all pending items
        this.revalidatePendingPlan();

        this.emit('planUpdate');
    }

    revalidatePendingPlan() {
        let changed = true;
        let loops = 0;
        while (changed && loops < 20) { // Safety break
            changed = false;
            loops++;

            // CRUCIAL: To re-validate B properly, we must assess it AS IF it's being added, 
            // meaning it shouldn't be in the base "pendingMoves" list during the check, 
            // OR we accept double counting cost (bad) 
            // OR we just check adjacency rules here manually?

            // Reuse validateMove but handle the list temporarily.
            // We'll filter `pendingMoves` to exclude current `move`.
            // Efficient approach:
            // We want to remove invalid ones.
            // If we remove one, it might invalidate others in the SAME pass or NEXT pass?
            // "Cascade" implies iterative.

            // We need to iterate carefully. If A and B depend on each other (cycle? not possible with tree expansion from base), 
            // they might both stay?
            // We must enforce "Connected to OWNED eventually".
            // Since we expand from Owned -> A -> B.
            // If we just check "Valid", valid means "Adjacent to Connected OR Pending".
            // If A and B are pending and adjacent, they validate each other!
            // This is the "Floating Island" problem.
            // If I delete Base connection, A and B form a floating valid island.

            // FIX: "Adjacency" must eventually trace back to `isConnected` (Owned land that is connected to base).
            // Actually `isAdjacentToConnected` checks owned land.
            // `isAdjacentToPending` checks pending land.
            // We need a BFS/Search to ensure every pending move connects to an Actual Owned-and-Connected tile.

            // Graph Algo:
            // Sources: All Owned tiles that are `isConnected`.
            // Nodes: Pending Moves.
            // Edges: Adjacency.
            // We only keep Pending Moves that act as nodes reachable from Sources.

            const reachable = new Set<string>(); // "r,c"

            // 1. Identify direct connections to owned land
            // Queue for BFS
            const queue: { r: number, c: number }[] = [];
            const pendingSet = new Set(this.pendingMoves.map(m => `${m.r},${m.c}`));

            for (const m of this.pendingMoves) {
                if (this.state.isAdjacentToConnected(m.r, m.c, this.state.currentPlayerId!)) {
                    queue.push(m);
                    reachable.add(`${m.r},${m.c}`);
                }
            }

            // 2. BFS
            let head = 0;
            while (head < queue.length) {
                const curr = queue[head++];
                // Check neighbors in pendingSet
                const neighbors = [
                    { r: curr.r - 1, c: curr.c }, { r: curr.r + 1, c: curr.c },
                    { r: curr.r, c: curr.c - 1 }, { r: curr.r, c: curr.c + 1 }
                ];

                for (const n of neighbors) {
                    const key = `${n.r},${n.c}`;
                    if (pendingSet.has(key) && !reachable.has(key)) {
                        reachable.add(key);
                        queue.push(n);
                    }
                }
            }

            // 3. Filter pendingMoves
            const newMoves = this.pendingMoves.filter(m => reachable.has(`${m.r},${m.c}`));

            if (newMoves.length !== this.pendingMoves.length) {
                this.pendingMoves = newMoves;
                changed = true;
                this.emit('sfx:cancel'); // Feedback for auto-cancel?
            }

            // COST CHECK (After connectivity pruning)
            // If total cost exceeds gold, prune FROM END (most recently added?) or just fail?
            // User: "Also checks ... if cost changes ... cancel interactive".
            // If logic forces pruning, we should probably prune the LAST added ones (stack behavior)?
            // Or just mark them Invalid?
            // User said: "Show as Red". 
            // So we might NOT remove them if they are just expensive, only if disconnected.
            // "if already selected... connection... or cost changed and money insufficient, also cancel".
            // OK, so we MUST cancel if insufficient funds.

            // Connectivity is strictly enforced (Floating islands removed).
            // Cost is enforcing?
            // "if cost changed and gold insufficient, also cancel" -> Yes, remove.

            if (changed) continue; // Restart loop if connectivity changed things

            // Check Cost
            const currentCost = this.calculatePlannedCost();
            const player = this.state.getCurrentPlayer();
            if (player.gold < currentCost) {
                // Remove last interaction or move to reduce cost?
                // Simple approach: Remove the last pending Move/Interaction?
                // Logic: Pending items are ordered by addition. Remove from end.

                // Try removing last Pending Action (Move or Interaction)
                // But they are separate lists.
                // We don't track global order of addition between moves vs interactions easily (unless we add timestamps).
                // heuristic: Remove from `pendingInteractions` first, then `pendingMoves`.

                if (this.pendingInteractions.length > 0) {
                    this.pendingInteractions.pop();
                    changed = true;
                } else if (this.pendingMoves.length > 0) {
                    this.pendingMoves.pop();
                    changed = true;
                }
            }

            // Also validate Interactions Availability
            // e.g. If I planned to "Build Outpost" on a tile I was planning to capture, but capture got cancelled.
            // Note: Interactions often depend on OWNERSHIP.
            // My pendingMoves usually Target Neutral/Enemy. So I don't own them yet.
            // Interaction on Pending Move?
            // If I plan Move to A, can I plan "Build" on A same turn?
            // Usually not implemented yet.
            // But if I have interaction on Existing Owned Tile A.
            // And that interaction requires something?
            // Most interactions are local.
            // But checking `isAvailable` is safe.

            const validInteractions = this.pendingInteractions.filter(i => {
                const action = this.interactionRegistry.get(i.actionId);
                if (!action) return false;
                // Note: isAvailable might revert to false if game state changes
                return action.isAvailable(this, i.r, i.c);
            });

            if (validInteractions.length !== this.pendingInteractions.length) {
                this.pendingInteractions = validInteractions;
                changed = true;
            }
        }
    }

    // Helper to get cost of a specific move
    getMoveCost(row: number, col: number): number {
        // Pass pendingMoves to allow chaining logic
        return CostSystem.getMoveCost(this.state, row, col, this.pendingMoves || []);
    }

    getCostDetails(row: number, col: number): { cost: number, breakdown: string } {
        return CostSystem.getCostDetails(this.state, row, col, this.pendingMoves);
    }

    getPotentialEnemyAttackCost(row: number, col: number): { cost: number, breakdown: string } {
        return CostSystem.getPotentialEnemyAttackCost(this.state, row, col);
    }

    // New: Expose Tile Income
    getTileIncome(row: number, col: number): number {
        return this.state.getTileIncome(row, col);
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
        // Calculate total cost of pending moves + this move (Refactored to helper)
        const plannedCost = this.calculatePlannedCost();
        const thisMoveCost = this.getMoveCost(row, col);

        if (player.gold < plannedCost + thisMoveCost) {
            let reason = `Not enough gold(Need ${thisMoveCost})`;
            const isLongRange = !this.state.isAdjacentToOwned(row, col, player.id);
            if (isLongRange) reason += " (Includes Distance Penalty)";

            // Return failure (Logging handled by caller)
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

            const player = this.state.players[pid];
            if (player.gold < cost) {
                this.emit('logMessage', { text: `Insufficient funds for move at (${move.r}, ${move.c})`, type: 'warning' });
                // We should probably stop execution here to prevent partial invalid state
                // Or continue? If we continue, we skip this move.
                // But later moves might depend on this one.
                // Pruning should have happened before. If we are here, something is wrong.
                // Safest: Abort remaining moves.
                break;
            }

            // Win Condition Check: Capture Enemy Base
            if (cell.building === 'base' && cell.owner !== pid) {
                // ELIMINATION LOGIC
                const loserId = cell.owner;
                this.emit('sfx:eliminate');
                if (loserId) {
                    this.emit('logMessage', { text: `${loserId} has been eliminated by ${pid}!`, type: 'combat' });

                    if (cell.building === 'base') {
                        this.state.setBuilding(move.r, move.c, 'none'); // Destroy Base
                    }

                    // Remove loser from order (stops them from getting turns)
                    this.stateManager.eliminatePlayer(loserId);



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

            // Farm Destruction Logic
            // If captured by enemy, destroy farm (revert to plain)
            // Note: If capturing from Neutral, maybe keep it? But Farms are usually built by players.
            // Requirement: "如果被敌军占领则毁掉变会空地平原" (If occupied by enemy, destroyed to plain)
            if (cell.building === 'farm' && cell.owner && cell.owner !== pid) {
                cell.building = 'none';
                cell.farmLevel = 0;
                this.emit('logMessage', { text: `Farm at (${move.r}, ${move.c}) destroyed!`, type: 'combat' });
            }

            // Transformation: Water -> Bridge
            if (cell && cell.type === 'water') {
                cell.type = 'bridge';
            }


            // Watchtower Destruction Logic
            // console.log(`[MoveDebug] Cell(${move.r},${move.c}) B:${cell.building} O:${cell.owner} PID:${pid} WLv:${cell.watchtowerLevel} DLv:${cell.defenseLevel}`);

            if (cell.watchtowerLevel > 0 && cell.owner && cell.owner !== pid) {
                cell.watchtowerLevel = 0;
                this.emit('logMessage', { text: `Watchtower at (${move.r}, ${move.c}) destroyed!`, type: 'combat' });
            }

            // Degradation Logic for Wall Capture
            if (cell.building === 'wall' && cell.owner && cell.owner !== pid) {
                if (cell.defenseLevel > 0) {
                    cell.defenseLevel--;
                    if (cell.defenseLevel === 0) {
                        cell.building = 'none';
                        this.emit('logMessage', { text: `Wall destroyed at (${move.r}, ${move.c})!`, type: 'combat' });
                    } else {
                        this.emit('logMessage', { text: `Wall breached! Degraded to Lv ${cell.defenseLevel}.`, type: 'combat' });
                    }
                }
            }

            this.state.setOwner(move.r, move.c, pid);

            // Gold Mine Discovery (Hill + Neutral Capture)
            if (cell.type === 'hill' && !hasCombat) {
                if (Math.random() < GameConfig.GOLD_MINE_CHANCE) {
                    this.state.setBuilding(move.r, move.c, 'gold_mine');
                    this.emit('logMessage', { text: `Gold Mine discovered at (${move.r}, ${move.c})!`, type: 'info' });
                    this.emit('sfx:gold_found');
                }
            }

            // Deduct cost immediately to prevent overspending in subsequent iterations
            this.stateManager.spendGold(pid, cost);
            totalCost += cost;
        }

        // Process Interactions
        // Note: Interactions happen AFTER moves (or concurrent). 
        // If an interaction relies on ownership, and a move changes ownership...
        // Interaction validity should be checked at execution time too.

        // Filter valid interactions (in case environment changed)
        // copy pending
        const interactionsToRun = [...this.pendingInteractions];

        interactionsToRun.forEach(interaction => {
            const action = this.interactionRegistry.get(interaction.actionId);
            if (action) {
                // Check Availability
                if (action.isAvailable(this, interaction.r, interaction.c)) {
                    const c = typeof action.cost === 'function' ? action.cost(this, interaction.r, interaction.c) : action.cost;

                    // Check Gold
                    const player = this.state.players[pid];
                    if (player.gold >= c) {
                        action.execute(this, interaction.r, interaction.c);
                        this.stateManager.spendGold(pid, c); // Deduct immediately
                        totalCost += c;
                    } else {
                        this.emit('logMessage', { text: `Insufficient funds for interaction ${interaction.actionId}`, type: 'warning' });
                    }
                } else {
                    console.warn(`Interaction ${interaction.actionId} failed validation at commit`);
                }
            }
        });

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
            // Already spent incrementally.
            // this.stateManager.spendGold(pid, totalCost);

            // Update Connectivity for ALL players
            // Check for enclaves for ALL players
            this.state.playerOrder.forEach(p => {
                this.state.updateConnectivity(p);
                this.checkForEnclaves(p);
            });

            this.emit('mapUpdate');
        }

        this.pendingMoves = []; // Clear
        this.pendingInteractions = []; // Clear Interactions
        this.lastError = null;
        this.emit('planUpdate');

        if (gameWon) {
            this.isGameOver = true;
            this.emit('gameOver', pid); // Winner is current player
        }
    }

    endTurn() {
        if (this.isGameOver) return;

        // Commit pending moves/interactions
        this.commitMoves();

        // Check if game ended in commitMoves
        if (this.isGameOver) return;

        this.state.turnCount++;

        // Switch Player
        // Switch Player
        const currentIndex = this.state.playerOrder.indexOf(this.state.currentPlayerId as string);
        const nextIndex = (currentIndex + 1) % this.state.playerOrder.length;
        const nextPlayerId = this.state.playerOrder[nextIndex];
        this.state.currentPlayerId = nextPlayerId;

        // Resource Accrual for NEXT player
        this.accrueResources(nextPlayerId);

        // Notify
        this.events.emit('turnChange');

        // Check for Game Over (Enclaves/Bankruptcy - optional)
        this.checkForEnclaves(nextPlayerId);

        // Trigger AI if applicable
        this.triggerAiTurn();
    }

    accrueResources(playerId: string) {
        // Delegate to GameState
        const stats = this.state.accrueResources(playerId);
        if (stats) {
            this.events.emit('turnChange'); // UI Update
            this.logIncomeReport(stats);
        }
    }

    private logIncomeReport(incomeReport: any) {
        // Detailed Income Summary Log (White/Info)
        const parts = [];
        if (incomeReport.base > 0) parts.push(`Base: +${incomeReport.base}`);
        if (incomeReport.town > 0) parts.push(`Towns: +${incomeReport.town}`);
        if (incomeReport.mine > 0) parts.push(`Mines: +${incomeReport.mine}`);
        if (incomeReport.farm > 0) parts.push(`Farms: +${incomeReport.farm}`);
        if (incomeReport.land > 0) parts.push(`Land(${incomeReport.landCount}): +${incomeReport.land}`);

        const summaryText = `Turn Start Income: +${incomeReport.total}G [ ${parts.join(', ')} ]`;
        this.emit('logMessage', { text: summaryText, type: 'info' });

        if (incomeReport.depletedMines && incomeReport.depletedMines.length > 0) {
            incomeReport.depletedMines.forEach((m: any) => {
                this.emit('logMessage', { text: `Gold Mine collapsed at (${m.r}, ${m.c})!`, type: 'info' });
            });
            this.emit('sfx:gold_depleted');
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
            this.emit('logMessage', { text: `Supply line cut! Enclaves detected for ${playerId}.`, type: 'warning' });
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
