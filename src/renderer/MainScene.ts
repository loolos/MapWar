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

        // Graphics Container
        this.gridGraphics = this.add.graphics();
        this.terrainGroup = this.add.group();
        this.gridGraphics.depth = 1; // Overlay on top of terrain


        // Calculate responsive Layout
        const sidebarWidth = 320; // Reserved width for sidebar
        const bottomBarHeight = 160; // Reserved height for actions
        const pad = 20;

        const availableHeight = (this.sys.game.config.height as number) - bottomBarHeight - pad;
        const availableWidth = (this.sys.game.config.width as number) - sidebarWidth - pad;

        const maxTileHeight = Math.floor(availableHeight / GameConfig.GRID_SIZE);
        const maxTileWidth = Math.floor(availableWidth / GameConfig.GRID_SIZE);

        this.tileSize = Math.min(maxTileHeight, maxTileWidth, 64); // Cap max size at 64

        // Layout Constants
        const mapWidth = GameConfig.GRID_SIZE * this.tileSize;

        // --- Graphical Sidebar (Player Status System) ---
        // Width ~260, Height = game height
        this.playerStatusSystem = new PlayerStatusSystem(this, mapWidth, 0, this.sys.game.config.height as number);

        // --- Cell Info Panel (Middle Right) ---
        // Position it below the status panel area? 
        // Status runs 0 to ~200? Let's give it some space.
        this.infoSystem = new CellInfoSystem(this, mapWidth + 10, 300, 240);

        // --- Bottom Action Bar ---
        const mapHeight = GameConfig.GRID_SIZE * this.tileSize;
        const actionBarHeight = 150;
        const actionBarY = mapHeight;

        // Draw Action Bar Background
        const actionBg = this.add.graphics();
        actionBg.fillStyle(GameConfig.COLORS.ACTION_BG);
        actionBg.fillRect(0, actionBarY, (this.sys.game.config.width as number), actionBarHeight);

        // Initialize UI Systems

        // Button System (Left/Center)
        this.buttonSystem = new ActionButtonSystem(this, 20, actionBarY + 15);
        this.setupButtons();

        // Notification System (Bottom Right)
        const sidebarX = mapWidth;
        const notifWidth = (this.sys.game.config.width as number) - sidebarX - 20;
        this.notificationSystem = new NotificationSystem(this, sidebarX + 10, actionBarY + 10, notifWidth, actionBarHeight - 20);
        this.notificationSystem.show("Welcome to MapWar! Select cells to move.", 'info');

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

        // Initial Draw
        this.initializeTerrainVisuals();
        this.drawMap();
        this.updateUI();

        // Hack/Fix: Force a redraw after a short delay to ensure rendering catches up
        // (Fixes issue where map is black until first click)
        this.time.delayedCall(100, () => {
            this.drawMap();
            this.updateUI();
        });
    }

    setupButtons() {
        // Slot 0 (Row 0, Col 0): End Turn
        this.buttonSystem.addButton(0, 0, "END TURN", () => {
            this.engine.endTurn();
        });
    }

    handleInput(pointer: Phaser.Input.Pointer) {
        // Block input if game over
        if (this.engine.isGameOver) {
            return;
        }

        // Ignore clicks outside the map grid
        const mapWidth = GameConfig.GRID_SIZE * this.tileSize;
        const mapHeight = GameConfig.GRID_SIZE * this.tileSize;

        if (pointer.x >= mapWidth || pointer.y >= mapHeight) return;

        // Block input if AI turn
        const currentPlayer = this.engine.state.getCurrentPlayer();
        if (currentPlayer.isAI) {
            return;
        }

        const col = Math.floor(pointer.x / this.tileSize);
        const row = Math.floor(pointer.y / this.tileSize);

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
            this.notificationSystem.show('🤖 AI is planning...', 'info');
        } else if (this.engine.lastError) {
            this.notificationSystem.show(`⚠️ ${this.engine.lastError}`, 'error');
        } else if (totalCost > currentGold) {
            this.notificationSystem.show(`Insufficient Gold! Need ${totalCost}G`, 'error');
        } else if (hasHighCost) {
            this.notificationSystem.show('⚠️ Long range attack expensive!', 'warning');
        } else {
            this.notificationSystem.show('Select cells to move. Click End Turn when ready.', 'info');
        }
    }

    private hasRenderedOnce: boolean = false;

    update(_time: number, _delta: number) {
        // Force initial render on first update to avoid black screen
        if (!this.hasRenderedOnce) {
            console.log("Forcing initial drawMap");
            this.drawMap();
            this.updateUI();
            this.hasRenderedOnce = true;
        }
    }

    initializeTerrainVisuals() {
        if (!this.terrainGroup) {
            return;
        }
        this.terrainGroup.clear(true, true); // Destroy existing children

        const grid = this.engine.state.grid;
        if (!grid) return;

        for (let r = 0; r < GameConfig.GRID_SIZE; r++) {
            for (let c = 0; c < GameConfig.GRID_SIZE; c++) {
                const cell = grid[r][c];
                if (!cell) continue;

                const x = c * this.tileSize + this.tileSize / 2; // Center origin
                const y = r * this.tileSize + this.tileSize / 2;

                let texture = 'tile_plain';
                if (cell.type === 'hill') texture = 'tile_hill';
                else if (cell.type === 'water') texture = 'tile_water';

                const img = this.add.image(x, y, texture);
                img.setDisplaySize(this.tileSize, this.tileSize);
                this.terrainGroup.add(img);
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

        const w = this.sys.game.config.width as number;
        const h = this.sys.game.config.height as number;

        this.overlayContainer = this.add.container(0, 0);

        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.8);
        bg.fillRect(0, 0, w, h);
        this.overlayContainer.add(bg);

        const title = this.add.text(w / 2, h / 2 - 50, `${winner === 'P1' ? 'PLAYER 1' : 'PLAYER 2'} WINS!`, {
            fontSize: '64px',
            color: winner === 'P1' ? '#ff4444' : '#4444ff', // Keep winning colors dynamic/specific
            fontStyle: 'bold',
            stroke: '#ffffff',
            strokeThickness: 6
        }).setOrigin(0.5);
        this.overlayContainer.add(title);

        const restartBtn = this.add.text(w / 2, h / 2 + 60, 'PLAY AGAIN (SWAP)', {
            fontSize: '32px',
            color: '#ffffff',
            backgroundColor: '#333333', // Could use UI_BG but #333333 is fine for button specific
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
