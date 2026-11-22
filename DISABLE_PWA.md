# 🛑 PWA Deshabilitada Completamente

He desactivado todas las funciones de "Aplicación Progresiva" (PWA) para detener las recargas automáticas.

## 🛠️ Cambios Realizados
1. **vite.config.js**: Se comentó el plugin `VitePWA`. Ya no se genera ningún Service Worker.
2. **src/main.jsx**: Se eliminó el código que registra el Service Worker.

## ⚠️ PASO FINAL OBLIGATORIO

Como el Service Worker antiguo **sigue instalado en tu navegador**, debes eliminarlo manualmente una última vez para que deje de molestar.

### Instrucciones para Chrome/Edge:

1. Abre la aplicación.
2. Abre las herramientas de desarrollador (**F12**).
3. Ve a la pestaña **Application** (Aplicación).
4. En el menú izquierdo, busca **Service Workers**.
5. Haz clic en **Unregister** (Desregistrar) al lado del service worker activo.
6. Haz clic en **Clear site data** (Limpiar datos del sitio) en la sección **Storage** (Almacenamiento) para asegurar que no quede nada.
7. **Recarga la página** (Ctrl+R).

### Resultado Esperado
- La página ya **NO** se recargará sola.
- La aplicación funcionará como una página web normal.
- No funcionará offline (sin internet), pero será estable.
