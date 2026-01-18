import { GameEngine } from '../src/core/GameEngine';
import { GameConfig } from '../src/core/GameConfig';

type CliOptions = {
    width: number;
    height: number;
    players: number;
    turns: number;
    quiet: boolean;
};

const parseArgs = (): CliOptions => {
    const args = process.argv.slice(2);
    const options: CliOptions = {
        width: 30,
        height: 30,
        players: 8,
        turns: 24,
        quiet: true
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];
        switch (arg) {
            case '--width':
                options.width = parseInt(next, 10);
                i++;
                break;
            case '--height':
                options.height = parseInt(next, 10);
                i++;
                break;
            case '--players':
                options.players = Math.max(2, parseInt(next, 10));
                i++;
                break;
            case '--turns':
                options.turns = Math.max(1, parseInt(next, 10));
                i++;
                break;
            case '--verbose':
                options.quiet = false;
                break;
            case '--quiet':
                options.quiet = true;
                break;
            default:
                break;
        }
    }

    return options;
};

const nowMs = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

const main = () => {
    const options = parseArgs();
    const log = console.log;

    if (options.quiet) {
        console.log = () => {};
    }
    (GameConfig as any).GRID_WIDTH = options.width;
    (GameConfig as any).GRID_HEIGHT = options.height;

    const players = Array.from({ length: options.players }, (_, index) => ({
        id: `P${index + 1}`,
        isAI: true,
        color: GameConfig.COLORS[`P${index + 1}` as keyof typeof GameConfig.COLORS]
    }));

    const engine = new GameEngine(players, 'default', Math.random, { randomizeAiProfiles: true });
    (engine as any).triggerAiTurn = () => {};

    engine.startGame();

    const samples: number[] = [];
    const maxSteps = options.turns * engine.state.playerOrder.length;
    let steps = 0;

    while (!engine.isGameOver && steps < maxSteps) {
        const start = nowMs();
        engine.ai.playTurn();
        const end = nowMs();
        samples.push(end - start);
        steps++;
    }

    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const max = Math.max(...samples);
    const min = Math.min(...samples);
    const overBudget = samples.filter((s) => s > GameConfig.AI_TURN_BUDGET_MS).length;

    log(`AI benchmark (${options.width}x${options.height}, ${options.players} AI)`);
    log(`Samples: ${samples.length}`);
    log(`Avg: ${avg.toFixed(2)} ms`);
    log(`Max: ${max.toFixed(2)} ms`);
    log(`Min: ${min.toFixed(2)} ms`);
    log(`Over ${GameConfig.AI_TURN_BUDGET_MS} ms: ${overBudget}`);

    console.log = log;
};

main();
