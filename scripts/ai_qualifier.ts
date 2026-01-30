import { GameEngine } from '../src/core/GameEngine';
import { GameConfig } from '../src/core/GameConfig';
import type { MapType } from '../src/core/map/MapGenerator';
import type { AIProfile } from '../src/core/ai/AIProfile';
import { createSeededRandom, withSeededRandom } from './ai_tournament_lib';

export type QualifierOptions = {
    /** Number of distinct map types to use (default 2). */
    numMaps?: number;
    /** Minimum wins required to qualify (default 3). */
    minWinsToQualify?: number;
    /** Rotations (P1/P2 swap) per map (default 2). */
    rotationsPerMap?: number;
};

const DEFAULT_QUALIFIER_OPTIONS: Required<QualifierOptions> = {
    numMaps: 2,
    minWinsToQualify: 3,
    rotationsPerMap: 2
};

const pickNDistinctMapTypes = (mapTypes: MapType[], n: number, seed: number): MapType[] => {
    const unique = Array.from(new Set(mapTypes));
    if (unique.length === 0) return ['default'];
    if (unique.length === 1) return Array(n).fill(unique[0]);
    const rng = createSeededRandom(seed);
    const indices = new Set<number>();
    while (indices.size < Math.min(n, unique.length)) {
        indices.add(Math.floor(rng() * unique.length));
    }
    return Array.from(indices).map((i) => unique[i]);
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

const runQualifierMatch = (
    profilesByPlayer: Record<string, AIProfile>,
    mapSeed: number,
    aiSeed: number,
    mapType: MapType,
    positionRotation: number
): { winnerProfileId: string } => {
    const width = 10;
    const height = 10;
    const maxTurns = 40;
    const playerCount = 2;

    return withSeededRandom(mapSeed, (mapRng) => {
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

        const engine = new GameEngine(players, mapType, mapRng, { randomizeAiProfiles: false });
        (engine as any).triggerAiTurn = () => {};
        engine.setAiProfiles(rotatedProfilesByPlayer);
        engine.startGame();

        const matchResult = withSeededRandom(aiSeed, () => {
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
                    const landDiff = (landCounts[b] || 0) - (landCounts[a] || 0);
                    if (landDiff !== 0) return landDiff;
                    return (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0);
                });
            }

            const placements = [...survivorOrder, ...eliminationOrder.slice().reverse()];
            const winnerId = placements[0];
            const winnerProfileId = profiles[winnerId] ?? 'baseline';
            return { winnerProfileId };
        });

        return matchResult;
    });
};

export const qualifiesCandidate = (
    candidate: AIProfile,
    base: AIProfile,
    mapTypes: MapType[],
    qualifierSeedBase: number,
    aiSeedBase: number,
    options?: QualifierOptions
): boolean => {
    const opts = { ...DEFAULT_QUALIFIER_OPTIONS, ...options };
    const numMaps = Math.max(1, opts.numMaps);
    const rotationsPerMap = Math.max(1, opts.rotationsPerMap);
    const totalMatches = numMaps * rotationsPerMap;
    const minWins = Math.min(opts.minWinsToQualify, totalMatches);
    // Fail once we can no longer reach minWins: e.g. 4/4 → 1 loss = out, 3/4 → 2 losses = out
    const maxLossesToFail = totalMatches - minWins + 1;

    const picked = pickNDistinctMapTypes(mapTypes, numMaps, qualifierSeedBase + 4242);
    const maps: Array<{ type: MapType; seed: number }> = picked.map((type, idx) => ({
        type,
        seed: qualifierSeedBase + 100 + idx * 1000
    }));
    let wins = 0;
    let losses = 0;

    for (let mapIndex = 0; mapIndex < maps.length; mapIndex++) {
        for (let rotation = 0; rotation < rotationsPerMap; rotation++) {
            const result = runQualifierMatch(
                { P1: candidate, P2: base },
                maps[mapIndex].seed,
                aiSeedBase + mapIndex * 10 + rotation,
                maps[mapIndex].type,
                rotation
            );
            if (result.winnerProfileId === candidate.id) {
                wins += 1;
            } else {
                losses += 1;
                if (losses >= maxLossesToFail) {
                    return false;
                }
            }
        }
    }

    return wins >= minWins;
};
