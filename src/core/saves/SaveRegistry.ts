import { NearVictory } from './NearVictory';
import { LargeMap } from './LargeMap';
import { EliminationTest } from './EliminationTest';
import { GoldRushPreset } from './GoldRushPreset';

export interface SaveScenario {
    name: string;
    description: string;
    getData: () => string;
}

export const SaveRegistry: Record<string, SaveScenario> = {
    'NEAR_VICTORY': NearVictory,
    'LARGE_MAP': LargeMap,
    'ELIMINATION_TEST': EliminationTest,
    'GOLD_RUSH': GoldRushPreset
};
