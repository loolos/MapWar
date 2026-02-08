
import { describe, it, expect } from 'vitest';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';

describe('Citadel Mechanics', () => {
    it('should have correct capture and attack costs', () => {
        const engine = new GameEngine([
            { id: 'P1', isAI: false, color: 0xff0000 },
            { id: 'P2', isAI: false, color: 0x00ff00 }
        ]);

        // Setup: Citadel at (5,5)
        const r = 5, c = 5;
        engine.state.setBuilding(r, c, 'citadel');
        engine.state.setOwner(r, c, null); // Neutral

        // P1 adjacent at (5,4)
        engine.state.setOwner(5, 4, 'P1');
        const p1 = engine.state.players['P1'];
        p1.gold = 1000;

        // Ensure P1 is current
        expect(engine.state.currentPlayerId).toBe('P1');

        // Neutral Capture Cost = 100
        const moveCost = engine.getMoveCost(r, c);
        expect(moveCost).toBe(GameConfig.COST_CAPTURE_CITADEL);

        // Capture it for P1
        engine.pendingMoves.push({ r, c });
        engine.endTurn();
        expect(engine.state.grid[r][c].owner).toBe('P1');
        // Manually set connected to avoid x0.7 disconnected penalty
        engine.state.grid[r][c].isConnected = true;

        // FORCE State Switch to P2
        engine.state.currentPlayerId = 'P2';
        const p2 = engine.state.players['P2'];
        p2.gold = 1000;

        // Setup P2 adjacent at (5,6)
        engine.state.setOwner(5, 6, 'P2');
        // Ensure P2's cell is connected (update connectivity)
        engine.state.updateConnectivity('P2');
        // Verify the cell is connected
        const p2Cell = engine.state.getCell(5, 6);
        if (p2Cell) {
            p2Cell.isConnected = true;
        }

        // Attack Cost > 200 (200 * Multiplier)
        const attackCost = engine.getMoveCost(r, c);

        const baseCost = GameConfig.COST_CAPTURE_CITADEL * 2;
        const expected = Math.floor(baseCost * GameConfig.COST_MULTIPLIER_ATTACK); // 200 * 1.2 = 240

        expect(attackCost).toBe(expected);
    });

    it('should activate Dominance mode after holding for 3 turns', () => {
        const engine = new GameEngine([
            { id: 'P1', isAI: false, color: 0xff0000 },
            { id: 'P2', isAI: false, color: 0x00ff00 }
        ]);
        const r = 5, c = 5;
        engine.state.setBuilding(r, c, 'citadel');
        engine.state.setOwner(r, c, 'P1');

        const p1 = engine.state.players['P1'];
        p1.citadelTurnsHeld = 0;
        p1.attackCostFactor = 1;

        // Turn 1 End
        engine.state.accrueResources('P1');
        expect(p1.citadelTurnsHeld).toBe(1);
        expect(p1.attackCostFactor).toBe(1);

        // Turn 2 End
        engine.state.accrueResources('P1');
        expect(p1.citadelTurnsHeld).toBe(2);
        expect(p1.attackCostFactor).toBe(1);

        // Turn 3 End (Requirement: >= 3 to active)
        engine.state.accrueResources('P1');
        expect(p1.citadelTurnsHeld).toBe(3);
        expect(p1.attackCostFactor).toBe(GameConfig.CITADEL_DOMINANCE_FACTOR); // 1.5
    });

    it('should lose Dominance bonus when Citadel is captured', () => {
        const engine = new GameEngine([
            { id: 'P1', isAI: false, color: 0xff0000 },
            { id: 'P2', isAI: false, color: 0x00ff00 }
        ]);
        const r = 5, c = 5;
        engine.state.setBuilding(r, c, 'citadel');
        engine.state.setOwner(r, c, 'P1');

        const p1 = engine.state.players['P1'];
        p1.citadelTurnsHeld = 10;
        p1.attackCostFactor = 1.5; // Active
        p1.gold = 1000;

        // Force P2 Turn
        engine.state.currentPlayerId = 'P2';
        const p2 = engine.state.players['P2'];
        p2.gold = 1000;

        // P2 attacks Citadel
        engine.state.setOwner(5, 6, 'P2'); // Adjacent

        engine.pendingMoves = [];
        engine.pendingMoves.push({ r, c });
        engine.endTurn();

        // P2 should own it
        expect(engine.state.grid[r][c].owner).toBe('P2');

        // P1 should lose turns held immediately
        expect(p1.citadelTurnsHeld).toBe(0);

        // Verify P1 bonus loss logic interaction
        // P1 factor remains 1.5 until next accrueResources (start of P1 turn)
        // Self-correction on start of P1 turn:
        engine.state.accrueResources('P1');
        expect(p1.attackCostFactor).toBe(1);
    });
});
