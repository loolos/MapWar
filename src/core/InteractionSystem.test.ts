import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';

describe('Interaction System', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();
        // Setup P1 with lots of gold
        engine.state.players['P1'].gold = 1000;

        // P1 Owns (0,0) - Plain
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'none');
        engine.state.getCell(0, 0)!.type = 'plain';

        // P2 Owns (0,1)
        engine.state.setOwner(0, 1, 'P2');
    });

    afterEach(() => {
        GameConfig.ENABLE_EXPERIMENTAL = false;
    });

    it('returns BUILD_OUTPOST for owned plain tile', () => {
        GameConfig.ENABLE_EXPERIMENTAL = true;

        const spy = vi.fn();
        engine.on('tileSelected', spy);

        engine.selectTile(0, 0);

        expect(spy).toHaveBeenCalled();
        const eventData = spy.mock.calls[0][0];
        expect(eventData.r).toBe(0);
        expect(eventData.c).toBe(0);

        const options = eventData.options;
        expect(options.some((o: any) => o.id === 'BUILD_OUTPOST')).toBe(true);
        expect(options.some((o: any) => o.id === 'REMOTE_STRIKE')).toBe(false);

    });

    it('returns REMOTE_STRIKE for enemy tile only if experimental enabled', () => {
        // Setup Enemy Tile
        engine.state.setOwner(0, 1, 'P2');
        engine.state.currentPlayerId = 'P1';

        // 1. Default: Should NOT be available
        let actions = engine.interactionRegistry.getAvailableActions(engine, 0, 1);
        const hasStrikeDefault = actions.some(a => a.id === 'REMOTE_STRIKE');
        expect(hasStrikeDefault).toBe(false);

        // 2. Enable Experimental
        GameConfig.ENABLE_EXPERIMENTAL = true;
        actions = engine.interactionRegistry.getAvailableActions(engine, 0, 1);
        const hasStrike = actions.some(a => a.id === 'REMOTE_STRIKE');
        expect(hasStrike).toBe(true);

    });

    it('plans and executes interaction', () => {
        // Plan BUILD_OUTPOST at (0,0)
        engine.planInteraction(0, 0, 'BUILD_OUTPOST');

        // Verify Pending
        expect(engine.pendingInteractions).toHaveLength(1);
        expect(engine.pendingInteractions[0].actionId).toBe('BUILD_OUTPOST');

        // Commit
        const logSpy = vi.fn();
        engine.on('logMessage', logSpy);

        const initialGold = engine.state.players['P1'].gold;
        // Cost of Outpost is 50

        engine.commitMoves();

        // Verify Execution (Log)
        expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
            text: expect.stringContaining('Outpost construction')
        }));

        // Verify Cost Deduction
        expect(engine.state.players['P1'].gold).toBe(initialGold - 50);

        // Verify Pending Cleared
        expect(engine.pendingInteractions).toHaveLength(0);
    });

    it('prevents interaction if not enough gold', () => {
        engine.state.players['P1'].gold = 0;

        engine.planInteraction(0, 0, 'BUILD_OUTPOST');

        expect(engine.pendingInteractions).toHaveLength(0);
        expect(engine.lastError).toContain('Not enough gold');
    });

    it('cancels interaction on toggle', () => {
        engine.planInteraction(0, 0, 'BUILD_OUTPOST');
        expect(engine.pendingInteractions).toHaveLength(1);

        // Toggle off
        engine.planInteraction(0, 0, 'BUILD_OUTPOST');
        expect(engine.pendingInteractions).toHaveLength(0);
    });

    it('cancels interaction even if funds are exactly enough for one (prevent double cost check)', () => {
        // Setup: 50 Gold. Cost: 50.
        const p1 = engine.state.players['P1'];
        p1.gold = 50;

        // 1. Plan (Cost 50). OK.
        engine.planInteraction(0, 0, 'BUILD_OUTPOST'); // Cost 50
        expect(engine.pendingInteractions).toHaveLength(1);
        expect(engine.calculatePlannedCost()).toBe(50); // Engine sees 50 committed.

        // 2. Cancel.
        // If logic is flawed, it checks cost: current(50) + new(50) = 100.
        // Player has 50. 50 < 100 -> Fail.
        engine.planInteraction(0, 0, 'BUILD_OUTPOST');

        // Expect: Toggled Off (Length 0)
        expect(engine.pendingInteractions).toHaveLength(0);
        expect(engine.lastError).toBeNull();
    });

    it.skip('Cascade Cancellation: Cancelling A cancels dependent B', () => {
        // Setup:
        // [Base/Owned] [A] [B]
        // Player at (0,0). A at (0,1). B at (0,2).

        // Ensure Grid is valid for this
        // (0,0) is Owned P1 (from beforeEach)
        // (0,1) is Owned P2 (from beforeEach) -> Let's reset it to Neutral for this test to be a simple Move/Capture
        engine.state.setOwner(0, 1, null);
        engine.state.setOwner(0, 2, null);

        // Ensure these are plain tiles to avoid terrain-specific rules (like bridge adjacency) failing the test
        engine.state.grid[0][1].type = 'plain';
        engine.state.grid[0][2].type = 'plain';

        // CRITICAL FOR REVALIDATION: Start node must be connected!
        engine.state.getCell(0, 0)!.isConnected = true;

        // 1. Plan A (Valid, adjacent to Base)
        engine.togglePlan(0, 1);
        expect(engine.pendingMoves).toHaveLength(1);

        // 2. Plan B (Valid, adjacent to Pending A)
        engine.togglePlan(0, 2);
        expect(engine.pendingMoves).toHaveLength(2);

        // 3. Cancel A
        // B relies on A to be connected to Base.
        // Without A, B is not adjacent to owned, nor adjacent to a VALID pending chain connected to owned.
        engine.togglePlan(0, 1);

        // Expectation: Both A (explicit) and B (implicit cascade) are removed.
        expect(engine.pendingMoves).toHaveLength(0);
    });
});
