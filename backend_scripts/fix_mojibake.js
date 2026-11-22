const fs = require('fs');
const path = require('path');

const root = 'C:\\Users\\Usuario\\OneDrive\\Documentos\\CERVEZASFINAS';

const replacements = [
    // General Mojibake
    { from: /â Œ/g, to: '❌' },
    { from: /âš /g, to: '⚠️' },
    { from: /â€”/g, to: '—' },
    { from: /âœ”/g, to: '✓' },
    { from: /â†’/g, to: '→' },
    { from: /âˆ©/g, to: '∩' },

    // Accents / Latin1 -> UTF8
    { from: /Ã ndice/g, to: 'Índice' },
    { from: /Ã ndices/g, to: 'Índices' },
    { from: /Ãšltima/g, to: 'Última' },
    { from: /Ãšltimos/g, to: 'Últimos' },
    { from: /Ãšltimo/g, to: 'Último' },
    { from: /Ã‰xito/g, to: 'Éxito' },
    { from: /SÃ /g, to: 'SÍ' }, // careful with spaces?
    { from: /IMÃ GENES/g, to: 'IMÁGENES' },
    { from: /APORTACIÃ“N/g, to: 'APORTACIÓN' },
    { from: /DÃ a/g, to: 'Día' },
    { from: /Ã—/g, to: '×' },
    { from: /Ã conos/g, to: 'Íconos' },
    { from: /ÃšNICA/g, to: 'ÚNICA' },
    { from: /SÃ³lida/g, to: 'Sólida' },

    // Map specific
    { from: / Â· /g, to: ' · ' },
    { from: /âš ï¸ /g, to: '⚠️' }
];

const filesToScan = [
    'src/pages/AdminSalesImportPage.jsx',
    'src/pages/autoventa/AutoventaGeneralDashboard.jsx',
    'src/pages/SupervisorDashboard.jsx',
    'src/components/common/InteractiveMap.jsx',
    'src/pages/SupervisorScorecard.jsx',
    'src/pages/DynamicAdvisorDashboard.jsx',
    'src/pages/DynamicAdvisorClients.jsx',
    'src/pages/autoventa/AutoventaClientsPage.jsx',
    'src/pages/ClientsPage.jsx',
    'src/pages/GerenteClients.jsx',
    'src/pages/GerenteDashboard.jsx',
    'src/pages/SupervisorVisits.jsx',
    'src/pages/AdminClients.jsx'
];

filesToScan.forEach(relPath => {
    const fullPath = path.join(root, relPath);
    if (!fs.existsSync(fullPath)) {
        console.log(`Skipping missing: ${relPath}`);
        return;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    let original = content;

    replacements.forEach(rep => {
        content = content.replace(rep.from, rep.to);
    });

    if (content !== original) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Fixed encoding in: ${relPath}`);
    } else {
        console.log(`No changes needed in: ${relPath}`);
    }
});
