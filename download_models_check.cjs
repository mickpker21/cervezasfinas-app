
const fs = require('fs');
const https = require('https');
const path = require('path');

const models = [
    // Only the large ones need careful handling, but let's do all for consistency
    { name: 'ssd_mobilenetv1_model-weights_manifest.json', url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/ssd_mobilenetv1_model-weights_manifest.json' },
    { name: 'ssd_mobilenetv1_model-shard1', url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/ssd_mobilenetv1_model-shard1' },
    { name: 'face_landmark_68_model-weights_manifest.json', url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-weights_manifest.json' },
    { name: 'face_landmark_68_model-shard1', url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-shard1' },
    { name: 'face_recognition_model-weights_manifest.json', url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-weights_manifest.json' },
    { name: 'face_recognition_model-shard1', url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-shard1' },
    { name: 'face_recognition_model-shard2', url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-shard2' }
];

const targetDir = path.join(__dirname, 'public', 'models');

if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

async function downloadFile(file) {
    return new Promise((resolve, reject) => {
        const destPath = path.join(targetDir, file.name);
        const fileStream = fs.createWriteStream(destPath);

        console.log(`Downloading ${file.name}...`);

        https.get(file.url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${file.name}: Status Code ${response.statusCode}`));
                return;
            }

            // Verify content length if available
            const len = parseInt(response.headers['content-length'], 10);
            let downloaded = 0;

            response.on('data', (chunk) => {
                fileStream.write(chunk);
                downloaded += chunk.length;
            });

            response.on('end', () => {
                fileStream.end();
                console.log(`✅ Finished ${file.name}. Size: ${downloaded} bytes` + (len ? ` / ${len}` : ''));
                if (len && downloaded < len) {
                    console.error(`⚠️ WARNING: ${file.name} is incomplete!`);
                }
                resolve();
            });

            response.on('error', (err) => {
                fileStream.close();
                fs.unlink(destPath, () => { });
                reject(err);
            });
        }).on('error', (err) => {
            fileStream.close();
            fs.unlink(destPath, () => { });
            reject(err);
        });
    });
}

// Just checking if we can use a simpler approach first: maybe the previous script just timed out or something? 
// No, exactly 4194304 bytes suggests a buffer limit or similar. 
// Standard https.get streams, so it shouldn't hit a buffer limit unless explicitly buffered.
// However, maybe the environment has some specific restriction.
// Let's try downloading with a different library or method if possible, but Node is all we have.
// Actually, I'll try to just delete the existing files first to be sure we aren't appending or anything weird.

async function cleanAndDownload() {
    // Delete existing
    for (const model of models) {
        const p = path.join(targetDir, model.name);
        if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    // Download sequentially
    for (const model of models) {
        try {
            await downloadFile(model);
        } catch (error) {
            console.error(`❌ Error downloading ${model.name}:`, error.message);
        }
    }
}

cleanAndDownload();
