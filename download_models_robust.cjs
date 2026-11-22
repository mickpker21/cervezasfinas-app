
const fs = require('fs');
const https = require('https');
const path = require('path');

const models = [
    { name: 'ssd_mobilenetv1_model-weights_manifest.json', url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/ssd_mobilenetv1_model-weights_manifest.json' },
    { name: 'ssd_mobilenetv1_model-shard1', url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/ssd_mobilenetv1_model-shard1' },
    { name: 'ssd_mobilenetv1_model-shard2', url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/ssd_mobilenetv1_model-shard2' },
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

        const request = https.get(file.url, (response) => {
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
        });

        request.on('error', (err) => {
            fs.unlink(destPath, () => { }); // Delete partial file
            reject(err);
        });

        fileStream.on('error', (err) => {
            fs.unlink(destPath, () => { });
            reject(err);
        });
    });
}

async function downloadAll() {
    for (const model of models) {
        try {
            await downloadFile(model);
        } catch (error) {
            console.error(`❌ Error downloading ${model.name}:`, error.message);
        }
    }
    console.log('All downloads completed.');
}

downloadAll();
