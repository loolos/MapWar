/**
 * Deterministic AI trace harness.
 *
 * Replays fixed seeds with Math.random stubbed out and hashes every AI decision
 * plus the resulting board. Used to prove that a performance change leaves AI
 * behaviour byte-for-byte identical:
 *
 *   npx tsx scripts/ai_determinism_trace.ts > before.txt
 *   # ...apply optimisation...
 *   npx tsx scripts/ai_determinism_trace.ts > after.txt
 *   diff before.txt after.txt
 */
import { GameEngine } from '../src/core/GameEngine';
import { GameConfig } from '../src/core/GameConfig';
import type { MapType } from '../src/core/map/MapGenerator';

const MAP_TYPES: MapType[] = ['default', 'mountains', 'archipelago', 'pangaea', 'rivers'];

const makeRng = (seed: number) => {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

const hashString = (input: string): string => {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < input.length; i++) {
        const ch = input.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return ((h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0'));
};

const boardSignature = (engine: GameEngine): string => {
    const parts: string[] = [];
    for (const row of engine.state.grid) {
        for (const cell of row) {
            parts.push(
                `${cell.owner ?? '-'}|${cell.type}|${cell.building}|${cell.defenseLevel}|` +
                `${cell.watchtowerLevel}|${cell.incomeLevel}|${cell.farmLevel}|` +
                `${cell.isConnected ? 1 : 0}|${cell.treasureGold ?? '-'}|${cell.townIncome ?? '-'}`
            );
        }
    }
    for (const id of engine.state.playerOrder) {
        const p = engine.state.players[id];
        parts.push(`${id}=${p.gold.toFixed(4)}/${(p.attackCostFactor ?? 1).toFixed(4)}/${p.citadelTurnsHeld ?? 0}`);
    }
    return parts.join(';');
};

type Scenario = { width: number; height: number; players: number; mapType: MapType; seed: number; warMode: boolean };

const SCENARIOS: Scenario[] = [];
for (const mapType of MAP_TYPES) {
    for (const [width, height, players] of [[10, 10, 2], [15, 15, 4], [20, 20, 6]] as const) {
        SCENARIOS.push({ width, height, players, mapType, seed: width * 31 + players, warMode: false });
    }
    SCENARIOS.push({ width: 15, height: 15, players: 4, mapType, seed: 777, warMode: true });
}

const run = (scenario: Scenario, turns: number): string => {
    (GameConfig as any).GRID_WIDTH = scenario.width;
    (GameConfig as any).GRID_HEIGHT = scenario.height;

    const rng = makeRng(scenario.seed);
    const originalRandom = Math.random;
    Math.random = rng;
    try {
        const playerList = Array.from({ length: scenario.players }, (_, index) => ({
            id: `P${index + 1}`,
            isAI: true,
            color: GameConfig.COLORS[`P${index + 1}` as keyof typeof GameConfig.COLORS]
        }));
        const engine = new GameEngine(playerList, scenario.mapType, rng, {
            randomizeAiProfiles: true,
            declarationOfWarModeEnabled: scenario.warMode
        });
        (engine as any).triggerAiTurn = () => {};
        engine.startGame();

        const trace: string[] = [];
        const maxSteps = turns * engine.state.playerOrder.length;
        for (let step = 0; step < maxSteps && !engine.isGameOver; step++) {
            const actor = engine.state.currentPlayerId;
            engine.ai.playTurn();
            const moves = engine.lastAiMoves.map((m) => `${m.r},${m.c}`).join('>');
            trace.push(`${step}:${actor}:${moves}:${boardSignature(engine)}`);
        }
        return hashString(trace.join('\n')) + ` steps=${trace.length} over=${engine.isGameOver}`;
    } finally {
        Math.random = originalRandom;
    }
};

const turnsArg = process.argv.indexOf('--turns');
const turns = turnsArg >= 0 ? parseInt(process.argv[turnsArg + 1], 10) : 60;

for (const scenario of SCENARIOS) {
    const label = `${scenario.width}x${scenario.height} ${scenario.players}P ${scenario.mapType}${scenario.warMode ? ' war' : ''}`;
    console.log(`${label.padEnd(34)} ${run(scenario, turns)}`);
}
