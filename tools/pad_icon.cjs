const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');

async function padIcon() {
    try {
        const iconPath = path.join(__dirname, '../assets/icon.png');

        // Read the original icon
        const original = await Jimp.read(iconPath);

        // We want a safe zone. Android adaptive icon safe zone is 66% of the 1024x1024.
        // So if the canvas is 1024x1024, the icon should be roughly 680x680.
        const canvasSize = 1024;
        const padding = 200; // Let's scale the icon down and pad
        const scaledSize = canvasSize - (padding * 2);

        // Scale the original logo
        original.contain(scaledSize, scaledSize, Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_MIDDLE);

        // Create a new pure transparent image (or solid dark color: '#03060C')
        // Let's use solid dark color #03060C for Android background?
        // Actually, capacitor-assets handles icon-foreground.png and icon-background.png in Android
        const bg = new Jimp(canvasSize, canvasSize, '#03060C');

        // Composite
        bg.composite(original, padding, padding);

        // Write out the new padded icon
        const outPath = path.join(__dirname, '../assets/icon-foreground.png');
        await bg.writeAsync(outPath);
        console.log('Successfully padded icon foreground to:', outPath);

        // Create a background icon as well
        const bgOnly = new Jimp(canvasSize, canvasSize, '#03060C');
        await bgOnly.writeAsync(path.join(__dirname, '../assets/icon-background.png'));
        console.log('Successfully created icon background');

        // Create a generic padded icon for iOS too, iOS doesn't do transparent masks, it rounds corners
        // so a dark bg is good.
        await bg.writeAsync(path.join(__dirname, '../assets/icon.png'));
        console.log('Overwrote assets/icon.png with padded version for iOS');

    } catch (err) {
        console.error('Error padding icon:', err);
    }
}

padIcon();
