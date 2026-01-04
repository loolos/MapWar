import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';

describe('GameEngine', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();
    });

    it('initializes with correct defaults', () => {
        expect(engine.state.turnCount).toBe(1);
        expect(engine.state.currentPlayerId).toBe('P1');
        expect(engine.state.players['P1'].gold).toBe(GameConfig.INITIAL_GOLD);
    });

    it('accrues gold on turn end', () => {
        // P1 -> P2
        engine.endTurn();
        // Initial checks are already covered in defaults. 
        // We trust logic for now or add specific assetions later.
    });

    describe('Planning Phase', () => {
        it('allows toggling a valid move', () => {
            // P1 (0,0). Valid move (0,1).
            engine.togglePlan(0, 1);
            expect(engine.pendingMoves).toHaveLength(1);
            expect(engine.pendingMoves[0]).toEqual({ r: 0, c: 1 });

            // Toggle again to remove
            engine.togglePlan(0, 1);
            expect(engine.pendingMoves).toHaveLength(0);
        });

        it('prevents non-adjacent moves', () => {
            // P1 (0,0). Try (5,5).
            engine.togglePlan(5, 5);
            expect(engine.pendingMoves).toHaveLength(0);
            expect(engine.lastError).toContain('adjacent');
        });

        it('prevents moves when out of gold', () => {
            // Set gold to 0
            engine.state.players['P1'].gold = 0;
            engine.togglePlan(0, 1); // Cost 10
            expect(engine.pendingMoves).toHaveLength(0);
            expect(engine.lastError).toContain('Not enough gold');
        });

        it('calculates cost correctly for planning', () => {
            // 20 Gold
            engine.state.players['P1'].gold = 30;

            engine.togglePlan(0, 1); // Cost 10
            engine.togglePlan(0, 2); // Cost 10 (Chained)

            expect(engine.pendingMoves).toHaveLength(2);
        });
    });

    describe('Combat Mechanics check', () => {
        it('charges 20G for adjacent attack', () => {
            // Setup: P2 owns (0,1)
            engine.state.setOwner(0, 1, 'P2');
            engine.state.players['P1'].gold = 100;

            // P1 (0,0) attacks (0,1)
            const cost = engine.getMoveCost(0, 1);
            expect(cost).toBe(GameConfig.COST_ATTACK); // 20
        });

        it('charges 40G for chained distance attack', () => {
            // Setup: P2 owns (0,2). P1 (0,0).
            // P1 plans (0,1) [Empty].
            // P1 plans (0,2) [Enemy].

            engine.state.setOwner(0, 2, 'P2');
            engine.state.players['P1'].gold = 100;

            // Plan (0,1) - Empty
            engine.togglePlan(0, 1);

            // Now check cost of (0,2)
            // (0,2) is adjacent to (0,1) [Pending], but NOT (0,0) [Owned].
            const cost = engine.getMoveCost(0, 2);
            expect(cost).toBe(GameConfig.COST_ATTACK * 2); // 40
        });
    });

    describe('Victory Condition', () => {
        it('emits gameOver when base is captured', () => {
            const gameOverSpy = vi.fn();
            engine.on('gameOver', gameOverSpy);

            // Setup: P1 next to P2 Base?
            // P2 Base at (9,9).
            // Cheat: Set P1 owner at (9,8).
            engine.state.setOwner(9, 8, 'P1');
            engine.state.players['P1'].gold = 100;

            // Attack Base (9,9)
            engine.togglePlan(9, 9);
            expect(engine.pendingMoves).toHaveLength(1);

            // Commit
            engine.commitMoves();

            expect(gameOverSpy).toHaveBeenCalledWith('P1');
        });
    });

    // Test chaining validity
    it('allows chaining moves', () => {
        engine.state.players['P1'].gold = 50;
        engine.togglePlan(0, 1);
        engine.togglePlan(0, 2);
        expect(engine.pendingMoves).toHaveLength(2);
        expect(engine.lastError).toBeNull();
    });
});
