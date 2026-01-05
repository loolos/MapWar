import Phaser from 'phaser';
import { GameEngine } from '../core/GameEngine';
import { GameConfig } from '../core/GameConfig';
import { NotificationSystem } from './ui/NotificationSystem';
import { ActionButtonSystem } from './ui/ActionButtonSystem';
import { PlayerStatusSystem } from './ui/PlayerStatusSystem';
import { CellInfoSystem } from './ui/CellInfoSystem';

export class MainScene extends Phaser.Scene {
    engine: GameEngine;
    tileSize: number = 64;
    // Graphical Layers
    gridGraphics!: Phaser.GameObjects.Graphics;
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

    constructor() {
        super('MainScene');
        this.engine = new GameEngine();
    }

    preload() {
        this.load.image('coin', 'assets/coin.png');
        this.load.image('ui_button', 'assets/ui_button.png');
        this.load.image('robot', 'assets/robot.png'); // AI
        this.load.image('human', 'assets/human.png'); // Human
        this.load.image('tile_plain', 'assets/tile_plain.png');
        this.load.image('tile_hill', 'assets/tile_hill.png');
        this.load.image('tile_water', 'assets/tile_water.png');
    }

    create() {
        this.cameras.main.setBackgroundColor(GameConfig.COLORS.BG);

        // Debug Log
        console.log('MainScene Create: Grid Size', GameConfig.GRID_SIZE);

        // Input
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.handleInput(pointer);
        });

        // ---------------------------------------------------------
        // INITIALIZE GRAPHICS & SYSTEMS (Empty/Default)
        // ---------------------------------------------------------

        // Map Container
        this.mapContainer = this.add.container(0, 0);
        this.terrainGroup = this.add.group(); // Images will be added to specific coords, but we'll add them to container instead?
        // Phaser Group cannot be added to Container directly if it's a "Group" of GameObjects. 
        // We actually add the GameObjects to the container. 
        // Let's change terrain logic slightly: we'll add images to mapContainer directly if possible, or just use group.
        // Actually, Group is efficient for pooling. Container is for transforms.
        // We will make `terrainGroup` just a list tracker, and add valid objects to `mapContainer`.

        this.gridGraphics = this.add.graphics();
        this.mapContainer.add(this.gridGraphics); // Grid on top?
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

        // Trigger Initial Layout
        this.resize(this.scale.gameSize);
    }

    resize(gameSize: Phaser.Structs.Size) {
        const width = gameSize.width;
        const height = gameSize.height;

        this.cameras.main.setViewport(0, 0, width, height);

        // Determine Orientation
        const isPortrait = height > width;

        if (isPortrait) {
            this.layoutPortrait(width, height);
        } else {
            this.layoutLandscape(width, height);
        }

        this.initializeTerrainVisuals(); // Re-create terrain images with new tile size
        this.drawMap();
        this.updateUI();
        // Hack/Fix: Force a redraw after a short delay
        this.time.delayedCall(100, () => {
            this.drawMap();
            this.updateUI();
        });
    }

    layoutLandscape(w: number, h: number) {
        const sidebarWidth = 300;
        const bottomHeight = 180;

        // Map takes (W - Sidebar) x (H - Bottom)
        const availableMapW = w - sidebarWidth;
        const availableMapH = h - bottomHeight;

        const maxTileW = Math.floor(availableMapW / GameConfig.GRID_SIZE);
        const maxTileH = Math.floor(availableMapH / GameConfig.GRID_SIZE);
        this.tileSize = Math.min(maxTileW, maxTileH, 64);

        const mapSize = this.tileSize * GameConfig.GRID_SIZE;

        // Origins
        this.mapOffsetX = 0;
        this.mapOffsetY = 0;
        this.mapContainer.setPosition(0, 0);

        const tr_x = mapSize;
        const tr_y = 0;
        const bl_x = 0;
        const bl_y = mapSize;
        const br_x = mapSize;
        const br_y = mapSize;

        // Resize Backgrounds
        this.trBg.clear().fillStyle(0x222222).fillRect(tr_x, tr_y, sidebarWidth, mapSize);
        this.blBg.clear().fillStyle(GameConfig.COLORS.ACTION_BG).fillRect(bl_x, bl_y, mapSize, bottomHeight);
        this.brBg.clear().fillStyle(0x111111).fillRect(br_x, br_y, sidebarWidth, bottomHeight);

        // Update Systems
        this.playerStatusSystem.setPosition(tr_x, tr_y);
        this.playerStatusSystem.resize(mapSize); // Height matches map

        this.infoSystem.setPosition(tr_x + 10, tr_y + 350);
        this.infoSystem.resize(sidebarWidth - 20);

        this.buttonSystem.setPosition(bl_x + 20, bl_y + 20);

        this.notificationSystem.setPosition(br_x + 10, br_y + 10);
        this.notificationSystem.resize(sidebarWidth - 20, bottomHeight - 20);
    }

    layoutPortrait(w: number, h: number) {
        // Stacked Layout
        // Map (Square, Centered)
        // Status (Below Map)
        // Buttons (Below Status)
        // Logs (Bottom Fill)

        const maxTile = Math.floor(w / GameConfig.GRID_SIZE);
        const maxTileH = Math.floor((h * 0.5) / GameConfig.GRID_SIZE);
        this.tileSize = Math.min(maxTile, maxTileH, 64);

        const mapSize = this.tileSize * GameConfig.GRID_SIZE;

        // Center Map Horizontally
        this.mapOffsetX = (w - mapSize) / 2;
        this.mapOffsetY = 10; // Top padding
        this.mapContainer.setPosition(this.mapOffsetX, this.mapOffsetY);

        const nextY = this.mapOffsetY + mapSize + 10;

        const statusHeight = 300;
        this.trBg.clear().fillStyle(0x222222).fillRect(0, nextY, w, statusHeight);

        this.playerStatusSystem.setPosition(10, nextY);
        this.playerStatusSystem.resize(statusHeight);

        // Put Cell Info to the right of Player Status
        this.infoSystem.setPosition(180, nextY);
        this.infoSystem.resize(w - 190);

        // Buttons at Bottom Fixed
        const btnHeight = 120;
        const btnY = h - btnHeight;

        this.blBg.clear().fillStyle(GameConfig.COLORS.ACTION_BG).fillRect(0, btnY, w, btnHeight);
        this.buttonSystem.setPosition(10, btnY + 10);

        // Notifications between Status and Buttons
        const notifY = nextY + statusHeight;
        const notifH = btnY - notifY;
        if (notifH > 0) {
            this.brBg.clear().fillStyle(0x111111).fillRect(0, notifY, w, notifH);
            this.notificationSystem.setPosition(10, notifY + 10);
            this.notificationSystem.resize(w - 20, notifH - 20);
            this.notificationSystem.setVisible(true);
        } else {
            this.notificationSystem.setVisible(false); // No space
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

        // Adjust pointer by map offset
        const localX = pointer.x - this.mapOffsetX;
        const localY = pointer.y - this.mapOffsetY;

        // Ignore clicks outside the map grid
        const mapWidth = GameConfig.GRID_SIZE * this.tileSize;
        const mapHeight = GameConfig.GRID_SIZE * this.tileSize;

        if (localX < 0 || localX >= mapWidth || localY < 0 || localY >= mapHeight) return;

        // Block input if AI turn
        const currentPlayer = this.engine.state.getCurrentPlayer();
        if (currentPlayer.isAI) {
            return;
        }

        const col = Math.floor(localX / this.tileSize);
        const row = Math.floor(localY / this.tileSize);

        if (col >= 0 && col < GameConfig.GRID_SIZE && row >= 0 && row < GameConfig.GRID_SIZE) {
            // Update Selection
            this.selectedRow = row;
            this.selectedCol = col;
            this.infoSystem.update(this.engine, row, col);

            this.engine.togglePlan(row, col);
        }
    }

    drawMap() {
        this.gridGraphics.clear();
        const grid = this.engine.state.grid;

        for (let r = 0; r < GameConfig.GRID_SIZE; r++) {
            for (let c = 0; c < GameConfig.GRID_SIZE; c++) {
                const cell = grid[r][c];
                const x = c * this.tileSize;
                const y = r * this.tileSize;

                let alpha = 0.6; // Default to semi-transparent to show terrain
                // Disconnected Effect: even more faint
                if (cell.owner && !cell.isConnected) {
                    alpha = 0.3;
                }

                if (cell.owner === 'P1') this.gridGraphics.fillStyle(GameConfig.COLORS.P1, alpha);
                else if (cell.owner === 'P2') this.gridGraphics.fillStyle(GameConfig.COLORS.P2, alpha);

                // Only fill if owned (overlay). unowned = transparent (show terrain texture)
                if (cell.owner) {
                    this.gridGraphics.fillRect(x, y, this.tileSize - 2, this.tileSize - 2);
                }

                // ALWAYS draw grid lines so we can see the cells
                this.gridGraphics.lineStyle(2, 0x444444, 0.5); // Dark grey stroke
                this.gridGraphics.strokeRect(x, y, this.tileSize - 2, this.tileSize - 2);

                // If owned hill, draw a little marker to distinguish from plain?
                // Or maybe just texture later. For now, small grey rect in corner?
                if (cell.type === 'hill') {
                    this.gridGraphics.fillStyle(0x333333, 0.5);
                    this.gridGraphics.fillRect(x + 5, y + 5, 10, 10);
                }

                if (cell.building === 'base') {
                    this.gridGraphics.fillStyle(GameConfig.COLORS.BASE);
                    this.gridGraphics.fillCircle(x + this.tileSize / 2, y + this.tileSize / 2, 10);
                }
            }
        }

        // Draw Pending Moves
        for (const p of this.engine.pendingMoves) {
            const x = p.c * this.tileSize;
            const y = p.r * this.tileSize;
            const cell = this.engine.state.getCell(p.r, p.c);

            // Highlight color based on action type
            if (cell && cell.owner && cell.owner !== this.engine.state.currentPlayerId) {
                this.gridGraphics.lineStyle(4, GameConfig.COLORS.HIGHLIGHT_ATTACK, 1); // Attack
            } else {
                this.gridGraphics.lineStyle(4, GameConfig.COLORS.HIGHLIGHT_MOVE, 1); // Move/Capture
            }
            this.gridGraphics.strokeRect(x + 2, y + 2, this.tileSize - 4, this.tileSize - 4);
        }

        // Highlight AI Moves
        this.gridGraphics.lineStyle(4, GameConfig.COLORS.HIGHLIGHT_AI, 0.8);
        for (const m of this.engine.lastAiMoves) {
            const x = m.c * this.tileSize;
            const y = m.r * this.tileSize;
            this.gridGraphics.strokeRect(x + 2, y + 2, this.tileSize - 4, this.tileSize - 4);
        }
    }

    initializeTerrainVisuals() {
        console.log("initializeTerrainVisuals: START");

        if (this.terrainGroup) {
            this.terrainGroup.clear(true, true); // Destroy entities
        }

        // Also clear mapContainer of images (but keep gridGraphics!)
        // Since we didn't add images to mapContainer before, we start fresh logic:
        // Identify images in mapContainer that are terrain and destroy them?
        // Or just use a Group to track them and destroy them.

        // BETTER: remove all from terrainGroup (which destroys them).
        // Then create new images and add to terrainGroup AND mapContainer.

        const grid = this.engine.state.grid;
        if (!grid || grid.length === 0) {
            console.error("initializeTerrainVisuals: GRID IS EMPTY OR NULL");
            return;
        }

        let count = 0;
        try {
            for (let r = 0; r < GameConfig.GRID_SIZE; r++) {
                for (let c = 0; c < GameConfig.GRID_SIZE; c++) {
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
        console.log(`initializeTerrainVisuals: END. Created ${count} images.`);
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
            console.log("Forcing initial drawMap");
            // Determine initial layout if not already done? resize calls it.
            // But if create happened before resize event fired? 
            // resize calls drawMap. 
            // If we need another force:
            this.drawMap();
            this.updateUI();
            this.hasRenderedOnce = true;
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

        const title = this.add.text(w / 2, h / 2 - 50, `${winner === 'P1' ? 'PLAYER 1' : 'PLAYER 2'} WINS!`, {
            fontSize: '64px',
            color: winner === 'P1' ? '#ff4444' : '#4444ff',
            fontStyle: 'bold',
            stroke: '#ffffff',
            strokeThickness: 6
        }).setOrigin(0.5);
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

        this.overlayContainer.add(restartBtn);
        // Input blocked via handleInput check
    }
}
