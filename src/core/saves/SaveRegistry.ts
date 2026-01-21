import { NearVictory } from './NearVictory';
import { EliminationTest } from './EliminationTest';

export interface SaveScenario {
    name: string;
    description: string;
    getData: () => string;
}

export const SaveRegistry: Record<string, SaveScenario> = {
    'NEAR_VICTORY': NearVictory,
    'ELIMINATION_TEST': EliminationTest
};
