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
    timeout: 25000,           // 25s para fijar satélites GPS en frío u offline
    maximumAge: 120000,       // Acepta posición reciente de hasta 2 min de inmediato
  };

  const finalOpts = { ...defaultOpts, ...options };

  /**
   * Helper unificado para llamar a la API correspondiente (Nativa o Web)
   */
  const fetchPosition = async (opts) => {
    if (Capacitor.isNativePlatform()) {
      try {
        const permStatus = await Geolocation.checkPermissions();
        if (permStatus.location !== 'granted' && permStatus.coarseLocation !== 'granted') {
          await Geolocation.requestPermissions();
        }
      } catch (e) {
        // En algunas plataformas checkPermissions puede fallar silenciosamente; continuar
      }
      return await Geolocation.getCurrentPosition(opts);
    } else {
      if (!('geolocation' in navigator)) {
        throw new Error('Geolocalización no soportada');
      }
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, opts);
      });
    }
  };

  /**
   * Normalizador de errores para devolver siempre el mismo formato
   */
  const normalizeError = (err) => {
    const msg = (err?.message || '').toLowerCase();
    if (err.code === 1 || msg.includes('denied') || msg.includes('permission')) {
      return new Error('PERMISSION_DENIED');
    }
    if (err.code === 2 || msg.includes('unavailable')) {
      return new Error('POSITION_UNAVAILABLE');
    }
    if (err.code === 3 || msg.includes('timeout')) {
      return new Error('TIMEOUT');
    }
    return err;
  };

  // ---------------------------------------------------------
  // ESTRATEGIA RESILIENTE:
  // 1. Alta precisión con timeout adecuado
  // 2. Fallback a baja precisión (red/celdas)
  // 3. Fallback a última posición en caché disponible
  // ---------------------------------------------------------
  try {
    return await fetchPosition(finalOpts);
  } catch (error) {
    const normErr = normalizeError(error);

    if ((normErr.message === 'TIMEOUT' || normErr.message === 'POSITION_UNAVAILABLE') && finalOpts.enableHighAccuracy) {
      console.warn('[geolocation] High accuracy falló, reintentando con precisión de red o caché...');

      // 1. Reintento con baja precisión (red/celdas) y caché de 5 minutos
      try {
        const lowAccuracyOpts = {
          ...finalOpts,
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 300000,
        };
        return await fetchPosition(lowAccuracyOpts);
      } catch (errLow) {
        // 2. Último recurso: intentar cualquier posición en caché de los últimos 15 minutos
        try {
          console.warn('[geolocation] Reintentando con última posición en caché disponible...');
          const cacheOpts = {
            enableHighAccuracy: false,
            timeout: 5000,
            maximumAge: 900000, // 15 minutos
          };
          return await fetchPosition(cacheOpts);
        } catch (errCache) {
          throw normalizeError(errLow);
        }
      }
    }

    throw normErr;
  }
}

/**
 * Intenta obtener la ubicación rápidamente (por defecto máx. 3s) sin reintentos largos.
 * Si hay timeout, falta de señal o error, devuelve null para omitir la geolocalización sin bloquear.
 */
export async function getOptionalPositionFast(timeoutMs = 3000) {
  const safeTimeout = Math.max(500, Number(timeoutMs) || 3000);
  try {
    const attempt = (async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const permStatus = await Geolocation.checkPermissions();
          if (permStatus.location !== 'granted' && permStatus.coarseLocation !== 'granted') {
            return null;
          }
        } catch (e) {
          // continuar
        }
        return await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: safeTimeout,
          maximumAge: 120000,
        });
      }
      if (!('geolocation' in navigator)) return null;
      return await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: safeTimeout,
          maximumAge: 120000,
        });
      });
    })();

    const timer = new Promise((resolve) => setTimeout(() => resolve(null), safeTimeout + 250));
    const pos = await Promise.race([attempt, timer]);
    if (pos && pos.coords && Number.isFinite(pos.coords.latitude) && Number.isFinite(pos.coords.longitude)) {
      return pos;
    }
    return null;
  } catch (err) {
    console.warn('[geolocation] getOptionalPositionFast omitido:', err?.message || err);
    return null;
  }
}
