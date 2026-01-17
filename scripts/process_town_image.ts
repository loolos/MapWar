
import { Jimp } from "jimp";
import path from "path";

async function processImage() {
    const inputPath = String.raw`C:\Users\loolo\.gemini\antigravity\brain\66b2646f-23da-4537-8b18-0779a1d108a8\town_level_3_raw_1768675387286.png`;
    const outputPath = path.resolve("public/assets/town_level_3.png");

    try {
        const image = await Jimp.read(inputPath);

        // Resize if needed
        if (image.bitmap.width !== 64 || image.bitmap.height !== 64) {
            console.log(`Resizing from ${image.bitmap.width}x${image.bitmap.height} to 64x64`);
            image.resize({ w: 64, h: 64 });
        }

        // Color replacement: Black to Transparent
        image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, idx) => {
            const r = image.bitmap.data[idx + 0];
            const g = image.bitmap.data[idx + 1];
            const b = image.bitmap.data[idx + 2];

            // Tolerance for black
            if (r < 15 && g < 15 && b < 15) {
                image.bitmap.data[idx + 3] = 0; // Alpha
            }
        });

        await image.write(outputPath);
        console.log(`Processed image saved to ${outputPath}`);

    } catch (err) {
        console.error("Error processing image:", err);
        process.exit(1);
    }
}

processImage();
