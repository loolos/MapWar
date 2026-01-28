import { GameConfig } from './GameConfig';
import { AIController } from './AIController';
import { InteractionRegistry } from './interaction/InteractionRegistry';
import { CostSystem } from './CostSystem';
import { RandomAiProfiles, type AIProfile } from './ai/AIProfile';

import type { Action, EndTurnAction } from './Actions';
import type { Cell } from './Cell';
import type { MapType } from './map/MapGenerator';

import { GameStateManager } from './GameStateManager';
import { TypedEventEmitter } from './GameEvents';
import { TurnEventSystem, type TurnEventPayload, type TurnEventDefinition } from './events/TurnEventSystem';

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
    private actedTilesThisTurn: Set<string> = new Set();

    // AI
    ai: AIController;

    // Tutorial State
    hasTriggeredEnclaveTutorial: boolean = false;

    private turnEventSystem: TurnEventSystem;
    private random: () => number;
    private floodedCells: Map<string, { r: number; c: number; type: 'plain' | 'hill' | 'bridge' }> = new Map();
    private peaceDayActive = false;
    private peaceDayEndRound: number | null = null;
    private bloodMoonActive = false;
    private bloodMoonEndRound: number | null = null;
    private readonly baseAttackMultiplier = GameConfig.COST_MULTIPLIER_ATTACK;

    constructor(
        playerConfigs: { id: string, isAI: boolean, color: number }[] = [],
        mapType: MapType = 'default',
        randomFn: () => number = Math.random,
        options?: { randomizeAiProfiles?: boolean }
    ) {
        this.stateManager = new GameStateManager(playerConfigs, mapType);
        this.events = new TypedEventEmitter();
        this.pendingMoves = [];
        this.interactionRegistry = new InteractionRegistry();
        this.ai = new AIController(this);
        this.random = randomFn;
        this.turnEventSystem = new TurnEventSystem(this.random);
        this.turnEventSystem.setEventPrecheck('flood', () => this.hasLargeOcean());
        this.turnEventSystem.setEventPrecheck('flood_recede', () => ({
            ok: this.random() < GameConfig.TURN_EVENT_FLOOD_RECEDE_CHANCE,
            onFail: 'defer'
        }));
        this.turnEventSystem.setEventPrecheck('peace_day', () => ({
            ok: !this.bloodMoonActive,
            onFail: 'defer'
        }));
        this.turnEventSystem.setEventPrecheck('blood_moon', () => ({
            ok: !this.peaceDayActive,
            onFail: 'defer'
        }));

        if (options?.randomizeAiProfiles !== false) {
            this.assignRandomAiProfiles(playerConfigs);
        }
    }

    public setAiProfiles(profiles: Record<string, AIProfile | undefined>) {
        if (!profiles) return;
        for (const [playerId, profile] of Object.entries(profiles)) {
            if (profile) {
                this.ai.setProfileForPlayer(playerId, profile);
            }
        }
    }

    private assignRandomAiProfiles(playerConfigs: { id: string, isAI: boolean }[]) {
        if (!RandomAiProfiles.length) return;
        const aiPlayers = playerConfigs.filter(cfg => cfg.isAI);
        if (aiPlayers.length === 0) return;

        const pool = [...RandomAiProfiles];
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        for (let i = 0; i < aiPlayers.length; i++) {
            const profile = pool[i % pool.length];
            this.ai.setProfileForPlayer(aiPlayers[i].id, profile);
        }
    }

    private shouldPlayPlanningSfx(): boolean {
        const player = this.state.getCurrentPlayer();
        return !!player && !player.isAI;
    }

    startGame() {
        // Initial Income for first player
        const firstPlayer = this.state.playerOrder[0];
        if (firstPlayer) {
            this.state.accrueResources(firstPlayer);
        }

        this.emit('gameStart');
        this.maybeTriggerTurnEvent();

        if (firstPlayer && this.state.players[firstPlayer].isAI) {
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
        // Reset pending
        this.pendingMoves = [];
        this.pendingInteractions = [];
        this.lastAiMoves = [];
        this.lastError = null;
        this.actedTilesThisTurn.clear();
        if (this.peaceDayActive) this.endPeaceDay();
        if (this.bloodMoonActive) this.endBloodMoon();
        this.isGameOver = false;

        // Update Audio State (React to changes)
        this.checkAudioState();

        this.emit('stateChanged');

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
        this.actedTilesThisTurn.clear();
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

        try {
            const data = JSON.parse(json);
            const events = data?.events;
            if (events) {
                this.clearForcedTurnEvent();
                this.clearPersistentTurnEvent();
                if (Array.isArray(events.forced)) {
                    for (const item of events.forced) {
                        if (!item || typeof item.round !== 'number' || !item.event) continue;
                        this.forceTurnEventAtRound(item.round, item.event);
                    }
                }
                if (events.persistent?.event) {
                    this.setPersistentTurnEvent(events.persistent.event, events.persistent.chancePerRound);
                }
            }
        } catch {
            // Ignore invalid preset event metadata.
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

        // Validate payload moves against current rules to avoid bypass
        const uniqueMoves: { r: number; c: number }[] = [];
        const seen = new Set<string>();
        for (const move of action.payload.moves) {
            const key = `${move.r},${move.c}`;
            if (seen.has(key)) continue;
            seen.add(key);
            uniqueMoves.push({ r: move.r, c: move.c });
        }

        // Validate without relying on payload order
        this.pendingMoves = uniqueMoves;
        const validatedMoves = this.pendingMoves.filter(move => {
            if (!this.isValidCell(move.r, move.c)) {
                this.emit('logMessage', { text: `Invalid move in payload at (${move.r}, ${move.c}) skipped.`, type: 'warning' });
                return false;
            }
            const cell = this.state.getCell(move.r, move.c);
            if (cell && cell.owner === this.state.currentPlayerId) {
                this.emit('logMessage', { text: `Invalid move in payload at (${move.r}, ${move.c}) skipped.`, type: 'warning' });
                return false;
            }
            const rules = this.validateMove(move.r, move.c, false);
            if (!rules.valid) {
                this.emit('logMessage', { text: `Invalid move in payload at (${move.r}, ${move.c}) skipped.`, type: 'warning' });
                return false;
            }
            return true;
        });
        this.pendingMoves = validatedMoves;
        this.revalidatePendingPlan();
        this.commitMoves();
        if (this.isGameOver) return;

        this.advanceTurn();
    }

    private advanceTurn() {
        const incomeReport = this.state.endTurn();
        this.actedTilesThisTurn.clear();

        // Turn Change -> Re-evaluate Music
        this.checkAudioState();

        this.emit('turnChange');

        if (incomeReport) {
            this.emit('incomeReport', incomeReport);
            this.logIncomeReport(incomeReport);
        }

        const nextPlayer = this.state.getCurrentPlayer();
        const nextPlayerId = this.state.currentPlayerId;
        if (nextPlayerId) {
            this.checkForEnclaves(nextPlayerId);
        }
        this.maybeTriggerTurnEvent();
        if (nextPlayer.isAI) {
            this.triggerAiTurn();
        }
    }

    private maybeTriggerTurnEvent() {
        this.checkPeaceDayExpiry();
        this.checkBloodMoonExpiry();
        const event = this.turnEventSystem.onTurnStart({
            round: this.state.turnCount,
            turnsTakenInRound: this.state.turnsTakenInRound,
            playerOrder: this.state.playerOrder,
            currentPlayerId: this.state.currentPlayerId
        });
        if (event) {
            const resolved = this.applyTurnEvent(event);
            this.emit('turnEvent', resolved);
        }
    }

    public forceTurnEventAtRound(round: number, event: TurnEventDefinition) {
        this.turnEventSystem.forceEventAtRound(round, event);
    }

    public clearForcedTurnEvent(round?: number) {
        this.turnEventSystem.clearForcedEvent(round);
    }

    public setPersistentTurnEvent(event: TurnEventDefinition, chancePerRound?: number) {
        this.turnEventSystem.setPersistentEvent(event, chancePerRound);
    }

    public clearPersistentTurnEvent() {
        this.turnEventSystem.clearPersistentEvent();
    }

    private applyTurnEvent(event: TurnEventPayload): TurnEventPayload {
        if (event.eventId === 'flood') {
            const flooded = this.applyFloodEvent();
            return {
                ...event,
                message: flooded > 0
                    ? `Floodwaters engulf ${flooded} tiles near the sea.`
                    : 'Floodwaters surge but the land holds.'
            };
        }
        if (event.eventId === 'flood_recede') {
            const restored = this.applyFloodRecedeEvent();
            return {
                ...event,
                message: restored > 0
                    ? `Floodwaters recede from ${restored} tiles.`
                    : 'The floodwaters linger.'
            };
        }
        if (event.eventId === 'peace_day') {
            const duration = event.params?.duration ?? this.randomInt(
                GameConfig.TURN_EVENT_PEACE_DAY_DURATION_MIN,
                GameConfig.TURN_EVENT_PEACE_DAY_DURATION_MAX
            );
            const rawMultiplier = event.params?.multiplier ?? this.randomRange(
                GameConfig.TURN_EVENT_PEACE_DAY_ATTACK_MULTIPLIER_MIN,
                GameConfig.TURN_EVENT_PEACE_DAY_ATTACK_MULTIPLIER_MAX
            );
            const multiplier = Math.round(rawMultiplier * 10) / 10;
            this.startPeaceDay(duration, multiplier);
            return event;
        }
        if (event.eventId === 'blood_moon') {
            const duration = event.params?.duration ?? this.randomInt(
                GameConfig.TURN_EVENT_BLOOD_MOON_DURATION_MIN,
                GameConfig.TURN_EVENT_BLOOD_MOON_DURATION_MAX
            );
            const rawMultiplier = event.params?.multiplier ?? this.randomRange(
                GameConfig.TURN_EVENT_BLOOD_MOON_ATTACK_MULTIPLIER_MIN,
                GameConfig.TURN_EVENT_BLOOD_MOON_ATTACK_MULTIPLIER_MAX
            );
            const multiplier = Math.round(rawMultiplier * 10) / 10;
            this.startBloodMoon(duration, multiplier);
            return event;
        }
        return event;
    }

    private applyFloodEvent(): number {
        const grid = this.state.grid;
        const height = grid.length;
        const width = height > 0 ? grid[0].length : 0;
        if (height === 0 || width === 0) return 0;

        const floodChanceBase = GameConfig.FLOOD_CHANCE_BASE;
        const floodChanceWall = GameConfig.FLOOD_CHANCE_WALL;
        const floodBridgeDistanceBonus = GameConfig.FLOOD_BRIDGE_DISTANCE_BONUS;
        const oceanMinSize = GameConfig.TURN_EVENT_FLOOD_OCEAN_MIN_SIZE;
        const visited = Array.from({ length: height }, () => Array(width).fill(false));
        const oceanId = Array.from({ length: height }, () => Array(width).fill(-1));
        const oceanSizes: number[] = [];
        const isWaterLike = (cell: Cell) => cell.type === 'water' || cell.type === 'bridge';
        const isLand = (cell: Cell) => !isWaterLike(cell);

        const bfs = (sr: number, sc: number, id: number) => {
            const queue: { r: number; c: number }[] = [{ r: sr, c: sc }];
            visited[sr][sc] = true;
            oceanId[sr][sc] = id;
            let size = 0;
            let head = 0;
            while (head < queue.length) {
                const curr = queue[head++];
                size++;
                const neighbors = [
                    { r: curr.r + 1, c: curr.c },
                    { r: curr.r - 1, c: curr.c },
                    { r: curr.r, c: curr.c + 1 },
                    { r: curr.r, c: curr.c - 1 }
                ];
                for (const n of neighbors) {
                    if (n.r < 0 || n.r >= height || n.c < 0 || n.c >= width) continue;
                    if (visited[n.r][n.c]) continue;
                    if (!isWaterLike(grid[n.r][n.c])) continue;
                    visited[n.r][n.c] = true;
                    oceanId[n.r][n.c] = id;
                    queue.push(n);
                }
            }
            oceanSizes[id] = size;
        };

        let oceanCount = 0;
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                if (!visited[r][c] && isWaterLike(grid[r][c])) {
                    bfs(r, c, oceanCount);
                    oceanCount++;
                }
            }
        }

        const isLargeOcean = (r: number, c: number) => {
            const id = oceanId[r][c];
            return id >= 0 && (oceanSizes[id] || 0) >= oceanMinSize;
        };
        const distanceToLand = Array.from({ length: height }, () => Array(width).fill(-1));
        const distanceQueue: { r: number; c: number }[] = [];
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                if (isLand(grid[r][c])) {
                    distanceToLand[r][c] = 0;
                    distanceQueue.push({ r, c });
                }
            }
        }
        let distanceHead = 0;
        while (distanceHead < distanceQueue.length) {
            const curr = distanceQueue[distanceHead++];
            const nextDistance = distanceToLand[curr.r][curr.c] + 1;
            const neighbors = [
                { r: curr.r + 1, c: curr.c },
                { r: curr.r - 1, c: curr.c },
                { r: curr.r, c: curr.c + 1 },
                { r: curr.r, c: curr.c - 1 }
            ];
            for (const n of neighbors) {
                if (n.r < 0 || n.r >= height || n.c < 0 || n.c >= width) continue;
                if (distanceToLand[n.r][n.c] !== -1) continue;
                distanceToLand[n.r][n.c] = nextDistance;
                distanceQueue.push(n);
            }
        }

        const candidates: { r: number; c: number; isBridge?: boolean }[] = [];
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                const cell = grid[r][c];
                if (cell.type === 'bridge') {
                    if (isLargeOcean(r, c)) {
                        candidates.push({ r, c, isBridge: true });
                    }
                    continue;
                }
                if (cell.type === 'water') continue;
                if (cell.building === 'base') continue;
                const neighbors = [
                    { r: r + 1, c },
                    { r: r - 1, c },
                    { r, c: c + 1 },
                    { r, c: c - 1 }
                ];
                if (neighbors.some(n => n.r >= 0 && n.r < height && n.c >= 0 && n.c < width && isLargeOcean(n.r, n.c))) {
                    candidates.push({ r, c });
                }
            }
        }

        if (candidates.length === 0) return 0;

        const affectedPlayers = new Set<string>(); // Track players whose lands were flooded
        let flooded = 0;
        for (const { r, c, isBridge } of candidates) {
            const cell = grid[r][c];
            if (cell.type === 'water' || cell.building === 'base') continue;
            let chance = cell.building === 'wall' ? floodChanceWall : floodChanceBase;
            if (isBridge) {
                const distRaw = distanceToLand[r][c];
                const dist = distRaw >= 0 ? Math.max(0, distRaw - 1) : Math.max(height, width);
                chance = Math.min(1, floodChanceBase + dist * floodBridgeDistanceBonus);
            } else if (cell.type === 'hill') {
                chance *= 0.25; // hills 1/4 as likely to flood as plains
            }
            if (this.random() > chance) continue;
            const previousOwner = cell.owner; // Store before clearing
            if (previousOwner) {
                affectedPlayers.add(previousOwner);
            }
            this.floodedCells.set(`${r},${c}`, { r, c, type: cell.type });
            cell.owner = null;
            cell.building = 'none';
            cell.defenseLevel = 0;
            cell.incomeLevel = 0;
            cell.watchtowerLevel = 0;
            cell.farmLevel = 0;
            cell.unit = null;
            cell.isConnected = false;
            cell.type = 'water';
            flooded++;
        }

        // Update connectivity for players whose lands were flooded
        affectedPlayers.forEach(playerId => {
            this.state.updateConnectivity(playerId);
            this.checkForEnclaves(playerId);
        });

        if (flooded > 0) {
            this.turnEventSystem.setPersistentEvent({
                id: 'flood_recede',
                name: GameConfig.TURN_EVENT_FLOOD_RECEDE_NAME,
                message: GameConfig.TURN_EVENT_FLOOD_RECEDE_MESSAGE,
                sfxKey: GameConfig.TURN_EVENT_FLOOD_RECEDE_SFX
            }, GameConfig.TURN_EVENT_FLOOD_RECEDE_PERSISTENT_CHANCE);
            this.revalidateAllConnectivity();
            this.emit('mapUpdate');
        }
        return flooded;
    }

    private applyFloodRecedeEvent(): number {
        if (this.floodedCells.size === 0) return 0;
        let restored = 0;
        for (const entry of this.floodedCells.values()) {
            const cell = this.state.getCell(entry.r, entry.c);
            if (!cell) continue;
            if (cell.type === 'water' && entry.type !== 'bridge') {
                cell.type = entry.type;
                restored++;
            }
        }
        this.floodedCells.clear();
        if (restored > 0) {
            this.revalidateAllConnectivity();
            this.emit('mapUpdate');
        }
        return restored;
    }

    private startPeaceDay(durationRounds: number, attackMultiplier: number) {
        this.peaceDayActive = true;
        this.peaceDayEndRound = this.state.turnCount + Math.max(1, durationRounds);
        GameConfig.COST_MULTIPLIER_ATTACK = attackMultiplier;
        this.emit('peaceDayState', { active: true });
        this.emit('musicState', 'PEACE_DAY');
    }

    private endPeaceDay() {
        if (!this.peaceDayActive) return;
        this.peaceDayActive = false;
        this.peaceDayEndRound = null;
        GameConfig.COST_MULTIPLIER_ATTACK = this.baseAttackMultiplier;
        this.emit('peaceDayState', { active: false });
        this.checkAudioState();
    }

    private checkPeaceDayExpiry() {
        if (!this.peaceDayActive || this.peaceDayEndRound === null) return;
        if (this.state.turnsTakenInRound === 0 && this.state.turnCount >= this.peaceDayEndRound) {
            this.endPeaceDay();
        }
    }

    private startBloodMoon(durationRounds: number, attackMultiplier: number) {
        this.bloodMoonActive = true;
        this.bloodMoonEndRound = this.state.turnCount + Math.max(1, durationRounds);
        GameConfig.COST_MULTIPLIER_ATTACK = attackMultiplier;
        this.emit('bloodMoonState', { active: true });
        this.emit('musicState', 'DOOM'); // Blood Moon implies danger/doom
    }

    private endBloodMoon() {
        if (!this.bloodMoonActive) return;
        this.bloodMoonActive = false;
        this.bloodMoonEndRound = null;
        GameConfig.COST_MULTIPLIER_ATTACK = this.baseAttackMultiplier;
        this.emit('bloodMoonState', { active: false });
        this.checkAudioState();
    }

    private checkBloodMoonExpiry() {
        if (!this.bloodMoonActive || this.bloodMoonEndRound === null) return;
        if (this.state.turnsTakenInRound === 0 && this.state.turnCount >= this.bloodMoonEndRound) {
            this.endBloodMoon();
        }
    }

    private randomRange(min: number, max: number): number {
        return min + (this.random() * (max - min));
    }

    private randomInt(min: number, max: number): number {
        const low = Math.min(min, max);
        const high = Math.max(min, max);
        return Math.floor(this.random() * (high - low + 1)) + low;
    }

    private revalidateAllConnectivity() {
        const playerIds = this.state.allPlayerIds?.length ? this.state.allPlayerIds : this.state.playerOrder;
        for (const playerId of playerIds) {
            this.state.updateConnectivity(playerId);
        }
    }

    private hasLargeOcean(minSize: number = GameConfig.TURN_EVENT_FLOOD_OCEAN_MIN_SIZE): boolean {
        const grid = this.state.grid;
        const height = grid.length;
        const width = height > 0 ? grid[0].length : 0;
        if (height === 0 || width === 0) return false;

        const visited = Array.from({ length: height }, () => Array(width).fill(false));
        const queue: { r: number; c: number }[] = [];

        const enqueue = (r: number, c: number) => {
            visited[r][c] = true;
            queue.push({ r, c });
        };

        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                if (visited[r][c] || (grid[r][c].type !== 'water' && grid[r][c].type !== 'bridge')) continue;
                enqueue(r, c);
                let size = 0;
                let head = 0;
                while (head < queue.length) {
                    const curr = queue[head++];
                    size++;
                    const neighbors = [
                        { r: curr.r + 1, c: curr.c },
                        { r: curr.r - 1, c: curr.c },
                        { r: curr.r, c: curr.c + 1 },
                        { r: curr.r, c: curr.c - 1 }
                    ];
                    for (const n of neighbors) {
                        if (n.r < 0 || n.r >= height || n.c < 0 || n.c >= width) continue;
                        if (visited[n.r][n.c]) continue;
                        if (grid[n.r][n.c].type !== 'water' && grid[n.r][n.c].type !== 'bridge') continue;
                        enqueue(n.r, n.c);
                    }
                }
                queue.length = 0;
                if (size >= minSize) return true;
            }
        }
        return false;
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
        }, GameConfig.AI_TURN_DELAY_MS);
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
        if (this.hasActedThisTurn(row, col)) {
            this.lastError = "Tile already acted this turn";
            this.emit('logMessage', { text: `Action blocked: (${row}, ${col}) already acted this turn.`, type: 'warning' });
            this.emit('planUpdate');
            return;
        }

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
        if (!action.isAvailable(this, row, col, true)) {
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

        // Remove any existing interaction at this tile BEFORE cost check (Replace strategy)
        // This ensures cost check uses the correct total (without the old action's cost)
        const existingAtTile = this.pendingInteractions.findIndex(i => i.r === row && i.c === col);
        if (existingAtTile >= 0) {
            this.pendingInteractions.splice(existingAtTile, 1);
        }

        // Cost Check (now that old action is removed, currentCost won't include it)
        const player = this.state.getCurrentPlayer();
        const currentCost = this.calculatePlannedCost();
        if (player.gold < currentCost + cost) {
            this.lastError = `Not enough gold for ${label}`;
            // Error Log (Red)
            this.emit('logMessage', {
                text: `Insufficient Funds: Need ${this.formatLogNumber(currentCost + cost)}G (Have ${this.formatLogNumber(player.gold)}G) for ${label}.`,
                type: 'error'
            });
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

        this.pendingInteractions.push({ r: row, c: col, actionId });

        // Re-validate everything (e.g. check cost limits)
        this.revalidatePendingPlan();

        this.emit('planUpdate');
        if (this.shouldPlayPlanningSfx()) {
            this.emit('sfx:select'); // Feedback
        }
    }

    clearPlan() {
        if (this.isGameOver) return;
        this.pendingMoves = [];
        this.pendingInteractions = [];
        this.lastError = null;
        this.emit('planUpdate');
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
        if (this.hasActedThisTurn(row, col)) {
            this.lastError = "Tile already acted this turn";
            if (this.shouldPlayPlanningSfx()) {
                this.emit('sfx:cancel');
            }
            return;
        }
        const existingIndex = this.pendingMoves.findIndex(m => m.r === row && m.c === col);

        if (existingIndex >= 0) {
            // Remove (only this one, let revalidate handle dependencies)
            this.pendingMoves.splice(existingIndex, 1);
            this.lastError = null;
            if (this.shouldPlayPlanningSfx()) {
                this.emit('sfx:cancel');
            }
        } else {
            // Try to Add (Pass isAction = true)
            const ruleValidation = this.validateMove(row, col, true);
            if (ruleValidation.valid) {
                // ONLY if rules pass, check cost
                const costValidation = this.checkMoveCost(row, col, true);
                if (costValidation.valid) {
                    this.pendingMoves.push({ r: row, c: col });
                    this.lastError = null;
                    if (this.shouldPlayPlanningSfx()) {
                        this.emit('sfx:select');
                    }
                    // ... reminders ...
                    // Reminder Log (Yellow) - Distance Multiplier
                    const details = this.getCostDetails(row, col);
                    if (details.breakdown.includes('Distance')) {
                        this.emit('logMessage', { text: `Reminder: Distance Multiplier Active! Cost is higher due to distance.`, type: 'warning' });
                    }
                } else {
                    // Rules passed, but Cost failed
                    this.lastError = costValidation.reason || "Insufficient funds";
                    if (this.shouldPlayPlanningSfx()) {
                        this.emit('sfx:cancel');
                    }
                }

            } else {
                this.lastError = ruleValidation.reason || "Invalid move";
                if (this.shouldPlayPlanningSfx()) {
                    this.emit('sfx:cancel');
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
        while (changed && loops < GameConfig.PLAN_REVALIDATE_MAX_LOOPS) { // Safety break
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
                const removedCount = this.pendingMoves.length - newMoves.length;
                this.pendingMoves = newMoves;
                changed = true;
                if (this.shouldPlayPlanningSfx()) {
                    this.emit('sfx:cancel'); // Feedback for auto-cancel?
                }
                // Warning Log (Yellow) - Cascade Cancellation
                this.emit('logMessage', { text: `Dependent moves cancelled (${removedCount} items).`, type: 'warning' });
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

    validateMove(row: number, col: number, isAction: boolean = false): { valid: boolean; reason?: string } {
        const playerId = this.state.currentPlayerId;
        if (!playerId) return { valid: false, reason: "No active player" };
        const player = this.state.getCurrentPlayer();
        const cell = this.state.getCell(row, col);

        // 1. Basic Cell Checks
        if (!cell) return { valid: false, reason: "Out of bounds" };
        if (cell.owner === playerId) return { valid: false, reason: "Already owned" }; // Self-own check

        // 2. Adjacency Check (Supply Line Rule)
        // must be adjacent to CONNECTED territory or PENDING
        const isAdjToConnected = this.state.isAdjacentToConnected(row, col, playerId);
        const isAdjToPending = this.isAdjacentToPending(row, col);

        if (!isAdjToConnected && !isAdjToPending) {
            const reason = "Must connect to Main Base supply line";
            if (isAction && !player.isAI) {
                this.emit('logMessage', { text: reason, type: 'error' });
            }
            return { valid: false, reason };
        }

        // 3. Terrain Check
        if (cell.type === 'water') {
            // Must be adjacent to ALREADY OWNED land to build a bridge (User Requirement)
            // "If in adjacent area of occupied area, player can click build bridge"
            const isAdjToOwned = this.state.isAdjacentToOwned(row, col, playerId);
            if (!isAdjToOwned) {
                const reason = "Bridges can only be built from existing territory";
                if (isAction && !player.isAI) {
                    this.emit('logMessage', { text: reason, type: 'error' });
                }
                return { valid: false, reason: "Bridges can only be built from existing territory" };
            }
        }

        // 4. Cost Check - MOVED to checkMoveCost
        // validateMove now only checks RULES.

        return { valid: true };
    }

    // New: Explicit Cost Check
    checkMoveCost(row: number, col: number, isAction: boolean = false): { valid: boolean; reason?: string } {
        const playerId = this.state.currentPlayerId;
        if (!playerId) return { valid: false, reason: "No active player" };
        const player = this.state.getCurrentPlayer();

        const plannedCost = this.calculatePlannedCost();
        const thisMoveCost = this.getMoveCost(row, col);

        if (player.gold < plannedCost + thisMoveCost) {
            let reason = `Not enough gold(Need ${this.formatLogNumber(thisMoveCost)})`;
            const isLongRange = !this.state.isAdjacentToOwned(row, col, player.id);
            if (isLongRange) reason += " (Includes Distance Penalty)";

            // Only log if this is an explicit action (User Click) AND not AI
            if (isAction && !player.isAI) {
                const details = this.getCostDetails(row, col);
                const logMsg = `Insufficient Funds: Need ${this.formatLogNumber(plannedCost + thisMoveCost)}G (Have ${this.formatLogNumber(player.gold)}G). \nCost Logic: ${details.breakdown || 'Base Cost'}`;
                this.emit('logMessage', { text: logMsg, type: 'error' });
            }

            return { valid: false, reason };
        }
        return { valid: true };
    }


    public isValidCell(r: number, c: number): boolean {
        const height = this.state.grid.length;
        const width = height > 0 ? this.state.grid[0].length : 0;
        return r >= 0 && r < height && c >= 0 && c < width;
    }



    // --- Audio / Tension System ---

    private updateMusicState() {
        if (this.peaceDayActive) {
            this.emit('musicState', 'PEACE_DAY');
            return;
        }
        if (this.bloodMoonActive) {
            this.emit('musicState', 'DOOM');
            return;
        }
        const tensionState = this.calculateTensionState();
        this.emit('musicState', tensionState);
    }

    private calculateTensionState(): 'PEACE' | 'TENSION' | 'CONFLICT' | 'DOOM' {
        // 1. DOOM: Any owned Base under direct threat (HP < Max) OR very low total units/land count compared to enemy?
        // Simple Doom Check: My Base HP < 100? (Base HP not fully implemented yet, let's assume HP checks or Enemy Adjacency to Base)
        const pid = this.state.currentPlayerId;

        let doom = false;
        let conflict = false;
        let tension = false;

        // Scan Grid for critical states
        const height = this.state.grid.length;
        const width = height > 0 ? this.state.grid[0].length : 0;
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                const cell = this.state.grid[r][c];

                // Doom: Enemy adjacent to My Base
                if (cell.owner === pid && cell.building === 'base') {
                    const neighbors = this.state.getNeighbors(r, c);
                    if (neighbors.some((n: any) => n.owner && n.owner !== pid)) {
                        doom = true;
                    }
                }

                // Conflict: Recent skirmishes? 
                // We can track lastTurnAttacks. For now, check if I am adjacent to Enemy everywhere (Frontline density)
                if (cell.owner === pid) {
                    const neighbors = this.state.getNeighbors(r, c);
                    if (neighbors.some((n: any) => {
                        const isEnemy = n.owner && n.owner !== pid;
                        return isEnemy;
                    })) {
                        tension = true;
                    }
                }
            }
        }

        // Check recent history for Conflict
        // If last player action was Attack, or lost units
        if (this.lastAiMoves.length > 5) conflict = true; // Lots of AI activity? Mock.

        if (doom) return 'DOOM';
        if (conflict) return 'CONFLICT'; // Need usage stats for true conflict detection
        // For now, let's toggle CONFLICT if user just Attacked
        // (This might need a 'combatCounter' in state to be robust)

        if (tension) return 'TENSION';
        return 'PEACE';
    }

    // Call this after moves committed
    private checkAudioState() {
        this.updateMusicState();
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

    private hasActedThisTurn(row: number, col: number): boolean {
        return this.actedTilesThisTurn.has(`${row},${col}`);
    }

    private markActedThisTurn(row: number, col: number) {
        this.actedTilesThisTurn.add(`${row},${col}`);
    }

    commitMoves() {
        const pid = this.state.currentPlayerId;
        if (!pid) return;

        // Snapshot costs BEFORE execution to ensure consistency with the Plan

        let totalCost = 0;
        let gameWon = false;

        let hasCombat = false;
        let hasTownCapture = false;
        let hasCitadelCapture = false;
        let hasConquer = false;
        let hasBaseCapture = false;
        let captureCount = 0;
        let conquerCount = 0;
        let bridgeBuiltCount = 0;
        const ownershipChangedPlayers = new Set<string>(); // Track players whose land ownership changed


        // Snapshot costs BEFORE execution to ensure consistency with the Plan
        // logic (which assumes current state for all moves).
        // This prevents "Cheaper than planned" issues where capturing A makes B closer/cheaper during execution.
        const movesWithCost = this.pendingMoves.map(m => ({
            move: m,
            cost: this.getMoveCost(m.r, m.c) // Snapshot
        }));

        for (const { move, cost } of movesWithCost) {
            if (this.hasActedThisTurn(move.r, move.c)) {
                continue;
            }
            const cell = this.state.getCell(move.r, move.c);

            if (!cell) continue; // Safety Check

            // Win Condition Check: Capture Enemy Base
            if (cell.building === 'base' && cell.owner !== pid) {
                // ELIMINATION LOGIC
                const loserId = cell.owner;
                hasBaseCapture = true;
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
                ownershipChangedPlayers.add(cell.owner); // Track player who lost land
                ownershipChangedPlayers.add(pid); // Track attacker who gained land
                conquerCount++;
                captureCount++;
            } else if (cell.owner === null) {
                // Neutral capture - only attacker gains land
                ownershipChangedPlayers.add(pid);
                captureCount++;
            }

            // Citadel capture: reset previous owner's dominance counter
            // Check capture logic (Neutral OR Enemy)
            if (cell.building === 'citadel' && cell.owner !== pid) {
                hasCitadelCapture = true;
                if (cell.owner) {
                    this.state.players[cell.owner].citadelTurnsHeld = 0;
                }
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

            // Check for treasure BEFORE converting water to bridge
            const wasWater = cell && cell.type === 'water';

            // Transformation: Water -> Bridge
            if (wasWater) {
                bridgeBuiltCount++;
                ownershipChangedPlayers.add(pid); // Bridge building gives ownership, affects connectivity
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

            // Treasure Chest/Flotsam Collection
            if (cell.treasureGold !== null && cell.treasureGold > 0) {
                const gold = cell.treasureGold;
                this.stateManager.addGold(pid, gold);
                const terrainType = wasWater ? 'flotsam' : 'treasure chest';
                this.emit('logMessage', {
                    text: `${pid} found ${gold}G in a ${terrainType} at (${move.r}, ${move.c})!`,
                    type: 'info'
                });
                this.emit('sfx:gold_found');
                cell.treasureGold = null; // Remove treasure
                this.ai.invalidateTreasureCache(); // Invalidate cache
            }

            // Gold Mine Discovery (Hill + Neutral Capture)
            if (cell.type === 'hill' && !hasCombat) {
                if (this.random() < GameConfig.GOLD_MINE_CHANCE) {
                    this.state.setBuilding(move.r, move.c, 'gold_mine');
                    this.emit('logMessage', { text: `Gold Mine discovered at (${move.r}, ${move.c})!`, type: 'info' });
                    this.emit('sfx:gold_found');
                }
            }

            // Deduct cost immediately to prevent overspending in subsequent iterations
            this.stateManager.spendGold(pid, cost);
            totalCost += cost;
            this.markActedThisTurn(move.r, move.c);
        }

        // Emit SFX based on priority (Highest impact first)
        const captureTier = captureCount >= 5 ? 'large' : captureCount >= 3 ? 'medium' : captureCount >= 1 ? 'small' : null;
        if (hasBaseCapture) {
            this.emit('sfx:base_capture');
        } else if (hasCitadelCapture) {
            this.emit('sfx:capture_citadel');
        } else if (hasTownCapture) {
            this.emit('sfx:capture_town');
        } else if (hasConquer) {
            if (captureTier === 'large' && conquerCount >= 3) this.emit('sfx:conquer_large');
            else this.emit('sfx:conquer'); // Epic Capture
        } else if (hasCombat) {
            this.emit('sfx:attack');
        } else if (captureTier) {
            this.emit(`sfx:capture_${captureTier}` as any);
        } else if (this.pendingMoves.length > 0) {
            this.emit('sfx:move');
        }


        // Process Interactions
        // Note: Interactions happen AFTER moves (or concurrent). 
        // If an interaction relies on ownership, and a move changes ownership...
        // Interaction validity should be checked at execution time too.

        // Filter valid interactions (in case environment changed)
        // copy pending
        const interactionsToRun = [...this.pendingInteractions];

        let baseIncomeUpgrades = 0;
        let baseDefenseUpgrades = 0;
        let wallBuilds = 0;
        let wallUpgrades = 0;
        let watchtowerBuilds = 0;
        let watchtowerUpgrades = 0;
        let farmBuilds = 0;
        let farmUpgrades = 0;

        interactionsToRun.forEach(interaction => {
            const action = this.interactionRegistry.get(interaction.actionId);
            if (action) {
                if (this.hasActedThisTurn(interaction.r, interaction.c)) {
                    return;
                }
                // Check Availability
                if (action.isAvailable(this, interaction.r, interaction.c)) {
                    const c = typeof action.cost === 'function' ? action.cost(this, interaction.r, interaction.c) : action.cost;
                    action.execute(this, interaction.r, interaction.c);
                    if (interaction.actionId === 'BUILD_WALL') wallBuilds++;
                    if (interaction.actionId === 'BUILD_WATCHTOWER') watchtowerBuilds++;
                    if (interaction.actionId === 'UPGRADE_WATCHTOWER') watchtowerUpgrades++;
                    if (interaction.actionId === 'BUILD_FARM') farmBuilds++;
                    if (interaction.actionId === 'UPGRADE_FARM') farmUpgrades++;
                    if (interaction.actionId === 'UPGRADE_INCOME') baseIncomeUpgrades++;
                    if (interaction.actionId === 'UPGRADE_DEFENSE') {
                        const cell = this.state.getCell(interaction.r, interaction.c);
                        if (cell?.building === 'wall') wallUpgrades++;
                        else if (cell?.building === 'base') baseDefenseUpgrades++;
                    }
                    this.stateManager.spendGold(pid, c); // Deduct immediately (can go negative)
                    totalCost += c;
                    this.markActedThisTurn(interaction.r, interaction.c);
                } else {
                    console.warn(`Interaction ${interaction.actionId} failed validation at commit`);
                }
            }
        });

        if (bridgeBuiltCount > 0) this.emit('sfx:bridge_build');
        if (farmBuilds > 0) this.emit('sfx:farm_build');
        if (farmUpgrades > 0) this.emit('sfx:farm_upgrade');
        if (wallBuilds > 0) this.emit('sfx:wall_build');
        if (wallUpgrades > 0) this.emit('sfx:wall_upgrade');
        if (watchtowerBuilds > 0) this.emit('sfx:watchtower_build');
        if (watchtowerUpgrades > 0) this.emit('sfx:watchtower_upgrade');
        if (baseIncomeUpgrades > 0) this.emit('sfx:base_upgrade_income');
        if (baseDefenseUpgrades > 0) this.emit('sfx:base_upgrade_defense');

        // Reset pending
        this.pendingMoves = [];
        this.pendingInteractions = [];

        // Update Audio State (React to changes)
        this.checkAudioState();

        this.emit('stateChanged');
        this.emit('planUpdate');

        if (gameWon) {
            this.isGameOver = true;
            this.emit('gameOver', pid);
            this.emit('sfx:victory');
        }

        // Update connectivity for all players whose land ownership changed
        // This includes: attackers, defenders, bridge builders, and any player who gained/lost land
        // (Update regardless of totalCost, as ownership changes affect connectivity)
        if (ownershipChangedPlayers.size > 0) {
            ownershipChangedPlayers.forEach(playerId => {
                this.state.updateConnectivity(playerId);
                this.checkForEnclaves(playerId);
            });
        }

        if (totalCost > 0) {
            // Already spent incrementally.
            // this.stateManager.spendGold(pid, totalCost);
            this.emit('mapUpdate');
        }

    }

    endTurn() {
        if (this.isGameOver) return;

        // Commit pending moves/interactions
        this.commitMoves();

        // Check if game ended in commitMoves
        if (this.isGameOver) return;
        this.advanceTurn();
    }

    accrueResources(playerId: string) {
        // Delegate to GameState
        const stats = this.state.accrueResources(playerId);
        if (stats) {
            this.events.emit('turnChange'); // UI Update
            this.logIncomeReport(stats);
        }
    }

    private formatLogNumber(value: number): string {
        if (!Number.isFinite(value)) return String(value);
        const rounded = Math.round(value * 10) / 10;
        return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    }

    private logIncomeReport(incomeReport: any) {
        // Detailed Income Summary Log (White/Info)
        const parts = [];
        if (incomeReport.base > 0) parts.push(`Base: +${this.formatLogNumber(incomeReport.base)}`);
        if (incomeReport.town > 0) parts.push(`Towns: +${this.formatLogNumber(incomeReport.town)}`);
        if (incomeReport.mine > 0) parts.push(`Mines: +${this.formatLogNumber(incomeReport.mine)}`);
        if (incomeReport.farm > 0) parts.push(`Farms: +${this.formatLogNumber(incomeReport.farm)}`);
        if (incomeReport.land > 0) parts.push(`Land(${incomeReport.landCount}): +${this.formatLogNumber(incomeReport.land)}`);

        const summaryText = `Turn ${this.state.turnCount} Start. Income: +${this.formatLogNumber(incomeReport.total)} (${parts.join(', ')})`;
        this.emit('logMessage', { text: summaryText, type: 'info' });

        if (incomeReport.powerActivated && incomeReport.attackCostFactor) {
            const factor = Number.isFinite(incomeReport.attackCostFactor)
                ? incomeReport.attackCostFactor.toFixed(1)
                : '1.0';
            this.emit('logMessage', { text: `Power surge! Attack costs reduced (x${factor}).`, type: 'info' });
        }

        if (incomeReport.citadelDominanceActive && incomeReport.attackCostFactor > 1) {
            const factor = Number.isFinite(incomeReport.attackCostFactor)
                ? incomeReport.attackCostFactor.toFixed(1)
                : '1.0';
            this.emit('logMessage', { text: `Citadel Dominance Active! Attack Power x${factor}`, type: 'warning' });
        }

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

        const turnComponent = Math.min(this.state.turnCount / GameConfig.INTENSITY_TURN_CAP, GameConfig.INTENSITY_TURN_MAX);

        let totalUnits = 0;
        this.state.grid.forEach(row => {
            row.forEach(cell => {
                if (cell.unit) totalUnits++;
            });
        });

        const unitComponent = Math.min(totalUnits / GameConfig.INTENSITY_UNIT_CAP, GameConfig.INTENSITY_UNIT_MAX);

        return turnComponent + unitComponent;
    }
}
