import fs from 'node:fs';
import path from 'path';
import { GameEngine } from '../src/core/GameEngine';
import { GameConfig } from '../src/core/GameConfig';
import type { MapType } from '../src/core/map/MapGenerator';
import {
    DefaultAIWeights,
    DefaultAIProfile,
    RandomAiProfiles,
    type AIProfile,
    type AIWeights
} from '../src/core/ai/AIProfile';

type CliOptions = {
    seed: number;
    rounds: number;
    matchesPerAi: number;
    maxTurns: number;
    mapTypes: MapType[];
    width: number;
    height: number;
    playerCount: number;
    mutationRange: number;
    baseVariantRange: number;
    defaultVariantRange: number;
    diversityWeight: number;
    winBonusMultiplier: number;
    outDir: string;
    quiet: boolean;
    writeProfile: boolean;
};

type Individual = {
    profile: AIProfile;
    games: number;
    wins: number;
    decisiveGames: number;
    totalPoints: number;
    avgPointsRaw: number;
    avgTurns: number;
    decisiveRate: number;
    avgDecisiveBonus: number;
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

const MUTATION_KEYS = Object.keys(DefaultAIWeights) as (keyof AIWeights)[];

const parseArgs = (): CliOptions => {
    const args = process.argv.slice(2);
    const options: CliOptions = {
        seed: Date.now(),
        rounds: 3,
        matchesPerAi: 5,
        maxTurns: 200,
        mapTypes: ['default', 'archipelago', 'pangaea'],
        width: 15,
        height: 15,
        playerCount: 4,
        mutationRange: 0.3,
        baseVariantRange: 0.1,
        defaultVariantRange: 0.4,
        diversityWeight: 0.1,
        winBonusMultiplier: 3,
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
            case '--matches-per-ai':
                options.matchesPerAi = Math.max(1, parseInt(next, 10));
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
            case '--players':
                options.playerCount = Math.max(2, parseInt(next, 10));
                i++;
                break;
            case '--mutation-range':
                options.mutationRange = parseFloat(next);
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
            case '--diversity-weight':
                options.diversityWeight = parseFloat(next);
                i++;
                break;
            case '--win-bonus':
                options.winBonusMultiplier = parseFloat(next);
                i++;
                break;
            case '--out':
                options.outDir = next;
                i++;
                break;
            case '--write-profile':
                options.writeProfile = true;
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

const calculateDistance = (profile1: AIProfile, profile2: AIProfile): number => {
    const w1 = profile1.weights || {};
    const w2 = profile2.weights || {};
    let distance = 0;
    let count = 0;
    for (const key of MUTATION_KEYS) {
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
    options: CliOptions,
    positionRotation: number = 0
): MatchResult => {
    return withSeededRandom(seed, (rng) => {
        (GameConfig as any).GRID_WIDTH = options.width;
        (GameConfig as any).GRID_HEIGHT = options.height;

        // Create players array with rotation
        // Rotate player positions so each AI gets to play each starting position
        const basePlayerIds = Array.from({ length: options.playerCount }, (_, index) => `P${index + 1}`);
        const rotatedPlayerIds = [];
        for (let i = 0; i < basePlayerIds.length; i++) {
            const rotatedIndex = (i + positionRotation) % basePlayerIds.length;
            rotatedPlayerIds.push(basePlayerIds[rotatedIndex]);
        }

        const players = rotatedPlayerIds.map((id) => ({
            id,
            isAI: true,
            color: GameConfig.COLORS[id as keyof typeof GameConfig.COLORS]
        }));

        // Create rotated profile mapping: map rotated player ID to original profile
        const rotatedProfilesByPlayer: Record<string, AIProfile> = {};
        for (let i = 0; i < rotatedPlayerIds.length; i++) {
            const rotatedPlayerId = rotatedPlayerIds[i];
            // The profile that should be at position i after rotation
            // is the profile that was originally at position (i - positionRotation + length) % length
            const originalPositionIndex = (i - positionRotation + basePlayerIds.length) % basePlayerIds.length;
            const originalPlayerId = basePlayerIds[originalPositionIndex];
            rotatedProfilesByPlayer[rotatedPlayerId] = profilesByPlayer[originalPlayerId];
        }

        const engine = new GameEngine(players, mapType, rng, { randomizeAiProfiles: false });
        (engine as any).triggerAiTurn = () => {};
        engine.setAiProfiles(rotatedProfilesByPlayer);

        engine.startGame();

        const maxSteps = options.maxTurns * engine.state.playerOrder.length;
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

        // Map rotated player IDs back to original profiles for result tracking
        const profiles: Record<string, string> = {};
        for (const player of players) {
            const profile = rotatedProfilesByPlayer[player.id];
            profiles[player.id] = profile?.id ?? 'baseline';
        }

        const landCounts = countLandByPlayer(engine.state.grid);
        const survivors = [...engine.state.playerOrder];
        let survivorOrder = survivors;

        if (!engine.isGameOver && steps >= maxSteps && survivors.length > 1) {
            // Max turns reached: rank survivors by land count (desc), tie-breaker by current order
            const orderIndex = new Map<string, number>();
            survivors.forEach((id, index) => orderIndex.set(id, index));
            survivorOrder = survivors.slice().sort((a, b) => {
                const landDiff = (landCounts[b] || 0) - (landCounts[a] || 0);
                if (landDiff !== 0) return landDiff;
                return (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0);
            });
        }

        // placements: best -> worst
        const placements = [...survivorOrder, ...eliminationOrder.slice().reverse()];
        const decisiveWin = engine.isGameOver && steps < maxSteps;

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

const buildRoundProfiles = (baseProfiles: AIProfile[], rng: () => number, options: CliOptions, roundIndex: number): AIProfile[] => {
    const bases: AIProfile[] = [];
    for (let i = 0; i < 4; i++) {
        bases.push(baseProfiles[i] ?? DefaultAIProfile);
    }

    const profiles: AIProfile[] = [];
    bases.forEach((base, index) => {
        profiles.push(cloneProfile(base, `round_${roundIndex}_base_${index + 1}`));
        profiles.push(createVariantProfile(base, rng, options.baseVariantRange, `round_${roundIndex}_var_${index + 1}_a`));
        profiles.push(createVariantProfile(base, rng, options.baseVariantRange, `round_${roundIndex}_var_${index + 1}_b`));
    });

    // Create default variants from AIConfig defaults (not from DefaultAIProfile)
    // Use a profile with only DefaultAIWeights (no overrides) as the base
    const baseDefaultProfile: AIProfile = {
        id: 'default_base',
        label: 'Default',
        weights: {} // Empty weights means it will use DefaultAIWeights
    };
    for (let i = 0; i < 4; i++) {
        profiles.push(createVariantProfile(baseDefaultProfile, rng, options.defaultVariantRange, `round_${roundIndex}_default_${i + 1}`));
    }

    return profiles;
};

const selectGroup = (profiles: AIProfile[], groupCounts: Map<string, number>, rng: () => number): AIProfile[] => {
    const shuffled = profiles.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    shuffled.sort((a, b) => (groupCounts.get(a.id) ?? 0) - (groupCounts.get(b.id) ?? 0));
    return shuffled.slice(0, 4);
};

const evaluateRound = (
    profiles: AIProfile[],
    options: CliOptions,
    roundIndex: number,
    rng: () => number
): { results: Individual[]; mapCounts: Record<string, Record<string, number>> } => {
    const stats = new Map<string, { wins: number; games: number; decisiveGames: number; totalTurns: number; totalPoints: number; totalDecisiveBonus: number }>();
    const groupCounts = new Map<string, number>();
    const mapCounts: Record<string, Record<string, number>> = {};

    for (const profile of profiles) {
        stats.set(profile.id, { wins: 0, games: 0, decisiveGames: 0, totalTurns: 0, totalPoints: 0, totalDecisiveBonus: 0 });
        groupCounts.set(profile.id, 0);
        mapCounts[profile.id] = {};
        for (const mapType of options.mapTypes) {
            mapCounts[profile.id][mapType] = 0;
        }
    }

    const totalGroups = profiles.length * options.matchesPerAi / 4;
    let groupsCompleted = 0;

    while ([...groupCounts.values()].some((count) => count < options.matchesPerAi)) {
        const group = selectGroup(profiles, groupCounts, rng);
        const profilesByPlayer: Record<string, AIProfile> = {};
        const playerIds: string[] = [];
        for (let i = 0; i < group.length; i++) {
            const playerId = `P${i + 1}`;
            playerIds.push(playerId);
            profilesByPlayer[playerId] = group[i];
        }

        for (let mapIndex = 0; mapIndex < options.mapTypes.length; mapIndex++) {
            const mapType = options.mapTypes[mapIndex];
            
            // Run 4 matches per map with rotated positions
            for (let rotation = 0; rotation < 4; rotation++) {
                const matchSeed = options.seed + roundIndex * 100000 + groupsCompleted * 1000 + mapIndex * 100 + rotation * 10;
                const result = runMatch(profilesByPlayer, matchSeed, mapType, options, rotation);

                const totalPlayers = playerIds.length;
                const winnerId = result.placements[0];
                const winBonus = result.decisiveWin
                    ? Math.max(0, (options.maxTurns - result.turns) / options.maxTurns) * options.winBonusMultiplier
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
                        }
                        stat.totalPoints += points;
                        if (i === 0) {
                            stat.wins++;
                        }
                    }
                }

                // Map original playerIds to their profileIds after rotation
                // Original player at position i maps to profile at position i
                // After rotation, that profile is at position (i - rotation + 4) % 4
                const originalToProfileMap: Record<string, string> = {};
                for (let i = 0; i < playerIds.length; i++) {
                    // Original player at position i (playerIds[i]) should have profile at position i
                    // After rotation, profile at position i is at rotated position (i - rotation + length) % length
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
                    }
                    mapCounts[profileId][mapType] = (mapCounts[profileId][mapType] || 0) + 1;
                }
            }
        }

        for (const member of group) {
            groupCounts.set(member.id, (groupCounts.get(member.id) ?? 0) + 1);
        }

        groupsCompleted++;
        if (!options.quiet && groupsCompleted % 5 === 0) {
            process.stdout.write(`\rRound ${roundIndex + 1}: ${groupsCompleted}/${totalGroups} groups...`);
        }
    }

    if (!options.quiet) {
        process.stdout.write('\r' + ' '.repeat(60) + '\r');
    }

    const results: Individual[] = profiles.map((profile) => {
        const stat = stats.get(profile.id)!;
        const avgPointsRaw = stat.games > 0 ? stat.totalPoints / stat.games : 0;
        const avgTurns = stat.games > 0 ? stat.totalTurns / stat.games : 0;
        const decisiveRate = stat.games > 0 ? stat.decisiveGames / stat.games : 0;
        const avgDecisiveBonus = stat.games > 0 ? stat.totalDecisiveBonus / stat.games : 0;
        return {
            profile,
            games: stat.games,
            wins: stat.wins,
            decisiveGames: stat.decisiveGames,
            totalPoints: stat.totalPoints,
            avgPointsRaw,
            avgTurns,
            decisiveRate,
            avgDecisiveBonus
        };
    });

    return { results, mapCounts };
};

const generateLabel = (profile: AIProfile): string => {
    const weights = profile.weights || {};
    const defaultWeights = DefaultAIWeights;
    
    // Calculate strategy scores
    const economyScore = (
        (weights.ECONOMY_BASE_INCOME ?? defaultWeights.ECONOMY_BASE_INCOME) / defaultWeights.ECONOMY_BASE_INCOME +
        (weights.ECONOMY_FARM_BUILD ?? defaultWeights.ECONOMY_FARM_BUILD) / defaultWeights.ECONOMY_FARM_BUILD
    ) / 2;
    
    const defenseScore = (
        (weights.DEFENSE_WALL_BUILD ?? defaultWeights.DEFENSE_WALL_BUILD) / defaultWeights.DEFENSE_WALL_BUILD +
        (weights.DEFENSE_BASE_UPGRADE ?? defaultWeights.DEFENSE_BASE_UPGRADE) / defaultWeights.DEFENSE_BASE_UPGRADE
    ) / 2;
    
    const attackScore = (weights.SCORE_ENEMY_LAND ?? defaultWeights.SCORE_ENEMY_LAND) / defaultWeights.SCORE_ENEMY_LAND;
    
    const expansionScore = (weights.SCORE_EXPANSION ?? defaultWeights.SCORE_EXPANSION) / defaultWeights.SCORE_EXPANSION;
    
    const townScore = (weights.SCORE_TOWN ?? defaultWeights.SCORE_TOWN) / defaultWeights.SCORE_TOWN;
    
    // Collect primary characteristics with scores
    const traits: Array<{ name: string; score: number }> = [];
    
    if (townScore > 1.1) traits.push({ name: 'Town', score: townScore });
    if (economyScore > 1.1) traits.push({ name: 'Economy', score: economyScore });
    if (defenseScore > 1.1) traits.push({ name: 'Defense', score: defenseScore });
    if (attackScore > 1.1) traits.push({ name: 'Attack', score: attackScore });
    if (expansionScore > 1.1) traits.push({ name: 'Expansion', score: expansionScore });
    
    // Sort by score (descending)
    traits.sort((a, b) => b.score - a.score);
    
    // Name components
    const nameMap: Record<string, string> = {
        'Town': 'Townsman',
        'Economy': 'Economist',
        'Defense': 'Defender',
        'Attack': 'Raider',
        'Expansion': 'Explorer'
    };
    
    const suffixMap: Record<string, string> = {
        'Town': 'Tact',
        'Economy': 'Miser',
        'Defense': 'Guard',
        'Attack': 'Warrior',
        'Expansion': 'Pioneer'
    };
    
    // Check for special traits
    const hasAura = (weights.SCORE_AURA_MULTIPLIER ?? defaultWeights.SCORE_AURA_MULTIPLIER) > defaultWeights.SCORE_AURA_MULTIPLIER * 1.2;
    const hasWall = (weights.DEFENSE_WALL_BUILD ?? defaultWeights.DEFENSE_WALL_BUILD) > defaultWeights.DEFENSE_WALL_BUILD * 1.2;
    const hasFarm = (weights.ECONOMY_FARM_BUILD ?? defaultWeights.ECONOMY_FARM_BUILD) > defaultWeights.ECONOMY_FARM_BUILD * 1.2;
    const hasStrategic = (weights.SCORE_LOOKAHEAD_TOWN ?? defaultWeights.SCORE_LOOKAHEAD_TOWN) > defaultWeights.SCORE_LOOKAHEAD_TOWN * 1.2;
    
    // Generate name based on traits
    if (traits.length === 0) {
        if (hasStrategic) return 'Strategist';
        return 'Balanced';
    }
    
    // Use profile id hash for deterministic variations
    const idHash = (profile.id || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    if (traits.length === 1) {
        const main = traits[0];
        let name = nameMap[main.name] || main.name;
        
        // Add modifier if needed
        if (hasStrategic && name.length + 4 <= 16) {
            name = 'Smart ' + name;
        } else if (hasAura && name.length <= 12) {
            name = name + ' Aura';
        }
        
        if (name.length <= 16) return name;
        // Fallback to shorter version
        return suffixMap[main.name] || main.name;
    }
    
    // Multiple traits - create compound name
    const primary = traits[0];
    const secondary = traits[1];
    
    // Try combination names (max 16 chars)
    const combinations: string[] = [];
    
    // Primary-Secondary format
    if (primary.name === 'Attack' && secondary.name === 'Defense') combinations.push('Battle Guard', 'Combat Defender');
    else if (primary.name === 'Defense' && secondary.name === 'Attack') combinations.push('Defensive Raid', 'Guard Warrior');
    else if (primary.name === 'Economy' && secondary.name === 'Expansion') combinations.push('Trade Explorer', 'Rich Pioneer');
    else if (primary.name === 'Expansion' && secondary.name === 'Economy') combinations.push('Expanding Econ', 'Growth Trader');
    else if (primary.name === 'Town' && secondary.name === 'Defense') combinations.push('Town Defender', 'Urban Guard');
    else if (primary.name === 'Defense' && secondary.name === 'Town') combinations.push('Defensive Town', 'Guard Tact');
    else if (primary.name === 'Attack' && secondary.name === 'Expansion') combinations.push('Conqueror', 'War Explorer');
    else if (primary.name === 'Expansion' && secondary.name === 'Attack') combinations.push('Aggressive Exp', 'Raid Pioneer');
    
    // Try abbreviated combinations
    if (combinations.length === 0 || combinations[0].length > 16) {
        const p1 = primary.name.substring(0, 4);
        const p2 = secondary.name.substring(0, 4);
        const combo = `${p1}-${p2}`;
        if (combo.length <= 16) combinations.unshift(combo);
    }
    
    // Select based on hash
    if (combinations.length > 0) {
        const selected = combinations[idHash % combinations.length];
        if (selected.length <= 16) {
            // Add modifiers if space allows
            if (hasStrategic && selected.length + 2 <= 16) {
                return 'St ' + selected;
            }
            return selected;
        }
    }
    
    // Fallback: use primary trait with suffix
    let result = suffixMap[primary.name] || primary.name;
    if (result.length <= 16) return result;
    
    // Last resort: abbreviate
    return primary.name.substring(0, Math.min(16, primary.name.length));
};

const rankResults = (
    results: Individual[],
    rng: () => number,
    diversityWeight: number
): { ranked: Individual[]; diversityById: Map<string, number> } => {
    const pool = results.slice();
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    pool.sort((a, b) => {
        if (b.avgPointsRaw !== a.avgPointsRaw) return b.avgPointsRaw - a.avgPointsRaw;
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
            const score = candidate.avgPointsRaw + diversityWeight * minDistance;
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

const formatWeightsBlock = (weights: Partial<AIWeights>, indent: string = '        ') => {
    const sortedKeys = Object.keys(weights).sort() as (keyof AIWeights)[];
    const lines = sortedKeys.map((key) => {
        const value = weights[key]!;
        return `${indent}${key}: ${value},`;
    });
    return lines.join('\n');
};

const writeProfilesToSource = (profiles: AIProfile[], outputPath: string) => {
    const sourcePath = path.join(process.cwd(), 'src', 'core', 'ai', 'AIProfile.ts');
    let source = fs.readFileSync(sourcePath, 'utf-8');

    // Remove existing EvolvedProfile definitions
    source = source.replace(/export const EvolvedProfile\d+: AIProfile = \{[\s\S]*?\};\n\n/g, '');

    // Ensure RandomAiProfiles declaration is correct
    source = source.replace(/export const RandomAiProfiles: AIProfile\[[\s\S]*?\];/g, (match) => {
        return match.replace('AIProfile[', 'AIProfile[] = [');
    });

    // Find RandomAiProfiles array
    const startMarker = 'export const RandomAiProfiles: AIProfile[] = [';
    const startIndex = source.indexOf(startMarker);
    if (startIndex === -1) {
        throw new Error('Could not find RandomAiProfiles array in source file');
    }
    const afterStart = source.indexOf('\n', startIndex);
    const endIndex = source.indexOf('];', afterStart);
    if (endIndex === -1) {
        throw new Error('Could not find end of RandomAiProfiles array');
    }

    // Extract existing entries, removing any stale EvolvedProfile references
    const existingArrayContent = source.substring(afterStart + 1, endIndex)
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('EvolvedProfile'))
        .map((line) => line.replace(/,?$/, ''))
        .join(',\n');

    // Generate new profile definitions
    const profileDefs = profiles.map((profile, index) => {
        const varName = `EvolvedProfile${index + 1}`;
        const weightsBlock = formatWeightsBlock(profile.weights || {});
        return `export const ${varName}: AIProfile = {\n    id: '${profile.id}',\n    label: '${profile.label}',\n    weights: {\n${weightsBlock}\n    }\n};`;
    }).join('\n\n');

    // Generate new array entries
    const newArrayEntries = profiles.map((profile, index) => `    EvolvedProfile${index + 1}`).join(',\n');

    const newArrayContent = existingArrayContent
        ? `${existingArrayContent},\n${newArrayEntries}`
        : newArrayEntries;

    const before = source.substring(0, startIndex);
    const after = source.substring(endIndex + 2);

    const updatedArray = `${startMarker}\n${newArrayContent}\n];`;

    const finalSource = before + profileDefs + '\n\n' + updatedArray + after;

    fs.writeFileSync(sourcePath, finalSource, 'utf-8');
    console.log(`\n✅ Written ${profiles.length} evolved profiles to ${sourcePath}`);
};

const main = async () => {
    const options = parseArgs();

    if (!fs.existsSync(options.outDir)) {
        fs.mkdirSync(options.outDir, { recursive: true });
    }

    if (!options.mapTypes.length) {
        options.mapTypes = ['default'];
    }
    if (options.playerCount !== 4) {
        console.warn(`⚠️ This mode expects 4 players. Forcing --players=4 (was ${options.playerCount}).`);
        options.playerCount = 4;
    }

    const startTime = Date.now();
    const baseProfiles = RandomAiProfiles.length
        ? RandomAiProfiles.slice(0, 4)
        : [DefaultAIProfile, DefaultAIProfile, DefaultAIProfile, DefaultAIProfile];
    let currentBases = baseProfiles.map((profile, index) => cloneProfile(profile, `base_${index + 1}`));
    const roundReports: any[] = [];

    if (!options.quiet) {
        console.log('=== AI Evolution (Round-Based) ===');
        console.log(`Rounds: ${options.rounds}, Matches per AI: ${options.matchesPerAi}`);
        console.log(`Maps: ${options.mapTypes.join(', ')}`);
    }

    for (let round = 0; round < options.rounds; round++) {
        const rng = createSeededRandom(options.seed + round * 100000);
        const participants = buildRoundProfiles(currentBases, rng, options, round);
        if (!options.quiet) {
            console.log(`\nRound ${round + 1}: ${participants.length} profiles`);
        }
        const { results, mapCounts } = evaluateRound(participants, options, round, rng);
        const { ranked, diversityById } = rankResults(results, rng, options.diversityWeight);
        const top4 = ranked.slice(0, 4);

        if (!options.quiet) {
            console.log(`Round ${round + 1} Results:`);
            for (let i = 0; i < ranked.length; i++) {
                const ind = ranked[i];
                const winRate = ind.games > 0 ? ind.wins / ind.games : 0;
                const decisiveRate = ind.decisiveRate || 0;
                const diversityScore = diversityById.get(ind.profile.id) ?? 0;
                const decisiveBonusStr = ind.avgDecisiveBonus > 0 ? ` | DecisiveBonus=${ind.avgDecisiveBonus.toFixed(2)}` : '';
                console.log(`  ${i + 1}. ${ind.profile.id} | AvgPoints=${ind.avgPointsRaw.toFixed(2)}${decisiveBonusStr} | WinRate=${(winRate * 100).toFixed(1)}% | Decisive=${(decisiveRate * 100).toFixed(1)}% | Diversity=${diversityScore.toFixed(3)}`);
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
                avgDecisiveBonus: ind.avgDecisiveBonus,
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
    for (let i = 0; i < finalProfiles.length; i++) {
        finalProfiles[i].id = `evolved_${profileTimestamp}_${i + 1}`;
        finalProfiles[i].label = generateLabel(finalProfiles[i]);
    }

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
        writeProfilesToSource(finalProfiles, reportPath);
    }
};

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
