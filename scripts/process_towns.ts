
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const JimpModule = require('jimp');

// Handle Named Export
// Consolidate access
const Jimp = JimpModule.Jimp || JimpModule;

import * as path from 'path';
import * as fs from 'fs';

const FILES = [
    'town_level_1.png',
    'town_level_2.png',
    'town_level_3.png'
];

const ASSETS_DIR = path.join(process.cwd(), 'public', 'assets');

async function processImage(filename: string) {
    const filePath = path.join(ASSETS_DIR, filename);
    console.log(`Processing ${filename}...`);

    try {
        const image = await Jimp.read(filePath);

        // RESIZE TO 64x64 using NEAREST NEIGHBOR to preserve pixel art
        console.log(`Resizing from ${image.bitmap.width}x${image.bitmap.height} to 64x64...`);
        try {
            image.resize(64, 64, 'nearestNeighbor');
        } catch (resizeErr) {
            console.error('Resize with nearestNeighbor failed, trying default:', resizeErr);
            image.resize(64, 64);
        }

        let modifiedCount = 0;
        // Remove Black AND White Backgrounds
        image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, idx) => {
            const r = image.bitmap.data[idx + 0];
            const g = image.bitmap.data[idx + 1];
            const b = image.bitmap.data[idx + 2];

            // Black Tolerance
            if (r < 20 && g < 20 && b < 20) {
                image.bitmap.data[idx + 3] = 0; // Transparent
                modifiedCount++;
            }
            // White Tolerance
            else if (r > 230 && g > 230 && b > 230) {
                image.bitmap.data[idx + 3] = 0; // Transparent
                modifiedCount++;
            }
        });

        // Save using buffer (Callback based) with hardcoded MIME
        console.log('Getting buffer for image/png...');
        const buffer = await new Promise<Buffer>((resolve, reject) => {
            image.getBuffer('image/png', (err: any, buf: any) => {
                if (err) {
                    console.error('getBuffer Error:', err);
                    reject(err);
                }
                else resolve(buf);
            });
        });

        console.log(`Buffer retrieved. Size: ${buffer.length}. Writing to ${filePath}...`);
        await fs.promises.writeFile(filePath, buffer);

        console.log(`Saved ${filename}. Modified pixels: ${modifiedCount}`);
    } catch (err) {
        console.error(`Error processing ${filename}:`, err);
    }
}

async function main() {
    for (const file of FILES) {
        await processImage(file);
    }
}

main();
