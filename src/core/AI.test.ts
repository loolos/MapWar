import { describe, it, expect, vi, afterEach } from 'vitest';
import { GameEngine } from './GameEngine';

describe('AI Simulation', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('AI vs AI plays valid game', async () => {
        // Mock setTimeout to execute immediately for speed
        vi.useFakeTimers();

        // Setup Engine
        const engine = new GameEngine();

        // Force P1 to also be AI for this simulation
        engine.state.players['P1'].isAI = true;
        engine.startGame();

        let turns = 0;
        const maxTurns = 50;

        // Start Loop
        // We trigger the first turn manually if needed, or just let AI play
        // Engine starts P1. P1 is AI. But `endTurn` triggers AI. 
        // So we need to kickstart it.


        // Kickstart AI 1
        // engine.startGame() handles this now


        // Now run loop
        while (turns < maxTurns) {
            // AI Play Turn calls `endTurn`, which sets timeout for next AI.
            // We advance timers just enough to trigger the NEXT turn, not infinite recursive turns.
            // The delay is 500ms in GameEngine.
            await vi.advanceTimersByTimeAsync(1000);
            turns++;

            // Safety checks
            const p1 = engine.state.players['P1'];
            const p2 = engine.state.players['P2'];

            expect(Number.isFinite(p1.gold)).toBe(true);
            expect(Number.isFinite(p2.gold)).toBe(true);

            // If huge turns, breaks
        }

        // Ensure some expansion happened
        let occupied = 0;
        const grid = engine.state.grid;
        const height = grid.length;
        const width = height > 0 ? grid[0].length : 0;
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) occupied += grid[r][c].owner ? 1 : 0;
        }

        // Should be > 2 (Initial bases)
        expect(occupied).toBeGreaterThan(2);
    });

    it('AI free-for-all (4 players) runs without crashes', async () => {
        vi.useFakeTimers();

        const engine = new GameEngine([
            { id: 'P1', isAI: true, color: 0xff4444 },
            { id: 'P2', isAI: true, color: 0x4444ff },
            { id: 'P3', isAI: true, color: 0x44ff44 },
            { id: 'P4', isAI: true, color: 0xffff44 }
        ]);
        engine.startGame();

        const maxTurns = 40;
        for (let i = 0; i < maxTurns; i++) {
            await vi.advanceTimersByTimeAsync(1000);
            const p1 = engine.state.players['P1'];
            const p2 = engine.state.players['P2'];
            const p3 = engine.state.players['P3'];
            const p4 = engine.state.players['P4'];
            expect(Number.isFinite(p1.gold)).toBe(true);
            expect(Number.isFinite(p2.gold)).toBe(true);
            expect(Number.isFinite(p3.gold)).toBe(true);
            expect(Number.isFinite(p4.gold)).toBe(true);
        }

        let occupied = 0;
        const grid = engine.state.grid;
        const height = grid.length;
        const width = height > 0 ? grid[0].length : 0;
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) occupied += grid[r][c].owner ? 1 : 0;
        }

        expect(occupied).toBeGreaterThan(4);
    });
});
