import Phaser from 'phaser';
import type { GameEngine } from '../../core/GameEngine'; // For Move type if needed? Or just pass primitives

export class PlayerStatusSystem {
    private container!: Phaser.GameObjects.Container;
    private uiText!: Phaser.GameObjects.Text;
    private maskShape!: Phaser.GameObjects.Graphics;
    private playerRows: Phaser.GameObjects.Container[] = [];

    // Scroll components
    private listContainer!: Phaser.GameObjects.Container;
    private listMask!: Phaser.Display.Masks.GeometryMask;
    private scrollY = 0;
    private contentHeight = 0;
    private viewHeight = 0;

    public readonly BASE_WIDTH = 260;

    // Scroll Buttons
    private upButton!: Phaser.GameObjects.Container;
    private downButton!: Phaser.GameObjects.Container;
    private isScrollable: boolean = false;
    private isDragging: boolean = false;
    private lastY: number = 0;

    constructor(scene: Phaser.Scene, x: number, y: number, height: number) {
        this.container = scene.add.container(x, y);

        // Sidebar Background (Interactive for scrolling)
        const sidebarBg = scene.add.graphics();
        this.container.add(sidebarBg);
        this.drawPanel(sidebarBg, 260, height);

        // Header
        const header = scene.add.text(130, 20, 'GAME STATUS', {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: '14px',
            color: '#ffffff',
            fontStyle: 'bold',
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 2, fill: true }
        }).setOrigin(0.5);
        this.container.add(header);

        // Turn Info
        this.uiText = scene.add.text(130, 35, 'Turn 1', {
            fontFamily: 'Georgia, serif', fontSize: '12px', color: '#dddddd'
        }).setOrigin(0.5);
        this.container.add(this.uiText);

        // Scroll Buttons
        this.upButton = this.createScrollButton(scene, 'up');
        this.downButton = this.createScrollButton(scene, 'down');
        this.container.add(this.upButton);
        this.container.add(this.downButton);
        this.upButton.setVisible(false);
        this.downButton.setVisible(false);

        // Scrollable List Container
        this.listContainer = scene.add.container(0, 50);
        this.container.add(this.listContainer);

        // Setup Mask
        this.maskShape = scene.make.graphics({});
        this.listMask = new Phaser.Display.Masks.GeometryMask(scene, this.maskShape);
        this.listContainer.setMask(this.listMask);

        this.viewHeight = height - 60;

        // Enhance Interaction for Scroll (Main Panel)
        // Use a Zone for precise input handling over the list area
        const zone = scene.add.zone(0, 50, 260, this.viewHeight).setOrigin(0);
        this.container.add(zone);
        zone.setInteractive();

        zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.isDragging = true;
            this.lastY = pointer.y;
        });

        scene.input.on('pointerup', () => {
            this.isDragging = false;
        });

        scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (this.isDragging) {
                const dy = pointer.y - this.lastY;
                this.lastY = pointer.y;
                this.scroll(dy);
            }
        });

        // Wheel support on Zone
        zone.on('wheel', (_u: any, _dx: number, deltaY: number) => {
            this.scroll(-deltaY * 0.5);
        });

        // Initialize Mask
        this.updateMask(260, height, x, y);
    }

    private createScrollButton(scene: Phaser.Scene, dir: 'up' | 'down'): Phaser.GameObjects.Container {
        const btn = scene.add.container(0, 0);
        const bg = scene.add.graphics();
        bg.fillStyle(0x444444, 0.8);
        bg.fillRoundedRect(0, 0, 24, 24, 4);
        bg.lineStyle(1, 0x888888, 0.5);
        bg.strokeRoundedRect(0, 0, 24, 24, 4);
        btn.add(bg);

        const text = scene.add.text(12, 12, dir === 'up' ? '▲' : '▼', {
            fontSize: '14px', color: '#ffffff'
        }).setOrigin(0.5);
        btn.add(text);

        btn.setSize(24, 24);
        btn.setInteractive({ useHandCursor: true });

        btn.on('pointerdown', () => {
            const step = dir === 'up' ? 40 : -40;
            this.scroll(step); // Snap
        });

        // Continuous scroll on hold could be added here similar to pan
        return btn;
    }

    private scroll(dy: number) {
        if (this.contentHeight <= this.viewHeight) return;

        this.scrollY += dy;
        const minScroll = this.viewHeight - this.contentHeight;

        // Clamping
        if (this.scrollY > 0) this.scrollY = 0;
        if (this.scrollY < minScroll) this.scrollY = minScroll;

        this.listContainer.y = 50 + this.scrollY;
    }

    public update(engine: GameEngine) {
        const state = engine.state;
        this.uiText.setText(`TURN ${state.turnCount}`);

        const currentIds = state.playerOrder;
        const needsRebuild = this.playerRows.length !== currentIds.length ||
            this.playerRows.some((row, i) => (row as any).playerId !== currentIds[i]);

        if (needsRebuild) {
            this.rebuildList(engine.state.playerOrder, engine.state.players);
        }

        // Update values and Highlighting
        this.playerRows.forEach((row) => {
            const pid = (row as any).playerId;
            const player = state.players[pid];
            const goldTxt = row.getAt(4) as Phaser.GameObjects.Text;
            goldTxt.setText(player.gold.toString());

            const incomeTxt = row.getAt(5) as Phaser.GameObjects.Text;
            const income = engine.state.calculateIncome(pid);
            incomeTxt.setText(`+${income}/t`);

            const currentId = state.currentPlayerId || '';
            const pAlpha = currentId === pid ? 1 : 0.4;
            row.setAlpha(pAlpha);
        });
    }

    private rebuildList(order: string[], players: any) {
        this.listContainer.removeAll(true);
        this.playerRows = [];

        let currentY = 0;
        const gap = 3;

        // Calculate dynamic row height based on viewHeight and count
        // Try to fit all if possible, within reason.
        const availableH = Math.max(100, this.viewHeight);
        // Ideal height ~36px. Min ~24px.
        const idealH = 36;
        const neededH = order.length * (idealH + gap);

        let rowH = idealH;
        if (neededH > availableH && order.length > 5) {
            // Compress slightly
            rowH = Math.max(28, availableH / order.length - gap);
        }

        order.forEach(pid => {
            const player = players[pid];
            const row = this.createPlayerRow(player, currentY, rowH);
            (row as any).playerId = pid;
            this.listContainer.add(row);
            this.playerRows.push(row);

            currentY += rowH + gap;
        });

        this.contentHeight = currentY;

        // Reset scroll if fits
        if (this.contentHeight <= this.viewHeight) {
            this.scrollY = 0;
            this.listContainer.y = 50;
            this.isScrollable = false;
            this.upButton.setVisible(false);
            this.downButton.setVisible(false);
        } else {
            // Constrain existing scroll
            const minScroll = this.viewHeight - this.contentHeight;
            this.scrollY = Phaser.Math.Clamp(this.scrollY, minScroll, 0);
            this.listContainer.y = 50 + this.scrollY;

            this.isScrollable = true;
            this.upButton.setVisible(true);
            this.downButton.setVisible(true);

            // Verify Button Positions
            this.updateButtonPositions();
        }
    }

    private updateButtonPositions() {
        // Strictly align to Left Border (x=0) and Top/Bottom of View area
        const topY = 50;
        const bottomY = 50 + this.viewHeight - 24; // Button height is 24

        this.upButton.setPosition(0, topY);
        this.downButton.setPosition(0, bottomY);

        // Ensure they are on top
        this.container.bringToTop(this.upButton);
        this.container.bringToTop(this.downButton);
    }

    private createPlayerRow(player: any, y: number, h: number): Phaser.GameObjects.Container {
        const scene = this.container.scene;

        // Adjust width to allow for scroll bar/buttons on Left?
        // If buttons are on left, we should shift content right?
        const leftPad = this.isScrollable ? 35 : 10;
        const rightPad = 10;
        const W = this.currentWidth - leftPad - rightPad;

        const row = scene.add.container(leftPad, y);

        // BG
        const bg = scene.add.graphics();
        this.drawCardPanel(bg, W, h, player.color);
        row.add(bg);

        // Dynamic Font Sizing
        // Scale factor: Base off width
        // Reference Width: 240px. 
        const s = Math.min(1, W / 240);

        const baseSize = Math.max(10, Math.floor(14 * s));
        const goldSize = Math.max(12, Math.floor(16 * s));

        // Title
        const title = scene.add.text(8, h / 2, player.id, {
            fontFamily: 'Georgia, serif', fontSize: `${baseSize}px`,
            color: '#' + player.color.toString(16).padStart(6, '0'),
            fontStyle: 'bold',
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 2, fill: true }
        });
        title.setOrigin(0, 0.5);
        row.add(title);

        const iconSize = Math.min(h - 4, 28 * s);
        const iconX = W - (iconSize / 2) - 5;

        // Type Icon
        const iconKey = player.isAI ? 'icon_robot_cartoon' : 'icon_human_cartoon';
        const icon = scene.add.image(iconX, h / 2, iconKey)
            .setDisplaySize(iconSize, iconSize);
        row.add(icon);

        // Coin
        const coinSize = Math.floor(goldSize * 0.9);
        const coinX = iconX - (iconSize / 2) - 5 - (coinSize / 2);
        const coin = scene.add.image(coinX, h / 2, 'icon_gold_3d').setDisplaySize(coinSize, coinSize);
        row.add(coin);

        // Gold Value
        const goldX = coinX - (coinSize / 2) - 5;
        const goldText = scene.add.text(goldX, h / 2, player.gold.toString(), {
            fontFamily: 'Arial', fontSize: `${goldSize}px`, color: '#ffd700', fontStyle: 'bold',
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 2, fill: true }
        });
        goldText.setOrigin(1, 0.5);
        row.add(goldText);

        // Income
        const incomeText = scene.add.text(goldX - ((goldText.width || 30) * s + 10), h / 2, '+0/t', {
            fontFamily: 'Arial', fontSize: `${Math.max(8, baseSize - 2)}px`, color: '#88ff88'
        });
        incomeText.setOrigin(1, 0.5);
        row.add(incomeText);

        return row;
    }

    public setPosition(x: number, y: number) {
        this.container.setPosition(x, y);
    }

    private currentWidth: number = 260;

    public resize(width: number, height: number, x: number, y: number) {
        this.currentWidth = width;
        this.viewHeight = height - 60; // Keep consistent with constructor

        // Update Background
        const bg = this.container.getAt(0) as Phaser.GameObjects.Graphics;
        if (bg) {
            bg.clear();
            this.drawPanel(bg, width, height);
        }

        // Update Header Position
        const header = this.container.getAt(1) as Phaser.GameObjects.Text;
        const uiText = this.container.getAt(2) as Phaser.GameObjects.Text;
        if (header && uiText) {
            header.setX(width / 2);
            uiText.setX(width / 2);
        }

        // Update Interactive Hit Area
        const hitArea = new Phaser.Geom.Rectangle(0, 50, width, this.viewHeight);
        this.container.removeInteractive();
        this.container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

        // Trigger Rebuild to adapt to new width/height
        // We need to clear valid flag? just clear list.
        this.listContainer.removeAll(true);
        this.playerRows = []; // Will rebuild in update()

        // Update Mask
        this.updateMask(width, height, x, y);
    }

    private updateMask(w: number, _h: number, x: number, y: number) {
        if (this.maskShape) {
            this.maskShape.clear();
            this.maskShape.fillStyle(0xffffff);
            const absoluteY = y + 50;
            this.maskShape.fillRect(x, absoluteY, w, this.viewHeight);
        }
    }

    public setScale(scale: number) {
        this.container.setScale(scale);
    }

    public setVisible(visible: boolean) {
        this.container.setVisible(visible);
    }

    private drawPanel(graphics: Phaser.GameObjects.Graphics, width: number, height: number) {
        const radius = 16;
        const color = 0x1a1a1a;
        const alpha = 0.85;
        graphics.fillStyle(color, alpha);
        graphics.fillRoundedRect(0, 0, width, height, radius);
        graphics.lineStyle(2, 0xffffff, 0.1);
        graphics.strokeRoundedRect(0, 0, width, height, radius);
    }

    private drawCardPanel(graphics: Phaser.GameObjects.Graphics, width: number, height: number, accentColor?: number) {
        graphics.fillStyle(0x2a2a2a, 1);
        graphics.fillRoundedRect(0, 0, width, height, 8);
        if (accentColor !== undefined) {
            graphics.fillStyle(accentColor, 1);
            graphics.fillRect(0, 8, 4, height - 16);
        }
        graphics.lineStyle(2, 0x000000, 0.5);
        graphics.strokeRoundedRect(0, 0, width, height, 8);
    }
}
