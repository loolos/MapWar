
import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';

describe('Potential Enemy Attack Cost', () => {
    let engine: GameEngine;

    beforeEach(() => {
        engine = new GameEngine();
        engine.startGame();

        // Clear grid
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                engine.state.grid[r][c].owner = null;
                engine.state.grid[r][c].building = 'none';
                engine.state.grid[r][c].type = 'plain';
            }
        }

        // P1 setup
        engine.state.setOwner(0, 0, 'P1');
        engine.state.updateConnectivity('P1');
    });

    it('calculates plain land attack cost correctly', () => {
        // Attack Multiplier is 1.2 by default (if set in config, otherwise 1)
        // Base Attack is 20.
        const multiplier = GameConfig.COST_MULTIPLIER_ATTACK;
        const expected = Math.floor(20 * multiplier);

        const info = engine.getPotentialEnemyAttackCost(0, 0);
        expect(info.cost).toBe(expected);
        expect(info.breakdown).toContain("Attack(20)");
    });

    it('calculates hill attack cost correctly', () => {
        engine.state.grid[0][1].type = 'hill';
        engine.state.setOwner(0, 1, 'P1');

        // Attack Hill is 40.
        const multiplier = GameConfig.COST_MULTIPLIER_ATTACK;
        const expected = Math.floor(40 * multiplier);

        const info = engine.getPotentialEnemyAttackCost(0, 1);
        expect(info.cost).toBe(expected);
        expect(info.breakdown).toContain("Attack Hill/Bridge(40)");
    });

    it('calculates base with defense correctly', () => {
        engine.state.setBuilding(0, 0, 'base');
        engine.state.grid[0][0].defenseLevel = 2; // +10 per level (if default)

        const upgradeBonus = 2 * GameConfig.UPGRADE_DEFENSE_BONUS;
        const baseAttack = GameConfig.COST_CAPTURE_BASE;
        const multiplier = GameConfig.COST_MULTIPLIER_ATTACK;
        const expected = Math.floor((baseAttack + upgradeBonus) * multiplier);

        const info = engine.getPotentialEnemyAttackCost(0, 0);
        expect(info.cost).toBe(expected);
        expect(info.breakdown).toContain(`Base Def Lv2(+${upgradeBonus})`);
    });

    it('ignores distance and auras', () => {
        // Manual check of the code confirms distance and support logic is skipped in getPotentialEnemyAttackCost
        // This test just ensures the method exists and returns a positive number for owned tiles
        const info = engine.getPotentialEnemyAttackCost(0, 0);
        expect(info.cost).toBeGreaterThan(0);
        expect(info.breakdown).not.toContain("Distance");
        expect(info.breakdown).not.toContain("Support");
    });
});
