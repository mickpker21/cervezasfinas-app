// Service Worker para PWA con estrategias de caché avanzadas
const CACHE_NAME = 'cervezas-finas-v3';
const RUNTIME_CACHE = 'cervezas-finas-runtime';

// Archivos estáticos para cachear durante la instalación
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/logo.png',
    '/manifest.webmanifest',
];

// Instalar Service Worker y cachear assets estáticos
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting()) // Activar inmediatamente
    );
});

// Activar Service Worker y limpiar cachés antiguas
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim()) // Tomar control inmediatamente
    );
});



/**
 * Network First: Intenta red primero, fallback a caché
 * Ideal para datos dinámicos (API calls)
 */
async function networkFirstStrategy(request) {
    try {
        const networkResponse = await fetch(request);

        // Solo cachear respuestas exitosas y peticiones GET
        if (networkResponse && networkResponse.status === 200 && request.method === 'GET') {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed, trying cache:', request.url);
        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
            return cachedResponse;
        }

        // Si no hay caché, retornar respuesta offline
        return new Response(
            JSON.stringify({ error: 'Offline', offline: true }),
            {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

/**
 * Cache First: Intenta caché primero, fallback a red
 * Ideal para assets estáticos (JS, CSS, imágenes)
 */
async function cacheFirstStrategy(request) {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);

        if (networkResponse && networkResponse.status === 200 && request.method === 'GET') {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.log('[SW] Failed to fetch:', request.url);
        return new Response('Offline', { status: 503 });
    }
}

// Escuchar mensajes del cliente (para sync manual, etc.)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((name) => caches.delete(name))
                );
            })
        );
    }
});
