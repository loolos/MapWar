import { AIConfig } from '../AIConfig';

export type AIWeights = {
    SCORE_BASE_VALUE: number;
    SCORE_WIN_CONDITION: number;
    SCORE_TOWN: number;
    SCORE_ENEMY_LAND: number;
    SCORE_DISCONNECT_ENEMY: number;
    SCORE_DEFEND_BASE: number;
    SCORE_HILL: number;
    SCORE_BRIDGE: number;
    SCORE_EXPANSION: number;
    SCORE_AURA_MULTIPLIER: number;
    COST_PENALTY_MULTIPLIER: number;
    SCORE_LOOKAHEAD_TOWN: number;
    SCORE_LOOKAHEAD_BASE: number;
    ECONOMY_BASE_INCOME: number;
    ECONOMY_BASE_INCOME_LEVEL: number;
    ECONOMY_FARM_BUILD: number;
    ECONOMY_FARM_UPGRADE: number;
    ECONOMY_FARM_LEVEL: number;
    ECONOMY_AURA_BONUS_MULT: number;
    DEFENSE_BASE_UPGRADE: number;
    DEFENSE_WALL_BUILD: number;
    DEFENSE_WALL_UPGRADE: number;
    DEFENSE_WATCHTOWER_BUILD: number;
    DEFENSE_WATCHTOWER_UPGRADE: number;
    DEFENSE_THREAT_MULT: number;
    DEFENSE_BASE_THREAT_RADIUS: number;
    DEFENSE_BASE_THREAT_SCORE: number;
    RECONNECT_DISCONNECTED_SCORE: number;
    MAX_MOVES_PER_TURN: number;
    RANDOM_NOISE: number;
};

export type AIProfile = {
    id: string;
    label?: string;
    weights?: Partial<AIWeights>;
};

export const DefaultAIWeights: AIWeights = {
    SCORE_BASE_VALUE: AIConfig.SCORE_BASE_VALUE,
    SCORE_WIN_CONDITION: AIConfig.SCORE_WIN_CONDITION,
    SCORE_TOWN: AIConfig.SCORE_TOWN,
    SCORE_ENEMY_LAND: AIConfig.SCORE_ENEMY_LAND,
    SCORE_DISCONNECT_ENEMY: AIConfig.SCORE_DISCONNECT_ENEMY,
    SCORE_DEFEND_BASE: AIConfig.SCORE_DEFEND_BASE,
    SCORE_HILL: AIConfig.SCORE_HILL,
    SCORE_BRIDGE: AIConfig.SCORE_BRIDGE,
    SCORE_EXPANSION: AIConfig.SCORE_EXPANSION,
    SCORE_AURA_MULTIPLIER: AIConfig.SCORE_AURA_MULTIPLIER,
    COST_PENALTY_MULTIPLIER: AIConfig.COST_PENALTY_MULTIPLIER,
    SCORE_LOOKAHEAD_TOWN: AIConfig.SCORE_LOOKAHEAD_TOWN,
    SCORE_LOOKAHEAD_BASE: AIConfig.SCORE_LOOKAHEAD_BASE,
    ECONOMY_BASE_INCOME: 120,
    ECONOMY_BASE_INCOME_LEVEL: 30,
    ECONOMY_FARM_BUILD: 90,
    ECONOMY_FARM_UPGRADE: 70,
    ECONOMY_FARM_LEVEL: 25,
    ECONOMY_AURA_BONUS_MULT: 200,
    DEFENSE_BASE_UPGRADE: 120,
    DEFENSE_WALL_BUILD: 110,
    DEFENSE_WALL_UPGRADE: 90,
    DEFENSE_WATCHTOWER_BUILD: 80,
    DEFENSE_WATCHTOWER_UPGRADE: 70,
    DEFENSE_THREAT_MULT: 120,
    DEFENSE_BASE_THREAT_RADIUS: 2,
    DEFENSE_BASE_THREAT_SCORE: 600,
    RECONNECT_DISCONNECTED_SCORE: 120,
    MAX_MOVES_PER_TURN: AIConfig.MAX_MOVES_PER_TURN,
    RANDOM_NOISE: 10
};

export const BaselineAIProfile: AIProfile = {
    id: 'baseline',
    label: 'Baseline',
    weights: {}
};

export const OptimizedAIProfile: AIProfile = {
    id: 'balanced_plus',
    label: 'Balanced Plus',
    weights: {
        SCORE_ENEMY_LAND: AIConfig.SCORE_ENEMY_LAND * 1.1,
        SCORE_TOWN: AIConfig.SCORE_TOWN * 1.2,
        SCORE_LOOKAHEAD_TOWN: AIConfig.SCORE_LOOKAHEAD_TOWN * 1.2,
        ECONOMY_FARM_BUILD: DefaultAIWeights.ECONOMY_FARM_BUILD * 1.2,
        DEFENSE_WALL_BUILD: DefaultAIWeights.DEFENSE_WALL_BUILD * 1.1,
        DEFENSE_THREAT_MULT: DefaultAIWeights.DEFENSE_THREAT_MULT * 1.1
    }
};

export const DefaultAIProfile: AIProfile = OptimizedAIProfile;

export const mergeAIWeights = (overrides?: Partial<AIWeights>): AIWeights => {
    return {
        ...DefaultAIWeights,
        ...(overrides || {})
    };
};
