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

        // Store Grid Pos for Resize
        btn.setData('gridPos', { r, c });

        // Button Interactions
        btn.on('pointerover', () => btn.setTint(0xdddddd));
        btn.on('pointerout', () => btn.clearTint());
        btn.on('pointerdown', () => {
            btn.setTint(0x888888);
            callback();
        });
        btn.on('pointerup', () => btn.setTint(0xdddddd));

        this.container.add(btn);
        this.buttons.push(btn);

        // Button Label
        // Initial Font Size
        const fontSize = Math.floor(Math.min(this.buttonWidth * 0.25, this.buttonHeight * 0.5));

        const text = this.scene.add.text(xPos + this.buttonWidth / 2, yPos + this.buttonHeight / 2, label, {
            fontFamily: 'Arial',
            fontSize: `${fontSize}px`,
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        text.setData('gridPos', { r, c });

        this.container.add(text);
        this.texts.push(text);
    }

    public setGrid(rows: number, cols: number) {
        this.rows = rows;
        this.cols = cols;
    }

    public resize(width: number, height: number) {
        // Recalculate Button Dims
        const totalGapX = (this.cols - 1) * this.gapX;
        this.buttonWidth = Math.floor((width - totalGapX) / this.cols);

        const totalGapY = (this.rows - 1) * this.gapY;
        this.buttonHeight = Math.floor((height - totalGapY) / this.rows);

        // Update Buttons
        this.buttons.forEach(btn => {
            const pos = btn.getData('gridPos');
            if (pos) {
                const x = pos.c * (this.buttonWidth + this.gapX);
                const y = pos.r * (this.buttonHeight + this.gapY);
                btn.setPosition(x, y);
                btn.setDisplaySize(this.buttonWidth, this.buttonHeight);
            }
        });

        // Update Texts (Dynamic Fit)
        this.texts.forEach(txt => {
            const pos = txt.getData('gridPos');
            if (pos) {
                const x = pos.c * (this.buttonWidth + this.gapX) + this.buttonWidth / 2;
                const y = pos.r * (this.buttonHeight + this.gapY) + this.buttonHeight / 2;
                txt.setPosition(x, y);

                // Font Sizing Logic: Ensure it fits in box
                // Approx char width ~0.6 * fontSize
                const textLen = txt.text.length;
                const maxW = this.buttonWidth - 16; // Margin
                const maxH = this.buttonHeight - 10;

                // 1. By Height
                let fSize = Math.floor(maxH * 0.5);

                // 2. By Width
                // width = len * fSize * 0.6 => fSize = width / (len * 0.6)
                if (textLen > 0) {
                    const widthLimitSize = Math.floor(maxW / (textLen * 0.6));
                    fSize = Math.min(fSize, widthLimitSize);
                }

                // Clamp
                fSize = Math.max(9, Math.min(fSize, 14)); // Cap at 14px

                txt.setStyle({ fontSize: `${fSize}px` });
            }
        });
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
