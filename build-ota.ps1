# =====================================================================
# build-ota.ps1 - Genera el ZIP de actualización OTA OPTIMIZADO
# Solo incluye el código compilado (assets JS/CSS + index.html)
# EXCLUYE: portafolio/, models/, imágenes estáticas pesadas
# Esto reduce el zip de ~145MB a ~8MB
# =====================================================================

param(
    [switch]$SkipBuild,
    [switch]$SkipSync
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host " CERVEZAS FINAS - Build OTA Optimizado" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# 1. Build
if (-not $SkipBuild) {
    Write-Host "`n[1/4] Compilando proyecto (npm run build)..." -ForegroundColor Yellow
    Push-Location $root
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: npm run build falló!" -ForegroundColor Red
        exit 1
    }
    Pop-Location
    Write-Host "✅ Build completado." -ForegroundColor Green
} else {
    Write-Host "`n[1/4] SkipBuild activado - usando dist/ existente." -ForegroundColor Gray
}

# 2. Crear zip temporal con solo los archivos de código
Write-Host "`n[2/4] Generando OTA zip optimizado..." -ForegroundColor Yellow

$otaZipPath  = Join-Path $root "ota-update.zip"
$tempZipDir  = Join-Path $root "tmp\ota-staging"

# Limpiar directorio temporal
if (Test-Path $tempZipDir) { Remove-Item -Recurse -Force $tempZipDir }
New-Item -ItemType Directory -Path "$tempZipDir\assets" -Force | Out-Null

# Copiar archivos
Copy-Item -Path "$root\dist\assets\*" -Destination "$tempZipDir\assets\" -Recurse -Force
Copy-Item -Path "$root\dist\index.html" -Destination "$tempZipDir\" -Force
if (Test-Path "$root\dist\manifest.webmanifest") { Copy-Item "$root\dist\manifest.webmanifest" "$tempZipDir\" -Force }
if (Test-Path "$root\dist\service-worker.js") { Copy-Item "$root\dist\service-worker.js" "$tempZipDir\" -Force }
# Include the root logos, placeholders and UI folders (brands, icons, reference) referenced by index.html and shared UI.
foreach ($logoName in @("logo.png", "logo2.png", "logo2.jpeg", "logo3.png", "LOGO4.png", "logo6.png", "logo9.png", "logoN.png", "logox.png", "login-avatar.jpg", "marcas.png", "placeholder.svg")) {
    $logoPath = Join-Path "$root\dist" $logoName
    if (Test-Path -LiteralPath $logoPath -PathType Leaf) {
        Copy-Item -LiteralPath $logoPath -Destination "$tempZipDir\" -Force
    }
}
foreach ($subDir in @("brands", "icons", "reference")) {
    $srcSubDir = Join-Path "$root\dist" $subDir
    if (Test-Path -LiteralPath $srcSubDir -PathType Container) {
        Copy-Item -LiteralPath $srcSubDir -Destination "$tempZipDir\$subDir" -Recurse -Force
    }
}

# Crear el zip
Write-Host "`n   Comprimiendo..." -ForegroundColor Yellow
if (Test-Path $otaZipPath) { Remove-Item -Force $otaZipPath }
# Create the ZIP with portable "/" separators. Compress-Archive writes Windows
# "\" separators into entry names; Capgo rejects those paths on Android.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipArchive = [System.IO.Compression.ZipFile]::Open(
    $otaZipPath,
    [System.IO.Compression.ZipArchiveMode]::Create
)
try {
    $stagingRoot = (Resolve-Path $tempZipDir).Path.TrimEnd('\') + '\'
    Get-ChildItem -LiteralPath $tempZipDir -File -Recurse | ForEach-Object {
        $entryName = $_.FullName.Substring($stagingRoot.Length).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zipArchive,
            $_.FullName,
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
} finally {
    $zipArchive.Dispose()
}

# Limpiar temporal
Remove-Item -Recurse -Force $tempZipDir

# Mostrar tamaño
$zipSize = (Get-Item $otaZipPath).Length / 1MB
Write-Host "✅ OTA zip generado: ota-update.zip ($([math]::Round($zipSize, 2)) MB)" -ForegroundColor Green

if ($zipSize -gt 50) {
    Write-Host "⚠️  ADVERTENCIA: El zip pesa más de 50MB - Supabase Storage puede rechazarlo." -ForegroundColor Yellow
    Write-Host "   Considera mover más imágenes grandes al servidor de Hostinger." -ForegroundColor Yellow
} else {
    Write-Host "✅ Tamaño OK para Supabase Storage (< 50MB)" -ForegroundColor Green
}

# 3. Cap Sync
if (-not $SkipSync) {
    Write-Host "`n[3/4] Sincronizando con Android (npx cap sync android)..." -ForegroundColor Yellow
    Push-Location $root
    & npx cap sync android
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ADVERTENCIA: cap sync falló, pero el OTA zip ya está generado." -ForegroundColor Yellow
    } else {
        Write-Host "✅ Cap sync completado." -ForegroundColor Green
    }
    Pop-Location
} else {
    Write-Host "`n[3/4] SkipSync activado." -ForegroundColor Gray
}

Write-Host "`n=================================================" -ForegroundColor Cyan
Write-Host " ✅ LISTO" -ForegroundColor Cyan
Write-Host "   Archivo: ota-update.zip ($([math]::Round($zipSize, 2)) MB)" -ForegroundColor White
Write-Host "   Siguiente paso: Sube ota-update.zip desde Admin > Configuración" -ForegroundColor White
Write-Host "=================================================" -ForegroundColor Cyan
