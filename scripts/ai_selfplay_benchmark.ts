import { GameEngine } from '../src/core/GameEngine';
import { GameConfig } from '../src/core/GameConfig';
import type { MapType } from '../src/core/map/MapGenerator';

type MapConfig = {
    width: number;
    height: number;
    players: number;
    mapType: MapType;
    label: string;
};

type CliOptions = {
    /** Run all preset map configs (default). If false, use single run with width/height/players. */
    all: boolean;
    width: number;
    height: number;
    players: number;
    mapType: MapType;
    turns: number;
    quiet: boolean;
    profile: boolean;
};

const MAP_TYPES: MapType[] = ['default', 'mountains', 'archipelago', 'pangaea', 'rivers'];

const MAP_TYPE_LABELS: Record<MapType, string> = {
    default: 'Default',
    mountains: 'Mountains',
    archipelago: 'Archipelago',
    pangaea: 'Pangaea',
    rivers: 'Rivers',
};

const SIZE_PRESETS = [
    { width: 10, height: 10, players: 2, sizeLabel: '10×10, 2P' },
    { width: 15, height: 15, players: 4, sizeLabel: '15×15, 4P' },
    { width: 20, height: 20, players: 6, sizeLabel: '20×20, 6P' },
];

const PRESETS: MapConfig[] = SIZE_PRESETS.flatMap((s) =>
    MAP_TYPES.map((mapType) => ({
        width: s.width,
        height: s.height,
        players: s.players,
        mapType,
        label: `${s.sizeLabel} ${MAP_TYPE_LABELS[mapType]}`,
    }))
);

const parseArgs = (): CliOptions => {
    const args = process.argv.slice(2);
    const options: CliOptions = {
        all: true,
        width: 20,
        height: 20,
        players: 6,
        mapType: 'default',
        turns: 100,
        quiet: true,
        profile: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];
        switch (arg) {
            case '--width':
                options.width = parseInt(next, 10);
                options.all = false;
                i++;
                break;
            case '--height':
                options.height = parseInt(next, 10);
                options.all = false;
                i++;
                break;
            case '--players':
                options.players = Math.max(2, parseInt(next, 10));
                options.all = false;
                i++;
                break;
            case '--map-type':
                if (MAP_TYPES.includes(next as MapType)) {
                    options.mapType = next as MapType;
                }
                options.all = false;
                i++;
                break;
            case '--turns':
                options.turns = Math.max(1, parseInt(next, 10));
                i++;
                break;
            case '--all':
                options.all = true;
                break;
            case '--single':
                options.all = false;
                break;
            case '--verbose':
                options.quiet = false;
                break;
            case '--quiet':
                options.quiet = true;
                break;
            case '--profile':
                options.profile = true;
                break;
            default:
                break;
        }
    }

    return options;
};

const nowMs = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

const MAX_BUDGET_MS = 100;
const AVG_BUDGET_MS = 15;

type RunResult = {
    config: MapConfig;
    samples: number[];
    avg: number;
    max: number;
    min: number;
    overMaxBudget: number;
    passed: boolean;
};

function runOneBenchmark(
    width: number,
    height: number,
    players: number,
    mapType: MapType,
    turns: number,
    configLabel: string
): RunResult {
    (GameConfig as any).GRID_WIDTH = width;
    (GameConfig as any).GRID_HEIGHT = height;

    const playerList = Array.from({ length: players }, (_, index) => ({
        id: `P${index + 1}`,
        isAI: true,
        color: GameConfig.COLORS[`P${index + 1}` as keyof typeof GameConfig.COLORS]
    }));

    const engine = new GameEngine(playerList, mapType, Math.random, { randomizeAiProfiles: true });
    (engine as any).triggerAiTurn = () => {};

    engine.startGame();

    const samples: number[] = [];
    const maxSteps = turns * engine.state.playerOrder.length;
    let steps = 0;

    while (!engine.isGameOver && steps < maxSteps) {
        const start = nowMs();
        engine.ai.playTurn();
        const end = nowMs();
        samples.push(end - start);
        steps++;
    }

    const avg = samples.length > 0 ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
    const max = samples.length > 0 ? Math.max(...samples) : 0;
    const min = samples.length > 0 ? Math.min(...samples) : 0;
    const overMaxBudget = samples.filter((s) => s > MAX_BUDGET_MS).length;

    const passed = max <= MAX_BUDGET_MS && avg <= AVG_BUDGET_MS;

    return {
        config: { width, height, players, mapType, label: configLabel },
        samples,
        avg,
        max,
        min,
        overMaxBudget,
        passed
    };
}

function runAllPresets(turns: number, quiet: boolean, profile: boolean): void {
    const log = console.log;
    if (quiet && !profile) {
        console.log = () => {};
    }

    const results: RunResult[] = [];

    for (const preset of PRESETS) {
        const result = runOneBenchmark(
            preset.width,
            preset.height,
            preset.players,
            preset.mapType,
            turns,
            preset.label
        );
        results.push(result);
    }

    console.log = log;

    // Report by map size, then by map type within each size
    log('\n========== Benchmark by map size × map type ==========\n');

    for (const size of SIZE_PRESETS) {
        const sizeResults = results.filter(
            (r) => r.config.width === size.width && r.config.height === size.height
        );
        log(`### ${size.sizeLabel} (${size.width}×${size.height}, ${size.players} AI) ###`);
        for (const r of sizeResults) {
            log(`  --- ${MAP_TYPE_LABELS[r.config.mapType]} ---`);
            log(`     Samples: ${r.samples.length}  Avg: ${r.avg.toFixed(2)} ms  Max: ${r.max.toFixed(2)} ms  Over ${MAX_BUDGET_MS}ms: ${r.overMaxBudget}  ${r.passed ? '✅' : '❌'}`);
            if (profile && r.samples.length > 0) {
                const sorted = [...r.samples].sort((a, b) => a - b);
                const p50 = sorted[Math.floor(sorted.length * 0.5)];
                const p90 = sorted[Math.floor(sorted.length * 0.90)];
                const p99 = sorted[Math.floor(sorted.length * 0.99)];
                log(`     P50: ${p50.toFixed(2)} ms  P90: ${p90.toFixed(2)} ms  P99: ${p99.toFixed(2)} ms`);
            }
        }
        log('');
    }

    // Summary table (by map size, then by map type)
    log('========== Summary (by size × type) ==========');
    log('');
    log('Size & type                 Avg (ms)   Max (ms)   Over 100ms   Result');
    log('---------------------------------------------------------------');
    for (const r of results) {
        const status = r.passed ? '✅' : '❌';
        const label = r.config.label.padEnd(24);
        log(`${label} ${r.avg.toFixed(2).padStart(8)}   ${r.max.toFixed(2).padStart(8)}   ${String(r.overMaxBudget).padStart(10)}      ${status}`);
    }
    log('');

    const anyFailed = results.some((r) => !r.passed);
    if (anyFailed) {
        console.error('❌ One or more configs exceeded thresholds');
        process.exit(1);
    }
    console.log('✅ All configs passed thresholds');
}

function runSingle(options: CliOptions): void {
    const log = console.log;

    if (options.quiet && !options.profile) {
        console.log = () => {};
    }

    const result = runOneBenchmark(
        options.width,
        options.height,
        options.players,
        options.mapType,
        options.turns,
        `${options.width}×${options.height}, ${options.players}P ${MAP_TYPE_LABELS[options.mapType]}`
    );

    log(`AI benchmark (${options.width}x${options.height}, ${options.players} AI, ${MAP_TYPE_LABELS[options.mapType]})`);
    log(`Samples: ${result.samples.length}`);
    log(`Avg: ${result.avg.toFixed(2)} ms`);
    log(`Max: ${result.max.toFixed(2)} ms`);
    log(`Min: ${result.min.toFixed(2)} ms`);
    log(`Over ${MAX_BUDGET_MS} ms: ${result.overMaxBudget}`);

    if (options.profile && result.samples.length > 0) {
        const sorted = [...result.samples].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p75 = sorted[Math.floor(sorted.length * 0.75)];
        const p90 = sorted[Math.floor(sorted.length * 0.90)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];
        log(`\n=== Performance Distribution ===`);
        log(`P50: ${p50.toFixed(2)}ms  P75: ${p75.toFixed(2)}ms  P90: ${p90.toFixed(2)}ms  P95: ${p95.toFixed(2)}ms  P99: ${p99.toFixed(2)}ms`);
    }

    console.log = log;

    if (!result.passed) {
        if (result.max > MAX_BUDGET_MS) {
            console.error(`❌ FAILED: Max time ${result.max.toFixed(2)}ms exceeds threshold of ${MAX_BUDGET_MS}ms`);
        }
        if (result.avg > AVG_BUDGET_MS) {
            console.error(`❌ FAILED: Average time ${result.avg.toFixed(2)}ms exceeds threshold of ${AVG_BUDGET_MS}ms`);
        }
        process.exit(1);
    }
    console.log(`✅ PASSED: Max ${result.max.toFixed(2)}ms <= ${MAX_BUDGET_MS}ms, Avg ${result.avg.toFixed(2)}ms <= ${AVG_BUDGET_MS}ms`);
}

const main = () => {
    const options = parseArgs();

    if (options.all) {
        runAllPresets(options.turns, options.quiet, options.profile);
    } else {
        runSingle(options);
    }
};

main();
