# =====================================================================
# build-exe.ps1 - Genera la aplicación de escritorio Windows (.exe)
# Incluye soporte Offline en disco + Auto-actualización por OTA (ota-update.zip)
# =====================================================================

param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host " CERVEZAS FINAS CRM - Generador de .EXE Windows" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# 1. Compilar frontend (dist/) y regenerar ota-update.zip
if (-not $SkipBuild) {
    Write-Host "`n[1/3] Compilando CRM y paquete OTA (npm run build:ota)..." -ForegroundColor Yellow
    Push-Location $root
    & npm run build:ota
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Falló la compilación web/OTA!" -ForegroundColor Red
        exit 1
    }
    Pop-Location
} else {
    Write-Host "`n[1/3] SkipBuild activado - usando dist/ existente." -ForegroundColor Gray
}

# 2. Preparar carpeta ligera de staging para Electron (solo dist + electron)
Write-Host "`n[2/3] Preparando staging de escritorio..." -ForegroundColor Yellow
$stageDir = Join-Path $root "tmp\exe-staging"
$outDir   = Join-Path $root "release-exe"

if (Test-Path $stageDir) { Remove-Item -Recurse -Force $stageDir }
New-Item -ItemType Directory -Path "$stageDir\electron" -Force | Out-Null
New-Item -ItemType Directory -Path "$stageDir\dist" -Force | Out-Null

Copy-Item -Path "$root\electron\*" -Destination "$stageDir\electron\" -Recurse -Force
Copy-Item -Path "$root\dist\*" -Destination "$stageDir\dist\" -Recurse -Force

$pkgJson = @{
    name = "cervezas-finas-crm"
    productName = "CervezasFinasCRM"
    version = "2.1.4"
    main = "electron/main.cjs"
} | ConvertTo-Json -Depth 3

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText("$stageDir\package.json", $pkgJson, $utf8NoBom)

# 3. Empaquetar o actualizar .exe en release-exe\CervezasFinasCRM-win32-x64
Write-Host "`n[3/3] Actualizando ejecutable Windows x64 (.exe)..." -ForegroundColor Yellow
Stop-Process -Name "CervezasFinasCRM" -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
$exeFolder = Join-Path $outDir "CervezasFinasCRM-win32-x64"
$exeFile   = Join-Path $exeFolder "CervezasFinasCRM.exe"
$appResDir = Join-Path $exeFolder "resources\app"
$icoFile   = Join-Path $root "electron\icon.ico"

$needsIconRepack = $false
if ((Test-Path $icoFile) -and (Test-Path $exeFile)) {
    if ((Get-Item $icoFile).LastWriteTime -gt (Get-Item $exeFile).LastWriteTime) {
        $needsIconRepack = $true
    }
}

if ((Test-Path $exeFile) -and (Test-Path $appResDir) -and (-not $needsIconRepack)) {
    Write-Host "   Actualizando recursos internos del .exe existente..." -ForegroundColor Cyan
    if (Test-Path "$appResDir\dist") { Remove-Item -Recurse -Force "$appResDir\dist" }
    if (Test-Path "$appResDir\electron") { Remove-Item -Recurse -Force "$appResDir\electron" }
    New-Item -ItemType Directory -Path "$appResDir\dist" -Force | Out-Null
    New-Item -ItemType Directory -Path "$appResDir\electron" -Force | Out-Null
    Copy-Item -Path "$stageDir\dist\*" -Destination "$appResDir\dist\" -Recurse -Force
    Copy-Item -Path "$stageDir\electron\*" -Destination "$appResDir\electron\" -Recurse -Force
    Copy-Item -Path "$stageDir\package.json" -Destination "$appResDir\package.json" -Force
} else {
    Push-Location $root
    $packArgs = @(
        "--yes", "@electron/packager", "$stageDir", "CervezasFinasCRM",
        "--platform=win32",
        "--arch=x64",
        "--out=$outDir",
        "--overwrite",
        "--electron-version=33.2.0"
    )
    if (Test-Path $icoFile) {
        $packArgs += "--icon=$icoFile"
    }
    & npx @packArgs
    $packExit = $LASTEXITCODE
    Pop-Location
    if ($packExit -ne 0) {
        Remove-Item -Recurse -Force $stageDir -ErrorAction SilentlyContinue
        Write-Host "ERROR: No se pudo empaquetar el .exe" -ForegroundColor Red
        exit 1
    }
}

Remove-Item -Recurse -Force $stageDir -ErrorAction SilentlyContinue

# Crear script para instalar acceso directo en el Escritorio de cualquier PC
$shortcutScript = @'
$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$Shortcut = $WshShell.CreateShortcut("$DesktopPath\Cervezas Finas CRM.lnk")
$Shortcut.TargetPath = "$PSScriptRoot\CervezasFinasCRM.exe"
$Shortcut.WorkingDirectory = "$PSScriptRoot"
$Shortcut.Description = "Cervezas Finas CRM (Modo Offline + OTA)"
$Shortcut.Save()
Write-Host "Acceso directo creado en el Escritorio." -ForegroundColor Green
'@
Set-Content -Path (Join-Path $exeFolder "Crear-Acceso-Directo.ps1") -Value $shortcutScript -Encoding UTF8

Write-Host "`n=================================================" -ForegroundColor Cyan
Write-Host " ✅ EJECUTABLE WINDOWS GENERADO CON ÉXITO" -ForegroundColor Green
Write-Host "   Ejecutable: $exeFile" -ForegroundColor White
Write-Host "   OTA lista:  $root\ota-update.zip" -ForegroundColor White
Write-Host "=================================================" -ForegroundColor Cyan
