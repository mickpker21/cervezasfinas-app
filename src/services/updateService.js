import { Capacitor, CapacitorHttp } from '@capacitor/core';

// Ensure this matches the version in package.json
export const APP_CURRENT_VERSION = '2.2.3';

// URL to the version manifest hosted on your server
export const UPDATE_MANIFEST_URL = 'https://cervezasfinas.com/apps/version.json';

/**
 * Parses semantic versions to numbers for easy comparison.
 * e.g., '1.0.4' -> [1, 0, 4]
 */
function parseVersion(versionString) {
  if (!versionString) return [0, 0, 0];
  const parts = versionString.split('.').map(p => parseInt(p, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/**
 * Compare two semantic versions.
 * Returns true if v1 > v2.
 */
export function isNewerVersion(remoteVersion, localVersion) {
  const vRemote = parseVersion(remoteVersion);
  const vLocal = parseVersion(localVersion);

  for (let i = 0; i < 3; i++) {
    if (vRemote[i] > vLocal[i]) return true;
    if (vRemote[i] < vLocal[i]) return false;
  }
  return false;
}

/**
 * Devuelve la versión activa real de la aplicación (la mayor entre APP_CURRENT_VERSION
 * compilada en el código y current_ota_version guardada por OTA en localStorage).
 */
export function getDisplayAppVersion() {
  try {
    const savedOta = typeof localStorage !== 'undefined' ? localStorage.getItem('current_ota_version') : null;
    if (savedOta && isNewerVersion(savedOta, APP_CURRENT_VERSION)) {
      return savedOta;
    }
    if (savedOta && isNewerVersion(APP_CURRENT_VERSION, savedOta)) {
      localStorage.setItem('current_ota_version', APP_CURRENT_VERSION);
    }
  } catch {}
  return APP_CURRENT_VERSION;
}

/**
 * Checks if there is an update available on the server.
 * Returns an object with the update details or null if no update.
 */
export async function checkForUpdate() {
  if (!Capacitor.isNativePlatform()) {
    console.log('[updateService] Skipping update check on web platform.');
    return null; // Updates are pushed automatically on web
  }

  try {
    const timestamp = new Date().getTime(); // Prevent caching
    const url = `${UPDATE_MANIFEST_URL}?_t=${timestamp}`;

    let manifest;
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.get({
        url,
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (response.status !== 200) {
        throw new Error(`Failed to fetch version manifest natively: ${response.status}`);
      }

      manifest = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } else {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch version manifest: ${response.status}`);
      }

      manifest = await response.json();
    }

    console.log(`[updateService] Remote version: ${manifest.version}, Local version: ${APP_CURRENT_VERSION}`);

    if (isNewerVersion(manifest.version, APP_CURRENT_VERSION)) {
      return {
        hasUpdate: true,
        version: manifest.version,
        url: manifest.url,
        force: manifest.force || false,
        notes: manifest.notes || 'Una nueva versión de Cervezas Finas está disponible.'
      };
    }
    
    return null;
  } catch (error) {
    console.error('[updateService] Error checking for updates:', error);
    return null;
  }
}
