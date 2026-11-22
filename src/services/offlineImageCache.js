/**
 * offlineImageCache.js
 * Servicio de precaché de imágenes de catálogo para modo offline en campo.
 */

const CACHE_NAME = 'cervezas-finas-product-images-v1';

/**
 * Precachea URLs de imágenes de catálogo en CacheStorage
 */
export async function precacheProductImages(imageUrls = []) {
  if (!('caches' in window) || imageUrls.length === 0) return;

  try {
    const cache = await caches.open(CACHE_NAME);
    const validUrls = imageUrls.filter(u => typeof u === 'string' && u.startsWith('http'));

    // Cachear en lotes de 10
    const batchSize = 10;
    for (let i = 0; i < validUrls.length; i += batchSize) {
      const batch = validUrls.slice(i, i + batchSize);
      await Promise.all(
        batch.map(url =>
          fetch(url, { mode: 'no-cors' })
            .then(res => cache.put(url, res))
            .catch(() => {}) // Ignorar fallos de red individuales
        )
      );
    }
    console.log(`[offlineImageCache] ${validUrls.length} imágenes precacheadas.`);
  } catch (e) {
    console.warn('[offlineImageCache] Error precacheando imágenes:', e);
  }
}

/**
 * Intenta obtener la imagen desde la caché offline
 */
export async function getCachedImage(url) {
  if (!('caches' in window) || !url) return url;
  try {
    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(url);
    if (match) {
      const blob = await match.blob();
      return URL.createObjectURL(blob);
    }
  } catch (e) {
    // Fallback a URL remota
  }
  return url;
}
