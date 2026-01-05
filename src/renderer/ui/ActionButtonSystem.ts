import Phaser from 'phaser';

export class ActionButtonSystem {
    private scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container;
    private buttons: Phaser.GameObjects.Image[] = [];
    private texts: Phaser.GameObjects.Text[] = [];

    // Grid config
    private rows = 2;
    private cols = 4;
    private buttonWidth = 140;
    private buttonHeight = 50;
    private gapX = 10;
    private gapY = 10;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        this.scene = scene;
        this.container = scene.add.container(x, y);
    }

    /**
     * Adds a button to the specified slot (row 0-1, col 0-3).
     * @param r Row index (0 or 1)
     * @param c Column index (0 to 3)
     * @param label Button text label
     * @param callback Function to call on click
     * @param texture Texture key for the button background
     */
    public addButton(r: number, c: number, label: string, callback: () => void, texture: string = 'ui_button') {
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) {
            console.warn(`Button slot [${r}, ${c}] is out of bounds.`);
            return;
        }

        const xPos = c * (this.buttonWidth + this.gapX);
        const yPos = r * (this.buttonHeight + this.gapY);

        // Button Background
        const btn = this.scene.add.image(xPos, yPos, texture)
            .setOrigin(0, 0)
            .setDisplaySize(this.buttonWidth, this.buttonHeight)
            .setInteractive({ useHandCursor: true });

        // Button Interactions
        btn.on('pointerover', () => btn.setTint(0xdddddd));
        btn.on('pointerout', () => btn.clearTint());
        btn.on('pointerdown', () => {
            btn.setTint(0x888888);
            callback();
        });
        btn.on('pointerup', () => btn.setTint(0xdddddd)); // Or clear tint

        this.container.add(btn);
        this.buttons.push(btn); // Keep track if we need to clear them later

        // Button Label
        const text = this.scene.add.text(xPos + this.buttonWidth / 2, yPos + this.buttonHeight / 2, label, {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.container.add(text);
        this.texts.push(text);
    }

    public clearButtons() {
        this.buttons.forEach(b => b.destroy());
        this.texts.forEach(t => t.destroy());
        this.buttons = [];
        this.texts = [];
        this.container.removeAll(true);
    }

    public setPosition(x: number, y: number) {
        this.container.setPosition(x, y);
    }

    public setScale(scale: number) {
        this.container.setScale(scale);
    }
}
