import fs from 'node:fs';
import path from 'path';
import type { MapType } from '../src/core/map/MapGenerator';
import {
    DefaultAIWeights,
    DefaultAIProfile,
    RandomAiProfiles,
    type AIProfile,
    type AIWeights
} from '../src/core/ai/AIProfile';
import { assignProfileLabels } from './ai_profile_label';
import { writeEvolvedProfilesToSource } from './ai_profile_writer';
import {
    createSeededRandom,
    evaluateTournament,
    getActiveModes,
    rankResults,
    type TournamentOptions
} from './ai_tournament_lib';
import { qualifiesCandidate } from './ai_qualifier';

type CliOptions = TournamentOptions & {
    rounds: number;
    baseVariantRange: number;
    defaultVariantRange: number;
    diversityMaxAttempts: number;
    qualifierMapRefreshEvery: number;
    outDir: string;
    writeProfile: boolean;
};

const MUTATION_KEYS = Object.keys(DefaultAIWeights) as (keyof AIWeights)[];

const parseArgs = (): CliOptions => {
    const args = process.argv.slice(2);
    const options: CliOptions = {
        seed: Date.now(),
        rounds: 3,
        matchesPerAi2p: 5,
        matchesPerAi4p: 3,
        matchesPerAi8p: 2,
        maxTurns2p: 50,
        maxTurns4p: 100,
        maxTurns8p: 150,
        winBonus2p: 1,
        winBonus4p: 2,
        winBonus8p: 4,
        mapTypes: ['default', 'archipelago', 'pangaea', 'mountains', 'rivers'],
        baseVariantRange: 0.1,
        defaultVariantRange: 0.4,
        diversityMaxAttempts: 500,
        qualifierMapRefreshEvery: 10,
        diversityWeight: 0.1,
        outDir: 'reports',
        quiet: false,
        writeProfile: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];
        switch (arg) {
            case '--seed':
                options.seed = parseInt(next, 10);
                i++;
                break;
            case '--rounds':
                options.rounds = Math.max(1, parseInt(next, 10));
                i++;
                break;
            case '--m2':
                options.matchesPerAi2p = Math.max(0, parseInt(next, 10));
                i++;
                break;
            case '--m4':
                options.matchesPerAi4p = Math.max(0, parseInt(next, 10));
                i++;
                break;
            case '--m8':
                options.matchesPerAi8p = Math.max(0, parseInt(next, 10));
                i++;
                break;
            case '--t2':
                options.maxTurns2p = parseInt(next, 10);
                i++;
                break;
            case '--t4':
                options.maxTurns4p = parseInt(next, 10);
                i++;
                break;
            case '--t8':
                options.maxTurns8p = parseInt(next, 10);
                i++;
                break;
            case '--maps':
                options.mapTypes = next.split(',').map((t) => t.trim()).filter(Boolean) as MapType[];
                i++;
                break;
            case '--base-range':
                options.baseVariantRange = parseFloat(next);
                i++;
                break;
            case '--default-range':
                options.defaultVariantRange = parseFloat(next);
                i++;
                break;
            case '--diversity-tries':
                options.diversityMaxAttempts = Math.max(1, parseInt(next, 10));
                i++;
                break;
            case '--qualifier-map-refresh':
                options.qualifierMapRefreshEvery = Math.max(1, parseInt(next, 10));
                i++;
                break;
            case '--diversity-weight':
                options.diversityWeight = parseFloat(next);
                i++;
                break;
            case '--b2':
                options.winBonus2p = parseFloat(next);
                i++;
                break;
            case '--b4':
                options.winBonus4p = parseFloat(next);
                i++;
                break;
            case '--b8':
                options.winBonus8p = parseFloat(next);
                i++;
                break;
            case '--out':
                options.outDir = next;
                i++;
                break;
            case '--write-profile':
                options.writeProfile = true;
                if (!options.quiet) {
                    console.log('✓ --write-profile flag detected');
                }
                break;
            case '--quiet':
                options.quiet = true;
                break;
            case '--verbose':
                options.quiet = false;
                break;
            default:
                break;
        }
    }

    return options;
};

const clampPositive = (value: number) => Math.max(0.01, value);

const cloneProfile = (profile: AIProfile, id: string): AIProfile => {
    return {
        id,
        label: profile.label,
        weights: profile.weights ? { ...profile.weights } : undefined
    };
};

const createVariantProfile = (baseProfile: AIProfile, rng: () => number, mutationRange: number, id: string): AIProfile => {
    const baseWeights: Partial<AIWeights> = {
        ...DefaultAIWeights,
        ...(baseProfile.weights || {})
    };
    const weights: Partial<AIWeights> = {};
    for (const key of MUTATION_KEYS) {
        const base = baseWeights[key] ?? DefaultAIWeights[key];
        const delta = (rng() * 2 - 1) * mutationRange;
        const next = clampPositive(base * (1 + delta));
        weights[key] = Math.round(next * 1000) / 1000;
    }
    return {
        id,
        label: baseProfile.label,
        weights
    };
};

const buildQualifiedVariant = (
    baseProfile: AIProfile,
    baseIndex: number,
    variantIndex: number,
    rng: () => number,
    options: CliOptions,
    roundIndex: number,
    mapSeedBase: number
): AIProfile => {
    const progressEvery = 25;
    const refreshEvery = options.qualifierMapRefreshEvery;
    for (let attempt = 1; attempt <= options.diversityMaxAttempts; attempt++) {
        const candidate = createVariantProfile(
            baseProfile,
            rng,
            options.baseVariantRange,
            `round_${roundIndex}_var_${baseIndex + 1}_${variantIndex}_${attempt}`
        );
        const aiSeedBase = options.seed + roundIndex * 100000 + baseIndex * 10000 + variantIndex * 1000 + attempt * 10;
        const mapBlock = Math.floor((attempt - 1) / refreshEvery);
        const qualifierSeedBase = mapSeedBase + mapBlock * 100;
        const qualified = qualifiesCandidate(candidate, baseProfile, options.mapTypes, qualifierSeedBase, aiSeedBase);
        if (qualified) {
            if (!options.quiet) {
                console.log(`Round ${roundIndex + 1} variant: base ${baseIndex + 1} variant ${variantIndex} qualified after ${attempt} tries.`);
            }
            return candidate;
        }
        if (!options.quiet && attempt % progressEvery === 0) {
            console.log(`Round ${roundIndex + 1} variant: base ${baseIndex + 1} variant ${variantIndex} ${attempt} tries, no qualifier yet.`);
        }
    }

    if (!options.quiet) {
        console.warn(`Round ${roundIndex + 1} variant: base ${baseIndex + 1} variant ${variantIndex} failed to qualify within ${options.diversityMaxAttempts} tries.`);
    }
    return cloneProfile(baseProfile, `round_${roundIndex}_base_${baseIndex + 1}_fallback_${variantIndex}`);
};

const generateDiversityProfiles = (
    baseProfiles: AIProfile[],
    rng: () => number,
    options: CliOptions,
    roundIndex: number
): AIProfile[] => {
    const diversity: AIProfile[] = [];
    const baseDefaultProfile: AIProfile = {
        id: 'diversity_base',
        label: 'Default',
        weights: {}
    };
    let attemptsUsed = 0;
    const progressEvery = 25;
    const refreshEvery = options.qualifierMapRefreshEvery;
    for (let baseIndex = 0; baseIndex < 4; baseIndex++) {
        const opponent = baseProfiles[baseIndex] ?? DefaultAIProfile;
        let qualified = false;
        for (let attempt = 1; attempt <= options.diversityMaxAttempts; attempt++) {
            attemptsUsed += 1;
            const candidate = createVariantProfile(
                baseDefaultProfile,
                rng,
                options.defaultVariantRange,
                `round_${roundIndex}_default_${baseIndex + 1}_${attempt}`
            );
            const aiSeedBase = options.seed + roundIndex * 100000 + baseIndex * 10000 + attempt * 10;
            const mapBlock = Math.floor((attempt - 1) / refreshEvery);
            const qualifierSeedBase = options.seed + roundIndex * 100000 + baseIndex * 10000 + mapBlock * 100;
            if (qualifiesCandidate(candidate, opponent, options.mapTypes, qualifierSeedBase, aiSeedBase)) {
                diversity.push(candidate);
                qualified = true;
                if (!options.quiet) {
                    console.log(`Round ${roundIndex + 1} default AI: found qualifier vs base ${baseIndex + 1} after ${attempt} tries.`);
                }
                break;
            }
            if (!options.quiet && attempt % progressEvery === 0) {
                console.log(`Round ${roundIndex + 1} default AI: base ${baseIndex + 1} ${attempt} tries, no qualifier yet.`);
            }
        }
        if (!qualified && !options.quiet) {
            console.warn(`Round ${roundIndex + 1} default AI: base ${baseIndex + 1} failed to qualify within ${options.diversityMaxAttempts} tries.`);
        }
    }

    if (diversity.length < 4) {
        if (attemptsUsed >= options.diversityMaxAttempts * 4) {
            console.warn(`Reached default AI max attempts (${options.diversityMaxAttempts}) per base with only ${diversity.length} qualified.`);
        }
        const missing = 4 - diversity.length;
        if (!options.quiet) {
            console.warn(`Only ${diversity.length} default AI qualified. Filling ${missing} with defaults.`);
        }
        for (let i = 0; i < missing; i++) {
            diversity.push(createVariantProfile(baseDefaultProfile, rng, options.defaultVariantRange, `round_${roundIndex}_default_${i + 1}`));
        }
    }

    return diversity;
};

const buildRoundProfiles = (baseProfiles: AIProfile[], rng: () => number, options: CliOptions, roundIndex: number): AIProfile[] => {
    const bases: AIProfile[] = [];
    for (let i = 0; i < 4; i++) {
        bases.push(baseProfiles[i] ?? DefaultAIProfile);
    }

    const profiles: AIProfile[] = [];
    bases.forEach((base, index) => {
        profiles.push(cloneProfile(base, `round_${roundIndex}_base_${index + 1}`));
        const mapSeedBase = options.seed + roundIndex * 100000 + index * 10000;
        profiles.push(buildQualifiedVariant(base, index, 1, rng, options, roundIndex, mapSeedBase));
        profiles.push(buildQualifiedVariant(base, index, 2, rng, options, roundIndex, mapSeedBase));
    });

    const diversity = generateDiversityProfiles(bases, rng, options, roundIndex);
    profiles.push(...diversity);

    return profiles;
};


/* Tournament scoring extracted to ai_tournament_lib.ts
const evaluateRound = (
    profiles: AIProfile[],
    options: CliOptions,
    roundIndex: number,
    rng: () => number
): { results: Individual[]; mapCounts: Record<string, Record<string, number>> } => {
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

    type ModeKey = '2p' | '4p' | '8p';
    const modes: Array<{
        key: ModeKey;
        players: number;
        width: number;
        height: number;
        matchesPerAi: number;
        maxTurns: number;
        winBonusMultiplier: number;
    }> = [
        { key: '2p', players: 2, width: 10, height: 10, matchesPerAi: options.matchesPerAi2p, maxTurns: options.maxTurns2p, winBonusMultiplier: options.winBonus2p },
        { key: '4p', players: 4, width: 15, height: 15, matchesPerAi: options.matchesPerAi4p, maxTurns: options.maxTurns4p, winBonusMultiplier: options.winBonus4p },
        { key: '8p', players: 8, width: 20, height: 20, matchesPerAi: options.matchesPerAi8p, maxTurns: options.maxTurns8p, winBonusMultiplier: options.winBonus8p }
    ].filter((mode) => mode.matchesPerAi > 0);

    const activeModes = getActiveModes(options);
    if (!activeModes.use2p && !activeModes.use4p && !activeModes.use8p) {
        console.error('No match modes enabled. Set at least one of --m2/--m4/--m8 to a value greater than 0.');
        process.exit(1);
    }
    if (!activeModes.use2p && !activeModes.use4p && !activeModes.use8p) {
        console.error('No match modes enabled. Set at least one of --m2/--m4/--m8 to a value greater than 0.');
        process.exit(1);
    }

    const modeTotals: Record<ModeKey, number> = { '2p': 0, '4p': 0, '8p': 0 };
    const modeCompleted: Record<ModeKey, number> = { '2p': 0, '4p': 0, '8p': 0 };
    for (const mode of modes) {
        const total = profiles.length * mode.matchesPerAi / mode.players;
        modeTotals[mode.key] = total;
        modeCompleted[mode.key] = 0;
    }

    for (const mode of modes) {
        const groupCounts = new Map<string, number>();
        for (const profile of profiles) {
            groupCounts.set(profile.id, 0);
        }

        while ([...groupCounts.values()].some((count) => count < mode.matchesPerAi)) {
            const group = selectGroup(profiles, groupCounts, rng, mode.players);
            const profilesByPlayer: Record<string, AIProfile> = {};
            const playerIds: string[] = [];
            for (let i = 0; i < group.length; i++) {
                const playerId = `P${i + 1}`;
                playerIds.push(playerId);
                profilesByPlayer[playerId] = group[i];
            }

            const groupIndex = modeCompleted[mode.key];

            for (let mapIndex = 0; mapIndex < options.mapTypes.length; mapIndex++) {
                const mapType = options.mapTypes[mapIndex];

                for (let rotation = 0; rotation < mode.players; rotation++) {
                    const matchSeed = options.seed
                        + roundIndex * 100000
                        + groupIndex * 1000
                        + mapIndex * 100
                        + rotation * 10
                        + mode.players;
                    const result = runMatch(
                        profilesByPlayer,
                        matchSeed,
                        mapType,
                        mode.width,
                        mode.height,
                        mode.players,
                        mode.maxTurns,
                        options,
                        rotation
                    );

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

            for (const member of group) {
                groupCounts.set(member.id, (groupCounts.get(member.id) ?? 0) + 1);
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

    return { results, mapCounts };
};

// Label logic moved to scripts/ai_profile_label.ts

const rankResults = (
    results: Individual[],
    rng: () => number,
    diversityWeight: number,
    activeModes: { use2p: boolean; use4p: boolean; use8p: boolean }
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

*/
// Profile writer moved to scripts/ai_profile_writer.ts

const main = async () => {
    const options = parseArgs();

    if (!fs.existsSync(options.outDir)) {
        fs.mkdirSync(options.outDir, { recursive: true });
    }

    if (!options.mapTypes.length) {
        options.mapTypes = ['default'];
    }

    const startTime = Date.now();
    const baseProfiles = RandomAiProfiles.length
        ? RandomAiProfiles.slice(0, 4)
        : [DefaultAIProfile, DefaultAIProfile, DefaultAIProfile, DefaultAIProfile];
    let currentBases = baseProfiles.map((profile, index) => cloneProfile(profile, `base_${index + 1}`));
    const roundReports: any[] = [];

    if (!options.quiet) {
        console.log('=== AI Evolution (Round-Based) ===');
        console.log(`Rounds: ${options.rounds}, Matches per AI: 2p=${options.matchesPerAi2p}, 4p=${options.matchesPerAi4p}, 8p=${options.matchesPerAi8p}`);
        console.log(`Max turns: 2p=${options.maxTurns2p}, 4p=${options.maxTurns4p}, 8p=${options.maxTurns8p}`);
        console.log(`Maps: ${options.mapTypes.join(', ')}`);
    }

    const activeModes = {
        use2p: options.matchesPerAi2p > 0,
        use4p: options.matchesPerAi4p > 0,
        use8p: options.matchesPerAi8p > 0
    };

    for (let round = 0; round < options.rounds; round++) {
        const rng = createSeededRandom(options.seed + round * 100000);
        const participants = buildRoundProfiles(currentBases, rng, options, round);
        if (!options.quiet) {
            console.log(`\nRound ${round + 1}: ${participants.length} profiles`);
        }
        const { results, mapCounts, avgMatchMs, avgMatchTurns, avgMatchTurnsByMap } = evaluateTournament(participants, options, round, rng, activeModes);
        const { ranked, diversityById } = rankResults(results, rng, options.diversityWeight, activeModes);
        const top4 = ranked.slice(0, 4);

        if (!options.quiet) {
            const formatAvg = (key: '2p' | '4p' | '8p') => {
                const value = avgMatchMs[key];
                return value !== null ? `${Math.round(value)}ms` : '-';
            };
            const formatTurns = (key: '2p' | '4p' | '8p') => {
                const value = avgMatchTurns[key];
                return value !== null ? value.toFixed(1) : '-';
            };
            console.log(`Round ${round + 1} Results:`);
            console.log(`  AvgMatchMs: ${activeModes.use2p ? formatAvg('2p') : '-'},${activeModes.use4p ? formatAvg('4p') : '-'},${activeModes.use8p ? formatAvg('8p') : '-'}`);
            console.log(`  AvgMatchTurns: ${activeModes.use2p ? formatTurns('2p') : '-'},${activeModes.use4p ? formatTurns('4p') : '-'},${activeModes.use8p ? formatTurns('8p') : '-'}`);
            if (options.mapTypes.length) {
                const formatMapTurns = (key: '2p' | '4p' | '8p') => {
                    if (!activeModes[`use${key}` as 'use2p' | 'use4p' | 'use8p']) return '-';
                    return options.mapTypes
                        .map((map) => {
                            const value = avgMatchTurnsByMap[key]?.[map];
                            return value !== null && value !== undefined ? `${map}:${value.toFixed(1)}` : `${map}:-`;
                        })
                        .join(' ');
                };
                console.log(`  AvgMatchTurnsByMap: m2 ${formatMapTurns('2p')} | m4 ${formatMapTurns('4p')} | m8 ${formatMapTurns('8p')}`);
            }
            for (let i = 0; i < ranked.length; i++) {
                const ind = ranked[i];
                const winRate = ind.games > 0 ? ind.wins / ind.games : 0;
                const decisiveRate = ind.decisiveRate || 0;
                const diversityScore = diversityById.get(ind.profile.id) ?? 0;
                const normStr = `${activeModes.use2p ? ind.avgPointsNorm2p.toFixed(2) : '-'},${activeModes.use4p ? ind.avgPointsNorm4p.toFixed(2) : '-'},${activeModes.use8p ? ind.avgPointsNorm8p.toFixed(2) : '-'}`;
                const bonusStr = `${activeModes.use2p ? ind.avgDecisiveBonusNorm2p.toFixed(2) : '-'},${activeModes.use4p ? ind.avgDecisiveBonusNorm4p.toFixed(2) : '-'},${activeModes.use8p ? ind.avgDecisiveBonusNorm8p.toFixed(2) : '-'}`;
                const formatRate = (value: number, total: number) => Math.round(total > 0 ? (value / total) * 100 : 0).toString();
                const winStr = `${activeModes.use2p ? formatRate(ind.wins2p, ind.games2p) : '-'},${activeModes.use4p ? formatRate(ind.wins4p, ind.games4p) : '-'},${activeModes.use8p ? formatRate(ind.wins8p, ind.games8p) : '-'}`;
                const decisStr = `${activeModes.use2p ? formatRate(ind.decisiveGames2p, ind.games2p) : '-'},${activeModes.use4p ? formatRate(ind.decisiveGames4p, ind.games4p) : '-'},${activeModes.use8p ? formatRate(ind.decisiveGames8p, ind.games8p) : '-'}`;
                console.log(`  ${i + 1}. ${ind.profile.id} | Norm=${normStr} | Bonus=${bonusStr} | WinRate=${winStr}% | Decisive=${decisStr}% | Diversity=${diversityScore.toFixed(3)}`);
            }
        }

        roundReports.push({
            round: round + 1,
            results: ranked.map((ind) => ({
                profile: {
                    id: ind.profile.id,
                    label: ind.profile.label,
                    weights: ind.profile.weights ? { ...ind.profile.weights } : undefined
                },
                games: ind.games,
                wins: ind.wins,
                decisiveGames: ind.decisiveGames,
                totalPoints: ind.totalPoints,
                avgPoints: ind.avgPointsRaw,
                avgPointsNorm: ind.avgPointsNorm,
                avgPointsNorm2p: ind.avgPointsNorm2p,
                avgPointsNorm4p: ind.avgPointsNorm4p,
                avgPointsNorm8p: ind.avgPointsNorm8p,
                avgDecisiveBonus: ind.avgDecisiveBonus,
                avgDecisiveBonusNorm: ind.avgDecisiveBonusNorm,
                avgTurns: ind.avgTurns,
                decisiveRate: ind.decisiveRate,
                diversityScore: diversityById.get(ind.profile.id) ?? 0
            })),
            mapCounts
        });

        currentBases = top4.map((ind, index) => cloneProfile(ind.profile, `round_${round + 1}_winner_${index + 1}`));
    }

    const finalProfiles = currentBases.map((profile, index) => ({
        id: profile.id,
        label: profile.label,
        weights: profile.weights ? { ...profile.weights } : undefined
    }));

    const profileTimestamp = Date.now();
    const usedLabels = new Set<string>();
    
    // First, collect existing labels from source file if writing profiles
    if (options.writeProfile) {
        const sourcePath = path.join(process.cwd(), 'src', 'core', 'ai', 'AIProfile.ts');
        if (fs.existsSync(sourcePath)) {
            const source = fs.readFileSync(sourcePath, 'utf-8');
            // Extract existing labels from EvolvedProfile definitions
            const labelRegex = /label:\s*['"]([^'"]+)['"]/g;
            let match;
            while ((match = labelRegex.exec(source)) !== null) {
                usedLabels.add(match[1]);
            }
        }
    }
    
    for (let i = 0; i < finalProfiles.length; i++) {
        finalProfiles[i].id = `evolved_${profileTimestamp}_${i + 1}`;
    }

    assignProfileLabels(finalProfiles, { existingLabels: usedLabels });

    // Save results
    const reportTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(options.outDir, `ai_evolve_${reportTimestamp}.json`);
    const report = {
        options,
        rounds: roundReports,
        finalSelected: finalProfiles,
        duration: Date.now() - startTime
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n✅ Report saved to ${reportPath}`);

    if (options.writeProfile) {
        console.log('\n📝 Writing evolved profiles to source file...');
        try {
            writeEvolvedProfilesToSource(finalProfiles);
        } catch (err) {
            console.error('\n❌ Error writing profiles to source:', err);
            throw err;
        }
    } else {
        if (!options.quiet) {
            console.log('\nℹ️  Profiles not written to source (use --write-profile to enable)');
        }
    }
};

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
