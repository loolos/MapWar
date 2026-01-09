import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';


describe('AI Strategy', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();
        // Setup a small grid for easier testing
        // The grid is already initialized by constructor (10x10 default)

        // Force Player 2 to be AI
        const p2 = engine.state.players['P2'];
        if (p2) p2.isAI = true;

        // Give AI lots of gold to ensure it can move
        if (p2) p2.gold = 1000;
    });

    it('Prioritizes attacking Enemy Base when adjacent', () => {
        // Setup: AI (P2) unit next to P1 Base

        // Clear board for clarity
        // P1 Base is usually at 1,1
        // Let's place P1 Base at 2,2 manually for control
        engine.state.grid[2][2].building = 'base';
        engine.state.grid[2][2].owner = 'P1';

        // Place AI Unit at 2,3 (Adjacent)
        engine.state.grid[2][3].owner = 'P2';
        // Make sure it's P2's turn
        engine.state.currentPlayerId = 'P2';

        // Run AI
        engine.ai.playTurn();

        // Expect P2 to have captured the base at 2,2
        expect(engine.state.grid[2][2].owner).toBe('P2');
    });

    it('Prioritizes defending Own Base when Enemy is near', () => {
        // Setup: P2 Base at 8,8
        engine.state.grid[8][8].building = 'base';
        engine.state.grid[8][8].owner = 'P2';

        // Enemy (P1) at 8,7 (Adjacent to base)
        engine.state.grid[8][7].owner = 'P1';
        engine.state.grid[8][7].building = 'none'; // Just a unit/land

        // DISTRACTION: Neutral Town at 8,9 (Adjacent to Base)
        // Existing logic rates Town capture (500) > Attack Enemy (100)
        // New logic should rate Defense (Threat Removal) > Town
        engine.state.grid[8][9].building = 'town';
        engine.state.grid[8][9].owner = null;

        // AI needs to act. 
        // Best defense is usually attacking the invader to remove them
        // Or blocking. attacking captures the tile, effectively removing the threat.

        // Make sure it's P2's turn
        engine.state.currentPlayerId = 'P2';

        // Run AI
        engine.ai.playTurn();

        // AI should NOT take the town (8,9), it should attack the enemy (8,7)
        // Check 8,7 is owned by P2 (Attacked)
        expect(engine.state.grid[8][7].owner).toBe('P2');

        // Check that the FIRST move was the defensive one (8,7)
        // AI takes multiple turns if it has gold. It likely took the town afterwards.
        // We want to ensure Priority was correct.
        expect(engine.lastAiMoves.length).toBeGreaterThan(0);
        expect(engine.lastAiMoves[0]).toEqual({ r: 8, c: 7 });
    });
});
