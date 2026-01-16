
import Phaser from 'phaser';
import { GameEngine } from '../core/GameEngine';
import { GameConfig } from '../core/GameConfig';
import { NotificationSystem } from './ui/NotificationSystem';
import { ActionButtonSystem } from './ui/ActionButtonSystem';
import { PlayerStatusSystem } from './ui/PlayerStatusSystem';
import { CellInfoSystem } from './ui/CellInfoSystem';
import { SaveRegistry } from '../core/saves/SaveRegistry';
import { TextureUtils } from '../utils/TextureUtils';
import { SoundManager } from '../core/audio/SoundManager'; // NEW

import { LogSystem } from './ui/LogSystem';
import { InteractionMenu } from './ui/InteractionMenu';
import type { LogType } from '../core/GameEvents';
import { AuraVisualizer } from './AuraVisualizer';

// ... imports

export class MainScene extends Phaser.Scene {
    engine!: GameEngine;
    tileSize: number = GameConfig.UI.TILE_SIZE;
    // Graphical Layers
    gridGraphics!: Phaser.GameObjects.Graphics;
    terrainGraphics!: Phaser.GameObjects.Graphics;
    selectionGraphics!: Phaser.GameObjects.Graphics;
    highlightGraphics!: Phaser.GameObjects.Graphics;
    terrainGroup!: Phaser.GameObjects.Group;

    // UI Systems
    notificationSystem!: NotificationSystem;
    buttonSystem!: ActionButtonSystem;
    playerStatusSystem!: PlayerStatusSystem;
    infoSystem!: CellInfoSystem;
    logSystem!: LogSystem;
    private turnEventText?: Phaser.GameObjects.Text;
    private activeTurnEvent?: { name: string; message: string; sfxKey?: string };
    private peaceDayGlow?: Phaser.GameObjects.Graphics;
    private peaceDayActive: boolean = false;

    soundManager!: SoundManager; // NEW
    interactionMenu!: InteractionMenu; // NEW
    auraVisualizer!: AuraVisualizer; // NEW

    // Interaction State
    selectedRow: number | null = null;
    selectedCol: number | null = null;

    // Layout State
    trBg!: Phaser.GameObjects.Graphics;
    blBg!: Phaser.GameObjects.Graphics;
    brBg!: Phaser.GameObjects.Graphics;
    mapContainer!: Phaser.GameObjects.Container;
    mapOffsetX: number = 0;
    mapOffsetY: number = 0;

    // Camera Controls
    minTileSize: number = GameConfig.UI_TILE_MIN_SIZE; // Minimum playable tile size (0.5x scale)
    isMapScrollable: boolean = false;
    scrollKeys!: {
        up: Phaser.Input.Keyboard.Key,
        down: Phaser.Input.Keyboard.Key,
        left: Phaser.Input.Keyboard.Key,
        right: Phaser.Input.Keyboard.Key
    };
    cameraControlsContainer!: Phaser.GameObjects.Container;
    cursors?: Phaser.Types.Input.Keyboard.CursorKeys;

    // Map area for UI positioning
    private arrowPositions: { up: { x: number, y: number }, down: { x: number, y: number }, left: { x: number, y: number }, right: { x: number, y: number } } | null = null;
    private terrainSprites: Phaser.GameObjects.Image[][] = [];


    // Viewport State
    viewRow: number = 0;
    viewCol: number = 0;
    visibleRows: number = GameConfig.UI_DEFAULT_VISIBLE_ROWS;
    visibleCols: number = GameConfig.UI_DEFAULT_VISIBLE_COLS;
    isViewportMode: boolean = false;

    constructor() {
        super('MainScene');
    }

    preload() {
        this.load.image('ui_button', 'assets/ui_button.png');
        // this.load.image('robot', 'assets/robot.png'); // Unused
        // this.load.image('human', 'assets/human.png'); // Unused
        this.load.image('tile_plain', 'assets/tile_plain.png');
        this.load.image('tile_hill', 'assets/tile_hill.png');
        this.load.image('tile_water', 'assets/tile_water.png');

        // Tactical UI Assets (Load as Raw)
        this.load.image('raw_icon_gold', 'assets/icon_gold_blackbg_1767659375024.png');
        // this.load.image('ui_icon_warrior', 'assets/ui_icon_warrior.png'); // Unused
        // this.load.image('ui_icon_robot', 'assets/ui_icon_robot.png'); // Unused

        // Gold Mine Asset
        this.load.image('gold_mine', 'assets/gold_mine.png');

        // Avatar Assets (Raw)
        this.load.image('raw_icon_human', 'assets/cartoon_human.png');
        this.load.image('raw_icon_robot', 'assets/cartoon_robot.png');

        // Audio Assets (Commented out as files are missing in repository. SoundManager uses synth fallbacks.)
        /*
        this.load.audio('sfx_select', 'assets/audio/sfx_select.mp3');
        this.load.audio('sfx_move', 'assets/audio/sfx_move.mp3');
        this.load.audio('sfx_attack', 'assets/audio/sfx_attack.mp3');
        this.load.audio('sfx_capture', 'assets/audio/sfx_capture.mp3');
        this.load.audio('sfx_eliminate', 'assets/audio/sfx_eliminate.mp3');
        this.load.audio('sfx_victory', 'assets/audio/sfx_victory.mp3');
        */
    }

    create(data?: any) {
        // 1. Initialize Engine
        const mapType = data && data.mapType ? data.mapType : 'default';
        this.engine = new GameEngine(data && data.playerConfigs ? data.playerConfigs : [], mapType);

        // 2. Check for Preset Load
        if (data && data.loadPreset) {
            const key = data.loadPreset as string;
            const save = SaveRegistry[key];

            if (save) {
                const presetJson = save.getData();
                this.engine.loadState(presetJson);

                // Notification
                this.time.delayedCall(GameConfig.UI_SCENE_START_DELAY, () => {
                    this.logSystem.addLog(`Loaded: ${save.name}`, 'info');
                });

                // Force Resize to Center Map on new Dimensions
                this.time.delayedCall(GameConfig.UI_SCENE_RESIZE_RETRY_DELAY, () => {
                    this.resize(this.scale.gameSize);
                });
            }
        }

        // Process Textures (Runtime Transparency)
        TextureUtils.makeTransparent(this, 'raw_icon_gold', 'icon_gold_3d', 40);
        // ...
        // ...
        TextureUtils.makeTransparent(this, 'raw_icon_human', 'icon_human_cartoon', 30, 'white');
        TextureUtils.makeTransparent(this, 'raw_icon_robot', 'icon_robot_cartoon', 30, 'black');

        this.cameras.main.setBackgroundColor(GameConfig.COLORS.BG);

        // Input
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.handleInput(pointer);
        });

        // Keyboard Shortcuts
        if (this.input.keyboard) {
            this.input.keyboard.addCapture('SPACE'); // Prevent scrolling
            this.input.keyboard.on('keydown-SPACE', () => {
                this.engine.endTurn();
            });
            // Setup Arrow Keys for Map Scroll
            this.scrollKeys = this.input.keyboard.addKeys({
                up: Phaser.Input.Keyboard.KeyCodes.UP,
                down: Phaser.Input.Keyboard.KeyCodes.DOWN,
                left: Phaser.Input.Keyboard.KeyCodes.LEFT,
                right: Phaser.Input.Keyboard.KeyCodes.RIGHT
            }) as any;
        }

        // ---------------------------------------------------------
        // INITIALIZE GRAPHICS & SYSTEMS (Empty/Default)
        // ---------------------------------------------------------

        // Map Container
        this.mapContainer = this.add.container(0, 0);
        this.terrainGroup = this.add.group();

        // Graphics Layers
        this.gridGraphics = this.add.graphics();
        this.terrainGraphics = this.add.graphics();
        this.selectionGraphics = this.add.graphics();
        this.highlightGraphics = this.add.graphics();

        // Add to map container in order
        this.mapContainer.add(this.terrainGraphics); // Bottom
        this.mapContainer.add(this.gridGraphics);    // Grid on top of terrain color
        this.mapContainer.add(this.highlightGraphics); // AI Moves (Below Selection)
        this.mapContainer.add(this.selectionGraphics); // Player Plan (Top)

        // UI Backgrounds
        this.trBg = this.add.graphics();
        this.blBg = this.add.graphics();
        this.brBg = this.add.graphics();

        // UI Systems (Init with dummies)
        this.playerStatusSystem = new PlayerStatusSystem(this, 0, 0, 100);
        this.infoSystem = new CellInfoSystem(this, 0, 0, 100);
        this.buttonSystem = new ActionButtonSystem(this, 0, 0);
        this.buttonSystem.setGrid(1, 2);
        // this.notificationSystem = new NotificationSystem(this, 0, 0, 100, 100);
        this.logSystem = new LogSystem(this, 0, 0, 200, 100);
        this.interactionMenu = new InteractionMenu(this, this.engine); // NEW

        // Initialize Sound Manager
        this.soundManager = new SoundManager();

        this.setupButtons();

        // Initialize Visuals
        this.cameraControlsContainer = this.add.container(0, 0);
        this.cameraControlsContainer.setVisible(false);
        this.createCameraControls();

        this.initializeTerrainVisuals(); // Initial draw of terrain

        // Initialize Aura Visualizer
        this.auraVisualizer = new AuraVisualizer(this, this.mapContainer, this.highlightGraphics, this.tileSize);

        this.drawMap(); // Initial draw of grid/units

        // Initialize Procedural Textures
        this.createProceduralTextures();

        // Initial Resize to set layout
        this.resize(this.scale.gameSize);

        // Event Listeners
        this.engine.on('mapUpdate', () => {
            this.initializeTerrainVisuals();
            this.drawMap();
        });
        this.engine.on('turnChange', () => {
            this.drawMap();
            this.updateUI();
        });
        this.engine.on('planUpdate', () => {
            this.drawMap();
            this.updateUI();
            // Refresh info system to show updated plan cost
            this.infoSystem.update(this.engine, this.selectedRow, this.selectedCol);

            // Refresh Interaction Menu if still selected
            if (this.selectedRow !== null && this.selectedCol !== null) {
                // Calculate Screen Pos (Re-use logic from handleInput or simpler?)
                // We don't have screen pos here easily without recalculating.
                // Ideally, we just call show again with same pos?
                // But show requires x, y.
                // Let's just hide for now? Or keep it if we store x/y?
                this.interactionMenu.hide();
                // Actually, if we plan an interaction, we probably want to see the updated state (e.g. cost paid).
                // But usually interaction consumes the action.
            }
        });

        this.engine.on('tileSelected', (data) => {
            this.selectedRow = data.r;
            this.selectedCol = data.c;
            this.drawMap(); // Update Selection Highlight
            this.infoSystem.update(this.engine, data.r, data.c);

            // Show Interaction Menu
            // Calculate screen position for menu (near tile but within bounds)
            // Simplified: Use center or fixed position for now? 
            // InteractionMenu logic handles positioning relative to UI?
            // Actually implementation uses fixed position (bottom right) in resize().
            this.interactionMenu.show(data.r, data.c);
        });

        this.engine.on('logMessage', (data: { text: string, type?: LogType }) => {
            if (typeof data === 'string') {
                this.logSystem.addLog(data);
            } else {
                this.logSystem.addLog(data.text, data.type);
            }
        });

        this.engine.on('tileDeselected', () => {
            this.selectedRow = null;
            this.selectedCol = null;
            this.drawMap();
            this.infoSystem.update(this.engine, null, null);
            this.interactionMenu.hide();
        });

        // Audio Bindings
        this.engine.on('sfx:select', () => this.soundManager.playSfx('sfx_select'));
        this.engine.on('sfx:cancel', () => this.soundManager.playSfx('sfx_cancel'));
        this.engine.on('sfx:move', () => this.soundManager.playSfx('sfx_move'));
        this.engine.on('sfx:attack', () => this.soundManager.playSfx('sfx_attack'));
        this.engine.on('sfx:conquer', () => this.soundManager.playSfx('sfx_conquer')); // Epic
        this.engine.on('sfx:conquer_large', () => this.soundManager.playSfx('sfx_conquer_large'));
        this.engine.on('sfx:capture_small', () => this.soundManager.playSfx('sfx_capture_small'));
        this.engine.on('sfx:capture_medium', () => this.soundManager.playSfx('sfx_capture_medium'));
        this.engine.on('sfx:capture_large', () => this.soundManager.playSfx('sfx_capture_large'));
        this.engine.on('sfx:capture', () => this.soundManager.playSfx('sfx_capture'));
        this.engine.on('sfx:base_capture', () => this.soundManager.playSfx('sfx_base_capture'));
        this.engine.on('sfx:capture_town', () => this.soundManager.playSfx('sfx_capture_town')); // Bell
        this.engine.on('sfx:eliminate', () => this.soundManager.playSfx('sfx_eliminate'));
        this.engine.on('sfx:victory', () => this.soundManager.playSfx('sfx_victory'));
        this.engine.on('sfx:bridge_build', () => this.soundManager.playSfx('sfx:bridge_build'));
        this.engine.on('sfx:wall_build', () => this.soundManager.playSfx('sfx:wall_build'));
        this.engine.on('sfx:wall_upgrade', () => this.soundManager.playSfx('sfx:wall_upgrade'));
        this.engine.on('sfx:watchtower_build', () => this.soundManager.playSfx('sfx:watchtower_build'));
        this.engine.on('sfx:watchtower_upgrade', () => this.soundManager.playSfx('sfx:watchtower_upgrade'));
        this.engine.on('sfx:farm_build', () => this.soundManager.playSfx('sfx:farm_build'));
        this.engine.on('sfx:farm_upgrade', () => this.soundManager.playSfx('sfx:farm_upgrade'));
        this.engine.on('sfx:base_upgrade_income', () => this.soundManager.playSfx('sfx:base_upgrade_income'));
        this.engine.on('sfx:base_upgrade_defense', () => this.soundManager.playSfx('sfx:base_upgrade_defense'));

        // Start BGM
        this.soundManager.playBgm('bgm_main');

        this.engine.on('gameRestart', () => {
            if (this.overlayContainer) {
                this.overlayContainer.destroy();
                this.overlayContainer = null!;
            }
            this.input.enabled = true;
            this.initializeTerrainVisuals(); // Re-build terrain images for new map
            this.updateUI();
            this.drawMap();
            this.logSystem.addLog("Game Restarted!", 'info');
        });

        this.engine.on('gameOver', (winner: string) => {
            this.updateUI();
            this.logSystem.addLog(`Game Over! ${winner} Wins!`, 'info');
            this.showVictoryOverlay(winner);
        });



        this.engine.on('incomeReport', (report: any) => {
            const isAI = this.engine.state.getCurrentPlayer().isAI;
            const prefix = isAI ? "AI: " : "Income: ";
            const msg = `${prefix}+${report.total}G (B:${report.base}, L:${report.land})`;
            this.logSystem.addLog(msg, 'info');
        });

        this.engine.on('turnEvent', (event) => {
            this.activeTurnEvent = { name: event.name, message: event.message, sfxKey: event.sfxKey };
            this.showTurnEventOverlay(event.name, event.message);
            if (event.sfxKey) {
                this.soundManager.playSfx(event.sfxKey);
            }
        });

        this.engine.on('peaceDayState', (state) => {
            this.peaceDayActive = state.active;
            this.updatePeaceDayGlow();
        });

        // Initialize Cursor Keys
        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
        }

        // Music State Listener
        this.engine.on('musicState', (state: 'PEACE' | 'TENSION' | 'CONFLICT' | 'DOOM' | 'PEACE_DAY') => {
            if (this.soundManager) {
                this.soundManager.setBgmState(state);
            }
        });

        // Trigger Initial Layout
        this.resize(this.scale.gameSize);
        // Safety: Reprocess layout after short delay to ensure UI updates are caught
        this.time.delayedCall(GameConfig.UI_SCENE_RESIZE_RETRY_DELAY, () => {
            this.resize(this.scale.gameSize);
        });

        // Listen for Resize Events
        this.scale.on('resize', this.resize, this);

        // Cleanup on Shutdown
        this.events.once('shutdown', () => {
            this.scale.off('resize', this.resize, this);
        });

        this.engine.startGame();
    }

    private updatePeaceDayGlow() {
        if (!this.peaceDayGlow) {
            this.peaceDayGlow = this.add.graphics();
            this.peaceDayGlow.setDepth(GameConfig.UI.TURN_EVENT_TEXT_DEPTH - 1);
        }

        this.peaceDayGlow.clear();
        if (!this.peaceDayActive) {
            this.peaceDayGlow.setVisible(false);
            return;
        }

        const bounds = this.mapBounds;
        if (!bounds) {
            this.peaceDayGlow.setVisible(false);
            return;
        }

        const inset = GameConfig.UI.PEACE_DAY_GLOW_INSET;
        const thickness = GameConfig.UI.PEACE_DAY_GLOW_THICKNESS;
        const steps = Math.max(1, Math.floor(GameConfig.UI.PEACE_DAY_GLOW_GRADIENT_STEPS));
        const baseAlpha = GameConfig.UI.PEACE_DAY_GLOW_ALPHA;
        const stepThickness = thickness / steps;

        this.peaceDayGlow.setVisible(true);
        for (let i = 0; i < steps; i++) {
            const alpha = baseAlpha * (1 - (i / steps));
            const insetStep = inset + (i * stepThickness);
            const w = Math.max(0, bounds.width - (insetStep * 2));
            const h = Math.max(0, bounds.height - (insetStep * 2));
            if (w <= 0 || h <= 0) break;
            this.peaceDayGlow.lineStyle(stepThickness, 0xffffff, alpha);
            this.peaceDayGlow.strokeRect(bounds.x + insetStep, bounds.y + insetStep, w, h);
        }
    }

    private showTurnEventOverlay(title: string, logMessage: string) {
        if (this.turnEventText) {
            this.turnEventText.destroy();
            this.turnEventText = undefined;
        }

        const w = this.scale.width;
        const h = this.scale.height;
        const fontSize = Math.max(
            GameConfig.UI.TURN_EVENT_TEXT_MIN_SIZE,
            Math.floor(Math.min(w, h) * GameConfig.UI.TURN_EVENT_TEXT_SCALE)
        );
        this.turnEventText = this.add.text(w / 2, h / 2, title, {
            fontSize: `${fontSize}px`,
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5);

        const canAnimate = typeof (this.turnEventText as any).setAlpha === 'function'
            && typeof (this.turnEventText as any).setDepth === 'function'
            && typeof this.tweens?.add === 'function';

        if (!canAnimate) {
            this.turnEventText?.destroy?.();
            this.turnEventText = undefined;
            this.activeTurnEvent = undefined;
            this.logSystem.addLog(logMessage, 'info');
            return;
        }

        this.turnEventText.setAlpha(0);
        this.turnEventText.setDepth(GameConfig.UI.TURN_EVENT_TEXT_DEPTH);

        this.tweens.add({
            targets: this.turnEventText,
            alpha: 1,
            duration: GameConfig.UI.TURN_EVENT_TWEEN_FADE_DURATION,
            yoyo: true,
            hold: GameConfig.UI.TURN_EVENT_TWEEN_HOLD_DURATION,
            ease: 'Sine.Out',
            onComplete: () => {
                this.turnEventText?.destroy();
                this.turnEventText = undefined;
                this.activeTurnEvent = undefined;
                this.logSystem.addLog(logMessage, 'info');
            }
        });
    }

    private createProceduralTextures() {
        if (this.textures.exists('tile_bridge')) return;

        const gfx = this.make.graphics({ x: 0, y: 0 });
        gfx.fillStyle(0x654321); // Wood Color
        gfx.fillRect(0, 0, 64, 64);

        // Add planks detail
        gfx.fillStyle(0x543210);
        for (let i = 10; i < 64; i += 15) gfx.fillRect(0, i, 64, 2);

        gfx.generateTexture('tile_bridge', 64, 64);
        gfx.destroy();

        // Create Watchtower/Castle Textures
        this.createCastleTexture(1);
        this.createCastleTexture(2);
        this.createCastleTexture(3);

        // Create Farm Textures
        this.createFarmTexture(1);
        this.createFarmTexture(2);
        this.createFarmTexture(3);
    }

    private createFarmTexture(level: number) {
        const key = `farm_lv${level}`;
        if (this.textures.exists(key)) return;

        const gfx = this.make.graphics({ x: 0, y: 0 });

        // Colors: Wheat/Earth
        const soilColor = 0x8B4513; // SaddleBrown (Base soil)
        const cropColor = 0xFFD700; // Gold
        const cropSecondary = 0xDAA520; // GoldenRod

        // Base Size
        const pad = 8;
        const availableWidth = 64 - (pad * 2);

        // Draw Soil Background (Optional, or leave transparent to show terrain?)
        // Let's leave transparent so we see the "land" type underneath, or draw a "tilled earth" patch.
        // User asked for "Sparse to Dense".

        if (level === 1) {
            // Level 1: Sparse (3 distinct rows, wide gap)
            // Concept: Early planting. 
            // Draw 3 vertical stripes.
            const rowCount = 3;
            const width = 6; // Thin strips
            const gap = (availableWidth - (rowCount * width)) / (rowCount - 1);

            gfx.fillStyle(cropSecondary);

            for (let i = 0; i < rowCount; i++) {
                const x = pad + i * (width + gap);
                // Draw strip with slight irregularity
                gfx.fillRect(x, pad + 2, width, availableWidth - 4);

                // Add some "sprouts" (small brighter rects)
                gfx.fillStyle(cropColor);
                for (let j = 0; j < 4; j++) {
                    gfx.fillRect(x + 1, pad + 6 + j * 12, 4, 4);
                }
                gfx.fillStyle(cropSecondary); // Reset
            }

        } else if (level === 2) {
            // Level 2: Medium (5 rows, thicker)
            // Concept: Growing field.
            const rowCount = 5;
            const width = 6;
            const gap = (availableWidth - (rowCount * width)) / (rowCount - 1);

            for (let i = 0; i < rowCount; i++) {
                // Alternating colors for variation
                gfx.fillStyle(i % 2 === 0 ? cropColor : cropSecondary);
                const x = pad + i * (width + gap);
                gfx.fillRect(x, pad, width, availableWidth);

                // Texture: Cross lines (horizontal cuts)
                gfx.fillStyle(soilColor);
                // Draw faint lines to simulate stalks
                // Actually simpler: just draw the main rows fully.
            }

        } else {
            // Level 3: Dense (Full Grid / Checkerboard)
            // Concept: Mature harvest ready.
            // 8x8 dense grid
            const cols = 7;
            const rows = 7;
            const cellW = availableWidth / cols;
            const cellH = availableWidth / rows;

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    // Checkerboard slight tint
                    const isEven = (r + c) % 2 === 0;
                    gfx.fillStyle(isEven ? cropColor : cropSecondary);

                    // Gap of 1px for "cut" effect
                    gfx.fillRect(pad + c * cellW, pad + r * cellH, cellW - 1, cellH - 1);
                }
            }
        }

        gfx.generateTexture(key, 64, 64);
        gfx.destroy();
    }

    private createCastleTexture(level: number) {
        const key = `watchtower_lv${level}`;
        if (this.textures.exists(key)) return;

        const gfx = this.make.graphics({ x: 0, y: 0 });

        // Fixed Width Tower (20px)
        // Height varies: Lv1=24, Lv2=32, Lv3=40
        const w = 20;
        const h = 24 + ((level - 1) * 8);

        const x = (64 - w) / 2;
        const y = (64 - h) / 2;

        // Shadow
        gfx.fillStyle(0x000000, 0.4);
        gfx.fillEllipse(32, y + h - 3, w, 10);

        // Main Stone Body
        gfx.fillStyle(0x888888); // Stone Grey
        gfx.fillRect(x, y, w, h);

        // Bricks detailing (Subtle)
        gfx.fillStyle(0x666666);
        for (let by = y + 4; by < y + h; by += 8) {
            const offset = ((by - y) / 8) % 2 === 0 ? 0 : 5;
            for (let bx = x + offset; bx < x + w; bx += 10) {
                if (bx + 4 < x + w) {
                    gfx.fillRect(bx, by, 4, 2);
                }
            }
        }

        // Roof / Battlements based on Level
        if (level === 1) {
            // Simple Battlements
            gfx.fillStyle(0x888888);
            gfx.fillRect(x - 2, y, w + 4, 6); // Overhang
            // Crenellations
            gfx.fillRect(x - 2, y - 4, 6, 4);
            gfx.fillRect(x + w + 4 - 6, y - 4, 6, 4);
        } else if (level === 2) {
            // Conical Roof (Canvas/Wood/Slate?) - Let's do Dark Slate
            gfx.fillStyle(0x444444);
            gfx.beginPath();
            gfx.moveTo(x - 4, y);
            gfx.lineTo(x + w + 4, y);
            gfx.lineTo(x + w / 2, y - 12);
            gfx.closePath();
            gfx.fillPath();
        } else {
            // Level 3: Keep with Flag
            // Battlements
            gfx.fillStyle(0x888888);
            gfx.fillRect(x - 4, y, w + 8, 8); // Large Overhang

            // Flag (Offset to side - Right side)
            // Color: Red (User Request)

            // Pole (Horizontal arm + Vertical mount?) 
            // Or just a vertical pole on the side? 
            // "Tower side" -> usually sticking out or on a corner.
            // Let's put a pole sticking up from the right corner of the battlements.

            const poleBaseX = x + w - 4;
            const poleBaseY = y;

            gfx.lineStyle(2, 0x444444);
            gfx.beginPath();
            gfx.moveTo(poleBaseX, poleBaseY);
            gfx.lineTo(poleBaseX, poleBaseY - 12);
            gfx.strokePath();

            // Flag (Red)
            gfx.fillStyle(0xFF0000);
            gfx.beginPath();
            gfx.moveTo(poleBaseX, poleBaseY - 12);
            gfx.lineTo(poleBaseX + 12, poleBaseY - 8);
            gfx.lineTo(poleBaseX, poleBaseY - 4);
            gfx.closePath();
            gfx.fillPath();
        }

        gfx.generateTexture(key, 64, 64);
        gfx.destroy();
    }

    resize(gameSize: Phaser.Structs.Size) {
        try {
            const width = gameSize.width;
            const height = gameSize.height;

            if (width === 0 || height === 0) return;

            this.cameras.main.setViewport(0, 0, width, height);

            if (!this.terrainGroup || this.terrainGroup.getLength() === 0) {
                this.initializeTerrainVisuals();
            }

            // -----------------------------
            // UNIFIED RESPONSIVE LAYOUT
            // -----------------------------
            const isPortrait = height > width;

            // Define Regions
            let mapX = 0, mapY = 0, mapAreaW = 0, mapAreaH = 0;
            // uiBaseWidth removed (unused)

            if (isPortrait) {
                // --- PORTRAIT MODE (4-Corner Layout) ---
                // Header (Status + Info): Top 15% (min 120px)
                // Footer (Log + Buttons + Menu): Bottom (min 160px for Menu+Buttons)
                const barHeight = Phaser.Math.Clamp(
                    height * GameConfig.UI_HEADER_HEIGHT_RATIO,
                    GameConfig.UI_HEADER_HEIGHT_MIN,
                    GameConfig.UI_HEADER_HEIGHT_MAX
                );

                // Map fills the middle
                mapX = 0;
                mapY = barHeight;
                mapAreaW = width;
                mapAreaH = height - (barHeight * 2);

                // Clear Backgrounds
                this.trBg.clear().setVisible(false);
                this.blBg.clear().setVisible(false);
                this.brBg.clear().setVisible(false);

                // Set Map Bounds
                this.mapBounds = new Phaser.Geom.Rectangle(mapX, mapY, mapAreaW, mapAreaH);

                // We need backgrounds for the 4 corners basically.
                // Using existing BGs or drawing new strict rects?

                // Draw UI Backgrounds (Dark panels)
                const graphics = this.trBg; // Reuse this for all UI bg in portrait
                graphics.setVisible(true);
                graphics.clear();
                graphics.fillStyle(0x111111, 0.9);

                // Top Bar
                graphics.fillRect(0, 0, width, barHeight);
                // Bottom Bar
                graphics.fillRect(0, height - barHeight, width, barHeight);

                // Split Width
                const midX = width / 2;

                // --- TOP LEFT: Player Status ---
                const statusW = midX - 15;
                const statusH = barHeight - 10;

                this.playerStatusSystem.setScale(1); // Reset scale
                this.playerStatusSystem.resize(statusW, statusH, 5, 5);
                this.playerStatusSystem.setPosition(5, 5);

                // --- TOP RIGHT: Cell Info ---
                const infoW = midX - 15;
                // infoH unused

                this.infoSystem.setScale(1);
                this.infoSystem.resize(infoW, barHeight - 10, midX + 5, 5);


                // --- BOTTOM LEFT: Log System ---
                const logW = midX - 15;
                const logH = barHeight - 10;

                this.logSystem.setVisible(true);
                this.logSystem.resize(logW, logH);
                this.logSystem.setPosition(5, height - barHeight + 5);

                // --- BOTTOM RIGHT: Buttons & Interaction Menu ---
                // Vertical Split: Menu on Top, Buttons on Bottom
                const brW = midX - 15;
                const btnH = 35; // Fixed height for 2 rows of small buttons
                const menuH = barHeight - btnH - 10; // Allowing for padding

                // Buttons (Bottom)
                this.buttonSystem.setScale(1);
                this.buttonSystem.resize(brW, btnH);
                this.buttonSystem.setPosition(midX + 5, height - btnH - 5);

                // Interaction Menu (Top of BR Area)
                // User Request: "In button area", "accommodate both"
                this.interactionMenu.resize(brW, menuH, false);
                this.interactionMenu.setPosition(midX + 5, height - barHeight + 5);

                // Notifications (Overlay Removed)
                // this.notificationSystem.resize(300, 0);
                // this.notificationSystem.setPosition((width - 300) / 2, mapY + 20);

            } else {
                // --- LANDSCAPE MODE (Two Columns) ---
                // Left Column: Status (Top), Info (Bottom)
                // Right Column: Log (Top), Buttons (Bottom)
                // Map: Strictly Center

                // Dynamic Sidebar Width: Min 180, Max 280, but allow shrinking on small screens
                // On 667px width: 0.3 * 667 = 200px.
                const sidebarW = Math.max(180, Math.min(280, width * 0.3));

                // Map Area (Center)
                mapX = sidebarW;
                mapY = 0;
                mapAreaW = width - (sidebarW * 2);
                mapAreaH = height;

                // Draw Backgrounds
                // Left Bar
                this.trBg.clear().setVisible(true).fillStyle(0x111111, 0.9).fillRect(0, 0, sidebarW, height);
                // Right Bar
                this.blBg.clear().setVisible(true).fillStyle(0x111111, 0.9).fillRect(width - sidebarW, 0, sidebarW, height);
                // Clear unused
                this.brBg.clear().setVisible(false);

                // Set Map Bounds
                this.mapBounds = new Phaser.Geom.Rectangle(mapX, mapY, mapAreaW, mapAreaH);

                // Common Sizing
                // const uiScale = Math.min(1, (sidebarW - 20) / uiBaseWidth); // Removed
                const halfH = height / 2;

                // --- LEFT COLUMN ---
                const availableH = height - 20;
                // Info preference: 250, but max 55% of height to leave room for Status
                const infoH = Math.min(250, Math.floor(availableH * 0.55));
                const statusH = availableH - infoH - 10;

                // Top Left: Status
                this.playerStatusSystem.setScale(1);
                this.playerStatusSystem.resize(sidebarW - 20, statusH, 10, 10);
                this.playerStatusSystem.setPosition(10, 10);

                // Bottom Left: Info (User Req: CellInfo BL)
                const infoY = height - infoH - 10;
                this.infoSystem.setScale(1);
                this.infoSystem.resize(sidebarW - 20, infoH, 10, infoY);


                // --- RIGHT COLUMN ---
                // Top Right: Log (User Req: Log TR)
                // Log fills top half of right bar
                this.logSystem.setVisible(true);
                this.logSystem.resize(sidebarW - 20, halfH - 20);
                this.logSystem.setPosition(width - sidebarW + 10, 10);

                // Bottom Right: Buttons (User Req: Buttons BR)
                // Button Anchor
                // Vertical Stack: Center in Sidebar
                this.buttonSystem.setScale(1);
                const btnAreaH = 35; // Compact buttons
                this.buttonSystem.resize(sidebarW - 20, btnAreaH);
                this.buttonSystem.setPosition(width - sidebarW + 10, height - btnAreaH - 10);

                // --- INTERACTION MENU (Right Sidebar, above Buttons) ---
                // Vertical Flow
                // Available Height: (Height - Buttons) - (HalfH + 10)
                const interactionMaxH = (height - btnAreaH - 20) - (halfH + 10);
                this.interactionMenu.resize(sidebarW - 20, interactionMaxH, false);
                // Place above buttons.
                this.interactionMenu.setPosition(width - sidebarW + 10, halfH + 10);

                // Notifications (Overlay Removed)
                // this.notificationSystem.setPosition(mapX + (mapAreaW - 300) / 2, 20);
            }

            // ... (rest of logic: refresh, map scaling)

            // Force data refresh
            if (this.engine) {
                this.playerStatusSystem.update(this.engine);
                this.infoSystem.update(this.engine, null, null);
                // Log persists, no update needed
            }

            // --- MAP SCALING & CENTERING ---
            if (mapAreaW <= 0 || mapAreaH <= 0) return;

            // ... (Copy existing map scaling logic)
            let gridW = GameConfig.GRID_WIDTH;
            let gridH = GameConfig.GRID_HEIGHT;
            if (this.engine && this.engine.state.grid.length > 0) {
                gridH = this.engine.state.grid.length;
                gridW = this.engine.state.grid[0].length;
            }
            const mapPixelW = gridW * this.tileSize;
            const mapPixelH = gridH * this.tileSize;

            // Target Size for comfortable touch (e.g. 50px rendered)
            // If map fits with > 0.6 scale (approx 38px), let it fit.
            // If it needs to be tinier, switch to Viewport.
            const fitScaleX = (mapAreaW - 40) / mapPixelW;
            const fitScaleY = (mapAreaH - 40) / mapPixelH;
            let fitScale = Math.min(fitScaleX, fitScaleY);

            // Dynamic Shrink vs Viewport Logic
            // Shrink as much as possible until minTileSize.
            // If it still doesn't fit, use minTileSize scale and enable scrolling.
            const minScale = this.minTileSize / this.tileSize;

            if (fitScale < minScale) {
                // ENABLE VIEWPORT MODE
                this.isViewportMode = true;

                // Use the minimum allowed scale
                const viewportScale = minScale;
                this.mapContainer.setScale(viewportScale);

                // Calculate Visible Area
                const renderedTileSize = this.tileSize * viewportScale;
                this.visibleCols = Math.floor((mapAreaW - 60) / renderedTileSize); // Extra buffer for arrows
                this.visibleRows = Math.floor((mapAreaH - 60) / renderedTileSize);

                // Clamp to Grid Size
                this.visibleCols = Math.min(this.visibleCols, gridW);
                this.visibleRows = Math.min(this.visibleRows, gridH);

                // Center the rendered viewport within the mapArea
                const viewportPixelW = this.visibleCols * renderedTileSize;
                const viewportPixelH = this.visibleRows * renderedTileSize;

                this.mapOffsetX = mapX + (mapAreaW - viewportPixelW) / 2;
                this.mapOffsetY = mapY + (mapAreaH - viewportPixelH) / 2;

                // Adjust Camera Controls Container
                this.cameraControlsContainer.setVisible(true);

                // Calculate arrow positions around the actual map edges
                const arrowOffset = 35; // Positioned outside the map border
                const cx = this.mapOffsetX + viewportPixelW / 2;
                const cy = this.mapOffsetY + viewportPixelH / 2;

                this.arrowPositions = {
                    up: { x: cx, y: this.mapOffsetY - arrowOffset },
                    down: { x: cx, y: this.mapOffsetY + viewportPixelH + arrowOffset },
                    left: { x: this.mapOffsetX - arrowOffset, y: cy },
                    right: { x: this.mapOffsetX + viewportPixelW + arrowOffset, y: cy }
                };

                // Re-create buttons at these positions
                this.createCameraControls();

                // Initial Clamp for panning
                const maxRow = Math.max(0, gridH - this.visibleRows);
                const maxCol = Math.max(0, gridW - this.visibleCols);
                this.viewRow = Phaser.Math.Clamp(this.viewRow, 0, maxRow);
                this.viewCol = Phaser.Math.Clamp(this.viewCol, 0, maxCol);

                // Add Clipping Mask to prevent tile bleed into UI bars
                if (this.mapContainer.mask) this.mapContainer.clearMask();
                const maskShape = this.make.graphics({ x: 0, y: 0 });
                maskShape.fillStyle(0xffffff);
                maskShape.fillRect(mapX, mapY, mapAreaW, mapAreaH);
                this.mapContainer.setMask(maskShape.createGeometryMask());

            } else {
                // FIT MODE
                this.isViewportMode = false;
                this.mapContainer.setScale(fitScale);
                this.visibleRows = gridH;
                this.visibleCols = gridW;
                this.viewRow = 0;
                this.viewCol = 0;

                const scaledMapW = mapPixelW * fitScale;
                const scaledMapH = mapPixelH * fitScale;

                this.mapOffsetX = mapX + (mapAreaW - scaledMapW) / 2;
                this.mapOffsetY = mapY + (mapAreaH - scaledMapH) / 2;

                this.cameraControlsContainer.setVisible(false);
                if (this.mapContainer.mask) this.mapContainer.clearMask();
            }

            // Apply Position (ACCOUNT FOR SCROLL)
            const renderedTileSize = this.tileSize * this.mapContainer.scaleX;
            this.mapContainer.setPosition(
                this.mapOffsetX - (this.viewCol * renderedTileSize),
                this.mapOffsetY - (this.viewRow * renderedTileSize)
            );

            this.drawMap();
            this.setupButtons();

            if (this.turnEventText && this.activeTurnEvent) {
                const fontSize = Math.max(
                    GameConfig.UI.TURN_EVENT_TEXT_MIN_SIZE,
                    Math.floor(Math.min(width, height) * GameConfig.UI.TURN_EVENT_TEXT_SCALE)
                );
                this.turnEventText.setStyle({ fontSize: `${fontSize}px` });
                this.turnEventText.setPosition(width / 2, height / 2);
            }

            if (this.peaceDayActive) {
                this.updatePeaceDayGlow();
            }

        } catch (err) {
            console.error("MainScene.resize CRASHED:", err);
        }
    }

    private mapBounds: Phaser.Geom.Rectangle | null = null;



    setupButtons() {
        this.buttonSystem.clearButtons();

        // Slot Configuration: Always Horizontal (1 Row, 2 Cols)

        // Button 1: End Turn
        this.buttonSystem.addButton(0, 0, "END TURN", () => {
            this.engine.endTurn();
        });

        // Button 2: Mute
        const isMuted = (this.soundManager as any).isMuted;
        const label = isMuted ? "UNMUTE 🔇" : "MUTE 🔊";

        this.buttonSystem.addButton(0, 1, label, () => {
            this.soundManager.toggleMute();
            // Re-render buttons to update label
            this.setupButtons();
        });
    }

    handleInput(pointer: Phaser.Input.Pointer) {
        // Block input if game over
        if (this.engine.isGameOver) {
            return;
        }

        // Adjust pointer by map offset and SCALE
        const scale = this.mapContainer.scaleX;
        const localX = (pointer.x - this.mapContainer.x) / scale;
        const localY = (pointer.y - this.mapContainer.y) / scale;

        // Ignore clicks outside the map grid
        const gridHeight = this.engine.state.grid.length;
        const gridWidth = gridHeight > 0 ? this.engine.state.grid[0].length : 0;

        const mapWidth = gridWidth * this.tileSize;
        const mapHeight = gridHeight * this.tileSize;

        if (localX < 0 || localX >= mapWidth || localY < 0 || localY >= mapHeight) return;

        // Check against Strict Map Bounds (Screen Space)
        if (this.mapBounds && !this.mapBounds.contains(pointer.x, pointer.y)) {
            return;
        }

        // Block input if AI turn
        const currentPlayer = this.engine.state.getCurrentPlayer();
        if (currentPlayer.isAI) {
            return;
        }

        const col = Math.floor(localX / this.tileSize);
        const row = Math.floor(localY / this.tileSize);

        if (col >= 0 && col < gridWidth && row >= 0 && row < gridHeight) {
            // Check for Cancellation (Clicking ANY tile with pending interaction OR pending move)
            // 1. Check Pending Interaction
            const pendingInteraction = this.engine.pendingInteractions.find(i => i.r === row && i.c === col);
            if (pendingInteraction) {
                // Cancel Interaction (Toggle off)
                this.engine.planInteraction(row, col, pendingInteraction.actionId);
                return;
            }

            // 2. Check Pending Move
            // If we click a tile that is already scheduled for a move, we cancel it.
            const pendingMove = this.engine.pendingMoves.find(m => m.r === row && m.c === col);
            if (pendingMove) {
                // Cancel Move
                this.engine.togglePlan(row, col);
                return;
            }

            // Update Selection
            this.selectedRow = row;
            this.selectedCol = col;
            this.infoSystem.update(this.engine, row, col);
            this.drawMap(); // Refresh aura visualization

            // Auto-Select Logic
            // If valid tile and NOT already selected/planned
            // Check options
            const options = this.engine.interactionRegistry.getAvailableActions(this.engine, row, col);

            const isPlanned = this.engine.pendingInteractions.some(i => i.r === row && i.c === col) ||
                this.engine.pendingMoves.some(m => m.r === row && m.c === col);

            if (options.length === 1 && !isPlanned) {
                // Auto-Plan (Try to execute)
                // We call planInteraction regardless of cost. 
                // If affordable, it keeps the plan.
                // If NOT affordable, it logs the error (via GameEngine logic) and rejects the plan.
                const opt = options[0];
                this.engine.planInteraction(row, col, opt.id);

                // ALWAYS Show Menu to reflect state (Green Highlight if planned, Red if not affordable)
                this.interactionMenu.show(row, col);
            } else if (options.length > 0) {
                // Multiple options or already planned: Show Menu to see status
                this.interactionMenu.show(row, col);
            } else {
                // No options
                this.interactionMenu.hide();
            }

        } else {
            // Deselect
            this.selectedRow = null;
            this.selectedCol = null;
            // Update Menu to empty state (Persistent)
            this.interactionMenu.show(null as any, null as any); // Will need Update in InteractionMenu to handle null
            this.interactionMenu.hide();
            this.drawMap(); // Clear aura visualization
        }
    }

    drawMap() {
        if (!this.engine) return;

        this.terrainGraphics.clear();
        this.selectionGraphics.clear();
        this.highlightGraphics.clear();
        this.gridGraphics.clear();

        // 1. Hide all terrain tiles (they will be shown and positioned in the viewport loop)
        const allTerrain = this.terrainGroup.getChildren() as Phaser.GameObjects.Image[];
        allTerrain.forEach(img => img.setVisible(false));

        // 2. Cleanup dynamic map elements (Text, special images)
        const children = this.mapContainer.list;
        for (let i = children.length - 1; i >= 0; i--) {
            const child = children[i] as any;
            if (child.type === 'Text') {
                child.destroy();
            }
            else if (child.type === 'Image') {
                if (child.texture && (child.texture.key === 'gold_mine' || child.texture.key.startsWith('watchtower') || child.texture.key.startsWith('farm'))) {
                    child.destroy();
                }
            }
        }

        // --- RENDER LOOP (VIEWPORT OPTIMIZED) ---
        const grid = this.engine.state.grid;
        const totalHeight = grid.length;
        const totalWidth = totalHeight > 0 ? grid[0].length : 0;

        // Determine Loop Bounds
        let startRow = 0;
        let startCol = 0;
        let endRow = totalHeight;
        let endCol = totalWidth;

        if (this.isViewportMode) {
            startRow = this.viewRow;
            startCol = this.viewCol;
            endRow = Math.min(totalHeight, this.viewRow + this.visibleRows + 1); // +1 buffer
            endCol = Math.min(totalWidth, this.viewCol + this.visibleCols + 1);
        }

        for (let r = startRow; r < endRow; r++) {
            for (let c = startCol; c < endCol; c++) {
                const cell = grid[r][c];

                const x = c * this.tileSize;
                const y = r * this.tileSize;

                // 0. Position Background Terrain (Absolute position in container)
                if (this.terrainSprites[r] && this.terrainSprites[r][c]) {
                    const terrainImg = this.terrainSprites[r][c];
                    terrainImg.setPosition(x + this.tileSize / 2, y + this.tileSize / 2);
                    terrainImg.setVisible(true);
                }

                // 0. SPECIAL TERRAIN REPLACEMENT (Gold Mine)
                if (cell.building === 'gold_mine') {
                    // Render Gold Mine Image acting as Terrain
                    const mineSprite = this.add.image(x + this.tileSize / 2, y + this.tileSize / 2, 'gold_mine');
                    mineSprite.setDisplaySize(this.tileSize * 1.0, this.tileSize * 1.0); // Full tile
                    this.mapContainer.add(mineSprite);

                    // Crucial: Move it BELOW the gridGraphics (which draws the color overlay)
                    // but ABOVE the static terrain (which is sentToBack)
                    this.mapContainer.moveBelow(mineSprite, this.gridGraphics as any);
                }

                // 1. TERRAIN & OWNER COLOR
                // We do NOT draw opaque backgrounds for terrain types anymore.

                if (cell.owner) {
                    const player = this.engine.state.players[cell.owner];
                    const color = player ? player.color : 0x888888;

                    if (cell.isConnected) {
                        // Normal Connected State: Solid Semi-Transparent
                        // User Request: "Transparency slightly lower about 70%" -> 0.7 Alpha
                        this.gridGraphics.fillStyle(color, 0.7);
                        this.gridGraphics.fillRect(x, y, this.tileSize - 2, this.tileSize - 2);
                    } else {
                        // Disconnected State: Zebra Stripes
                        this.drawDisconnectedPattern(this.gridGraphics, x, y, this.tileSize, color);
                    }
                }
                // Always draw a faint grid border to separate tiles visually
                this.gridGraphics.lineStyle(1, 0x000000, 0.3);
                this.gridGraphics.strokeRect(x, y, this.tileSize, this.tileSize);

                // 3. BUILDINGS (Towns, Bases) - Gold Mine already drawn
                if (cell.building === 'base') {
                    // Base Defense Upgrade: Square Wall Border
                    if (cell.defenseLevel > 0) {
                        const lw = cell.defenseLevel * 2; // Lv 1..3 -> 2, 4, 6px
                        const padding = 6 + (cell.defenseLevel);
                        this.gridGraphics.lineStyle(lw, 0x444444, 1.0); // Dark Grey "Wall"
                        this.gridGraphics.strokeRect(x + padding, y + padding, this.tileSize - padding * 2, this.tileSize - padding * 2);
                    }

                    // Base Income Upgrade: Internal Buildings (Gold squares)
                    if (cell.incomeLevel > 0) {
                        this.gridGraphics.fillStyle(0xFFD700, 1.0); // Gold
                        const size = 6;
                        const gap = 3;
                        const startX = x + 10;
                        const startY = y + this.tileSize - 14;

                        // Draw distinct little "buildings" based on level (Max 5)
                        for (let i = 0; i < cell.incomeLevel; i++) {
                            this.gridGraphics.fillRect(startX + (i * (size + gap)), startY, size, size);
                        }
                    }

                    const baseText = this.add.text(x + this.tileSize / 2, y + this.tileSize / 2, '🏰', { fontSize: '32px' }).setOrigin(0.5);
                    this.mapContainer.add(baseText);
                } else if (cell.building === 'town') {
                    let icon = '🏠'; // Level 1 (Income < 4)
                    let size = '28px';
                    if (cell.townIncome >= 8) {
                        icon = '🏘️'; // Level 3 (City)
                        size = '32px';
                    } else if (cell.townIncome >= 4) {
                        icon = '🏡'; // Level 2 (Town)
                        size = '30px';
                    }
                    const townText = this.add.text(x + this.tileSize / 2, y + this.tileSize / 2, icon, { fontSize: size }).setOrigin(0.5);
                    this.mapContainer.add(townText);
                } else if (cell.building === 'farm') {
                    // Farm Visuals
                    const level = cell.farmLevel || 1;
                    const key = `farm_lv${level}`;

                    const farmSprite = this.add.image(x + this.tileSize / 2, y + this.tileSize / 2, key);
                    farmSprite.setDisplaySize(this.tileSize, this.tileSize);
                    this.mapContainer.add(farmSprite);

                } else if (cell.building === 'wall') {
                    // Wall Visuals: Pseudo-3D Height
                    const level = cell.defenseLevel || 1;
                    // const maxLevel = GameConfig.UPGRADE_WALL_MAX; // Unused

                    // Height Calculation (Pixels from bottom)
                    // Level 1: 15px, Level 2: 25px, Level 3: 35px
                    const baseHeight = 15;
                    const heightStep = 10;
                    const wallHeight = baseHeight + (level - 1) * heightStep;

                    const pad = 6;
                    const w = this.tileSize - (pad * 2);

                    // Draw Wall
                    // Shadow
                    // this.gridGraphics.fillStyle(0x000000, 0.3);
                    // this.gridGraphics.fillRect(x + pad + 3, y + this.tileSize - pad - wallHeight + 3, w, wallHeight);

                    // Face - Stone Grey
                    const wallColor = 0x888888; // Neutral Stone
                    this.gridGraphics.fillStyle(wallColor, 1.0);
                    this.gridGraphics.fillRoundedRect(x + pad, y + this.tileSize - pad - wallHeight, w, wallHeight, 2);

                    // Add Texture (Bricks)
                    this.gridGraphics.fillStyle(0x666666, 0.8);
                    const brickH = 4;
                    const brickW = 8;
                    // Start drawing bricks on the face
                    const faceTopY = y + this.tileSize - pad - wallHeight;
                    const faceHeight = wallHeight;

                    for (let by = faceTopY + 4; by < faceTopY + faceHeight - 2; by += 6) {
                        const row = Math.floor((by - faceTopY) / 6);
                        const offset = (row % 2) * 5;
                        for (let bx = x + pad + 2 + offset; bx < x + pad + w - 4; bx += 12) {
                            if (bx + brickW < x + pad + w) {
                                this.gridGraphics.fillRect(bx, by, brickW, brickH);
                            }
                        }
                    }

                    // Sawtooth Battlements (Crenellations)
                    const toothSize = w / 5; // 5 segments (3 merlons, 2 gaps)
                    const topY = y + this.tileSize - pad - wallHeight;

                    this.gridGraphics.fillStyle(wallColor, 1.0);
                    // Draw Merlons (Teeth)
                    // Merlon 1 (Left)
                    this.gridGraphics.fillRect(x + pad, topY - 5, toothSize, 5);
                    // Merlon 2 (Center)
                    this.gridGraphics.fillRect(x + pad + (toothSize * 2), topY - 5, toothSize, 5);
                    // Merlon 3 (Right)
                    this.gridGraphics.fillRect(x + pad + (toothSize * 4), topY - 5, toothSize, 5);

                    // Optional: Trim line below battlements?
                    // this.gridGraphics.fillStyle(0x777777); 
                    // this.gridGraphics.fillRect(x + pad, topY, w, 2);

                    // --- Watchtower / Castle Rendering ---
                    if (cell.watchtowerLevel > 0) {
                        const towerKey = `watchtower_lv${cell.watchtowerLevel}`;
                        const towerSprite = this.add.image(x + this.tileSize / 2, y + this.tileSize / 2, towerKey);

                        // Tint Flag based on owner
                        // P1 is Red Flag (Default). P2 needs Blue Flag.
                        // Since texture is baked, tinting affects whole sprite.
                        // Tinting grey stone to blueish is acceptable for P2.
                        if (cell.owner === 'P2') {
                            towerSprite.setTint(0xaaaaff);
                        }

                        this.mapContainer.add(towerSprite);
                    }
                }

                // 3. SELECTION / HIGHLIGHTS
                // Pending Moves OR Interactions (Unified "Planned")
                const isPendingMove = this.engine.pendingMoves.some(m => m.r === r && m.c === c);
                const isPendingInteraction = this.engine.pendingInteractions.some(i => i.r === r && i.c === c);

                if (isPendingMove || isPendingInteraction) {
                    this.selectionGraphics.lineStyle(4, 0x00FF00, 1.0); // Green for Confirmed Plan
                    this.selectionGraphics.strokeRect(x + 2, y + 2, this.tileSize - 4, this.tileSize - 4);
                } else if (this.selectedRow === r && this.selectedCol === c) {
                    // Selected Highlight
                    this.selectionGraphics.lineStyle(4, 0xFFFFFF, 0.8);
                    this.selectionGraphics.strokeRect(x + 2, y + 2, this.tileSize - 4, this.tileSize - 4);
                }

                // AI Moves History
                const isAiMove = this.engine.lastAiMoves.some(m => m.r === r && m.c === c);
                if (isAiMove) {
                    this.highlightGraphics.lineStyle(4, GameConfig.COLORS.HIGHLIGHT_AI, 1.0);
                    this.highlightGraphics.strokeRect(x + 2, y + 2, this.tileSize - 4, this.tileSize - 4);
                }
            }
        }

        // 4. AURA VISUALIZATION (Unified)
        this.auraVisualizer.update(this.engine, this.selectedRow, this.selectedCol);

        // Ensure map is correctly positioned after content change?
        if (!this.hasRenderedOnce) {
            this.hasRenderedOnce = true;
        }
    }

    initializeTerrainVisuals() {
        const grid = this.engine.state.grid;
        if (!grid || grid.length === 0) {
            console.error("initializeTerrainVisuals: GRID IS EMPTY OR NULL");
            return;
        }

        // Clear old terrain if any
        if (this.terrainGroup) {
            this.terrainGroup.clear(true, true);
        }
        this.terrainSprites = [];

        try {
            const height = grid.length;
            const width = height > 0 ? grid[0].length : 0;

            for (let r = 0; r < height; r++) {
                this.terrainSprites[r] = [];
                for (let c = 0; c < width; c++) {
                    const cell = grid[r][c];
                    const x = c * this.tileSize + this.tileSize / 2;
                    const y = r * this.tileSize + this.tileSize / 2;

                    let texture = 'tile_plain';
                    if (cell.type === 'hill') texture = 'tile_hill';
                    else if (cell.type === 'water') texture = 'tile_water';
                    else if (cell.type === 'bridge') texture = 'tile_bridge';

                    const img = this.add.image(x, y, texture);
                    img.setDisplaySize(this.tileSize, this.tileSize);
                    img.setVisible(false); // Managed by drawMap

                    this.terrainGroup.add(img);
                    this.mapContainer.add(img);
                    this.mapContainer.sendToBack(img);
                    this.terrainSprites[r][c] = img;
                }
            }
        } catch (err) {
            console.error("initializeTerrainVisuals: ERROR in loop", err);
        }
    }

    updateUI() {
        // Delegate to PlayerStatusSystem
        this.playerStatusSystem.update(this.engine);

        // Notification Logic
        const currentPlayer = this.engine.state.getCurrentPlayer();
        const currentGold = currentPlayer.gold;

        // Calculate Total Cost (Moves + Interactions)
        const totalCost = this.engine.calculatePlannedCost();

        if (currentPlayer.isAI) {
            // this.logSystem.addLog('🤖 AI is planning...', 'info');
        } else if (this.engine.lastError) {
            this.logSystem.addLog(this.engine.lastError, 'error');
            // Overlay warning for errors removed
        } else if (totalCost > currentGold) {
            // this.logSystem.addLog(`Need ${ totalCost } G`, 'warning');
        } else {
            // Default
        }
    }

    private lastScrollTime: number = 0;

    panView(dRow: number, dCol: number) {
        if (!this.engine) return;

        const grid = this.engine.state.grid;
        const totalHeight = grid.length;
        const totalWidth = totalHeight > 0 ? grid[0].length : 0;

        const maxRow = Math.max(0, totalHeight - this.visibleRows);
        const maxCol = Math.max(0, totalWidth - this.visibleCols);

        this.viewRow = Phaser.Math.Clamp(this.viewRow + dRow, 0, maxRow);
        this.viewCol = Phaser.Math.Clamp(this.viewCol + dCol, 0, maxCol);

        // Update Container Position
        const renderedTileSize = this.tileSize * this.mapContainer.scaleX;
        this.mapContainer.x = this.mapOffsetX - (this.viewCol * renderedTileSize);
        this.mapContainer.y = this.mapOffsetY - (this.viewRow * renderedTileSize);

        this.drawMap();
    }

    createCameraControls() {
        this.cameraControlsContainer.removeAll(true);
        if (!this.arrowPositions) return;

        // Style
        const size = 35; // Smaller dots for edges
        const color = 0x444444;
        const alpha = 0.9; // Higher contrast

        // Helper
        const createArrow = (pos: { x: number, y: number }, label: string, dr: number, dc: number) => {
            const bg = this.add.graphics();
            bg.fillStyle(color, alpha);
            bg.fillCircle(pos.x, pos.y, size / 2);

            // Hit Area
            const zone = this.add.zone(pos.x, pos.y, size, size);
            if (this.input?.enabled) {
                zone.setInteractive({ useHandCursor: true });
                zone.on('pointerdown', () => this.panView(dr, dc));

                // Visual feedback
                zone.on('pointerover', () => {
                    bg.clear();
                    bg.fillStyle(0x666666, 1);
                    bg.fillCircle(pos.x, pos.y, size / 2);
                });
                zone.on('pointerout', () => {
                    bg.clear();
                    bg.fillStyle(color, alpha);
                    bg.fillCircle(pos.x, pos.y, size / 2);
                });
            }

            const text = this.add.text(pos.x, pos.y, label, { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);
            this.cameraControlsContainer.add([bg, zone, text]);
        };

        createArrow(this.arrowPositions.up, '▲', -1, 0);
        createArrow(this.arrowPositions.down, '▼', 1, 0);
        createArrow(this.arrowPositions.left, '◀', 0, -1);
        createArrow(this.arrowPositions.right, '▶', 0, 1);
    }

    private hasRenderedOnce: boolean = false;

    update(_time: number, _delta: number) {
        // Continuous UI Updates (State polling) - REMOVED
        // UI is now Event-Driven (see create() listeners)

        // Force initial render on first update to avoid black screen
        if (!this.hasRenderedOnce) {
            // this.drawMap(); // resize() calls it? 
            this.drawMap();
            // this.updateUI(); // Removed to avoid potential log spam/duplication if logic is moved
            // Actually updateUI logic regarding logs might be useful?
            // Let's keep updateUI() call specific to events if possible, or leave it here for initial check.
            this.updateUI();
            this.hasRenderedOnce = true;
        }

        // Update Audio Intensity
        // Audio Intensity is now handled via events (engine.on('musicState', ...))
        // See create() for event listener setup.

        // Handle Map Scrolling
        // Handle Map Scrolling (Discrete Viewport Panning)
        if (this.isViewportMode && this.scrollKeys) {
            // Rate limit scrolling (e.g. every 100ms) - simplistic approach: check JustDown
            // Better: Timer based?
            const now = this.time.now;
            const scrollDelay = 100;
            if (now > this.lastScrollTime + scrollDelay) {
                let dr = 0;
                let dc = 0;

                if (this.scrollKeys.up.isDown || (this.cursors && this.cursors.up.isDown)) dr = -1;
                else if (this.scrollKeys.down.isDown || (this.cursors && this.cursors.down.isDown)) dr = 1;

                if (this.scrollKeys.left.isDown || (this.cursors && this.cursors.left.isDown)) dc = -1;
                else if (this.scrollKeys.right.isDown || (this.cursors && this.cursors.right.isDown)) dc = 1;

                if (dr !== 0 || dc !== 0) {
                    this.panView(dr, dc);
                    this.lastScrollTime = now;
                }
            }
        }

    }




    // Overlay for Game Over
    overlayContainer!: Phaser.GameObjects.Container;
    showVictoryOverlay(winner: string) {
        // Safety: Ensure only one overlay exists
        if (this.overlayContainer) {
            this.overlayContainer.destroy();
            this.overlayContainer = null!;
        }

        const w = this.scale.width;
        const h = this.scale.height;

        this.overlayContainer = this.add.container(0, 0);

        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.8);
        bg.fillRect(0, 0, w, h);
        this.overlayContainer.add(bg);

        const winnerInfo = this.engine?.state?.players?.[winner];
        const winnerLabel = winner?.startsWith('P') ? `PLAYER ${winner.slice(1)}` : winner;
        const winnerColor = winnerInfo?.color ?? 0xffffff;
        const winnerColorHex = `#${winnerColor.toString(16).padStart(6, '0')}`;

        const title = this.add.text(w / 2, h / 2 - 50, `${winnerLabel} WINS!`, {
            fontSize: '64px',
            color: winnerColorHex,
            fontStyle: 'bold',
            stroke: '#ffffff',
            strokeThickness: 6
        }).setOrigin(0.5);

        // Scale title to fit width
        const maxW = w * 0.9;
        if (title.width > maxW) {
            title.setScale(maxW / title.width);
        }
        this.overlayContainer.add(title);

        // 1. PLAY AGAIN (New Map)
        const btnNew = this.createButton(0, 0, 'PLAY AGAIN (NEW MAP)', '#44ff44', () => {
            this.engine.restartGame(false);
        });
        this.overlayContainer.add(btnNew);

        // 2. RESTART (Same Map)
        const btnSame = this.createButton(0, 60, 'RESTART (SAME MAP)', '#4444ff', () => {
            this.engine.restartGame(true);
        });
        this.overlayContainer.add(btnSame);

        // 3. MAIN MENU
        const btnMenu = this.createButton(0, 120, 'MAIN MENU', '#aaaaaa', () => {
            this.scene.start('MenuScene');
        });
        this.overlayContainer.add(btnMenu);

        // Center the button group (approximate center relative to text)
        // Title is at h/2 - 50. Buttons start at h/2 + 20?
        const groupY = h / 2 + 20;
        btnNew.setPosition(w / 2, groupY);
        btnSame.setPosition(w / 2, groupY + 60);
        btnMenu.setPosition(w / 2, groupY + 120);

        // Input blocked via handleInput check
    }

    private createButton(x: number, y: number, text: string, color: string, onClick: () => void): Phaser.GameObjects.Text {
        const btn = this.add.text(x, y, text, {
            fontSize: '24px',
            color: color,
            backgroundColor: '#333333',
            padding: { x: 20, y: 10 }
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', onClick)
            .on('pointerover', () => btn.setStyle({ backgroundColor: '#555555' }))
            .on('pointerout', () => btn.setStyle({ backgroundColor: '#333333' }));
        return btn;
        // Input blocked via handleInput check
    }

    private drawDisconnectedPattern(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number, color: number) {
        // Dynamic Line Width based on size (min 2px)
        const lineWidth = Math.max(2, size / 8);
        graphics.lineStyle(lineWidth, color, 0.6); // Semi-transparent player color

        // Draw Diagonal Stripes (Top-Left to Bottom-Right)
        // Equation: x_rel + y_rel = k
        // Dynamic Step based on size (e.g., 4 stripes per tile)
        const step = size / 4;

        // k ranges from 0 to 2*size
        for (let k = 0; k <= 2 * size; k += step) {
            // Intersection with square [0, size] x [0, size]
            // x_rel = t. y_rel = k - t.
            // 0 <= t <= size
            // 0 <= k - t <= size  =>  t <= k  AND  t >= k - size

            const tStart = Math.max(0, k - size);
            const tEnd = Math.min(k, size);

            if (tStart < tEnd) {
                graphics.beginPath();
                graphics.moveTo(x + tStart, y + (k - tStart));
                graphics.lineTo(x + tEnd, y + (k - tEnd));
                graphics.strokePath();
            }
        }
    }
}
