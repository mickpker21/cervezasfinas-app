# 📱 Guía para Compilar APK (Android)

Esta guía detalla los pasos para generar el archivo APK instalable de la aplicación **Cervezas Finas CRM**.

## ✅ 1. Estado de Configuración Android

Configuración auditada y optimizada (última revisión: Abril 2026):

| Ítem | Estado |
|------|--------|
| App ID | `com.cervezasfinas.www` ✅ |
| Nombre | `CERVEZAS FINAS` ✅ |
| Capacitor | v7.x ✅ |
| Gradle | 8.11.1 ✅ |
| AGP | 8.7.2 ✅ |
| compileSdk / targetSdk | 35 ✅ |
| minSdk | 23 (Android 6.0+) ✅ |
| `flatDir` warning | Eliminado ✅ |
| Builds paralelos | Habilitados ✅ |
| Build cache | Habilitado ✅ |
| Memoria JVM Gradle | 4 GB ✅ |
| Permisos | Cámara, Geolocalización, Internet ✅ |

## 🚀 2. Preparar el Código

Antes de abrir Android Studio, sincroniza el código nativo con la última versión de la web app.

**Opción A — Script automático (recomendado):**
```powershell
# Desde la raíz del proyecto en PowerShell:
.\rebuild-clean.ps1

# Si hay errores raros de Gradle (limpieza profunda):
.\rebuild-clean.ps1 -DeepClean
```

**Opción B — Comandos manuales:**
```bash
# 1. Construir la versión web
npm run build

# 2. Sincronizar con el proyecto Android
npx cap sync android
```
.\rebuild-clean.ps1
## 🛠️ 3. Compilar en Android Studio

1. **Abrir el proyecto Android**:
   ```bash
   npx cap open android
   ```
   *O abre Android Studio manualmente → Open → selecciona la carpeta `android/`.*

2. **Esperar indexación**:
   Deja que Android Studio termine de sincronizar Gradle (barra de progreso abajo a la derecha). Esto puede tomar 2-5 minutos la primera vez.

3. **Generar APK Debug (para pruebas rápidas)**:
   - Menú: **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**
   - Espera a que termine → clic en **locate** en la notificación
   - Archivo: `android/app/build/outputs/apk/debug/app-debug.apk`

4. **Generar APK Release (para producción)**:
   - Menú: **Build** > **Generate Signed Bundle / APK**
   - Selecciona **APK** → **Next**
   - Selecciona tu KeyStore existente o crea uno nuevo
   - Selecciona variante `release` → **Finish**
   - Archivo: `android/app/build/outputs/apk/release/app-release.apk`

## 📲 4. Instalar en Dispositivo

- **USB**: Conecta tu celular, activa "Depuración USB" y presiona ▶️ en Android Studio.
- **Archivo**: Copia el `.apk` a tu celular (WhatsApp, Drive, USB) e instálalo.

> ⚠️ Si el celular bloquea la instalación, ve a **Ajustes → Seguridad → Instalar aplicaciones desconocidas** y habilítalo para tu gestor de archivos.

## ⚠️ Solución de Problemas

### 🔴 Error "flatDir should be avoided"
**Resuelto**: El bloque `flatDir` fue eliminado de `android/capacitor-cordova-android-plugins/build.gradle`.
Si reaparece tras `npx cap sync`, ejecuta el script de rebuild.

### 🔴 La App se cierra al abrir (Crash)
1. En Android Studio: **Build** > **Clean Project** → **Rebuild Project**
2. Revisa la pestaña **Logcat** (filtra por "Error") para ver el error exacto

### 🔴 Gradle sync failed
- **File** > **Sync Project with Gradle Files**
- Verifica tu conexión a internet (Gradle descarga dependencias)
- Ejecuta `.\rebuild-clean.ps1 -DeepClean` y vuelve a intentar

### 🔴 OutOfMemoryError al compilar
Ya resuelto: la memoria JVM de Gradle fue aumentada a **4 GB** en `android/gradle.properties`.

### 🟡 Cambios no se ven en la APK
Asegúrate de haber ejecutado `npm run build` Y `npx cap sync android` **antes** de compilar.
O simplemente ejecuta `.\rebuild-clean.ps1`.

---

## 🔢 5. Gestión de Versiones

La app tiene **3 sistemas de versionado** que deben estar sincronizados:

### Archivos a modificar al subir versión:

| # | Archivo | Campo | Ejemplo |
|---|---------|-------|---------|
| 1 | `src/services/updateService.js` | `APP_CURRENT_VERSION` | `'2.0.1'` |
| 2 | `package.json` | `"version"` | `"2.0.1"` |
| 3 | `android/app/build.gradle` | `versionCode` / `versionName` | `5` / `"2.0.1"` |

> ⚠️ **IMPORTANTE**: `versionCode` en Android debe ser un número entero que SIEMPRE sube (nunca baja). Si la versión anterior tenía `versionCode = 4`, la siguiente debe ser `5` o mayor.

### ¿Dónde se muestra la versión?

| Lugar | Quién lo ve |
|-------|-------------|
| Pie del Login (`v2.0.1`) | Todos los usuarios |
| Página de Utilidades | Usuarios logueados |
| Admin → Configuración → OTA | Solo administradores |
| Consola del navegador (logs) | Desarrolladores |

---

## 📡 6. Actualización OTA (Sin nuevo APK)

La actualización OTA permite cambiar el código de la app en dispositivos **sin que el usuario descargue un nuevo APK**. Solo actualiza JS/CSS/HTML.

### Cuándo usar OTA vs nuevo APK:

| Cambio | Método |
|--------|--------|
| Correcciones de bugs en el código | ✅ OTA |
| Nuevas pantallas o funcionalidades | ✅ OTA |
| Cambio de logos/imágenes locales | ✅ OTA (ZIP completo) |
| Nuevos permisos nativos (cámara, BLE, etc.) | ❌ Nuevo APK |
| Actualización de plugins de Capacitor | ❌ Nuevo APK |
| Cambio de `versionCode` en Google Play | ❌ Nuevo APK |

### Paso a paso — Publicar OTA:

#### 1. Cambiar la versión
```powershell
# En src/services/updateService.js:
export const APP_CURRENT_VERSION = '2.0.2';

# En package.json:
"version": "2.0.2"
```

#### 2. Compilar el proyecto
Tienes dos opciones para compilar.

**Opción A — Todo en 1 clic (RECOMENDADO):**
```powershell
npm run build:release
```
*Este comando hace:* `npm run build` + *Crea el ZIP OTA* + `npx cap sync android` + *Abre Android Studio.*

**Opción B — Paso a paso (Manual):**
1. `npm run build`
2. Generar ZIP OTA (ver abajo)
3. `npx cap sync android`

#### 3. Generar el ZIP OTA (Si no usaste la Opción A)

**Solo código (ligero, ~2-5 MB):**
```powershell
powershell Compress-Archive -Path "dist/index.html","dist/assets" -DestinationPath "ota-update.zip" -Force
```

**Opción B — Completo con imágenes (~50-130 MB):**
```powershell
cd dist
powershell Compress-Archive -Path "*" -DestinationPath "..\ota-update.zip" -Force
cd ..
```

> 💡 Usa Opción A si solo cambiaste código. Usa Opción B si cambiaste logos o imágenes en `public/`.

#### 4. Subir desde el panel admin

1. Ve a `https://cervezasfinas.com/admin/settings`
2. Baja a la sección **Actualizaciones OTA**
3. El sistema muestra las 3 versiones actuales (código, OTA servidor, APK servidor)
4. La versión nueva ya está auto-sugerida
5. Selecciona el archivo `ota-update.zip`
6. Click **Publicar OTA**
7. ✅ Los dispositivos lo descargan automáticamente al abrir la app

---

## 🌐 7. Actualizar el Manifiesto APK (Hostinger)

Cuando generas un **nuevo APK** (no OTA), debes actualizar el manifiesto en el servidor para que los usuarios reciban la notificación de descarga.

### Paso a paso:

#### 1. Subir el APK a Hostinger
- Abre **Hostinger → File Manager** (o FTP)
- Ve a `public_html/apps/`
- Sube el archivo `app-release.apk` **renombrándolo a `cervezas-finas.apk`** (nombre fijo, la app lo busca así)

#### 2. Crear/Actualizar `version.json` (opcional pero recomendado)
- En Hostinger, crea o edita `public_html/apps/version.json`:
```json
{
  "version": "2.0.1",
  "url": "https://cervezasfinas.com/apps/cervezas-finas.apk",
  "force": false,
  "notes": "Auditoría GPS, eliminación de ventas, mejoras generales"
}
```
- Si `version.json` existe, la app lo usa para mostrar la versión en Admin Settings y para notificar actualizaciones
- Si no existe, el botón de descarga en Utilidades usa el nombre fijo `cervezas-finas.apk`
- `force: true` → obliga al usuario a actualizar (no puede cerrar el aviso)
- `force: false` → muestra notificación opcional

#### 3. Verificar
- Abre la app en un dispositivo → debe aparecer el toast **"Nueva actualización disponible"**
- O verifica en `https://cervezasfinas.com/admin/settings` → card "APK en Servidor"

---

## ✅ 8. Checklist Rápido de Deploy

### Deploy Web (Hostinger):
```
[ ] Cambiar versión en updateService.js y package.json
[ ] npm run build
[ ] Subir contenido de dist/ a public_html/ en Hostinger
[ ] Verificar en https://cervezasfinas.com
```

### Deploy OTA (móviles sin APK nuevo):
```
[ ] Cambiar versión en updateService.js y package.json
[ ] npm run build
[ ] Generar ZIP (ligero o completo)
[ ] Subir en /admin/settings → sección OTA
[ ] Verificar que la card "OTA en Servidor" muestre la nueva versión
```

### Deploy APK nuevo:
```
[ ] Cambiar versión en updateService.js, package.json Y build.gradle
[ ] npm run build
[ ] npx cap sync android (o .\rebuild-clean.ps1)
[ ] Compilar en Android Studio → Build > Generate Signed APK
[ ] Subir APK a Hostinger (public_html/apps/)
[ ] Actualizar version.json en Hostinger
[ ] (Opcional) Subir también a Google Play si aplica
```

### Deploy completo (Web + OTA + APK):
```
[ ] Cambiar versión en los 3 archivos
[ ] npm run build
[ ] Subir dist/ a Hostinger
[ ] Generar y subir OTA desde /admin/settings
[ ] npx cap sync android → compilar APK
[ ] Subir APK y actualizar version.json en Hostinger
```
