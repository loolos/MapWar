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
            // Check Experimental Flag
            if (action.isExperimental && !GameConfig.ENABLE_EXPERIMENTAL) {
                continue;
            }

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
            isExperimental: true, // Not implemented yet
            cost: 50,
            isAvailable: (engine, r, c) => {
                const cell = engine.state.getCell(r, c);
                const pid = engine.state.currentPlayerId;
                // Only allowed on OWNED, PLAIN tiles that are NOT bases/towns
                return !!(cell && pid && cell.owner === pid && cell.type === 'plain' && cell.building === 'none');
            },
            execute: (engine, r, c) => {
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
            isExperimental: true, // Experimental Feature
            isAvailable: (engine, r, c) => {
                const cell = engine.state.getCell(r, c);
                const pid = engine.state.currentPlayerId;
                // Only allowed on ENEMY tiles
                return !!(cell && pid && cell.owner && cell.owner !== pid);
            },
            execute: (engine, r, c) => {
                engine.emit('logMessage', `Missile strike launched at (${r},${c})!`);
                // Mock damage? 
                // Maybe remove owner?
                // engine.state.setOwner(r, c, null); // Nuclear option?
            }
        });

        // 3. Build Wall
        this.register({
            id: 'BUILD_WALL',
            label: 'Build Wall',
            description: `Fortify land. +${GameConfig.WALL_DEFENSE_BONUS} Capture Cost.`,
            cost: GameConfig.COST_BUILD_WALL, // 10
            isAvailable: (engine, r, c) => {
                const cell = engine.state.getCell(r, c);
                const pid = engine.state.currentPlayerId;
                // Owned, Plain, Connected, No Building
                if (cell && pid && cell.owner === pid && cell.type === 'plain' && cell.building === 'none') {
                    // Must be connected to build walls? User said "connected occupied plain area"
                    return cell.isConnected;
                }
                return false;
            },
            execute: (engine, r, c) => {
                engine.state.setBuilding(r, c, 'wall'); // Sets building type
                const cell = engine.state.getCell(r, c);
                if (cell) {
                    cell.defenseLevel = 1; // Starts at Lv 1
                    engine.emit('logMessage', `Wall built at (${r},${c})`);
                }
            }
        });

        // 4. Upgrade Defense (Base & Wall)
        this.register({
            id: 'UPGRADE_DEFENSE',
            label: (engine, r, c) => {
                const cell = engine.state.getCell(r, c);
                if (cell?.building === 'wall') return 'Reinforce Wall';
                return 'Fortify Base';
            },
            description: (engine, r, c) => {
                const cell = engine.state.getCell(r, c);
                if (cell?.building === 'wall') return `Add +${GameConfig.WALL_DEFENSE_BONUS} Cost`;
                return `Add +${GameConfig.UPGRADE_DEFENSE_BONUS} Cost`;
            },
            cost: (engine, r, c) => {
                const cell = engine.state.getCell(r, c);
                if (cell?.building === 'wall') return GameConfig.UPGRADE_WALL_COST;
                return GameConfig.UPGRADE_DEFENSE_COST;
            },
            isAvailable: (engine, r, c) => {
                const cell = engine.state.getCell(r, c);
                const pid = engine.state.currentPlayerId;
                if (!cell || !pid || cell.owner !== pid) return false;

                if (cell.building === 'base') {
                    return cell.defenseLevel < GameConfig.UPGRADE_DEFENSE_MAX;
                } else if (cell.building === 'wall') {
                    return cell.defenseLevel < GameConfig.UPGRADE_WALL_MAX;
                }
                return false;
            },
            execute: (engine, r, c) => {
                const cell = engine.state.getCell(r, c);
                if (cell) {
                    cell.defenseLevel++;
                    engine.emit('logMessage', `${cell.building === 'wall' ? 'Wall' : 'Base'} at (${r},${c}) fortified to Lv ${cell.defenseLevel}`);
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

        // 6. Build Watchtower
        this.register({
            id: 'BUILD_WATCHTOWER',
            label: 'Construct Watchtower',
            description: 'Build a Watchtower on top of the Wall to reduce enemy attack costs.',
            cost: GameConfig.COST_BUILD_WATCHTOWER,
            isAvailable: (engine, r, c) => {
                const cell = engine.state.getCell(r, c);
                const pid = engine.state.currentPlayerId;
                // Owned, Wall, Connected, No Watchtower yet
                return !!(cell && pid && cell.owner === pid && cell.building === 'wall' && cell.isConnected && cell.watchtowerLevel === 0);
            },
            execute: (engine, r, c) => {
                const cell = engine.state.getCell(r, c);
                if (cell) {
                    cell.watchtowerLevel = 1;
                    engine.emit('logMessage', `Watchtower built at (${r},${c})`);
                }
            }
        });

        // 7. Upgrade Watchtower
        this.register({
            id: 'UPGRADE_WATCHTOWER',
            label: 'Upgrade Watchtower',
            description: 'Increase Watchtower range and effect.',
            cost: GameConfig.COST_UPGRADE_WATCHTOWER,
            isAvailable: (engine, r, c) => {
                const cell = engine.state.getCell(r, c);
                const pid = engine.state.currentPlayerId;
                // Owned, Watchtower exists, Not Max
                return !!(cell && pid && cell.owner === pid && cell.watchtowerLevel > 0 && cell.watchtowerLevel < GameConfig.WATCHTOWER_MAX_LEVEL);
            },
            execute: (engine, r, c) => {
                const cell = engine.state.getCell(r, c);
                if (cell) {
                    cell.watchtowerLevel++;
                    const range = GameConfig.WATCHTOWER_RANGES[cell.watchtowerLevel];
                    engine.emit('logMessage', `Watchtower at (${r},${c}) upgraded to Lv ${cell.watchtowerLevel} (Range: ${range})`);
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
