
import { describe, it, expect, beforeEach } from 'vitest';

// Mocking the logic intended for MainScene to ensure calculation purity
class ViewportLogic {
    gridWidth: number = 40;
    gridHeight: number = 40;
    viewRow: number = 0;
    viewCol: number = 0;
    visibleRows: number = 10;
    visibleCols: number = 10;
    tileSize: number = 50;

    constructor(w: number, h: number) {
        this.gridWidth = w;
        this.gridHeight = h;
    }

    resize(screenWidth: number, screenHeight: number) {
        this.visibleCols = Math.floor(screenWidth / this.tileSize);
        this.visibleRows = Math.floor(screenHeight / this.tileSize);
        // Clamp if map is smaller, but let's assume map is huge for this test
    }

    pan(dRow: number, dCol: number) {
        this.viewRow += dRow;
        this.viewCol += dCol;

        // Clamp
        const maxRow = Math.max(0, this.gridHeight - this.visibleRows);
        const maxCol = Math.max(0, this.gridWidth - this.visibleCols);

        if (this.viewRow < 0) this.viewRow = 0;
        if (this.viewRow > maxRow) this.viewRow = maxRow;
        if (this.viewCol < 0) this.viewCol = 0;
        if (this.viewCol > maxCol) this.viewCol = maxCol;
    }

    screenToGrid(screenX: number, screenY: number): { r: number, c: number } {
        const c = Math.floor(screenX / this.tileSize) + this.viewCol;
        const r = Math.floor(screenY / this.tileSize) + this.viewRow;
        return { r, c };
    }

    gridToScreen(r: number, c: number): { x: number, y: number } | null {
        // Return null if off screen?
        if (r < this.viewRow || r >= this.viewRow + this.visibleRows) return null;
        if (c < this.viewCol || c >= this.viewCol + this.visibleCols) return null;

        return {
            x: (c - this.viewCol) * this.tileSize,
            y: (r - this.viewRow) * this.tileSize
        };
    }
}

describe('Viewport Logic', () => {
    let vp: ViewportLogic;

    beforeEach(() => {
        vp = new ViewportLogic(40, 40); // 40x40 Map
        vp.visibleRows = 10;
        vp.visibleCols = 10;
        vp.viewRow = 0;
        vp.viewCol = 0;
        vp.tileSize = 50;
    });

    it('Calculates grid coordinates from screen position correctly at origin', () => {
        // Screen (25, 25) -> Tile (0, 0)
        const grid = vp.screenToGrid(25, 25);
        expect(grid).toEqual({ r: 0, c: 0 });
    });

    it('Calculates grid coordinates correctly after panning', () => {
        vp.pan(5, 5); // Scroll to (5, 5)

        // Screen (0, 0) should now be Grid (5, 5)
        const grid = vp.screenToGrid(0, 0);
        expect(grid).toEqual({ r: 5, c: 5 });

        // Screen (50, 50) -> Grid (6, 6)
        const grid2 = vp.screenToGrid(50, 50);
        expect(grid2).toEqual({ r: 6, c: 6 });
    });

    it('Clamps panning at map boundaries', () => {
        vp.pan(-5, -5); // Try scroll past top-left
        expect(vp.viewRow).toBe(0);
        expect(vp.viewCol).toBe(0);

        vp.pan(100, 100); // Try scroll past bottom-right
        // Max Row = 40 - 10 = 30
        expect(vp.viewRow).toBe(30);
        expect(vp.viewCol).toBe(30);
    });

    it('Determines screen position for rendering', () => {
        vp.pan(5, 5);
        // Grid (5,5) should be at Screen (0,0)
        const screen = vp.gridToScreen(5, 5);
        expect(screen).toEqual({ x: 0, y: 0 });

        // Grid (4,4) is hidden (null)
        const hidden = vp.gridToScreen(4, 4);
        expect(hidden).toBeNull();
    });
});
