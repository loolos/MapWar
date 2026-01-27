
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MainScene } from './MainScene';
import { GameConfig } from '../core/GameConfig';


// Mock TextureUtils to avoid Canvas errors
vi.mock('../utils/TextureUtils', () => ({
    TextureUtils: {
        makeTransparent: vi.fn()
    }
}));

// Mock Phaser
vi.mock('phaser', () => {
    class Scene {
        cameras: any;
        add: any;
        scale: any;
        load: any;
        input: any;
        time: any;
        make: any;
        textures: any;
        sound: any; // NEW
        events: any;

        constructor(_key: string) {
            this.sound = {
                get: vi.fn(),
                add: vi.fn(() => ({
                    play: vi.fn(),
                    stop: vi.fn(),
                    pause: vi.fn(),
                    resume: vi.fn()
                })),
                play: vi.fn(),
                context: {
                    createOscillator: vi.fn(() => ({
                        connect: vi.fn(),
                        start: vi.fn(),
                        stop: vi.fn(),
                        frequency: { setValueAtTime: vi.fn() },
                        type: 'sine'
                    })),
                    createGain: vi.fn(() => ({
                        connect: vi.fn(),
                        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
                    })),
                    createBuffer: vi.fn(() => ({
                        getChannelData: vi.fn(() => new Float32Array(1024))
                    })),
                    createBufferSource: vi.fn(() => ({
                        connect: vi.fn(),
                        start: vi.fn(),
                        stop: vi.fn(),
                        buffer: null
                    })),
                    createBiquadFilter: vi.fn(() => ({
                        connect: vi.fn(),
                        frequency: { setValueAtTime: vi.fn(), value: 0 },
                        type: 'lowpass'
                    })),
                    currentTime: 0,
                    state: 'running',
                    destination: {}
                }
            };

            this.events = {
                on: vi.fn(),
                once: vi.fn(),
                off: vi.fn(),
                emit: vi.fn()
            };


            this.cameras = {
                main: {
                    setBackgroundColor: vi.fn(),
                    setViewport: vi.fn()
                }
            };
            this.add = {
                container: vi.fn(() => ({
                    add: vi.fn(),
                    setPosition: vi.fn(),
                    destroy: vi.fn(),
                    clear: vi.fn(),
                    sendToBack: vi.fn(),
                    setVisible: vi.fn(),
                    setScale: vi.fn(),
                    x: 0,
                    y: 0,
                    getAll: vi.fn(() => []),
                    removeAll: vi.fn(),
                    list: [] // Emulate public list property of Container
                })),
                group: vi.fn(() => ({
                    clear: vi.fn(),
                    add: vi.fn(),
                    getLength: vi.fn(() => 0),
                    getChildren: vi.fn(() => [])
                })),
                image: vi.fn(() => ({
                    setDisplaySize: vi.fn(),
                    setOrigin: vi.fn(),
                    setInteractive: vi.fn(),
                    on: vi.fn(),
                    setVisible: vi.fn(),
                    setPosition: vi.fn(),
                    destroy: vi.fn()
                })),
                graphics: vi.fn(() => {
                    const g = {
                        clear: vi.fn(() => g),
                        fillStyle: vi.fn(() => g),
                        fillRect: vi.fn(() => g),
                        lineStyle: vi.fn(() => g),
                        strokeRect: vi.fn(() => g),
                        fillCircle: vi.fn(() => g),
                        fillRoundedRect: vi.fn(() => g),
                        strokeRoundedRect: vi.fn(() => g),
                        beginPath: vi.fn(() => g),
                        moveTo: vi.fn(() => g),
                        lineTo: vi.fn(() => g),
                        strokePath: vi.fn(() => g),
                        lineBetween: vi.fn(() => g), // Added
                        arc: vi.fn(() => g),
                        setVisible: vi.fn(() => g),
                        setDepth: vi.fn(() => g), // Added for treasure graphics
                        destroy: vi.fn(),
                        createGeometryMask: vi.fn(), // Added (if used by add.graphics?)
                        generateTexture: vi.fn(), // Added
                        closePath: vi.fn(() => g), // Added
                        fillPath: vi.fn(() => g), // Added
                        fillTriangle: vi.fn(() => g) // Added
                    };
                    return g;
                }),
                text: vi.fn(() => {
                    const t = {
                        setOrigin: vi.fn(() => t),
                        setInteractive: vi.fn(() => t),
                        on: vi.fn(() => t),
                        setStyle: vi.fn(() => t),
                        setText: vi.fn(() => t),
                        setScrollFactor: vi.fn(() => t),
                        setDepth: vi.fn(() => t),
                        width: 100,
                        height: 20, // Added height
                        setScale: vi.fn(() => t),
                        setPosition: vi.fn(() => t)
                    };
                    return t;
                }),
                existing: vi.fn(),
                zone: vi.fn(() => {
                    const z = {
                        setInteractive: vi.fn(() => z),
                        on: vi.fn(() => z),
                        setSize: vi.fn(() => z),
                        setOrigin: vi.fn(() => z),
                        destroy: vi.fn()
                    };
                    return z;
                })
            };
            this.scale = {
                width: 800,
                height: 600,
                on: vi.fn(),
                gameSize: { width: 800, height: 600 }
            };
            this.load = { image: vi.fn() };
            this.input = {
                on: vi.fn(),
                enabled: true,
                keyboard: {
                    on: vi.fn(),
                    addCapture: vi.fn(),
                    addKeys: vi.fn(() => ({
                        up: { isDown: false },
                        down: { isDown: false },
                        left: { isDown: false },
                        right: { isDown: false }
                    })),
                    createCursorKeys: vi.fn(() => ({
                        up: { isDown: false },
                        down: { isDown: false },
                        left: { isDown: false },
                        right: { isDown: false }
                    }))
                }
            };
            this.make = {
                graphics: vi.fn(() => {
                    const g = {
                        fillStyle: vi.fn(() => g),
                        fillRect: vi.fn(() => g),
                        fillRoundedRect: vi.fn(() => g), // Added for treasure textures
                        strokeRoundedRect: vi.fn(() => g), // Added
                        fillCircle: vi.fn(() => g), // Added
                        generateTexture: vi.fn(),
                        destroy: vi.fn(),
                        createGeometryMask: vi.fn(), // Added
                        lineStyle: vi.fn(() => g), // Added for castle
                        beginPath: vi.fn(() => g),
                        moveTo: vi.fn(() => g),
                        lineTo: vi.fn(() => g),
                        strokePath: vi.fn(() => g),
                        fillEllipse: vi.fn(() => g),
                        fillTriangle: vi.fn(() => g),
                        closePath: vi.fn(() => g), // Added
                        fillPath: vi.fn(() => g), // Added
                        clear: vi.fn(() => g),
                        strokeRect: vi.fn(() => g),
                        lineBetween: vi.fn(() => g),
                        arc: vi.fn(() => g),
                        setVisible: vi.fn(() => g),
                        setDepth: vi.fn(() => g)
                    };
                    return g;
                })
            };
            this.time = {
                delayedCall: vi.fn((_delay, callback) => callback())
            };
            this.textures = {
                exists: vi.fn(() => false),
                addGLTexture: vi.fn(),
                get: vi.fn(() => ({ getSourceImage: vi.fn() })),
                on: vi.fn(), // Added
                addCanvas: vi.fn() // Added for processTransparency
            };
        }
    }

    return {
        default: {
            Scene,
            GameObjects: {
                Graphics: class { },
                Group: class { },
                Container: class {
                    scene: any;
                    constructor(scene: any) {
                        this.scene = scene;
                    }
                    add = vi.fn();
                    removeAll = vi.fn();
                    setPosition = vi.fn();
                    setVisible = vi.fn();
                    destroy = vi.fn();
                    setScale = vi.fn();
                    width = 0;
                    height = 0;
                    x = 0;
                    y = 0;
                }
            },
            Structs: {
                Size: class {
                    width: number;
                    height: number;
                    constructor(w: number, h: number) { this.width = w; this.height = h; }
                }
            },
            Input: {
                Keyboard: {
                    KeyCodes: {
                        UP: 38,
                        DOWN: 40,
                        LEFT: 37,
                        RIGHT: 39
                    }
                }
            },
            Math: {
                Clamp: vi.fn((v: number, min: number, max: number) => Math.max(min, Math.min(v, max)))
            },
            Geom: {
                Rectangle: class {
                    x: number; y: number; width: number; height: number;
                    constructor(x: number, y: number, w: number, h: number) {
                        this.x = x; this.y = y; this.width = w; this.height = h;
                    }
                    contains(x: number, y: number) {
                        return x >= this.x && x <= this.x + this.width && y >= this.y && y <= this.y + this.height;
                    }
                }
            }
        }
    };
});

// Mock UI Systems to avoid deep dependencies
vi.mock('./ui/NotificationSystem', () => ({
    NotificationSystem: vi.fn().mockImplementation(function () {
        return {
            show: vi.fn(),
            resize: vi.fn(),
            setVisible: vi.fn(),
            setScale: vi.fn(),
            setPosition: vi.fn()
        };
    })
}));

vi.mock('./ui/ActionButtonSystem', () => ({
    ActionButtonSystem: vi.fn().mockImplementation(function () {
        return {
            addButton: vi.fn(),
            clearButtons: vi.fn(),
            setGrid: vi.fn(),
            resize: vi.fn(),
            setScale: vi.fn(),
            setPosition: vi.fn()
        };
    })
}));

vi.mock('./ui/PlayerStatusSystem', () => ({
    PlayerStatusSystem: vi.fn().mockImplementation(function () {
        return {
            update: vi.fn(),
            resize: vi.fn(),
            setScale: vi.fn(),
            setPosition: vi.fn(),
            BASE_WIDTH: 260
        };
    })
}));

vi.mock('./ui/CellInfoSystem', () => ({
    CellInfoSystem: vi.fn().mockImplementation(function () {
        return {
            update: vi.fn(),
            resize: vi.fn(),
            setScale: vi.fn(),
            setPosition: vi.fn()
        };
    })
}));

vi.mock('./ui/LogSystem', () => ({
    LogSystem: vi.fn().mockImplementation(function () {
        return {
            addLog: vi.fn(),
            resize: vi.fn(),
            setVisible: vi.fn(),
            setPosition: vi.fn()
        };
    })
}));

vi.mock('../core/audio/SoundManager', () => {
    const mockStartContext = vi.fn().mockResolvedValue(undefined);
    const mockPlayBgm = vi.fn().mockResolvedValue(undefined);
    
    return {
        SoundManager: vi.fn().mockImplementation(function () {
            return {
                playSfx: vi.fn(),
                playBgm: mockPlayBgm,
                playStartFanfare: vi.fn(),
                startContext: mockStartContext,
                stopBgm: vi.fn(),
                setBgmState: vi.fn(),
                toggleMute: vi.fn(),
                isMuted: false
            };
        })
    };
});


describe('MainScene', () => {
    let scene: MainScene;

    beforeEach(() => {
        // Clear mocks
        vi.clearAllMocks();

        scene = new MainScene();
        // Manually trigger create to setup objects since we aren't running proper Phaser boot
        scene.create();
    });

    it('initializes terrain visuals on creation', () => {
        expect(scene.terrainGroup).toBeDefined();
        // Check if images were created. initializeTerrainVisuals calls this.add.image
        // The mock add.image should be called for Grid Size * Grid Size (100 times)
        // Check logic in MainScene.create calls initializeTerrainVisuals via resize -> ...
        // Wait, resize is called in create. So yes.
        expect(scene.add.image).toHaveBeenCalled();
    });

    it('refreshes terrain visuals on game restart', () => {
        const initSpy = vi.spyOn(scene as any, 'initializeTerrainVisuals');

        // Trigger Restart
        scene.engine.restartGame();

        expect(initSpy).toHaveBeenCalled();
        // Map is 10x10 (640x640)
        // Window 800x600. Sidebar 260. Bottom 200.
        // Map Area: W = 800 - (240*2) = 320. H = 600.
        // ScaleX = (320-40)/640 = 280/640 = 0.4375
        // ScaleY = (600-40)/640 = 560/640 = 0.875
        // MinScale = 0.4375

        // Scale should be 0.4375
        expect(scene.mapContainer.setScale).toHaveBeenCalledWith(expect.closeTo(0.4375, 0.001));
        expect(scene.terrainGroup.clear).toHaveBeenCalledWith(true, true);
    });

    it('removes overlay on restart', () => {
        // Simulate overlay existing
        scene.drawMap = vi.fn(); // Mock drawMap to avoid complex graphics calls
        scene.showVictoryOverlay('P1');

        expect(scene.overlayContainer).toBeDefined();
        const destroySpy = scene.overlayContainer!.destroy as any;

        // Restart
        scene.engine.restartGame();

        expect(destroySpy).toHaveBeenCalled();
        expect(scene.overlayContainer).toBeNull();
    });

    it('updates UI on restart', () => {
        const updateUISpy = vi.spyOn(scene, 'updateUI');
        scene.engine.restartGame();
        expect(updateUISpy).toHaveBeenCalled();
        expect(scene.logSystem.addLog).toHaveBeenCalledWith("Game Restarted!", 'info');
    });

    it('correctly calculates grid coordinates when map is scaled and offset', () => {
        // Setup Map Transform
        scene.tileSize = 64;
        scene.mapContainer.x = 100;
        scene.mapContainer.y = 50;
        scene.mapContainer.scaleX = 0.5; // Zoomed out to 50%
        scene.mapContainer.scaleX = 0.5; // Zoomed out to 50%
        scene.mapContainer.scaleY = 0.5;

        // Bypass mapBounds check for this specific coordinate test as we are manually positioning the container
        (scene as any).mapBounds = null;

        // Target: Cell [1, 1]
        // World Pixel at 100% scale = (64, 64) -> (128, 128)
        // Scaled Pixel = 64 * 0.5 = 32
        // Map space target = x=64+32=96, y=64+32=96 (center of 1,1)
        // Screen Space = MapOrigin + (MapSpace * Scale)
        // Target Screen X = 100 + (1 * 64 + 32) * 0.5 = 100 + 48 = 148?
        // Wait, logic in code: localX = (pointer.x - container.x) / scale
        // We want localX to be inside Cell [1, 1] (range 64-127)
        // Let's target localX = 96 (center of col 1)
        // 96 = (screenX - 100) / 0.5  => 48 = screenX - 100 => screenX = 148.

        // Let's try a simpler one: Cell [0, 0] at 10,10 inside the cell.
        // localX = 10.
        // 10 = (screenX - 100) / 0.5 => 5 = screenX - 100 => screenX = 105.

        const pointer = { x: 105, y: 55 } as any; // Map Y=50. (55-50)/0.5 = 10. Row 0.

        // Mock Engine State
        scene.engine.isGameOver = false;
        scene.engine.state.players['P1'].isAI = false;

        scene.handleInput(pointer);

        expect(scene.selectedRow).toBe(0);
        expect(scene.selectedCol).toBe(0);

        // Test Cell [2, 1]
        // Row 2 = 128px start. Center = 128 + 32 = 160.
        // Col 1 = 64px start. Center = 64 + 32 = 96.
        // Screen X = 100 + (96 * 0.5) = 148
        // Screen Y = 50 + (160 * 0.5) = 130

        const pointer2 = { x: 148, y: 130 } as any;
        scene.handleInput(pointer2);

        expect(scene.selectedRow).toBe(2);
        expect(scene.selectedCol).toBe(1);
    });

    it('renders semi-transparent overlays for owned tiles and no overlay for neutral', () => {
        // Setup Grid: [0,0] = Neutral, [0,1] = Owned P1
        const grid = scene.engine.state.grid;
        grid[0][0].owner = null;
        grid[0][1].owner = 'P1';

        // Mock Graphics
        const fillStyleSpy = vi.spyOn(scene.gridGraphics, 'fillStyle');

        scene.drawMap();

        // Expectation 1: Owned Tile [0,1] should draw with Alpha 0.5
        // Check if fillStyle was called with (Color, 0.5)
        // Note: precise call order might vary, but we look for *a* call.
        expect(fillStyleSpy).toHaveBeenCalledWith(GameConfig.COLORS.P1, 0.7);

        // Expectation 2: Neutral Tile [0,0] should NOT draw an overlay
        // How to ensure it didn't draw for neutral? 
        // We can check that fillStyle was NOT called with Neutral Color (0x555555) or opaque alpha (1)
        // Previously neutral was drawn with 0x555555. Now it shouldn't be drawn at all.
        // Let's verify it is NOT called with 0x555555 (NEUTRAL constant)
        expect(fillStyleSpy).not.toHaveBeenCalledWith(0x555555, expect.anything());
        // Also check it wasn't called with undefined/1.0 alpha for these tiles (only strokes)
    });

    it('adds mute button to action system', () => {
        const addButtonSpy = scene.buttonSystem.addButton as any;

        // Setup initial sound state
        scene.soundManager.isMuted = false;

        addButtonSpy.mockClear();
        scene.setupButtons();

        // Should add Clear, End Turn, and Mute (Clear/End Turn take optional { disabled } for AI turn)
        expect(addButtonSpy).toHaveBeenCalledTimes(3);
        expect(addButtonSpy).toHaveBeenCalledWith(0, 0, "CLEAR", expect.any(Function), expect.anything());
        expect(addButtonSpy).toHaveBeenCalledWith(1, 0, "END TURN", expect.any(Function), expect.anything());
        expect(addButtonSpy).toHaveBeenCalledWith(0, 1, "MUTE 🔊", expect.any(Function));

        scene.soundManager.isMuted = true;
        scene.setupButtons();
        expect(addButtonSpy).toHaveBeenCalledWith(0, 0, "CLEAR", expect.any(Function), expect.anything());
        expect(addButtonSpy).toHaveBeenCalledWith(1, 0, "END TURN", expect.any(Function), expect.anything());
        expect(addButtonSpy).toHaveBeenCalledWith(0, 1, "UNMUTE 🔇", expect.any(Function));
    });
});
