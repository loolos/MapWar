
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Jimp = require("jimp");
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

            // Strict Black Removal
            // The generated images should be on pure black or very dark background
            const isBlack = r < 40 && g < 40 && b < 40;

            if (isBlack) {
                this.bitmap.data[idx + 3] = 0; // Transparent
            }
        });

        await image.writeAsync(filePath);
        console.log(`Processed (Black Removal) ${filePath}`);
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
