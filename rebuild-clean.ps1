# ============================================================
# Limpieza de Cache y Rebuild Completo - Cervezas Finas APK
# Ejecuta este script cuando los cambios no aparezcan en la APK
#
# Uso normal:    .\rebuild-clean.ps1
# Limpieza profunda (errores raros de Gradle):
#                .\rebuild-clean.ps1 -DeepClean
# ============================================================

param(
    [switch]$DeepClean
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "[CLEAN] Limpiando archivos de build..." -ForegroundColor Yellow

# Eliminar dist
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
    Write-Host "  OK - Eliminado /dist" -ForegroundColor Green
}

# Eliminar cache de Vite
if (Test-Path "node_modules/.vite") {
    Remove-Item -Recurse -Force "node_modules/.vite"
    Write-Host "  OK - Eliminado /node_modules/.vite" -ForegroundColor Green
}

# Eliminar assets anteriores de Android
if (Test-Path "android/app/src/main/assets/public") {
    Remove-Item -Recurse -Force "android/app/src/main/assets/public"
    Write-Host "  OK - Eliminado android assets (public)" -ForegroundColor Green
}

# Eliminar build anterior de Android
if (Test-Path "android/app/build") {
    Remove-Item -Recurse -Force "android/app/build"
    Write-Host "  OK - Eliminado android/app/build" -ForegroundColor Green
}

# DeepClean: limpia tambien el cache de Gradle
if ($DeepClean) {
    Write-Host ""
    Write-Host "[DEEP CLEAN] Limpiando cache de Gradle..." -ForegroundColor Magenta
    if (Test-Path "android/.gradle") {
        Remove-Item -Recurse -Force "android/.gradle"
        Write-Host "  OK - Eliminado android/.gradle" -ForegroundColor Green
    }
    if (Test-Path "android/build") {
        Remove-Item -Recurse -Force "android/build"
        Write-Host "  OK - Eliminado android/build" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "[BUILD] Construyendo web app (npm run build)..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERROR] npm run build fallo. Revisa los errores arriba." -ForegroundColor Red
    exit 1
}
Write-Host "  OK - Build web completado" -ForegroundColor Green

Write-Host ""
Write-Host "[SYNC] Sincronizando con Capacitor (npx cap sync android)..." -ForegroundColor Cyan
npx cap sync android
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERROR] cap sync fallo. Revisa los errores arriba." -ForegroundColor Red
    exit 1
}
Write-Host "  OK - Sync completado" -ForegroundColor Green

Write-Host ""
Write-Host "[LISTO] Todo listo! Ahora ve a Android Studio:" -ForegroundColor Green
Write-Host "   1. Build -> Clean Project" -ForegroundColor White
Write-Host "   2. Build -> Generate Signed Bundle / APK -> APK -> release" -ForegroundColor White
Write-Host ""
Write-Host "[TIP] Si hay errores raros de Gradle, ejecuta: .\rebuild-clean.ps1 -DeepClean" -ForegroundColor DarkYellow
