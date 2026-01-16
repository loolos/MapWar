
export interface GameEventMap {
    'stateChanged': void;
    'musicState': 'PEACE' | 'TENSION' | 'CONFLICT' | 'DOOM' | 'PEACE_DAY';
    'peaceDayState': { active: boolean };

    'turnChange': void; // Legacy?
    'gameStart': void;
    'mapUpdate': void;
    'gameRestart': void;
    'planUpdate': void;
    'tileSelected': { r: number, c: number, options: any[] };
    'tileDeselected': void;
    'logMessage': { text: string, type?: LogType };
    'incomeReport': { total: number, base: number, land: number, landCount: number, depletedMines: { r: number, c: number }[] };
    'gameOver': string; // winnerId
    'turnEvent': { eventId: string, playerId: string, round: number, name: string, message: string, sfxKey?: string };

    // SFX
    'sfx:select': void;
    'sfx:select_tile': void;
    'sfx:move': void;
    'sfx:attack': void;
    'sfx:capture': void;
    'sfx:capture_small': void;
    'sfx:capture_medium': void;
    'sfx:capture_large': void;
    'sfx:capture_town': void;
    'sfx:conquer': void;
    'sfx:conquer_large': void;
    'sfx:eliminate': void;
    'sfx:base_capture': void;
    'sfx:bridge_build': void;
    'sfx:wall_build': void;
    'sfx:wall_upgrade': void;
    'sfx:watchtower_build': void;
    'sfx:watchtower_upgrade': void;
    'sfx:farm_build': void;
    'sfx:farm_upgrade': void;
    'sfx:base_upgrade_income': void;
    'sfx:base_upgrade_defense': void;
    'sfx:turn_event_default': void;
    'sfx:gold_found': void;
    'sfx:gold_depleted': void;
    'sfx:cancel': void;
    'sfx:victory': void;
}

type ListenerEntry<K extends keyof GameEventMap> = {
    original: (data: GameEventMap[K]) => void;
    wrapped: (data: GameEventMap[K]) => void;
    context?: any;
};

export class TypedEventEmitter {
    private listeners: { [K in keyof GameEventMap]?: Array<ListenerEntry<K>> } = {};

    constructor() {
        this.listeners = {};
    }

    on<K extends keyof GameEventMap>(event: K, fn: (data: GameEventMap[K]) => void, context?: any): this {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        const wrapped = context ? fn.bind(context) : fn;
        // Cast to any to avoid TS generic indexing issues with mapped types
        (this.listeners[event] as any).push({ original: fn, wrapped, context });
        return this;
    }

    once<K extends keyof GameEventMap>(event: K, fn: (data: GameEventMap[K]) => void, context?: any): this {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        const wrapped = (data: GameEventMap[K]) => {
            this.off(event, fn, context);
            if (context) fn.call(context, data);
            else fn(data);
        };
        (this.listeners[event] as any).push({ original: fn, wrapped, context });
        return this;
    }

    off<K extends keyof GameEventMap>(event: K, fn: (data: GameEventMap[K]) => void, context?: any): this {
        if (!this.listeners[event]) return this;
        this.listeners[event] = (this.listeners[event] as any).filter((l: ListenerEntry<K>) => {
            const matchesFn = l.original === fn || l.wrapped === fn;
            if (!matchesFn) return true;
            if (context !== undefined && l.context !== context) return true;
            return false;
        });
        return this;
    }

    emit<K extends keyof GameEventMap>(event: K, data?: GameEventMap[K]): boolean {
        if (!this.listeners[event]) return false;
        this.listeners[event]!.forEach((entry) => {
            try {
                entry.wrapped(data!);
            } catch (err) {
                console.error(`Error in listener for event '${event}':`, err);
            }
        });
        return true;
    }

    removeAllListeners() {
        this.listeners = {};
    }
}

export type LogType = 'info' | 'combat' | 'warning' | 'error';
