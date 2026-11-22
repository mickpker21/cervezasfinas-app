# 🚨 SOLUCIÓN: Recargas Constantes de Página

## Problema Resuelto
Las páginas se recargaban constantemente impidiendo el uso normal de la app.

## Causa
La configuración del Service Worker con:
- `registerType: 'autoUpdate'` - Recargaba automáticamente cuando detectaba cambios
- `skipWaiting: true` - El nuevo SW tomaba control inmediatamente sin esperar
- `clientsClaim: true` - Reclamaba tabs abiertas forzando reload

En **desarrollo**, con HMR (Hot Module Reload), cada cambio causaba una recarga completa.

## Solución Aplicada

### Cambios en `vite.config.js`:

```javascript
VitePWA({
  // ✅ CAMBIO: 'prompt' en lugar de 'autoUpdate'
  registerType: 'prompt',  // Ahora PREGUNTA antes de actualizar
  
  workbox: {
    // ❌ REMOVIDO: skipWaiting: true
    // ❌ REMOVIDO: clientsClaim: true
    cleanupOutdatedCaches: true,  // ✅ Mantenido (seguro)
    // ... resto de configuración
  },
  
  // ✅ NUEVO: Deshabilitar en desarrollo
  devOptions: {
    enabled: false
  }
})
```

## Cómo Funciona Ahora

### En Desarrollo (npm run dev)
- ✅ Service Worker **deshabilitado** → No más recargas
- ✅ HMR funciona normalmente
- ✅ Puedes trabajar sin interrupciones

### En Producción (después de build)
- ✅ Service Worker se activa
- ✅ Cuando hay una actualización, muestra un **prompt** al usuario
- ✅ El usuario decide **cuándo** actualizar
- ✅ No hay recargas automáticas inesperadas

## Pasos para Aplicar el Fix

1. **Detén el servidor** (Ctrl+C en la terminal donde corre `npm run dev`)
2. **Reinicia**: `npm run dev`
3. **Limpia cache del navegador** (una última vez):
   - DevTools (F12) → Application → Clear storage
   - O Ctrl+Shift+R para hard reload

4. **Verifica**: La página NO debe recargarse sola ahora

## Para Deployment

Cuando hagas build para producción:
```bash
npm run build
```

El Service Worker funcionará normalmente pero con estrategia "prompt":
- Los usuarios verán un mensaje como "Nueva versión disponible"
- Pueden elegir actualizar o seguir trabajando
- NO habrá interrupciones forzadas

---

## Si Aún Tienes Problemas

Si después de estos cambios aún hay recargas, puede ser por:

1. **HMR muy agresivo** → Agrega a `vite.config.js`:
   ```javascript
   server: {
     hmr: {
       overlay: false  // Deshabilita overlay de errores
     }
   }
   ```

2. **Loops de errores** → Revisa la consola del navegador

3. **Código que llama a reload()** → Busca `window.location.reload()` en el código
