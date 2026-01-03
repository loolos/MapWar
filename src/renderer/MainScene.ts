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

    create() {
        this.cameras.main.setBackgroundColor('#2d2d2d');

        // Input
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.handleInput(pointer);
        });

        // Graphics Container
        this.gridGraphics = this.add.graphics();
        this.uiText = this.add.text(10, 10, '', { font: '16px Courier', color: '#ffffff' });

        // Event Listeners (View -> Model binding)
        this.engine.on('mapUpdate', () => this.drawMap());
        this.engine.on('turnChange', () => {
            this.drawMap(); // Re-draw to show active player context if needed
            this.updateUI();
        });

        // Initial Draw
        this.drawMap();
        this.updateUI();

        // End Turn Button (Simple Text for now)
        this.add.text(GameConfig.GRID_SIZE * this.tileSize + 20, 50, 'END TURN', {
            fontSize: '24px',
            backgroundColor: '#444',
            padding: { x: 10, y: 5 }
        })
            .setInteractive()
            .on('pointerdown', () => this.engine.endTurn());
    }

    handleInput(pointer: Phaser.Input.Pointer) {
        // Simple hit test
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

        this.uiText.setText(
            `Turn: ${curr}\n` +
            `P1 Gold: ${p1.gold}\n` +
            `P2 Gold: ${p2.gold}\n` +
            `Cost to Capture: ${GameConfig.COST_CAPTURE}`
        );
    }
}
