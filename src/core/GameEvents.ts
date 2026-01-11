
export interface GameEventMap {
    'turnChange': void;
    'gameStart': void;
    'mapUpdate': void;
    'gameRestart': void;
    'planUpdate': void;
    'tileSelected': { r: number, c: number, options: any[] };
    'tileDeselected': void;
    'logMessage': { text: string, type?: LogType };
    'incomeReport': { total: number, base: number, land: number, landCount: number, depletedMines: { r: number, c: number }[] };
    'gameOver': string; // winnerId

    // SFX
    'sfx:select': void;
    'sfx:select_tile': void;
    'sfx:move': void;
    'sfx:attack': void;
    'sfx:capture': void;
    'sfx:capture_town': void;
    'sfx:conquer': void;
    'sfx:eliminate': void;
    'sfx:gold_found': void;
    'sfx:gold_depleted': void;
    'sfx:cancel': void;
    'sfx:victory': void;
}

export class TypedEventEmitter {
    private listeners: { [K in keyof GameEventMap]?: Array<(data: GameEventMap[K]) => void> } = {};

    constructor() {
        this.listeners = {};
    }

    on<K extends keyof GameEventMap>(event: K, fn: (data: GameEventMap[K]) => void, context?: any): this {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        // Basic context binding if needed
        if (context) {
            fn = fn.bind(context);
        }
        // Cast to any to avoid TS generic indexing issues with mapped types
        (this.listeners[event] as any).push(fn);
        return this;
    }

    once<K extends keyof GameEventMap>(event: K, fn: (data: GameEventMap[K]) => void, context?: any): this {
        const onceWrapper = (data: GameEventMap[K]) => {
            this.off(event, onceWrapper);
            if (context) fn.call(context, data);
            else fn(data);
        };
        return this.on(event, onceWrapper);
    }

    off<K extends keyof GameEventMap>(event: K, fn: (data: GameEventMap[K]) => void, _context?: any): this {
        if (!this.listeners[event]) return this;
        // Naive removal (won't work well with bind/context unless strict reference match)
        // For this project, reference match is usually enough.

        this.listeners[event] = (this.listeners[event] as any).filter((l: any) => l !== fn);
        return this;
    }

    emit<K extends keyof GameEventMap>(event: K, data?: GameEventMap[K]): boolean {
        if (!this.listeners[event]) return false;
        this.listeners[event]!.forEach(fn => {
            try {
                fn(data!);
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
