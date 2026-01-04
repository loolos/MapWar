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
        this.load.image('coin', 'assets/coin.png');
        this.load.image('ui_button', 'assets/ui_button.png');
    }

    // Class properties for UI Text
    p1GoldText!: Phaser.GameObjects.Text;
    p2GoldText!: Phaser.GameObjects.Text;
    feedbackText!: Phaser.GameObjects.Text;
    costText!: Phaser.GameObjects.Text;

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

        // Turn Info
        this.add.text(sidebarX + 20, 70, 'Turn:', {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#aaaaaa'
        });
        this.uiText = this.add.text(sidebarX + 80, 70, '', {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: '#ffffff',
            fontStyle: 'bold'
        });

        // P1 Gold Info
        this.add.text(sidebarX + 20, 120, 'Player 1', {
            fontFamily: 'Arial', fontSize: '16px', color: '#ff4444', fontStyle: 'bold'
        });
        this.add.image(sidebarX + 30, 150, 'coin').setDisplaySize(24, 24);
        this.p1GoldText = this.add.text(sidebarX + 55, 140, '0', {
            fontFamily: 'Arial', fontSize: '20px', color: '#ffd700'
        });

        // P2 Gold Info
        this.add.text(sidebarX + 20, 190, 'Player 2', {
            fontFamily: 'Arial', fontSize: '16px', color: '#4444ff', fontStyle: 'bold'
        });
        this.add.image(sidebarX + 30, 220, 'coin').setDisplaySize(24, 24);
        this.p2GoldText = this.add.text(sidebarX + 55, 210, '0', {
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

        const btnText = this.add.text(btnX, btnY, 'END TURN', {
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

        // Initial Draw
        this.drawMap();
        this.updateUI();
    }

    handleInput(pointer: Phaser.Input.Pointer) {
        // Simple hit test - Only process clicks on the grid
        if (pointer.x >= GameConfig.GRID_SIZE * this.tileSize) return; // Ignore clicks on sidebar

        const col = Math.floor(pointer.x / this.tileSize);
        const row = Math.floor(pointer.y / this.tileSize);

        if (col >= 0 && col < GameConfig.GRID_SIZE && row >= 0 && row < GameConfig.GRID_SIZE) {
            console.log(`Clicked Cell: ${row}, ${col}`);
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

                // Highlight Pending Moves
                const isPending = this.engine.pendingMoves.some(m => m.r === r && m.c === c);
                if (isPending) {
                    // Draw a yellow border or overlay
                    this.gridGraphics.lineStyle(4, 0xffff00);
                    this.gridGraphics.strokeRect(x + 2, y + 2, this.tileSize - 6, this.tileSize - 6);
                }
            }
        }
    }

    updateUI() {
        const p1 = this.engine.state.players['P1'];
        const p2 = this.engine.state.players['P2'];
        const curr = this.engine.state.currentPlayerId;

        // Update Phaser Text
        if (this.uiText) this.uiText.setText(curr || '-');
        if (this.p1GoldText) this.p1GoldText.setText(p1.gold.toString());
        if (this.p2GoldText) this.p2GoldText.setText(p2.gold.toString());

        // Update Cost
        const cost = this.engine.pendingMoves.length * GameConfig.COST_CAPTURE;
        if (this.costText) this.costText.setText(`${cost} G`);

        // Update Feedback
        if (this.feedbackText) {
            if (this.engine.lastError) {
                this.feedbackText.setText(`⚠️ ${this.engine.lastError}`);
                this.feedbackText.setColor('#ff5555');
            } else {
                this.feedbackText.setText('Select cells to plan. Click "END TURN" to build.');
                this.feedbackText.setColor('#eeeeee');
            }
        }
    }
}
