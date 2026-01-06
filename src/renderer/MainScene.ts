import Phaser from 'phaser';
import { GameEngine } from '../core/GameEngine';
import { GameConfig } from '../core/GameConfig';
import { NotificationSystem } from './ui/NotificationSystem';
import { ActionButtonSystem } from './ui/ActionButtonSystem';
import { PlayerStatusSystem } from './ui/PlayerStatusSystem';
import { CellInfoSystem } from './ui/CellInfoSystem';
import { TextureUtils } from '../utils/TextureUtils';

export class MainScene extends Phaser.Scene {
    engine!: GameEngine;
    tileSize: number = 64;
    // Graphical Layers
    gridGraphics!: Phaser.GameObjects.Graphics;
    terrainGraphics!: Phaser.GameObjects.Graphics; // Ensure this is defined
    selectionGraphics!: Phaser.GameObjects.Graphics;
    highlightGraphics!: Phaser.GameObjects.Graphics;
    terrainGroup!: Phaser.GameObjects.Group;

    // UI Systems
    notificationSystem!: NotificationSystem;
    buttonSystem!: ActionButtonSystem;
    playerStatusSystem!: PlayerStatusSystem;
    infoSystem!: CellInfoSystem;

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
    minTileSize: number = 32;
    isMapScrollable: boolean = false;
    mapScrollSpeed: number = 10;
    scrollKeys!: {
        up: Phaser.Input.Keyboard.Key,
        down: Phaser.Input.Keyboard.Key,
        left: Phaser.Input.Keyboard.Key,
        right: Phaser.Input.Keyboard.Key
    };
    cameraControlsContainer!: Phaser.GameObjects.Container; // UI for pan buttons

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

    create() {
        // Initialize GameEngine (fresh instance on Scene start)
        this.engine = new GameEngine();

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
        // Phaser Group cannot be added to Container directly if it's a "Group" of GameObjects. 
        // We actually add the GameObjects to the container. 
        // Let's change terrain logic slightly: we'll add images to mapContainer directly if possible, or just use group.
        // Actually, Group is efficient for pooling. Container is for transforms.
        // We will make `terrainGroup` just a list tracker, and add valid objects to `mapContainer`.

        // Graphics Layers
        this.gridGraphics = this.add.graphics();
        this.terrainGraphics = this.add.graphics();
        this.selectionGraphics = this.add.graphics();
        this.highlightGraphics = this.add.graphics();

        // Add to map container in order
        this.mapContainer.add(this.terrainGraphics); // Bottom
        this.mapContainer.add(this.gridGraphics);    // Grid on top of terrain color
        this.mapContainer.add(this.selectionGraphics);
        this.mapContainer.add(this.highlightGraphics);
        // Wait, terrain is under grid. 
        // We'll manage terrain images manually inside mapContainer.

        // UI Backgrounds
        this.trBg = this.add.graphics();
        this.blBg = this.add.graphics();
        this.brBg = this.add.graphics();

        // UI Systems (Init with dummies)
        this.playerStatusSystem = new PlayerStatusSystem(this, 0, 0, 100);
        this.infoSystem = new CellInfoSystem(this, 0, 0, 100);
        this.buttonSystem = new ActionButtonSystem(this, 0, 0);
        this.notificationSystem = new NotificationSystem(this, 0, 0, 100, 100);
        this.setupButtons();

        // Handle Resize
        this.scale.on('resize', this.resize, this);

        // Event Listeners
        this.engine.on('mapUpdate', () => this.drawMap());
        this.engine.on('turnChange', () => {
            this.drawMap();
            this.updateUI();
        });
        this.engine.on('planUpdate', () => {
            this.drawMap();
            this.updateUI();
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

        this.engine.on('incomeReport', (report: any) => {
            const isAI = this.engine.state.getCurrentPlayer().isAI;
            const prefix = isAI ? "AI Turn: " : "Income Report: ";
            const msg = `${prefix}+${report.total}G (Base: ${report.base}, Land: ${report.land})`;
            this.notificationSystem.show(msg, 'info');
        });

        this.cameraControlsContainer = this.add.container(0, 0);
        this.cameraControlsContainer.setVisible(false);
        this.createCameraControls();

        // Trigger Initial Layout
        this.resize(this.scale.gameSize);
    }

    resize(gameSize: Phaser.Structs.Size) {
        const width = gameSize.width;
        const height = gameSize.height;

        this.cameras.main.setViewport(0, 0, width, height);

        // Re-initialize terrain visuals (e.g. if map size changed or first run)
        this.initializeTerrainVisuals();

        // Common UI Layout (Sidebar/Footer agnostic simple layout for Rectangular Map)
        // Let's implement a simple Responsive Layout:
        // Sidebar on Left (Status + Info). Buttons on Bottom Right? 
        // For simplicity, we keep the previous landscape/portrait split concept but simplified.

        const sidebarW = 260; // Left column width
        const bottomH = 200; // Bottom area height

        // Re-position UI backgrounds
        this.trBg.clear().fillStyle(0x222222).fillRect(0, 0, sidebarW, height); // Sidebar BG
        this.brBg.clear().fillStyle(0x111111).fillRect(width - sidebarW, height - bottomH, sidebarW, bottomH); // Notification BG place
        this.blBg.clear().fillStyle(GameConfig.COLORS.ACTION_BG).fillRect(0, height - bottomH, width, bottomH); // Footer BG

        // 1. Sidebar (Status & Info)
        this.playerStatusSystem.resize(sidebarW, 300, 0, 0);
        this.infoSystem.resize(sidebarW, 0, 310);

        // 2. Buttons & Notifications
        // Buttons: Bottom Left?
        this.buttonSystem.setPosition(20, height - bottomH + 20);

        // Notifications: Bottom Right?
        // Let's float notifications top right? 
        // Or just put them in the bottom bar to the right.
        this.notificationSystem.resize(300, bottomH - 20);
        this.notificationSystem.setPosition(width - 320, height - bottomH + 10);
        this.notificationSystem.setVisible(true);


        // 3. MAP AREA
        // Available space:
        // Left: sidebarW
        // Bottom: bottomH
        // Map Area = Top Left: (sidebarW, 0) to Bottom Right: (width, height - bottomH ?)
        // Actually let's assume Sidebar consumes Left, Footer consumes Bottom.

        const mapX = sidebarW;
        const mapY = 0;
        const mapAreaW = width - sidebarW;
        const mapAreaH = height - bottomH;

        if (mapAreaW <= 0 || mapAreaH <= 0) return; // Window too small

        // Dimensions of Map
        const mapPixelW = GameConfig.GRID_WIDTH * this.tileSize;
        const mapPixelH = GameConfig.GRID_HEIGHT * this.tileSize;

        // Scaling to Fit
        const scaleX = (mapAreaW - 40) / mapPixelW;
        const scaleY = (mapAreaH - 40) / mapPixelH;
        let scale = Math.min(scaleX, scaleY);

        // Clamp Scale
        scale = Math.min(scale, 1.2); // Max zoom
        const minScale = this.minTileSize / this.tileSize;
        if (scale < minScale) scale = minScale;

        this.mapContainer.setScale(scale);

        // Center Map
        const scaledMapW = mapPixelW * scale;
        const scaledMapH = mapPixelH * scale;

        this.isMapScrollable = (scaledMapW > mapAreaW || scaledMapH > mapAreaH);

        // Calculate Centered Position
        let targetX = mapX + (mapAreaW - scaledMapW) / 2;
        let targetY = mapY + (mapAreaH - scaledMapH) / 2;

        if (this.isMapScrollable) {
            // If scrollable, clamp to start at top-left of area (with padding)
            if (scaledMapW > mapAreaW) targetX = mapX + 20; // Padding
            if (scaledMapH > mapAreaH) targetY = mapY + 20;

            this.cameraControlsContainer.setVisible(true);
            this.cameraControlsContainer.setPosition(width - 80, height - bottomH - 80);
        } else {
            this.cameraControlsContainer.setVisible(false);
        }

        this.mapContainer.setPosition(targetX, targetY);

        // Update Offsets for Input
        this.mapOffsetX = this.mapContainer.x;
        this.mapOffsetY = this.mapContainer.y;
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
        const mapWidth = GameConfig.GRID_WIDTH * this.tileSize;
        const mapHeight = GameConfig.GRID_HEIGHT * this.tileSize;

        if (localX < 0 || localX >= mapWidth || localY < 0 || localY >= mapHeight) return;

        // Block input if AI turn
        const currentPlayer = this.engine.state.getCurrentPlayer();
        if (currentPlayer.isAI) {
            return;
        }

        const col = Math.floor(localX / this.tileSize);
        const row = Math.floor(localY / this.tileSize);

        if (col >= 0 && col < GameConfig.GRID_WIDTH && row >= 0 && row < GameConfig.GRID_HEIGHT) {
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

        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                const cell = grid[r][c];
                const x = c * this.tileSize;
                const y = r * this.tileSize;

                // 1. TERRAIN & OWNER COLOR
                // We do NOT draw opaque backgrounds for terrain types anymore, 
                // allowing the underlying PNG images (initialized in initializeTerrainVisuals) to show.

                let overlayColor: number | null = null;
                let alpha = 0;

                // Owner Overlays
                if (cell.owner === 'P1') {
                    overlayColor = GameConfig.COLORS.P1;
                    alpha = 0.5;
                } else if (cell.owner === 'P2') {
                    overlayColor = GameConfig.COLORS.P2;
                    alpha = 0.5;
                }

                // Disconnected Grey-out (Override or Overlay on top?)
                if (cell.owner && !cell.isConnected) {
                    overlayColor = 0x333333; // Dark Grey
                    alpha = 0.7; // Darker to show "disabled"
                }

                // Apply Overlay if needed
                if (overlayColor !== null) {
                    this.gridGraphics.fillStyle(overlayColor, alpha);
                    this.gridGraphics.fillRect(x, y, this.tileSize - 2, this.tileSize - 2);
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
                }

                // 3. SELECTION / HIGHLIGHTS
                // Pending Moves
                const isPending = this.engine.pendingMoves.some(m => m.r === r && m.c === c);
                if (isPending) {
                    this.selectionGraphics.fillStyle(GameConfig.COLORS.HIGHLIGHT_MOVE, 0.5);
                    this.selectionGraphics.fillRect(x, y, this.tileSize, this.tileSize);
                }

                // AI Moves History
                const isAiMove = this.engine.lastAiMoves.some(m => m.r === r && m.c === c);
                if (isAiMove) {
                    this.selectionGraphics.lineStyle(4, GameConfig.COLORS.HIGHLIGHT_AI);
                    this.selectionGraphics.strokeRect(x, y, this.tileSize, this.tileSize);
                }
            }
        }

        // Ensure map is correctly positioned after content change?
        // resize() handles scale/pos.
        // If this is first draw, we might need to force resize logic?
        if (!this.hasRenderedOnce) {
            this.resize(this.scale.gameSize);
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
            for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
                for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                    const cell = grid[r][c];
                    const x = c * this.tileSize + this.tileSize / 2; // Center origin
                    const y = r * this.tileSize + this.tileSize / 2;

                    let texture = 'tile_plain';
                    if (cell.type === 'hill') texture = 'tile_hill';
                    else if (cell.type === 'water') texture = 'tile_water';

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
        let hasHighCost = false;
        for (const m of this.engine.pendingMoves) {
            const cost = this.engine.getMoveCost(m.r, m.c);
            totalCost += cost;
            if (cost > GameConfig.COST_ATTACK) {
                hasHighCost = true;
            }
        }

        if (currentPlayer.isAI) {
            // this.notificationSystem.show('🤖 AI is planning...', 'info');
            // Don't spam notifications on updateUI
        } else if (this.engine.lastError) {
            this.notificationSystem.show(`⚠️ ${this.engine.lastError}`, 'error');
        } else if (totalCost > currentGold) {
            this.notificationSystem.show(`Insufficient Gold! Need ${totalCost}G`, 'error');
        } else if (hasHighCost) {
            this.notificationSystem.show('⚠️ Long range attack expensive!', 'warning');
        } else {
            // Keep last message or show default?
            // this.notificationSystem.show('Select cells to move. Click End Turn when ready.', 'info');
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

            if (this.scrollKeys.up.isDown) dy += speed;
            if (this.scrollKeys.down.isDown) dy -= speed;
            if (this.scrollKeys.left.isDown) dx += speed;
            if (this.scrollKeys.right.isDown) dx -= speed;

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

        const restartBtn = this.add.text(w / 2, h / 2 + 60, 'PLAY AGAIN (SWAP)', {
            fontSize: '32px',
            color: '#ffffff',
            backgroundColor: '#333333',
            padding: { x: 20, y: 10 }
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
                this.engine.restartGame();
            })
            .on('pointerover', () => restartBtn.setStyle({ backgroundColor: '#555555' }))
            .on('pointerout', () => restartBtn.setStyle({ backgroundColor: '#333333' }));

        // Scale button to fit width
        if (restartBtn.width > maxW) {
            restartBtn.setScale(maxW / restartBtn.width);
        }

        this.overlayContainer.add(restartBtn);
        // Input blocked via handleInput check
    }
}
