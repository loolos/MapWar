import { GameEngine } from '../GameEngine';

export interface InteractionDefinition {
    id: string;
    label: string | ((engine: GameEngine, row: number, col: number) => string);
    description: string | ((engine: GameEngine, row: number, col: number) => string);
    cost: number | ((engine: GameEngine, row: number, col: number) => number);
    // Returns true if this action is available for the given tile context
    isAvailable: (engine: GameEngine, row: number, col: number) => boolean;
    // Main execution logic (Applied on Commit, or Immediately if immediate=true)
    execute: (engine: GameEngine, row: number, c: number) => void;
    // If true, executes immediately upon planning (e.g. Move planning) instead of queuing
    immediate?: boolean;
    // If true, this interaction is considered experimental and hidden unless enabled in config
    isExperimental?: boolean;
}
