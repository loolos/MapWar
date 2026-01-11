import Phaser from 'phaser';
import { GameConfig } from '../../core/GameConfig';
import { GameEngine } from '../../core/GameEngine';

export class CellInfoSystem {
    scene: Phaser.Scene;
    container: Phaser.GameObjects.Container;

    // UI Elements (Fixed)
    headerText: Phaser.GameObjects.Text;
    coordsText: Phaser.GameObjects.Text;
    typeText: Phaser.GameObjects.Text;
    ownerText: Phaser.GameObjects.Text;
    costText: Phaser.GameObjects.Text;
    planText: Phaser.GameObjects.Text;

    // UI Elements (Scrollable)
    descText: Phaser.GameObjects.Text;
    planDetailsText: Phaser.GameObjects.Text;


    // Scrollable Logic
    contentContainer: Phaser.GameObjects.Container;
    contentMask: Phaser.Display.Masks.GeometryMask;
    maskGraphics: Phaser.GameObjects.Graphics;

    isDragging: boolean = false;
    lastY: number = 0;
    scrollY: number = 0;
    maxScroll: number = 0;

    // Fixed Area Height (Header + Stats)
    readonly FIXED_HEIGHT = 175;

    constructor(scene: Phaser.Scene, x: number, y: number, width: number) {
        this.scene = scene;
        this.container = scene.add.container(x, y);

        // Background (Glassmorphism)
        const bg = scene.add.graphics();
        this.container.add(bg);
        this.drawPanel(bg, width, 250);

        // Main Mask (for the whole panel shape)
        // Actually, we don't need a mask for the whole panel if we draw the BG correctly.
        // But for scrolling content, we need a specific mask.

        // Header
        this.headerText = scene.add.text(10, 10, 'CELL INFO', {
            fontSize: '18px',
            color: '#aaaaaa',
            fontStyle: 'bold'
        });
        this.container.add(this.headerText);

        // Initial Text Objects (Fixed)
        const style = { fontSize: '16px', color: '#ffffff' };

        this.coordsText = scene.add.text(10, 40, 'Pos: --', style);
        this.container.add(this.coordsText);

        this.typeText = scene.add.text(10, 65, 'Type: --', style);
        this.container.add(this.typeText);

        this.ownerText = scene.add.text(10, 90, 'Owner: --', style);
        this.container.add(this.ownerText);

        this.costText = scene.add.text(10, 115, 'Cost: --', style);
        this.container.add(this.costText);

        this.planText = scene.add.text(10, 140, 'Plan: 0 G', { fontSize: '16px', color: '#ff8888', fontStyle: 'bold' });
        this.container.add(this.planText);

        // --- DIVIDER LINE ---
        const divider = scene.add.graphics();
        divider.lineStyle(1, 0xffffff, 0.2);
        divider.lineBetween(10, this.FIXED_HEIGHT - 5, width - 10, this.FIXED_HEIGHT - 5);
        this.container.add(divider);

        // --- SCROLLABLE CONTENT ---
        this.contentContainer = scene.add.container(0, this.FIXED_HEIGHT);
        this.container.add(this.contentContainer);

        // Mask for Scrollable Area
        this.maskGraphics = scene.make.graphics({});
        this.contentMask = this.maskGraphics.createGeometryMask();
        this.contentContainer.setMask(this.contentMask);

        const descStyle = { fontSize: '14px', color: '#dddddd', wordWrap: { width: width - 20 } };

        this.descText = scene.add.text(10, 0, '', descStyle);
        this.contentContainer.add(this.descText);

        this.planDetailsText = scene.add.text(10, 50, '', {
            fontSize: '14px',
            color: '#ffff00',
            fontStyle: 'bold',
            wordWrap: { width: width - 20 }
        });
        this.contentContainer.add(this.planDetailsText);

        // Input Handling for Scroll
        const zone = scene.add.zone(0, 0, width, 250).setOrigin(0);
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

        zone.on('wheel', (_u: any, _dx: number, deltaY: number) => {
            this.scroll(-deltaY * 0.5);
        });
    }

    private scroll(dy: number) {
        this.scrollY += dy;

        // Clamp
        // Content Height
        const contentH = this.descText.height + this.planDetailsText.height + 20; // + padding
        const visibleH = 250 - this.FIXED_HEIGHT - 10; // Approx

        if (contentH <= visibleH) {
            this.scrollY = 0;
        } else {
            const minScroll = -(contentH - visibleH);
            if (this.scrollY > 0) this.scrollY = 0;
            if (this.scrollY < minScroll) this.scrollY = minScroll;
        }

        this.contentContainer.y = this.FIXED_HEIGHT + this.scrollY;
    }

    update(engine: GameEngine, selectedRow: number | null, selectedCol: number | null) {
        // ... (Update Logic - mostly same, but need to position planDetailsText relative to descText)

        // Always update Plan Cost
        const currentPlayer = engine.state.getCurrentPlayer();
        const currentGold = currentPlayer.gold;
        const totalCost = engine.calculatePlannedCost();

        this.planText.setText(`Total Plan: ${totalCost} G`);
        this.planText.setColor(totalCost > currentGold ? '#ff0000' : '#88ff88');

        if (selectedRow === null || selectedCol === null) {
            this.coordsText.setText('Pos: --');
            this.typeText.setText('Type: --');
            this.ownerText.setText('Owner: --');
            this.costText.setText('Cost: --');
            this.descText.setText('');
            this.planDetailsText.setText('');
            return;
        }

        const cell = engine.state.getCell(selectedRow, selectedCol);
        if (!cell) return;

        // FIXED ITEMS
        this.coordsText.setText(`Pos: (${selectedRow}, ${selectedCol})`);

        // Type Logic
        let typeStr = cell.type.charAt(0).toUpperCase() + cell.type.slice(1);
        if (cell.building === 'gold_mine') { typeStr = "Gold Mine"; }
        else if (cell.building === 'town') { typeStr = "Town (Village)"; }
        else if (cell.building === 'base') {
            typeStr = "Base";
            if (cell.defenseLevel > 0) typeStr += `\nDef Lvl: ${cell.defenseLevel}`;
            if (cell.incomeLevel > 0) typeStr += `\nInc Lvl: ${cell.incomeLevel}`;
        }
        this.typeText.setText(`Type: ${typeStr}`);

        // Owner Logic
        const owner = cell.owner ? (cell.owner === 'P1' ? 'Player 1' : 'Player 2') : 'Neutral';
        let ownerDisplay = `Owner: ${owner}`;
        if (cell.owner && !cell.isConnected) ownerDisplay += '\n(Disconnected: 50% Revenue)';
        this.ownerText.setText(ownerDisplay);
        this.ownerText.setColor(cell.owner === 'P1' ? '#ff4444' : (cell.owner === 'P2' ? '#4444ff' : '#ffffff'));

        // Cost Logic
        const costDetails = engine.getCostDetails(selectedRow, selectedCol);
        let costStr = `${costDetails.cost}G`;
        if (costDetails.cost === Infinity) costStr = 'X';
        if (costDetails.breakdown) costStr += `\n(${costDetails.breakdown})`;
        this.costText.setText(`Cost: ${costStr}`);


        // SCROLLABLE ITEMS
        // Description Logic
        let desc = GameConfig.TERRAIN_DESCRIPTIONS[cell.type.toUpperCase() as keyof typeof GameConfig.TERRAIN_DESCRIPTIONS];
        let revenueMsg = "";

        // ... (Same Description Generation Logic as before) ...
        // Re-implementing concisely:
        if (cell.building === 'gold_mine') {
            desc = "Gold Mine: Generates +5 Gold/turn. Can deplete.";
            revenueMsg = "\nRevenue: +5 G";
        } else if (cell.building === 'town') {
            desc = `Town: Generates +${cell.townIncome} G/turn.\nGrows over time (Inc: +${GameConfig.TOWN_INCOME_GROWTH} every ${GameConfig.TOWN_GROWTH_INTERVAL} turns).`;
            revenueMsg = `\nRevenue: +${cell.townIncome} G`;
        } else if (cell.building === 'base') {
            desc = "Main Base: Generates gold and projects power.";
            let incomeBonus = 0;
            if (cell.incomeLevel > 0) {
                for (let i = 1; i <= cell.incomeLevel; i++) incomeBonus += GameConfig.UPGRADE_INCOME_BONUS[i - 1];
            }
            revenueMsg = `\nRevenue: +${GameConfig.GOLD_PER_TURN_BASE + incomeBonus} G`;
            if (cell.defenseLevel > 0) desc += `\nDefense Lvl ${cell.defenseLevel}: Enemy Cost +${cell.defenseLevel * GameConfig.UPGRADE_DEFENSE_BONUS}`;
        } else if (cell.building === 'wall') {
            desc = `Defensive Wall (Lv ${cell.defenseLevel})`;
            desc += `\nEnemy Capture Cost +${cell.defenseLevel * GameConfig.WALL_DEFENSE_BONUS}`;
            if (cell.watchtowerLevel > 0) {
                desc += `\nWatchtower (Lv ${cell.watchtowerLevel})`;
                desc += `\nRange: ${GameConfig.WATCHTOWER_RANGES[cell.watchtowerLevel]} (Support Fire)`;
            }
            const baseRev = GameConfig.GOLD_PER_LAND;
            if (cell.owner) {
                const actual = cell.isConnected ? baseRev : baseRev * 0.5;
                revenueMsg = `\nRevenue: +${actual} G`;
            }
        } else if (cell.type !== 'bridge') {
            const baseRev = GameConfig.GOLD_PER_LAND;
            if (cell.owner) {
                const actual = cell.isConnected ? baseRev : baseRev * 0.5;
                revenueMsg = `\nRevenue: +${actual} G`;
            } else {
                revenueMsg = `\nPotential: +${baseRev} G`;
            }
        }

        this.descText.setText((desc || '') + revenueMsg);

        // Plan Logic
        const pending = engine.pendingInteractions.find(i => i.r === selectedRow && i.c === selectedCol);
        let planStr = "";
        if (pending) {
            const action = engine.interactionRegistry.get(pending.actionId);
            if (action) {
                let actionDesc = typeof action.description === 'function'
                    ? action.description(engine, selectedRow, selectedCol)
                    : action.description;
                planStr = `PLAN: ${actionDesc}`;
            }
        }
        this.planDetailsText.setText(planStr);

        this.refreshLayout();
    }

    public setPosition(x: number, y: number) {
        this.container.setPosition(x, y);
        // Update mask position logic if needed, but mask is separate graphics object
        // Wait, mask uses world coordinates or relative?
        // createGeometryMask uses the graphics position.
        // We need to update maskGraphics position too.
        // The drawPanel/resize handles mask updates.
    }

    public resize(width: number, height: number, x: number, y: number) {
        this.setPosition(x, y);

        // Update BG
        this.container.each((child: any) => {
            if (child.type === 'Graphics' && child !== this.maskGraphics) { // primitive check
                child.clear();
                this.drawPanel(child, width, height);
            }
        });
        // Actually picking the BG is tricky blindly.
        // Let's rely on drawPanel at index 0.
        const bg = this.container.getAt(0) as Phaser.GameObjects.Graphics;
        if (bg) {
            bg.clear();
            this.drawPanel(bg, width, height);
        }


        // Resize Input Zone
        const zone = this.container.list.find(c => c.type === 'Zone') as Phaser.GameObjects.Zone;
        if (zone) zone.setSize(width, height);

        // Re-calculate wrap widths
        this.descText.setStyle({ wordWrap: { width: width - 20 } });
        this.planDetailsText.setStyle({ wordWrap: { width: width - 20 } });

        this.refreshLayout();
        this.updateMask(width, height, x, y);
    }

    private refreshLayout() {
        // Only refreshes Scrollable Content positions
        this.planDetailsText.setPosition(10, this.descText.height + 10);

        // Reset scroll if needed?
        // Maybe.
    }

    private updateMask(w: number, h: number, x: number, y: number) {
        if (this.maskGraphics) {
            this.maskGraphics.clear();
            this.maskGraphics.fillStyle(0xffffff);
            // Mask only the SCROLLABLE area
            // Start at y + FIXED_HEIGHT
            const visibleH = h - this.FIXED_HEIGHT - 5;
            if (visibleH > 0) {
                this.maskGraphics.fillRect(x, y + this.FIXED_HEIGHT, w * this.container.scaleX, visibleH * this.container.scaleY);
            }
        }
    }

    private drawPanel(graphics: Phaser.GameObjects.Graphics, width: number, height: number) {
        const radius = 16;
        const color = 0x1a1a1a;
        const alpha = 0.85;
        const strokeColor = 0xffffff;
        const strokeAlpha = 0.1;

        graphics.fillStyle(color, alpha);
        graphics.fillRoundedRect(0, 0, width, height, radius);

        graphics.lineStyle(2, strokeColor, strokeAlpha);
        graphics.strokeRoundedRect(0, 0, width, height, radius);

        // Highlight
        graphics.lineStyle(1, 0xffffff, 0.15);
        graphics.beginPath();
        graphics.moveTo(radius, 0);
        graphics.lineTo(width - radius, 0);
        graphics.strokePath();
    }

    public setScale(scale: number) {
        this.container.setScale(scale);
    }
}
