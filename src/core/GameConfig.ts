export const GameConfig = {
    GRID_SIZE: 10,
    INITIAL_GOLD: 0,
    GOLD_PER_TURN_BASE: 10,
    GOLD_PER_LAND: 1,
    COST_MOVE: 5,
    COST_ATTACK: 20,
    COST_CAPTURE: 10,
    TERRAIN_COSTS: {
        PLAIN: 1,
        HILL: 2,
        WATER: Infinity // Impassable
    },
    TERRAIN_DESCRIPTIONS: {
        PLAIN: "Normal terrain. Standard movement cost.",
        HILL: "Rugged terrain. Movement cost is DOUBLED.",
        WATER: "Deep water. Impassable."
    },
    COLORS: {
        P1: 0x880000,
        P2: 0x000088,
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
        TERRAIN_PLAIN: 0x555555 // Logic re-use: Neutral plain is this color
    },
    UI: {
        TILE_SIZE: 64,
        SIDEBAR_WIDTH: 260,
        ACTION_BAR_HEIGHT: 150
    }
};

export type PlayerID = 'P1' | 'P2' | null;
export type CellType = 'plain' | 'water' | 'hill';

export interface Player {
    id: PlayerID;
    color: number;
    gold: number;
    isAI: boolean;
}
