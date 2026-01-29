import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { GameEngine } from './GameEngine';
import { GameConfig } from './GameConfig';
import { GameState } from './GameState';
import { CostSystem } from './CostSystem';
import { AuraSystem } from './AuraSystem';
import { Cell } from './Cell';
import { DefaultAIWeights } from './ai/AIProfile';
import { AIController } from './AIController';

const createSeededRandom = (seed: number) => {
    let t = seed >>> 0;
    return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
};

const countLighthousesOnGrid = (grid: Cell[][]): number => {
    let count = 0;
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            if (grid[r][c].building === 'lighthouse') count++;
        }
    }
    return count;
};

describe('Lighthouse', () => {
    const origW = GameConfig.GRID_WIDTH;
    const origH = GameConfig.GRID_HEIGHT;

    beforeEach(() => {
        (GameConfig as any).GRID_WIDTH = 10;
        (GameConfig as any).GRID_HEIGHT = 10;
    });

    afterAll(() => {
        (GameConfig as any).GRID_WIDTH = origW;
        (GameConfig as any).GRID_HEIGHT = origH;
    });

    describe('placement (archipelago only)', () => {
        it('places lighthouses on archipelago at corners and center when neutral', () => {
            const rng = createSeededRandom(12345);
            const engine = new GameEngine(
                [{ id: 'P1', isAI: false, color: 0 }, { id: 'P2', isAI: true, color: 1 }],
                'archipelago',
                rng
            );
            engine.startGame();
            const grid = engine.state.grid;
            const height = grid.length;
            const width = height > 0 ? grid[0].length : 0;
            const positions = [
                { r: 0, c: 0 },
                { r: 0, c: width - 1 },
                { r: height - 1, c: 0 },
                { r: height - 1, c: width - 1 },
                { r: Math.floor(height / 2), c: Math.floor(width / 2) }
            ];
            let lighthouseCount = 0;
            for (const { r, c } of positions) {
                const cell = engine.state.getCell(r, c);
                if (cell?.building === 'lighthouse' && cell.owner === null) {
                    lighthouseCount++;
                }
            }
            const totalLighthouses = countLighthousesOnGrid(grid);
            expect(totalLighthouses).toBe(lighthouseCount);
            expect(totalLighthouses).toBeGreaterThanOrEqual(1);
            expect(totalLighthouses).toBeLessThanOrEqual(5);
        });

        it('caches lighthouse locations in GameState', () => {
            const rng = createSeededRandom(12345);
            const engine = new GameEngine(
                [{ id: 'P1', isAI: false, color: 0 }, { id: 'P2', isAI: true, color: 1 }],
                'archipelago',
                rng
            );
            engine.startGame();

            const grid = engine.state.grid;
            const scanned: { r: number; c: number }[] = [];
            for (let r = 0; r < grid.length; r++) {
                for (let c = 0; c < grid[r].length; c++) {
                    if (grid[r][c].building === 'lighthouse') scanned.push({ r, c });
                }
            }

            const cached = engine.state.lighthouseLocations;
            expect(cached.length).toBe(scanned.length);

            const key = (p: { r: number; c: number }) => `${p.r},${p.c}`;
            const scannedSet = new Set(scanned.map(key));
            for (const loc of cached) {
                expect(scannedSet.has(key(loc))).toBe(true);
                expect(engine.state.getCell(loc.r, loc.c)!.building).toBe('lighthouse');
            }
        });

        it('does not place lighthouses on default, pangaea, or rivers', () => {
            const rng = createSeededRandom(42);
            for (const mapType of ['default', 'pangaea', 'rivers'] as const) {
                const engine = new GameEngine(
                    [{ id: 'P1', isAI: false, color: 0 }, { id: 'P2', isAI: true, color: 1 }],
                    mapType,
                    rng
                );
                engine.startGame();
                const total = countLighthousesOnGrid(engine.state.grid);
                expect(total).toBe(0);
                expect(engine.state.lighthouseLocations.length).toBe(0);
            }
        });
    });

    describe('costs', () => {
        it('neutral lighthouse capture cost is 30', () => {
            const state = new GameState(
                [{ id: 'P1', isAI: false, color: 0 }, { id: 'P2', isAI: true, color: 1 }],
                'default'
            );
            const cell = state.getCell(1, 1)!;
            cell.building = 'lighthouse';
            cell.owner = null;
            cell.type = 'plain';
            state.currentPlayerId = 'P1';
            const cost = CostSystem.getMoveCost(state, 1, 1);
            expect(cost).toBe(GameConfig.COST_CAPTURE_LIGHTHOUSE);
        });

        it('enemy lighthouse attack base cost is 60', () => {
            const state = new GameState(
                [{ id: 'P1', isAI: false, color: 0 }, { id: 'P2', isAI: true, color: 1 }],
                'default'
            );
            state.setOwner(0, 0, 'P1');
            state.getCell(0, 0)!.building = 'base';
            state.setOwner(1, 1, 'P2');
            state.getCell(1, 1)!.building = 'lighthouse';
            state.getCell(1, 1)!.type = 'plain';
            state.currentPlayerId = 'P1';
            const details = CostSystem.getCostDetails(state, 1, 1, []);
            expect(details.cost).toBeGreaterThanOrEqual(60);
            expect(Math.floor(details.cost / (GameConfig.COST_MULTIPLIER_ATTACK || 1.2))).toBeGreaterThanOrEqual(60);
        });
    });

    describe('aura', () => {
        it('lighthouse provides support discount within range 4', () => {
            const state = new GameState(
                [{ id: 'P1', isAI: false, color: 0 }, { id: 'P2', isAI: true, color: 1 }],
                'default'
            );
            state.setOwner(2, 2, 'P1');
            state.getCell(2, 2)!.building = 'lighthouse';
            state.getCell(2, 2)!.isConnected = true;
            const { discount, source } = AuraSystem.getSupportDiscount(state, 4, 2, 'P1');
            expect(discount).toBeGreaterThan(0);
            expect(source?.building).toBe('lighthouse');
        });

        it('getAuraRange returns 4 for lighthouse', () => {
            const cell = new Cell(0, 0);
            cell.building = 'lighthouse';
            expect(AuraSystem.getAuraRange(cell)).toBe(GameConfig.WATCHTOWER_RANGES[3]);
        });
    });

    describe('income', () => {
        it('1 lighthouse gives income 3 per tile', () => {
            const state = new GameState(
                [{ id: 'P1', isAI: false, color: 0 }, { id: 'P2', isAI: true, color: 1 }],
                'default'
            );
            state.setOwner(1, 1, 'P1');
            state.getCell(1, 1)!.building = 'lighthouse';
            state.getCell(1, 1)!.isConnected = true;
            const income = state.getTileIncome(1, 1);
            expect(income).toBe(3);
        });

        it('lighthouse income is halved when disconnected', () => {
            const state = new GameState(
                [{ id: 'P1', isAI: false, color: 0 }, { id: 'P2', isAI: true, color: 1 }],
                'default'
            );
            state.setOwner(1, 1, 'P1');
            state.getCell(1, 1)!.building = 'lighthouse';
            state.getCell(1, 1)!.isConnected = false; // disconnected
            const income = state.getTileIncome(1, 1);
            expect(income).toBe(1.5);
        });

        it('lighthouse income is affected by base income aura', () => {
            const state = new GameState(
                [{ id: 'P1', isAI: false, color: 0 }, { id: 'P2', isAI: true, color: 1 }],
                'default'
            );

            // Base at (1,1) with income aura range 1
            state.setOwner(1, 1, 'P1');
            state.setBuilding(1, 1, 'base');
            state.getCell(1, 1)!.incomeLevel = 1;
            state.getCell(1, 1)!.isConnected = true;

            // Lighthouse adjacent at (1,2) -> should get +30% aura bonus
            state.setOwner(1, 2, 'P1');
            state.getCell(1, 2)!.building = 'lighthouse';
            state.getCell(1, 2)!.isConnected = true;

            const auraBonus = AuraSystem.getIncomeAuraBonus(state, 1, 2, 'P1');
            expect(auraBonus).toBeGreaterThan(0);

            // Base lighthouse income is 3 for 1 lighthouse; with +30% => 3.9
            const income = state.getTileIncome(1, 2);
            expect(income).toBeCloseTo(3 * (1 + GameConfig.AURA_BONUS_BASE), 5);
        });

        it('2 lighthouses give 5 each (10 total)', () => {
            const state = new GameState(
                [{ id: 'P1', isAI: false, color: 0 }, { id: 'P2', isAI: true, color: 1 }],
                'default'
            );
            state.setOwner(0, 0, 'P1');
            state.getCell(0, 0)!.building = 'lighthouse';
            state.getCell(0, 0)!.isConnected = true;
            state.setOwner(0, 1, 'P1');
            state.getCell(0, 1)!.building = 'lighthouse';
            state.getCell(0, 1)!.isConnected = true;
            expect(state.getTileIncome(0, 0)).toBe(5);
            expect(state.getTileIncome(0, 1)).toBe(5);
        });

        it('5 lighthouses give 20 each (100 total)', () => {
            const state = new GameState(
                [{ id: 'P1', isAI: false, color: 0 }, { id: 'P2', isAI: true, color: 1 }],
                'default'
            );
            for (let i = 0; i < 5; i++) {
                state.setOwner(0, i, 'P1');
                state.getCell(0, i)!.building = 'lighthouse';
                state.getCell(0, i)!.isConnected = true;
            }
            let total = 0;
            for (let i = 0; i < 5; i++) {
                total += state.getTileIncome(0, i);
            }
            expect(total).toBe(100);
        });
    });

    describe('flood multiplier', () => {
        it('getLighthouseCount returns correct count', () => {
            const state = new GameState(
                [{ id: 'P1', isAI: false, color: 0 }, { id: 'P2', isAI: true, color: 1 }],
                'default'
            );
            expect(state.getLighthouseCount('P1')).toBe(0);
            state.setOwner(1, 1, 'P1');
            state.getCell(1, 1)!.building = 'lighthouse';
            expect(state.getLighthouseCount('P1')).toBe(1);
            state.setOwner(2, 2, 'P1');
            state.getCell(2, 2)!.building = 'lighthouse';
            expect(state.getLighthouseCount('P1')).toBe(2);
        });
    });

    describe('AI scoreObjectives', () => {
        it('scores neutral lighthouse with SCORE_LIGHTHOUSE', () => {
            const engine = new GameEngine();
            engine.state.setOwner(0, 0, 'P1');
            engine.state.getCell(0, 0)!.building = 'base';
            engine.state.getCell(1, 1)!.building = 'lighthouse';
            engine.state.getCell(1, 1)!.owner = null;
            const cell = engine.state.getCell(1, 1)!;
            const ai = new AIController(engine);
            const score = (ai as any).scoreObjectives(cell, 'P2', DefaultAIWeights);
            expect(score).toBeGreaterThan(0);
            expect(score).toBe(DefaultAIWeights.SCORE_LIGHTHOUSE);
        });
    });
});
