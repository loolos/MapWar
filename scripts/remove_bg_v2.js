
import Jimp from 'jimp';
import path from 'path';
import fs from 'fs';

async function processImage(filePath) {
    try {
        const image = await Jimp.read(filePath);

        // Scan every pixel
        image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
            const r = this.bitmap.data[idx + 0];
            const g = this.bitmap.data[idx + 1];
            const b = this.bitmap.data[idx + 2];

            // Heuristic for "Background"
            // 1. Pure White / Very White (for the Coin)
            const isWhite = r > 240 && g > 240 && b > 240;

            // 2. Checkerboard Grey/Black (approximate checks)
            // Checkerboard often alternates between e.g. (204, 204, 204) and (255, 255, 255) OR black/dark grey
            // Or just general "greyish"
            const isGrey = Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && r > 50;

            // 3. Black
            const isBlack = r < 40 && g < 40 && b < 40;

            if (isWhite || isBlack) {
                this.bitmap.data[idx + 3] = 0; // Transparent
            }
        });

        await image.writeAsync(filePath);
        console.log(`Processed (Aggressive) ${filePath}`);
    } catch (err) {
        console.error(`Error processing ${filePath}:`, err);
    }
}

const files = process.argv.slice(2);
for (const file of files) {
    if (fs.existsSync(file)) {
        processImage(file);
    } else {
        console.log(`File not found: ${file}`);
    }
}
