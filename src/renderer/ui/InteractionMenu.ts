
import Phaser from 'phaser';
import { GameEngine } from '../../core/GameEngine';

export class InteractionMenu extends Phaser.GameObjects.Container {
    private bg: Phaser.GameObjects.Graphics;
    private buttonGroup: Phaser.GameObjects.Container;

    private engine: GameEngine;

    constructor(scene: Phaser.Scene, engine: GameEngine) {
        super(scene, 0, 0);
        this.engine = engine;

        this.bg = scene.add.graphics();
        this.add(this.bg);

        this.buttonGroup = scene.add.container(0, 0);
        this.add(this.buttonGroup);

        this.setVisible(false);
        scene.add.existing(this);
    }

    private layoutWidth: number = 200;
    private isHorizontal: boolean = false;

    show(r: number | null, c: number | null) {
        // Clear previous buttons
        this.buttonGroup.removeAll(true);
        this.bg.clear();

        // Always Show (Persistent)
        this.setVisible(true);

        const btnHeight = 40;
        const btnWidth = this.isHorizontal ? 140 : this.layoutWidth - 10;
        const padding = 5;

        // 1. Check if Valid Context
        let options: any[] = [];
        if (r !== null && c !== null && this.engine.isValidCell(r, c)) {
            options = this.engine.interactionRegistry.getAvailableActions(this.engine, r, c);
        }

        // 2. Render Options OR Disabled State
        if (options.length === 0) {
            this.renderDisabledState(btnWidth, btnHeight, padding);
            return;
        }

        let x = padding;
        let y = padding;
        let totalW = 0;
        let totalH = 0;

        options.forEach((opt) => {
            const btnContainer = this.scene.add.container(x, y);

            // Interaction Definition
            const def = this.engine.interactionRegistry.get(opt.id)!;

            // Resolve Dynamic Properties
            const costVal = typeof def.cost === 'function' ? def.cost(this.engine, r!, c!) : def.cost;
            const labelVal = typeof def.label === 'function' ? def.label(this.engine, r!, c!) : def.label;

            const canAfford = this.engine.state.getCurrentPlayer().gold >= costVal;

            // Background
            const btnBg = this.scene.add.graphics();
            const color = canAfford ? 0x222222 : 0x110000;
            const hoverColor = canAfford ? 0x444444 : 0x110000;

            // Highlight if Selected/Planned?
            const isPlanned = this.engine.pendingInteractions.some(i => i.r === r && i.c === c && i.actionId === opt.id);
            // Move is special: check pendingMoves
            const isMove = opt.id === 'MOVE' && this.engine.pendingMoves.some(m => m.r === r && m.c === c);
            const isActive = isPlanned || isMove;

            if (isActive) {
                // Active State style (Green border? or brighter bg?)
                btnBg.lineStyle(2, 0x00FF00);
            }

            btnBg.fillStyle(color, 1);
            btnBg.fillRoundedRect(0, 0, btnWidth, btnHeight, 4);

            if (isActive) {
                btnBg.strokeRoundedRect(0, 0, btnWidth, btnHeight, 4);
            }

            // Text
            const label = this.scene.add.text(10, 10, labelVal, {
                fontSize: '14px',
                color: canAfford ? '#ffffff' : '#888888',
                fontStyle: 'bold'
            });

            const cost = this.scene.add.text(btnWidth - 10, 10, `${costVal}G`, {
                fontSize: '14px',
                color: canAfford ? '#ffff00' : '#ff0000'
            }).setOrigin(1, 0);

            // Click Area
            const zone = this.scene.add.zone(btnWidth / 2, btnHeight / 2, btnWidth, btnHeight)
                .setInteractive({ useHandCursor: canAfford });

            zone.on('pointerover', () => {
                btnBg.clear();
                btnBg.fillStyle(hoverColor, 1);
                btnBg.fillRoundedRect(0, 0, btnWidth, btnHeight, 4);
            });

            zone.on('pointerout', () => {
                btnBg.clear();
                btnBg.fillStyle(color, 1);
                btnBg.fillRoundedRect(0, 0, btnWidth, btnHeight, 4);
            });

            zone.on('pointerdown', () => {
                if (canAfford && r !== null && c !== null) {
                    this.engine.planInteraction(r, c, opt.id);
                }
            });

            btnContainer.add([btnBg, label, cost, zone]);
            this.buttonGroup.add(btnContainer);

            // Flow Logic
            if (this.isHorizontal) {
                x += btnWidth + padding;
                totalW = x;
                totalH = Math.max(totalH, btnHeight + padding * 2);
            } else {
                y += btnHeight + padding;
                totalH = y;
                totalW = Math.max(totalW, btnWidth + padding * 2);
            }
        });

        // Draw Panel Background
        // this.bg.fillStyle(0x000000, 0.9);
        // this.bg.lineStyle(2, 0x444444);
        // this.bg.fillRoundedRect(0, 0, Math.max(totalW, this.layoutWidth), totalH, 5);
        // this.bg.strokeRoundedRect(0, 0, Math.max(totalW, this.layoutWidth), totalH, 5);
        // User wants it integrated. Let's make it transparent or subtle?
        // Let's keep the bg for visibility but fit it.
        const finalW = this.isHorizontal ? totalW : this.layoutWidth;
        const finalH = this.isHorizontal ? btnHeight + padding * 2 : totalH;

        this.bg.fillStyle(0x1a1a1a, 0.95); // Slightly lighter than pure black
        this.bg.lineStyle(1, 0x666666);
        this.bg.fillRoundedRect(0, 0, finalW, finalH, 5);
        this.bg.strokeRoundedRect(0, 0, finalW, finalH, 5);
    }

    resize(width: number, isHorizontal: boolean) {
        this.layoutWidth = width;
        this.isHorizontal = isHorizontal;
        // If visible, Re-render immediate?
        // We lack r, c here to re-render. 
        // We will wait for next show() call, or MainScene calls show() on resize if selected?
        // Actually MainScene.resize doesn't call show.
        // It should hide() on resize usually?
        // Let's update `hide()` to just setVisible(false).
    }

    renderDisabledState(btnWidth: number, btnHeight: number, padding: number) {
        // Render 2 empty slots to signify "this is the action menu"
        let x = padding;
        let y = padding;

        const count = 2; // Show 2 empty slots
        let totalW = 0;
        let totalH = 0;

        for (let i = 0; i < count; i++) {
            const gfx = this.scene.add.graphics();
            gfx.fillStyle(0x111111, 0.5); // Very dark gray
            gfx.fillRoundedRect(x, y, btnWidth, btnHeight, 4);
            // gfx.lineStyle(1, 0x333333); // Subtle outline
            // gfx.strokeRoundedRect(x, y, btnWidth, btnHeight, 4);

            this.buttonGroup.add(gfx);

            if (this.isHorizontal) {
                x += btnWidth + padding;
                totalW = x;
                totalH = Math.max(totalH, btnHeight + padding * 2);
            } else {
                y += btnHeight + padding;
                totalH = y;
                totalW = Math.max(totalW, btnWidth + padding * 2);
            }
        }

        // Draw Panel Background
        const finalW = this.isHorizontal ? totalW : this.layoutWidth;
        const finalH = this.isHorizontal ? btnHeight + padding * 2 : totalH;

        this.bg.fillStyle(0x0a0a0a, 0.8);
        this.bg.lineStyle(1, 0x333333);
        this.bg.fillRoundedRect(0, 0, finalW, finalH, 5);
        this.bg.strokeRoundedRect(0, 0, finalW, finalH, 5);
    }

    hide() {
        // Persistent: Do NOT hide. 
        // Just render disabled state? Or keep last state?
        // MainScene calls show(null, null) on deselect.
        // So hide is effectively unused or should alias show(null).
        this.show(null, null);
    }
}
