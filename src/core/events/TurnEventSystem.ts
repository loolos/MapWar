import { GameConfig } from '../GameConfig';

export type TurnEventPayload = {
    eventId: string;
    playerId: string;
    round: number;
    name: string;
    message: string;
    sfxKey?: string;
    params?: any;
};

export type TurnEventDefinition = {
    id: string;
    name: string;
    message: string;
    sfxKey?: string;
    params?: any;
};

export type TurnEventPrecheckResult = {
    ok: boolean;
    onFail?: 'cancel' | 'defer';
};

export type TurnEventPrecheck = (data: {
    round: number;
    turnsTakenInRound: number;
    playerOrder: string[];
    currentPlayerId: string | null;
}) => boolean | TurnEventPrecheckResult;

export class TurnEventSystem {
    private rng: () => number;
    private scheduledRound: number | null = null;
    private scheduledPlayerId: string | null = null;
    private scheduledEvent: { event: TurnEventDefinition; source: 'forced' | 'random' | 'persistent' } | null = null;
    private deferredEvent: TurnEventDefinition | null = null;
    private forcedEventsByRound: Map<number, TurnEventDefinition> = new Map();
    private persistentEvent: { event: TurnEventDefinition; chancePerRound: number } | null = null;
    private eventPrechecks: Map<string, TurnEventPrecheck> = new Map();

    constructor(rng: () => number) {
        this.rng = rng;
    }

    public forceEventAtRound(round: number, event: TurnEventDefinition) {
        if (!Number.isFinite(round) || round < 1) return;
        this.forcedEventsByRound.set(Math.floor(round), event);
    }

    public clearForcedEvent(round?: number) {
        if (round === undefined) {
            this.forcedEventsByRound.clear();
            return;
        }
        this.forcedEventsByRound.delete(Math.floor(round));
    }

    public setPersistentEvent(event: TurnEventDefinition, chancePerRound: number = GameConfig.TURN_EVENT_TRIGGER_CHANCE) {
        const clamped = Math.max(0, Math.min(1, chancePerRound));
        this.persistentEvent = { event, chancePerRound: clamped };
    }

    public clearPersistentEvent() {
        this.persistentEvent = null;
    }

    public setEventPrecheck(eventId: string, precheck: TurnEventPrecheck) {
        this.eventPrechecks.set(eventId, precheck);
    }

    public clearEventPrecheck(eventId: string) {
        this.eventPrechecks.delete(eventId);
    }

    public onTurnStart(data: { round: number; turnsTakenInRound: number; playerOrder: string[]; currentPlayerId: string | null }): TurnEventPayload | null {
        if (!data.currentPlayerId || data.playerOrder.length === 0) return null;

        if (data.turnsTakenInRound === 0 && data.round !== this.scheduledRound) {
            this.scheduledRound = data.round;
            this.scheduledPlayerId = null;
            this.scheduledEvent = null;

            const forced = this.forcedEventsByRound.get(data.round);
            if (forced) {
                this.scheduledEvent = { event: forced, source: 'forced' };
                this.forcedEventsByRound.delete(data.round);
            } else if (this.deferredEvent) {
                this.scheduledEvent = { event: this.deferredEvent, source: 'random' };
                this.deferredEvent = null;
            } else if (this.persistentEvent) {
                if (this.rng() < this.persistentEvent.chancePerRound) {
                    this.scheduledEvent = { event: this.persistentEvent.event, source: 'persistent' };
                }
            } else {
                if (data.round < GameConfig.TURN_EVENT_RANDOM_MIN_ROUND) {
                    this.scheduledEvent = null;
                } else {
                    if (GameConfig.TURN_EVENT_ENABLE_TEST_PLACEHOLDER && this.rng() < GameConfig.TURN_EVENT_TRIGGER_CHANCE) {
                        const message = GameConfig.TURN_EVENT_PLACEHOLDER_MESSAGE_TEMPLATE.replace(
                            '{player}',
                            data.currentPlayerId
                        );
                        this.scheduledEvent = {
                            event: {
                                id: 'placeholder',
                                name: GameConfig.TURN_EVENT_PLACEHOLDER_NAME,
                                message,
                                sfxKey: GameConfig.TURN_EVENT_PLACEHOLDER_SFX
                            },
                            source: 'random'
                        };
                    } else {
                        const candidates: string[] = [];
                        if (this.rng() < GameConfig.TURN_EVENT_FLOOD_RANDOM_CHANCE) candidates.push('flood');
                        if (this.rng() < GameConfig.TURN_EVENT_PEACE_DAY_RANDOM_CHANCE) candidates.push('peace_day');
                        if (this.rng() < GameConfig.TURN_EVENT_BLOOD_MOON_RANDOM_CHANCE) candidates.push('blood_moon');

                        if (candidates.length > 0) {
                            const chosenId = candidates[Math.floor(this.rng() * candidates.length)];
                            let event: TurnEventDefinition;

                            switch (chosenId) {
                                case 'peace_day':
                                    event = {
                                        id: 'peace_day',
                                        name: GameConfig.TURN_EVENT_PEACE_DAY_NAME,
                                        message: GameConfig.TURN_EVENT_PEACE_DAY_MESSAGE,
                                        sfxKey: GameConfig.TURN_EVENT_PEACE_DAY_SFX
                                    };
                                    break;
                                case 'blood_moon':
                                    event = {
                                        id: 'blood_moon',
                                        name: GameConfig.TURN_EVENT_BLOOD_MOON_NAME,
                                        message: GameConfig.TURN_EVENT_BLOOD_MOON_MESSAGE,
                                        sfxKey: GameConfig.TURN_EVENT_BLOOD_MOON_SFX
                                    };
                                    break;
                                case 'flood':
                                default:
                                    event = {
                                        id: 'flood',
                                        name: GameConfig.TURN_EVENT_FLOOD_NAME,
                                        message: GameConfig.TURN_EVENT_FLOOD_MESSAGE,
                                        sfxKey: GameConfig.TURN_EVENT_FLOOD_SFX
                                    };
                                    break;
                            }

                            this.scheduledEvent = {
                                event,
                                source: 'random'
                            };
                        }
                    }
                }
            }

            if (this.scheduledEvent) {
                const precheck = this.eventPrechecks.get(this.scheduledEvent.event.id);
                if (precheck) {
                    const result = precheck(data);
                    const ok = typeof result === 'boolean' ? result : result.ok;
                    const onFail = typeof result === 'boolean' ? 'cancel' : (result.onFail ?? 'cancel');
                    if (!ok) {
                        if (this.scheduledEvent.source === 'persistent') {
                            if (onFail === 'cancel') {
                                this.persistentEvent = null;
                            }
                        } else if (onFail === 'defer') {
                            this.deferredEvent = this.scheduledEvent.event;
                        }
                        this.scheduledEvent = null;
                    }
                }
            }

            if (this.scheduledEvent) {
                const idx = Math.floor(this.rng() * data.playerOrder.length);
                this.scheduledPlayerId = data.playerOrder[Math.max(0, Math.min(idx, data.playerOrder.length - 1))];
            }
        }

        if (this.scheduledPlayerId && this.scheduledEvent && this.scheduledPlayerId === data.currentPlayerId) {
            this.scheduledPlayerId = null;
            if (this.scheduledEvent.source === 'persistent') {
                this.persistentEvent = null;
            }
            return {
                eventId: this.scheduledEvent.event.id,
                playerId: data.currentPlayerId,
                round: data.round,
                name: this.scheduledEvent.event.name,
                message: this.scheduledEvent.event.message,
                sfxKey: this.scheduledEvent.event.sfxKey,
                params: this.scheduledEvent.event.params
            };
        }

        return null;
    }
}
