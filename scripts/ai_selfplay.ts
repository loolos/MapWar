import fs from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../src/core/GameEngine';
import { GameConfig } from '../src/core/GameConfig';
import type { MapType } from '../src/core/map/MapGenerator';
import { AIConfig } from '../src/core/AIConfig';
import { DefaultAIWeights, type AIProfile } from '../src/core/ai/AIProfile';

type CliOptions = {
    games: number;
    seed: number;
    maxTurns: number;
    mapType: MapType;
    width: number;
    height: number;
    outDir: string;
    quiet: boolean;
};

type PlayerStats = {
    gold: number;
    land: number;
    towns: number;
    mines: number;
    farms: number;
};

type MatchResult = {
    seed: number;
    winnerId: string | null;
    turns: number;
    profiles: { P1: string; P2: string };
    stats: Record<string, PlayerStats>;
};

type Summary = {
    profileId: string;
    opponentId: string;
    games: number;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
    avgTurns: number;
};

const parseArgs = (): CliOptions => {
    const args = process.argv.slice(2);
    const options: CliOptions = {
        games: 50,
        seed: 1,
        maxTurns: 200,
        mapType: 'default',
        width: GameConfig.GRID_WIDTH,
        height: GameConfig.GRID_HEIGHT,
        outDir: 'reports',
        quiet: true
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];
        switch (arg) {
            case '--games':
                options.games = parseInt(next, 10);
                i++;
                break;
            case '--seed':
                options.seed = parseInt(next, 10);
                i++;
                break;
            case '--max-turns':
                options.maxTurns = parseInt(next, 10);
                i++;
                break;
            case '--map-type':
                options.mapType = next as MapType;
                i++;
                break;
            case '--width':
                options.width = parseInt(next, 10);
                i++;
                break;
            case '--height':
                options.height = parseInt(next, 10);
                i++;
                break;
            case '--out':
                options.outDir = next;
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

const createSeededRandom = (seed: number) => {
    let t = seed >>> 0;
    return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
};

const withSeededRandom = <T>(seed: number, fn: (rng: () => number) => T): T => {
    const original = Math.random;
    const rng = createSeededRandom(seed);
    Math.random = rng;
    try {
        return fn(rng);
    } finally {
        Math.random = original;
    }
};

const summarizePlayerStats = (engine: GameEngine, playerId: string): PlayerStats => {
    const player = engine.state.players[playerId];
    let land = 0;
    let towns = 0;
    let mines = 0;
    let farms = 0;

    for (let r = 0; r < engine.state.grid.length; r++) {
        for (let c = 0; c < engine.state.grid[r].length; c++) {
            const cell = engine.state.grid[r][c];
            if (cell.owner === playerId) {
                land++;
                if (cell.building === 'town') towns++;
                if (cell.building === 'gold_mine') mines++;
                if (cell.building === 'farm') farms++;
            }
        }
    }

    return {
        gold: player?.gold ?? 0,
        land,
        towns,
        mines,
        farms
    };
};

const runSingleGame = (
    profileA: AIProfile,
    profileB: AIProfile,
    seed: number,
    options: CliOptions
): MatchResult => {
    return withSeededRandom(seed, (rng) => {
        (GameConfig as any).GRID_WIDTH = options.width;
        (GameConfig as any).GRID_HEIGHT = options.height;

        const players = [
            { id: 'P1', isAI: true, color: GameConfig.COLORS.P1 },
            { id: 'P2', isAI: true, color: GameConfig.COLORS.P2 }
        ];

        const engine = new GameEngine(players, options.mapType, rng);
        (engine as any).triggerAiTurn = () => {};
        engine.ai.setProfileForPlayer('P1', profileA);
        engine.ai.setProfileForPlayer('P2', profileB);

        engine.startGame();

        const maxSteps = options.maxTurns * engine.state.playerOrder.length;
        let steps = 0;
        while (!engine.isGameOver && steps < maxSteps) {
            engine.ai.playTurn();
            steps++;
        }

        const winnerId = engine.state.playerOrder.length === 1 ? engine.state.playerOrder[0] : null;
        const stats: Record<string, PlayerStats> = {
            P1: summarizePlayerStats(engine, 'P1'),
            P2: summarizePlayerStats(engine, 'P2')
        };

        return {
            seed,
            winnerId,
            turns: engine.state.turnCount,
            profiles: { P1: profileA.id, P2: profileB.id },
            stats
        };
    });
};

const buildProfiles = (): AIProfile[] => {
    return [
        { id: 'baseline', label: 'Baseline', weights: {} },
        {
            id: 'aggressive',
            label: 'Aggressive',
            weights: {
                SCORE_ENEMY_LAND: AIConfig.SCORE_ENEMY_LAND * 1.4,
                SCORE_WIN_CONDITION: AIConfig.SCORE_WIN_CONDITION * 1.1,
                SCORE_DEFEND_BASE: AIConfig.SCORE_DEFEND_BASE * 1.1,
                COST_PENALTY_MULTIPLIER: AIConfig.COST_PENALTY_MULTIPLIER * 0.7,
                DEFENSE_THREAT_MULT: DefaultAIWeights.DEFENSE_THREAT_MULT * 0.8
            }
        },
        {
            id: 'economy',
            label: 'Economy',
            weights: {
                SCORE_TOWN: AIConfig.SCORE_TOWN * 1.6,
                SCORE_EXPANSION: AIConfig.SCORE_EXPANSION * 1.4,
                SCORE_LOOKAHEAD_TOWN: AIConfig.SCORE_LOOKAHEAD_TOWN * 1.2,
                COST_PENALTY_MULTIPLIER: AIConfig.COST_PENALTY_MULTIPLIER * 1.2,
                ECONOMY_BASE_INCOME: DefaultAIWeights.ECONOMY_BASE_INCOME * 1.4,
                ECONOMY_FARM_BUILD: DefaultAIWeights.ECONOMY_FARM_BUILD * 1.6,
                ECONOMY_FARM_UPGRADE: DefaultAIWeights.ECONOMY_FARM_UPGRADE * 1.4
            }
        },
        {
            id: 'defensive',
            label: 'Defensive',
            weights: {
                SCORE_DEFEND_BASE: AIConfig.SCORE_DEFEND_BASE * 1.4,
                DEFENSE_BASE_UPGRADE: DefaultAIWeights.DEFENSE_BASE_UPGRADE * 1.4,
                DEFENSE_WALL_BUILD: DefaultAIWeights.DEFENSE_WALL_BUILD * 1.5,
                DEFENSE_WALL_UPGRADE: DefaultAIWeights.DEFENSE_WALL_UPGRADE * 1.3,
                DEFENSE_WATCHTOWER_BUILD: DefaultAIWeights.DEFENSE_WATCHTOWER_BUILD * 1.4,
                DEFENSE_WATCHTOWER_UPGRADE: DefaultAIWeights.DEFENSE_WATCHTOWER_UPGRADE * 1.3,
                DEFENSE_THREAT_MULT: DefaultAIWeights.DEFENSE_THREAT_MULT * 1.4
            }
        },
        {
            id: 'tactical',
            label: 'Tactical',
            weights: {
                SCORE_HILL: AIConfig.SCORE_HILL * 1.5,
                SCORE_BRIDGE: AIConfig.SCORE_BRIDGE * 1.3,
                SCORE_LOOKAHEAD_TOWN: AIConfig.SCORE_LOOKAHEAD_TOWN * 1.5,
                SCORE_LOOKAHEAD_BASE: AIConfig.SCORE_LOOKAHEAD_BASE * 1.5,
                ECONOMY_AURA_BONUS_MULT: DefaultAIWeights.ECONOMY_AURA_BONUS_MULT * 1.2
            }
        },
        {
            id: 'balanced_plus',
            label: 'Balanced Plus',
            weights: {
                SCORE_ENEMY_LAND: AIConfig.SCORE_ENEMY_LAND * 1.1,
                SCORE_TOWN: AIConfig.SCORE_TOWN * 1.2,
                SCORE_LOOKAHEAD_TOWN: AIConfig.SCORE_LOOKAHEAD_TOWN * 1.2,
                ECONOMY_FARM_BUILD: DefaultAIWeights.ECONOMY_FARM_BUILD * 1.2,
                DEFENSE_WALL_BUILD: DefaultAIWeights.DEFENSE_WALL_BUILD * 1.1,
                DEFENSE_THREAT_MULT: DefaultAIWeights.DEFENSE_THREAT_MULT * 1.1
            }
        }
    ];
};

const aggregateSummary = (
    profileId: string,
    opponentId: string,
    matches: MatchResult[]
): Summary => {
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let totalTurns = 0;

    for (const match of matches) {
        if (!match.winnerId) {
            draws++;
        } else if (match.profiles[match.winnerId as 'P1' | 'P2'] === profileId) {
            wins++;
        } else {
            losses++;
        }
        totalTurns += match.turns;
    }

    const decisive = wins + losses;
    const winRate = decisive > 0 ? wins / decisive : 0;

    return {
        profileId,
        opponentId,
        games: matches.length,
        wins,
        losses,
        draws,
        winRate,
        avgTurns: matches.length > 0 ? totalTurns / matches.length : 0
    };
};

const main = () => {
    const options = parseArgs();
    const log = console.log;

    if (options.quiet) {
        console.log = () => {};
    }

    const profiles = buildProfiles();
    const baseline = profiles[0];
    const results: Record<string, MatchResult[]> = {};
    const summaries: Summary[] = [];

    let seedCursor = options.seed;

    for (const profile of profiles.slice(1)) {
        const matches: MatchResult[] = [];

        for (let i = 0; i < options.games; i++) {
            const seedA = seedCursor++;
            const seedB = seedCursor++;
            matches.push(runSingleGame(profile, baseline, seedA, options));
            matches.push(runSingleGame(baseline, profile, seedB, options));
        }

        results[profile.id] = matches;

        const summary = aggregateSummary(profile.id, baseline.id, matches);
        summaries.push(summary);
    }

    const report = {
        timestamp: new Date().toISOString(),
        options,
        profiles,
        defaultWeights: DefaultAIWeights,
        summaries,
        results
    };

    const best = [...summaries].sort((a, b) => {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.wins !== a.wins) return b.wins - a.wins;
        return a.avgTurns - b.avgTurns;
    })[0];

    if (best) {
        (report as any).bestProfileId = best.profileId;
    }

    const stamp = report.timestamp.replace(/[:.]/g, '-');
    const outDir = path.resolve(process.cwd(), options.outDir);
    const outFile = path.join(outDir, `ai_selfplay_${stamp}.json`);

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf-8');

    log(`Selfplay complete. Report: ${outFile}`);
    summaries.forEach((s) => {
        log(
            `${s.profileId} vs ${s.opponentId}: ` +
            `wins=${s.wins}, losses=${s.losses}, draws=${s.draws}, ` +
            `winRate=${(s.winRate * 100).toFixed(1)}%, avgTurns=${s.avgTurns.toFixed(1)}`
        );
    });

    if (best) {
        log(`Best profile: ${best.profileId} (${(best.winRate * 100).toFixed(1)}% win rate)`);
    }
};

main();
