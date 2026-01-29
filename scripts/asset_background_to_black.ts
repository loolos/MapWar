/**
 * Asset background to pure black
 *
 * For 64x64 game sprites (e.g. lighthouse.png) that use a non-pure-black
 * background, this script detects the content edge and sets all pixels
 * *outside* that edge to pure black (#000000). The result can then be
 * keyed to transparent in the game (e.g. "pure black = transparent").
 *
 * Usage:
 *   npx tsx scripts/asset_background_to_black.ts [path...]
 *   npx tsx scripts/asset_background_to_black.ts public/assets/lighthouse.png
 *   npx tsx scripts/asset_background_to_black.ts public/assets/*.png
 *
 * If no path is given, processes public/assets/lighthouse.png.
 * Output: overwrites the file in place (use backup if needed).
 * Non-64x64 images are resized to 64x64; prefer 64x64 input to avoid quality loss.
 */

import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const { Jimp } = require('jimp');

const SIZE = 64;
const ALPHA_CONTENT_THRESHOLD = 32; // Pixels with alpha above this are "content"
const CORNER_COLOR_TOLERANCE = 45; // RGB distance to consider same as corner background
const CORNER_SAMPLES = [
    [0, 0],
    [0, SIZE - 1],
    [SIZE - 1, 0],
    [SIZE - 1, SIZE - 1],
] as const;

function rgbDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/**
 * Decide if image has meaningful alpha (not all 255).
 */
function hasMeaningfulAlpha(image: Jimp): boolean {
    let minAlpha = 255;
    const w = image.bitmap.width;
    const h = image.bitmap.height;
    image.scan(0, 0, w, h, (x, y, idx) => {
        const a = image.bitmap.data[idx + 3];
        if (a < minAlpha) minAlpha = a;
    });
    return minAlpha < 250;
}

/**
 * Build content mask: true = content, false = background (to be set black).
 * Strategy 1: If image has transparency, content = alpha > threshold.
 * Strategy 2: Else assume corners are background; content = pixels not matching corner color.
 */
function buildContentMask(image: Jimp): boolean[][] {
    const w = image.bitmap.width;
    const h = image.bitmap.height;
    const mask: boolean[][] = Array(h)
        .fill(0)
        .map(() => Array(w).fill(false));

    const useAlpha = hasMeaningfulAlpha(image);

    if (useAlpha) {
        image.scan(0, 0, w, h, (x, y, idx) => {
            const a = image.bitmap.data[idx + 3];
            mask[y][x] = a > ALPHA_CONTENT_THRESHOLD;
        });
        return mask;
    }

    // Corner-based background
    const corners: { r: number; g: number; b: number }[] = [];
    for (const [cx, cy] of CORNER_SAMPLES) {
        if (cx < w && cy < h) {
            const idx = (cy * w + cx) * 4;
            corners.push({
                r: image.bitmap.data[idx],
                g: image.bitmap.data[idx + 1],
                b: image.bitmap.data[idx + 2],
            });
        }
    }
    const br = Math.round(corners.reduce((s, c) => s + c.r, 0) / corners.length);
    const bg = Math.round(corners.reduce((s, c) => s + c.g, 0) / corners.length);
    const bb = Math.round(corners.reduce((s, c) => s + c.b, 0) / corners.length);

    image.scan(0, 0, w, h, (x, y, idx) => {
        const r = image.bitmap.data[idx];
        const g = image.bitmap.data[idx + 1];
        const b = image.bitmap.data[idx + 2];
        const dist = rgbDistance(r, g, b, br, bg, bb);
        mask[y][x] = dist > CORNER_COLOR_TOLERANCE;
    });

    return mask;
}

/**
 * Dilate content mask by 1 pixel so we don't cut off anti-aliased edges.
 * (Background = false; we dilate "content" so a 1px ring of content stays.)
 */
function dilateMask(mask: boolean[][], w: number, h: number): boolean[][] {
    const out = mask.map((row) => [...row]);
    const dy = [-1, 0, 1];
    const dx = [-1, 0, 1];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (mask[y][x]) continue;
            let hasContentNeighbor = false;
            for (const oy of dy) {
                for (const ox of dx) {
                    const ny = y + oy;
                    const nx = x + ox;
                    if (ny >= 0 && ny < h && nx >= 0 && nx < w && mask[ny][nx]) {
                        hasContentNeighbor = true;
                        break;
                    }
                }
                if (hasContentNeighbor) break;
            }
            if (hasContentNeighbor) out[y][x] = true; // keep as content so we don't blacken anti-alias
        }
    }
    return out;
}

async function processFile(filePath: string): Promise<void> {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
        console.error('File not found:', resolved);
        return;
    }

    const image = await Jimp.read(resolved);
    const w = image.bitmap.width;
    const h = image.bitmap.height;

    if (w !== SIZE || h !== SIZE) {
        console.warn(`Resizing ${resolved} from ${w}x${h} to ${SIZE}x${SIZE}`);
        image.resize({ w: SIZE, h: SIZE });
    }

    const mask = buildContentMask(image);
    const maskDilated = dilateMask(mask, SIZE, SIZE);

    image.scan(0, 0, SIZE, SIZE, (x, y, idx) => {
        if (maskDilated[y][x]) return;
        image.bitmap.data[idx] = 0;
        image.bitmap.data[idx + 1] = 0;
        image.bitmap.data[idx + 2] = 0;
        image.bitmap.data[idx + 3] = 255; // opaque black for keying
    });

    const buffer = await image.getBuffer('image/png');
    fs.writeFileSync(resolved, buffer);
    console.log('Written:', resolved);
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const files =
        args.length > 0
            ? args
            : [path.join(process.cwd(), 'public', 'assets', 'lighthouse.png')];

    for (const f of files) {
        try {
            await processFile(f);
        } catch (e: unknown) {
            const err = e instanceof Error ? e.message : String(e);
            console.error('Error processing', f, err);
        }
    }
}

main();
