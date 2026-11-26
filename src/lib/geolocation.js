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

// Cache en memoria + sessionStorage de la última ubicación válida para respuestas instantáneas
const LAST_POS_STORAGE_KEY = 'cf_last_known_gps_v1';
const LAST_POS_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutos
let memoryLastPosition = null;

function saveLastKnownPosition(pos) {
  if (!pos?.coords) return;
  const lat = Number(pos.coords.latitude);
  const lng = Number(pos.coords.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return;
  const snapshot = {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy: Number(pos.coords.accuracy) || 50,
    },
    timestamp: Date.now(),
  };
  memoryLastPosition = snapshot;
  try {
    sessionStorage.setItem(LAST_POS_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {}
}

function getLastKnownPosition(maxAgeMs = LAST_POS_MAX_AGE_MS) {
  const now = Date.now();
  if (memoryLastPosition && now - memoryLastPosition.timestamp <= maxAgeMs) {
    return memoryLastPosition;
  }
  try {
    const raw = sessionStorage.getItem(LAST_POS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.coords && now - (parsed.timestamp || 0) <= maxAgeMs) {
        memoryLastPosition = parsed;
        return parsed;
      }
    }
  } catch {}
  return null;
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
 * Pre-calienta el receptor GPS en segundo plano (sin bloquear UI)
 * para que al guardar visita/evaluación la coordenada ya esté lista.
 */
export function warmUpGeolocation() {
  getOptionalPositionFast(6000).catch(() => {});
}

/**
 * Obtiene la ubicación actual de forma segura.
 * - En APK: usa Capacitor Geolocation con verificación previa de permisos
 * - En web: usa navigator.geolocation
 * - Resuelve problemas de timeout dando tiempo suficiente (25s para GPS offline)
 *   y realizando fallbacks a baja precisión o caché reciente si es necesario.
 */
export async function getCurrentPositionSafe(options = {}) {
  // Configuración predeterminada robusta para trabajo offline / campo
  const defaultOpts = {
    enableHighAccuracy: true,
    timeout: 10000,           // 10s alta precisión antes de pasar a red/celdas
    maximumAge: 180000,       // Acepta posición reciente de hasta 3 min de inmediato
  };

  const finalOpts = { ...defaultOpts, ...options };

  const hasPerm = await ensureNativeLocationPermission();
  if (!hasPerm && Capacitor.isNativePlatform()) {
    throw new Error('PERMISSION_DENIED');
  }

  /**
   * Helper unificado para llamar a la API correspondiente (Nativa o Web)
   */
  const fetchPosition = async (opts) => {
    if (Capacitor.isNativePlatform()) {
      try {
        const pos = await Geolocation.getCurrentPosition(opts);
        saveLastKnownPosition(pos);
        return pos;
      } catch (nativeErr) {
        // Fallback al FusedLocation del WebView si el plugin nativo falla
        if ('geolocation' in navigator) {
          const webPos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, opts);
          });
          saveLastKnownPosition(webPos);
          return webPos;
        }
        throw nativeErr;
      }
    } else {
      if (!('geolocation' in navigator)) {
        throw new Error('Geolocalización no soportada');
      }
      const webPos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, opts);
      });
      saveLastKnownPosition(webPos);
      return webPos;
    }
  };

  /**
   * Normalizador de errores para devolver siempre el mismo formato
   */
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
    return err;
  };

  try {
    return await fetchPosition(finalOpts);
  } catch (error) {
    const normErr = normalizeError(error);

    if (normErr.message !== 'PERMISSION_DENIED') {
      console.warn('[geolocation] High accuracy falló, reintentando con precisión de red/Wi-Fi/celdas...');

      // 1. Reintento rápido con baja precisión (red/celdas/Wi-Fi)
      try {
        const lowAccuracyOpts = {
          ...finalOpts,
          enableHighAccuracy: false,
          timeout: 6000,
          maximumAge: 600000,
        };
        return await fetchPosition(lowAccuracyOpts);
      } catch (errLow) {
        // 2. Último recurso: posición reciente guardada en memoria/sesión
        const cached = getLastKnownPosition();
        if (cached) {
          console.log('[geolocation] Usando última ubicación válida en caché.');
          return cached;
        }
        throw normalizeError(errLow);
      }
    }

    throw normErr;
  }
}

/**
 * Intenta obtener la ubicación rápidamente (por defecto máx. 6s):
 * 1. Verifica/solicita permiso nativo primero (sin descontar tiempo del reloj de 6s).
 * 2. Si hay una ubicación muy reciente (< 45s), la usa de inmediato.
 * 3. Intenta GPS de alta precisión durante ~3.5s.
 * 4. Si está bajo techo o tarda, hace fallback inmediato a ubicación por Red/Wi-Fi/Celdas (~2.5s).
 * 5. Si todo expira, usa la última ubicación conocida de la sesión (hasta 15 min) o devuelve null sin bloquear.
 */
export async function getOptionalPositionFast(timeoutMs = 6000) {
  const safeTimeout = Math.max(2000, Number(timeoutMs) || 6000);

  // Si ya tenemos una coordenada fresca (< 45 segundos), devolverla al instante
  const veryFresh = getLastKnownPosition(45 * 1000);
  if (veryFresh) {
    return veryFresh;
  }

  try {
    const hasPerm = await ensureNativeLocationPermission();
    if (!hasPerm) return getLastKnownPosition();

    const highAccTimeout = Math.max(1500, Math.round(safeTimeout * 0.58)); // ~3.5s de 6s
    const lowAccTimeout = Math.max(1500, safeTimeout - highAccTimeout);   // ~2.5s de 6s

    const queryOnce = async (highAccuracy, tOut, maxAge) => {
      const opts = {
        enableHighAccuracy: highAccuracy,
        timeout: tOut,
        maximumAge: maxAge,
      };

      const callProvider = async () => {
        if (Capacitor.isNativePlatform()) {
          try {
            return await Geolocation.getCurrentPosition(opts);
          } catch {
            if ('geolocation' in navigator) {
              return await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, opts);
              });
            }
            return null;
          }
        }
        if (!('geolocation' in navigator)) return null;
        return await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, opts);
        });
      };

      const guardTimer = new Promise((resolve) => setTimeout(() => resolve(null), tOut + 200));
      return await Promise.race([callProvider(), guardTimer]);
    };

    // Intento 1: Alta precisión (GPS)
    let pos = await queryOnce(true, highAccTimeout, 180000).catch(() => null);

    // Intento 2: Baja precisión (Red / Wi-Fi / Antenas celulares - funciona bajo techo en <1.5s)
    if (!pos || !pos.coords) {
      pos = await queryOnce(false, lowAccTimeout, 600000).catch(() => null);
    }

    if (pos && pos.coords && Number.isFinite(pos.coords.latitude) && Number.isFinite(pos.coords.longitude)) {
      saveLastKnownPosition(pos);
      return pos;
    }

    // Intento 3: Última ubicación válida conocida en los últimos 15 minutos
    return getLastKnownPosition();
  } catch (err) {
    console.warn('[geolocation] getOptionalPositionFast omitido:', err?.message || err);
    return getLastKnownPosition();
  }
}
