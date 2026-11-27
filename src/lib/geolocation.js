// src/lib/geolocation.js
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

/**
 * Helper para parsear de forma consistente las coordenadas de un cliente
 * Prioriza client.coords (objeto o JSON string actualizado recientemente) y luego campos planos (lat/lng).
 */
export function parseClientCoords(client) {
  if (!client) return null;

  // 1. Priorizar client.coords (donde se guardan las actualizaciones recientes en vivo)
  if (client.coords) {
    try {
      const parsed = typeof client.coords === 'string' ? JSON.parse(client.coords) : client.coords;
      if (Array.isArray(parsed) && parsed.length >= 2) {
        const lat = Number(parsed[0]);
        const lng = Number(parsed[1]);
        if (!isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
          return { lat, lng };
        }
      }
      if (parsed && typeof parsed === 'object') {
        const lat = Number(parsed.lat ?? parsed.latitude ?? parsed.latitud);
        const lng = Number(parsed.lng ?? parsed.longitude ?? parsed.longitud);
        if (!isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
          return { lat, lng };
        }
      }
    } catch (e) {
      // ignore JSON parse error
    }
  }

  // 2. Fallback a campos planos del registro
  const flatLat = Number(client.lat ?? client.latitude ?? client.latitud);
  const flatLng = Number(client.lng ?? client.longitude ?? client.longitud);
  if (!isNaN(flatLat) && !isNaN(flatLng) && (flatLat !== 0 || flatLng !== 0)) {
    return { lat: flatLat, lng: flatLng };
  }

  return null;
}

/**
 * Distancia en metros entre dos coordenadas (Fórmula de Haversine)
 */
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Cache en memoria + localStorage/sessionStorage de la última ubicación satelital válida.
// Indispensable para teléfonos/tabletas SIN chip (SIM) y SIN internet donde no existe A-GPS ni triangulación por antenas.
const LAST_POS_STORAGE_KEY = 'cf_last_known_gps_v1';
const LAST_POS_MAX_AGE_ONLINE_MS = 15 * 60 * 1000;  // 15 minutos con red
const LAST_POS_MAX_AGE_OFFLINE_MS = 45 * 60 * 1000; // 45 minutos sin red / sin chip (para interiores donde se pierde línea de vista satelital)
let memoryLastPosition = null;
let activeWatchId = null;
let activeWebWatchId = null;

function isValidPosition(pos) {
  if (!pos?.coords) return false;
  const lat = Number(pos.coords.latitude);
  const lng = Number(pos.coords.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

function saveLastKnownPosition(pos) {
  if (!isValidPosition(pos)) return;
  const lat = Number(pos.coords.latitude);
  const lng = Number(pos.coords.longitude);
  const snapshot = {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy: Number(pos.coords.accuracy) || 50,
    },
    timestamp: Date.now(),
  };
  memoryLastPosition = snapshot;
  const serialized = JSON.stringify(snapshot);
  try {
    sessionStorage.setItem(LAST_POS_STORAGE_KEY, serialized);
  } catch {}
  try {
    localStorage.setItem(LAST_POS_STORAGE_KEY, serialized);
  } catch {}
}

function getDefaultMaxAgeMs() {
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return isOffline ? LAST_POS_MAX_AGE_OFFLINE_MS : LAST_POS_MAX_AGE_ONLINE_MS;
}

function getLastKnownPosition(maxAgeMs = getDefaultMaxAgeMs()) {
  const now = Date.now();
  if (memoryLastPosition && now - memoryLastPosition.timestamp <= maxAgeMs) {
    return memoryLastPosition;
  }
  const readStorage = (storage) => {
    try {
      const raw = storage?.getItem(LAST_POS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isValidPosition(parsed) && now - (parsed.timestamp || 0) <= maxAgeMs) {
          memoryLastPosition = parsed;
          return parsed;
        }
      }
    } catch {}
    return null;
  };
  return readStorage(typeof sessionStorage !== 'undefined' ? sessionStorage : null) ||
         readStorage(typeof localStorage !== 'undefined' ? localStorage : null);
}

/**
 * Verifica y solicita permisos de ubicación en APK nativa sin consumir el timeout del GPS.
 */
async function ensureNativeLocationPermission() {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const permStatus = await Geolocation.checkPermissions();
    if (permStatus.location === 'granted' || permStatus.coarseLocation === 'granted') {
      return true;
    }
    const reqStatus = await Geolocation.requestPermissions();
    return reqStatus.location === 'granted' || reqStatus.coarseLocation === 'granted';
  } catch (e) {
    // Algunos dispositivos lanzan excepción en checkPermissions pero permiten getCurrentPosition
    return true;
  }
}

/**
 * Mantiene el chip GPS físico (satélites) encendido y enganchado en segundo plano mientras la app está abierta.
 * En teléfonos/tabletas SIN SIM y SIN Internet no existe A-GPS ni triangulación por antenas/Wi-Fi;
 * un arranque en frío del chip GPS tarda 15-35s, pero si se mantiene activo con watchPosition,
 * entrega coordenadas satelitales en 0ms al abrir cualquier visita o evaluación.
 */
export async function startGpsBackgroundWatch() {
  if (activeWatchId !== null || activeWebWatchId !== null) return;

  const hasPerm = await ensureNativeLocationPermission();
  if (!hasPerm) return;

  const watchOpts = {
    enableHighAccuracy: true, // Forzar receptor GPS satelital físico (funciona sin SIM y sin internet)
    timeout: 30000,
    maximumAge: 15000,
  };

  if (Capacitor.isNativePlatform()) {
    try {
      activeWatchId = await Geolocation.watchPosition(watchOpts, (pos, err) => {
        if (pos && isValidPosition(pos)) {
          saveLastKnownPosition(pos);
        }
      });
    } catch (e) {
      activeWatchId = null;
    }
  }

  // Activar también watchPosition del WebView / navegador como respaldo continuo
  if (typeof navigator !== 'undefined' && 'geolocation' in navigator && activeWebWatchId === null) {
    try {
      activeWebWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (pos && isValidPosition(pos)) {
            saveLastKnownPosition(pos);
          }
        },
        () => {},
        watchOpts
      );
    } catch (e) {
      activeWebWatchId = null;
    }
  }
}

/**
 * Pre-calienta el receptor GPS en segundo plano (sin bloquear UI)
 * e inicia el rastreo satelital continuo para dispositivos sin chip / sin internet.
 */
export function warmUpGeolocation() {
  startGpsBackgroundWatch().catch(() => {});
  getOptionalPositionFast(8000).catch(() => {});
}

/**
 * Ejecuta una consulta individual al proveedor de ubicación (Nativo o Web)
 * y solo resuelve si obtiene una coordenada válida.
 */
async function querySingleProvider(opts) {
  if (Capacitor.isNativePlatform()) {
    try {
      const pos = await Geolocation.getCurrentPosition(opts);
      if (isValidPosition(pos)) {
        saveLastKnownPosition(pos);
        return pos;
      }
    } catch (nativeErr) {
      if ('geolocation' in navigator) {
        const webPos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, opts);
        });
        if (isValidPosition(webPos)) {
          saveLastKnownPosition(webPos);
          return webPos;
        }
      }
      throw nativeErr;
    }
  }

  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    throw new Error('Geolocalización no soportada');
  }
  const webPos = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, opts);
  });
  if (isValidPosition(webPos)) {
    saveLastKnownPosition(webPos);
    return webPos;
  }
  throw new Error('POSITION_UNAVAILABLE');
}

/**
 * Compite en PARALELO entre el chip GPS satelital físico (enableHighAccuracy: true, único que funciona
 * en equipos SIN SIM y SIN internet) y el proveedor de red/Wi-Fi (enableHighAccuracy: false).
 * Si el proveedor de red falla al instante por no tener chip ni Wi-Fi, NO cancela al GPS satelital:
 * espera a que cualquiera de los dos entregue una coordenada válida o hasta que venza el timeout total.
 */
async function raceHardwareAndNetworkGps(timeoutMs, maxAgeMs = 300000) {
  startGpsBackgroundWatch().catch(() => {});

  const highAccOpts = {
    enableHighAccuracy: true,
    timeout: timeoutMs,
    maximumAge: maxAgeMs,
  };

  const lowAccOpts = {
    enableHighAccuracy: false,
    timeout: timeoutMs,
    maximumAge: Math.max(maxAgeMs, 600000),
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    let failureCount = 0;
    let lastError = null;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        const cached = getLastKnownPosition();
        if (cached) {
          resolve(cached);
        } else {
          reject(new Error('TIMEOUT'));
        }
      }
    }, timeoutMs + 250);

    const onSuccess = (pos) => {
      if (!settled && isValidPosition(pos)) {
        settled = true;
        clearTimeout(timer);
        saveLastKnownPosition(pos);
        resolve(pos);
      }
    };

    const onFailure = (err) => {
      failureCount += 1;
      lastError = err;
      if (!settled && failureCount >= 2) {
        settled = true;
        clearTimeout(timer);
        const cached = getLastKnownPosition();
        if (cached) {
          resolve(cached);
        } else {
          reject(lastError || new Error('POSITION_UNAVAILABLE'));
        }
      }
    };

    // Correr ambos proveedores en paralelo:
    // - En equipos CON internet/Wi-Fi, lowAccOpts suele responder en <1s bajo techo.
    // - En equipos SIN chip (SIM) y SIN internet, lowAccOpts falla rápido pero highAccOpts
    //   cuenta con el 100% del tiempo (timeoutMs completo) para recibir señal de los satélites.
    querySingleProvider(highAccOpts).then(onSuccess).catch(onFailure);
    querySingleProvider(lowAccOpts).then(onSuccess).catch(onFailure);
  });
}

/**
 * Obtiene la ubicación actual de forma segura.
 * - En equipos sin chip ni internet usa el 100% del tiempo para el GPS satelital físico.
 */
export async function getCurrentPositionSafe(options = {}) {
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const timeoutMs = Number(options.timeout) || (isOffline ? 12000 : 10000);
  const maxAgeMs = Number(options.maximumAge) || (isOffline ? 600000 : 300000);

  const hasPerm = await ensureNativeLocationPermission();
  if (!hasPerm && Capacitor.isNativePlatform()) {
    throw new Error('PERMISSION_DENIED');
  }

  // Si el watcher satelital ya tiene una coordenada reciente (< 60s), devolverla de inmediato
  const fresh = getLastKnownPosition(60 * 1000);
  if (fresh) {
    return fresh;
  }

  const normalizeError = (err) => {
    const msg = (err?.message || '').toLowerCase();
    if (err?.code === 1 || msg.includes('denied') || msg.includes('permission')) {
      return new Error('PERMISSION_DENIED');
    }
    if (err?.code === 2 || msg.includes('unavailable') || msg.includes('disabled')) {
      return new Error('POSITION_UNAVAILABLE');
    }
    if (err?.code === 3 || msg.includes('timeout')) {
      return new Error('TIMEOUT');
    }
    return err instanceof Error ? err : new Error(String(err || 'POSITION_UNAVAILABLE'));
  };

  try {
    return await raceHardwareAndNetworkGps(timeoutMs, maxAgeMs);
  } catch (error) {
    const cached = getLastKnownPosition();
    if (cached) {
      return cached;
    }
    throw normalizeError(error);
  }
}

/**
 * Obtiene la ubicación rápidamente sin bloquear el flujo de visitas/evaluaciones:
 * 1. Mantiene encendido el receptor GPS satelital en segundo plano (watchPosition).
 * 2. Si el watcher satelital tiene una ubicación reciente (< 90s online, < 3 min offline), la entrega en 0ms.
 * 3. Si no, lanza en PARALELO GPS Satelital (enableHighAccuracy: true) y Red (enableHighAccuracy: false)
 *    dándole el 100% del tiempo al chip GPS satelital (sin cortarlo a la mitad cuando no hay SIM ni Wi-Fi).
 * 4. Si el dispositivo está dentro de una tienda con techo grueso sin vista al cielo y sin SIM/Wi-Fi,
 *    usa la última coordenada satelital capturada en la ruta o devuelve null sin trabar el guardado.
 */
export async function getOptionalPositionFast(timeoutMs = 6000) {
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  // Si está offline (sin internet/sin chip), dar al menos 8s al receptor satelital si se pidió 6s
  const defaultTimeout = isOffline ? Math.max(8000, Number(timeoutMs) || 8000) : (Number(timeoutMs) || 6000);
  const safeTimeout = Math.max(2500, defaultTimeout);

  // 1. Respuesta instantánea (0ms) si el watcher en segundo plano ya capturó satélites recientemente
  const freshWindowMs = isOffline ? 3 * 60 * 1000 : 90 * 1000;
  const veryFresh = getLastKnownPosition(freshWindowMs);
  if (veryFresh) {
    return veryFresh;
  }

  try {
    const hasPerm = await ensureNativeLocationPermission();
    if (!hasPerm) return getLastKnownPosition();

    const pos = await raceHardwareAndNetworkGps(safeTimeout, isOffline ? 600000 : 300000);
    if (pos && isValidPosition(pos)) {
      return pos;
    }
    return getLastKnownPosition();
  } catch (err) {
    console.warn('[geolocation] getOptionalPositionFast:', err?.message || err);
    return getLastKnownPosition();
  }
}
