
import { NearVictory } from './NearVictory';
import { LargeMap } from './LargeMap';

export interface SaveScenario {
    name: string;
    description: string;
    getData: () => string;
}

export const SaveRegistry: Record<string, SaveScenario> = {
    'NEAR_VICTORY': NearVictory,
    'LARGE_MAP': LargeMap
};
