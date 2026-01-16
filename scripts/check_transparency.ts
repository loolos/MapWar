
import { Jimp } from 'jimp';
import path from 'path';

async function checkTransparency(filename: string) {
    try {
        const filePath = path.resolve('public/assets', filename);
        console.log(`Reading ${filePath} ...`);
        const image = await Jimp.read(filePath);

        console.log(`Checking ${filename}... Size: ${image.bitmap.width}x${image.bitmap.height}`);

        // Check Top-Left Corner
        const idx0 = 0;
        const r0 = image.bitmap.data[idx0];
        const g0 = image.bitmap.data[idx0 + 1];
        const b0 = image.bitmap.data[idx0 + 2];
        const a0 = image.bitmap.data[idx0 + 3];
        console.log(`Top-Left Pixel: RGBA(${r0}, ${g0}, ${b0}, ${a0}) HEX: ${Jimp.rgbaToInt(r0, g0, b0, a0).toString(16)}`);

        // Check (16,0) - likely next checker tile?
        // Checkerboard usually has a size. E.g. 16x16 or 20x20.
        const x1 = 20;
        const idx1 = (x1) * 4;
        const r1 = image.bitmap.data[idx1];
        const g1 = image.bitmap.data[idx1 + 1];
        const b1 = image.bitmap.data[idx1 + 2];
        const a1 = image.bitmap.data[idx1 + 3];
        console.log(`Pixel(${x1},0): RGBA(${r1}, ${g1}, ${b1}, ${a1}) HEX: ${Jimp.rgbaToInt(r1, g1, b1, a1).toString(16)}`);

    } catch (err) {
        console.error(`Error reading ${filename}:`, err);
    }
}

async function run() {
    await checkTransparency('cartoon_human.png');
}

run();
