import { Network } from '@capacitor/network';

const STORAGE_KEY_OFFLINE_MODE = 'manual_offline_mode';
const SUPABASE_HEALTH_URL = `${(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')}/auth/v1/health`;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ONLINE_CACHE_MS = 10000;
const OFFLINE_CACHE_MS = 2500;
const REACHABILITY_TIMEOUT_MS = 2500;

let reachabilityCache = { value: null, checkedAt: 0 };
let reachabilityCheck = null;

async function hasInternetAccess() {
  if (!SUPABASE_HEALTH_URL || !SUPABASE_ANON_KEY) return false;
  const now = Date.now();
  const cacheDuration = reachabilityCache.value ? ONLINE_CACHE_MS : OFFLINE_CACHE_MS;
  if (reachabilityCache.value !== null && now - reachabilityCache.checkedAt < cacheDuration) {
    return reachabilityCache.value;
  }
  if (reachabilityCheck) return reachabilityCheck;

  reachabilityCheck = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS);
    let reachable = false;
    try {
      const response = await fetch(SUPABASE_HEALTH_URL, {
        method: 'GET',
        headers: { apikey: SUPABASE_ANON_KEY },
        cache: 'no-store',
        signal: controller.signal,
      });
      // A 4xx still proves that the device can reach the service. 5xx and
      // network errors should use the local repositories instead.
      reachable = response.status >= 200 && response.status < 500;
    } catch (_) {
      reachable = false;
    } finally {
      clearTimeout(timeoutId);
      reachabilityCache = { value: reachable, checkedAt: Date.now() };
      reachabilityCheck = null;
    }
    return reachable;
  })();

  return reachabilityCheck;
}

export async function getOfflineMode() {
  return localStorage.getItem(STORAGE_KEY_OFFLINE_MODE) === 'true';
}

export async function setOfflineMode(enabled) {
  if (enabled) {
    localStorage.setItem(STORAGE_KEY_OFFLINE_MODE, 'true');
  } else {
    localStorage.removeItem(STORAGE_KEY_OFFLINE_MODE);
  }
  // Dispatch event for UI updates
  window.dispatchEvent(new CustomEvent('network-status-changed'));
}

export async function isOnline() {
  if (await getOfflineMode()) {
    console.log('[network] Manual offline mode ACTIVE');
    return false;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  try {
    const status = await Network.getStatus();
    if (!status.connected || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      return false;
    }
    // Android can report connected when Wi-Fi/mobile data has no internet.
    // Verify actual reachability so offline repositories use their SQLite copy.
    return await hasInternetAccess();
  } catch (err) {
    console.warn('[network] No se pudo obtener el estado de red', err);
    return false;
  }
}

let networkListener = null;
let lastConnectionState = null;

/**
 * Configura listener de red para auto-sincronización al reconectar
 */
export async function setupNetworkSync() {
  if (networkListener) {
    console.log('[network] ⚠️ Listener ya configurado - skipping duplicate setup');
    return;
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('📡 [NETWORK] Configurando listener de red');
  console.log('═══════════════════════════════════════════════════════');

  try {
    // Guardar estado inicial
    const initialStatus = await Network.getStatus();
    lastConnectionState = initialStatus.connected;

    networkListener = await Network.addListener('networkStatusChange', async (status) => {
      const wasOffline = lastConnectionState === false;
      const isNowOnline = status.connected === true;

      console.log('═══════════════════════════════════════════════════════');
      console.log('📶 [NETWORK] CAMBIO DE ESTADO DETECTADO');
      console.log('═══════════════════════════════════════════════════════');
      console.log('[network] Estado anterior (offline?):', wasOffline);
      console.log('[network] Estado actual (online?):', isNowOnline);
      console.log('[network] Connected:', status.connected);

      // Solo sincronizar si pasamos de offline a online
      if (wasOffline && isNowOnline) {
        console.log('═══════════════════════════════════════════════════════');
        console.log('✅ [NETWORK] RECONECTADO - AUTO-SYNC INICIADO');
        console.log('═══════════════════════════════════════════════════════');

        try {
          const { syncPendingOperations } = await import('@/sync/syncService');
          const result = await syncPendingOperations();
          console.log('[network] ✓ Auto-sync completado:', result);
        } catch (e) {
          console.error('[network] ✗ Error en auto-sync:', e);
        }
      } else {
        console.log('[network] ℹ️ No es transición offline→online, no se sincroniza');
      }
      console.log('═══════════════════════════════════════════════════════');

      lastConnectionState = status.connected;
    });

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ [NETWORK] Listener configurado correctamente');
    console.log('[NETWORK] Estado inicial:', lastConnectionState ? 'ONLINE' : 'OFFLINE');
    console.log('═══════════════════════════════════════════════════════');
  } catch (e) {
    console.error('[network] ❌ Error configurando listener:', e);
  }
}

/**
 * Limpia el listener de red
 */
export async function cleanupNetworkSync() {
  if (networkListener) {
    await networkListener.remove();
    networkListener = null;
    console.log('[network] Listener removido');
  }
}
/**
 * Race a promise against a timeout.
 * If timeout wins, rejects with Error('TIMEOUT').
 * If promise wins, resolves/rejects with promise result.
 */
export const withTimeout = (promise, ms) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('TIMEOUT'));
    }, ms);
    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(reason => {
        clearTimeout(timer);
        reject(reason);
      });
  });
};

/**
 * Enhanced fetch with automatic retries, exponential backoff, and timeouts.
 * Useful for overcoming transient server errors (500) and timeouts.
 */
export async function resilientFetch(url, options = {}, { 
  retries = 3, 
  backoff = 1000, 
  timeout = 30000 
} = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        const waitTime = backoff * Math.pow(2, attempt - 1);
        console.warn(`[network] Retrying fetch in ${waitTime}ms... (Attempt ${attempt}/${retries})`);
        await new Promise(r => setTimeout(r, waitTime));
      }

      // We use the existing withTimeout logic
      const response = await withTimeout(fetch(url, options), timeout);

      // If server returns 5xx, we treat it as a retryable error
      if (response.status >= 500 && response.status <= 599) {
        throw new Error(`Server Error ${response.status}`);
      }

      return response;
    } catch (err) {
      lastError = err;
      console.error(`[network] Fetch attempt ${attempt} failed:`, err.message);
      
      // Don't retry if it's a client error (4xx) except maybe 429
      if (err.message.includes('40')) {
        throw err;
      }
    }
  }

  throw lastError || new Error('Resilient fetch failed after all attempts');
}
