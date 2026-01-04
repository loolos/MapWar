import { Jimp } from 'jimp';

async function generateAssets() {
    // Generate Coin: 32x32 transparent
    const coin = new Jimp({ width: 32, height: 32, color: 0x00000000 });

    // Draw Yellow Circle
    // Jimp doesn't have a simple 'fillCircle' in base? We can iterate.
    const cx = 16, cy = 16, r = 14;
    for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            if (dist < r) {
                // Gold color with some shading?
                const color = (dist < r - 2) ? 0xFFD700FF : 0xDAA520FF; // Gold vs Darker Gold border
                coin.setPixelColor(color, x, y);
            }
        }
    }
    await coin.write('public/assets/coin.png');
    console.log('Generated coin.png');

    // Generate Button: 200x60 transparent
    const btnW = 200, btnH = 60;
    const btn = new Jimp({ width: btnW, height: btnH, color: 0x00000000 });

    // Draw rounded rect (stone grey)
    const margin = 2;
    for (let y = 0; y < btnH; y++) {
        for (let x = 0; x < btnW; x++) {
            // Simple logic for a filled box with border
            if (x >= margin && x < btnW - margin && y >= margin && y < btnH - margin) {
                // Main body
                btn.setPixelColor(0x888888FF, x, y);
            } else if (x >= 0 && x < btnW && y >= 0 && y < btnH) {
                // Border
                btn.setPixelColor(0x555555FF, x, y);
            }
        }
    }
    await btn.write('public/assets/ui_button.png');
    console.log('Generated ui_button.png');
}

generateAssets().catch(console.error);
