import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';
import { InteractionRegistry } from './interaction/InteractionRegistry';

describe('Unified Move Interaction', () => {
    let engine: GameEngine;
    let registry: InteractionRegistry;

    beforeEach(() => {
        engine = new GameEngine([{ id: 'p1', isAI: false, color: 0x00ff00 }, { id: 'p2', isAI: false, color: 0xff0000 }]);
        engine.startGame();
        registry = engine.interactionRegistry;
    });

    it('has MOVE interaction registered', () => {
        const move = registry.get('MOVE');
        expect(move).toBeDefined();
    });

    it('MOVE label returns correct context', () => {
        const moveAction = registry.get('MOVE')!;
        const labelFn = moveAction.label as (e: GameEngine, r: number, c: number) => string;

        // Ensure state
        engine.state.setOwner(0, 0, 'p1'); // Own
        engine.state.setOwner(0, 1, null); // Neutral

        // Context: p1 turn
        engine.state.currentPlayerId = 'p1';

        // 1. Capture (Neutral)
        engine.state.grid[0][1].type = 'plain';
        engine.state.grid[0][1].building = 'none';
        expect(labelFn(engine, 0, 1)).toBe('Capture');

        // 2. Attack (Enemy)
        engine.state.setOwner(0, 1, 'p2');
        expect(labelFn(engine, 0, 1)).toBe('Attack');

        // 3. Move (Own?? Or invalid?)
        // Actually move to own tile invalid usually, but "Move" is default fallback
        engine.state.setOwner(0, 1, 'p1');
        // Note: engine.validateMove might return false, but label function operates on state
        expect(labelFn(engine, 0, 1)).toBe('Move');
    });

    it('MOVE cost returns engine move cost', () => {
        const moveAction = registry.get('MOVE')!;
        const costFn = moveAction.cost as (e: GameEngine, r: number, c: number) => number;

        // Mock getMoveCost
        engine.getMoveCost = () => 999;
        expect(costFn(engine, 0, 0)).toBe(999);
    });

    it('planInteraction triggers MOVE logic via togglePlan', () => {
        // Mock validateMove to ensure we test the wiring, not the validation logic itself
        engine.validateMove = () => ({ valid: true });
        engine.checkMoveCost = () => ({ valid: true });

        // Setup valid move
        engine.state.setOwner(0, 0, 'p1');
        engine.state.grid[0][0].isConnected = true; // Force connected
        // Neighbor
        engine.state.setOwner(0, 1, null);
        engine.state.getCell(0, 1)!.type = 'plain';
        engine.state.players['p1'].gold = 1000;

        expect(engine.pendingMoves).toHaveLength(0);

        // Plan "MOVE" interaction
        engine.planInteraction(0, 1, 'MOVE');

        if (engine.pendingMoves.length === 0) {
            console.log("Plan failed. Last Error:", engine.lastError);
        }

        // Should be in pendingMoves now
        expect(engine.pendingMoves).toHaveLength(1);
        expect(engine.pendingMoves[0]).toEqual({ r: 0, c: 1 });
    });
});
