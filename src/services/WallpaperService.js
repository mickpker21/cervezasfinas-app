import { registerPlugin } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';

const WallpaperPlugin = registerPlugin('Wallpaper');

/**
 * Sets the device wallpaper (Android only).
 * 
 * @param {string} url - The URL of the image to set as wallpaper.
 * @param {boolean} system - Set as home screen wallpaper (default: true)
 * @param {boolean} lock - Set as lock screen wallpaper (default: false)
 * @returns {Promise<boolean>} - True if successful
 */
export async function setDeviceWallpaper(url, system = true, lock = false) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    console.log('[WallpaperService] Wallpaper API is only available on Android native.');
    return false;
  }

  try {
    const result = await WallpaperPlugin.setWallpaper({ url, system, lock });
    return result.success;
  } catch (error) {
    console.error('[WallpaperService] Failed to set wallpaper:', error);
    return false;
  }
}
