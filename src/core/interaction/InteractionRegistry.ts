import { GameConfig } from '../GameConfig';
import { GameEngine } from '../GameEngine';
import type { InteractionDefinition } from './InteractionTypes';

export class InteractionRegistry {
    private actions: Map<string, InteractionDefinition> = new Map();

    constructor() {
        this.registerDefaults();
    }

    register(action: InteractionDefinition) {
        this.actions.set(action.id, action);
    }

    get(id: string): InteractionDefinition | undefined {
        return this.actions.get(id);
    }

    // Get all valid actions for a specific tile
    getAvailableActions(engine: GameEngine, row: number, col: number): InteractionDefinition[] {
        const valid: InteractionDefinition[] = [];
        for (const action of this.actions.values()) {
            if (action.isAvailable(engine, row, col)) {
                valid.push(action);
            }
        }
        return valid;
    }

    private registerDefaults() {
        // Mock 1: Upgrade (Owned Territory)
        this.register({
            id: 'BUILD_OUTPOST',
            label: 'Build Outpost',
            description: 'Construct a defensive outpost (Mock)',
            cost: 50,
            isAvailable: (engine, r, c) => {
                const cell = engine.state.getCell(r, c);
                const pid = engine.state.currentPlayerId;
                // Only allowed on OWNED, PLAIN tiles that are NOT bases/towns
                return !!(cell && pid && cell.owner === pid && cell.type === 'plain' && cell.building === 'none');
            },
            execute: (engine, r, c) => {
                console.log(`[Interaction] Building Outpost at ${r},${c}`);
                // Mock effect: Set building to a new type 'outpost' (Scanning... GameState needs update if we use real types)
                // For now, use 'none' but log it, or reuse 'town' as a placeholder? 
                // Let's just log and maybe emit an effect.
                engine.emit('logMessage', `Outpost construction started at (${r},${c})`);
            }
        });

        // Mock 2: Remote Strike (Enemy Territory)
        this.register({
            id: 'REMOTE_STRIKE',
            label: 'Remote Strike',
            description: 'Launch a missile strike (Mock)',
            cost: 100,
            isAvailable: (engine, r, c) => {
                const cell = engine.state.getCell(r, c);
                const pid = engine.state.currentPlayerId;
                // Only allowed on ENEMY tiles
                return !!(cell && pid && cell.owner && cell.owner !== pid);
            },
            execute: (engine, r, c) => {
                console.log(`[Interaction] Strike at ${r},${c}`);
                engine.emit('logMessage', `Missile strike launched at (${r},${c})!`);
                // Mock damage? 
                // Maybe remove owner?
                // engine.state.setOwner(r, c, null); // Nuclear option?
            }
        });

        // 3. Upgrade Defense
        this.register({
            id: 'UPGRADE_DEFENSE',
            label: 'Fortify Base', // "Enhance Defense"
            description: `Protect base. +${GameConfig.UPGRADE_DEFENSE_BONUS}G Capture Cost.`,
            cost: GameConfig.UPGRADE_DEFENSE_COST,
            isAvailable: (engine, r, c) => {
                const cell = engine.state.getCell(r, c);
                const pid = engine.state.currentPlayerId;
                // Owned Base, Not Max Level
                return !!(cell && pid && cell.owner === pid && cell.building === 'base' && cell.defenseLevel < GameConfig.UPGRADE_DEFENSE_MAX);
            },
            execute: (engine, r, c) => {
                const cell = engine.state.getCell(r, c);
                if (cell) {
                    cell.defenseLevel++;
                    engine.emit('logMessage', `Base at (${r},${c}) fortified to Lv ${cell.defenseLevel}`);
                }
            }
        });

        // 4. Upgrade Income
        this.register({
            id: 'UPGRADE_INCOME',
            label: 'Invest Economy',
            description: 'Increase gold income per turn.',
            cost: GameConfig.UPGRADE_INCOME_COST,
            isAvailable: (engine, r, c) => {
                const cell = engine.state.getCell(r, c);
                const pid = engine.state.currentPlayerId;
                // Owned Base, Not Max Level
                return !!(cell && pid && cell.owner === pid && cell.building === 'base' && cell.incomeLevel < GameConfig.UPGRADE_INCOME_MAX);
            },
            execute: (engine: GameEngine, r: number, c: number) => {
                const cell = engine.state.getCell(r, c);
                if (cell) {
                    cell.incomeLevel++;
                    const bonus = GameConfig.UPGRADE_INCOME_BONUS[cell.incomeLevel - 1];
                    engine.emit('logMessage', `Base economy upgraded! Income +${bonus}`);
                }
            }
        });

        // 5. Move / Capture / Attack (Unified)
        this.register({
            id: 'MOVE',
            label: (engine: GameEngine, r: number, c: number) => {
                const cell = engine.state.getCell(r, c);
                if (!cell) return 'Move';

                const pid = engine.state.currentPlayerId;
                if (cell.owner && cell.owner !== pid) return 'Attack';
                if (!cell.owner && cell.building === 'town') return 'Capture Town';
                if (!cell.owner) return 'Capture'; // Neutral

                return 'Move';
            },
            description: 'Move units to target tile.',
            cost: (engine: GameEngine, r: number, c: number) => {
                return engine.getMoveCost(r, c);
            },
            isAvailable: (engine, r: number, c: number) => {
                // Use existing move validation
                const validation = engine.validateMove(r, c);
                return validation.valid;
            },
            immediate: true,
            execute: (engine: GameEngine, r: number, c: number) => {
                engine.togglePlan(r, c);
            }
        });
    }
}
