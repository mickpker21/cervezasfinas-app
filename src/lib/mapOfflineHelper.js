// src/lib/mapOfflineHelper.js
import { logger } from './logger';

const ZOOM_LEVELS = [15, 16]; // Niveles de zoom adecuados para clientes (nivel colonias/calles)
const CACHE_NAME = 'osm-tiles';
const TILE_DOMAIN = 'https://a.tile.openstreetmap.org'; // Default base URL

// Funciones Slippy Map math
function lon2tile(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat, zoom) {
  return Math.floor(
    ((1 -
      Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) /
      Math.PI) /
      2) *
    Math.pow(2, zoom)
  );
}

/**
 * Normaliza las coordenadas de un cliente (soporta string sucio, objetos con latitud, etc.)
 */
function extractCoords(c) {
  let coords = c;
  if (!coords) return null;
  // Parse string if needed
  if (typeof coords === "string") {
    try {
      coords = JSON.parse(coords);
    } catch {
      const sep = coords.includes(",") ? "," : coords.includes(";") ? ";" : null;
      if (sep) {
        const parts = coords.split(sep);
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
      }
      return null;
    }
  }
  
  if (Array.isArray(coords) && coords.length >= 2) {
    const lat = parseFloat(coords[0]);
    const lng = parseFloat(coords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  // Object
  if (typeof coords === "object") {
    const lat = parseFloat(coords.lat ?? coords.latitude ?? coords.latitud ?? coords.Lat);
    const lng = parseFloat(coords.lng ?? coords.longitude ?? coords.longitud ?? coords.Lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  
  return null;
}

/**
 * Dado un array de clientes u objetos, computa y descarga los tiles del mapa offline.
 */
export async function syncMapTilesOffline(clientsArray = []) {
  if (!window.caches) {
    console.warn('[MapOfflineHelper] Cache API no está soportada. Ignorando.');
    return;
  }

  const urlsToFetch = new Set();

  for (const client of clientsArray) {
    // Si viene la coord directo o dentro de client.coords
    const coordData = extractCoords(client.coords) || extractCoords(client);
    if (!coordData) continue;

    for (const z of ZOOM_LEVELS) {
      const xObj = lon2tile(coordData.lng, z);
      const yObj = lat2tile(coordData.lat, z);

      // Agregamos el cuadro central y los 8 cuadros adyacentes para dar margen de paneo (grid 3x3)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const x = xObj + dx;
          const y = yObj + dy;
          urlsToFetch.add(`${TILE_DOMAIN}/${z}/${x}/${y}.png`);
        }
      }
    }
  }

  if (urlsToFetch.size === 0) {
    logger.info('SYNC', 'MAP_TILES_EMPTY', { message: 'No valid routes to cache' });
    return;
  }

  const uniqueUrls = Array.from(urlsToFetch);
  console.log(`[MapOfflineHelper] Iniciando descarga de ${uniqueUrls.length} imágenes de mapa.`);

  try {
    const cache = await window.caches.open(CACHE_NAME);
    let downloaded = 0;

    // Procesar en lotes (chunks) para no saturar la red (20 a la vez)
    const chunkSize = 20;
    for (let i = 0; i < uniqueUrls.length; i += chunkSize) {
      const chunk = uniqueUrls.slice(i, i + chunkSize);
      
      const promises = chunk.map(url => 
        // Comprobar si ya existe para ahorrar peticiones a la API
        cache.match(url).then(exists => {
          if (!exists) {
            return fetch(url, { headers: { 'User-Agent': 'CervezasFinasCRM/1.0' }, mode: 'cors' })
                   .then(resp => {
                     // Solo guardar si es válida (OSM retorna 200 para imágenes válidas)
                     if (resp.ok) return cache.put(url, resp);
                   })
                   .catch(() => {}); // Fallo silente
          }
        })
      );

      await Promise.allSettled(promises);
      downloaded += chunk.length;
      console.log(`[MapOfflineHelper] Progreso: ${downloaded} / ${uniqueUrls.length}`);
    }

    logger.info('SYNC', 'MAP_TILES_SUCCESS', { count: uniqueUrls.length });
    console.log('[MapOfflineHelper] Descarga de mapas offline completada exitosamente.');

  } catch (error) {
    logger.error('SYNC', 'MAP_TILES_ERROR', { error: error.message });
    console.error('[MapOfflineHelper] Error guardando en caché:', error);
  }
}
