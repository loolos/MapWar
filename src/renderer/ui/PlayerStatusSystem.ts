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
        const header = scene.add.text(130, 25, 'GAME STATUS', {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: '18px', // Reduced from 22
            color: '#ffffff',
            fontStyle: 'bold',
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 2, fill: true }
        }).setOrigin(0.5);
        this.container.add(header);

        // Turn Info
        this.uiText = scene.add.text(130, 45, 'Turn 1', { // Reduced Y slightly
            fontFamily: 'Georgia, serif', fontSize: '14px', color: '#dddddd' // Reduced from 16
        }).setOrigin(0.5);
        this.container.add(this.uiText);

        // Scrollable List Container
        this.listContainer = scene.add.container(0, 70); // Moved up from 80
        this.container.add(this.listContainer);

        // Setup Mask
        this.maskShape = scene.make.graphics({});
        this.listMask = new Phaser.Display.Masks.GeometryMask(scene, this.maskShape);
        this.listContainer.setMask(this.listMask);

        this.viewHeight = height - 80; // Adjusted for padding

        // Enhance Interaction for Scroll
        const hitArea = new Phaser.Geom.Rectangle(0, 70, 260, this.viewHeight);
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

        this.listContainer.y = 70 + this.scrollY; // Match new Y
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
        } else {
            // Just update values
            this.playerRows.forEach((row) => {
                const pid = (row as any).playerId;
                const player = state.players[pid];
                // Child Order: 0:BG, 1:Title, 2:GoldText, 3:Coin, 4:Icon
                const goldTxt = row.getAt(2) as Phaser.GameObjects.Text;
                goldTxt.setText(player.gold.toString());

                // Alpha Update
                const currentId = state.currentPlayerId || '';
                const pAlpha = currentId === pid ? 1 : 0.4;
                row.setAlpha(pAlpha);
            });
        }
    }

    private rebuildList(order: string[], players: any) {
        // Clear old
        this.listContainer.removeAll(true);
        this.playerRows = [];

        let currentY = 0;
        const gap = 5; // Reduced from 10
        const useCompact = order.length > 5;
        const actualCardH = useCompact ? 40 : 60; // Reduced from 50/90

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
            this.listContainer.y = 70 + this.scrollY;
        }
    }

    private createPlayerRow(player: any, y: number, h: number): Phaser.GameObjects.Container {
        const scene = this.container.scene;
        const row = scene.add.container(10, y);

        // BG
        const bg = scene.add.graphics();
        this.drawCardPanel(bg, 240, h, player.color);
        row.add(bg);

        // Compact Layout
        const isCompact = h < 50;

        // Title
        const titleY = isCompact ? 10 : 10;
        const title = scene.add.text(20, titleY, player.id, {
            fontFamily: 'Georgia, serif', fontSize: '16px', // Reduced from 18
            color: '#' + player.color.toString(16).padStart(6, '0'),
            fontStyle: 'bold',
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 2, fill: true }
        });
        title.setOrigin(0, 0.5); // Center vertically
        title.y = h / 2;
        row.add(title);

        // Gold
        const goldY = h / 2;
        const goldText = scene.add.text(140, goldY, player.gold.toString(), {
            fontFamily: 'Arial', fontSize: '16px', color: '#ffd700', fontStyle: 'bold', // Reduced from 20
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 2, fill: true }
        });
        goldText.setOrigin(1, 0.5); // Right align
        row.add(goldText);

        // Coin Icon (Next to gold)
        const coin = scene.add.image(155, goldY, 'icon_gold_3d').setDisplaySize(18, 18); // Reduced from 24
        row.add(coin);

        // Type Icon
        const icon = scene.add.image(210, h / 2, player.isAI ? 'icon_robot_badge' : 'icon_human_badge')
            .setDisplaySize(24, 24); // Reduced from 32/42
        row.add(icon);

        return row;
    }

    public setPosition(x: number, y: number) {
        this.container.setPosition(x, y);
    }

    public resize(width: number, height: number, x: number, y: number) {
        // Update Background
        const bg = this.container.getAt(0) as Phaser.GameObjects.Graphics;
        if (bg) {
            bg.clear();
            this.drawPanel(bg, width, height);
        }

        this.viewHeight = height - 90;

        // Update Interactive Hit Area
        const hitArea = new Phaser.Geom.Rectangle(0, 80, width, this.viewHeight);

        // Re-set interactive to update hit area safely
        // Or re-set interactive
        this.container.removeInteractive();
        this.container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

        // Update Mask
        this.updateMask(width, height, x, y);
    }

    private updateMask(w: number, _h: number, x: number, y: number) {
        if (this.maskShape) {
            this.maskShape.clear();
            this.maskShape.fillStyle(0xffffff);
            // Mask in Absolute World Coords
            // x, y is the top-left of the container
            // Mask should start at y + 80
            // Height is viewHeight
            // Scale awareness
            // For MainScene resize, passed x/y are container coords? Yes.

            // Note: MaskShape is a Graphics object. GeometryMask uses it.
            // Graphics coordinates are local unless added to scene?
            // "The Graphics object is rendered to the Mask Buffer".
            // It needs world coordinates usually.

            // Let's assume standard camera/zoom (1.0).
            const absoluteY = y + 80;
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
