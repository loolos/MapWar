import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';

describe('AIController Logic', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();
        // Setup P1 as AI
        engine.state.players['P1'].isAI = true;
    });

    it('AI continues moving even if expensive move fails', () => {
        // Find a town and place it adjacent to P1 start to simulate expensive move
        const p1Start = engine.state.grid.flat().find(c => c.owner === 'P1');
        if (!p1Start) throw new Error("No P1 start found");

        const neighbors = [
            { r: p1Start.row + 1, c: p1Start.col },
            { r: p1Start.row - 1, c: p1Start.col },
            { r: p1Start.row, c: p1Start.col + 1 },
            { r: p1Start.row, c: p1Start.col - 1 }
        ].filter(n => engine.isValidCell(n.r, n.c));

        // Set one neighbor as a Neutral Town (Cost 30)
        // Set another neighbor as Plain (Cost 10)
        const townLoc = neighbors[0];
        const plainLoc = neighbors[1];

        // Ensure we have at least 2 neighbors for this test
        if (!townLoc || !plainLoc) return; // Skip if corner case prevents 2 neighbors

        engine.state.setBuilding(townLoc.r, townLoc.c, 'town');
        engine.state.grid[townLoc.r][townLoc.c].owner = null; // Neutral

        engine.state.setBuilding(plainLoc.r, plainLoc.c, 'none');
        engine.state.grid[plainLoc.r][plainLoc.c].type = 'plain';
        engine.state.grid[plainLoc.r][plainLoc.c].owner = null;

        // P1 has 10 Gold (Initial).
        // Town cost: 30. Plain cost: 10.
        // AI Logic sorts by score. If Town has high score (which we will add), it tries that first.
        // It fails (10 < 30).
        // OLD BUG: It stops.
        // EXPECTED FIX: It continues and tries the Plain (10 <= 10).

        // Spy on togglePlan
        vi.spyOn(engine, 'togglePlan');

        engine.ai.playTurn();

        // Should have tried multiple moves.
        // If it stopped at first failure, it would only try one unique cell (the town).
        // If fixed, it should try town, fail, then try plain, succeed.

        // Check if plain was captured (or at least attempted)
        // Since we mock togglePlan effectively by spy, we can check calls.
        // But playTurn calls togglePlan which mutates pendingMoves.

        // Check if ANY move was committed.
        // With 10g, it can afford the plain.
        const committed = engine.lastAiMoves.length;
        expect(committed).toBeGreaterThan(0);
    });

    it('AI prioritizes Towns over Plains if affordable', () => {
        // Give P1 enough gold for town
        engine.state.players['P1'].gold = 50;

        const p1Start = engine.state.grid.flat().find(c => c.owner === 'P1');
        if (!p1Start) throw new Error("No P1 start found");

        const neighbors = [
            { r: p1Start.row + 1, c: p1Start.col },
            { r: p1Start.row, c: p1Start.col + 1 }
        ].filter(n => engine.isValidCell(n.r, n.c));

        if (neighbors.length < 2) return;

        const townLoc = neighbors[0];
        const plainLoc = neighbors[1];

        engine.state.setBuilding(townLoc.r, townLoc.c, 'town');
        engine.state.setBuilding(plainLoc.r, plainLoc.c, 'none');

        // Reset moves
        engine.lastAiMoves = [];

        engine.ai.playTurn();

        // Should have captured the town first or at least captured it.
        // Depending on greedy "score", town should be higher.
        const capturedTown = engine.state.grid[townLoc.r][townLoc.c].owner === 'P1';
        expect(capturedTown).toBe(true);
    });
});
