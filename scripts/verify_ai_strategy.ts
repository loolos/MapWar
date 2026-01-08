
import { GameEngine } from '../src/core/GameEngine';
import { GameConfig } from '../src/core/GameConfig';

// Mock AI Logic Test
console.log("--- Verifying AI Strategy ---");

// 1. Setup Game with AI
const engine = new GameEngine([
    { id: 'P1', color: 0xff0000, isAI: true }, // AI
    { id: 'P2', color: 0x0000ff, isAI: false }
], 'default');

const ai = engine.state.players['P1'];
ai.gold = 100; // Give AI enough gold for ~10 moves

// 2. Setup Map Scenario
// P1 Base at 0,0.
// Town at 0,2 (Adj to 0,1).
// P1 owns 0,0. P1 needs to capture 0,1 then 0,2.
const grid = engine.state.grid;

// Find P1 Base
let baseR = 0, baseC = 0;
for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) {
        if (grid[r][c].owner === 'P1' && grid[r][c].building === 'base') {
            baseR = r;
            baseC = c;
            break;
        }
    }
}
console.log(`P1 Base found at ${baseR}, ${baseC}`);

// Setup Scenario: Target at (baseR, baseC + 2)
// Ensure (baseR, baseC + 1) is captureable plain
// Ensure (baseR, baseC + 2) is Town
if (baseC + 2 < grid[0].length) {
    // Intermediate
    grid[baseR][baseC + 1].type = 'plain';
    grid[baseR][baseC + 1].owner = null;
    grid[baseR][baseC + 1].building = 'none';

    // Target Town
    grid[baseR][baseC + 2].type = 'plain';
    grid[baseR][baseC + 2].building = 'town';
    grid[baseR][baseC + 2].owner = null;

    console.log(`Placed Target Town at ${baseR}, ${baseC + 2}`);
} else {
    console.log("Map too small/edge case for simple test script.");
}


console.log(`Initial Gold: ${ai.gold}`);
console.log("Running AI Turn...");

// 3. Run Turn
engine.ai.playTurn();

console.log("Turn Ended.");
console.log(`Final Gold: ${ai.gold}`);
console.log(`Moves Made: ${engine.lastAiMoves.length}`);

engine.lastAiMoves.forEach((m, i) => {
    console.log(`Move ${i + 1}: (${m.r}, ${m.c})`);
});

// Verification Check
const town = grid[baseR][baseC + 2];
if (town.owner === 'P1') {
    console.log("SUCCESS: AI Captured the Town!");
} else {
    // maybe it didn't reach it in one turn? 
    // It takes 1 move to get to intermediate (10g) then 1 move to get to town (10g).
    // With 100g it should easily do this.
    console.log(`FAILURE: AI did not capture the town at ${baseR}, ${baseC + 2}. Owner: ${town.owner}`);
}

// Check Gold Spending
// It should have spent roughly 20-30g or more if it expanded elsewhere
if (ai.gold < 80) {
    console.log("SUCCESS: AI spent gold excessively (Good logic).");
} else {
    console.log("WARNING: AI is hoarding gold.");
}
