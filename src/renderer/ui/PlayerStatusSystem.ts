import Phaser from 'phaser';
import { GameEngine } from '../../core/GameEngine'; // For Move type if needed? Or just pass primitives

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

    constructor(scene: Phaser.Scene, x: number, y: number, height: number) {
        this.container = scene.add.container(x, y);

        // Sidebar Background (Interactive for scrolling)
        const sidebarBg = scene.add.graphics();
        this.container.add(sidebarBg);
        this.drawPanel(sidebarBg, 260, height);

        // Header
        const header = scene.add.text(130, 20, 'GAME STATUS', {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: '14px', // Reduced 18 -> 14
            color: '#ffffff',
            fontStyle: 'bold',
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 2, fill: true }
        }).setOrigin(0.5);
        this.container.add(header);

        // Turn Info
        this.uiText = scene.add.text(130, 35, 'Turn 1', {
            fontFamily: 'Georgia, serif', fontSize: '12px', color: '#dddddd' // Reduced 14 -> 12
        }).setOrigin(0.5);
        this.container.add(this.uiText);

        // Scrollable List Container
        this.listContainer = scene.add.container(0, 50); // Moved up 70 -> 50
        this.container.add(this.listContainer);

        // Setup Mask
        this.maskShape = scene.make.graphics({});
        this.listMask = new Phaser.Display.Masks.GeometryMask(scene, this.maskShape);
        this.listContainer.setMask(this.listMask);

        this.viewHeight = height - 60; // Adjusted for padding

        // Enhance Interaction for Scroll
        const hitArea = new Phaser.Geom.Rectangle(0, 50, 260, this.viewHeight);
        this.container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

        this.container.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (pointer.isDown) {
                const dy = pointer.y - pointer.prevPosition.y;
                this.scroll(dy);
            }
        });

        // Wheel support
        // ... (omitted unchanged wheel code)
        scene.input.on('wheel', (pointer: any, _gameObjects: any, _deltaX: number, deltaY: number, _deltaZ: number) => {
            const localPoint = this.container.pointToContainer(pointer);
            const hit = localPoint.x >= 0 && localPoint.x <= 260 && localPoint.y >= 0 && localPoint.y <= height;
            if (hit) {
                this.scroll(-deltaY * 0.5);
            }
        });

        // Initialize Mask
        this.updateMask(260, height, x, y);
    }

    // ... scroll method ...
    private scroll(dy: number) {
        if (this.contentHeight <= this.viewHeight) return;

        this.scrollY += dy;
        const minScroll = this.viewHeight - this.contentHeight;
        if (this.scrollY > 0) this.scrollY = 0;
        if (this.scrollY < minScroll) this.scrollY = minScroll;

        this.listContainer.y = 50 + this.scrollY; // Match header offset

        // Update mask position if it tracks scroll? No, mask stays fixed.
    }

    public update(engine: GameEngine) {
        const state = engine.state;

        // Update Turn
        this.uiText.setText(`TURN ${state.turnCount}`);

        const currentIds = state.playerOrder;
        const needsRebuild = this.playerRows.length !== currentIds.length ||
            this.playerRows.some((row, i) => (row as any).playerId !== currentIds[i]);

        if (needsRebuild) {
            this.rebuildList(engine.state.playerOrder, engine.state.players);
        }

        // Update values (Always run to ensure fresh rows get data)
        this.playerRows.forEach((row) => {
            const pid = (row as any).playerId;
            const player = state.players[pid];
            // Child Order: 0:BG, 1:Title, 2:Icon, 3:Coin, 4:GoldText, 5:IncomeText
            const goldTxt = row.getAt(4) as Phaser.GameObjects.Text;
            goldTxt.setText(player.gold.toString());

            // Income text (Index 5)
            const incomeTxt = row.getAt(5) as Phaser.GameObjects.Text;
            const income = engine.state.calculateIncome(pid);
            incomeTxt.setText(`+${income}/t`);

            // Alpha Update
            const currentId = state.currentPlayerId || '';
            const pAlpha = currentId === pid ? 1 : 0.4;
            row.setAlpha(pAlpha);
        });
    }

    private rebuildList(order: string[], players: any) {
        // Clear old
        this.listContainer.removeAll(true);
        this.playerRows = [];

        let currentY = 0;
        const gap = 3; // Reduced 5 -> 3
        const useCompact = order.length > 5;
        const actualCardH = useCompact ? 28 : 36; // Reduced 40/60 -> 28/36

        order.forEach(pid => {
            const player = players[pid];
            const row = this.createPlayerRow(player, currentY, actualCardH);
            (row as any).playerId = pid;
            this.listContainer.add(row);
            this.playerRows.push(row);

            currentY += actualCardH + gap;
        });

        this.contentHeight = currentY;

        // Reset scroll
        if (this.scrollY < this.viewHeight - this.contentHeight) {
            this.scrollY = Math.min(0, this.viewHeight - this.contentHeight);
            this.listContainer.y = 50 + this.scrollY;
        }
    }

    private createPlayerRow(player: any, y: number, h: number): Phaser.GameObjects.Container {
        const scene = this.container.scene;
        // Use currentWidth for layout
        const W = this.currentWidth - 20; // Margin 10 each side

        const row = scene.add.container(10, y);

        // BG
        const bg = scene.add.graphics();
        this.drawCardPanel(bg, W, h, player.color);
        row.add(bg);

        // Compact Layout
        const isCompact = h < 30;

        // Dynamic Font
        const baseSize = Math.max(10, Math.floor(W * 0.06)); // ~15px at 260
        const idSize = baseSize;
        const goldSize = Math.max(10, Math.floor(W * 0.055));

        // Title
        const titleY = h / 2;
        const title = scene.add.text(10, titleY, player.id, {
            fontFamily: 'Georgia, serif', fontSize: `${idSize}px`,
            color: '#' + player.color.toString(16).padStart(6, '0'),
            fontStyle: 'bold',
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 2, fill: true }
        });
        title.setOrigin(0, 0.5);
        row.add(title);

        // Layout: [Title] ... [Income] [Gold] [Coin] [Icon]
        // Right Aligned elements
        // Icon at right edge - 20
        // Coin left of Icon
        // Gold left of Coin
        // Income below/above?

        const iconSize = isCompact ? Math.min(24, h - 4) : Math.min(28, h - 8);
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
        // If compact, maybe skip or tiny?
        // Put it left of Gold? 
        // const incomeX = goldX - 40; // Unused 
        // Or if space allows?
        // Let's put positions relative to GoldText.
        // We will update Income position in `update` loop? constant x?
        // Let's set it left of goldText but we don't know width of goldText dynamic.
        // We can place it at fixed offset or ...
        // Let's place it at (goldX - 50) for now.
        const incomeText = scene.add.text(goldX - ((goldText.width || 30) + 10), h / 2, '+0/t', {
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

        // Update Background
        const bg = this.container.getAt(0) as Phaser.GameObjects.Graphics;
        if (bg) {
            bg.clear();
            this.drawPanel(bg, width, height);
        }

        this.viewHeight = height - 90;

        // Update Interactive Hit Area
        const hitArea = new Phaser.Geom.Rectangle(0, 80, width, this.viewHeight);

        this.container.removeInteractive();
        this.container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

        // Force Rebuild of List on next update to apply new width/fonts
        this.listContainer.removeAll(true);
        this.playerRows = []; // This triggers rebuild in update()

        // Update Mask
        this.updateMask(width, height, x, y);
    }

    private updateMask(w: number, _h: number, x: number, y: number) {
        if (this.maskShape) {
            this.maskShape.clear();
            this.maskShape.fillStyle(0xffffff);

            // Mask must cover the list area logic
            // The list starts at container Y+50
            const absoluteY = y + 50;

            // Draw rect
            this.maskShape.fillRect(x, absoluteY, w, this.viewHeight);
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
