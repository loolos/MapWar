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
    /**
     * Run mode:
     * - quick (default): only 15×15, 4P across all map types (fast; for pre-commit/check)
     * - full: full matrix (sizes × types)
     * - single: one config via width/height/players/map-type
     */
    mode: 'quick' | 'full' | 'single';
    width: number;
    height: number;
    players: number;
    mapType: MapType;
    turns: number;
    /** Reduce output (summary table only). */
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
        mode: 'quick',
        width: 20,
        height: 20,
        players: 6,
        mapType: 'default',
        turns: 100,
        quiet: false,
        profile: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];
        switch (arg) {
            case '--width':
                options.width = parseInt(next, 10);
                options.mode = 'single';
                i++;
                break;
            case '--height':
                options.height = parseInt(next, 10);
                options.mode = 'single';
                i++;
                break;
            case '--players':
                options.players = Math.max(2, parseInt(next, 10));
                options.mode = 'single';
                i++;
                break;
            case '--map-type':
                if (MAP_TYPES.includes(next as MapType)) {
                    options.mapType = next as MapType;
                }
                options.mode = 'single';
                i++;
                break;
            case '--turns':
                options.turns = Math.max(1, parseInt(next, 10));
                i++;
                break;
            case '--full':
                options.mode = 'full';
                break;
            case '--quick':
                options.mode = 'quick';
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

function runFullMatrix(turns: number, quiet: boolean, profile: boolean): void {
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

    // Detailed report (optional)
    if (!quiet) {
        console.log('\n========== Benchmark by map size × map type ==========\n');

        for (const size of SIZE_PRESETS) {
            const sizeResults = results.filter(
                (r) => r.config.width === size.width && r.config.height === size.height
            );
            console.log(`### ${size.sizeLabel} (${size.width}×${size.height}, ${size.players} AI) ###`);
            for (const r of sizeResults) {
                console.log(`  --- ${MAP_TYPE_LABELS[r.config.mapType]} ---`);
                console.log(`     Samples: ${r.samples.length}  Avg: ${r.avg.toFixed(2)} ms  Max: ${r.max.toFixed(2)} ms  Over ${MAX_BUDGET_MS}ms: ${r.overMaxBudget}  ${r.passed ? '✅' : '❌'}`);
                if (profile && r.samples.length > 0) {
                    const sorted = [...r.samples].sort((a, b) => a - b);
                    const p50 = sorted[Math.floor(sorted.length * 0.5)];
                    const p90 = sorted[Math.floor(sorted.length * 0.90)];
                    const p99 = sorted[Math.floor(sorted.length * 0.99)];
                    console.log(`     P50: ${p50.toFixed(2)} ms  P90: ${p90.toFixed(2)} ms  P99: ${p99.toFixed(2)} ms`);
                }
            }
            console.log('');
        }
    }

    // Summary table (by map size, then by map type)
    console.log('========== Summary (by size × type) ==========');
    console.log('');
    console.log('Size & type                 Avg (ms)   Max (ms)   Over 100ms   Result');
    console.log('---------------------------------------------------------------');
    for (const r of results) {
        const status = r.passed ? '✅' : '❌';
        const label = r.config.label.padEnd(24);
        console.log(`${label} ${r.avg.toFixed(2).padStart(8)}   ${r.max.toFixed(2).padStart(8)}   ${String(r.overMaxBudget).padStart(10)}      ${status}`);
    }
    console.log('');

    const anyFailed = results.some((r) => !r.passed);
    if (anyFailed) {
        console.error('❌ One or more configs exceeded thresholds');
        process.exit(1);
    }
    console.log('✅ All configs passed thresholds');
}

function runQuick(turns: number, quiet: boolean, profile: boolean): void {
    // For pre-commit/check: 15×15, 4P across all map types.
    const base = SIZE_PRESETS.find((s) => s.width === 15 && s.height === 15 && s.players === 4) ?? SIZE_PRESETS[1];

    const configs: MapConfig[] = MAP_TYPES.map((mapType) => ({
        width: base.width,
        height: base.height,
        players: base.players,
        mapType,
        label: `${base.sizeLabel} ${MAP_TYPE_LABELS[mapType]}`,
    }));

    const results: RunResult[] = configs.map((cfg) =>
        runOneBenchmark(cfg.width, cfg.height, cfg.players, cfg.mapType, turns, cfg.label)
    );

    if (!quiet) {
        console.log(`\n========== Benchmark (quick) ==========\n`);
        console.log(`Scope: ${base.sizeLabel} (${base.width}×${base.height}, ${base.players} AI) across map types\n`);
    }

    // Simplified output: compact table only.
    console.log('Map type       Avg (ms)   Max (ms)   Samples   Over 100ms   Result');
    console.log('-------------------------------------------------------------------');
    for (const r of results) {
        const typeLabel = MAP_TYPE_LABELS[r.config.mapType].padEnd(12);
        const status = r.passed ? '✅' : '❌';
        console.log(
            `${typeLabel} ${r.avg.toFixed(2).padStart(8)}   ${r.max.toFixed(2).padStart(8)}   ${String(r.samples.length).padStart(7)}   ${String(r.overMaxBudget).padStart(10)}      ${status}`
        );
        if (profile && r.samples.length > 0 && !quiet) {
            const sorted = [...r.samples].sort((a, b) => a - b);
            const p50 = sorted[Math.floor(sorted.length * 0.5)];
            const p90 = sorted[Math.floor(sorted.length * 0.90)];
            const p99 = sorted[Math.floor(sorted.length * 0.99)];
            console.log(`  P50: ${p50.toFixed(2)} ms  P90: ${p90.toFixed(2)} ms  P99: ${p99.toFixed(2)} ms`);
        }
    }
    console.log('');

    const anyFailed = results.some((r) => !r.passed);
    if (anyFailed) {
        console.error('❌ One or more configs exceeded thresholds');
        process.exit(1);
    }
    console.log('✅ All configs passed thresholds');
}

function runSingle(options: CliOptions): void {
    const result = runOneBenchmark(
        options.width,
        options.height,
        options.players,
        options.mapType,
        options.turns,
        `${options.width}×${options.height}, ${options.players}P ${MAP_TYPE_LABELS[options.mapType]}`
    );

    console.log(`AI benchmark (${options.width}x${options.height}, ${options.players} AI, ${MAP_TYPE_LABELS[options.mapType]})`);
    console.log(`Samples: ${result.samples.length}`);
    console.log(`Avg: ${result.avg.toFixed(2)} ms`);
    console.log(`Max: ${result.max.toFixed(2)} ms`);
    console.log(`Min: ${result.min.toFixed(2)} ms`);
    console.log(`Over ${MAX_BUDGET_MS} ms: ${result.overMaxBudget}`);

    if (options.profile && result.samples.length > 0) {
        const sorted = [...result.samples].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p75 = sorted[Math.floor(sorted.length * 0.75)];
        const p90 = sorted[Math.floor(sorted.length * 0.90)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];
        console.log(`\n=== Performance Distribution ===`);
        console.log(`P50: ${p50.toFixed(2)}ms  P75: ${p75.toFixed(2)}ms  P90: ${p90.toFixed(2)}ms  P95: ${p95.toFixed(2)}ms  P99: ${p99.toFixed(2)}ms`);
    }

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

    switch (options.mode) {
        case 'full':
            runFullMatrix(options.turns, options.quiet, options.profile);
            break;
        case 'single':
            runSingle(options);
            break;
        case 'quick':
        default:
            runQuick(options.turns, options.quiet, options.profile);
            break;
    }
};

main();
