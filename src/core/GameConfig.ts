export const GameConfig = {
    GRID_WIDTH: 10,
    GRID_HEIGHT: 10,
    INITIAL_GOLD: 0,
    GOLD_PER_TURN_BASE: 10,
    GOLD_PER_LAND: 1,
    COST_MOVE: 5,
    COST_ATTACK: 20,
    COST_CAPTURE: 10,
    COST_CAPTURE_BASE: 40, // Double normal attack cost
    COST_BUILD_BRIDGE: 30,
    // Town Configs
    COST_CAPTURE_TOWN: 30,
    TOWN_INCOME_BASE: 1,
    TOWN_INCOME_GROWTH: 1,
    TOWN_INCOME_CAP: 10,
    TOWN_GROWTH_INTERVAL: 2,
    // Base Upgrade Configs
    UPGRADE_DEFENSE_COST: 10,
    UPGRADE_DEFENSE_BONUS: 30, // Increase capture cost
    UPGRADE_DEFENSE_MAX: 3,
    UPGRADE_INCOME_COST: 20,
    UPGRADE_INCOME_BONUS: [1, 2, 3, 4, 5], // Cumulative income bonus per level
    UPGRADE_INCOME_MAX: 5,
    // Farm Configs
    COST_BUILD_FARM: 20,
    COST_UPGRADE_FARM: 20,
    FARM_INCOME: [0, 2, 4, 8], // Lv 1=2, Lv 2=4, Lv 3=8
    FARM_MAX_LEVEL: 3,
    // Base Support Configs (New)
    BASE_SUPPORT_RANGE_BASE: 2,
    BASE_SUPPORT_DISCOUNT_BASE: 0.20,
    BASE_SUPPORT_RANGE_PER_LEVEL: 1,
    BASE_SUPPORT_DISCOUNT_PER_LEVEL: 0.05,
    // Base Defense Aura Configs
    BASE_DEFENSE_AURA_BONUS_BASE: 0.20,
    BASE_DEFENSE_AURA_BONUS_STEP: 0.10,
    // Income Aura Configs
    AURA_BONUS_BASE: 0.30, // 30% at max range (Level 1)
    AURA_BONUS_STEP: 0.05, // +5% per step closer / higher level
    // Wall Configs
    COST_BUILD_WALL: 10,
    WALL_DEFENSE_BONUS: 30, // Increased from 20
    WALL_CAPTURE_BASE_ADDITION: 10,
    UPGRADE_WALL_COST: 10,
    UPGRADE_WALL_MAX: 3,
    WALL_DEFENSE_AURA_BONUS: [0.2, 0.3, 0.4], // Bonus for adjacent friendly tiles per wall level
    // Watchtower Configs
    COST_BUILD_WATCHTOWER: 20,
    COST_UPGRADE_WATCHTOWER: 20,
    WATCHTOWER_MAX_LEVEL: 3,
    WATCHTOWER_RANGES: [0, 2, 3, 4], // Index 1 = 2 tiles, 2 = 3 tiles...
    WATCHTOWER_DISCOUNT_BASE: 0.20,
    WATCHTOWER_DISCOUNT_PER_WALL: 0.05,
    // Global Cost Multipliers (System Parameters)
    COST_MULTIPLIER_NEUTRAL: 1.0,
    COST_MULTIPLIER_ATTACK: 1.2,
    // Gold Mine Configs
    GOLD_MINE_CHANCE: 0.2, // 20%
    GOLD_MINE_INCOME: 5,
    GOLD_MINE_DEPLETION_RATE: 0.05, // 5% per turn
    TERRAIN_COSTS: {
        PLAIN: 1,
        HILL: 2,
        BRIDGE: 1,
        WATER: Infinity // Impassable unless building bridge
    },
    TERRAIN_DESCRIPTIONS: {
        PLAIN: "Normal terrain. Standard movement cost.",
        HILL: "Rugged terrain. Movement cost is DOUBLED.",
        WATER: "Deep water. Build a Bridge (30G) to cross.",
        BRIDGE: "A tactical bridge. No income, but allows movement."
    },
    COLORS: {
        P1: 0xff4444, // Red
        P2: 0x4444ff, // Blue
        P3: 0x44ff44, // Green
        P4: 0xffff44, // Yellow
        P5: 0xff44ff, // Purple
        P6: 0x44ffff, // Cyan
        P7: 0xffaa44, // Orange
        P8: 0xffaaaa, // Pink
        NEUTRAL: 0x555555,
        BASE: 0xffffff,
        BG: 0x2d2d2d,
        UI_BG: 0x222222,
        ACTION_BG: 0x333333,
        TEXT: 0xffffff,
        HIGHLIGHT_ATTACK: 0xff0000,
        HIGHLIGHT_MOVE: 0xffff00,
        HIGHLIGHT_AI: 0xffffff,
        // Terrain Colors
        TERRAIN_WATER: 0x224488,
        TERRAIN_HILL: 0x666644,
        TERRAIN_PLAIN: 0x555555, // Logic re-use: Neutral plain is this color
        TERRAIN_BRIDGE: 0x654321 // Wood color
    },
    UI: {
        TILE_SIZE: 64,
        SIDEBAR_WIDTH: 260,
        ACTION_BAR_HEIGHT: 150
    },
    AI_DIFFICULTY: 'MEDIUM' as Difficulty,
    ENABLE_EXPERIMENTAL: false, // Set to true to enable experimental features
};

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type PlayerID = string | null;
export type CellType = 'plain' | 'water' | 'hill' | 'bridge';

export interface Player {
    id: PlayerID;
    color: number;
    gold: number;
    isAI: boolean;
}
