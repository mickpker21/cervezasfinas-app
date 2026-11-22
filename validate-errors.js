#!/usr/bin/env node
// Script para detectar errores potenciales de null/undefined en el código

const fs = require('fs');
const path = require('path');

// Patrones peligrosos a buscar
const dangerousPatterns = [
    {
        name: 'Object.entries sin validación',
        pattern: /Object\.(entries|keys|values)\s*\(\s*([^)]+?)\s*\)/g,
        check: (match, code) => {
            const varName = match[2];
            const lines = code.split('\n');
            const lineIndex = code.substring(0, match.index).split('\n').length - 1;
            const context = lines.slice(Math.max(0, lineIndex - 2), lineIndex + 1).join('\n');

            // Buscar validaciones cercanas
            const hasCheck = context.includes(`${varName} &&`) ||
                context.includes(`${varName}?.`) ||
                context.includes(`${varName} ||`) ||
                context.includes(`if (${varName})`);

            return !hasCheck;
        }
    },
    {
        name: '.map()/.filter() sin validación de array',
        pattern: /(\w+)\.(?:map|filter|reduce|forEach)\s*\(/g,
        check: (match, code) => {
            const varName = match[1];
            if (varName === 'Array' || varName === 'Object') return false;

            const lines = code.split('\n');
            const lineIndex = code.substring(0, match.index).split('\n').length - 1;
            const context = lines.slice(Math.max(0, lineIndex - 3), lineIndex + 1).join('\n');

            const hasArrayCheck = context.includes(`${varName} || []`) ||
                context.includes(`Array.isArray(${varName})`) ||
                context.includes(`${varName}?.map`) ||
                context.includes(`(${varName} || [])`) ||
                context.includes(`${varName} = [];`);

            return !hasArrayCheck;
        }
    },
    {
        name: 'useState sin valor inicial',
        pattern: /useState\s*\(\s*\)/g,
        check: () => true
    }
];

function scanFile(filePath) {
    const code = fs.readFileSync(filePath, 'utf-8');
    const issues = [];

    dangerousPatterns.forEach(({ name, pattern, check }) => {
        let match;
        pattern.lastIndex = 0;

        while ((match = pattern.exec(code)) !== null) {
            if (check(match, code)) {
                const lineNumber = code.substring(0, match.index).split('\n').length;
                const line = code.split('\n')[lineNumber - 1];

                issues.push({
                    file: filePath,
                    line: lineNumber,
                    type: name,
                    code: line.trim(),
                    matched: match[0]
                });
            }
        }
    });

    return issues;
}

function scanDirectory(dir, extensions = ['.jsx', '.js']) {
    const allIssues = [];

    function walk(currentPath) {
        const items = fs.readdirSync(currentPath);

        items.forEach(item => {
            const fullPath = path.join(currentPath, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
                walk(fullPath);
            } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
                const issues = scanFile(fullPath);
                allIssues.push(...issues);
            }
        });
    }

    walk(dir);
    return allIssues;
}

// Ejecutar escaneo
const srcDir = path.join(__dirname, 'src');
console.log('🔍 Escaneando código en busca de errores potenciales...\n');

const issues = scanDirectory(srcDir);

if (issues.length === 0) {
    console.log('✅ No se encontraron problemas potenciales');
} else {
    console.log(`⚠️  Se encontraron ${issues.length} problemas potenciales:\n`);

    // Agrupar por archivo
    const byFile = issues.reduce((acc, issue) => {
        if (!acc[issue.file]) acc[issue.file] = [];
        acc[issue.file].push(issue);
        return {};
    }, {});

    Object.entries(byFile).forEach(([file, fileIssues]) => {
        console.log(`📄 ${path.relative(srcDir, file)}`);
        fileIssues.forEach(issue => {
            console.log(`   Línea ${issue.line}: ${issue.type}`);
            console.log(`   ${issue.code}`);
            console.log('');
        });
    });
}

process.exit(issues.length);
