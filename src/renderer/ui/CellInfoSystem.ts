import Phaser from 'phaser';
import { GameEngine } from '../../core/GameEngine';

export class CellInfoSystem extends Phaser.GameObjects.Container {
    bgGraphics: Phaser.GameObjects.Graphics;

    // Scrollable Content
    contentContainer: Phaser.GameObjects.Container;
    maskGraphics: Phaser.GameObjects.Graphics;

    // Text Elements (Unified in contentContainer)
    headerText!: Phaser.GameObjects.Text;
    // coordsText!: Phaser.GameObjects.Text; // Removed
    typeText!: Phaser.GameObjects.Text;
    ownerText!: Phaser.GameObjects.Text;
    costText!: Phaser.GameObjects.Text;
    planText!: Phaser.GameObjects.Text;
    divider!: Phaser.GameObjects.Graphics;
    descText!: Phaser.GameObjects.Text;
    planDetailsText!: Phaser.GameObjects.Text;

    // Arrows
    upArrow!: Phaser.GameObjects.Container;
    downArrow!: Phaser.GameObjects.Container;

    // State
    scrollY: number = 0;
    contentHeight: number = 0;
    viewportHeight: number = 250;
    viewportWidth: number = 200;
    isDragging: boolean = false;
    lastY: number = 0;

    constructor(scene: Phaser.Scene, x: number, y: number, width: number) {
        super(scene, x, y);
        this.viewportWidth = width;

        // Add this container to the scene
        scene.add.existing(this);

        // Background
        this.bgGraphics = scene.add.graphics();
        this.add(this.bgGraphics);

        // Content Container
        this.contentContainer = scene.add.container(0, 0);
        this.add(this.contentContainer);

        // Mask
        this.maskGraphics = scene.make.graphics({});
        const mask = this.maskGraphics.createGeometryMask();
        this.contentContainer.setMask(mask);

        // Elements
        this.createElements();

        // Arrows (On top of mask, but inside main container)
        this.createArrows();

        // Input
        const zone = scene.add.zone(0, 0, width, 250).setOrigin(0);
        this.add(zone);
        zone.setInteractive();

        zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.isDragging = true;
            this.lastY = pointer.y;
        });

        scene.input.on('pointerup', () => {
            this.isDragging = false;
        });

        scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (this.isDragging && this.visible) {
                const dy = pointer.y - this.lastY;
                this.lastY = pointer.y;
                this.scroll(dy);
            }
        });

        zone.on('wheel', (_u: any, _dx: number, deltaY: number) => {
            this.scroll(-deltaY * 0.5);
        });

        // Initial Layout
        this.layout(width, 250);
        this.drawBackground(width, 250);
    }

    private createElements() {
        // Create all text elements and add to contentContainer
        const baseStyle = { fontSize: '16px', color: '#ffffff' };

        this.headerText = this.scene.add.text(0, 0, 'CELL INFO', { fontSize: '18px', color: '#aaaaaa', fontStyle: 'bold' });
        // this.coordsText = this.scene.add.text(0, 0, 'Pos: --', baseStyle);
        this.typeText = this.scene.add.text(0, 0, 'Type: --', baseStyle);
        this.ownerText = this.scene.add.text(0, 0, 'Owner: --', baseStyle);
        this.costText = this.scene.add.text(0, 0, 'Cost: --', baseStyle);
        this.planText = this.scene.add.text(0, 0, 'Plan: 0 G', { fontSize: '16px', color: '#ff8888', fontStyle: 'bold' });

        this.divider = this.scene.add.graphics();

        const descStyle = { fontSize: '14px', color: '#dddddd' };
        this.descText = this.scene.add.text(0, 0, '', descStyle);

        this.planDetailsText = this.scene.add.text(0, 0, '', { fontSize: '14px', color: '#ffff00', fontStyle: 'bold' });

        this.contentContainer.add([
            this.headerText,
            // this.coordsText,
            this.typeText,
            this.ownerText,
            this.costText,
            this.planText,
            this.divider,
            this.descText,
            this.planDetailsText
        ]);
    }

    private createArrows() {
        // Simple arrows visualization
        this.upArrow = this.createArrowSprite(true);
        this.downArrow = this.createArrowSprite(false);
        this.add([this.upArrow, this.downArrow]);
        this.upArrow.setVisible(false);
        this.downArrow.setVisible(false);
    }

    private createArrowSprite(isUp: boolean): Phaser.GameObjects.Container {
        const c = this.scene.add.container(0, 0);
        const g = this.scene.add.graphics();
        g.fillStyle(0xffffff, 0.5);
        g.beginPath();
        if (isUp) {
            g.moveTo(0, 0); g.lineTo(10, 10); g.lineTo(-10, 10);
        } else {
            g.moveTo(0, 10); g.lineTo(10, 0); g.lineTo(-10, 0);
        }
        g.closePath();
        g.fillPath();
        c.add(g);

        // Interactive zone for click scroll
        const zone = this.scene.add.zone(0, 5, 40, 30).setInteractive();
        zone.on('pointerdown', () => this.scroll(isUp ? 20 : -20));
        c.add(zone);

        return c;
    }

    update(engine: GameEngine, selectedRow: number | null, selectedCol: number | null) {
        // logic similar to old update, but just sets text. Layout called at end.

        const currentPlayer = engine.state.getCurrentPlayer();
        const currentGold = currentPlayer.gold;
        const totalCost = engine.calculatePlannedCost();

        this.planText.setText(`Plan: ${totalCost} G`);

        if (totalCost > currentGold) {
            const missing = totalCost - currentGold;
            this.planText.setText(`Plan: ${totalCost} G\n(Need ${missing} more!)`);
            this.planText.setColor('#ff0000');
        } else {
            this.planText.setColor('#88ff88');
        }

        if (selectedRow === null || selectedCol === null) {
            // this.coordsText.setText('Pos: --'); // Removed
            this.typeText.setText('Type: --');
            this.ownerText.setText('Owner: --');
            this.costText.setText('Cost: --');
            this.descText.setText('');
            this.planDetailsText.setText('');
        } else {
            const cell = engine.state.getCell(selectedRow, selectedCol);
            if (cell) {
                // this.coordsText.setText(`Pos: (${selectedRow}, ${selectedCol})`); // Removed

                // Type
                let typeStr = cell.type.charAt(0).toUpperCase() + cell.type.slice(1);
                if (cell.building === 'gold_mine') { typeStr = "Gold Mine"; }
                else if (cell.building === 'town') { typeStr = "Town"; }
                else if (cell.building === 'base') {
                    typeStr = "Base";
                    if (cell.defenseLevel > 0) typeStr += ` (Def Lvl ${cell.defenseLevel})`;
                }
                this.typeText.setText(`Type: ${typeStr}`);

                // Owner
                const owner = cell.owner ? (cell.owner === 'P1' ? 'P1' : 'P2') : 'Neutral';
                let ownerDisplay = `Owner: ${owner}`;
                if (cell.owner && !cell.isConnected) ownerDisplay += ' (Disc.)';
                this.ownerText.setText(ownerDisplay);
                this.ownerText.setColor(cell.owner === 'P1' ? '#ff4444' : (cell.owner === 'P2' ? '#4444ff' : '#ffffff'));

                // Cost
                const costDetails = engine.getCostDetails(selectedRow, selectedCol);
                let costStr = `${costDetails.cost}G`;
                if (costDetails.cost === Infinity) costStr = 'X';
                this.costText.setText(`Cost: ${costStr}`);

                // Show Breakdown directly in cost text or description?
                // User asked: "Show base attack cost of this cell"
                // We can append to description or make a new line?
                // Let's reuse description for now or append to Cost if short?
                // Breakdown is often long "Attack(20) Distance(x2)..."
                // Let's put it in Description if it fits, or dedicated line?
                // "Base Cost" usually implies just the base value before modifiers?
                // But the user said "explain how calculated".
                // Let's add it to the Description area which mimics a tooltip.

                // Show Breakdown
                // User requirement: "Explain how cost is calculated"
                // Ensure text wraps properly in layout
                let desc = this.generateDescription(cell);

                const breakdown = costDetails.breakdown;
                if (breakdown) {
                    desc += `\n\n[Cost Logic]\n${breakdown}`;
                }

                this.descText.setText(desc);

                // Plan Details
                const pending = engine.pendingInteractions.find(i => i.r === selectedRow && i.c === selectedCol);
                let planStr = "";
                if (pending) {
                    const action = engine.interactionRegistry.get(pending.actionId);
                    if (action) {
                        const d = typeof action.description === 'function' ? action.description(engine, selectedRow, selectedCol) : action.description;
                        planStr = `PLAN: ${d}`;
                    }
                }
                this.planDetailsText.setText(planStr);
            }
        }
        // Force relayout after text updates
        this.layout(this.viewportWidth, this.viewportHeight);
    }

    private generateDescription(cell: any): string {
        let desc = "";
        if (cell.building === 'gold_mine') desc = "Generates +5 G.";
        else if (cell.building === 'town') desc = `Generates +${cell.townIncome} G.`;
        else if (cell.building === 'base') desc = "Main Base.";
        else if (cell.building === 'wall') desc = `Wall (Lv ${cell.defenseLevel}).`;
        else desc = cell.type; // Basic

        // Add Range info
        if (cell.watchtowerLevel > 0) desc += `\nWatchtower Lv ${cell.watchtowerLevel}.`;

        if (cell.type !== 'bridge' && cell.building !== 'base') {
            // Simplify text to avoid clutter
        }
        return desc;
    }

    public resize(width: number, height: number, x: number, y: number) {
        // Debug Log to verify instance health
        console.log(`CellInfoSystem.resize: ${width}x${height} at ${x},${y}`);
        this.viewportWidth = width;
        this.viewportHeight = height;
        this.setPosition(x, y);
        if (this.maskGraphics) {
            this.maskGraphics.setPosition(x, y);
        }

        // Resize Input Zone
        const zone = this.list.find(c => c.type === 'Zone') as Phaser.GameObjects.Zone;
        if (zone) zone.setSize(width, height);

        this.drawBackground(width, height);
        this.updateMask(width, height);
        this.layout(width, height);
    }

    private drawBackground(w: number, h: number) {
        const g = this.bgGraphics;
        g.clear();

        const radius = 16;
        const color = 0x1a1a1a;
        const alpha = 0.85;

        g.fillStyle(color, alpha);
        g.fillRoundedRect(0, 0, w, h, radius);
        g.lineStyle(2, 0xffffff, 0.1);
        g.strokeRoundedRect(0, 0, w, h, radius);
    }

    private updateMask(w: number, h: number) {
        if (this.maskGraphics) {
            this.maskGraphics.clear();
            this.maskGraphics.fillStyle(0xffffff);
            // Mask entire area with small padding, RELATIVE to container (0,0)
            this.maskGraphics.fillRoundedRect(2, 2, w - 4, h - 4, 14);
        }
    }

    private layout(width: number, height: number) {
        let currentY = 10;
        const padding = 12;
        const contentW = width - (padding * 2);

        const layoutItem = (item: Phaser.GameObjects.Text | Phaser.GameObjects.Graphics, isText: boolean = true) => {
            if (isText) {
                const txt = item as Phaser.GameObjects.Text;
                txt.setPosition(padding, currentY);
                txt.setStyle({ wordWrap: { width: contentW } });
                currentY += txt.height + 4; // Spacing
            } else {
                // Divider
                const gfx = item as Phaser.GameObjects.Graphics;
                gfx.clear();
                gfx.lineStyle(1, 0xffffff, 0.2);
                gfx.lineBetween(padding, currentY + 5, width - padding, currentY + 5);
                currentY += 10;
            }
        };

        layoutItem(this.headerText);
        // layoutItem(this.coordsText); // Removed
        layoutItem(this.typeText);
        layoutItem(this.ownerText);
        layoutItem(this.costText);
        layoutItem(this.planText);

        layoutItem(this.divider, false);

        layoutItem(this.descText);
        layoutItem(this.planDetailsText);

        currentY += 30; // Extra padding for bottom arrow

        this.contentHeight = currentY + padding;

        // Arrows Position
        this.upArrow.setPosition(width / 2, 10);
        this.downArrow.setPosition(width / 2, height - 20);

        this.scroll(0); // Clamp
    }

    private scroll(dy: number) {
        this.scrollY += dy;
        const viewH = this.viewportHeight;
        const maxScroll = Math.min(0, -(this.contentHeight - viewH));

        if (this.contentHeight <= viewH) {
            this.scrollY = 0;
            this.upArrow.setVisible(false);
            this.downArrow.setVisible(false);
        } else {
            if (this.scrollY > 0) this.scrollY = 0;
            if (this.scrollY < maxScroll) this.scrollY = maxScroll;

            // Show arrows if there is more content in that direction
            this.upArrow.setVisible(this.scrollY < 0);
            this.downArrow.setVisible(this.scrollY > maxScroll);
        }

        this.contentContainer.y = this.scrollY;
    }
}
