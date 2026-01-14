import Phaser from 'phaser';
import { GameEngine } from '../core/GameEngine';
import { AuraSystem } from '../core/AuraSystem';

export class AuraVisualizer {
    private scene: Phaser.Scene;
    private mapContainer: Phaser.GameObjects.Container;
    private highlightGraphics: Phaser.GameObjects.Graphics;

    // Store dynamically created objects (e.g. Shield Icons) to clear them later
    private dynamicObjects: Phaser.GameObjects.GameObject[] = [];
    private tileSize: number;

    constructor(scene: Phaser.Scene, mapContainer: Phaser.GameObjects.Container, highlightGraphics: Phaser.GameObjects.Graphics, tileSize: number) {
        this.scene = scene;
        this.mapContainer = mapContainer;
        this.highlightGraphics = highlightGraphics;
        this.tileSize = tileSize;
    }

    /**
     * Clears all aura visualizations (graphics and dynamic objects).
     */
    public clear() {
        this.highlightGraphics.clear();
        this.dynamicObjects.forEach(obj => obj.destroy());
        this.dynamicObjects = [];
    }

    /**
     * Main update loop for Aura Visualization.
     * Determines what to draw based on the selected tile.
     */
    public update(engine: GameEngine, selectedRow: number | null, selectedCol: number | null) {
        this.clear();

        if (selectedRow === null || selectedCol === null) return;

        const grid = engine.state.grid;
        // Safety check boundaries
        if (selectedRow < 0 || selectedRow >= grid.length || selectedCol < 0 || selectedCol >= grid[0].length) return;

        const cell = grid[selectedRow][selectedCol];

        // 1. Support Aura (Cyan): from Watchtowers / Bases
        // Shows RANGE where they provide support.
        const supportRange = AuraSystem.getAuraRange(cell);
        if (supportRange > 0) {
            this.drawSupportAura(engine, selectedRow, selectedCol, supportRange);
        }

        // 2. Income Aura (Orange): from Bases
        // Shows RANGE where they boost income.
        const incomeRange = AuraSystem.getIncomeAuraRange(cell);
        if (incomeRange > 0) {
            this.drawIncomeAura(engine, selectedRow, selectedCol, incomeRange);
        }

        // 3. Wall Defense Aura (Shield Icons)
        // Shows SHIELDS on neighbors that are protected by this Wall.
        if (cell.building === 'wall' && cell.isConnected && cell.owner) {
            this.drawDefenseAura(engine, selectedRow, selectedCol, cell.owner);
        }

        // 4. Base Defense Aura (Shield Icons)
        // Shows SHIELDS on friends in range.
        if (cell.building === 'base' && cell.isConnected && cell.owner) {
            this.drawBaseDefenseAura(engine, selectedRow, selectedCol, cell);
        }
    }

    private drawSupportAura(engine: GameEngine, centerR: number, centerC: number, range: number) {
        const color = 0x00FFFF; // Cyan
        this.highlightGraphics.lineStyle(2, color, 0.6);
        this.highlightGraphics.fillStyle(color, 0.15);

        const totalHeight = engine.state.grid.length;
        const totalWidth = engine.state.grid[0].length;

        for (let r = 0; r < totalHeight; r++) {
            for (let c = 0; c < totalWidth; c++) {
                const dist = Math.abs(r - centerR) + Math.abs(c - centerC);
                if (dist <= range && dist > 0) {
                    const tx = c * this.tileSize;
                    const ty = r * this.tileSize;
                    this.highlightGraphics.strokeRect(tx + 2, ty + 2, this.tileSize - 4, this.tileSize - 4);
                    this.highlightGraphics.fillRect(tx + 2, ty + 2, this.tileSize - 4, this.tileSize - 4);
                }
            }
        }
    }

    private drawIncomeAura(engine: GameEngine, centerR: number, centerC: number, range: number) {
        const color = 0xFF8800; // Orange
        this.highlightGraphics.lineStyle(4, color, 0.8);
        this.highlightGraphics.fillStyle(color, 0.3);

        const totalHeight = engine.state.grid.length;
        const totalWidth = engine.state.grid[0].length;

        for (let r = 0; r < totalHeight; r++) {
            for (let c = 0; c < totalWidth; c++) {
                const dist = Math.abs(r - centerR) + Math.abs(c - centerC);
                if (dist <= range && dist > 0) {
                    const tx = c * this.tileSize;
                    const ty = r * this.tileSize;
                    this.highlightGraphics.strokeRect(tx, ty, this.tileSize, this.tileSize);
                    this.highlightGraphics.fillRect(tx, ty, this.tileSize, this.tileSize);
                }
            }
        }
    }

    private drawDefenseAura(engine: GameEngine, centerR: number, centerC: number, ownerId: string) {
        // Neighbors: Top, Bottom, Left, Right
        const neighbors = [
            { r: centerR - 1, c: centerC },
            { r: centerR + 1, c: centerC },
            { r: centerR, c: centerC - 1 },
            { r: centerR, c: centerC + 1 }
        ];

        const grid = engine.state.grid;

        for (const n of neighbors) {
            // Bounds Check
            if (n.r >= 0 && n.r < grid.length && n.c >= 0 && n.c < grid[0].length) {
                const neighborCell = grid[n.r][n.c];

                // Check Validation Logic:
                // Is this neighbor actually BENEFITING from the wall?
                // AuraSystem.getDefenseAuraBonus checks if there is ANY adjacent wall.
                // Here we specifically want to highlight neighbors that are protected by *this* wall.
                // The current logic is: ANY neighbor of a friendly wall gets the bonus?
                // AuraSystem logic:
                // "for each neighbor of Target, if neighbor is Wall and Connected and Owner matches..."
                // So YES, inherently any neighbor of this wall is "protected" by this wall.

                // Visual Check: Should we show shield on everything? Or just friendly/empty?
                // Usually Defense Aura helps current owner.
                // If it's an enemy, the wall doesn't help them?
                // AuraSystem.getDefenseAuraBonus takes ownerId as "Defender".
                // So cost matches "cell.owner === ownerId".
                // So if the neighbor cell is NOT owned by the wall owner, it doesn't get the bonus in defense cost?
                // CostSystem: `if (cell.owner) { const bonus = ... }`
                // So the neighbor MUST be owned by the same player to utilize the defense bonus?
                // OR does the wall PROTECT an empty tile making it harder to capture?
                // CostSystem line 223: `if (cell.owner) { ... getDefenseAuraBonus(..., cell.owner) }`
                // This implies ONLY owned tiles benefit.
                // AND `getCostDetails`: `if (cell.owner !== null && cell.owner !== curr) ... isAttack`.

                // SO: We should ONLY draw Shields on pixels that are OWNED by the same player.
                // OR if the user intends to show "Coverage", maybe valid expansion targets?
                // But generally Defense Aura implies "Harder to kill me".

                if (neighborCell.owner === ownerId) {
                    const x = n.c * this.tileSize;
                    const y = n.r * this.tileSize;

                    // Draw Large Shield
                    const shield = this.scene.add.text(x + this.tileSize / 2, y + this.tileSize / 2, '🛡️', {
                        fontSize: '32px', // Large
                        resolution: 2
                    }).setOrigin(0.5);

                    this.mapContainer.add(shield);
                    this.dynamicObjects.push(shield);
                }
            }
        }
    }

    private drawBaseDefenseAura(engine: GameEngine, centerR: number, centerC: number, baseCell: any) {
        // Base Range Logic (Same as Support)
        const range = AuraSystem.getAuraRange(baseCell);
        const ownerId = baseCell.owner;

        const totalHeight = engine.state.grid.length;
        const totalWidth = engine.state.grid[0].length;

        for (let r = 0; r < totalHeight; r++) {
            for (let c = 0; c < totalWidth; c++) {
                const dist = Math.abs(r - centerR) + Math.abs(c - centerC);

                // Check Range
                if (dist <= range && dist > 0) {
                    const targetCell = engine.state.getCell(r, c);

                    // Check Ownership (Must be same owner to benefit from defense)
                    if (targetCell && targetCell.owner === ownerId) {
                        const x = c * this.tileSize;
                        const y = r * this.tileSize;

                        // Draw Large Shield
                        const shield = this.scene.add.text(x + this.tileSize / 2, y + this.tileSize / 2, '🛡️', {
                            fontSize: '32px',
                            resolution: 2
                        }).setOrigin(0.5);

                        this.mapContainer.add(shield);
                        this.dynamicObjects.push(shield);
                    }
                }
            }
        }
    }
}
