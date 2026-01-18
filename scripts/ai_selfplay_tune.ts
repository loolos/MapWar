import fs from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../src/core/GameEngine';
import { GameConfig } from '../src/core/GameConfig';
import type { MapType } from '../src/core/map/MapGenerator';
import { AIConfig } from '../src/core/AIConfig';
import {
    DefaultAIWeights,
    type AIProfile,
    type AIWeights
} from '../src/core/ai/AIProfile';

type CliOptions = {
    samples: number;
    gamesPerSample: number;
    seed: number;
    maxTurns: number;
    mapTypes: MapType[];
    width: number;
    height: number;
    outDir: string;
    quiet: boolean;
    playerCount: number;
    range: number;
    writeProfile: boolean;
};

type MatchResult = {
    seed: number;
    mapType: MapType;
    winnerId: string | null;
    turns: number;
    profiles: Record<string, string>;
};

type Summary = {
    profileId: string;
    games: number;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
    avgTurns: number;
};

const MUTATION_KEYS: (keyof AIWeights)[] = [
    'SCORE_TOWN',
    'SCORE_ENEMY_LAND',
    'SCORE_DISCONNECT_ENEMY',
    'SCORE_DEFEND_BASE',
    'SCORE_HILL',
    'SCORE_BRIDGE',
    'SCORE_EXPANSION',
    'SCORE_AURA_MULTIPLIER',
    'COST_PENALTY_MULTIPLIER',
    'SCORE_LOOKAHEAD_TOWN',
    'SCORE_LOOKAHEAD_BASE',
    'ECONOMY_BASE_INCOME',
    'ECONOMY_BASE_INCOME_LEVEL',
    'ECONOMY_FARM_BUILD',
    'ECONOMY_FARM_UPGRADE',
    'ECONOMY_FARM_LEVEL',
    'ECONOMY_AURA_BONUS_MULT',
    'DEFENSE_BASE_UPGRADE',
    'DEFENSE_WALL_BUILD',
    'DEFENSE_WALL_UPGRADE',
    'DEFENSE_WATCHTOWER_BUILD',
    'DEFENSE_WATCHTOWER_UPGRADE',
    'DEFENSE_THREAT_MULT',
    'RECONNECT_DISCONNECTED_SCORE',
    'STRATEGY_EARLY_EXPANSION_BONUS',
    'STRATEGY_EARLY_FARM_BONUS',
    'STRATEGY_BASE_UPGRADE_BONUS',
    'STRATEGY_WALL_PRIORITY_BONUS'
];

const parseArgs = (): CliOptions => {
    const args = process.argv.slice(2);
    const options: CliOptions = {
        samples: 20,
        gamesPerSample: 30,
        seed: 1,
        maxTurns: 200,
        mapTypes: ['default', 'archipelago', 'pangaea'],
        width: GameConfig.GRID_WIDTH,
        height: GameConfig.GRID_HEIGHT,
        outDir: 'reports',
        quiet: true,
        playerCount: 4,
        range: 0.2,
        writeProfile: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];
        switch (arg) {
            case '--samples':
                options.samples = parseInt(next, 10);
                i++;
                break;
            case '--games-per-sample':
                options.gamesPerSample = parseInt(next, 10);
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
            case '--maps':
                options.mapTypes = next.split(',').map((t) => t.trim()).filter(Boolean) as MapType[];
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
            case '--players':
                options.playerCount = Math.max(2, parseInt(next, 10));
                i++;
                break;
            case '--range':
                options.range = Math.max(0, parseFloat(next));
                i++;
                break;
            case '--write-profile':
                options.writeProfile = true;
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

const buildFixedProfiles = (): AIProfile[] => {
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

const clampPositive = (value: number) => Math.max(0.01, value);

const sampleProfile = (seed: number, range: number, index: number): AIProfile => {
    const rng = createSeededRandom(seed);
    const weights: Partial<AIWeights> = {};

    for (const key of MUTATION_KEYS) {
        const base = DefaultAIWeights[key];
        const delta = (rng() * 2 - 1) * range;
        const next = clampPositive(base * (1 + delta));
        weights[key] = Math.round(next * 1000) / 1000;
    }

    return {
        id: `sample_${String(index).padStart(2, '0')}`,
        label: 'Sampled',
        weights
    };
};

const runMatch = (
    profilesByPlayer: Record<string, AIProfile>,
    seed: number,
    mapType: MapType,
    options: CliOptions
): MatchResult => {
    return withSeededRandom(seed, (rng) => {
        (GameConfig as any).GRID_WIDTH = options.width;
        (GameConfig as any).GRID_HEIGHT = options.height;

        const players = Array.from({ length: options.playerCount }, (_, index) => {
            const id = `P${index + 1}`;
            return {
                id,
                isAI: true,
                color: GameConfig.COLORS[id as keyof typeof GameConfig.COLORS]
            };
        });

        const engine = new GameEngine(players, mapType, rng);
        (engine as any).triggerAiTurn = () => {};
        engine.setAiProfiles(profilesByPlayer);

        engine.startGame();

        const maxSteps = options.maxTurns * engine.state.playerOrder.length;
        let steps = 0;
        while (!engine.isGameOver && steps < maxSteps) {
            engine.ai.playTurn();
            steps++;
        }

        const winnerId = engine.state.playerOrder.length === 1 ? engine.state.playerOrder[0] : null;
        const profiles: Record<string, string> = {};
        for (const player of players) {
            const profile = profilesByPlayer[player.id];
            profiles[player.id] = profile?.id ?? 'baseline';
        }

        return {
            seed,
            mapType,
            winnerId,
            turns: engine.state.turnCount,
            profiles
        };
    });
};

const summarize = (profileId: string, matches: MatchResult[]): Summary => {
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let totalTurns = 0;

    for (const match of matches) {
        if (!match.winnerId) {
            draws++;
        } else if (match.winnerId === 'P1') {
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
        games: matches.length,
        wins,
        losses,
        draws,
        winRate,
        avgTurns: matches.length > 0 ? totalTurns / matches.length : 0
    };
};

const formatWeightsBlock = (weights: Partial<AIWeights>) => {
    const sortedKeys = Object.keys(weights).sort();
    const lines = sortedKeys.map((key) => {
        const value = (weights as Record<string, number>)[key];
        return `        ${key}: ${value}`;
    });
    return lines.join(',\n');
};

const writeProfileToSource = (profile: AIProfile) => {
    const profilePath = path.resolve(process.cwd(), 'src', 'core', 'ai', 'AIProfile.ts');
    const content = fs.readFileSync(profilePath, 'utf-8');
    const start = '// SELFPLAY_TUNED_PROFILE_START';
    const end = '// SELFPLAY_TUNED_PROFILE_END';
    const block = [
        start,
        'export const SelfPlayTunedProfile: AIProfile = {',
        `    id: '${profile.id}',`,
        `    label: '${profile.label ?? 'Selfplay Tuned'}',`,
        '    weights: {',
        formatWeightsBlock(profile.weights ?? {}),
        '    }',
        '};',
        end
    ].join('\n');

    const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
    const next = content.replace(pattern, block);
    fs.writeFileSync(profilePath, next, 'utf-8');
};

const main = () => {
    const options = parseArgs();
    const log = console.log;

    if (options.quiet) {
        console.log = () => {};
    }

    const fixedProfiles = buildFixedProfiles();
    const baseline = fixedProfiles[0];
    const opponentPool = fixedProfiles;

    const candidates: AIProfile[] = [baseline];
    let sampleSeed = options.seed;
    for (let i = 0; i < options.samples; i++) {
        candidates.push(sampleProfile(sampleSeed++, options.range, i + 1));
    }

    const results: Record<string, MatchResult[]> = {};
    const summaries: Summary[] = [];
    let seedCursor = options.seed + 1000;

    for (const candidate of candidates) {
        const matches: MatchResult[] = [];

        for (let i = 0; i < options.gamesPerSample; i++) {
            const mapType = options.mapTypes[i % options.mapTypes.length];
            const profilesByPlayer: Record<string, AIProfile> = {};
            profilesByPlayer.P1 = candidate;

            for (let p = 2; p <= options.playerCount; p++) {
                const opponent = opponentPool[(i + p + seedCursor) % opponentPool.length] ?? baseline;
                profilesByPlayer[`P${p}`] = opponent;
            }

            const seed = seedCursor++;
            matches.push(runMatch(profilesByPlayer, seed, mapType, options));
        }

        results[candidate.id] = matches;
        summaries.push(summarize(candidate.id, matches));
    }

    const best = [...summaries].sort((a, b) => {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.wins !== a.wins) return b.wins - a.wins;
        return a.avgTurns - b.avgTurns;
    })[0];

    const bestProfile = candidates.find((c) => c.id === best?.profileId) ?? baseline;

    const report = {
        timestamp: new Date().toISOString(),
        options,
        opponentPool: opponentPool.map((p) => p.id),
        candidates,
        summaries,
        bestProfile,
        results
    };

    const stamp = report.timestamp.replace(/[:.]/g, '-');
    const outDir = path.resolve(process.cwd(), options.outDir);
    const outFile = path.join(outDir, `ai_selfplay_tune_${stamp}.json`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf-8');

    log(`Selfplay tuning complete. Report: ${outFile}`);
    summaries.forEach((s) => {
        log(
            `${s.profileId}: wins=${s.wins}, losses=${s.losses}, draws=${s.draws}, ` +
            `winRate=${(s.winRate * 100).toFixed(1)}%, avgTurns=${s.avgTurns.toFixed(1)}`
        );
    });

    if (best) {
        log(`Best profile: ${best.profileId} (${(best.winRate * 100).toFixed(1)}% win rate)`);
    }

    if (options.writeProfile && bestProfile) {
        writeProfileToSource({
            ...bestProfile,
            id: 'selfplay_tuned',
            label: 'Selfplay Tuned'
        });
        log('SelfPlayTunedProfile written to AIProfile.ts');
    }

    console.log = log;
};

main();
