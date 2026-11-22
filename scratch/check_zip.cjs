const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

try {
  console.log('Inspeccionando ota-update.zip...');
  const zipPath = path.join(__dirname, '..', 'ota-update.zip');
  
  if (!fs.existsSync(zipPath)) {
    console.error('El archivo ota-update.zip no existe en el root del proyecto.');
    process.exit(1);
  }

  // Usar PowerShell para ver los primeros 20 archivos del zip
  const listCmd = `powershell -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem') ; $zip = [System.IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/\\/g, '\\\\')}') ; $zip.Entries | select -First 20 | foreach { $_.FullName }"`;
  console.log('Ejecutando script de powershell...');
  const result = execSync(listCmd, { encoding: 'utf8' });
  console.log('Primeros 20 archivos del ZIP:');
  console.log(result);

  // Ver si index.html está en la raíz
  const checkIndexCmd = `powershell -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem') ; $zip = [System.IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/\\/g, '\\\\')}') ; $zip.Entries | where { $_.FullName -eq 'index.html' } | select -First 1 | foreach { $_.FullName }"`;
  const indexResult = execSync(checkIndexCmd, { encoding: 'utf8' }).trim();
  if (indexResult === 'index.html') {
    console.log('✅ Éxito: index.html está en la RAÍZ del zip.');
  } else {
    console.log('❌ Error: index.html NO está en la raíz del zip. Ubicación encontrada:', indexResult || 'Ninguna');
  }

} catch (err) {
  console.error('Error inspeccionando el zip:', err.message);
}
