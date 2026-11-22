import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';
// import { registerSW } from 'virtual:pwa-register';

import { SupabaseAuthProvider } from '@/contexts/SupabaseAuthContext';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from '@/components/ui/toaster';
import ErrorBoundary from '@/components/ErrorBoundary';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

console.log('[main] Iniciando aplicación...');

// Si después de un despliegue algún chunk dinámico cambió de hash, recargar automáticamente una vez
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const reloadKey = 'vite_preload_reloaded';
  if (!sessionStorage.getItem(reloadKey)) {
    sessionStorage.setItem(reloadKey, '1');
    window.location.reload();
  }
});

// Limpieza de emergencia de Service Workers antiguos que puedan estar bloqueando actualizaciones
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      console.log('[main] Desregistrando SW antiguo:', registration);
      registration.unregister();
    }
  });
}

try {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary>
        <HelmetProvider>
          <SupabaseAuthProvider>
            <App />
            <Toaster />
          </SupabaseAuthProvider>
        </HelmetProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
  console.log('[main] Render inicial completado');
  
  // Notificamos a Capgo que la app cargó correctamente para que aplique la actualización
  CapacitorUpdater.notifyAppReady().catch(err => {
    console.error('[main] Error en notifyAppReady:', err);
  });
} catch (e) {
  console.error('[main] Error fatal en render:', e);
}
