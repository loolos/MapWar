
import Phaser from 'phaser';
import { GameEngine } from '../core/GameEngine';
import { GameConfig } from '../core/GameConfig';
import { NotificationSystem } from './ui/NotificationSystem';
import { ActionButtonSystem } from './ui/ActionButtonSystem';
import { PlayerStatusSystem } from './ui/PlayerStatusSystem';
import { CellInfoSystem } from './ui/CellInfoSystem';
import { SaveRegistry } from '../core/saves/SaveRegistry';
import { TextureUtils } from '../utils/TextureUtils';

import { LogSystem } from './ui/LogSystem';

// ... imports

export class MainScene extends Phaser.Scene {
    engine!: GameEngine;
    tileSize: number = 64;
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
    logSystem!: LogSystem; // NEW

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
    minTileSize: number = 12;
    isMapScrollable: boolean = false;
    mapScrollSpeed: number = 10;
    scrollKeys!: {
        up: Phaser.Input.Keyboard.Key,
        down: Phaser.Input.Keyboard.Key,
        left: Phaser.Input.Keyboard.Key,
        right: Phaser.Input.Keyboard.Key
    };
    cameraControlsContainer!: Phaser.GameObjects.Container;
    cursors?: Phaser.Types.Input.Keyboard.CursorKeys;

    constructor() {
        super('MainScene');
    }

    preload() {
        this.load.image('coin', 'assets/coin.png');
        this.load.image('ui_button', 'assets/ui_button.png');
        this.load.image('robot', 'assets/robot.png'); // AI
        this.load.image('human', 'assets/human.png'); // Human
        this.load.image('tile_plain', 'assets/tile_plain.png');
        this.load.image('tile_hill', 'assets/tile_hill.png');
        this.load.image('tile_water', 'assets/tile_water.png');

        // Tactical UI Assets (Load as Raw)
        this.load.image('raw_icon_gold', 'assets/icon_gold_blackbg_1767659375024.png');
        this.load.image('raw_icon_human', 'assets/icon_human_blackbg_1767659388348.png');
        this.load.image('raw_icon_robot', 'assets/icon_robot_blackbg_1767659401523.png');
    }

    create(data?: any) {
        // 1. Initialize Engine
        this.engine = new GameEngine(data && data.playerConfigs ? data.playerConfigs : []);

        // 2. Check for Preset Load
        if (data && data.loadPreset) {
            const key = data.loadPreset as string;
            const save = SaveRegistry[key];

            if (save) {
                const presetJson = save.getData();
                this.engine.loadState(presetJson);

                // Notification
                this.time.delayedCall(500, () => {
                    this.notificationSystem.show(`Loaded: ${save.name}`, 'info');
                });

                // Force Resize to Center Map on new Dimensions
                this.time.delayedCall(100, () => {
                    this.resize(this.scale.gameSize);
                });
            }
        }

        // Process Textures (Runtime Transparency)
        TextureUtils.makeTransparent(this, 'raw_icon_gold', 'icon_gold_3d', 40);
        // ...
        // ...

        TextureUtils.makeTransparent(this, 'raw_icon_human', 'icon_human_badge', 40);
        TextureUtils.makeTransparent(this, 'raw_icon_robot', 'icon_robot_badge', 40);

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
        this.notificationSystem = new NotificationSystem(this, 0, 0, 100, 100);
        this.logSystem = new LogSystem(this, 0, 0, 200, 100); // NEW

        this.setupButtons();

        // Initialize Visuals
        this.cameraControlsContainer = this.add.container(0, 0);
        this.cameraControlsContainer.setVisible(false);
        this.createCameraControls();

        this.initializeTerrainVisuals(); // Initial draw of terrain
        this.drawMap(); // Initial draw of grid/units

        this.scale.on('resize', this.resize, this);

        // Initialize Procedural Textures
        this.createProceduralTextures();

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
        });
        this.engine.on('gameRestart', () => {
            if (this.overlayContainer) {
                this.overlayContainer.destroy();
                this.overlayContainer = null!;
            }
            this.input.enabled = true;
            this.initializeTerrainVisuals(); // Re-build terrain images for new map
            this.updateUI();
            this.drawMap();
            this.notificationSystem.show("Game Restarted!", 'info');
        });

        this.engine.on('gameOver', (winner: string) => {
            this.updateUI();
            this.notificationSystem.show(`Game Over! ${winner} Wins!`, 'info');
            this.showVictoryOverlay(winner);
        });

        this.engine.on('logMessage', (msg: string) => {
            this.logSystem.addLog(msg, 'info');
        });

        this.engine.on('incomeReport', (report: any) => {
            const isAI = this.engine.state.getCurrentPlayer().isAI;
            const prefix = isAI ? "AI: " : "Income: ";
            const msg = `${prefix}+${report.total}G (B:${report.base}, L:${report.land})`;
            this.logSystem.addLog(msg, 'info');
        });

        // Initialize Cursor Keys
        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
        }

        // Trigger Initial Layout
        this.resize(this.scale.gameSize);
        // Safety: Reprocess layout after short delay to ensure UI updates are caught
        this.time.delayedCall(100, () => {
            this.resize(this.scale.gameSize);
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
            const uiBaseWidth = 260;

            if (isPortrait) {
                // --- PORTRAIT MODE (4-Corner Layout) ---
                // Header (Status + Info): Top 15% (min 120px)
                // Footer (Log + Buttons): Bottom 15% (min 120px)

                const barHeight = Phaser.Math.Clamp(height * 0.15, 120, 180);

                // Map fills the middle
                mapX = 0;
                mapY = barHeight;
                mapAreaW = width;
                mapAreaH = height - (barHeight * 2);

                // Clear Backgrounds
                this.trBg.clear().setVisible(false);
                this.blBg.clear().setVisible(false);
                this.brBg.clear().setVisible(false);

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
                const statusScale = Math.min(1, (midX - 10) / uiBaseWidth);
                this.playerStatusSystem.setScale(statusScale);
                // Note: resize takes (width, height, x, y) for mask generation
                this.playerStatusSystem.resize(uiBaseWidth, barHeight / statusScale, 5, 5);
                this.playerStatusSystem.setPosition(5, 5);

                // --- TOP RIGHT: Cell Info ---
                const infoScale = Math.min(1, (midX - 10) / uiBaseWidth);
                this.infoSystem.setScale(infoScale);
                // Note: resize takes (width, x, y) for mask generation. 
                // Wait, CellInfoSystem.resize signature is (width, x, y). 
                // It does NOT take height? layout logic says height=250 fixed internal.
                // We clearly want to position it at midX + 5, 5.
                this.infoSystem.resize(uiBaseWidth, midX + 5, 5);
                this.infoSystem.setPosition(midX + 5, 5);

                // --- BOTTOM LEFT: Log System ---
                // Log takes left half of bottom bar?
                // User said: "Log Screen on Bottom Left, Buttons on Bottom Right"
                this.logSystem.setVisible(true);
                this.logSystem.resize(midX - 10, barHeight - 10);
                this.logSystem.setPosition(5, height - barHeight + 5);

                // --- BOTTOM RIGHT: Buttons ---
                // ButtonSystem isn't a panel, it creates buttons relative to pos.
                // We place the anchor. 
                // "End Turn" button size?
                this.buttonSystem.setPosition(midX + (midX / 2), height - (barHeight / 2));
                // Adjust button system to center button in its quadrant?
                // ActionButtonSystem usually places button at (0,0) relative.

                // Notifications (Transient) -> Center Overlay
                this.notificationSystem.resize(300, 0);
                this.notificationSystem.setPosition((width - 300) / 2, mapY + 20);

            } else {
                // --- LANDSCAPE MODE (Two Columns) ---
                // Left Column: Status (Top), Info (Bottom)
                // Right Column: Log (Top), Buttons (Bottom)
                // Map: Strictly Center

                const sidebarW = 280; // Fixed width for side panels

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

                // Common Sizing
                const uiScale = Math.min(1, (sidebarW - 20) / uiBaseWidth);
                const halfH = height / 2;

                // --- LEFT COLUMN ---
                // Top Left: Status
                this.playerStatusSystem.setScale(uiScale);
                this.playerStatusSystem.resize(uiBaseWidth, halfH, 10, 10);
                this.playerStatusSystem.setPosition(10, 10);

                // Bottom Left: Info (User Req: CellInfo BL)
                // Info height is fixed inside (approx 250), so we place it at bottom
                // But resize signature is (width, x, y)
                this.infoSystem.setScale(uiScale);
                const infoY = height - 260; // 250 height + padding
                this.infoSystem.resize(uiBaseWidth, 10, infoY);
                this.infoSystem.setPosition(10, infoY);

                // --- RIGHT COLUMN ---
                // Top Right: Log (User Req: Log TR)
                // Log fills top half of right bar
                this.logSystem.setVisible(true);
                this.logSystem.resize(sidebarW - 20, halfH - 20);
                this.logSystem.setPosition(width - sidebarW + 10, 10);

                // Bottom Right: Buttons (User Req: Buttons BR)
                // Button Anchor
                this.buttonSystem.setPosition(width - (sidebarW / 2), height - 80);

                // Notifications Center map
                this.notificationSystem.resize(300, 0);
                this.notificationSystem.setPosition(mapX + (mapAreaW - 300) / 2, 20);
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

            const scaleX = (mapAreaW - 40) / mapPixelW;
            const scaleY = (mapAreaH - 40) / mapPixelH;
            let scale = Math.min(scaleX, scaleY);
            scale = Math.min(scale, 1.2);
            const minScale = this.minTileSize / this.tileSize;
            if (scale < minScale) scale = minScale;

            this.mapContainer.setScale(scale);

            const scaledMapW = mapPixelW * scale;
            const scaledMapH = mapPixelH * scale;

            this.isMapScrollable = (scaledMapW > mapAreaW || scaledMapH > mapAreaH);

            let targetX = mapX + (mapAreaW - scaledMapW) / 2;
            let targetY = mapY + (mapAreaH - scaledMapH) / 2;

            if (this.isMapScrollable) {
                if (scaledMapW > mapAreaW) targetX = mapX + 20;
                if (scaledMapH > mapAreaH) targetY = mapY + 20;

                this.cameraControlsContainer.setVisible(true);
                // Adjust controls position
                this.cameraControlsContainer.setPosition(width - 60, height / 2); // Center right?
            } else {
                this.cameraControlsContainer.setVisible(false);
            }

            this.mapContainer.setPosition(targetX, targetY);
            this.mapOffsetX = this.mapContainer.x;
            this.mapOffsetY = this.mapContainer.y;

            this.drawMap();

        } catch (err) {
            console.error("MainScene.resize CRASHED:", err);
        }
    }



    setupButtons() {
        // Slot 0 (Row 0, Col 0): End Turn
        // Use text update if button already exists? ActionButtonSystem recreate clears them.
        this.buttonSystem.clearButtons();
        this.buttonSystem.addButton(0, 0, "END TURN", () => {
            this.engine.endTurn();
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

        // Block input if AI turn
        const currentPlayer = this.engine.state.getCurrentPlayer();
        if (currentPlayer.isAI) {
            return;
        }

        const col = Math.floor(localX / this.tileSize);
        const row = Math.floor(localY / this.tileSize);

        if (col >= 0 && col < gridWidth && row >= 0 && row < gridHeight) {
            // Update Selection
            this.selectedRow = row;
            this.selectedCol = col;
            this.infoSystem.update(this.engine, row, col);

            this.engine.togglePlan(row, col);
        }
    }

    drawMap() {
        if (!this.engine) return;

        this.gridGraphics.clear();
        this.terrainGraphics.clear();
        this.selectionGraphics.clear();
        this.highlightGraphics.clear();

        // Remove old logic objects logic if heavy? 
        // Phaser graphics clear is cheap.
        // We reuse Text objects for Bases? We probably should pool them.
        // For now, let's clear texts.
        // Clean up transient objects (Base Labels)
        // We do NOT want to destroy our Graphics layers or Terrain images here.
        // Terrain images are managed by initializeTerrainVisuals.
        // Graphics layers are persistent.

        // We only need to remove/destroy Labels (Text) created in previous drawMap
        // Iterate backwards to safely remove
        const children = this.mapContainer.list;
        for (let i = children.length - 1; i >= 0; i--) {
            const child = children[i];
            if (child.type === 'Text') {
                child.destroy();
            }
        }

        // Ensure layers are in correct order (in case things got shuffled?)
        // Usually not needed if we just append Texts on top.
        // But let's ensure Z-order if needed.
        // mapContainer.bringToTop(this.highlightGraphics);

        // --- RENDER LOOP ---
        const grid = this.engine.state.grid;
        const height = grid.length;
        const width = height > 0 ? grid[0].length : 0;

        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                const cell = grid[r][c];
                const x = c * this.tileSize;
                const y = r * this.tileSize;

                // 1. TERRAIN & OWNER COLOR
                // We do NOT draw opaque backgrounds for terrain types anymore.

                if (cell.owner) {
                    const player = this.engine.state.players[cell.owner];
                    const color = player ? player.color : 0x888888;

                    if (cell.isConnected) {
                        // Normal Connected State: Solid Semi-Transparent
                        this.gridGraphics.fillStyle(color, 0.5);
                        this.gridGraphics.fillRect(x, y, this.tileSize - 2, this.tileSize - 2);
                    } else {
                        // Disconnected State: Zebra Stripes
                        this.drawDisconnectedPattern(this.gridGraphics, x, y, this.tileSize, color);
                    }
                }

                // Always draw a faint grid border to separate tiles visually
                this.gridGraphics.lineStyle(1, 0x000000, 0.3);
                this.gridGraphics.strokeRect(x, y, this.tileSize, this.tileSize);

                // 2. BUILDINGS
                if (cell.building === 'base') {
                    // Add Base Icon/Text
                    const baseText = this.add.text(x + this.tileSize / 2, y + this.tileSize / 2, '⌂', {
                        fontSize: `${this.tileSize * 0.6}px`,
                        color: '#ffffff',
                        stroke: '#000000',
                        strokeThickness: 4
                    }).setOrigin(0.5);
                    this.mapContainer.add(baseText);
                } else if (cell.building === 'town') {
                    // Towns
                    const icon = '🏠';
                    const income = cell.townIncome;
                    const label = cell.owner ? `${icon}\n+${income}` : `${icon}`;

                    const townText = this.add.text(x + this.tileSize / 2, y + this.tileSize / 2, label, {
                        fontSize: `${this.tileSize * 0.35}px`,
                        color: '#ffff00',
                        stroke: '#000000',
                        strokeThickness: 3,
                        align: 'center'
                    }).setOrigin(0.5);
                    this.mapContainer.add(townText);
                }

                // 3. SELECTION / HIGHLIGHTS
                // Pending Moves
                const isPending = this.engine.pendingMoves.some(m => m.r === r && m.c === c);
                if (isPending) {
                    this.selectionGraphics.lineStyle(4, GameConfig.COLORS.HIGHLIGHT_MOVE, 0.8);
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

        // Ensure map is correctly positioned after content change?
        // resize() handles scale/pos.
        // If this is first draw, we might need to force resize logic?
        if (!this.hasRenderedOnce) {
            // this.resize(this.scale.gameSize); // Removed to prevent infinite loop
            this.hasRenderedOnce = true;
        }
    }

    initializeTerrainVisuals() {
        // Then create new images and add to terrainGroup AND mapContainer.

        const grid = this.engine.state.grid;
        if (!grid || grid.length === 0) {
            console.error("initializeTerrainVisuals: GRID IS EMPTY OR NULL");
            return;
        }

        // Clear old terrain if any
        if (this.terrainGroup) {
            this.terrainGroup.clear(true, true);
        }

        let count = 0;
        try {
            const height = grid.length;
            const width = height > 0 ? grid[0].length : 0;

            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    const cell = grid[r][c];
                    const x = c * this.tileSize + this.tileSize / 2; // Center origin
                    const y = r * this.tileSize + this.tileSize / 2;

                    let texture = 'tile_plain';
                    if (cell.type === 'hill') texture = 'tile_hill';
                    else if (cell.type === 'water') texture = 'tile_water';
                    else if (cell.type === 'bridge') texture = 'tile_bridge';

                    const img = this.add.image(x, y, texture);
                    img.setDisplaySize(this.tileSize, this.tileSize);

                    this.terrainGroup.add(img);
                    this.mapContainer.add(img); // Now validly placed in container
                    this.mapContainer.sendToBack(img); // Ensure behind grid
                    count++;
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

        let totalCost = 0;
        // let hasHighCost = false; // Unused
        for (const m of this.engine.pendingMoves) {
            const cost = this.engine.getMoveCost(m.r, m.c);
            totalCost += cost;
            // if (cost > GameConfig.COST_ATTACK) {
            //     hasHighCost = true;
            // }
        }

        if (currentPlayer.isAI) {
            // this.logSystem.addLog('🤖 AI is planning...', 'info');
        } else if (this.engine.lastError) {
            this.logSystem.addLog(this.engine.lastError, 'warning');
            this.notificationSystem.show(this.engine.lastError, 'error'); // Keep overlay warning for errors
        } else if (totalCost > currentGold) {
            // this.logSystem.addLog(`Need ${totalCost}G`, 'warning');
        } else {
            // Default
        }
    }

    private hasRenderedOnce: boolean = false;

    update(_time: number, _delta: number) {
        // Force initial render on first update to avoid black screen
        if (!this.hasRenderedOnce) {

            // Determine initial layout if not already done? resize calls it.
            // But if create happened before resize event fired? 
            // resize calls drawMap. 
            // If we need another force:
            this.drawMap();
            this.updateUI();
            this.hasRenderedOnce = true;
        }

        // Handle Map Scrolling
        if (this.isMapScrollable && this.scrollKeys) {
            let dx = 0;
            let dy = 0;
            const speed = this.mapScrollSpeed;

            if (this.scrollKeys.up.isDown || (this.cursors && this.cursors.up.isDown)) dy += speed;
            if (this.scrollKeys.down.isDown || (this.cursors && this.cursors.down.isDown)) dy -= speed;
            if (this.scrollKeys.left.isDown || (this.cursors && this.cursors.left.isDown)) dx += speed;
            if (this.scrollKeys.right.isDown || (this.cursors && this.cursors.right.isDown)) dx -= speed;

            if (dx !== 0 || dy !== 0) {
                this.mapContainer.x += dx;
                this.mapContainer.y += dy;
                // Update offset vars so input handling works
                this.mapOffsetX = this.mapContainer.x;
                this.mapOffsetY = this.mapContainer.y;
            }
        }
    }

    createCameraControls() {
        // Create 4 arrow buttons
        const size = 50;
        // const pad = 10; // Unused

        // Up
        const up = this.add.text(0, -size, '▲', { fontSize: '32px', color: '#ffffff', backgroundColor: '#333333' })
            .setInteractive()
            .on('pointerdown', () => this.scrollKeys.up.isDown = true)
            .on('pointerup', () => this.scrollKeys.up.isDown = false)
            .on('pointerout', () => this.scrollKeys.up.isDown = false)
            .setOrigin(0.5);

        // Down
        const down = this.add.text(0, size, '▼', { fontSize: '32px', color: '#ffffff', backgroundColor: '#333333' })
            .setInteractive()
            .on('pointerdown', () => this.scrollKeys.down.isDown = true)
            .on('pointerup', () => this.scrollKeys.down.isDown = false)
            .on('pointerout', () => this.scrollKeys.down.isDown = false)
            .setOrigin(0.5);

        // Left
        const left = this.add.text(-size, 0, '◀', { fontSize: '32px', color: '#ffffff', backgroundColor: '#333333' })
            .setInteractive()
            .on('pointerdown', () => this.scrollKeys.left.isDown = true)
            .on('pointerup', () => this.scrollKeys.left.isDown = false)
            .on('pointerout', () => this.scrollKeys.left.isDown = false)
            .setOrigin(0.5);

        // Right
        const right = this.add.text(size, 0, '▶', { fontSize: '32px', color: '#ffffff', backgroundColor: '#333333' })
            .setInteractive()
            .on('pointerdown', () => this.scrollKeys.right.isDown = true)
            .on('pointerup', () => this.scrollKeys.right.isDown = false)
            .on('pointerout', () => this.scrollKeys.right.isDown = false)
            .setOrigin(0.5);

        this.cameraControlsContainer.add([up, down, left, right]);
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

        const title = this.add.text(w / 2, h / 2 - 50, `${winner === 'P1' ? 'PLAYER 1' : 'PLAYER 2'} WINS!`, {
            fontSize: '64px',
            color: winner === 'P1' ? '#ff4444' : '#4444ff',
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
        graphics.lineStyle(4, color, 0.6); // Semi-transparent player color

        // Draw Diagonal Stripes (Top-Left to Bottom-Right)
        // Equation: x_rel + y_rel = k
        const step = 10; // Density
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
