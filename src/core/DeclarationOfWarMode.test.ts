import { beforeEach, describe, expect, it } from 'vitest';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';

function clearBoard(engine: GameEngine) {
    const height = engine.state.grid.length;
    const width = height > 0 ? engine.state.grid[0].length : 0;
    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
            const cell = engine.state.grid[r][c];
            cell.owner = null;
            cell.building = 'none';
            cell.isConnected = false;
            cell.type = 'plain';
        }
    }
}

function setupTwoPlayerWarBoard(engine: GameEngine) {
    clearBoard(engine);
    engine.state.players.P1.gold = 1000;
    engine.state.players.P2.gold = 1000;
    engine.state.currentPlayerId = 'P1';

    // P1 side
    engine.state.setOwner(0, 0, 'P1');
    engine.state.setBuilding(0, 0, 'base');

    // P2 side
    engine.state.setOwner(0, 2, 'P2');
    engine.state.setBuilding(0, 2, 'base');
    engine.state.setOwner(0, 1, 'P2');

    engine.state.updateConnectivity('P1');
    engine.state.updateConnectivity('P2');
}

describe('Declaration of War mode', () => {
    let warEngine: GameEngine;
    let normalEngine: GameEngine;

    beforeEach(() => {
        warEngine = new GameEngine([], 'default', Math.random, { declarationOfWarModeEnabled: true });
        normalEngine = new GameEngine([], 'default', Math.random, { declarationOfWarModeEnabled: false });
        setupTwoPlayerWarBoard(warEngine);
        setupTwoPlayerWarBoard(normalEngine);
    });

    it('keeps legacy behavior when mode is OFF', () => {
        const result = normalEngine.validateMove(0, 1, true);
        expect(result.valid).toBe(true);
    });

    it('blocks attacking enemy land before war is declared', () => {
        const result = warEngine.validateMove(0, 1, true);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('Declare war');
    });

    it('shows DECLARE_WAR interaction on enemy base when mode is ON', () => {
        const actions = warEngine.interactionRegistry.getAvailableActions(warEngine, 0, 2).map(a => a.id);
        expect(actions).toContain('DECLARE_WAR');
    });

    it('costs 10 gold to declare war', () => {
        warEngine.state.players.P1.gold = 10;
        warEngine.planInteraction(0, 2, 'DECLARE_WAR');
        expect(warEngine.pendingInteractions).toHaveLength(1);

        warEngine.endTurn();

        expect(warEngine.state.players.P1.gold).toBe(0);
        expect(warEngine.isAtWar('P1', 'P2')).toBe(true);
    });

    it('blocks declare war when player has less than 10 gold', () => {
        warEngine.state.players.P1.gold = 9;
        warEngine.planInteraction(0, 2, 'DECLARE_WAR');

        expect(warEngine.pendingInteractions).toHaveLength(0);
        expect(warEngine.lastError).toContain('Not enough gold');
    });

    it('activates war only after end turn and makes it bilateral', () => {
        warEngine.planInteraction(0, 2, 'DECLARE_WAR');
        expect(warEngine.isAtWar('P1', 'P2')).toBe(false);

        warEngine.endTurn(); // P1 ends -> P2 turn starts, war activates

        expect(warEngine.isAtWar('P1', 'P2')).toBe(true);
        expect(warEngine.state.currentPlayerId).toBe('P2');
        expect(warEngine.validateMove(0, 0, true).valid).toBe(true);
    });

    it('ends war after 5 rounds without mutual captures', () => {
        warEngine.planInteraction(0, 2, 'DECLARE_WAR');
        warEngine.endTurn(); // Activate war
        expect(warEngine.isAtWar('P1', 'P2')).toBe(true);

        // 5 full rounds for 2 players = 10 turns
        for (let i = 0; i < 10; i++) {
            warEngine.endTurn();
        }

        expect(warEngine.isAtWar('P1', 'P2')).toBe(false);
    });

    it('removes war on elimination and allows free capture of eliminated land', () => {
        const engine = new GameEngine([
            { id: 'P1', isAI: false, color: GameConfig.COLORS.P1 },
            { id: 'P2', isAI: false, color: GameConfig.COLORS.P2 },
            { id: 'P3', isAI: false, color: GameConfig.COLORS.P3 }
        ], 'default', Math.random, { declarationOfWarModeEnabled: true });

        clearBoard(engine);
        engine.state.players.P1.gold = 1000;
        engine.state.players.P2.gold = 1000;
        engine.state.players.P3.gold = 1000;
        engine.state.playerOrder = ['P1', 'P2', 'P3'];
        engine.state.currentPlayerId = 'P1';

        // P1 setup
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');
        engine.state.setOwner(0, 1, 'P1');

        // P2 setup
        engine.state.setOwner(0, 2, 'P2');
        engine.state.setBuilding(0, 2, 'base');
        engine.state.setOwner(0, 3, 'P2'); // Territory remains after elimination

        // P3 setup (adjacent route to P2 land after elimination)
        engine.state.setOwner(2, 3, 'P3');
        engine.state.setBuilding(2, 3, 'base');
        engine.state.setOwner(1, 3, 'P3');

        engine.state.updateConnectivity('P1');
        engine.state.updateConnectivity('P2');
        engine.state.updateConnectivity('P3');

        // Declare war first (required for P1 to eliminate P2)
        engine.planInteraction(0, 2, 'DECLARE_WAR');
        engine.endTurn(); // P1 -> P2, war activates
        engine.endTurn(); // P2 -> P3
        engine.endTurn(); // P3 -> P1

        // P1 captures P2 base -> eliminates P2
        engine.togglePlan(0, 2);
        engine.endTurn();

        expect(engine.state.playerOrder).not.toContain('P2');
        expect(engine.isAtWar('P1', 'P2')).toBe(false);

        // Now P3 can capture eliminated P2 territory without declaring war
        expect(engine.state.currentPlayerId).toBe('P3');
        const canCaptureEliminatedLand = engine.validateMove(0, 3, true);
        expect(canCaptureEliminatedLand.valid).toBe(true);
    });


    it('AI evaluates declare-war per target and skips non-border players', () => {
        const engine = new GameEngine([
            { id: 'P1', isAI: true, color: GameConfig.COLORS.P1 },
            { id: 'P2', isAI: false, color: GameConfig.COLORS.P2 },
            { id: 'P3', isAI: false, color: GameConfig.COLORS.P3 }
        ], 'default', () => 0.5, { declarationOfWarModeEnabled: true, randomizeAiProfiles: false });

        clearBoard(engine);
        engine.state.playerOrder = ['P1', 'P2', 'P3'];
        engine.state.currentPlayerId = 'P1';
        engine.state.players.P1.gold = 200;
        engine.state.players.P2.gold = 200;
        engine.state.players.P3.gold = 200;

        // P1 borders P2
        engine.state.setOwner(0, 0, 'P1');
        engine.state.setBuilding(0, 0, 'base');
        engine.state.setOwner(0, 1, 'P1');

        engine.state.setOwner(0, 2, 'P2');
        engine.state.setBuilding(0, 2, 'base');
        engine.state.setOwner(1, 2, 'P2');

        // P3 is far away with no border contact to P1
        engine.state.setOwner(5, 5, 'P3');
        engine.state.setBuilding(5, 5, 'base');
        engine.state.setOwner(5, 4, 'P3');

        engine.state.updateConnectivity('P1');
        engine.state.updateConnectivity('P2');
        engine.state.updateConnectivity('P3');

        engine.ai.playTurn();

        expect(engine.isAtWar('P1', 'P2')).toBe(true);
        expect(engine.isAtWar('P1', 'P3')).toBe(false);
    });

    it('lets AI proactively declare war in war mode', () => {
        const engine = new GameEngine([
            { id: 'P1', isAI: true, color: GameConfig.COLORS.P1 },
            { id: 'P2', isAI: false, color: GameConfig.COLORS.P2 }
        ], 'default', () => 0.5, { declarationOfWarModeEnabled: true, randomizeAiProfiles: false });

        setupTwoPlayerWarBoard(engine);
        engine.state.players.P1.gold = 200;
        engine.state.currentPlayerId = 'P1';
        engine.state.updateConnectivity('P1');
        engine.state.updateConnectivity('P2');

        engine.ai.playTurn();

        expect(engine.isAtWar('P1', 'P2')).toBe(true);
    });
});
