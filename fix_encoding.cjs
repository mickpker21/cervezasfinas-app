const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function (file) {
        file = path.resolve(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('.js') || file.endsWith('.jsx')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = walk('./src');
let fixedCount = 0;

console.log('Scanning ' + files.length + ' files...');

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    content = content.replace(/\u00C3\u00A1/g, 'á');
    content = content.replace(/\u00C3\u00A9/g, 'é');
    content = content.replace(/\u00C3\u00AD/g, 'í');
    content = content.replace(/\u00C3\u00B3/g, 'ó');
    content = content.replace(/\u00C3\u00BA/g, 'ú');
    content = content.replace(/\u00C3\u00B1/g, 'ñ');
    content = content.replace(/\u00C3\u0091/g, 'Ñ');
    content = content.replace(/\u00C2\u00BF/g, '¿');
    content = content.replace(/\u00C2\u00A1/g, '¡');

    // Fix: Ã¢â‚¬Â¦ -> …
    content = content.replace(/Ã¢â‚¬Â¦/g, '…');
    // Fix: â€¦ -> …
    content = content.replace(/â€¦/g, '…');

    if (content !== original) {
        console.log('Fixed:', file);
        fs.writeFileSync(file, content, 'utf8');
        fixedCount++;
    }
});

console.log(`Total files fixed: ${fixedCount}`);
