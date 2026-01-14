
import { describe, it, expect } from 'vitest';
import { GameEngine } from './GameEngine';


describe('Wall Defense Aura', () => {
    it('Increases attack cost when adjacent to friendly wall', () => {
        const engine = new GameEngine();
        const p1 = { id: 'P1', isAI: false, color: 0x000000 };
        const p2 = { id: 'P2', isAI: false, color: 0xffffff };
        engine.state.reset([p1, p2], false, 'default');

        // Setup:
        // P1 owns (5,5) [Target]
        // P1 owns (5,6) [Wall Source]
        // P2 attacks (5,5)

        const r = 5, c = 5;
        const wallR = 5, wallC = 6;

        // P1 owns target
        engine.state.grid[r][c].owner = 'P1';
        engine.state.grid[r][c].type = 'plain';

        // P1 owns wall
        engine.state.grid[wallR][wallC].owner = 'P1';
        engine.state.grid[wallR][wallC].building = 'wall';
        engine.state.grid[wallR][wallC].defenseLevel = 0; // Level 0 Wall
        engine.state.grid[wallR][wallC].isConnected = true; // Must be connected for aura

        // P2 is current player
        engine.state.currentPlayerId = 'P2';

        // Calculate Cost
        // Base Attack Cost = 20 (Config) * 1.2 (Multiplier) = 24
        // Distance Penalty: P2 has no connected land nearby? 
        // To isolate Aura, let's give P2 a connected land nearby so Distance = 1 (No penalty)
        engine.state.grid[r - 1][c].owner = 'P2';
        engine.state.grid[r - 1][c].isConnected = true;

        const costDetails = engine.getCostDetails(r, c);

        // Expected Logic:
        // Base Attack: 20
        // Multiplier x1.2 -> 24
        // Distance x1 -> 24
        // Wall Aura (Lv0) -> +20% -> 24 * 0.2 = 4.8 -> 4
        // Total = 28

        expect(costDetails.breakdown).toContain('WallCover(+20%)');
        expect(costDetails.cost).toBe(28);
    });

    it('Scales bonus with wall level', () => {
        const engine = new GameEngine();
        const p1 = { id: 'P1', isAI: false, color: 0x000000 };
        const p2 = { id: 'P2', isAI: false, color: 0xffffff };
        engine.state.reset([p1, p2], false);

        const r = 5, c = 5;
        const wallR = 5, wallC = 6;

        // P1 owns target
        engine.state.grid[r][c].owner = 'P1';
        engine.state.grid[r][c].type = 'plain'; // Plain

        // P1 owns wall
        engine.state.grid[wallR][wallC].owner = 'P1';
        engine.state.grid[wallR][wallC].building = 'wall';
        engine.state.grid[wallR][wallC].isConnected = true;

        // P2 nearby (Distance 1)
        engine.state.grid[r - 1][c].owner = 'P2';
        engine.state.grid[r - 1][c].isConnected = true;
        engine.state.currentPlayerId = 'P2';

        // Level 1 Wall (+30%)
        engine.state.grid[wallR][wallC].defenseLevel = 1;

        let costDetails = engine.getCostDetails(r, c);
        // Base 24. +30% = 7.2 -> 7. Total 31.
        expect(costDetails.breakdown).toContain('WallCover(+30%)');
        expect(costDetails.cost).toBe(31);

        // Level 2 Wall (+40%)
        engine.state.grid[wallR][wallC].defenseLevel = 2;
        costDetails = engine.getCostDetails(r, c);
        // Base 24. +40% = 9.6 -> 9. Total 33.
        expect(costDetails.breakdown).toContain('WallCover(+40%)');
        expect(costDetails.cost).toBe(33);
    });

    it('Does not stack multiple walls (takes max)', () => {
        const engine = new GameEngine();
        const p1 = { id: 'P1', isAI: false, color: 0x000000 };
        const p2 = { id: 'P2', isAI: false, color: 0xffffff };
        engine.state.reset([p1, p2], false);

        const r = 5, c = 5;

        // P1 owns target
        engine.state.grid[r][c].owner = 'P1';
        engine.state.grid[r][c].type = 'plain';

        // P1 owns TWO walls
        // Wall 1: Level 0 (+20%)
        engine.state.grid[r][c + 1].owner = 'P1';
        engine.state.grid[r][c + 1].building = 'wall';
        engine.state.grid[r][c + 1].defenseLevel = 0;
        engine.state.grid[r][c + 1].isConnected = true;

        // Wall 2: Level 2 (+40%)
        engine.state.grid[r][c - 1].owner = 'P1';
        engine.state.grid[r][c - 1].building = 'wall';
        engine.state.grid[r][c - 1].defenseLevel = 2; // Higher level should prevail
        engine.state.grid[r][c - 1].isConnected = true;

        // P2 nearby
        engine.state.grid[r - 1][c].owner = 'P2';
        engine.state.grid[r - 1][c].isConnected = true;
        engine.state.currentPlayerId = 'P2';

        const costDetails = engine.getCostDetails(r, c);

        // Should take MAX (40%), not sum (60%)
        expect(costDetails.breakdown).toContain('WallCover(+40%)');
        // Base 24. +40% = 9. Total 33.
        expect(costDetails.cost).toBe(33);
    });
});
