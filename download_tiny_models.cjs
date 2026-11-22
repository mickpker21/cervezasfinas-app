
const fs = require('fs');
const https = require('https');
const path = require('path');

const models = [
    { name: 'tiny_face_detector_model-weights_manifest.json', url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/tiny_face_detector_model-weights_manifest.json' },
    { name: 'tiny_face_detector_model-shard1', url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/tiny_face_detector_model-shard1' }
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
            response.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
                console.log(`✅ Finished ${file.name}`);
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => { });
            reject(err);
        });
    });
}

(async () => {
    for (const model of models) {
        await downloadFile(model);
    }
})();
