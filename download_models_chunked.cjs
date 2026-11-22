
const fs = require('fs');
const https = require('https');
const path = require('path');
const { URL } = require('url');

const models = [
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

// Helper to download a specific range
function downloadRange(url, start, end) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'Range': `bytes=${start}-${end}`
            }
        };

        https.get(url, options, (res) => {
            if (res.statusCode === 206 || res.statusCode === 200) {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks)));
                res.on('error', reject);
            } else if (res.statusCode === 416) {
                // Range not satisfiable - effectively means we are done if we were guessing content length
                resolve(null);
            } else {
                reject(new Error(`Status ${res.statusCode}`));
            }
        }).on('error', reject);
    });
}

async function downloadFileChunked(file) {
    const destPath = path.join(targetDir, file.name);
    console.log(`Downloading ${file.name} in chunks...`);

    // Create/Clear file
    fs.writeFileSync(destPath, Buffer.alloc(0));

    let offset = 0;
    const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

    // For small files, just do normal download, but for safety lets try range for everything or just fallback
    // Actually, GitHub raw supports ranges. 

    let keepDownloading = true;

    while (keepDownloading) {
        const end = offset + CHUNK_SIZE - 1;
        try {
            const buffer = await downloadRange(file.url, offset, end);

            if (!buffer || buffer.length === 0) {
                keepDownloading = false;
            } else {
                fs.appendFileSync(destPath, buffer);
                process.stdout.write(`.`); // Progress indicator

                offset += buffer.length;

                // If we got less than requested, it's the end
                if (buffer.length < CHUNK_SIZE) {
                    keepDownloading = false;
                }
            }
        } catch (e) {
            console.error(`\nError fetching chunk ${offset}-${end}:`, e.message);
            // If it's a small file and range isn't supported, it might return 200 with full content.
            // If we got full content in first chunk (and it's small), we are good.
            // But if we get 200 for a subsequent chunk, that's bad (it means it sent the whole file again).
            // We'll hope GitHub handles ranges correctly (it does).
            throw e;
        }
    }

    console.log(`\n✅ Finished ${file.name}. Total size: ${fs.statSync(destPath).size} bytes`);
}

async function run() {
    for (const model of models) {
        // Delete first to ensure clean slate
        if (fs.existsSync(path.join(targetDir, model.name))) {
            fs.unlinkSync(path.join(targetDir, model.name));
        }
        await downloadFileChunked(model);
    }
    console.log("All downloads completed.");
}

run();
