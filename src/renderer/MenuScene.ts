
import Phaser from 'phaser';
import { GameConfig } from '../core/GameConfig';
import { SaveRegistry } from '../core/saves/SaveRegistry';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    create() {
        // Background
        this.add.graphics().fillStyle(0x222222).fillRect(0, 0, this.scale.width, this.scale.height);

        const w = this.scale.width;
        const h = this.scale.height;

        // Title
        this.add.text(w / 2, h / 3, 'MAP WAR', {
            fontSize: '64px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Map Size Label
        this.add.text(w / 2, h / 2 - 60, 'Enter Map Size (Width x Height):', {
            fontSize: '24px',
            color: '#cccccc'
        }).setOrigin(0.5);

        // Input Elements (HTML)
        const input = `
            <div style="display: flex; gap: 10px; align-items: center;">
                <input type="number" id="mapWidthInput" placeholder="W" min="10" max="40" value="10" 
                    style="font-size: 24px; padding: 10px; width: 80px; text-align: center; color: black;" />
                <span style="font-size: 24px; color: white;">x</span>
                <input type="number" id="mapHeightInput" placeholder="H" min="10" max="40" value="10" 
                    style="font-size: 24px; padding: 10px; width: 80px; text-align: center; color: black;" />
            </div>
        `;
        const domElement = this.add.dom(w / 2, h / 2).createFromHTML(input);

        // Start Button
        const startBtn = this.add.text(w / 2, h / 2 + 100, 'START GAME', {
            fontSize: '32px',
            color: '#ffffff',
            backgroundColor: '#4444ff',
            padding: { x: 30, y: 15 }
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
                const widthInput = domElement.getChildByID('mapWidthInput') as HTMLInputElement;
                const heightInput = domElement.getChildByID('mapHeightInput') as HTMLInputElement;

                if (widthInput && heightInput) {
                    let width = parseInt(widthInput.value);
                    let height = parseInt(heightInput.value);

                    if (isNaN(width)) width = 10;
                    if (isNaN(height)) height = 10;

                    // Clamp
                    width = Phaser.Math.Clamp(width, 10, 40);
                    height = Phaser.Math.Clamp(height, 10, 40);

                    // Update Config
                    (GameConfig as any).GRID_WIDTH = width;
                    (GameConfig as any).GRID_HEIGHT = height;

                    this.scene.start('MainScene');
                }
            })
            .on('pointerover', () => startBtn.setStyle({ backgroundColor: '#6666ff' }))
            .on('pointerout', () => startBtn.setStyle({ backgroundColor: '#4444ff' }));

        // Load Test Saves (Dynamic List)
        const saves = Object.keys(SaveRegistry);
        let yPos = h / 2 + 180;

        saves.forEach(key => {
            const save = SaveRegistry[key];
            const btn = this.add.text(w / 2, yPos, `LOAD: ${save.name}`, {
                fontSize: '24px',
                color: '#ffffff',
                backgroundColor: '#884444',
                padding: { x: 20, y: 10 }
            })
                .setOrigin(0.5)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => {
                    this.scene.start('MainScene', { loadPreset: key });
                })
                .on('pointerover', () => btn.setStyle({ backgroundColor: '#aa6666' }))
                .on('pointerout', () => btn.setStyle({ backgroundColor: '#884444' }));

            yPos += 60;
        });

        // Handle Enter Key
        this.input.keyboard?.on('keydown-ENTER', () => {
            // Trigger same logic if needed, but button is fine for now
        });
    }
}
