
import { Jimp } from 'jimp';
import path from 'path';

async function removeBackground(filename: string) {
    try {
        const filePath = path.resolve('public/assets', filename);
        console.log(`Processing ${filename}...`);
        const image = await Jimp.read(filePath);

        const w = image.bitmap.width;
        const h = image.bitmap.height;

        // Target Color: Black (0,0,0)
        const targetColor = { r: 0, g: 0, b: 0 };

        // Tolerance for compression artifacts (close to black)
        // 20 should be enough to catch dark grey noise but keep character outlines
        const TOLERANCE = 20;

        // Helper to get color distance
        function colorDist(r: number, g: number, b: number, t: { r: number, g: number, b: number }) {
            // Euclidean distance
            return Math.sqrt(
                Math.pow(r - t.r, 2) +
                Math.pow(g - t.g, 2) +
                Math.pow(b - t.b, 2)
            );
        }

        const visited = new Uint8Array(w * h);
        const queue: { x: number, y: number }[] = [];

        // Seed entire border
        // We assume the background touches the border at all points
        for (let x = 0; x < w; x++) { queue.push({ x, y: 0 }); queue.push({ x, y: h - 1 }); }
        for (let y = 0; y < h; y++) { queue.push({ x: 0, y }); queue.push({ x: w - 1, y }); }

        let cleared = 0;

        while (queue.length > 0) {
            const { x, y } = queue.shift()!;

            // Bounds check
            if (x < 0 || x >= w || y < 0 || y >= h) continue;

            const idx = y * w + x;
            if (visited[idx]) continue;
            visited[idx] = 1;

            const idx4 = idx * 4;
            const r = image.bitmap.data[idx4];
            const g = image.bitmap.data[idx4 + 1];
            const b = image.bitmap.data[idx4 + 2];

            // Check if pixel is "black enough"
            if (colorDist(r, g, b, targetColor) <= TOLERANCE) {
                // Clear it
                image.bitmap.data[idx4 + 3] = 0; // Alpha 0
                cleared++;

                // Add neighbors
                queue.push({ x: x - 1, y });
                queue.push({ x: x + 1, y });
                queue.push({ x, y: y - 1 });
                queue.push({ x, y: y + 1 });
            }
        }

        console.log(`Cleared ${cleared} pixels (${(cleared / (w * h) * 100).toFixed(1)}%).`);
        await image.write(filePath);
        console.log(`Saved ${filename}`);

    } catch (err) {
        console.error(`Error processing ${filename}:`, err);
    }
}

async function run() {
    // Process the 3 new assets
    await removeBackground('cartoon_human.png');
    await removeBackground('cartoon_robot.png');
    await removeBackground('icon_gold.png');
}

run();
