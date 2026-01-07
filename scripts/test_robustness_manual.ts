
import { GameEngine } from '../src/core/GameEngine';
import { AIController } from '../src/core/AIController';

// Manual Mocking via Prototype or Subclassing implies just modifying the instance method
// proving that try-catch works at runtime.

const engine = new GameEngine();
engine.state.players['P1'].isAI = true;

// Override validateMove to throw
engine.validateMove = (r: number, c: number) => {
    throw new Error("Validation Crash");
};

console.log("Starting Manual Robustness Test...");

try {
    engine.ai.playTurn();
    console.log("Success: engine.ai.playTurn() did not throw.");
} catch (e) {
    console.error("Failure: engine.ai.playTurn() threw an error!");
    console.error(e);
    process.exit(1);
}

// Check if endTurn was called
// We can't easily check internal state, but we can check if turn count incremented?
// Default 2 players. P1 is current. EndTurn -> P2 becomes current.
if (engine.state.currentPlayerId !== 'P2') {
    console.error("Failure: Turn did not advance (endTurn was not called).");
    console.log(`Current Player: ${engine.state.currentPlayerId}`);
    process.exit(1);
} else {
    console.log("Success: Turn advanced.");
}
