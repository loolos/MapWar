
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MainScene } from '../MainScene';
import Phaser from 'phaser';

// Mocks
vi.mock('../../utils/TextureUtils', () => ({
    TextureUtils: {
        makeTransparent: vi.fn(),
        create: vi.fn(),
        exists: vi.fn().mockReturnValue(true),
        get: vi.fn().mockReturnValue({ destroy: vi.fn() })
    }
}));

// Inline Mock Factory Logic
vi.mock('./NotificationSystem', () => ({
    NotificationSystem: vi.fn().mockImplementation(function () {
        let visible = true, x = 0, y = 0, w = 0, h = 0;
        return {
            x, y, w, h, visible,
            setPosition: vi.fn((nx, ny) => { x = nx; y = ny; }),
            resize: vi.fn((nw, nh) => { w = nw; h = nh; }),
            setVisible: vi.fn((v) => { visible = v; }),
            setScale: vi.fn(),
            update: vi.fn(),
            show: vi.fn(),
            hide: vi.fn(),
            getBounds: () => ({ x, y, width: w, height: h })
        };
    })
}));

vi.mock('./ActionButtonSystem', () => ({
    ActionButtonSystem: vi.fn().mockImplementation(function () {
        let visible = true, x = 0, y = 0, w = 0, h = 0;
        return {
            x, y, w, h, visible,
            setPosition: vi.fn((nx, ny) => { x = nx; y = ny; }),
            resize: vi.fn((nw, nh) => { w = nw; h = nh; }),
            setVisible: vi.fn((v) => { visible = v; }),
            setScale: vi.fn(),
            update: vi.fn(),
            addButton: vi.fn(),
            clearButtons: vi.fn(),
            setGrid: vi.fn(),
            getBounds: () => ({ x, y, width: w, height: h })
        };
    })
}));

vi.mock('./PlayerStatusSystem', () => ({
    PlayerStatusSystem: vi.fn().mockImplementation(function () {
        let visible = true, x = 0, y = 0, w = 0, h = 0;
        return {
            x, y, w, h, visible,
            setPosition: vi.fn((nx, ny) => { x = nx; y = ny; }),
            resize: vi.fn((nw, nh) => { w = nw; h = nh; }),
            setVisible: vi.fn((v) => { visible = v; }),
            setScale: vi.fn(),
            update: vi.fn(),
            getBounds: () => ({ x, y, width: w, height: h })
        };
    })
}));

vi.mock('./CellInfoSystem', () => ({
    CellInfoSystem: vi.fn().mockImplementation(function () {
        let visible = true, x = 0, y = 0, w = 0, h = 0;
        return {
            x, y, w, h, visible,
            setPosition: vi.fn((nx, ny) => { x = nx; y = ny; }),
            resize: vi.fn((nw, nh) => { w = nw; h = nh; }),
            setVisible: vi.fn((v) => { visible = v; }),
            setScale: vi.fn(),
            update: vi.fn(),
            getBounds: () => ({ x, y, width: w, height: h })
        };
    })
}));

vi.mock('./LogSystem', () => ({
    LogSystem: vi.fn().mockImplementation(function () {
        let visible = true, x = 0, y = 0, w = 0, h = 0;
        return {
            x, y, w, h, visible,
            setPosition: vi.fn((nx, ny) => { x = nx; y = ny; }),
            resize: vi.fn((nw, nh) => { w = nw; h = nh; }),
            setVisible: vi.fn((v) => { visible = v; }),
            setScale: vi.fn(),
            addLog: vi.fn(),
            getBounds: () => ({ x, y, width: w, height: h })
        };
    })
}));

vi.mock('./InteractionMenu', () => ({
    InteractionMenu: vi.fn().mockImplementation(function () {
        let visible = true, x = 0, y = 0, w = 0, h = 0;
        return {
            x, y, w, h, visible,
            setPosition: vi.fn((nx, ny) => { x = nx; y = ny; }),
            resize: vi.fn((nw, nh) => { w = nw; h = nh; }),
            setVisible: vi.fn((v) => { visible = v; }),
            setScale: vi.fn(),
            show: vi.fn(),
            hide: vi.fn(),
            getBounds: () => ({ x, y, width: w, height: h })
        };
    })
}));

// Mock Phaser
vi.mock('phaser', () => {
    class MockSize {
        width: number;
        height: number;
        constructor(width: number, height: number) {
            this.width = width;
            this.height = height;
        }
    }

    class MockRectangle {
        x: number;
        y: number;
        w: number;
        h: number;
        constructor(x: number, y: number, w: number, h: number) {
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
        }
        static Contains(rect: any, x: number, y: number) {
            return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
        }
    }

    // Base Mock GameObject
    class MockGameObject {
        x: number = 0;
        y: number = 0;
        width: number = 0;
        height: number = 0;
        visible: boolean = true;

        setPosition = vi.fn(function (this: MockGameObject, x: number, y: number) { this.x = x; this.y = y; return this; });
        setX = vi.fn(function (this: MockGameObject, x: number) { this.x = x; return this; });
        setVisible = vi.fn(function (this: MockGameObject, v: boolean) { this.visible = v; return this; });
        setScale = vi.fn(function (this: MockGameObject) { return this; });
        setOrigin = vi.fn(function (this: MockGameObject) { return this; });
        setInteractive = vi.fn(function (this: MockGameObject) { return this; });
        removeInteractive = vi.fn(function (this: MockGameObject) { return this; });
        zone = vi.fn(() => ({
            setInteractive: vi.fn(),
            on: vi.fn(),
            setSize: vi.fn(),
            setOrigin: vi.fn()
        }));
        on = vi.fn(function (this: MockGameObject) { return this; });
        destroy = vi.fn();
        setDepth = vi.fn(function (this: MockGameObject) { return this; });
        setScrollFactor = vi.fn(function (this: MockGameObject) { return this; });
    }

    class MockContainer extends MockGameObject {
        scene: any;
        list: any[] = [];
        constructor(scene: any) { super(); this.scene = scene; }
        add = vi.fn();
        removeAll = vi.fn();
        getAll = vi.fn(() => []);
        setMask = vi.fn();
        bringToTop = vi.fn(function (this: MockContainer) { return this; });
        sendToBack = vi.fn(function (this: MockContainer) { return this; });
        clear = vi.fn(function (this: MockContainer) { return this; }); // Supports chaining for clean logic if confused with Graphics
    }

    class MockGraphics extends MockGameObject {
        clear = vi.fn(function (this: MockGraphics) { return this; });
        fillStyle = vi.fn(function (this: MockGraphics) { return this; });
        fillRect = vi.fn(function (this: MockGraphics) { return this; });
        lineStyle = vi.fn(function (this: MockGraphics) { return this; });
        strokeRect = vi.fn(function (this: MockGraphics) { return this; });
        fillCircle = vi.fn(function (this: MockGraphics) { return this; });
        fillEllipse = vi.fn(function (this: MockGraphics) { return this; });
        fillTriangle = vi.fn(function (this: MockGraphics) { return this; });
        closePath = vi.fn(function (this: MockGraphics) { return this; }); // Added
        fillPath = vi.fn(function (this: MockGraphics) { return this; }); // Added
        lineBetween = vi.fn(function (this: MockGraphics) { return this; });
        fillRoundedRect = vi.fn(function (this: MockGraphics) { return this; });
        strokeRoundedRect = vi.fn(function (this: MockGraphics) { return this; });
        beginPath = vi.fn(function (this: MockGraphics) { return this; });
        moveTo = vi.fn(function (this: MockGraphics) { return this; });
        lineTo = vi.fn(function (this: MockGraphics) { return this; });
        strokePath = vi.fn(function (this: MockGraphics) { return this; });
        arc = vi.fn(function (this: MockGraphics) { return this; });
        generateTexture = vi.fn();
        createGeometryMask = vi.fn();
    }

    class MockImage extends MockGameObject {
        setDisplaySize = vi.fn(function (this: MockImage) { return this; });
    }

    class MockText extends MockGameObject {
        setText = vi.fn(function (this: MockText) { return this; });
        setStyle = vi.fn(function (this: MockText) { return this; });
    }

    return {
        default: {
            Scene: class {
                cameras: any;
                add: any;
                scale: any;
                load: any;
                input: any;
                time: any;
                make: any;
                textures: any;
                sound: any;
                constructor(_key: string) {
                    this.cameras = { main: { setBackgroundColor: vi.fn(), setViewport: vi.fn() } };
                    this.add = {
                        container: vi.fn((x, y) => { const c = new MockContainer(this); c.x = x || 0; c.y = y || 0; return c; }),
                        group: vi.fn(() => ({ clear: vi.fn(), add: vi.fn(), getLength: vi.fn(() => 0), getChildren: vi.fn(() => []) })),
                        image: vi.fn(() => new MockImage()),
                        graphics: vi.fn(() => new MockGraphics()),
                        text: vi.fn(() => new MockText()),
                        existing: vi.fn()
                    };
                    this.scale = { width: 800, height: 600, on: vi.fn(), gameSize: { width: 800, height: 600 } };
                    this.load = { image: vi.fn(), audio: vi.fn() };
                    this.input = {
                        on: vi.fn(), enabled: true,
                        keyboard: {
                            on: vi.fn(), addCapture: vi.fn(),
                            addKeys: vi.fn(() => ({ up: { isDown: false }, down: { isDown: false }, left: { isDown: false }, right: { isDown: false } })),
                            createCursorKeys: vi.fn(() => ({ up: { isDown: false }, down: { isDown: false }, left: { isDown: false }, right: { isDown: false } }))
                        }
                    };
                    this.make = { graphics: vi.fn(() => new MockGraphics()) };
                    this.time = { delayedCall: vi.fn((_delay, callback) => callback()) };
                    this.textures = { exists: vi.fn(() => false) };
                    this.sound = { get: vi.fn(), add: vi.fn(() => ({ play: vi.fn(), stop: vi.fn(), pause: vi.fn(), resume: vi.fn() })), play: vi.fn() };
                }
            },
            GameObjects: {
                Graphics: MockGraphics,
                Group: class { },
                Container: MockContainer,
                Image: MockImage,
                Text: MockText
            },
            Structs: { Size: MockSize },
            Input: { Keyboard: { KeyCodes: { UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39 } } },
            Math: { Clamp: vi.fn((v, min, max) => Math.max(min, Math.min(v, max))) },
            Geom: { Rectangle: MockRectangle },
            Display: { Masks: { GeometryMask: class { } } }
        }
    };
});

describe('UI Layout Validation', () => {
    let scene: MainScene;

    const screenSizes = [
        { name: 'Mobile Portrait (iPhone SE)', width: 375, height: 667 },
        { name: 'Mobile Landscape', width: 667, height: 375 },
        { name: 'Tablet Portrait (iPad)', width: 768, height: 1024 },
        { name: 'Tablet Landscape', width: 1024, height: 768 },
        { name: 'Desktop HD', width: 1920, height: 1080 }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        try {
            scene = new MainScene();
            scene.create(); // Initialize systems
        } catch (e) {
            console.error('CRASH in beforeEach create:', e);
        }
    });

    describe.each(screenSizes)('$name ($width x $height)', ({ width, height }) => {
        it('should ensure no overlap and valid bounds', () => {
            // console.log(`Test: ${width}x${height}`);
            try {
                scene.resize(new Phaser.Structs.Size(width, height));
            } catch (e) {
                console.error(`CRASH in resize at ${width}x${height}:`, e);
                throw e;
            }

            const systems = [
                { name: 'PlayerStatus', sys: scene.playerStatusSystem },
                { name: 'CellInfo', sys: scene.infoSystem },
                { name: 'Buttons', sys: scene.buttonSystem },
                { name: 'Log', sys: scene.logSystem },
                { name: 'InteractionMenu', sys: scene.interactionMenu }
            ];

            for (let i = 0; i < systems.length; i++) {
                if (!systems[i].sys) continue;

                const bounds = (systems[i].sys as any).getBounds();

                // Bounds Check
                const inBounds = bounds.x >= -1 && bounds.y >= -1 &&
                    bounds.x + bounds.width <= width + 5 &&
                    bounds.y + bounds.height <= height + 5;

                if (!inBounds) {
                    console.error(`${systems[i].name} OUT OF BOUNDS: [${bounds.x}, ${bounds.y}, ${bounds.width}, ${bounds.height}] in ${width}x${height}`);
                }
                expect(inBounds).toBeTruthy();

                // Overlap Check
                for (let j = i + 1; j < systems.length; j++) {
                    if (!systems[j].sys) continue;
                    const rectB = (systems[j].sys as any).getBounds();

                    // Check Overlap
                    const noOverlap = (bounds.x + bounds.width <= rectB.x) ||
                        (rectB.x + rectB.width <= bounds.x) ||
                        (bounds.y + bounds.height <= rectB.y) ||
                        (rectB.y + rectB.height <= bounds.y);

                    if (!noOverlap) {
                        console.error(`Overlap detected between ${systems[i].name} and ${systems[j].name} at ${width}x${height}`);
                        console.error(`${systems[i].name}: x=${bounds.x}, y=${bounds.y}, w=${bounds.width}, h=${bounds.height}`);
                        console.error(`${systems[j].name}: x=${rectB.x}, y=${rectB.y}, w=${rectB.width}, h=${rectB.height}`);
                    }

                    expect(noOverlap).toBeTruthy();
                }
            }
        });
    });
});
