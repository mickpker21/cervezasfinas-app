
const fs = require('fs');
const https = require('https');
const path = require('path');

const models = [
    'ssd_mobilenetv1_model-weights_manifest.json',
    'ssd_mobilenetv1_model-shard1',
    'face_landmark_68_model-weights_manifest.json',
    'face_landmark_68_model-shard1',
    'face_recognition_model-weights_manifest.json',
    'face_recognition_model-shard1',
    'face_recognition_model-shard2'
];

const baseUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';
const targetDir = path.join(__dirname, 'public', 'models');

if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

models.forEach(file => {
    const url = baseUrl + file;
    const dest = path.join(targetDir, file);

    console.log(`Downloading ${file}...`);

    https.get(url, (res) => {
        if (res.statusCode !== 200) {
            console.error(`Failed to download ${file}: ${res.statusCode}`);
            return;
        }
        res.pipe(fs.createWriteStream(dest));
    }).on('error', (e) => {
        console.error(`Error downloading ${file}: ${e.message}`);
    });
});
