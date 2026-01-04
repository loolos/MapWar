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
    }

    create() {
        this.cameras.main.setBackgroundColor('#2d2d2d');

        // Input
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.handleInput(pointer);
        });

        // Graphics Container
        this.gridGraphics = this.add.graphics();

        // Sidebar UI Container
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


        // Event Listeners (View -> Model binding)
        this.engine.on('mapUpdate', () => this.drawMap());
        this.engine.on('turnChange', () => {
            this.drawMap(); // Re-draw to show active player context if needed
            this.updateUI();
        });

        // Initial Draw
        this.drawMap();
        this.updateUI();

        // Bind DOM UI
        const btnEndTurn = document.getElementById('btn-end-turn');
        if (btnEndTurn) {
            btnEndTurn.onclick = () => this.engine.endTurn();
        }
    }

    // Class properties for UI Text
    p1GoldText!: Phaser.GameObjects.Text;
    p2GoldText!: Phaser.GameObjects.Text;

    handleInput(pointer: Phaser.Input.Pointer) {
        // Simple hit test - Only process clicks on the grid
        if (pointer.x >= GameConfig.GRID_SIZE * this.tileSize) return; // Ignore clicks on sidebar

        const col = Math.floor(pointer.x / this.tileSize);
        const row = Math.floor(pointer.y / this.tileSize);

        if (col >= 0 && col < GameConfig.GRID_SIZE && row >= 0 && row < GameConfig.GRID_SIZE) {
            console.log(`Clicked Cell: ${row}, ${col}`);
            this.engine.captureLand(row, col);
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
    }

    updateUI() {
        const p1 = this.engine.state.players['P1'];
        const p2 = this.engine.state.players['P2'];
        const curr = this.engine.state.currentPlayerId;

        // Update Phaser Text
        if (this.uiText) this.uiText.setText(curr || '-');
        if (this.p1GoldText) this.p1GoldText.setText(p1.gold.toString());
        if (this.p2GoldText) this.p2GoldText.setText(p2.gold.toString());
    }
}
