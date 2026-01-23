import { GameEngine } from '../src/core/GameEngine';
import { GameConfig } from '../src/core/GameConfig';

type CliOptions = {
    width: number;
    height: number;
    players: number;
    turns: number;
    quiet: boolean;
    profile: boolean;
};

const parseArgs = (): CliOptions => {
    const args = process.argv.slice(2);
    const options: CliOptions = {
        width: 20,
        height: 20,
        players: 6,
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

// Performance thresholds
const MAX_BUDGET_MS = 100; // Maximum allowed time per turn
const AVG_BUDGET_MS = 15;  // Maximum allowed average time per turn

const main = () => {
    const options = parseArgs();
    const log = console.log;

    if (options.quiet && !options.profile) {
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
    const overMaxBudget = samples.filter((s) => s > MAX_BUDGET_MS).length;

    log(`AI benchmark (${options.width}x${options.height}, ${options.players} AI)`);
    log(`Samples: ${samples.length}`);
    log(`Avg: ${avg.toFixed(2)} ms`);
    log(`Max: ${max.toFixed(2)} ms`);
    log(`Min: ${min.toFixed(2)} ms`);
    log(`Over ${MAX_BUDGET_MS} ms: ${overMaxBudget}`);

    // Performance analysis
    if (options.profile) {
        // Calculate percentiles
        const sorted = [...samples].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p75 = sorted[Math.floor(sorted.length * 0.75)];
        const p90 = sorted[Math.floor(sorted.length * 0.90)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];

        log(`\n=== Performance Distribution ===`);
        log(`P50 (median): ${p50.toFixed(2)}ms`);
        log(`P75: ${p75.toFixed(2)}ms`);
        log(`P90: ${p90.toFixed(2)}ms`);
        log(`P95: ${p95.toFixed(2)}ms`);
        log(`P99: ${p99.toFixed(2)}ms`);

        // Analyze slow turns
        const slowThreshold = avg * 2;
        const slowTurns = samples
            .map((time, idx) => ({ time, idx }))
            .filter(({ time }) => time > slowThreshold)
            .sort((a, b) => b.time - a.time);

        if (slowTurns.length > 0) {
            log(`\n=== Slow Turns Analysis ===`);
            log(`Found ${slowTurns.length} turns > 2x average (${slowThreshold.toFixed(2)}ms)`);
            log(`Top 10 slowest turns:`);
            slowTurns.slice(0, 10).forEach(({ time, idx }) => {
                log(`  Turn ${idx}: ${time.toFixed(2)}ms (${(time/avg*100).toFixed(0)}% of avg)`);
            });

            // Analyze when slow turns occur
            const earlyGame = slowTurns.filter(({ idx }) => idx < samples.length * 0.33);
            const midGame = slowTurns.filter(({ idx }) => idx >= samples.length * 0.33 && idx < samples.length * 0.67);
            const lateGame = slowTurns.filter(({ idx }) => idx >= samples.length * 0.67);
            
            log(`\nSlow turns distribution:`);
            log(`  Early game (0-33%): ${earlyGame.length} (${(earlyGame.length/slowTurns.length*100).toFixed(1)}%)`);
            log(`  Mid game (33-67%): ${midGame.length} (${(midGame.length/slowTurns.length*100).toFixed(1)}%)`);
            log(`  Late game (67-100%): ${lateGame.length} (${(lateGame.length/slowTurns.length*100).toFixed(1)}%)`);
        }

        // Performance bottleneck analysis
        log(`\n=== Bottleneck Analysis ===`);
        log(`Based on code analysis, main performance bottlenecks:`);
        log(`1. buildCandidates() - Iterates over ${options.width * options.height} cells`);
        log(`   - Collects treasure locations: O(n²)`);
        log(`   - Scores each candidate position: O(n)`);
        log(`   - Called multiple times per turn (in action loop)`);
        log(`2. Scoring functions called for each candidate:`);
        log(`   - scoreObjectives, scoreAggression, scoreTactical`);
        log(`   - scoreTreasure, scoreTreasureProximity`);
        log(`   - scoreExpansion, scoreAura, scoreLookAhead, scoreReconnect`);
        log(`3. commitMoves() - Updates connectivity for all players`);
        log(`4. validateMove() / checkMoveCost() - Called for each candidate`);
        
        if (max > avg * 3) {
            log(`\n⚠️  WARNING: Max time (${max.toFixed(2)}ms) is > 3x average (${avg.toFixed(2)}ms)`);
            log(`   This suggests occasional expensive operations (e.g., connectivity updates)`);
        }
    }

    console.log = log;

    // Check performance thresholds
    let failed = false;
    if (max > MAX_BUDGET_MS) {
        console.error(`❌ FAILED: Max time ${max.toFixed(2)}ms exceeds threshold of ${MAX_BUDGET_MS}ms`);
        failed = true;
    }
    if (avg > AVG_BUDGET_MS) {
        console.error(`❌ FAILED: Average time ${avg.toFixed(2)}ms exceeds threshold of ${AVG_BUDGET_MS}ms`);
        failed = true;
    }

    if (failed) {
        process.exit(1);
    } else {
        console.log(`✅ PASSED: Max ${max.toFixed(2)}ms <= ${MAX_BUDGET_MS}ms, Avg ${avg.toFixed(2)}ms <= ${AVG_BUDGET_MS}ms`);
    }
};

main();
