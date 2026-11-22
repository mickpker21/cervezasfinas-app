// ============================================================
// printerRepository.js
// Gestión de config de impresora por usuario: Supabase + kvStorage
// ============================================================
import { supabase } from '@/supabaseClient';
import { kvStorage } from '@/services/kvStorage';
import { DEFAULT_PRINTER_CONFIG } from '@/lib/printerProfiles';

const CACHE_KEY = 'user_printer_config';

/**
 * Obtiene la config de impresora del usuario actual.
 * Lee de kvStorage primero, luego Supabase.
 */
export async function getUserPrinterConfig(userId) {
  // 1. Cache local
  try {
    const cached = await kvStorage.getItem(CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch (_) {}

  // 2. Supabase
  if (!userId) return DEFAULT_PRINTER_CONFIG;

  try {
    const { data, error } = await supabase
      .from('user_printer_configs')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!error && data) {
      const config = normalizeConfig(data);
      await kvStorage.setItem(CACHE_KEY, JSON.stringify(config));
      return config;
    }
  } catch (_) {}

  return DEFAULT_PRINTER_CONFIG;
}

/**
 * Guarda o actualiza la config de impresora del usuario.
 */
export async function saveUserPrinterConfig(userId, config) {
  if (!userId) throw new Error('userId requerido');

  const payload = {
    user_id: userId,
    brand: config.brand,
    model: config.model || null,
    device_id: config.deviceId || null,
    paper_width: config.paperWidth,
    char_width: config.charWidth,
    ble_service_uuid: config.bleServiceUuid,
    ble_char_uuid: config.bleCharUuid || null,
    connection_type: config.connectionType,
    custom_config: config.customConfig || {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('user_printer_configs')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) throw error;

  const normalized = normalizeConfig(data);
  await kvStorage.setItem(CACHE_KEY, JSON.stringify(normalized));
  return normalized;
}

/**
 * Guarda el device_id (MAC) en cache local inmediatamente (para auto-reconexión).
 */
export async function cacheDeviceId(deviceId) {
  try {
    const cached = await kvStorage.getItem(CACHE_KEY);
    const config = cached ? JSON.parse(cached) : { ...DEFAULT_PRINTER_CONFIG };
    config.deviceId = deviceId;
    await kvStorage.setItem(CACHE_KEY, JSON.stringify(config));
    // También guardar en localStorage para compatibilidad con código existente
    localStorage.setItem('last_printer_id', deviceId);
  } catch (_) {}
}

/**
 * Limpia la config de impresora en cache (desconectar).
 */
export async function clearPrinterDeviceCache() {
  try {
    const cached = await kvStorage.getItem(CACHE_KEY);
    if (cached) {
      const config = JSON.parse(cached);
      config.deviceId = null;
      await kvStorage.setItem(CACHE_KEY, JSON.stringify(config));
    }
    localStorage.removeItem('last_printer_id');
  } catch (_) {}
}

/**
 * Sincroniza la config de impresora al iniciar sesión.
 */
export async function syncPrinterConfigOnLogin(userId) {
  if (!userId) return;
  try {
    const { data, error } = await supabase
      .from('user_printer_configs')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!error && data) {
      const config = normalizeConfig(data);
      // Preservar deviceId del localStorage si existe
      const lastId = localStorage.getItem('last_printer_id');
      if (lastId && !config.deviceId) config.deviceId = lastId;
      await kvStorage.setItem(CACHE_KEY, JSON.stringify(config));
    }
  } catch (e) {
    console.warn('[printerRepository] syncPrinterConfigOnLogin error:', e);
  }
}

// Normaliza columnas snake_case de Supabase a camelCase
function normalizeConfig(row) {
  return {
    brand: row.brand || 'generic_58',
    model: row.model || '',
    deviceId: row.device_id || localStorage.getItem('last_printer_id') || null,
    paperWidth: row.paper_width || 58,
    charWidth: row.char_width || 32,
    bleServiceUuid: row.ble_service_uuid || '000018f0-0000-1000-8000-00805f9b34fb',
    bleCharUuid: row.ble_char_uuid || '00002af1-0000-1000-8000-00805f9b34fb',
    connectionType: row.connection_type || 'ble',
    customConfig: row.custom_config || {},
  };
}
