import { GameEngine } from '../src/core/GameEngine';
import { GameConfig } from '../src/core/GameConfig';
import type { MapType } from '../src/core/map/MapGenerator';
import { DefaultAIWeights, type AIProfile, type AIWeights } from '../src/core/ai/AIProfile';

export type TournamentOptions = {
    seed: number;
    matchesPerAi2p: number;
    matchesPerAi4p: number;
    matchesPerAi8p: number;
    maxTurns2p: number;
    maxTurns4p: number;
    maxTurns8p: number;
    winBonus2p: number;
    winBonus4p: number;
    winBonus8p: number;
    mapTypes: MapType[];
    diversityWeight: number;
    quiet: boolean;
};

export type TournamentActiveModes = {
    use2p: boolean;
    use4p: boolean;
    use8p: boolean;
};

export type Individual = {
    profile: AIProfile;
    games: number;
    wins: number;
    decisiveGames: number;
    games2p: number;
    games4p: number;
    games8p: number;
    wins2p: number;
    wins4p: number;
    wins8p: number;
    decisiveGames2p: number;
    decisiveGames4p: number;
    decisiveGames8p: number;
    totalPoints: number;
    avgPointsRaw: number;
    avgPointsRaw2p: number;
    avgPointsRaw4p: number;
    avgPointsRaw8p: number;
    avgDecisiveBonus2p: number;
    avgDecisiveBonus4p: number;
    avgDecisiveBonus8p: number;
    avgPointsNorm: number;
    avgPointsNorm2p: number;
    avgPointsNorm4p: number;
    avgPointsNorm8p: number;
    avgTurns: number;
    decisiveRate: number;
    avgDecisiveBonus: number;
    avgDecisiveBonusNorm: number;
    avgDecisiveBonusNorm2p: number;
    avgDecisiveBonusNorm4p: number;
    avgDecisiveBonusNorm8p: number;
};

type MatchResult = {
    seed: number;
    mapType: MapType;
    turns: number;
    profiles: Record<string, string>;
    placements: string[];
    landCounts: Record<string, number>;
    decisiveWin: boolean;
};

type ModeKey = '2p' | '4p' | '8p';

type TournamentMode = {
    key: ModeKey;
    players: number;
    width: number;
    height: number;
    matchesPerAi: number;
    maxTurns: number;
    winBonusMultiplier: number;
};

const DISTANCE_KEYS = Object.keys(DefaultAIWeights) as (keyof AIWeights)[];

export const createSeededRandom = (seed: number) => {
    let t = seed >>> 0;
    return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
};

export const withSeededRandom = <T>(seed: number, fn: (rng: () => number) => T): T => {
    const original = Math.random;
    const rng = createSeededRandom(seed);
    Math.random = rng;
    try {
        return fn(rng);
    } finally {
        Math.random = original;
    }
};

export const getActiveModes = (options: TournamentOptions): TournamentActiveModes => ({
    use2p: options.matchesPerAi2p > 0,
    use4p: options.matchesPerAi4p > 0,
    use8p: options.matchesPerAi8p > 0
});

const getTournamentModes = (options: TournamentOptions): TournamentMode[] => ([
    { key: '2p', players: 2, width: 10, height: 10, matchesPerAi: options.matchesPerAi2p, maxTurns: options.maxTurns2p, winBonusMultiplier: options.winBonus2p },
    { key: '4p', players: 4, width: 15, height: 15, matchesPerAi: options.matchesPerAi4p, maxTurns: options.maxTurns4p, winBonusMultiplier: options.winBonus4p },
    { key: '8p', players: 8, width: 20, height: 20, matchesPerAi: options.matchesPerAi8p, maxTurns: options.maxTurns8p, winBonusMultiplier: options.winBonus8p }
]).filter((mode) => mode.matchesPerAi > 0);

const calculateDistance = (profile1: AIProfile, profile2: AIProfile): number => {
    const w1 = profile1.weights || {};
    const w2 = profile2.weights || {};
    let distance = 0;
    let count = 0;
    for (const key of DISTANCE_KEYS) {
        const v1 = w1[key] ?? DefaultAIWeights[key];
        const v2 = w2[key] ?? DefaultAIWeights[key];
        const base = DefaultAIWeights[key];
        const normalizedDiff = Math.abs(v1 - v2) / (base || 1);
        distance += normalizedDiff;
        count++;
    }
    return count > 0 ? distance / count : 0;
};

const calculateMinDistance = (profile: AIProfile, selected: Individual[]): number => {
    let minDistance = Infinity;
    for (const other of selected) {
        const distance = calculateDistance(profile, other.profile);
        if (distance < minDistance) {
            minDistance = distance;
        }
    }
    return Number.isFinite(minDistance) ? minDistance : 0;
};

const shuffleProfiles = (profiles: AIProfile[], rng: () => number): AIProfile[] => {
    const shuffled = profiles.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

const gcd = (a: number, b: number): number => {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y !== 0) {
        const t = y;
        y = x % y;
        x = t;
    }
    return x;
};

const getCoprimeStep = (base: number, total: number): number => {
    if (total <= 1) return 1;
    let step = base % total;
    if (step === 0) step = 1;
    while (gcd(step, total) !== 1) {
        step = (step + 1) % total;
        if (step === 0) step = 1;
    }
    return step;
};

const buildRotationGroup = (
    order: AIProfile[],
    groupIndex: number,
    groupSize: number,
    step: number,
    offset: number
): AIProfile[] => {
    const group: AIProfile[] = [];
    const total = order.length;
    if (total === 0) return group;
    const start = (groupIndex * step + offset) % total;
    for (let i = 0; i < groupSize; i++) {
        group.push(order[(start + i) % total]);
    }
    return group;
};

const countLandByPlayer = (grid: { owner: string | null }[][]): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            const owner = grid[r][c].owner;
            if (!owner) continue;
            counts[owner] = (counts[owner] || 0) + 1;
        }
    }
    return counts;
};

const runMatch = (
    profilesByPlayer: Record<string, AIProfile>,
    seed: number,
    mapType: MapType,
    width: number,
    height: number,
    playerCount: number,
    maxTurns: number,
    positionRotation: number = 0
): MatchResult => {
    return withSeededRandom(seed, (rng) => {
        (GameConfig as any).GRID_WIDTH = width;
        (GameConfig as any).GRID_HEIGHT = height;

        const basePlayerIds = Array.from({ length: playerCount }, (_, index) => `P${index + 1}`);
        const rotatedPlayerIds: string[] = [];
        for (let i = 0; i < basePlayerIds.length; i++) {
            const rotatedIndex = (i + positionRotation) % basePlayerIds.length;
            rotatedPlayerIds.push(basePlayerIds[rotatedIndex]);
        }

        const players = rotatedPlayerIds.map((id) => ({
            id,
            isAI: true,
            color: GameConfig.COLORS[id as keyof typeof GameConfig.COLORS]
        }));

        const rotatedProfilesByPlayer: Record<string, AIProfile> = {};
        for (let i = 0; i < rotatedPlayerIds.length; i++) {
            const rotatedPlayerId = rotatedPlayerIds[i];
            const originalPositionIndex = (i - positionRotation + basePlayerIds.length) % basePlayerIds.length;
            const originalPlayerId = basePlayerIds[originalPositionIndex];
            rotatedProfilesByPlayer[rotatedPlayerId] = profilesByPlayer[originalPlayerId];
        }

        const engine = new GameEngine(players, mapType, rng, { randomizeAiProfiles: false });
        (engine as any).triggerAiTurn = () => {};
        engine.setAiProfiles(rotatedProfilesByPlayer);
        engine.startGame();

        const maxSteps = maxTurns * engine.state.playerOrder.length;
        let steps = 0;
        let lastOrder = [...engine.state.playerOrder];
        const eliminationOrder: string[] = [];
        while (!engine.isGameOver && steps < maxSteps) {
            engine.ai.playTurn();
            const currentOrder = [...engine.state.playerOrder];
            const eliminated = lastOrder.filter((id) => !currentOrder.includes(id));
            for (const id of eliminated) {
                eliminationOrder.push(id);
            }
            lastOrder = currentOrder;
            steps++;
        }

        const profiles: Record<string, string> = {};
        for (const player of players) {
            const profile = rotatedProfilesByPlayer[player.id];
            profiles[player.id] = profile?.id ?? 'baseline';
        }

        const landCounts = countLandByPlayer(engine.state.grid);
        const survivors = [...engine.state.playerOrder];
        let survivorOrder = survivors;

        if (!engine.isGameOver && steps >= maxSteps && survivors.length > 1) {
            const orderIndex = new Map<string, number>();
            survivors.forEach((id, index) => orderIndex.set(id, index));
            survivorOrder = survivors.slice().sort((a, b) => {
                const landA = landCounts[a] ?? 0;
                const landB = landCounts[b] ?? 0;
                if (landB !== landA) return landB - landA;
                return (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0);
            });
        }

        const placements: string[] = [];
        placements.push(...survivorOrder);
        placements.push(...eliminationOrder.reverse());

        const winnerId = placements[0];
        const decisiveWin = engine.isGameOver && winnerId !== undefined;

        return {
            seed,
            mapType,
            turns: engine.state.turnCount,
            profiles,
            placements,
            landCounts,
            decisiveWin
        };
    });
};

export const evaluateTournament = (
    profiles: AIProfile[],
    options: TournamentOptions,
    roundIndex: number,
    rng: () => number,
    activeModes: TournamentActiveModes
): {
    results: Individual[];
    mapCounts: Record<string, Record<string, number>>;
    avgMatchMs: Record<ModeKey, number | null>;
    avgMatchTurns: Record<ModeKey, number | null>;
} => {
    const stats = new Map<string, {
        wins: number;
        games: number;
        decisiveGames: number;
        totalTurns: number;
        totalPoints: number;
        totalDecisiveBonus: number;
        totalPoints2p: number;
        totalPoints4p: number;
        totalPoints8p: number;
        wins2p: number;
        wins4p: number;
        wins8p: number;
        decisiveGames2p: number;
        decisiveGames4p: number;
        decisiveGames8p: number;
        totalDecisiveBonus2p: number;
        totalDecisiveBonus4p: number;
        totalDecisiveBonus8p: number;
        games2p: number;
        games4p: number;
        games8p: number;
    }>();
    const mapCounts: Record<string, Record<string, number>> = {};

    for (const profile of profiles) {
        stats.set(profile.id, {
            wins: 0,
            games: 0,
            decisiveGames: 0,
            totalTurns: 0,
            totalPoints: 0,
            totalDecisiveBonus: 0,
            totalPoints2p: 0,
            totalPoints4p: 0,
            totalPoints8p: 0,
            wins2p: 0,
            wins4p: 0,
            wins8p: 0,
            decisiveGames2p: 0,
            decisiveGames4p: 0,
            decisiveGames8p: 0,
            totalDecisiveBonus2p: 0,
            totalDecisiveBonus4p: 0,
            totalDecisiveBonus8p: 0,
            games2p: 0,
            games4p: 0,
            games8p: 0
        });
        mapCounts[profile.id] = {};
        for (const mapType of options.mapTypes) {
            mapCounts[profile.id][mapType] = 0;
        }
    }

    const modes = getTournamentModes(options);
    const modeTotals: Record<ModeKey, number> = { '2p': 0, '4p': 0, '8p': 0 };
    const modeCompleted: Record<ModeKey, number> = { '2p': 0, '4p': 0, '8p': 0 };
    const modeMatchCounts: Record<ModeKey, number> = { '2p': 0, '4p': 0, '8p': 0 };
    const modeMatchMs: Record<ModeKey, number> = { '2p': 0, '4p': 0, '8p': 0 };
    const modeMatchTurns: Record<ModeKey, number> = { '2p': 0, '4p': 0, '8p': 0 };
    for (const mode of modes) {
        const total = profiles.length * mode.matchesPerAi / mode.players;
        modeTotals[mode.key] = total;
        modeCompleted[mode.key] = 0;
    }

    for (const mode of modes) {
        if (profiles.length < mode.players) {
            throw new Error(`Not enough profiles for ${mode.key} (${profiles.length} < ${mode.players}).`);
        }

        const groupCounts = new Map<string, number>();
        for (const profile of profiles) {
            groupCounts.set(profile.id, 0);
        }

        const order = shuffleProfiles(profiles, rng);
        const step = getCoprimeStep(mode.players + 1, order.length);
        const offset = roundIndex % Math.max(1, order.length);

        while ([...groupCounts.values()].some((count) => count < mode.matchesPerAi)) {
            const groupIndex = modeCompleted[mode.key];
            const group = buildRotationGroup(order, groupIndex, mode.players, step, offset);
            const profilesByPlayer: Record<string, AIProfile> = {};
            const playerIds: string[] = [];
            for (let i = 0; i < group.length; i++) {
                const playerId = `P${i + 1}`;
                playerIds.push(playerId);
                profilesByPlayer[playerId] = group[i];
            }
            for (const member of group) {
                groupCounts.set(member.id, (groupCounts.get(member.id) ?? 0) + 1);
            }

            for (let mapIndex = 0; mapIndex < options.mapTypes.length; mapIndex++) {
                const mapType = options.mapTypes[mapIndex];

                for (let rotation = 0; rotation < mode.players; rotation++) {
                    const matchSeed = options.seed
                        + roundIndex * 100000
                        + groupIndex * 1000
                        + mapIndex * 100
                        + rotation * 10
                        + mode.players;
                    const matchStart = Date.now();
                    const result = runMatch(
                        profilesByPlayer,
                        matchSeed,
                        mapType,
                        mode.width,
                        mode.height,
                        mode.players,
                        mode.maxTurns,
                        rotation
                    );
                    modeMatchCounts[mode.key] += 1;
                    modeMatchMs[mode.key] += Date.now() - matchStart;
                    const matchTurns = result.decisiveWin ? result.turns : mode.maxTurns;
                    modeMatchTurns[mode.key] += matchTurns;

                    const totalPlayers = playerIds.length;
                    const winnerId = result.placements[0];
                    const winBonus = result.decisiveWin
                        ? Math.max(0, (mode.maxTurns - result.turns) / mode.maxTurns) * mode.winBonusMultiplier
                        : 0;

                    for (let i = 0; i < result.placements.length; i++) {
                        const playerId = result.placements[i];
                        const profileId = result.profiles[playerId];
                        const stat = stats.get(profileId);
                        if (stat) {
                            let points = Math.max(0, totalPlayers - 1 - i);
                            if (playerId === winnerId && winBonus > 0) {
                                points += winBonus;
                                stat.totalDecisiveBonus += winBonus;
                                if (mode.key === '2p') stat.totalDecisiveBonus2p += winBonus;
                                if (mode.key === '4p') stat.totalDecisiveBonus4p += winBonus;
                                if (mode.key === '8p') stat.totalDecisiveBonus8p += winBonus;
                            }
                            stat.totalPoints += points;
                            if (mode.key === '2p') stat.totalPoints2p += points;
                            if (mode.key === '4p') stat.totalPoints4p += points;
                            if (mode.key === '8p') stat.totalPoints8p += points;
                            if (i === 0) {
                                stat.wins++;
                                if (mode.key === '2p') stat.wins2p++;
                                if (mode.key === '4p') stat.wins4p++;
                                if (mode.key === '8p') stat.wins8p++;
                            }
                        }
                    }

                    const originalToProfileMap: Record<string, string> = {};
                    for (let i = 0; i < playerIds.length; i++) {
                        const rotatedPositionIndex = (i - rotation + playerIds.length) % playerIds.length;
                        const rotatedPlayerId = `P${rotatedPositionIndex + 1}`;
                        originalToProfileMap[playerIds[i]] = result.profiles[rotatedPlayerId];
                    }

                    for (const playerId of playerIds) {
                        const profileId = originalToProfileMap[playerId] || result.profiles[playerId];
                        const stat = stats.get(profileId);
                        if (stat) {
                            stat.games++;
                            stat.totalTurns += result.turns;
                            if (result.decisiveWin) {
                                stat.decisiveGames++;
                            }
                            if (mode.key === '2p') stat.games2p++;
                            if (mode.key === '4p') stat.games4p++;
                            if (mode.key === '8p') stat.games8p++;
                            if (result.decisiveWin) {
                                if (mode.key === '2p') stat.decisiveGames2p++;
                                if (mode.key === '4p') stat.decisiveGames4p++;
                                if (mode.key === '8p') stat.decisiveGames8p++;
                            }
                        }
                        mapCounts[profileId][mapType] = (mapCounts[profileId][mapType] || 0) + 1;
                    }
                }
            }

            modeCompleted[mode.key] += 1;
            const totalCompleted = Object.values(modeCompleted).reduce((sum, value) => sum + value, 0);
            if (!options.quiet && totalCompleted % 5 === 0) {
                const m2 = activeModes.use2p ? `${modeCompleted['2p']}/${Math.ceil(modeTotals['2p'])}` : '-';
                const m4 = activeModes.use4p ? `${modeCompleted['4p']}/${Math.ceil(modeTotals['4p'])}` : '-';
                const m8 = activeModes.use8p ? `${modeCompleted['8p']}/${Math.ceil(modeTotals['8p'])}` : '-';
                process.stdout.write(`\rRound ${roundIndex + 1}: m2 ${m2} | m4 ${m4} | m8 ${m8} groups...`);
            }
        }
    }

    if (!options.quiet) {
        process.stdout.write('\r' + ' '.repeat(60) + '\r');
    }

    const avgMatchMs: Record<ModeKey, number | null> = {
        '2p': modeMatchCounts['2p'] > 0 ? modeMatchMs['2p'] / modeMatchCounts['2p'] : null,
        '4p': modeMatchCounts['4p'] > 0 ? modeMatchMs['4p'] / modeMatchCounts['4p'] : null,
        '8p': modeMatchCounts['8p'] > 0 ? modeMatchMs['8p'] / modeMatchCounts['8p'] : null
    };
    const avgMatchTurns: Record<ModeKey, number | null> = {
        '2p': modeMatchCounts['2p'] > 0 ? modeMatchTurns['2p'] / modeMatchCounts['2p'] : null,
        '4p': modeMatchCounts['4p'] > 0 ? modeMatchTurns['4p'] / modeMatchCounts['4p'] : null,
        '8p': modeMatchCounts['8p'] > 0 ? modeMatchTurns['8p'] / modeMatchCounts['8p'] : null
    };

    const results: Individual[] = profiles.map((profile) => {
        const stat = stats.get(profile.id)!;
        const avgPointsRaw = stat.games > 0 ? stat.totalPoints / stat.games : 0;
        const avgPointsRaw2p = stat.games2p > 0 ? stat.totalPoints2p / stat.games2p : 0;
        const avgPointsRaw4p = stat.games4p > 0 ? stat.totalPoints4p / stat.games4p : 0;
        const avgPointsRaw8p = stat.games8p > 0 ? stat.totalPoints8p / stat.games8p : 0;
        const avgDecisiveBonus2p = stat.games2p > 0 ? stat.totalDecisiveBonus2p / stat.games2p : 0;
        const avgDecisiveBonus4p = stat.games4p > 0 ? stat.totalDecisiveBonus4p / stat.games4p : 0;
        const avgDecisiveBonus8p = stat.games8p > 0 ? stat.totalDecisiveBonus8p / stat.games8p : 0;
        const avgTurns = stat.games > 0 ? stat.totalTurns / stat.games : 0;
        const decisiveRate = stat.games > 0 ? stat.decisiveGames / stat.games : 0;
        const avgDecisiveBonus = stat.games > 0 ? stat.totalDecisiveBonus / stat.games : 0;
        return {
            profile,
            games: stat.games,
            wins: stat.wins,
            decisiveGames: stat.decisiveGames,
            games2p: stat.games2p,
            games4p: stat.games4p,
            games8p: stat.games8p,
            wins2p: stat.wins2p,
            wins4p: stat.wins4p,
            wins8p: stat.wins8p,
            decisiveGames2p: stat.decisiveGames2p,
            decisiveGames4p: stat.decisiveGames4p,
            decisiveGames8p: stat.decisiveGames8p,
            totalPoints: stat.totalPoints,
            avgPointsRaw,
            avgPointsRaw2p,
            avgPointsRaw4p,
            avgPointsRaw8p,
            avgDecisiveBonus2p,
            avgDecisiveBonus4p,
            avgDecisiveBonus8p,
            avgPointsNorm: 0,
            avgPointsNorm2p: 0,
            avgPointsNorm4p: 0,
            avgPointsNorm8p: 0,
            avgTurns,
            decisiveRate,
            avgDecisiveBonus,
            avgDecisiveBonusNorm: 0,
            avgDecisiveBonusNorm2p: 0,
            avgDecisiveBonusNorm4p: 0,
            avgDecisiveBonusNorm8p: 0
        };
    });

    return { results, mapCounts, avgMatchMs, avgMatchTurns };
};

export const rankResults = (
    results: Individual[],
    rng: () => number,
    diversityWeight: number,
    activeModes: TournamentActiveModes
): { ranked: Individual[]; diversityById: Map<string, number> } => {
    const pool = results.slice();
    const avgPoints2p = pool.map((ind) => ind.avgPointsRaw2p);
    const avgPoints4p = pool.map((ind) => ind.avgPointsRaw4p);
    const avgPoints8p = pool.map((ind) => ind.avgPointsRaw8p);
    const mean2p = avgPoints2p.reduce((sum, value) => sum + value, 0) / Math.max(avgPoints2p.length, 1);
    const mean4p = avgPoints4p.reduce((sum, value) => sum + value, 0) / Math.max(avgPoints4p.length, 1);
    const mean8p = avgPoints8p.reduce((sum, value) => sum + value, 0) / Math.max(avgPoints8p.length, 1);
    const var2p = avgPoints2p.reduce((sum, value) => sum + Math.pow(value - mean2p, 2), 0) / Math.max(avgPoints2p.length, 1);
    const var4p = avgPoints4p.reduce((sum, value) => sum + Math.pow(value - mean4p, 2), 0) / Math.max(avgPoints4p.length, 1);
    const var8p = avgPoints8p.reduce((sum, value) => sum + Math.pow(value - mean8p, 2), 0) / Math.max(avgPoints8p.length, 1);
    const std2p = Math.sqrt(var2p);
    const std4p = Math.sqrt(var4p);
    const std8p = Math.sqrt(var8p);
    for (const candidate of pool) {
        candidate.avgPointsNorm2p = std2p > 1e-6 ? (candidate.avgPointsRaw2p - mean2p) / std2p : 0;
        candidate.avgPointsNorm4p = std4p > 1e-6 ? (candidate.avgPointsRaw4p - mean4p) / std4p : 0;
        candidate.avgPointsNorm8p = std8p > 1e-6 ? (candidate.avgPointsRaw8p - mean8p) / std8p : 0;
        const normParts = [
            activeModes.use2p ? candidate.avgPointsNorm2p : null,
            activeModes.use4p ? candidate.avgPointsNorm4p : null,
            activeModes.use8p ? candidate.avgPointsNorm8p : null
        ].filter((value): value is number => value !== null);
        candidate.avgPointsNorm = normParts.length > 0
            ? normParts.reduce((sum, value) => sum + value, 0) / normParts.length
            : 0;
        const bonus2p = std2p > 1e-6 ? candidate.avgDecisiveBonus2p / std2p : 0;
        const bonus4p = std4p > 1e-6 ? candidate.avgDecisiveBonus4p / std4p : 0;
        const bonus8p = std8p > 1e-6 ? candidate.avgDecisiveBonus8p / std8p : 0;
        candidate.avgDecisiveBonusNorm2p = bonus2p;
        candidate.avgDecisiveBonusNorm4p = bonus4p;
        candidate.avgDecisiveBonusNorm8p = bonus8p;
        const bonusParts = [
            activeModes.use2p ? bonus2p : null,
            activeModes.use4p ? bonus4p : null,
            activeModes.use8p ? bonus8p : null
        ].filter((value): value is number => value !== null);
        candidate.avgDecisiveBonusNorm = bonusParts.length > 0
            ? bonusParts.reduce((sum, value) => sum + value, 0) / bonusParts.length
            : 0;
    }
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    pool.sort((a, b) => {
        if (b.avgPointsNorm !== a.avgPointsNorm) return b.avgPointsNorm - a.avgPointsNorm;
        if (b.wins !== a.wins) return b.wins - a.wins;
        return a.avgTurns - b.avgTurns;
    });

    const ranked: Individual[] = [];
    const diversityById = new Map<string, number>();
    if (pool.length === 0) return { ranked, diversityById };

    ranked.push(pool.shift()!);
    diversityById.set(ranked[0].profile.id, 0);

    while (pool.length > 0) {
        let bestIndex = 0;
        let bestScore = -Infinity;
        let bestDistance = 0;
        for (let i = 0; i < pool.length; i++) {
            const candidate = pool[i];
            const minDistance = calculateMinDistance(candidate.profile, ranked);
            const score = candidate.avgPointsNorm + diversityWeight * minDistance;
            if (score > bestScore) {
                bestScore = score;
                bestIndex = i;
                bestDistance = minDistance;
            }
        }
        const next = pool.splice(bestIndex, 1)[0];
        ranked.push(next);
        diversityById.set(next.profile.id, bestDistance);
    }

    return { ranked, diversityById };
};
