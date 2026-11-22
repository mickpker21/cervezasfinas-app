# 🚨 Solución URGENTE: Cache del Service Worker

## El Problema
El navegador está usando `index-5af94a24.js` (versión antigua) en lugar de `index-b7ad68d1.js` (versión nueva con el fix).

## Solución Inmediata

### Opción 1: Limpiar Service Worker desde DevTools
1. Abre DevTools (F12)
2. Ve a **Application** → **Service Workers**
3. Click en **Unregister** junto al SW activo
4. Luego ve a **Application** → **Storage** → **Clear site data**
5. Marca todo y click **Clear site data**
6. Hard reload: **Ctrl+Shift+R** (Windows) o **Cmd+Shift+R** (Mac)

### Opción 2: Desde la consola del navegador
```javascript
// Pega esto en la consola del navegador y presiona Enter:
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(r => r.unregister());
  caches.keys().then(keys => {
    keys.forEach(key => caches.delete(key));
    window.location.reload(true);
  });
});
```

### Opción 3: Modo Incógnito
Abre la app en una **ventana de incógnito** para probar sin cache.

---

## Por Qué Pasó Esto

El Service Worker actual tiene estas configuraciones:
- `skipWaiting: true` ✅
- `clientsClaim: true` ✅  
- `cleanupOutdatedCaches: true` ✅

**PERO** el SW que está corriendo en tu navegador es la versión ANTERIOR que NO tiene estas configuraciones, por eso no se actualiza solo.

## Solución Permanente

Una vez que limpies el cache esta vez, el NUEVO Service Worker tomará control y tendrá las configuraciones correctas. Los usuarios futuros SE actualizarán automáticamente.

---

## Para Deployment

Cuando subas a producción (cervezasfinas.com):

1. **Desplegar los archivos nuevos**
2. **Opcional**: Agregar un header HTTP para forzar recarga del service worker:
   ```
   Service-Worker-Allowed: /
   Clear-Site-Data: "cache", "cookies", "storage"
   ```

3. **Avisar a usuarios** que hagan hard reload una vez (Ctrl+Shift+R)

---

## Verificar que el fix funciona

Después de limpiar cache, busca en la consola:
- ✅ El archivo debe ser `index-b7ad68d1.js` (no `index-5af94a24.js`)
- ✅ NO debe aparecer el error `loadingSales is not defined`
