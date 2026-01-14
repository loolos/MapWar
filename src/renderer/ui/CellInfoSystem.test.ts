
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CellInfoSystem } from './CellInfoSystem';
import Phaser from 'phaser';

// Mock Phaser
vi.mock('phaser', () => {
    class MockGameObject {
        setText = vi.fn();
        setStyle = vi.fn();
        setWordWrapWidth = vi.fn();
        setFontSize = vi.fn();
        setPosition = vi.fn();
        setColor = vi.fn();
        setOrigin = vi.fn(() => this);
        setInteractive = vi.fn(() => this);
        on = vi.fn(() => this);
        setVisible = vi.fn();
        height = 20;
    }
    class MockGraphics {
        clear = vi.fn();
        fillStyle = vi.fn();
        fillRoundedRect = vi.fn();
        lineStyle = vi.fn();
        strokeRoundedRect = vi.fn();
        lineBetween = vi.fn();
        setPosition = vi.fn();
        createGeometryMask = vi.fn();
        beginPath = vi.fn();
        moveTo = vi.fn();
        lineTo = vi.fn();
        closePath = vi.fn();
        fillPath = vi.fn();
    }
    class MockContainer {
        scene: any;
        constructor(scene: any) { this.scene = scene; }
        add = vi.fn();
        setMask = vi.fn();
        list = [];
        setPosition = vi.fn();
        setVisible = vi.fn();
    }
    return {
        default: {
            Scene: class { },
            GameObjects: {
                Container: MockContainer,
                Graphics: MockGraphics,
                Text: MockGameObject,
                Zone: class {
                    setOrigin = vi.fn(() => this);
                    setInteractive = vi.fn(() => this);
                    on = vi.fn(() => this);
                    setSize = vi.fn();
                }
            },
            Math: {
                Clamp: vi.fn((v, min, max) => Math.max(min, Math.min(v, max)))
            },
            Display: { Masks: { GeometryMask: class { } } }
        }
    };
});

describe('CellInfoSystem', () => {
    let system: CellInfoSystem;
    let sceneMock: any;

    beforeEach(() => {
        sceneMock = {
            add: {
                existing: vi.fn(),
                graphics: vi.fn(() => new Phaser.GameObjects.Graphics(sceneMock)),
                container: vi.fn(() => new Phaser.GameObjects.Container(sceneMock)),
                text: vi.fn(() => new Phaser.GameObjects.Text(sceneMock, 0, 0, '', {})),
                zone: vi.fn(() => {
                    const z = {
                        setOrigin: vi.fn(() => z),
                        setInteractive: vi.fn(() => z),
                        on: vi.fn(() => z),
                        setSize: vi.fn(() => z)
                    };
                    return z;
                })
            },
            make: {
                graphics: vi.fn(() => new Phaser.GameObjects.Graphics(sceneMock))
            },
            input: { on: vi.fn() }
        };
        system = new CellInfoSystem(sceneMock, 0, 0, 200);
    });

    it('initializes with default font sizes', () => {
        // Init happens at 200? No, this test triggers resize.
        // Let's use standard resize values.
        system.resize(200, 400, 0, 0);

        // Width 200 / Ref 160 = 1.25 scale.
        // Base: 13, 11, 10
        // Header (13): 13 * 1.25 = 16.25. Clamped Max (13+3=16). -> 16.0
        // Std (11): 11 * 1.25 = 13.75. Clamped Max (11+3=14). -> 13.8 (wait, 13.75 < 14)
        // Small (10): 10 * 1.25 = 12.5. Clamped Max (10+3=13). -> 12.5

        // Wait, 13 * 1.25 = 16.25. Max is 16. So it should be 16.0.
        // 11 * 1.25 = 13.75. Max is 14. So 13.8.
        // 10 * 1.25 = 12.5. Max is 13. So 12.5.

        expect(system.headerText.setStyle).toHaveBeenCalledWith(expect.objectContaining({ fontSize: '16.0px' }));
        expect(system.typeText.setStyle).toHaveBeenCalledWith(expect.objectContaining({ fontSize: '13.8px' }));
        expect(system.descText.setStyle).toHaveBeenCalledWith(expect.objectContaining({ fontSize: '12.5px' }));
    });

    it('scales up when width increases (clamped)', () => {
        // Resize to 300 (1.875x)
        // Max: Base+3 (16, 14, 13)
        // All will hit max.
        system.resize(300, 400, 0, 0);

        expect(system.headerText.setStyle).toHaveBeenCalledWith(expect.objectContaining({ fontSize: '16.0px' }));
        expect(system.typeText.setStyle).toHaveBeenCalledWith(expect.objectContaining({ fontSize: '14.0px' }));
        expect(system.descText.setStyle).toHaveBeenCalledWith(expect.objectContaining({ fontSize: '13.0px' }));
    });

    it('scales down when width decreases (clamped)', () => {
        // Resize to 100 (0.625x)
        // Min 7.2
        // Header: 13 * 0.625 = 8.125 -> 8.1
        // Std: 11 * 0.625 = 6.875 -> 7.2 (Min)
        // Small: 10 * 0.625 = 6.25 -> 7.2 (Min)

        system.resize(100, 400, 0, 0);

        expect(system.headerText.setStyle).toHaveBeenCalledWith(expect.objectContaining({ fontSize: '8.1px' }));
        expect(system.typeText.setStyle).toHaveBeenCalledWith(expect.objectContaining({ fontSize: '7.2px' }));
        expect(system.descText.setStyle).toHaveBeenCalledWith(expect.objectContaining({ fontSize: '7.2px' }));
    });

    it('scales proportionally for moderate changes', () => {
        // Resize to 150 (0.9375x)
        // Standard (11): 11 * 0.9375 = 10.3125 -> 10.3
        system.resize(150, 400, 0, 0);
        expect(system.typeText.setStyle).toHaveBeenCalledWith(expect.objectContaining({ fontSize: '10.3px' }));
    });
});
