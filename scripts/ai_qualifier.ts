import { GameEngine } from '../src/core/GameEngine';
import { GameConfig } from '../src/core/GameConfig';
import type { MapType } from '../src/core/map/MapGenerator';
import type { AIProfile } from '../src/core/ai/AIProfile';
import { withSeededRandom } from './ai_tournament_lib';

export type QualifierMapSeeds = {
    default: number;
    river: number;
};

export const getQualifierMapSeedsFromSeed = (seed: number): QualifierMapSeeds => {
    const base = seed + 4242;
    return {
        default: base + 1,
        river: base + 2
    };
};

export const getQualifierMapSeeds = (seed: number, roundIndex: number): QualifierMapSeeds => {
    return getQualifierMapSeedsFromSeed(seed + roundIndex * 100000);
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
    mapSeeds: QualifierMapSeeds,
    aiSeedBase: number
): boolean => {
    const maps: Array<{ type: MapType; seed: number }> = [
        { type: 'default', seed: mapSeeds.default },
        { type: 'river', seed: mapSeeds.river }
    ];
    let wins = 0;
    let losses = 0;

    for (let mapIndex = 0; mapIndex < maps.length; mapIndex++) {
        for (let rotation = 0; rotation < 2; rotation++) {
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
                if (losses >= 2) {
                    return false;
                }
            }
        }
    }

    return wins >= 3;
};
