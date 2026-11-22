# Configuración para evitar problemas de cache en producción

## ✅ **Soluciones Implementadas**

### 1. **Service Worker Auto-Update**
Configurado en `vite.config.js`:

```javascript
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    skipWaiting: true,           // ← Toma control inmediatamente
    clientsClaim: true,          // ← Reemplaza la versión vieja sin esperar
    cleanupOutdatedCaches: true, // ← Limpia caches antiguas automáticamente
  }
})
```

### 2. **Cache Busting Automático**
Vite ahora genera nombres de archivo únicos con hash:
- `main-abc123.js` (cambia con cada build)
- `styles-def456.css` (cambia con cada build)

### 3. **Headers HTTP Recomendados (servidor)**

Si despliegan en un servidor propio (nginx/apache), agreguen estos headers en el código HTML:

**Para nginx:**
```nginx
location / {
    # No cachear el index.html
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    add_header Pragma "no-cache";
    add_header Expires "0";
}

location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    # Cachear assets con hash por 1 año
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

**Para Cloudflare/Vercel:**
Ya tienen cache busting automático, no necesitan configuración adicional.

---

## 📋 **Checklist de Deployment**

Cuando subas una actualización:

1. ✅ `npm run build` - Genera nuevos hashes automáticamente
2. ✅ Despliega los archivos del `dist/`
3. ✅ El Service Worker se actualizará automáticamente en ~30 segundos
4. ✅ Los usuarios verán los cambios sin borrar cache

---

## 🔄 **Cómo funciona ahora:**

1. **Primera visita**: El usuario descarga todo (SW, assets)
2. **Actualizas el código**: Haces `npm run build` → Genera nuevos hashes
3. **Usuario regresa**: 
   - El SW detecta nueva versión
   - `skipWaiting: true` → Actualiza inmediatamente
   - `clientsClaim: true` → Toma control sin reload manual
   - `cleanupOutdatedCaches: true` → Borra archivos viejos
4. **Resultado**: Usuario ve los cambios automáticamente

---

## 🧪 **Cómo probar:**

1. Haz build: `npm run build`
2. Deploy a producción
3. Abre la app en un navegador
4. Abre DevTools → Application → Service Workers
5. Verás "Waiting to activate" por ~5 segundos
6. Luego cambiará a "Activated and is running"
7. La página se recargará automáticamente con la nueva versión

---

## ⚡ **Bonus: Forzar actualización manual**

Si alguna vez necesitas forzar que TODOS los usuarios actualicen, puedes agregar este código en `App.jsx`:

```javascript
useEffect(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(registration => {
        registration.update(); // Fuerza check de nueva versión
      });
    });
  }
}, []);
```

Pero con la configuración actual, **NO** es necesario porque ya se actualiza solo.
