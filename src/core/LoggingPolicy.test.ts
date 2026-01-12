import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameEngine } from './GameEngine';

describe('Logging Policy Verification', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();
        engine.startGame();

        // Setup P1 with plenty of gold and HUMAN status
        engine.state.players['P1'].gold = 1000;
        engine.state.players['P1'].isAI = false;

        // Force Map State: Base at (0,0) connected
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');
        engine.state.updateConnectivity('P1');

        // Mock Emit
        engine.emit = vi.fn();
    });

    it('Error Log: Disconnected Move', () => {
        // Try to toggle relevantly far tile (5, 5) which is definitely disconnected
        // This fails validateMove -> checks adjacency -> fails -> logs error
        engine.togglePlan(5, 5);

        const errorLogs = (engine.emit as any).mock.calls.filter((c: any[]) =>
            c[0] === 'logMessage' && c[1].type === 'error'
        );
        expect(errorLogs).toHaveLength(1);
        expect(errorLogs[0][1].text).toContain('Must connect to Main Base supply line');
    });

    it('Warning Log: Cascade Cancellation (State Change)', () => {
        // 1. Plan (0, 1) - Connected to Base at (0,0)
        engine.togglePlan(0, 1);
        expect(engine.pendingMoves).toHaveLength(1);

        // 2. Simulate losing the Base (0,0)
        // This makes (0,1) disconnected
        engine.state.setOwner(0, 0, null);
        engine.state.updateConnectivity('P1');

        // 3. Trigger Revalidation
        engine.revalidatePendingPlan();

        expect(engine.pendingMoves).toHaveLength(0); // Should be removed

        // Verify Warning Log
        const warningLogs = (engine.emit as any).mock.calls.filter((c: any[]) =>
            c[0] === 'logMessage' && c[1].type === 'warning'
        );

        const cascadeLog = warningLogs.find((l: any) => l[1].text.includes('Dependent moves cancelled'));
        expect(cascadeLog).toBeDefined();
    });

    it('Info Log: Turn Start Income', () => {
        // Trigger end turn for P1 -> P2 -> (loop) -> P1 (Turn 2)
        // With 2 players, P1 ends turn -> P2 starts. P2 ends turn -> P1 starts (Turn 2).

        // Fake P2 End Turn action to switch back to P1
        // But first we need P1 to end turn?

        // Let's manually call handleEndTurn with a mocked action if possible, 
        // OR just rely on state.endTurn behaving correctly if we manipulate currentPlayerId.

        // Simpler: Just force call the logic that emits the log?
        // No, integration test is better.

        // 1. P1 Ends Turn
        engine.executeAction({ type: 'END_TURN', playerId: 'P1', payload: { moves: [] } });

        // Now P2's turn. P2 is AI? Default is false in test?
        // Let's force P2 to be Human for silence check or consistency.
        engine.state.players['P2'].isAI = false;

        // 2. P2 Ends Turn
        engine.executeAction({ type: 'END_TURN', playerId: 'P2', payload: { moves: [] } });

        // Now P1's turn again. Turn count should be 2.
        // engine.handleEndTurn (called by executeAction) should have emitted the log for P1.

        const infoLogs = (engine.emit as any).mock.calls.filter((c: any[]) =>
            c[0] === 'logMessage' && c[1].type === 'info'
        );

        const turnStartLog = infoLogs.find((l: any) => l[1].text.includes('Turn 2 Start'));
        expect(turnStartLog).toBeDefined();
        expect(turnStartLog[1].text).toContain('Income:');
    });
});
