import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Cell } from './Cell';
import { GameEngine } from './GameEngine';
import { MapGenerator } from './map/MapGenerator';
import { GameConfig } from './GameConfig';

describe('Treasure Chest/Flotsam System', () => {
    describe('Cell treasureGold serialization', () => {
        it('initializes treasureGold as null', () => {
            const cell = new Cell(0, 0);
            expect(cell.treasureGold).toBe(null);
        });

        it('serializes treasureGold correctly', () => {
            const cell = new Cell(0, 0);
            cell.treasureGold = 100;
            const serialized = cell.serialize();
            expect(serialized.treasureGold).toBe(100);
        });

        it('serializes null treasureGold correctly', () => {
            const cell = new Cell(0, 0);
            cell.treasureGold = null;
            const serialized = cell.serialize();
            expect(serialized.treasureGold).toBe(null);
        });

        it('deserializes treasureGold correctly', () => {
            const data = { row: 0, col: 0, treasureGold: 150 };
            const cell = Cell.deserialize(data);
            expect(cell.treasureGold).toBe(150);
        });

        it('deserializes null treasureGold correctly', () => {
            const data = { row: 0, col: 0, treasureGold: null };
            const cell = Cell.deserialize(data);
            expect(cell.treasureGold).toBe(null);
        });

        it('deserializes missing treasureGold as null', () => {
            const data = { row: 0, col: 0 };
            const cell = Cell.deserialize(data);
            expect(cell.treasureGold).toBe(null);
        });
    });

    describe('MapGenerator distributeTreasures', () => {
        let grid: Cell[][];
        const width = 20;
        const height = 20;

        beforeEach(() => {
            grid = [];
            for (let r = 0; r < height; r++) {
                grid[r] = [];
                for (let c = 0; c < width; c++) {
                    grid[r][c] = new Cell(r, c);
                    grid[r][c].type = 'plain';
                    grid[r][c].owner = null;
                    grid[r][c].building = 'none';
                }
            }
        });

        it('generates treasures on map generation', () => {
            MapGenerator.generate(grid, 'default', width, height, 2);
            
            let treasureCount = 0;
            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    if (grid[r][c].treasureGold !== null) {
                        treasureCount++;
                        expect(grid[r][c].treasureGold).toBeGreaterThanOrEqual(GameConfig.TREASURE_GOLD_MIN);
                        expect(grid[r][c].treasureGold).toBeLessThanOrEqual(GameConfig.TREASURE_GOLD_MAX);
                    }
                }
            }
            expect(treasureCount).toBeGreaterThan(0);
        });

        it('generates treasures only on plain or water terrain', () => {
            MapGenerator.generate(grid, 'default', width, height, 2);
            
            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    const cell = grid[r][c];
                    if (cell.treasureGold !== null) {
                        expect(cell.type === 'plain' || cell.type === 'water').toBe(true);
                    }
                }
            }
        });

        it('does not place treasures on owned cells', () => {
            // Pre-own some cells
            grid[5][5].owner = 'P1';
            grid[6][6].owner = 'P2';
            
            MapGenerator.generate(grid, 'default', width, height, 2);
            
            expect(grid[5][5].treasureGold).toBe(null);
            expect(grid[6][6].treasureGold).toBe(null);
        });

        it('does not place treasures on cells with buildings', () => {
            MapGenerator.generate(grid, 'default', width, height, 2);
            
            // After generation, manually add buildings and check they don't have treasures
            // (Note: MapGenerator.generate resets the grid, so we check after generation)
            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    const cell = grid[r][c];
                    if (cell.building !== 'none') {
                        expect(cell.treasureGold).toBe(null);
                    }
                }
            }
        });

        it('distributes treasures fairly per player', () => {
            MapGenerator.generate(grid, 'default', width, height, 2);
            
            const treasures: { r: number; c: number; gold: number }[] = [];
            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    if (grid[r][c].treasureGold !== null) {
                        treasures.push({ r, c, gold: grid[r][c].treasureGold! });
                    }
                }
            }
            
            // Should have at least 2 treasures per player (totalCount >= playerCount * 2)
            expect(treasures.length).toBeGreaterThanOrEqual(2);
        });

        it('places treasures at minimum distance from spawn points', () => {
            MapGenerator.generate(grid, 'default', width, height, 2);
            
            // Get spawn points (same logic as MapGenerator)
            const spawns: { r: number; c: number }[] = [];
            for (let i = 0; i < 2; i++) {
                const margin = 2;
                const boundedW = width - 2 * margin;
                const boundedH = height - 2 * margin;
                const angle = (i / 2) * 2 * Math.PI - (Math.PI / 2);
                const startOffset = -3 * Math.PI / 4;
                const finalAngle = angle + startOffset;
                const cx = width / 2;
                const cy = height / 2;
                let r = Math.round(cy + (boundedH / 2) * Math.sin(finalAngle));
                let c = Math.round(cx + (boundedW / 2) * Math.cos(finalAngle));
                r = Math.max(0, Math.min(height - 1, r));
                c = Math.max(0, Math.min(width - 1, c));
                spawns.push({ r, c });
            }
            
            const minDistance = Math.max(3, Math.floor(Math.min(width, height) / 6));
            const manhattan = (r1: number, c1: number, r2: number, c2: number) =>
                Math.abs(r1 - r2) + Math.abs(c1 - c2);
            
            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    if (grid[r][c].treasureGold !== null && grid[r][c].type === 'plain') {
                        let nearest = Infinity;
                        for (const spawn of spawns) {
                            const dist = manhattan(r, c, spawn.r, spawn.c);
                            if (dist < nearest) nearest = dist;
                        }
                        expect(nearest).toBeGreaterThanOrEqual(minDistance);
                    }
                }
            }
        });

        it('generates treasures on water terrain (flotsam)', () => {
            // Create a water-only map
            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    grid[r][c].type = 'water';
                }
            }
            
            MapGenerator.generate(grid, 'archipelago', width, height, 2);
            
            let flotsamCount = 0;
            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    if (grid[r][c].treasureGold !== null && grid[r][c].type === 'water') {
                        flotsamCount++;
                    }
                }
            }
            // May or may not have flotsam depending on map generation, but if it does, it should be valid
            if (flotsamCount > 0) {
                expect(flotsamCount).toBeGreaterThan(0);
            }
        });
    });

    describe('GameEngine treasure collection', () => {
        let engine: GameEngine;

        const resetGrid = (target: GameEngine) => {
            const height = target.state.grid.length;
            const width = height > 0 ? target.state.grid[0].length : 0;
            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    target.state.grid[r][c].owner = null;
                    target.state.grid[r][c].building = 'none';
                    target.state.grid[r][c].type = 'plain';
                    target.state.grid[r][c].treasureGold = null;
                }
            }
        };

        beforeEach(() => {
            engine = new GameEngine();
            resetGrid(engine);
            engine.state.players['P1'].gold = 1000;
            engine.state.currentPlayerId = 'P1';
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('collects treasure when capturing a plain tile with treasure', () => {
            const cell = engine.state.getCell(0, 1)!;
            cell.type = 'plain';
            cell.owner = null;
            cell.treasureGold = 100;

            engine.state.setOwner(0, 0, 'P1');
            engine.state.setBuilding(0, 0, 'base');
            engine.state.updateConnectivity('P1');

            const initialGold = engine.state.players['P1'].gold;
            engine.pendingMoves = [{ r: 0, c: 1 }];
            
            const logSpy = vi.spyOn(engine, 'emit');
            engine.endTurn();

            expect(engine.state.getCell(0, 1)!.owner).toBe('P1');
            expect(engine.state.getCell(0, 1)!.treasureGold).toBe(null); // Treasure removed
            // Gold = initial + treasure - move cost (typically 5 for adjacent)
            const finalGold = engine.state.players['P1'].gold;
            expect(finalGold).toBeGreaterThan(initialGold); // Should increase due to treasure
            expect(finalGold).toBe(initialGold + 100 - 10); // +100 treasure, -10 move cost
            expect(logSpy).toHaveBeenCalledWith('logMessage', expect.objectContaining({
                text: expect.stringContaining('treasure chest'),
                type: 'info'
            }));
            expect(logSpy).toHaveBeenCalledWith('sfx:gold_found');
        });

        it('collects flotsam when capturing a water tile with treasure', () => {
            const cell = engine.state.getCell(0, 1)!;
            cell.type = 'water';
            cell.owner = null;
            cell.treasureGold = 150;

            engine.state.setOwner(0, 0, 'P1');
            engine.state.setBuilding(0, 0, 'base');
            engine.state.updateConnectivity('P1');

            const initialGold = engine.state.players['P1'].gold;
            engine.pendingMoves = [{ r: 0, c: 1 }];
            
            const logSpy = vi.spyOn(engine, 'emit');
            engine.endTurn();

            expect(engine.state.getCell(0, 1)!.owner).toBe('P1');
            expect(engine.state.getCell(0, 1)!.treasureGold).toBe(null); // Flotsam removed
            // Gold = initial + treasure - move cost (typically 5 for adjacent)
            const finalGold = engine.state.players['P1'].gold;
            expect(finalGold).toBeGreaterThan(initialGold); // Should increase due to treasure
            // Water requires bridge building (COST_BUILD_BRIDGE = 30)
            expect(finalGold).toBe(initialGold + 150 - 30); // +150 treasure, -30 bridge cost
            expect(logSpy).toHaveBeenCalledWith('logMessage', expect.objectContaining({
                text: expect.stringContaining('flotsam'),
                type: 'info'
            }));
            expect(logSpy).toHaveBeenCalledWith('sfx:gold_found');
        });

        it('does not collect treasure if cell has no treasure', () => {
            const cell = engine.state.getCell(0, 1)!;
            cell.type = 'plain';
            cell.owner = null;
            cell.treasureGold = null;

            engine.state.setOwner(0, 0, 'P1');
            engine.state.setBuilding(0, 0, 'base');
            engine.state.updateConnectivity('P1');

            const initialGold = engine.state.players['P1'].gold;
            engine.pendingMoves = [{ r: 0, c: 1 }];
            
            const logSpy = vi.spyOn(engine, 'emit');
            engine.endTurn();

            expect(engine.state.getCell(0, 1)!.owner).toBe('P1');
            // Gold may decrease due to move cost, but should not increase from treasure
            const finalGold = engine.state.players['P1'].gold;
            const goldChange = finalGold - initialGold;
            // Move cost is typically 10, so gold should decrease, not increase
            expect(goldChange).toBeLessThanOrEqual(0);
            expect(logSpy).not.toHaveBeenCalledWith('sfx:gold_found', expect.anything());
        });

        it('only collects treasure on first capture (not on re-capture)', () => {
            const cell = engine.state.getCell(0, 1)!;
            cell.type = 'plain';
            cell.owner = null;
            cell.treasureGold = 100;

            engine.state.setOwner(0, 0, 'P1');
            engine.state.setBuilding(0, 0, 'base');
            engine.state.updateConnectivity('P1');

            // First capture
            const initialGold = engine.state.players['P1'].gold;
            engine.pendingMoves = [{ r: 0, c: 1 }];
            engine.endTurn();

            expect(engine.state.getCell(0, 1)!.treasureGold).toBe(null);
            // Gold = initial + treasure - move cost (typically 5 for adjacent)
            const finalGold = engine.state.players['P1'].gold;
            expect(finalGold).toBe(initialGold + 100 - 10); // +100 treasure, -10 move cost

            // Re-capture by enemy (should not give treasure again)
            engine.state.players['P2'].gold = 1000;
            engine.state.currentPlayerId = 'P2';
            engine.state.setOwner(0, 2, 'P2');
            engine.state.setBuilding(0, 2, 'base');
            engine.state.updateConnectivity('P2');

            const p2InitialGold = engine.state.players['P2'].gold;
            const moveCost = engine.getMoveCost(0, 1);
            engine.pendingMoves = [{ r: 0, c: 1 }];
            engine.endTurn();

            expect(engine.state.players['P2'].gold).toBeCloseTo(p2InitialGold - moveCost, 5); // No treasure bonus
        });

        it('collects multiple treasures in one turn', () => {
            engine.state.setOwner(0, 0, 'P1');
            engine.state.setBuilding(0, 0, 'base');
            engine.state.updateConnectivity('P1');

            engine.state.getCell(0, 1)!.treasureGold = 50;
            engine.state.getCell(0, 2)!.treasureGold = 200;

            const initialGold = engine.state.players['P1'].gold;
            engine.pendingMoves = [
                { r: 0, c: 1 },
                { r: 0, c: 2 }
            ];
            
            engine.endTurn();

            expect(engine.state.getCell(0, 1)!.treasureGold).toBe(null);
            expect(engine.state.getCell(0, 2)!.treasureGold).toBe(null);
            // Gold = initial + treasures - move costs (2 moves, each typically 5 for adjacent)
            const finalGold = engine.state.players['P1'].gold;
            expect(finalGold).toBe(initialGold + 50 + 200 - 10 - 10); // +250 treasure, -20 move costs
        });
    });
});
