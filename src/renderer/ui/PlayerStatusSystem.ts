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
    private maskShape!: Phaser.GameObjects.Graphics;

    public readonly BASE_WIDTH = 260;

    constructor(scene: Phaser.Scene, x: number, y: number, height: number) {
        this.container = scene.add.container(x, y);

        // Sidebar Background (Glassmorphism Container)
        const sidebarBg = scene.add.graphics();
        this.container.add(sidebarBg);
        this.drawPanel(sidebarBg, 260, height);

        // Header
        const header = scene.add.text(130, 25, 'GAME STATUS', {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: '22px',
            color: '#ffffff',
            fontStyle: 'bold',
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 2, fill: true }
        }).setOrigin(0.5);
        this.container.add(header);

        // Turn Info
        this.uiText = scene.add.text(130, 50, 'Turn 1', {
            fontFamily: 'Georgia, serif', fontSize: '16px', color: '#dddddd'
        }).setOrigin(0.5);
        this.container.add(this.uiText);

        const startY = 80;

        // P1 Card
        const p1Card = scene.add.graphics();
        this.drawCardPanel(p1Card, 240, 90, 0xff4444); // Red Accent
        p1Card.setPosition(10, startY);
        this.container.add(p1Card);

        this.p1TitleText = scene.add.text(20, startY + 10, 'PLAYER 1', {
            fontFamily: 'Georgia, serif', fontSize: '18px', color: '#ff4444', fontStyle: 'bold',
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 2, fill: true }
        });
        this.container.add(this.p1TitleText);

        this.p1TypeIcon = scene.add.image(200, startY + 25, 'icon_human_badge').setDisplaySize(42, 42); // Larger & Transparent
        this.container.add(this.p1TypeIcon);

        // Add small label under icon if needed, or just let the icon speak. 
        // User asked for "more obvious". Large icon + "HUMAN" text?
        // Let's stick to Large Icon for now as requested.

        this.p1Coin = scene.add.image(35, startY + 55, 'icon_gold_3d').setDisplaySize(28, 28);
        this.container.add(this.p1Coin);

        this.p1GoldText = scene.add.text(60, startY + 45, '0', {
            fontFamily: 'Arial', fontSize: '22px', color: '#ffd700', fontStyle: 'bold',
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 2, fill: true }
        });
        this.container.add(this.p1GoldText);


        // P2 Card
        const p2Y = startY + 100;
        const p2Card = scene.add.graphics();
        this.drawCardPanel(p2Card, 240, 90, 0x4444ff); // Blue Accent
        p2Card.setPosition(10, p2Y);
        this.container.add(p2Card);

        this.p2TitleText = scene.add.text(20, p2Y + 10, 'PLAYER 2', {
            fontFamily: 'Georgia, serif', fontSize: '18px', color: '#4444ff', fontStyle: 'bold',
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 2, fill: true }
        });
        this.container.add(this.p2TitleText);

        this.p2TypeIcon = scene.add.image(200, p2Y + 25, 'icon_human_badge').setDisplaySize(42, 42);
        this.container.add(this.p2TypeIcon);

        this.p2Coin = scene.add.image(35, p2Y + 55, 'icon_gold_3d').setDisplaySize(28, 28);
        this.container.add(this.p2Coin);

        this.p2GoldText = scene.add.text(60, p2Y + 45, '0', {
            fontFamily: 'Arial', fontSize: '22px', color: '#ffd700', fontStyle: 'bold',
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 2, fill: true }
        });
        this.container.add(this.p2GoldText);

        // Cost Card
        const costY = p2Y + 110;
        const costCard = scene.add.graphics();
        this.drawCardPanel(costCard, 240, 60);
        costCard.setPosition(10, costY);
        this.container.add(costCard);

        const costHeader = scene.add.text(20, costY + 8, 'PLANNED COST', {
            fontFamily: 'Georgia, serif', fontSize: '12px', color: '#aaaaaa'
        });
        this.container.add(costHeader);

        this.costText = scene.add.text(20, costY + 25, '0 G', {
            fontFamily: 'Georgia, serif', fontSize: '24px', color: '#ff8888', fontStyle: 'bold',
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 2, fill: true }
        });
        this.container.add(this.costText);
    }

    public update(engine: GameEngine) {
        const state = engine.state;
        const p1 = state.players['P1'];
        const p2 = state.players['P2'];
        const curr = state.currentPlayerId;

        // Update Turn
        this.uiText.setText(`TURN ${state.turnCount}`);

        // Update Gold
        this.p1GoldText.setText(p1.gold.toString());
        this.p2GoldText.setText(p2.gold.toString());

        // Visual Highlights (Alpha for inactive)
        const p1Alpha = curr === 'P1' ? 1 : 0.4;
        this.p1TitleText.setAlpha(p1Alpha);
        this.p1GoldText.setAlpha(p1Alpha);
        this.p1TypeIcon.setTexture(p1.isAI ? 'icon_robot_badge' : 'icon_human_badge');
        this.p1TypeIcon.setAlpha(p1Alpha);

        const p2Alpha = curr === 'P2' ? 1 : 0.4;
        this.p2TitleText.setAlpha(p2Alpha);
        this.p2GoldText.setAlpha(p2Alpha);
        this.p2TypeIcon.setTexture(p2.isAI ? 'icon_robot_badge' : 'icon_human_badge');
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

    public setPosition(x: number, y: number) {
        this.container.setPosition(x, y);
    }

    public resize(width: number, height: number, x: number, y: number) {
        // Update Background
        const bgIndex = 0;
        const bg = this.container.getAt(bgIndex) as Phaser.GameObjects.Graphics;
        if (bg) {
            bg.clear();
            this.drawPanel(bg, width, height);
        }

        // Update Mask
        this.updateMask(width, height, x, y);
    }

    private updateMask(w: number, h: number, x: number, y: number) {
        if (this.maskShape) {
            this.maskShape.clear();
            this.maskShape.fillStyle(0xffffff);
            // Mask needs absolute world coordinates if not child of container? 
            // GeometryMask uses world coordinates usually.
            // If we use setMask on container, the mask shape should be in world coords.
            // Container x/y + internal 0,0
            this.maskShape.fillRect(x, y, w * this.container.scaleX, h * this.container.scaleY);
        }
    }

    public setScale(scale: number) {
        this.container.setScale(scale);
    }
    private drawPanel(graphics: Phaser.GameObjects.Graphics, width: number, height: number) {
        // Glassmorphism Style
        const radius = 16;
        const color = 0x1a1a1a;
        const alpha = 0.85;
        const strokeColor = 0xffffff;
        const strokeAlpha = 0.1;

        graphics.fillStyle(color, alpha);
        graphics.fillRoundedRect(0, 0, width, height, radius);

        graphics.lineStyle(2, strokeColor, strokeAlpha);
        graphics.strokeRoundedRect(0, 0, width, height, radius);

        // Inner Highlight (top border)
        graphics.lineStyle(1, 0xffffff, 0.15);
        graphics.beginPath();
        graphics.moveTo(radius, 0);
        graphics.lineTo(width - radius, 0);
        graphics.strokePath();
    }

    private drawCardPanel(graphics: Phaser.GameObjects.Graphics, width: number, height: number, accentColor?: number) {
        // Tactical Card: Dark embossed metal look
        // Background
        graphics.fillStyle(0x2a2a2a, 1);
        graphics.fillRoundedRect(0, 0, width, height, 8);

        // Accent Bar
        if (accentColor !== undefined) {
            graphics.fillStyle(accentColor, 1);
            graphics.fillRect(0, 8, 4, height - 16);
        }

        // Emboss Border
        graphics.lineStyle(2, 0x000000, 0.5); // Shadow bottom-right
        graphics.strokeRoundedRect(0, 0, width, height, 8);

        // Top-Left Light
        graphics.lineStyle(1, 0x555555, 0.5);
        graphics.beginPath();
        graphics.moveTo(0, height - 8);
        graphics.lineTo(0, 8);
        graphics.arc(8, 8, 8, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(270));
        graphics.lineTo(width - 8, 0);
        graphics.strokePath();
    }
}
