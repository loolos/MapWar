
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MainScene } from './MainScene';
import { GameEngine } from '../core/GameEngine';

// Mock Phaser
vi.mock('phaser', () => {
    class Scene {
        cameras: any;
        add: any;
        scale: any;
        load: any;
        input: any;
        time: any;

        constructor(key: string) {
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
                    sendToBack: vi.fn()
                })),
                group: vi.fn(() => ({
                    clear: vi.fn(),
                    add: vi.fn()
                })),
                image: vi.fn(() => ({
                    setDisplaySize: vi.fn(),
                    setOrigin: vi.fn(),
                    setInteractive: vi.fn(),
                    on: vi.fn()
                })),
                graphics: vi.fn(() => {
                    const g = {
                        clear: vi.fn(() => g),
                        fillStyle: vi.fn(() => g),
                        fillRect: vi.fn(() => g),
                        lineStyle: vi.fn(() => g),
                        strokeRect: vi.fn(() => g),
                        fillCircle: vi.fn(() => g)
                    };
                    return g;
                }),
                text: vi.fn(() => {
                    const t = {
                        setOrigin: vi.fn(() => t),
                        setInteractive: vi.fn(() => t),
                        on: vi.fn(() => t),
                        setStyle: vi.fn(() => t),
                        width: 100,
                        setScale: vi.fn(() => t)
                    };
                    return t;
                }),
            };
            this.scale = {
                width: 800,
                height: 600,
                on: vi.fn(),
                gameSize: { width: 800, height: 600 }
            };
            this.load = { image: vi.fn() };
            this.input = { on: vi.fn(), enabled: true };
            this.time = { delayedCall: vi.fn() };
        }
    }

    return {
        default: {
            Scene,
            GameObjects: {
                Graphics: class { },
                Group: class { },
                Container: class { }
            },
            Structs: {
                Size: class {
                    width: number;
                    height: number;
                    constructor(w, h) { this.width = w; this.height = h; }
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
        const initSpy = vi.spyOn(scene, 'initializeTerrainVisuals');

        // Trigger Restart
        scene.engine.restartGame();

        expect(initSpy).toHaveBeenCalled();
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
        expect(scene.notificationSystem.show).toHaveBeenCalledWith("Game Restarted!", 'info');
    });
});
