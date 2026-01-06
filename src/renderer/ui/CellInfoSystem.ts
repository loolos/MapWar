import Phaser from 'phaser';
import { GameConfig } from '../../core/GameConfig';
import { GameEngine } from '../../core/GameEngine';

export class CellInfoSystem {
    scene: Phaser.Scene;
    container: Phaser.GameObjects.Container;

    // UI Elements
    headerText: Phaser.GameObjects.Text;
    coordsText: Phaser.GameObjects.Text;
    typeText: Phaser.GameObjects.Text;
    ownerText: Phaser.GameObjects.Text;
    costText: Phaser.GameObjects.Text;
    descText: Phaser.GameObjects.Text;
    maskShape: Phaser.GameObjects.Graphics;

    constructor(scene: Phaser.Scene, x: number, y: number, width: number) {
        this.scene = scene;
        this.container = scene.add.container(x, y);

        // Background (Glassmorphism)
        const bg = scene.add.graphics();
        this.container.add(bg);

        // Initial Draw
        this.drawPanel(bg, width, 220);

        // Strict Mask
        const maskShape = scene.make.graphics({});
        this.container.setMask(maskShape.createGeometryMask());
        this.maskShape = maskShape;
        this.updateMask(width, 220, x, y);

        // Header
        this.headerText = scene.add.text(10, 10, 'CELL INFO', {
            fontSize: '18px',
            color: '#aaaaaa',
            fontStyle: 'bold'
        });
        this.container.add(this.headerText);

        // Initial Text Objects
        const style = { fontSize: '16px', color: '#ffffff' };
        const descStyle = { fontSize: '14px', color: '#dddddd', wordWrap: { width: width - 20 } };

        this.coordsText = scene.add.text(10, 40, 'Pos: --', style);
        this.container.add(this.coordsText);

        this.typeText = scene.add.text(10, 65, 'Type: --', style);
        this.container.add(this.typeText);

        this.ownerText = scene.add.text(10, 90, 'Owner: --', style);
        this.container.add(this.ownerText);

        this.costText = scene.add.text(10, 115, 'Cost: --', style);
        this.container.add(this.costText);

        this.descText = scene.add.text(10, 145, '', descStyle);
        this.container.add(this.descText);
    }

    update(engine: GameEngine, selectedRow: number | null, selectedCol: number | null) {
        if (selectedRow === null || selectedCol === null) {
            this.coordsText.setText('Pos: --');
            this.typeText.setText('Type: --');
            this.ownerText.setText('Owner: --');
            this.costText.setText('Cost: --');
            this.descText.setText('');
            return;
        }

        const cell = engine.state.getCell(selectedRow, selectedCol);
        if (!cell) return;

        // Coords
        this.coordsText.setText(`Pos: (${selectedRow}, ${selectedCol})`);

        // Type
        const typeStr = cell.type.charAt(0).toUpperCase() + cell.type.slice(1);
        this.typeText.setText(`Type: ${typeStr}`);

        // Owner
        const owner = cell.owner ? (cell.owner === 'P1' ? 'Player 1' : 'Player 2') : 'Neutral';
        let ownerDisplay = `Owner: ${owner}`;

        if (cell.owner && !cell.isConnected) {
            ownerDisplay += '\n(Disconnected: 50% Income)';
        }

        this.ownerText.setText(ownerDisplay);
        if (cell.owner === 'P1') this.ownerText.setColor('#ff4444');
        else if (cell.owner === 'P2') this.ownerText.setColor('#4444ff');
        else this.ownerText.setColor('#ffffff');

        // Cost
        const cost = engine.getMoveCost(selectedRow, selectedCol);
        let costStr = `${cost}G`;
        if (cost === Infinity) costStr = 'X';
        this.costText.setText(`Cost: ${costStr}`);

        // Description
        const desc = GameConfig.TERRAIN_DESCRIPTIONS[cell.type.toUpperCase() as keyof typeof GameConfig.TERRAIN_DESCRIPTIONS];
        this.descText.setText(desc || '');
    }

    public setPosition(x: number, y: number) {
        this.container.setPosition(x, y);
    }

    public resize(width: number, x: number, y: number) {
        const height = 220;
        // Redraw Background
        const bgIndex = 0;
        const bg = this.container.getAt(bgIndex) as Phaser.GameObjects.Graphics;
        if (bg) {
            bg.clear();
            this.drawPanel(bg, width, height);
        }

        // Update Wrap
        this.descText.setStyle({ wordWrap: { width: width - 20 } });

        // Update Mask
        this.updateMask(width, height, x, y);
    }

    private updateMask(w: number, h: number, x: number, y: number) {
        if (this.maskShape) {
            this.maskShape.clear();
            this.maskShape.fillStyle(0xffffff);
            this.maskShape.fillRect(x, y, w * this.container.scaleX, h * this.container.scaleY);
        }
    }

    private drawPanel(graphics: Phaser.GameObjects.Graphics, width: number, height: number) {
        const radius = 16;
        const color = 0x1a1a1a;
        const alpha = 0.85;
        const strokeColor = 0xffffff;
        const strokeAlpha = 0.1;

        graphics.fillStyle(color, alpha);
        graphics.fillRoundedRect(0, 0, width, height, radius);

        graphics.lineStyle(2, strokeColor, strokeAlpha);
        graphics.strokeRoundedRect(0, 0, width, height, radius);

        // Highlight
        graphics.lineStyle(1, 0xffffff, 0.15);
        graphics.beginPath();
        graphics.moveTo(radius, 0);
        graphics.lineTo(width - radius, 0);
        graphics.strokePath();
    }

    public setScale(scale: number) {
        this.container.setScale(scale);
    }
}
