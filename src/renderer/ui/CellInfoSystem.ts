import Phaser from 'phaser';
import { GameEngine } from '../../core/GameEngine';
import { AuraSystem } from '../../core/AuraSystem';

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
    private actionDescription: string | null = null;

    // Arrows
    upArrow!: Phaser.GameObjects.Container;
    downArrow!: Phaser.GameObjects.Container;

    // Constants
    readonly BASE_WIDTH = 200;

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

        this.headerText = this.scene.add.text(0, 0, 'INFO', { fontSize: '18px', color: '#aaaaaa', fontStyle: 'bold' });
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

        const formattedTotalCost = this.formatNumber(totalCost);
        this.planText.setText(`Plan: ${formattedTotalCost} G`);

        if (totalCost > currentGold) {
            const missing = totalCost - currentGold;
            const formattedMissing = this.formatNumber(missing);
            this.planText.setText(`Plan: ${formattedTotalCost} G\n(Need ${formattedMissing} more!)`);
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
                let costStr = "";
                let primaryBreakdown = "";

                if (cell.owner === engine.state.currentPlayerId) {
                    const enemyCost = engine.getPotentialEnemyAttackCost(selectedRow, selectedCol);
                    const formattedEnemyCost = this.formatNumber(enemyCost.cost);
                    costStr = enemyCost.cost > 0 ? `${formattedEnemyCost}G` : "0G";
                    primaryBreakdown = this.formatBreakdownNumbers(enemyCost.breakdown);
                } else {
                    const costDetails = engine.getCostDetails(selectedRow, selectedCol);
                    const formattedCost = this.formatNumber(costDetails.cost);
                    costStr = costDetails.cost === Infinity ? 'X' : `${formattedCost}G`;
                    primaryBreakdown = this.formatBreakdownNumbers(costDetails.breakdown);
                }

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

                // Add Income Info (New Feature)
                // Only if owned? Or potential income?
                // Request said "income info of each block".
                // If I click enemy block, I want to know its income? Yes.
                const income = engine.getTileIncome(selectedRow, selectedCol);
                if (income > 0) {
                    let incomeStr = `+${this.formatNumber(income)}`;
                    if (cell.owner && !cell.isConnected) incomeStr += " (Disc.)";

                    // Check for Aura Bonus
                    if (cell.owner) {
                        const bonus = AuraSystem.getIncomeAuraBonus(engine.state, selectedRow, selectedCol, cell.owner);
                        if (bonus > 0) {
                            const percent = Math.round(bonus * 100);
                            incomeStr += ` (Aura +${percent}%)`;
                        }
                    }

                    desc += `\nIncome: ${incomeStr} G`;
                }

                if (primaryBreakdown) {
                    const title = (cell.owner === engine.state.currentPlayerId) ? "[Enemy Attack Base Cost]" : "[Cost Logic]";
                    desc += `\n\n${title}\n${primaryBreakdown}`;
                }

                this.descText.setText(desc);

                // Plan Details
                this.planDetailsText.setText(this.actionDescription || '');
            }
        }
        // Force relayout after text updates
        this.layout(this.viewportWidth, this.viewportHeight);
    }

    private generateDescription(cell: any): string {
        let desc = "";
        if (cell.building === 'gold_mine') desc = "Generates +5 G.";
        else if (cell.building === 'town') desc = `Generates +${this.formatNumber(cell.townIncome)} G.`;
        else if (cell.building === 'base') desc = "Main Base.";
        else if (cell.building === 'wall') desc = `Wall (Lv ${cell.defenseLevel}).`;
        else {
            switch (cell.type) {
                case 'plain':
                    desc = "Plains: standard terrain for expansion and building.";
                    break;
                case 'hill':
                    desc = "Hills: rugged terrain. Mines may be discovered here.";
                    break;
                case 'water':
                    desc = "Water: impassable without building a bridge.";
                    break;
                case 'bridge':
                    desc = "Bridge: allows crossing water.";
                    break;
                default:
                    desc = cell.type;
                    break;
            }
        }

        // Add Range info
        if (cell.watchtowerLevel > 0) desc += `\nWatchtower Lv ${cell.watchtowerLevel}.`;

        if (cell.type !== 'bridge' && cell.building !== 'base') {
            // Simplify text to avoid clutter
        }
        return desc;
    }

    private formatNumber(value: number): string {
        if (!Number.isFinite(value)) return String(value);
        const rounded = Math.round(value * 10) / 10;
        return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    }

    private formatBreakdownNumbers(text: string): string {
        if (!text) return text;
        return text.replace(/-?\d+(\.\d+)?/g, (raw) => {
            const num = Number(raw);
            if (!Number.isFinite(num)) return raw;
            const rounded = Math.round(num * 10) / 10;
            return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
        });
    }

    public setActionDescription(description: string | null) {
        this.actionDescription = description;
    }

    public resize(width: number, height: number, x: number, y: number) {
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
        this.updateTextStyles(width, height); // New: Update styles before layout
        this.layout(width, height);
    }

    private calculateFontSize(width: number, height: number, baseSize: number): string {
        // Use the shorter side to scale fonts for small screens
        const refSize = 160;
        const scale = Math.min(width, height) / refSize;

        // Limits (Reduced by ~20% as requested)
        const minSize = 7.2; // Was 9
        const maxSize = baseSize + 5;
        const newSize = baseSize * scale;
        const clamped = Phaser.Math.Clamp(newSize, minSize, maxSize);
        return `${clamped.toFixed(1)}px`;
    }

    private updateTextStyles(width: number, height: number) {
        // Base sizes (Reduced by ~30%)
        // Old: 18, 16, 14 -> New: 13, 11, 10
        const headerSize = this.calculateFontSize(width, height, 13);
        const standardSize = this.calculateFontSize(width, height, 11);
        const smallSize = this.calculateFontSize(width, height, 10);

        // Apply
        this.headerText.setStyle({ fontSize: headerSize });
        this.typeText.setStyle({ fontSize: standardSize });
        this.ownerText.setStyle({ fontSize: standardSize });
        this.costText.setStyle({ fontSize: standardSize });
        this.planText.setStyle({ fontSize: standardSize }); // Keep color logic

        // Use setFontSize for planText? No, setStyle is fine here as we don't word wrap it separately usually, 
        // but layout() will be called next.

        this.descText.setStyle({ fontSize: smallSize });
        this.planDetailsText.setStyle({ fontSize: smallSize });
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
                // Use setWordWrapWidth to avoid overwriting fontSize set by updateTextStyles!
                txt.setWordWrapWidth(contentW);
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

        layoutItem(this.planDetailsText);
        layoutItem(this.descText);

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
