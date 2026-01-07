
import { Cell } from '../src/core/Cell';
import { MapGenerator, MapType } from '../src/core/map/MapGenerator';

function printMap(grid: Cell[][], title: string) {
    console.log(`\n=== ${title} ===`);
    const height = grid.length;
    const width = height > 0 ? grid[0].length : 0;

    let landCount = 0;
    let waterCount = 0;
    let hillCount = 0;

    for (let r = 0; r < height; r++) {
        let line = '';
        for (let c = 0; c < width; c++) {
            const cell = grid[r][c];
            if (cell.type === 'water') {
                line += '~ ';
                waterCount++;
            } else if (cell.type === 'hill') {
                line += '^ '; // Mountains/Hills
                hillCount++;
                landCount++;
            } else {
                if (cell.building === 'town') line += 'T ';
                else if (cell.building === 'base') line += 'B ';
                else line += '. ';
                landCount++;
            }
        }
        console.log(line);
    }

    const total = width * height;
    console.log(`Stats: Land: ${Math.round(landCount / total * 100)}%, Water: ${Math.round(waterCount / total * 100)}%, Hills: ${Math.round(hillCount / total * 100)}%`);
}

const types: MapType[] = ['default', 'archipelago', 'pangaea', 'mountains', 'rivers'];
const w = 15;
const h = 10;

for (const t of types) {
    const grid: Cell[][] = [];
    // Init grid
    for (let r = 0; r < h; r++) {
        grid[r] = [];
        for (let c = 0; c < w; c++) {
            grid[r][c] = new Cell(r, c);
        }
    }

    MapGenerator.generate(grid, t, w, h);
    printMap(grid, t.toUpperCase());
}
