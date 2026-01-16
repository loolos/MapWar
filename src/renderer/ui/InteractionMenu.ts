
import Phaser from 'phaser';
import { GameEngine } from '../../core/GameEngine';
import type { InteractionDefinition } from '../../core/interaction/InteractionTypes';

export class InteractionMenu extends Phaser.GameObjects.Container {
    private bg: Phaser.GameObjects.Graphics;
    private buttonGroup: Phaser.GameObjects.Container;
    private engine: GameEngine;
    private onActionSelect?: (payload: {
        action: InteractionDefinition;
        r: number;
        c: number;
        description: string;
        canAfford: boolean;
        cost: number;
        label: string;
    }) => void;

    // State
    private currentOptions: any[] = [];
    private pageOffset: number = 0;
    private currentR: number | null = null;
    private currentC: number | null = null;

    // Config
    private layoutWidth: number = 200;
    private maxHeight: number = 500;
    private isHorizontal: boolean = false;

    // Style
    private readonly btnHeight = 40;
    private readonly padding = 5;
    private readonly arrowHeight = 24;

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

    /* Public API */

    public show(r: number | null, c: number | null) {
        this.currentR = r;
        this.currentC = c;
        this.pageOffset = 0;

        // Get Options
        if (r !== null && c !== null && this.engine.isValidCell(r, c)) {
            this.currentOptions = this.engine.interactionRegistry.getAvailableActions(this.engine, r, c);
        } else {
            this.currentOptions = [];
        }

        // Always show (even if empty, to reserve space or show disabled state? 
        // User request: "Fixed non-overlapping". If we hide, space is empty.
        // Actually, if we hide, it's fine. 
        // But let's show to be consistent if it's "the menu area".
        this.setVisible(true);
        this.render();
    }

    public resize(width: number, maxHeight: number, isHorizontal: boolean) {
        this.layoutWidth = width;
        this.maxHeight = maxHeight;
        this.isHorizontal = isHorizontal;

        if (this.visible) {
            this.render();
        }
    }

    public setActionSelectHandler(handler: (payload: {
        action: InteractionDefinition;
        r: number;
        c: number;
        description: string;
        canAfford: boolean;
        cost: number;
        label: string;
    }) => void) {
        this.onActionSelect = handler;
    }

    public hide() {
        this.currentOptions = [];
        this.currentR = null;
        this.currentC = null;
        this.pageOffset = 0;
        this.buttonGroup.removeAll(true);
        this.bg.clear();
        this.setVisible(false);
    }

    /* Internals */

    private render() {
        this.buttonGroup.removeAll(true);
        this.bg.clear();

        const btnW = this.isHorizontal ? 140 : this.layoutWidth - 10;

        // 0. Check Empty
        if (this.currentOptions.length === 0) {
            this.renderDisabledState();
            return;
        }

        // 1. Calculate Page Size
        // Available Height
        // If horizontal, we scroll horizontally? 
        // User asked for "Up/Down arrows", implying Vertical list is primary concern.
        // Even in "Horizontal" mode (Portrait originally), if it doesn't fit, arrows?
        // Let's assume Vertical List for "Scroll" logic as it's the standard menu.
        // If isHorizontal (side-by-side buttons), paging is standard Left/Right?
        // Given User said "Up/Down", I will force Vertical Layout behavior for scroll if height is constrained.

        // Let's stick to Vertical List logic for simplicity and robustness on mobile.
        // Even in Portrait, a vertical list is easier to read than a horizontal strip usually.
        // IsHorizontal was for "Button Area" alignment.

        let availableH = this.maxHeight;
        let usePagination = false;
        let pageSize = this.currentOptions.length;

        // Calculate total needed height
        const totalNeeded = this.currentOptions.length * (this.btnHeight + this.padding) + this.padding;

        if (totalNeeded > availableH) {
            usePagination = true;
            // Reserve space for arrows
            const contentH = availableH - (this.arrowHeight * 2) - (this.padding * 2);
            pageSize = Math.floor(contentH / (this.btnHeight + this.padding));
            if (pageSize < 1) pageSize = 1; // Min 1 item
        }

        // Clamp Page Offset
        if (this.pageOffset < 0) this.pageOffset = 0;
        if (this.pageOffset > this.currentOptions.length - pageSize) {
            this.pageOffset = Math.max(0, this.currentOptions.length - pageSize);
        }

        // Slice
        const visibleItems = usePagination
            ? this.currentOptions.slice(this.pageOffset, this.pageOffset + pageSize)
            : this.currentOptions;

        // Render Background Panel
        // Actual height used
        const renderedH = usePagination
            ? (pageSize * (this.btnHeight + this.padding) + this.padding + (this.arrowHeight * 2))
            : totalNeeded;

        const finalW = this.layoutWidth; // Fixed width container

        this.bg.fillStyle(0x1a1a1a, 0.95);
        this.bg.lineStyle(1, 0x666666);
        this.bg.fillRoundedRect(0, 0, finalW, renderedH, 5);
        this.bg.strokeRoundedRect(0, 0, finalW, renderedH, 5);

        let currentY = this.padding;

        // Up Arrow
        if (usePagination) {
            this.renderArrow(finalW / 2, currentY + this.arrowHeight / 2, true, this.pageOffset > 0);
            currentY += this.arrowHeight;
        }

        // Items
        visibleItems.forEach((opt) => {
            this.renderButton(opt, this.padding, currentY, btnW, this.btnHeight);
            currentY += this.btnHeight + this.padding;
        });

        // Down Arrow
        if (usePagination) {
            const canGoDown = (this.pageOffset + pageSize) < this.currentOptions.length;
            this.renderArrow(finalW / 2, currentY + this.arrowHeight / 2, false, canGoDown);
        }
    }

    private renderButton(opt: any, x: number, y: number, w: number, h: number) {
        const btnContainer = this.scene.add.container(x, y);

        const def = this.engine.interactionRegistry.get(opt.id)!;
        const costVal = typeof def.cost === 'function' ? def.cost(this.engine, this.currentR!, this.currentC!) : def.cost;
        const labelVal = typeof def.label === 'function' ? def.label(this.engine, this.currentR!, this.currentC!) : def.label;
        const descVal = typeof def.description === 'function' ? def.description(this.engine, this.currentR!, this.currentC!) : def.description;
        const canAfford = this.engine.state.getCurrentPlayer().gold >= costVal;

        // Planning State
        const isPlanned = this.engine.pendingInteractions.some(i => i.r === this.currentR && i.c === this.currentC && i.actionId === opt.id);
        const isMove = opt.id === 'MOVE' && this.engine.pendingMoves.some(m => m.r === this.currentR && m.c === this.currentC);
        const isActive = isPlanned || isMove;

        // Graphics
        const btnBg = this.scene.add.graphics();
        const color = canAfford ? 0x222222 : 0x110000;
        const hoverColor = canAfford ? 0x444444 : 0x221111;

        if (isActive) btnBg.lineStyle(2, 0x00FF00);
        else if (!canAfford) btnBg.lineStyle(1, 0xFF0000);

        btnBg.fillStyle(color, 1);
        btnBg.fillRoundedRect(0, 0, w, h, 4);
        if (isActive || !canAfford) btnBg.strokeRoundedRect(0, 0, w, h, 4);

        // Text
        const fontSizeVal = Math.floor(Math.max(8, h * 0.32));
        const label = this.scene.add.text(10, (h - fontSizeVal) / 2, labelVal, {
            fontSize: `${fontSizeVal}px`,
            color: canAfford ? '#ffffff' : '#ff8888',
            fontStyle: 'bold'
        }).setOrigin(0, 0);

        const cost = this.scene.add.text(w - 10, (h - fontSizeVal) / 2, `${costVal}G`, {
            fontSize: `${fontSizeVal}px`,
            color: canAfford ? '#ffff00' : '#ff0000'
        }).setOrigin(1, 0);

        // Interaction
        const zone = this.scene.add.zone(w / 2, h / 2, w, h).setInteractive({ useHandCursor: true });

        zone.on('pointerdown', () => {
            if (this.onActionSelect) {
                this.onActionSelect({
                    action: def,
                    r: this.currentR!,
                    c: this.currentC!,
                    description: descVal,
                    canAfford,
                    cost: costVal,
                    label: labelVal
                });
            }
            if (canAfford) {
                this.engine.planInteraction(this.currentR!, this.currentC!, opt.id);
                this.render();
            }
        });

        // Hover
        zone.on('pointerover', () => {
            if (canAfford) {
                btnBg.clear();
                btnBg.fillStyle(hoverColor, 1);
                btnBg.lineStyle(isActive ? 2 : 0, 0x00FF00);
                btnBg.fillRoundedRect(0, 0, w, h, 4);
                if (isActive) btnBg.strokeRoundedRect(0, 0, w, h, 4);
            }
        });
        zone.on('pointerout', () => {
            btnBg.clear();
            btnBg.fillStyle(color, 1);
            if (isActive) btnBg.lineStyle(2, 0x00FF00);
            else if (!canAfford) btnBg.lineStyle(1, 0xFF0000);
            btnBg.fillRoundedRect(0, 0, w, h, 4);
            if (isActive || !canAfford) btnBg.strokeRoundedRect(0, 0, w, h, 4);
        });

        btnContainer.add([btnBg, label, cost, zone]);
        this.buttonGroup.add(btnContainer);
    }

    private renderArrow(x: number, y: number, isUp: boolean, enabled: boolean) {
        const arrow = this.scene.add.container(x, y);

        const g = this.scene.add.graphics();
        const color = enabled ? 0xffffff : 0x444444;

        g.fillStyle(color);
        g.beginPath();
        if (isUp) {
            g.moveTo(0, -6);
            g.lineTo(8, 6);
            g.lineTo(-8, 6);
        } else {
            g.moveTo(0, 6);
            g.lineTo(8, -6);
            g.lineTo(-8, -6);
        }
        g.closePath();
        g.fillPath();

        // Hit Area
        if (enabled) {
            const zone = this.scene.add.zone(0, 0, 40, 20).setInteractive({ useHandCursor: true });
            zone.on('pointerdown', () => {
                this.pageOffset += isUp ? -1 : 1;
                this.render();
            });
            arrow.add(zone);
        }

        arrow.add(g);
        this.buttonGroup.add(arrow);
    }

    private renderDisabledState() {
        // Just empty box or small indicator
        const h = 50;
        this.bg.fillStyle(0x0a0a0a, 0.5);
        this.bg.fillRoundedRect(0, 0, this.layoutWidth, h, 5);
        this.bg.lineStyle(1, 0x333333);
        this.bg.strokeRoundedRect(0, 0, this.layoutWidth, h, 5);

        const txt = this.scene.add.text(this.layoutWidth / 2, h / 2, '(No Options)', {
            fontSize: '12px', color: '#666'
        }).setOrigin(0.5);
        this.buttonGroup.add(txt);
    }
}
