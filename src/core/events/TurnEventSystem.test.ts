import { describe, it, expect, vi } from 'vitest';
import { GameConfig } from '../GameConfig';
import { TurnEventSystem, type TurnEventDefinition } from './TurnEventSystem';

describe('TurnEventSystem', () => {
    it('does not force events by default', () => {
        const originalChance = GameConfig.TURN_EVENT_TRIGGER_CHANCE;
        const originalPlaceholder = GameConfig.TURN_EVENT_ENABLE_TEST_PLACEHOLDER;
        GameConfig.TURN_EVENT_TRIGGER_CHANCE = 0;
        GameConfig.TURN_EVENT_ENABLE_TEST_PLACEHOLDER = true;
        const rng = vi.fn().mockReturnValue(0);
        const system = new TurnEventSystem(rng);
        const event = system.onTurnStart({
            round: 13,
            turnsTakenInRound: 0,
            playerOrder: ['P1', 'P2'],
            currentPlayerId: 'P1'
        });

        expect(event).toBeNull();
        GameConfig.TURN_EVENT_TRIGGER_CHANCE = originalChance;
        GameConfig.TURN_EVENT_ENABLE_TEST_PLACEHOLDER = originalPlaceholder;
    });

    it('does not trigger when no event is scheduled', () => {
        const originalPlaceholder = GameConfig.TURN_EVENT_ENABLE_TEST_PLACEHOLDER;
        GameConfig.TURN_EVENT_ENABLE_TEST_PLACEHOLDER = true;
        const rng = vi.fn().mockReturnValue(1);
        const system = new TurnEventSystem(rng);
        const event = system.onTurnStart({
            round: 2,
            turnsTakenInRound: 0,
            playerOrder: ['P1', 'P2'],
            currentPlayerId: 'P1'
        });

        expect(event).toBeNull();
        GameConfig.TURN_EVENT_ENABLE_TEST_PLACEHOLDER = originalPlaceholder;
    });

    it('can force a custom event at a specific round', () => {
        const rng = vi.fn().mockReturnValue(0);
        const system = new TurnEventSystem(rng);
        const custom: TurnEventDefinition = {
            id: 'test_event',
            name: 'Test Event',
            message: 'Forced event fired.'
        };

        system.forceEventAtRound(5, custom);
        const event = system.onTurnStart({
            round: 5,
            turnsTakenInRound: 0,
            playerOrder: ['P1', 'P2'],
            currentPlayerId: 'P1'
        });

        expect(event?.eventId).toBe('test_event');
    });

    it('defers forced event when precheck fails with defer', () => {
        const rng = vi.fn().mockReturnValue(0);
        const system = new TurnEventSystem(rng);
        const custom: TurnEventDefinition = {
            id: 'defer_event',
            name: 'Deferred',
            message: 'Should trigger later.'
        };

        system.forceEventAtRound(4, custom);
        system.setEventPrecheck('defer_event', () => ({ ok: false, onFail: 'defer' }));
        const first = system.onTurnStart({
            round: 4,
            turnsTakenInRound: 0,
            playerOrder: ['P1', 'P2'],
            currentPlayerId: 'P1'
        });
        expect(first).toBeNull();

        system.setEventPrecheck('defer_event', () => true);
        const second = system.onTurnStart({
            round: 5,
            turnsTakenInRound: 0,
            playerOrder: ['P1', 'P2'],
            currentPlayerId: 'P1'
        });
        expect(second?.eventId).toBe('defer_event');
    });

    it('retries persistent event until it triggers', () => {
        const rng = vi.fn()
            .mockReturnValueOnce(0.9)
            .mockReturnValueOnce(0.0)
            .mockReturnValueOnce(0.0);
        const system = new TurnEventSystem(rng);
        const persistent: TurnEventDefinition = {
            id: 'persistent_event',
            name: 'Persistent',
            message: 'Keeps trying.'
        };

        system.setPersistentEvent(persistent, 0.5);
        const first = system.onTurnStart({
            round: 2,
            turnsTakenInRound: 0,
            playerOrder: ['P1', 'P2'],
            currentPlayerId: 'P1'
        });
        expect(first).toBeNull();

        const second = system.onTurnStart({
            round: 3,
            turnsTakenInRound: 0,
            playerOrder: ['P1', 'P2'],
            currentPlayerId: 'P1'
        });
        expect(second?.eventId).toBe('persistent_event');
    });
});
