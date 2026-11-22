import { Capacitor } from '@capacitor/core';

export const registerServiceWorker = async () => {
    // DESACTIVADO GLOBALMENTE PARA EVITAR PROBLEMAS DE CACHÉ (Pantalla en blanco)
    console.log('[SW] Service Workers desactivados. Limpiando existentes para prevenir cache corrupto...');
    if ('serviceWorker' in navigator) {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                await registration.unregister();
                console.log('[SW] Desregistrado SW antiguo:', registration.scope);
            }
            
            // Forzar limpieza de cachés del navegador asociadas al SW viejo
            if (window.caches) {
                const cacheNames = await caches.keys();
                for (const cacheName of cacheNames) {
                    await caches.delete(cacheName);
                    console.log('[SW] Caché eliminada:', cacheName);
                }
            }
        } catch (err) {
            console.error('[SW] Error al limpiar Service Workers:', err);
        }
    }
};

/**
 * Desregistra el Service Worker (útil para debugging)
 */
export const unregisterServiceWorker = async () => {
    if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
            await registration.unregister();
            console.log('[SW] Service Worker desregistrado');
        }
    }
};

/**
 * Limpia todas las cachés (útil para forzar refresh)
 */
export const clearServiceWorkerCache = async () => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
        console.log('[SW] Solicitud de limpieza de caché enviada');
    }
};
