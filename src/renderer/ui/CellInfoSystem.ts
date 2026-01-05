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

    constructor(scene: Phaser.Scene, x: number, y: number, width: number) {
        this.scene = scene;
        this.container = scene.add.container(x, y);

        // Background
        const bg = scene.add.graphics();
        bg.fillStyle(GameConfig.COLORS.UI_BG, 1);
        bg.fillRect(0, 0, width, 220); // Increased height for description
        this.container.add(bg);

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
        this.ownerText.setText(`Owner: ${owner}`);
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
}
