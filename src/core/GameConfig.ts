export const GameConfig = {
    GRID_SIZE: 10,
    INITIAL_GOLD: 10,
    GOLD_PER_TURN_BASE: 10,
    GOLD_PER_LAND: 1,
    COST_MOVE: 5,
    COST_ATTACK: 20,
    COST_CAPTURE: 10,
};

export type PlayerID = 'P1' | 'P2' | null;

export interface Player {
    id: PlayerID;
    color: number;
    gold: number;
}
