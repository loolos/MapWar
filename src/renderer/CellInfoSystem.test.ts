
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Phaser before importing usage
vi.mock('phaser', () => ({
    default: {
        GameObjects: {
            Container: class {
                scene: any;
                constructor(scene: any) { this.scene = scene; }
                add = vi.fn(function (this: any) { return this; });
                setPosition = vi.fn(function (this: any) { return this; });
                setSize = vi.fn(function (this: any) { return this; });
                setInteractive = vi.fn(function (this: any) { return this; });
                on = vi.fn(function (this: any) { return this; });
                removeInteractive = vi.fn(function (this: any) { return this; });
                bringToTop = vi.fn(function (this: any) { return this; });
            },
            Text: class { },
            Graphics: class { }
        }
    }
}));

import { CellInfoSystem } from './ui/CellInfoSystem';
import { GameEngine } from '../core/GameEngine';

// Mock UI Systems imports inside CellInfoSystem if necessary?
// Actually CellInfoSystem imports Phaser. Since we mocked it above, it should be fine.

// Mock Phaser Scene and Objects
const createMockText = () => ({
    setText: vi.fn(),
    setColor: vi.fn(),
    setStyle: vi.fn(),
    setPosition: vi.fn(),
    height: 20,
    type: 'Text',
    setOrigin: vi.fn(), // Added for safety
    setScrollFactor: vi.fn()
});

const mockGraphics = {
    fillStyle: vi.fn(),
    fillRect: vi.fn(),
    clear: vi.fn(),
    fillRoundedRect: vi.fn(),
    strokeRoundedRect: vi.fn(),
    lineStyle: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    strokePath: vi.fn(),
    lineBetween: vi.fn(),
    createGeometryMask: vi.fn(),
    destroy: vi.fn(),
    closePath: vi.fn(),
    fillPath: vi.fn(),
    fillTriangle: vi.fn(),
    type: 'Graphics'
};

const mockZone = {
    setInteractive: vi.fn(function (this: any) { return this || mockZone; }),
    on: vi.fn(function (this: any) { return this || mockZone; }),
    setOrigin: vi.fn(function (this: any) { return this || mockZone; }),
    setSize: vi.fn(function (this: any) { return this || mockZone; }),
    type: 'Zone'
};

const mockContainer = {
    add: vi.fn(),
    setMask: vi.fn(),
    setPosition: vi.fn(),
    setScale: vi.fn(),
    setVisible: vi.fn(function (this: any) { return this || mockContainer; }), // Added
    scaleX: 1,
    scaleY: 1,
    getAt: vi.fn(() => mockGraphics),
    list: [mockGraphics, mockZone], // Populate list for find
    each: vi.fn((callback: any) => {
        // Simple mock of each
        callback(mockGraphics);
    })
};

const mockScene = {
    add: {
        container: vi.fn(() => mockContainer),
        text: vi.fn(() => createMockText()), // Return NEW mock each time
        graphics: vi.fn(() => mockGraphics),
        zone: vi.fn(() => mockZone), // Added
        existing: vi.fn()
    },
    make: {
        graphics: vi.fn(() => mockGraphics) // Reuse mockGraphics for simplicity
    },
    input: {
        on: vi.fn() // Added
    }
} as any;

describe('CellInfoSystem', () => {
    let system: CellInfoSystem;
    let engine: GameEngine;

    beforeEach(() => {
        vi.clearAllMocks();
        system = new CellInfoSystem(mockScene, 0, 0, 200);
        engine = new GameEngine();

        // Mock State because we don't want to rely on full engine logic
        const grid: any[][] = [];
        for (let r = 0; r < 10; r++) {
            grid[r] = [];
            for (let c = 0; c < 10; c++) {
                grid[r][c] = {
                    r, c, type: 'plain', owner: null, isConnected: false, building: 'none', defenseLevel: 0
                } as any;
            }
        }

        // Force overwrite of state
        const state = {
            getCell: (r: number, c: number) => {
                return grid[r] && grid[r][c];
            },
            players: { 'P1': { id: 'P1', color: 0xff0000, gold: 100, isAI: false } },
            getCurrentPlayer: () => ({ id: 'P1', gold: 100, isAI: false, color: 0xff0000 })
        };

        engine = {
            stateManager: { state },
            get state() { return state; }, // Direct ref, bypassing this
            calculatePlannedCost: () => 0,
            pendingInteractions: [],
            getCostDetails: (_r: number, _c: number) => ({ cost: 10, breakdown: 'Test Breakdown' }),
            getMoveCost: (_r: number, _c: number) => 10,
            interactionRegistry: { getAvailableActions: () => [] }
        } as unknown as GameEngine;
    });

    it('shows disconnected warning for owned but disconnected cells', () => {
        // Setup: (0,0) is owned by P1 but NOT connected
        const cell = engine.state.getCell(0, 0)!;
        cell.owner = 'P1';
        cell.isConnected = false;

        system.update(engine, 0, 0);

        // Check Owner Text Update
        expect(system.ownerText.setText).toHaveBeenCalledWith('Owner: P1 (Disc.)');
        expect(system.ownerText.setColor).toHaveBeenCalledWith('#ff4444');
    });

    it('shows normal text for connected cells', () => {
        // Setup: (0,0) is owned by P1 AND connected
        const cell = engine.state.getCell(0, 0)!;
        cell.owner = 'P1';
        cell.isConnected = true;

        system.update(engine, 0, 0);

        // Check Owner Text Update - Should NOT contain warning
        expect(system.ownerText.setText).toHaveBeenCalledWith('Owner: P1');
        // setColor check is optional, but logic implies it should be set
    });

    it('shows neutral for unowned cells', () => {
        const cell = engine.state.getCell(0, 0)!;
        cell.owner = null;

        system.update(engine, 0, 0);

        expect(system.ownerText.setText).toHaveBeenCalledWith('Owner: Neutral');
    });
});
