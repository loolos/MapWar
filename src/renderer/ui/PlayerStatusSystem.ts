import Phaser from 'phaser';
import { GameEngine } from '../../core/GameEngine'; // For Move type if needed? Or just pass primitives

export class PlayerStatusSystem {
    private container: Phaser.GameObjects.Container;

    // UI Elements
    private uiText!: Phaser.GameObjects.Text; // Turn Counter
    private p1TitleText!: Phaser.GameObjects.Text;
    private p1GoldText!: Phaser.GameObjects.Text;
    private p1Coin!: Phaser.GameObjects.Image;
    private p1TypeIcon!: Phaser.GameObjects.Image;

    private p2TitleText!: Phaser.GameObjects.Text;
    private p2GoldText!: Phaser.GameObjects.Text;
    private p2Coin!: Phaser.GameObjects.Image;
    private p2TypeIcon!: Phaser.GameObjects.Image;

    private costText!: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene, x: number, y: number, height: number) {
        this.container = scene.add.container(x, y);

        // Sidebar Background
        const sidebarBg = scene.add.graphics();
        sidebarBg.fillStyle(0x222222);
        sidebarBg.fillRect(0, 0, 260, height);
        this.container.add(sidebarBg);

        // Header
        const header = scene.add.text(20, 20, 'GAME STATUS', {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#ffffff',
            fontStyle: 'bold'
        });
        this.container.add(header);

        // Turn Info (Now more prominent below header?)
        this.uiText = scene.add.text(20, 55, 'Turn 1', {
            fontFamily: 'Arial', fontSize: '18px', color: '#aaaaaa'
        });
        this.container.add(this.uiText);

        const startY = 90;

        // P1 Info
        this.p1TitleText = scene.add.text(20, startY, 'Player 1', {
            fontFamily: 'Arial', fontSize: '24px', color: '#ff4444', fontStyle: 'bold'
        });
        this.container.add(this.p1TitleText);

        this.p1Coin = scene.add.image(30, startY + 35, 'coin').setDisplaySize(24, 24);
        this.container.add(this.p1Coin);

        this.p1GoldText = scene.add.text(55, startY + 25, '0', {
            fontFamily: 'Arial', fontSize: '20px', color: '#ffd700'
        });
        this.container.add(this.p1GoldText);

        this.p1TypeIcon = scene.add.image(130, startY + 12, 'human').setDisplaySize(24, 24);
        this.container.add(this.p1TypeIcon);

        // P2 Info
        const p2Y = startY + 80;
        this.p2TitleText = scene.add.text(20, p2Y, 'Player 2', {
            fontFamily: 'Arial', fontSize: '24px', color: '#4444ff', fontStyle: 'bold'
        });
        this.container.add(this.p2TitleText);

        this.p2Coin = scene.add.image(30, p2Y + 35, 'coin').setDisplaySize(24, 24);
        this.container.add(this.p2Coin);

        this.p2GoldText = scene.add.text(55, p2Y + 25, '0', {
            fontFamily: 'Arial', fontSize: '20px', color: '#ffd700'
        });
        this.container.add(this.p2GoldText);

        this.p2TypeIcon = scene.add.image(130, p2Y + 12, 'human').setDisplaySize(24, 24);
        this.container.add(this.p2TypeIcon);

        // Cost Info
        const costY = p2Y + 100;
        const costHeader = scene.add.text(20, costY, 'Planned Cost:', {
            fontFamily: 'Arial', fontSize: '16px', color: '#aaaaaa'
        });
        this.container.add(costHeader);

        this.costText = scene.add.text(20, costY + 25, '0 G', {
            fontFamily: 'Arial', fontSize: '22px', color: '#ff8888', fontStyle: 'bold'
        });
        this.container.add(this.costText);
    }

    public update(engine: GameEngine) {
        const state = engine.state;
        const p1 = state.players['P1'];
        const p2 = state.players['P2'];
        const curr = state.currentPlayerId;

        // Update Turn
        this.uiText.setText(`Turn ${state.turnCount}`);

        // Update Gold
        this.p1GoldText.setText(p1.gold.toString());
        this.p2GoldText.setText(p2.gold.toString());

        // Visual Highlights
        const p1Alpha = curr === 'P1' ? 1 : 0.5;
        this.p1TitleText.setAlpha(p1Alpha);
        this.p1GoldText.setAlpha(p1Alpha);
        this.p1Coin.setAlpha(p1Alpha);
        this.p1TypeIcon.setTexture(p1.isAI ? 'robot' : 'human');
        this.p1TypeIcon.setAlpha(p1Alpha);

        const p2Alpha = curr === 'P2' ? 1 : 0.5;
        this.p2TitleText.setAlpha(p2Alpha);
        this.p2GoldText.setAlpha(p2Alpha);
        this.p2Coin.setAlpha(p2Alpha);
        this.p2TypeIcon.setTexture(p2.isAI ? 'robot' : 'human');
        this.p2TypeIcon.setAlpha(p2Alpha);

        // Update Cost
        let totalCost = 0;
        const currentPlayer = state.getCurrentPlayer();
        const currentGold = currentPlayer.gold;

        for (const m of engine.pendingMoves) {
            totalCost += engine.getMoveCost(m.r, m.c);
        }

        this.costText.setText(`${totalCost} G`);
        this.costText.setColor(totalCost > currentGold ? '#ff0000' : '#ff8888');
    }
}
