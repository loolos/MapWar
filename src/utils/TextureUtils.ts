
import Phaser from 'phaser';

export class TextureUtils {
    /**
     * Creates a new texture from a source texture by making a specific color transparent.
     * @param scene The Phaser Scene.
     * @param sourceKey The key of the source image (must be loaded).
     * @param newKey The key for the new, transparent texture.
     * @param info Configuration for transparency.
     */
    static makeTransparent(scene: Phaser.Scene, sourceKey: string, newKey: string, threshold = 30) {
        if (!scene.textures.exists(sourceKey)) {
            console.error(`TextureUtils: Source texture '${sourceKey}' not found.`);
            return;
        }

        const source = scene.textures.get(sourceKey).getSourceImage();
        if (!source) {
            console.error(`TextureUtils: Could not get source image for '${sourceKey}'.`);
            return;
        }

        // Create a Canvas to manipulate pixels
        const canvas = document.createElement('canvas');
        const width = source.width as number;
        const height = source.height as number;
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Draw source image
        ctx.drawImage(source as CanvasImageSource, 0, 0);

        // Get Pixel Data
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Check if pixel matches "Black" (or dark background)
            // We assume the background is solid black or very dark.
            if (r < threshold && g < threshold && b < threshold) {
                data[i + 3] = 0; // Set Alpha to 0
            }
        }

        // Put modified data back
        ctx.putImageData(imageData, 0, 0);

        // Register as new Texture
        scene.textures.addCanvas(newKey, canvas);

    }
}
