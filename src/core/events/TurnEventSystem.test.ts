import { describe, it, expect, vi } from 'vitest';
import { GameConfig } from '../GameConfig';
import { TurnEventSystem, type TurnEventDefinition } from './TurnEventSystem';

describe('TurnEventSystem', () => {
    it('does not force events by default', () => {
        const originalChance = GameConfig.TURN_EVENT_TRIGGER_CHANCE;
        const originalPlaceholder = GameConfig.TURN_EVENT_ENABLE_TEST_PLACEHOLDER;
        const originalFloodChance = GameConfig.TURN_EVENT_FLOOD_RANDOM_CHANCE;
        const originalPeaceChance = GameConfig.TURN_EVENT_PEACE_DAY_RANDOM_CHANCE;
        const originalBloodChance = GameConfig.TURN_EVENT_BLOOD_MOON_RANDOM_CHANCE;
        GameConfig.TURN_EVENT_TRIGGER_CHANCE = 0;
        GameConfig.TURN_EVENT_FLOOD_RANDOM_CHANCE = 0;
        GameConfig.TURN_EVENT_PEACE_DAY_RANDOM_CHANCE = 0;
        GameConfig.TURN_EVENT_BLOOD_MOON_RANDOM_CHANCE = 0;
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
        GameConfig.TURN_EVENT_FLOOD_RANDOM_CHANCE = originalFloodChance;
        GameConfig.TURN_EVENT_PEACE_DAY_RANDOM_CHANCE = originalPeaceChance;
        GameConfig.TURN_EVENT_BLOOD_MOON_RANDOM_CHANCE = originalBloodChance;
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
    it('can pick blood_moon when random chance triggers', () => {
        const originalFlood = GameConfig.TURN_EVENT_FLOOD_RANDOM_CHANCE;
        const originalPeace = GameConfig.TURN_EVENT_PEACE_DAY_RANDOM_CHANCE;
        const originalBlood = GameConfig.TURN_EVENT_BLOOD_MOON_RANDOM_CHANCE;
        const originalEnable = GameConfig.TURN_EVENT_ENABLE_TEST_PLACEHOLDER;

        // Disable others
        GameConfig.TURN_EVENT_FLOOD_RANDOM_CHANCE = 0;
        GameConfig.TURN_EVENT_PEACE_DAY_RANDOM_CHANCE = 0;
        GameConfig.TURN_EVENT_ENABLE_TEST_PLACEHOLDER = false;

        // Enable Blood Moon
        GameConfig.TURN_EVENT_BLOOD_MOON_RANDOM_CHANCE = 1.0;

        // Mock RNG: 0.5 < 1.0
        const rng = vi.fn().mockReturnValue(0.5);
        const system = new TurnEventSystem(rng);
        const event = system.onTurnStart({
            round: 15, // > MIN_ROUND (11)
            turnsTakenInRound: 0,
            playerOrder: ['P1'],
            currentPlayerId: 'P1'
        });

        expect(event?.eventId).toBe('blood_moon');

        // Cleanup
        GameConfig.TURN_EVENT_FLOOD_RANDOM_CHANCE = originalFlood;
        GameConfig.TURN_EVENT_PEACE_DAY_RANDOM_CHANCE = originalPeace;
        GameConfig.TURN_EVENT_BLOOD_MOON_RANDOM_CHANCE = originalBlood;
        GameConfig.TURN_EVENT_ENABLE_TEST_PLACEHOLDER = originalEnable;
    });
    it('defers an event if the precheck fails', () => {
        const rng = vi.fn().mockReturnValue(0);
        const system = new TurnEventSystem(rng);

        // Setup a forced event (simulating 'peace_day')
        const peaceEvent: TurnEventDefinition = {
            id: 'peace_day',
            name: 'Peace Day',
            message: 'Peace prevails.'
        };
        system.forceEventAtRound(10, peaceEvent);

        // Precheck fails (e.g. Blood Moon is simulated as active)
        system.setEventPrecheck('peace_day', () => ({ ok: false, onFail: 'defer' }));

        // Attempt trigger
        const event = system.onTurnStart({
            round: 10,
            turnsTakenInRound: 0,
            playerOrder: ['P1'],
            currentPlayerId: 'P1'
        });

        // Should return null (deferred)
        expect(event).toBeNull();

        // Clear precheck (simulation: Blood Moon ends)
        system.setEventPrecheck('peace_day', () => ({ ok: true }));

        // Next round, it should fire (deferred event triggers)
        const nextEvent = system.onTurnStart({
            round: 11,
            turnsTakenInRound: 0,
            playerOrder: ['P1'],
            currentPlayerId: 'P1'
        });

        expect(nextEvent?.eventId).toBe('peace_day');
    });

    it('passes params through to the event payload', () => {
        const rng = vi.fn().mockReturnValue(0);
        const system = new TurnEventSystem(rng);
        const custom: TurnEventDefinition = {
            id: 'param_event',
            name: 'Param Event',
            message: 'Has params',
            params: { foo: 'bar', baz: 123 }
        };

        system.forceEventAtRound(5, custom);
        const event = system.onTurnStart({
            round: 5,
            turnsTakenInRound: 0,
            playerOrder: ['P1'],
            currentPlayerId: 'P1'
        });

        expect(event?.params).toEqual({ foo: 'bar', baz: 123 });
    });
});
