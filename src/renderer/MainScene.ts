import Phaser from 'phaser';
import { GameEngine } from '../core/GameEngine';
import { GameConfig } from '../core/GameConfig';

export class MainScene extends Phaser.Scene {
    engine: GameEngine;
    tileSize: number = 64;
    gridGraphics!: Phaser.GameObjects.Graphics;
    uiText!: Phaser.GameObjects.Text;

    constructor() {
        super('MainScene');
        this.engine = new GameEngine();
    }

    preload() {
        // this.load.image('ground', 'assets/ground.png'); // Placeholder
        this.load.image('coin', 'assets/coin.png');
        this.load.image('ui_button', 'assets/ui_button.png');
        this.load.image('robot', 'assets/robot.png'); // AI
        this.load.image('human', 'assets/human.png'); // Human
    }

    // Class properties for UI Text
    p1GoldText!: Phaser.GameObjects.Text;
    p2GoldText!: Phaser.GameObjects.Text;
    costText!: Phaser.GameObjects.Text;
    feedbackText!: Phaser.GameObjects.Text;
    p1TitleText!: Phaser.GameObjects.Text;
    p2TitleText!: Phaser.GameObjects.Text;
    p1Coin!: Phaser.GameObjects.Image;
    p2Coin!: Phaser.GameObjects.Image;
    p1TypeIcon!: Phaser.GameObjects.Image; // Player Type Icon (Robot/Human)
    p2TypeIcon!: Phaser.GameObjects.Image; // Player Type Icon (Robot/Human)

    create() {
        this.cameras.main.setBackgroundColor('#2d2d2d');

        // Input
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.handleInput(pointer);
        });

        // Graphics Container
        this.gridGraphics = this.add.graphics();

        // --- Graphical Sidebar ---
        const sidebarX = GameConfig.GRID_SIZE * this.tileSize;

        // Draw Sidebar Background
        const sidebarBg = this.add.graphics();
        sidebarBg.fillStyle(0x222222); // Darker sidebar background
        sidebarBg.fillRect(sidebarX, 0, 250, this.sys.game.config.height as number);

        // Sidebar Header
        this.add.text(sidebarX + 20, 20, 'GAME STATUS', {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#ffffff',
            fontStyle: 'bold'
        });

        // Turn Info (Removed raw text, integrated into player highlight)
        // Kept for simple turn count if needed, but requested UI emphasizes player.
        this.uiText = this.add.text(sidebarX + 220, 20, '', {
            fontFamily: 'Arial', fontSize: '14px', color: '#aaaaaa'
        }); // Maybe use for Turn #?

        // P1 Gold Info
        this.p1TitleText = this.add.text(sidebarX + 20, 80, 'Player 1', {
            fontFamily: 'Arial', fontSize: '24px', color: '#ff4444', fontStyle: 'bold'
        });
        this.p1Coin = this.add.image(sidebarX + 30, 115, 'coin').setDisplaySize(24, 24);
        this.p1GoldText = this.add.text(sidebarX + 55, 105, '0', {
            fontFamily: 'Arial', fontSize: '20px', color: '#ffd700'
        });

        // Player Type Icons (Next to name)
        // Name is at ~20, length ~100? Put icon at 130.
        this.p1TypeIcon = this.add.image(sidebarX + 130, 92, 'human').setDisplaySize(24, 24); // Adjusted Y to align with P1TitleText
        this.p2TypeIcon = this.add.image(sidebarX + 130, 172, 'human').setDisplaySize(24, 24); // Adjusted Y to align with P2TitleText

        // P2 Gold Info
        this.p2TitleText = this.add.text(sidebarX + 20, 160, 'Player 2', {
            fontFamily: 'Arial', fontSize: '24px', color: '#4444ff', fontStyle: 'bold'
        });
        this.p2Coin = this.add.image(sidebarX + 30, 195, 'coin').setDisplaySize(24, 24);
        this.p2GoldText = this.add.text(sidebarX + 55, 185, '0', {
            fontFamily: 'Arial', fontSize: '20px', color: '#ffd700'
        });

        // Planning Cost Info
        this.add.text(sidebarX + 20, 260, 'Planned Cost:', {
            fontFamily: 'Arial', fontSize: '16px', color: '#aaaaaa'
        });
        this.costText = this.add.text(sidebarX + 20, 285, '0 G', {
            fontFamily: 'Arial', fontSize: '22px', color: '#ff8888', fontStyle: 'bold'
        });

        // --- Bottom Action Bar ---
        const mapHeight = GameConfig.GRID_SIZE * this.tileSize;
        const actionBarHeight = 100;
        const totalWidth = this.sys.game.config.width as number;

        // Draw Action Bar Background
        const actionBg = this.add.graphics();
        actionBg.fillStyle(0x333333);
        actionBg.fillRect(0, mapHeight, totalWidth, actionBarHeight);

        // Feedback Text Area (Bottom Left)
        this.feedbackText = this.add.text(20, mapHeight + 20, 'Select cells to plan your move.', {
            fontFamily: 'Arial', fontSize: '16px', color: '#eeeeee', wordWrap: { width: totalWidth - 250 }
        });

        // End Turn Button
        const btnX = totalWidth - 150; // Move button to right
        const btnY = mapHeight + actionBarHeight / 2;

        const endTurnBtn = this.add.image(btnX, btnY, 'ui_button')
            .setInteractive()
            .setDisplaySize(200, 60);

        this.add.text(btnX, btnY, 'END TURN', {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Button Interactions
        endTurnBtn.on('pointerover', () => {
            endTurnBtn.setTint(0xcccccc);
        });
        endTurnBtn.on('pointerout', () => {
            endTurnBtn.clearTint();
        });
        endTurnBtn.on('pointerdown', () => {
            endTurnBtn.setTint(0x888888);
            this.engine.endTurn();
        });
        endTurnBtn.on('pointerup', () => {
            endTurnBtn.setTint(0xcccccc);
        });

        // Event Listeners (View -> Model binding)
        this.engine.on('mapUpdate', () => this.drawMap());
        this.engine.on('turnChange', () => {
            this.drawMap();
            this.updateUI();
        });
        this.engine.on('planUpdate', () => {
            this.drawMap();
            this.updateUI();
        });
        let overlayContainer: Phaser.GameObjects.Container;

        this.engine.on('gameRestart', () => {
            if (overlayContainer) {
                overlayContainer.destroy();
            }
            this.input.enabled = true;
            this.updateUI();
            this.drawMap();
        });

        this.engine.on('gameOver', (winner: string) => {
            this.updateUI(); // Final update

            // Victory Overlay
            const w = this.sys.game.config.width as number;
            const h = this.sys.game.config.height as number;

            overlayContainer = this.add.container(0, 0);

            const bg = this.add.graphics();
            bg.fillStyle(0x000000, 0.8);
            bg.fillRect(0, 0, w, h);
            overlayContainer.add(bg);

            const title = this.add.text(w / 2, h / 2 - 50, `${winner === 'P1' ? 'PLAYER 1' : 'PLAYER 2'} WINS!`, {
                fontSize: '64px',
                color: winner === 'P1' ? '#ff4444' : '#4444ff',
                fontStyle: 'bold',
                stroke: '#ffffff',
                strokeThickness: 6
            }).setOrigin(0.5);
            overlayContainer.add(title);

            // Restart Button
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

            overlayContainer.add(restartBtn);

            // Disable input?
            this.input.enabled = false;
        });

        this.engine.on('incomeReport', (report: any) => {
            if (this.feedbackText) {
                const isAI = this.engine.state.getCurrentPlayer().isAI;
                const prefix = isAI ? "🤖 AI Thinking... " : "Income: ";

                this.feedbackText.setText(`${prefix}+${report.total}G (Base: ${report.base}, Land: ${report.land})`);
                this.feedbackText.setColor(isAI ? '#00ffff' : '#00ff00');
            }
        });

        // Initial Draw
        this.drawMap();
        this.updateUI();
    }

    handleInput(pointer: Phaser.Input.Pointer) {
        // Simple hit test - Only process clicks on the grid
        if (pointer.x >= GameConfig.GRID_SIZE * this.tileSize) return; // Ignore clicks on sidebar

        // Block input if AI turn
        const currentPlayer = this.engine.state.getCurrentPlayer();
        if (currentPlayer.isAI) {
            return;
        }

        const col = Math.floor(pointer.x / this.tileSize);
        const row = Math.floor(pointer.y / this.tileSize);

        if (col >= 0 && col < GameConfig.GRID_SIZE && row >= 0 && row < GameConfig.GRID_SIZE) {
            // this.engine.captureLand(row, col); // Old direct capture
            this.engine.togglePlan(row, col); // New planning toggle
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

                // Fill color based on owner
                if (cell.owner === 'P1') this.gridGraphics.fillStyle(0x880000);
                else if (cell.owner === 'P2') this.gridGraphics.fillStyle(0x000088);
                else this.gridGraphics.fillStyle(0x555555);

                this.gridGraphics.fillRect(x, y, this.tileSize - 2, this.tileSize - 2); // -2 for gap

                // Draw Base
                if (cell.building === 'base') {
                    this.gridGraphics.fillStyle(0xffffff);
                    this.gridGraphics.fillCircle(x + this.tileSize / 2, y + this.tileSize / 2, 10);
                }
            }
        }

        // Draw pending moves (selection)
        // This section replaces the old "Highlight Pending Moves" logic that was inside the loop.
        for (const p of this.engine.pendingMoves) {
            const x = p.c * this.tileSize;
            const y = p.r * this.tileSize;

            // Different color for Attack vs Capture?
            // Pending move doesn't store type, but we can check owner
            const cell = this.engine.state.getCell(p.r, p.c);
            if (cell && cell.owner && cell.owner !== this.engine.state.currentPlayerId) {
                this.gridGraphics.lineStyle(4, 0xff0000, 1); // Red for attack
            } else {
                this.gridGraphics.lineStyle(4, 0xffff00, 1); // Yellow for capture
            }

            this.gridGraphics.strokeRect(x + 2, y + 2, this.tileSize - 4, this.tileSize - 4);
        }

        // Draw Last AI Moves Highlight
        this.gridGraphics.lineStyle(4, 0xffffff, 0.8); // White, semi-transparent
        for (const m of this.engine.lastAiMoves) {
            const x = m.c * this.tileSize;
            const y = m.r * this.tileSize;
            this.gridGraphics.strokeRect(x + 2, y + 2, this.tileSize - 4, this.tileSize - 4);

            // Optional: Add a small "!" text? Or just border is enough.
        }
    }

    updateUI() {
        const p1 = this.engine.state.players['P1'];
        const p2 = this.engine.state.players['P2'];
        const curr = this.engine.state.currentPlayerId;

        // Update Turn Counter
        if (this.uiText) this.uiText.setText(`Turn ${this.engine.state.turnCount}`);

        // Update Gold Text
        if (this.p1GoldText) this.p1GoldText.setText(p1.gold.toString());
        if (this.p2GoldText) this.p2GoldText.setText(`${p2.gold}`);

        // Update active player highlight

        // P1 Visuals
        const p1Alpha = curr === 'P1' ? 1 : 0.5;
        this.p1TitleText.setAlpha(p1Alpha);
        this.p1GoldText.setAlpha(p1Alpha);
        this.p1Coin.setAlpha(p1Alpha);

        // Update Icon Type & Alpha
        this.p1TypeIcon.setTexture(p1.isAI ? 'robot' : 'human');
        this.p1TypeIcon.setAlpha(p1Alpha);

        // P2 Visuals
        const p2Alpha = curr === 'P2' ? 1 : 0.5;
        this.p2TitleText.setAlpha(p2Alpha);
        this.p2GoldText.setAlpha(p2Alpha);
        this.p2Coin.setAlpha(p2Alpha);

        // Update Icon Type & Alpha
        this.p2TypeIcon.setTexture(p2.isAI ? 'robot' : 'human');
        this.p2TypeIcon.setAlpha(p2Alpha);

        // Update Cost
        let totalCost = 0;
        let hasHighCost = false;

        for (const m of this.engine.pendingMoves) {
            const cost = this.engine.getMoveCost(m.r, m.c);
            totalCost += cost;
            if (cost > GameConfig.COST_ATTACK) {
                hasHighCost = true;
            }
        }
        if (this.costText) this.costText.setText(`${totalCost} G`);

        // Update Feedback
        if (this.feedbackText) {
            const currentPlayer = this.engine.state.getCurrentPlayer();

            if (currentPlayer.isAI) {
                this.feedbackText.setText('🤖 AI Thinking...');
                this.feedbackText.setColor('#00ffff');

            } else if (this.engine.lastError) {
                this.feedbackText.setText(`⚠️ ${this.engine.lastError}`);
                this.feedbackText.setColor('#ff5555');
            } else if (hasHighCost) {
                this.feedbackText.setText('⚠️ Distance Penalty: Attack cost doubled!');
                this.feedbackText.setColor('#ffff00');
            } else {
                this.feedbackText.setText('Select cells to plan. Click "END TURN" to build.');
                this.feedbackText.setColor('#eeeeee');
            }
        }
    }
}
