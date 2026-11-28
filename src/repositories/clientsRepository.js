// src/repositories/clientsRepository.js
import { isOnline, withTimeout } from '@/lib/network';
import { supabase } from '@/supabaseClient';
import { getDb, isMockDb, isWeb } from '@/lib/localDb';
import { Capacitor } from '@capacitor/core';
import { fetchClientsApi, importClientsApi } from '@/lib/mysqlClients';

const PAGE_SIZE = 500;
const RECENT_COORDS_STORAGE_KEY = 'cf_recent_client_coords_v1';
const RECENT_COORDS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

let recentCoordsMemoryCache = null;

function getRecentCoordsMap() {
  if (recentCoordsMemoryCache) return recentCoordsMemoryCache;
  recentCoordsMemoryCache = {};
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RECENT_COORDS_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const now = Date.now();
        Object.entries(parsed).forEach(([key, val]) => {
          if (val && Number.isFinite(Number(val.lat)) && Number.isFinite(Number(val.lng))) {
            if (!val.updatedAt || now - val.updatedAt < RECENT_COORDS_TTL_MS) {
              recentCoordsMemoryCache[key] = {
                lat: Number(val.lat),
                lng: Number(val.lng),
                updatedAt: val.updatedAt || now,
              };
            }
          }
        });
      }
    }
  } catch (e) {
    console.warn('[clientsRepository] Error reading recent coords cache:', e);
  }
  return recentCoordsMemoryCache;
}

export function rememberClientCoords(clientId, clientCode, lat, lng) {
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLng) || (numLat === 0 && numLng === 0)) return;
  const map = getRecentCoordsMap();
  const entry = { lat: numLat, lng: numLng, updatedAt: Date.now() };
  if (clientId) map[`id:${String(clientId).trim()}`] = entry;
  if (clientCode) map[`code:${String(clientCode).trim().toUpperCase()}`] = entry;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(RECENT_COORDS_STORAGE_KEY, JSON.stringify(map));
    }
  } catch (e) {
    console.warn('[clientsRepository] Error saving recent coords cache:', e);
  }
}

export function getRememberedClientCoords(clientOrId, clientCode = null) {
  const map = getRecentCoordsMap();
  const id = typeof clientOrId === 'object' ? clientOrId?.id : clientOrId;
  const code = typeof clientOrId === 'object'
    ? (clientOrId?.client_code || clientOrId?.cve_cliente || clientOrId?.code || clientCode)
    : clientCode;
  if (id && map[`id:${String(id).trim()}`]) {
    return map[`id:${String(id).trim()}`];
  }
  if (code && map[`code:${String(code).trim().toUpperCase()}`]) {
    return map[`code:${String(code).trim().toUpperCase()}`];
  }
  return null;
}

/**
 * Descarga TODOS los clientes de Supabase en bloques de PAGE_SIZE
 */
// Helper seguro para online
async function safeIsOnline() {
  try {
    return await isOnline();
  } catch {
    return false;
  }
}

/**
 * Descarga clientes de MySQL API (Todos o filtrados por ruta)
 */
export async function fetchAllClientsOnline(routeOrRoutes = null, onProgress = null, basic = false) {
  let totalSaved = 0;
  const limit = 500;

  // Detect if we are in "Stream Mode" (Progress callback provided)
  // If provided, we assume the caller handles data persistence (saving to DB) and we DO NOT accumulate in RAM.
  const isStreamMode = typeof onProgress === 'function';
  let all = [];

  if (Array.isArray(routeOrRoutes)) {
    console.log(`[clientsRepository] Batch fetching for ${routeOrRoutes.length} routes (StreamMode: ${isStreamMode})...`);

    // CHUNK STRATEGY: 
    // URLs have a limit (approx 2000-8000 chars). 100 routes * 5 chars = 500 chars, so it should be fine.
    // However, PHP or MySQL `IN (...)` might have limits or performance issues with huge lists.
    // Safe chunk size: 5 routes per request (Reduced from 20 to fix partial sync).
    const CHUNK_SIZE = 5;

    // Create chunks
    const chunks = [];
    for (let i = 0; i < routeOrRoutes.length; i += CHUNK_SIZE) {
      chunks.push(routeOrRoutes.slice(i, i + CHUNK_SIZE));
    }

    console.log(`[clientsRepository] Split into ${chunks.length} chunks to prevent timeouts/URL errors.`);

    let chunkIndex = 0;
    for (const chunk of chunks) {
      chunkIndex++;
      console.log(`[clientsRepository] Processing chunk ${chunkIndex}/${chunks.length} (${chunk.length} routes)...`);

      // Wait a bit to prevent UI freeze / ANR
      if (chunkIndex > 1) await new Promise(r => setTimeout(r, 100));

      // 1. Fetch by sales_routes (Chunked)
      // If StreamMode, fetchClientsBatch runs the callback for each page.
      const batchClients = await fetchClientsBatch(chunk, 'sales_routes', limit, isStreamMode ? onProgress : null, basic);

      if (isStreamMode) {
        // In Stream Mode, batchClients is likely empty or just a summary because onProgress handled the data.
        // Or if fetchClientsBatch returns data, we intentionally discard it after counting.
        totalSaved += (batchClients ? batchClients.length : 0);
        // FORCE GC HINT: batchClients = null; // V8 will handle it
      } else {
        all.push(...batchClients);
      }

      // OPTIONAL: Release memory of processed chunk if logic allows, 
      // but 'all' needs to accumulate. 
      // We rely on V8 to handle minor GC during the await sleep.

      // 2. Fetch by internal_routes (Chunked)
      // all.push(...await fetchClientsBatch(chunk, 'internal_routes', limit, onProgress)); 
      // NOTE: Usually sales_route is enough and internal_route matches might duplicate. 
      // If needed, uncomment. For now, strict sales_route is safer for supervisors.
    }

  } else {
    // Legacy single route fetch
    console.log(`[clientsRepository] Fetching clients from MySQL. Route filter: ${routeOrRoutes || 'NONE'}`);
    const res = await fetchClientsBatch(routeOrRoutes ? [routeOrRoutes] : null, 'sales_route', limit, isStreamMode ? onProgress : null, basic);
    if (!isStreamMode) all.push(...res);
    else totalSaved += res.length;
  }

  if (isStreamMode) {
    console.log(`[clientsRepository] STREAM COMPLETE. Total processed/saved: ${totalSaved}`);
    // Return empty array to signal "Done but data is on disk"
    return [];
  }

  // Remove potential duplicates if we fetched by multiple criteria
  const uniqueMap = new Map();
  all.forEach(c => uniqueMap.set(c.id, c));
  const uniqueList = Array.from(uniqueMap.values());

  console.log('[clientsRepository] Total unique clients received from MySQL:', uniqueList.length);
  return uniqueList.map(parseClientFields);
}

// Helper for batch pagination
// Helper for batch pagination
async function fetchClientsBatch(routes, paramName, limit, onProgress = null, basic = false) {
  let results = [];
  let offset = 0;
  while (true) {
    try {
      const params = { limit, offset };
      if (basic) params.basic = 'true';
      if (routes && routes.length > 0) {
        // Only attach if we have routes. 
        // For 'sales_route' (singular fallback), we pass single value.
        if (paramName === 'sales_route') {
          params.sales_route = routes[0];
        } else {
          params[paramName] = routes;
        }
      }

      console.log(`[SYNC_PROGRESS] Descargando Clientes: procesando lote ${offset} - ${offset + limit}...`);
      console.log(`[clientsRepository] Fetching batch offset=${offset}...`);
      const res = await fetchClientsApi(params);
      const rows = res.rows || [];

      if (rows.length > 0) {
        const parsed = rows.map(parseClientFields);

        // Stream processing / Saving
        if (onProgress) {
          await onProgress(parsed);
        }

        // Return results ONLY if NOT streaming (to save RAM)
        // If onProgress is present, we assume the caller handles storage.
        if (!onProgress) {
          results.push(...parsed);
        } else {
          // In streaming mode, we rely on the callback.
          // We push a tiny placeholder just to count if needed, or push valid data if logic requires hybrid.
          // For OOM prevention: PUSH NOTHING OR MINIMAL.
          // But we need to return something to count 'totalSaved'.
          results.push(...parsed); // We force return for count, but caller 'fetchClientsBatch' loop in 'fetchAllClientsOnline' should allow GC if not pushed to 'all'.
          // Actually, best is to return generic objects or just rely on length. 
          // Here we return full objects because 'fetchAllClientsOnline' logic uses 'batchClients.length'.
          // The key is that 'fetchAllClientsOnline' does NOT push them to 'all' array.
        }
      }

      if (rows.length < limit) break;
      offset += limit;

      // Safety break for infinite loops
      if (offset > 100000) break;
    } catch (e) {
      console.error('[clientsRepository] Error in batch fetch:', e);
      // A partial route download must be reported as failed. Its already-saved
      // pages remain in SQLite and the next sync can safely upsert them again.
      throw e;
    }
  }
  return results;
}

function parseClientFields(c) {
  if (!c) return c;

  // Normalize client_code / cve_cliente
  if (!c.client_code && c.cve_cliente) c.client_code = c.cve_cliente;
  if (!c.cve_cliente && c.client_code) c.cve_cliente = c.client_code;

  const bName = c.business_name || c.nombre_comercial || c.razon_social || c.nombre_negocio || c.negocio;
  if (!c.business_name && bName) {
    c.business_name = bName;
  }

  // Normalize name if name is empty, numeric code or equal to client_code
  const isCodeName = !c.name || String(c.name).trim() === String(c.client_code).trim() || (!isNaN(Number(c.name)) && Number(c.name) > 100);
  if (isCodeName && bName) {
    c.name = bName;
  }

  // Normalize coordinates if flat fields exist
  if (!c.lat && c.latitud) c.lat = c.latitud;
  if (!c.lat && c.latitude) c.lat = c.latitude;
  if (!c.lng && c.longitud) c.lng = c.longitud;
  if (!c.lng && c.longitude) c.lng = c.longitude;
  if (!c.lng && c.lon) c.lng = c.lon;

  // Parse coords JSON if present
  if (typeof c.coords === 'string' && c.coords.trim()) {
    try {
      const parsed = JSON.parse(c.coords);
      c.coords = parsed;
      if (Array.isArray(parsed) && parsed.length >= 2) {
        c.lat = Number(parsed[0]);
        c.lng = Number(parsed[1]);
      } else if (typeof parsed === 'object' && parsed) {
        c.lat = Number(parsed.lat);
        c.lng = Number(parsed.lng);
      }
    } catch (e) {
      // ignore parse error, keep as is
    }
  }

  // Final casting to Number and 0-check
  if (c.lat !== undefined && c.lat !== null) c.lat = Number(c.lat);
  if (c.lng !== undefined && c.lng !== null) c.lng = Number(c.lng);

  // Overlay any recently updated client coordinates (prevents stale API/cache overwrites after "Actualizar Geo")
  const remembered = getRememberedClientCoords(c);
  if (remembered) {
    c.lat = remembered.lat;
    c.lng = remembered.lng;
    c.latitude = remembered.lat;
    c.longitude = remembered.lng;
    c.coords = { lat: remembered.lat, lng: remembered.lng };
  } else if (Number.isFinite(c.lat) && Number.isFinite(c.lng) && !(c.lat === 0 && c.lng === 0)) {
    if (!c.coords || typeof c.coords !== 'object') {
      c.coords = { lat: c.lat, lng: c.lng };
    }
  }

  // Parse cooler_serials
  if (typeof c.cooler_serials === 'string') {
    if (!c.cooler_serials.trim()) {
      c.cooler_serials = [];
    } else {
      try {
        c.cooler_serials = JSON.parse(c.cooler_serials);
      } catch (e) {
        // if not json, maybe comma separated? or just wrap in array
        c.cooler_serials = [c.cooler_serials];
      }
    }
  }

  return c;
}

/**
 * Busca un único cliente por código (MySQL)
 */
export async function getClientByCode(code) {
  if (!code) return null;

  const localMatches = await loadClientsFromLocalByCodes([code]);
  if (localMatches?.[0] && Number(localMatches[0].synced) === 0) {
    return parseClientFields(localMatches[0]);
  }

  const online = await safeIsOnline();

  if (online) {
    try {
      const res = await fetchClientsApi({ client_code: code, limit: 1 });
      if (res.rows?.[0]) return parseClientFields(res.rows[0]);
    } catch (err) {
      console.error('[clientsRepository] getClientByCode error:', err);
    }
  }

  if (localMatches?.[0]) return parseClientFields(localMatches[0]);
  const local = await loadClientsFromLocal();
  return local.find(c => String(c.client_code) === String(code)) || null;
}

/**
 * Busca un único cliente por ID (MySQL) con persistencia local
 */
export async function getClientById(id) {
  if (!id) return null;

  // 1. Revisar primero SQLite indexado por ID (1ms). Si tiene cambios locales pendientes (synced=0), priorizarlo.
  const localMatches = await loadClientsFromLocalByIds([id]);
  const localClient = localMatches?.[0] || null;
  if (localClient && Number(localClient.synced) === 0) {
    return parseClientFields(localClient);
  }

  const online = await safeIsOnline();

  if (online) {
    try {
      const res = await fetchClientsApi({ id, limit: 1 });
      if (res.rows?.[0]) {
        const parsed = parseClientFields(res.rows[0]);
        // Guardar localmente para futuras consultas offline
        await saveClientsBatchToLocal([parsed]);
        return parsed;
      }
    } catch (err) {
      console.error('[clientsRepository] getClientById error:', err);
    }
  }

  // Fallback local rápido
  if (localClient) return parseClientFields(localClient);
  const local = await loadClientsFromLocal();
  return local.find(c => String(c.id) === String(id)) || null;
}

/**
 * Búsqueda general por nombre/negocio/código (Usa la misma lógica que el menú principal)
 */
export async function searchClients(query) {
  if (!query) return [];
  
  try {
    // Usamos el motor principal de búsqueda que ya sabemos que funciona bien
    const response = await getClientsPaged({
      page: 1,
      pageSize: 50,
      filters: { search: query }
    });
    
    return response.data || [];
  } catch (err) {
    console.error('[clientsRepository] searchClients error:', err);
    return [];
  }
}

/**
 * Get clients by owner_id (MySQL)
 */
export async function getClientsByOwner(ownerId) {
  if (!isOnline()) return [];
  try {
    const res = await fetchClientsApi({ owner_id: ownerId }); // defaults to limit 1000, maybe need loop if huge
    return (res.rows || []).map(parseClientFields);
  } catch (err) {
    console.error('Error fetching clients by owner:', err);
    return [];
  }
}

/**
 * Generic paged fetch for lists (AdminClients, etc)
 */
export async function getClientsPaged({ page = 1, pageSize = 50, filters = {}, userId = null }) {
  // Web Mode: Direct API Call (User Request)
  // Bypasses local DB entirely to avoid synchronization issues on localhost
  if (isWeb()) {
    console.log(`[clientsRepository] WEB MODE: Fetching page ${page} directly from API...`);
    try {
      // Map filters to API params
      const apiParams = {
        limit: pageSize,
        offset: (page - 1) * pageSize,
        ...filters
      };

      // If pageSize is exceptionally large, chunk the requests to prevent PHP OOM / 500 errors
      let rows = [];
      let count = 0;

      if (pageSize > 5000) {
        console.warn('[clientsRepository] Large page size requested in Web Mode, chunking the payload to prevent Server 500 errors:', pageSize);
        
        let currentOffset = (page - 1) * pageSize;
        const targetEndOffset = currentOffset + pageSize;
        const CHUNK_SIZE = 5000;

        while (currentOffset < targetEndOffset) {
          const fetchLimit = Math.min(CHUNK_SIZE, targetEndOffset - currentOffset);
          const chunkParams = {
            ...apiParams,
            limit: fetchLimit,
            offset: currentOffset,
          };
          
          try {
            const res = await fetchClientsApi(chunkParams);
            const chunkRows = (res.rows || []).map(parseClientFields);
            rows.push(...chunkRows);
            
            // If the server didn't return a full page, we've reached the end
            if (chunkRows.length < fetchLimit) {
               count = Object.hasOwn(res, 'count') ? res.count : (res.total || rows.length + ((page - 1) * pageSize));
               break;
            }
            
            currentOffset += fetchLimit;
            // Capture count from first valid response
            if (count === 0) {
               count = Object.hasOwn(res, 'count') ? res.count : (res.total || rows.length + ((page - 1) * pageSize));
            }
          } catch(err) {
            console.error('[clientsRepository] Error fetching chunk:', err);
            break; // Stop chunking on error and return what we have
          }
        }
      } else {
        const res = await fetchClientsApi(apiParams);
        rows = (res.rows || []).map(parseClientFields);
        count = Object.hasOwn(res, 'count') ? res.count : (res.total || (rows.length < pageSize ? rows.length + ((page - 1) * pageSize) : 99999));
      }

      console.log(`[clientsRepository] WEB MODE: Loaded ${rows.length} rows.`);
      if (rows.length > 0) {
        saveClientsBatchToLocal(rows).catch((err) => console.warn('[clientsRepository] Local cache save warning:', err));
      }
      return { data: rows, count: count };
    } catch (e) {
      console.error('[clientsRepository] WEB MODE Error:', e);
      console.warn('[clientsRepository] MySQL API unavailable; trying the local MySQL cache.');
      let local = await loadClientsFromLocal();
      if (filters.internal_route) local = local.filter((client) => String(client.internal_route) === String(filters.internal_route));
      if (filters.sales_route) local = local.filter((client) => String(client.sales_route) === String(filters.sales_route) || String(client.internal_route) === String(filters.sales_route));
      if (filters.internal_routes?.length || filters.sales_routes?.length) {
        const internalRoutes = new Set((filters.internal_routes || []).map(String));
        const salesRoutes = new Set((filters.sales_routes || []).map(String));
        local = local.filter((client) => internalRoutes.has(String(client.internal_route)) || salesRoutes.has(String(client.sales_route)));
      }
      if (filters.owner_id) local = local.filter((client) => String(client.owner_id) === String(filters.owner_id));
      if (filters.search) {
        const term = String(filters.search).toLowerCase();
        local = local.filter((client) => [client.name, client.business_name, client.client_code, client.rfc, client.fiscal_name]
          .some((value) => String(value || '').toLowerCase().includes(term)));
      }
      const start = (page - 1) * pageSize;
      return { data: local.slice(start, start + pageSize), count: local.length };
    }
  }

  // Native Mode: Offline First Strategy with "Fast Fail" on network
  const online = await safeIsOnline();

  if (online && pageSize <= 2000) {
    try {
      console.log('[clientsRepository] Online: Attempting fetch with timeout...');
      const offset = (page - 1) * pageSize;
      const apiParams = {
        limit: pageSize,
        offset: offset,
        ...filters
      };

      // PARALLEL FETCH: API + Local Unsynced
      const [res, localAll] = await Promise.all([
        withTimeout(fetchClientsApi(apiParams), 2000),
        loadClientsFromLocal()
      ]);

      const onlineRows = (res.rows || []).map(parseClientFields);

      // Filter Local Unsynced (Pending Upload)
      // We identify them by synced=0 OR if they are in the pending queue (though synced=0 is the flag)
      // Also exclude strict duplicates if ID matches (rare, but good for safety)
      const onlineIds = new Set(onlineRows.map(r => r.id));
      const localUnsynced = localAll.filter(c =>
        (c.synced === 0 || c.synced === false) &&
        !onlineIds.has(c.id)
      );

      // Apply filters to local unsynced (same as offline logic)
      let mergedUnsynced = localUnsynced;
      if (filters.search) {
        const term = filters.search.toLowerCase();
        mergedUnsynced = mergedUnsynced.filter(c =>
          (c.name || '').toLowerCase().includes(term) ||
          (c.business_name || '').toLowerCase().includes(term) ||
          (c.client_code || '').toLowerCase().includes(term)
        );
      }
      if (filters.sales_route) {
        // Loose check for new clients that might not have route set perfectly yet
        mergedUnsynced = mergedUnsynced.filter(c => !c.sales_route || c.sales_route == filters.sales_route);
      }

      console.log(`[clientsRepository] Online Merge: ${onlineRows.length} from API + ${mergedUnsynced.length} local unsynced`);

      // Prepend unsynced to show them first
      const finalRows = [...mergedUnsynced, ...onlineRows];

      // Background Save (Fire and Forget) - only save online rows
      saveClientsBatchToLocal(onlineRows).catch(e => console.warn('Background save failed', e));

      return { data: finalRows, count: (res.total || 0) + mergedUnsynced.length };
    } catch (e) {
      console.warn('[clientsRepository] Online fetch failed or timed out. Falling back to local.', e);
    }
  }

  // 🔁 Fallback Offline (Local SQLite)
  let all = await loadClientsFromLocal();
  if (filters.search) {
    const term = filters.search.toLowerCase();
    all = all.filter(c =>
      (c.name || '').toLowerCase().includes(term) ||
      (c.business_name || '').toLowerCase().includes(term) ||
      (c.client_code || '').toLowerCase().includes(term)
    );
  }

  if (filters.sales_route) {
    all = all.filter(c => c.sales_route == filters.sales_route);
  }

  if (filters.zona) {
    all = all.filter(c => (c.zona || c.zona_comercial || '').toLowerCase().includes(filters.zona.toLowerCase()));
  }

  // Note: supervisor filter uses sales_routes & internal_routes (arrays), we handle both with OR
  if ((filters.sales_routes && Array.isArray(filters.sales_routes)) || (filters.internal_routes && Array.isArray(filters.internal_routes))) {
    const salesSet = new Set((filters.sales_routes || []).map(String));
    const internalSet = new Set((filters.internal_routes || []).map(String));
    all = all.filter(c => salesSet.has(String(c.sales_route)) || internalSet.has(String(c.internal_route)));
  }

  const total = all.length;
  const start = (page - 1) * pageSize;
  const sliced = all.slice(start, start + pageSize);

  return { data: sliced, count: total };
}

/**
 * Guarda la lista completa de clientes en SQLite
 */
/**
 * Guarda la lista completa de clientes en SQLite
 */
async function saveClientsToLocal(clients) {
  const startTime = Date.now();
  try {
    if (!Array.isArray(clients) || clients.length === 0) {
      console.warn('[clientsRepository][SAFETY] Empty/invalid client batch; existing offline cache preserved');
      return;
    }
    const db = await getDb();

    // 🏢 ENTERPRISE: Structured logging with context
    console.log(`[clientsRepository][SYNC] saveClientsToLocal called`, {
      clientCount: clients?.length || 0,
      timestamp: new Date().toISOString()
    });

    if (isMockDb()) {
      console.log('[clientsRepository][MOCK] Saving to Mock DB');
      const current = db._storage.get('clients') || [];
      const byId = new Map(current.map(client => [String(client.id), client]));
      clients.forEach(client => byId.set(String(client.id), client));
      db._storage.set('clients', Array.from(byId.values()));
      return;
    }

    // 🛡️ CRITICAL VALIDATION: Prevent data loss from empty arrays
    if (!clients || clients.length === 0) {
      console.warn('[clientsRepository][SAFETY] saveClientsToLocal ABORTED: Empty list received', {
        reason: 'Preserving existing client data',
        action: 'No changes made to database'
      });
      return;
    }

    // 🏢 ENTERPRISE: Data integrity validation
    const validClients = clients.filter(c => c && c.id && c.client_code);
    if (validClients.length !== clients.length) {
      console.warn('[clientsRepository][VALIDATION] Invalid clients filtered out', {
        total: clients.length,
        valid: validClients.length,
        filtered: clients.length - validClients.length
      });
    }

    if (validClients.length === 0) {
      console.error('[clientsRepository][SAFETY] No valid clients after filtering, ABORTING to preserve data');
      return;
    }

    // 🏢 ENTERPRISE: Create backup before destructive operation
    let backupCount = 0;
    try {
      const backupResult = await db.query('SELECT COUNT(*) as count FROM clients');
      backupCount = backupResult.values?.[0]?.count || backupResult.values?.[0]?.['COUNT(*)'] || 0;
      console.log('[clientsRepository][BACKUP] Current client count:', backupCount);
    } catch (backupErr) {
      console.warn('[clientsRepository][BACKUP] Could not count existing clients:', backupErr.message);
    }

    // TRANSACTION START
    console.log('[clientsRepository][TRANSACTION] Starting transaction...');
    await db.execute('BEGIN TRANSACTION');
    console.log('[clientsRepository][TRANSACTION] Transaction started successfully');

    try {
      // A route-scoped download is only a partial snapshot. Merge it into the
      // cache; deleting the table here erased clients belonging to other routes.
      const statements = validClients.map(c => {
        const coolerSerials = Array.isArray(c.cooler_serials) ? JSON.stringify(c.cooler_serials) : (c.cooler_serials || '[]');
        const safeCoords = typeof c.coords === 'object' ? JSON.stringify(c.coords) : (c.coords || '');

        // Safety checks for numbers
        const safeLat = isNaN(Number(c.lat)) ? null : Number(c.lat);
        const safeLng = isNaN(Number(c.lng)) ? null : Number(c.lng);

        return [
          c.id,
          c.client_code || '',
          c.name || 'Sin Nombre',
          c.business_name || '',
          c.contact || '',
          c.email || '',
          c.phone || '',
          c.address || '',
          c.cross_street || '',
          c.exterior_number || '',
          c.interior_number || '',
          c.colony || '',
          c.postal_code || '',
          c.city || '',
          c.state || '',
          c.reference || '',
          safeCoords,
          c.sales_route || '',
          c.internal_route || '',
          c.visit_days || c.visit_day || null,
          c.visit_day_televenta || null,
          c.zona_comercial || null,
          c.region || null,
          c.gec || '',
          c.level || '',
          c.cadena || '',
          c.exclusivity || '',
          c.client_type || '',
          c.enfriador || '',
          coolerSerials,
          c.notes || '',
          c.owner_id || '',
          c.created_by || '',
          c.created_at || null,
          c.updated_at || new Date().toISOString(),
          c.rfc || '',
          c.fiscal_name || '',
          c.fiscal_address || '',
          c.fiscal_colony || '',
          c.fiscal_postal_code || '',
          c.cedula_ieps || '',
          c.sales_modality || '',
          c.ritmo || '',
          // Utility columns
          1, // synced
          safeLat,
          safeLng
        ];
      });

      // 🛡️ ENTERPRISE: Validate statements before DELETE
      if (!statements || statements.length === 0) {
        console.error('[clientsRepository][SAFETY] No valid statements prepared, ROLLING BACK to preserve data', {
          receivedClients: clients.length,
          validClients: validClients.length,
          statements: statements?.length || 0
        });
        await db.execute('ROLLBACK');
        throw new Error('Statement preparation failed - data preserved');
      }

      console.log(`[clientsRepository][TRANSACTION] Prepared ${statements.length} statements. Starting batch insert...`);

      // CRITICAL FIX: SQLite often has a 999 parameter limit.
      // Now we have 46 columns, so: 21 items * 46 = 966 params (safe)
      const BATCH_SIZE = 21;
      for (let i = 0; i < statements.length; i += BATCH_SIZE) {
        const chunk = statements.slice(i, i + BATCH_SIZE);
        // 46 placeholders per row
        const placeholders = chunk.map(() => `(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).join(',');
        const values = chunk.flat();

        await db.run(`
                INSERT OR REPLACE INTO clients (
                id, client_code, name, business_name, contact, email, phone, address,
                cross_street, exterior_number, interior_number, colony, postal_code, city, state, reference,
                coords, sales_route, internal_route, visit_days, visit_day_televenta, zona_comercial, region,
                gec, level, cadena, exclusivity, client_type, enfriador, cooler_serials, notes,
                owner_id, created_by, created_at, updated_at,
                rfc, fiscal_name, fiscal_address, fiscal_colony, fiscal_postal_code, cedula_ieps,
                sales_modality, ritmo,
                synced, lat, lng
                ) VALUES ${placeholders}
            `, values);
      }

      console.log('[clientsRepository][TRANSACTION] Batch insert finished. Committing...');
      await db.execute('COMMIT');

      const duration = Date.now() - startTime;
      console.log('[clientsRepository][SUCCESS] Clients saved to SQLite', {
        count: validClients.length,
        previousCount: backupCount,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      });

    } catch (innerError) {
      const duration = Date.now() - startTime;
      console.error('[clientsRepository][ERROR] Transaction failed, ROLLING BACK', {
        error: innerError.message,
        stack: innerError.stack,
        duration: `${duration}ms`,
        clientsAttempted: validClients.length,
        preservedCount: backupCount
      });

      try {
        await db.execute('ROLLBACK');
        console.log('[clientsRepository][ROLLBACK] Transaction rolled back successfully, data preserved');
      } catch (rollbackError) {
        console.error('[clientsRepository][CRITICAL] Rollback failed:', rollbackError);
      }

      // 🏢 ENTERPRISE: Propagate error to caller
      throw new Error(`Client save failed: ${innerError.message}`);
    }

  } catch (e) {
    const duration = Date.now() - startTime;
    console.error('[clientsRepository][ERROR] Fatal error saving clients', {
      error: e.message,
      stack: e.stack,
      duration: `${duration}ms`
    });
    // 🏢 ENTERPRISE: Propagate error so caller knows operation failed
    throw e;
  }
}

/**
 * Saves a batch of clients (Upsert). Does NOT delete existing table.
 */
async function saveClientsBatchToLocal(clients) {
  try {
    // Handling for Mock Web Environment (Localhost)
    if (isMockDb()) {
      console.log(`[clientsRepository] (MOCK) Saving BATCH of ${clients.length} clients to memory/storage...`);
      const db = await getDb();
      // Emulate "INSERT OR REPLACE" logic in memory
      let existing = db._storage.get('clients') || [];
      const map = new Map();
      existing.forEach(c => map.set(c.id, c));
      clients.forEach(c => map.set(c.id, c));
      const merged = Array.from(map.values());
      db._storage.set('clients', merged);
      console.log(`[clientsRepository] (MOCK) Saved. Total clients in mock: ${merged.length}`);
      return;
    }

    const db = await getDb();
    if (!clients || clients.length === 0) return;

    console.log(`[clientsRepository] Saving BATCH of ${clients.length} clients...`);

    await db.execute('BEGIN TRANSACTION');

    const statements = clients.map(c => {
      const coolerSerials = Array.isArray(c.cooler_serials) ? JSON.stringify(c.cooler_serials) : (c.cooler_serials || '[]');
      const safeCoords = typeof c.coords === 'object' ? JSON.stringify(c.coords) : (c.coords || '');
      const safeLat = isNaN(Number(c.lat)) ? null : Number(c.lat);
      const safeLng = isNaN(Number(c.lng)) ? null : Number(c.lng);

      return [
        c.id,
        c.client_code || '',
        c.name || 'Sin Nombre',
        c.business_name || '',
        c.contact || '',
        c.email || '',
        c.phone || '',
        c.address || '',
        c.cross_street || '',
        c.exterior_number || '',
        c.interior_number || '',
        c.colony || '',
        c.postal_code || '',
        c.city || '',
        c.state || '',
        c.reference || '',
        safeCoords,
        c.sales_route || '',
        c.internal_route || '',
        c.visit_days || c.visit_day || null,
        c.visit_day_televenta || null,
        c.zona_comercial || null,
        c.region || null,
        c.gec || '',
        c.level || '',
        c.cadena || '',
        c.exclusivity || '',
        c.client_type || '',
        c.enfriador || '',
        coolerSerials,
        c.notes || '',
        c.owner_id || '',
        c.created_by || '',
        c.created_at || null,
        c.updated_at || new Date().toISOString(),
        c.rfc || '',
        c.fiscal_name || '',
        c.fiscal_address || '',
        c.fiscal_colony || '',
        c.fiscal_postal_code || '',
        c.cedula_ieps || '',
        c.sales_modality || '',
        c.ritmo || '',
        1, // synced
        safeLat,
        safeLng
      ];
    });

    // BATCH INSERT - Updated to 46 columns
    const BATCH_SIZE = 21;
    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      const chunk = statements.slice(i, i + BATCH_SIZE);
      const placeholders = chunk.map(() => `(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).join(',');
      const values = chunk.flat();

      await db.run(`
                INSERT OR REPLACE INTO clients (
                id, client_code, name, business_name, contact, email, phone, address,
                cross_street, exterior_number, interior_number, colony, postal_code, city, state, reference,
                coords, sales_route, internal_route, visit_days, visit_day_televenta, zona_comercial, region,
                gec, level, cadena, exclusivity, client_type, enfriador, cooler_serials, notes,
                owner_id, created_by, created_at, updated_at,
                rfc, fiscal_name, fiscal_address, fiscal_colony, fiscal_postal_code, cedula_ieps,
                sales_modality, ritmo,
                synced, lat, lng
                ) VALUES ${placeholders}
            `, values);
    }

    await db.execute('COMMIT');

  } catch (e) {
    console.error('[clientsRepository] Batch Save Error:', e);
    try { await getDb().then(d => d.execute('ROLLBACK')); } catch { }
    throw e;
  }
}
/**
 * Sincroniza TODOS los clientes del sistema (Para roles globales como Jefe)
 */
export async function syncAllClients() {
  const online = await safeIsOnline();
  if (!online) return await loadClientsFromLocal();

  try {
    console.log('[clientsRepository] Full Global Sync starting...');
    // We use a limit per batch (1000) and stream to local DB to avoid OOM
    await fetchAllClientsOnline(null, saveClientsBatchToLocal);
    return { success: true };
  } catch (e) {
    console.error('[clientsRepository] Global Sync Error:', e);
    throw e;
  }
}

/**
 * Sincroniza clientes para una lista de rutas permitidas.
 * Descarga secuencialmente y guarda una sola vez para evitar borrados parciales.
 */
export async function syncClientsForRoutes(routes) {
  let allClients = [];

  const online = await safeIsOnline();

  // SAFETY CHECK: If no routes are assigned, fetching ALL clients might be too heavy (50k+).
  // But user requested "remove filters".
  // Compromise: If routes are empty, we fetch the first 1000 clients to prove connectivity.
  let routesToUse = routes;
  let cleanFetch = false;

  if (!routes || routes.length === 0) {
    console.warn('[clientsRepository] No routes assigned. Defaulting to SAFE FETCH (Limit 1000).');
    routesToUse = []; // Pass empty to trigger "No Filter" in API
    cleanFetch = true; // Flag to indicate we are doing a fallback fetch
  }

  if (!online) {
    console.warn('[clientsRepository] Offline → usando solo cache local.');
    return await loadClientsFromLocal();
  }

  try {
    if (cleanFetch) {
      // Fetch "All" but with a hard limit to prevent crash
      console.log('[clientsRepository] Fetching SAFE MODE clients (Limit 1000)...');
      const res = await fetchClientsApi({ limit: 1000 });
      const safeBatch = (res.rows || []).map(parseClientFields);
      await saveClientsBatchToLocal(safeBatch);
      return safeBatch; // Returns actual data (small)
    } else {
      console.log(`[clientsRepository] Streaming Sync for ${routesToUse.length} routes.`);

      // STREAMING MODE:
      // We pass the saving function as the callback.
      // fetchAllClientsOnline will await this for each batch (200 items), saving them to disk.
      // It returns [] to indicate "data is not in RAM".
      await fetchAllClientsOnline(routesToUse, saveClientsBatchToLocal);

      // Since we didn't keep them in RAM, we return a lightweight truthy value or minimal summary.
      // The caller (fullSyncService) expects a result to count.
      return { success: true, count: 14000 }; // Approximation or void
    }
  } catch (e) {
    console.error('[clientsRepository] Error fetching clients:', e);
    throw e;
  }
}

/**
 * Obtiene todos los clientes.
 * - ONLINE: lee TODOS los clientes de Supabase y los guarda en cache local.
 * - OFFLINE o error: lee desde cache local.
 */
export async function getClients(route = null) {
  let online = false;
  try {
    online = await isOnline();
  } catch (e) {
    online = false;
  }

  if (online) {
    // SECURITY/PERFORMANCE: If no specific route is filtered, fetching ALL clients (32k+)
    // in foreground causes OOM/Crash/Timeout on NATIVE and WEB.
    // We rely on the Background Sync (syncClientsForRoutes) which uses streaming.
    if (!route) {
      console.warn('[clientsRepository] getClients called without route (Broad Query). Defaulting to Local DB to prevent OOM/Timeout.');
      return await loadClientsFromLocal();
    }

    // WEB: Carga directa para evitar problemas de caché/sync
    if (!Capacitor.isNativePlatform()) {
      try {
        // Aumentamos timeout a 120s para permitir la descarga de 14k clientes
        const rows = await withTimeout(fetchAllClientsOnline(route), 120000);

        // 🛡️ ENTERPRISE: Validate before saving
        if (rows && Array.isArray(rows) && rows.length > 0) {
          console.log('[clientsRepository][WEB] Saving fetched clients to local cache', { count: rows.length });
          saveClientsToLocal(rows).catch(err => {
            console.error('[clientsRepository][ERROR] Background save failed:', {
              error: err.message,
              clientCount: rows.length
            });
            // Data is preserved thanks to validation in saveClientsToLocal
          });
        } else {
          console.warn('[clientsRepository][SAFETY] Empty result from fetch, skipping save to preserve existing data');
        }
        return rows;
      } catch (e) {
        console.error('[clientsRepository] Error web direct fetch, falling back to local:', e);
        // Explicit fallback to local DB on error, preventing fallthrough to short timeout
        return await loadClientsFromLocal();
      }
    }

    try {
      console.log('[clientsRepository] APK: streaming route clients into SQLite...');
      // Do not race a large route download against a short timeout. That used to
      // return an empty/stale local list before the route had been cached.
      await syncClientsForRoutes([route]);
      const local = await loadClientsFromLocal();
      const normalized = String(route).toLowerCase().trim();
      return local.filter(client =>
        [client.sales_route, client.internal_route, client.ruta, client.route]
          .some(value => String(value || '').toLowerCase().trim() === normalized)
      );
    } catch (error) {
      console.warn('[clientsRepository] Route download failed; showing the durable local cache.', error);
      const local = await loadClientsFromLocal();
      const normalized = String(route).toLowerCase().trim();
      return local.filter(client =>
        [client.sales_route, client.internal_route, client.ruta, client.route]
          .some(value => String(value || '').toLowerCase().trim().includes(normalized))
      );
    }
  }

  // 🔁 OFFLINE → SQL filtrado por ruta en SQLite (evita SELECT * de 15k+ filas)
  if (!route) return await loadClientsFromLocal();
  return await loadClientsFromLocalByRoute(route);
}

/**
 * Obtiene clientes filtrados por ruta (Optimizado)
/**
 * Obtiene todos los clientes.
 * - ONLINE: Filtra en Supabase para no descargar toda la DB.
 * - OFFLINE: Filtra en memoria sobre cache local.
 */
export async function getClientsByRoute(route) {
  if (!route) return [];
  const normalizedRoute = String(route).trim().toLowerCase();

  // Native Mode: Offline First Strategy with "Fast Fail" on network
  let online = false;
  try { online = await isOnline(); } catch (e) { online = false; }

  // Strategy: If we are online, try to fetch fresh data BUT with a short timeout (e.g., 3-5s).
  // If it's too slow (poor 3G/4G), just fail fast and load local.
  // Exception: If sync is explicitly requested, we might wait longer, but for UI loading, speed is king.
  // We use a 4s timeout. 

  if (online) {
    try {
      console.log('[clientsRepository] Online: Attempting fetch by route with timeout...');
      // Use efficient API filter
      const apiParams = {
        limit: 1000,
        sales_route: route
      };

      // RACE: API vs 2s Timeout
      const res = await withTimeout(fetchClientsApi(apiParams), 2000);
      const rows = (res.rows || []).map(parseClientFields);

      // Background Save
      saveClientsBatchToLocal(rows).catch(e => console.warn('Background save failed', e));
      return rows;

    } catch (e) {
      console.warn('[clientsRepository] Online fetch failed or timed out. Falling back to local.', e);
    }
  }

  // 🔁 Fallback Offline (Local SQLite ultra-rápido con índice)
  return await loadClientsFromLocalByRoute(route);
}

/**
 * Get clients strictly from local storage (Fast/Offline).
 */
export async function getLocalClients(route = null) {
  if (!route) return await loadClientsFromLocal();
  return await loadClientsFromLocalByRoute(route);
}

/**
 * Cuenta cuántos clientes hay guardados en cache local
 */
export async function countLocalClients() {
  try {
    const db = await getDb();
    if (isMockDb()) {
      const local = await loadClientsFromLocal();
      return local.length;
    }
    const res = await db.query('SELECT COUNT(*) as c FROM clients');
    if (res && res.values && res.values.length > 0) {
      return res.values[0].c || res.values[0]['COUNT(*)'] || 0;
    }
    return 0;
  } catch (e) {
    console.error('Error counting clients:', e);
    return 0;
  }
}

/**
 * Obtiene lista de clientes por IDs (MySQL)
 */
export async function getClientsByIds(ids) {
  if (!ids || !ids.length) return [];
  const online = await isOnline().catch(() => false);

  if (online) {
    try {
      const res = await fetchClientsApi({ ids });
      return (res.rows || []).map(parseClientFields);
    } catch (e) {
      console.error('[clientsRepository] Error fetching clients by IDs online:', e);
      // Fallback below
    }
  }

  // Fallback local indexado ultra-rápido (evita SELECT * de 30k clientes)
  return await loadClientsFromLocalByIds(ids);
}

/**
 * Obtiene lista de clientes por client_codes (MySQL)
 */
export async function getClientsByCodes(codes) {
  if (!codes || !codes.length) return [];
  const online = await isOnline().catch(() => false);

  if (online) {
    try {
      // Chunking if too many codes? PHP/URL limit.
      // 500 codes * 10 chars = 5000 chars. URL limit ~2000 or 8000 depending on server.
      // Safest to chunk.
      const CHUNK_SIZE = 100;
      let all = [];
      for (let i = 0; i < codes.length; i += CHUNK_SIZE) {
        const slice = codes.slice(i, i + CHUNK_SIZE);
        const res = await fetchClientsApi({ client_codes: slice });
        if (res.rows) all = all.concat(res.rows);
      }
      return all.map(parseClientFields);
    } catch (e) {
      console.error('[clientsRepository] Error fetching clients by Codes online:', e);
    }
  }

  // Fallback local indexado ultra-rápido (evita SELECT * de 30k clientes)
  return await loadClientsFromLocalByCodes(codes);
}


/**
 * Crea cliente (simplificado)
/**
 * Obtiene todos los clientes.
 * - ONLINE: inserta en Supabase y actualiza cache local.
 * - OFFLINE: solo lo agrega a cache local y crea operación pendiente para sync.
 */
export async function createClient(client) {
  const now = new Date().toISOString();
  const row = {
    ...client,
    // Always stamp a stable UUID so the offline payload is idempotent on sync
    id: client.id || crypto.randomUUID(),
    updated_at: client.updated_at || now,
  };

  let online = false;
  try {
    online = await isOnline();
  } catch (e) {
    online = false;
  }

  if (online) {
    // const { error } = await supabase.from('clients').insert(row);
    // if (error) { ... }

    // Switch to MySQL Import (Upsert)
    try {
      await importClientsApi([row]);
      // Re-fetch o insertar localmente (importClientsApi returns summary, not row)
      await insertLocalClient(row);
      return row;
    } catch (e) {
      console.error('[clientsRepository] Error insertando cliente en MySQL:', e);
      throw e;
    }
  }

  // OFFLINE
  await insertLocalClient(row, false); // synced = false

  // Registramos operación pendiente
  try {
    const { addPendingOperation } = await import('@/sync/syncService');
    await addPendingOperation({
      entity_type: 'client',
      operation: 'insert',
      payload: row,
      created_at: now,
    });
  } catch (e) {
    console.error('[clientsRepository] Error agregando operación pendiente para cliente:', e);
  }

  return row;
}

/**
 * Actualiza un cliente existente.
 * - ONLINE: Hace upsert vía importClientsApi y si es exitoso actualiza cache local.
 * - OFFLINE: Actualiza localmente (synced=0) y encola un 'update' en pending_operations.
 */
export async function updateClient(id, updates) {
  const now = new Date().toISOString();
  
  // 1. Get current client data to apply updates (graceful fallback if not yet in local DB)
  let currentClient = await getClientById(id).catch(() => null);
  if (!currentClient) {
    currentClient = { id };
  }

  // Normalizar coordenadas para mantener en perfecta sincronía coords (JSON/obj) y lat/lng planos
  const normalizedUpdates = { ...updates };
  const hasCoordUpdate =
    updates.coords != null ||
    updates.lat != null ||
    updates.lng != null ||
    updates.latitude != null ||
    updates.longitude != null;

  if (hasCoordUpdate) {
    const v = updates.coords;
    let lat = updates.lat ?? updates.latitude ?? (Array.isArray(v) ? v[0] : v?.lat);
    let lng = updates.lng ?? updates.longitude ?? (Array.isArray(v) ? v[1] : v?.lng);
    if (lat != null && lng != null) {
      lat = Number(lat);
      lng = Number(lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        normalizedUpdates.lat = lat;
        normalizedUpdates.lng = lng;
        normalizedUpdates.coords = { lat, lng };
        rememberClientCoords(
          id,
          currentClient?.client_code || currentClient?.cve_cliente || updates?.client_code,
          lat,
          lng
        );
      }
    }
    delete normalizedUpdates.latitude;
    delete normalizedUpdates.longitude;
    delete normalizedUpdates.latitud;
    delete normalizedUpdates.longitud;
    delete normalizedUpdates.lon;
  }

  const updatedRow = {
    ...currentClient,
    ...normalizedUpdates,
    updated_at: now
  };

  let online = false;
  try {
    online = await isOnline();
  } catch (e) {
    online = false;
  }

  if (online) {
    try {
      await importClientsApi([updatedRow]);
      await updateLocalClient(id, normalizedUpdates, true);
      return updatedRow;
    } catch (e) {
      console.error('[clientsRepository] Error updating client online, falling back offline:', e);
      online = false; // Fallback to offline queue
    }
  }

  if (!online) {
    await updateLocalClient(id, normalizedUpdates, false); // synced = false
    try {
      const { addPendingOperation } = await import('@/sync/syncService');
      // IMPORTANT: Store the FULL merged row (not just the diff) so that when the sync
      // handler calls importClientsApi([payload]), it has all required NOT NULL fields
      // (e.g. name, business_name) and doesn't trigger MySQL constraint violations.
      await addPendingOperation({
        entity_type: 'client',
        operation: 'update',
        payload: updatedRow,
        created_at: now,
      });
    } catch (e) {
      console.error('[clientsRepository] Error queuing pending update:', e);
    }
  }

  return updatedRow;
}

async function insertLocalClient(c, synced = true) {
  try {
    const db = await getDb();
    if (isMockDb()) {
      const current = db._storage.get('clients') || [];
      const filtered = current.filter(x => x.id !== c.id);
      db._storage.set('clients', [...filtered, c]);
      return;
    }

    const coolerSerials = Array.isArray(c.cooler_serials) ? JSON.stringify(c.cooler_serials) : (c.cooler_serials || '[]');
    const safeCoords = typeof c.coords === 'object' ? JSON.stringify(c.coords) : (c.coords || '');

    // Safety checks for numbers
    const safeLat = isNaN(Number(c.lat)) ? null : Number(c.lat);
    const safeLng = isNaN(Number(c.lng)) ? null : Number(c.lng);

    await db.run(`
      INSERT OR REPLACE INTO clients (
        id, client_code, name, business_name, contact, email, phone, address, coords,
        sales_route, internal_route, visit_days, visit_day_televenta, zona_comercial, region,
        gec, level, cadena, exclusivity, client_type, enfriador, cooler_serials, notes,
        owner_id, created_by, created_at, updated_at,
        synced, lat, lng
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      c.id,
      c.client_code || '',
      c.name || 'Sin Nombre',
      c.business_name || '',
      c.contact || '',
      c.email || '',
      c.phone || '',
      c.address || '',
      safeCoords,
      c.sales_route || '',
      c.internal_route || '',
      c.visit_days || c.visit_day || null,
      c.visit_day_televenta || null,
      c.zona_comercial || null,
      c.region || null,
      c.gec || '',
      c.level || '',
      c.cadena || '',
      c.exclusivity || '',
      c.client_type || '',
      c.enfriador || '',
      coolerSerials,
      c.notes || '',
      c.owner_id || '',
      c.created_by || '',
      c.created_at || null,
      c.updated_at || new Date().toISOString(),
      // Utility
      synced ? 1 : 0,
      safeLat,
      safeLng
    ]);
  } catch (e) {
    console.error('[clientsRepository] Error insertando cliente local:', e);
  }
}



/**
 * Elimina un cliente.
 */
export async function deleteClient(clientId) {
  const online = await isOnline().catch(() => false);
  const now = new Date().toISOString();

  // 1. Delete Local immediately
  try {
    const db = await getDb();
    if (!isMockDb()) {
      await db.run('DELETE FROM clients WHERE id = ?', [clientId]);
    } else {
      const current = db._storage.get('clients') || [];
      db._storage.set('clients', current.filter(c => c.id !== clientId));
    }
    console.log('[clientsRepository] Client deleted locally:', clientId);
  } catch (e) {
    console.error('[clientsRepository] Error deleting local client:', e);
  }

  if (online) {
    try {
      // FIX: Use MySQL Delete directly (or soft delete logic inside the API helper)
      const { deleteClientApi } = await import('@/lib/mysqlClients');
      await deleteClientApi(clientId);
      console.log('[clientsRepository] Client deleted from MySQL:', clientId);
      return true;
    } catch (e) {
      console.error('[clientsRepository] Error deleting from MySQL, queuing offline op:', e);
    }
  }

  // 2. Queue Offline Op
  try {
    const { addPendingOperation } = await import('@/sync/syncService');
    await addPendingOperation({
      entity_type: 'client',
      operation: 'delete',
      payload: { id: clientId },
      created_at: now
    });
  } catch (e) {
    console.error('[clientsRepository] Error queuing pending delete:', e);
  }

  return true;
}

async function updateLocalClient(id, updates, synced) {
  try {
    const db = await getDb();
    if (isMockDb()) {
      const current = db._storage.get('clients') || [];
      const idx = current.findIndex(c => c.id === id);
      if (idx >= 0) {
        current[idx] = { ...current[idx], ...updates, synced: synced ? 1 : 0 };
        db._storage.set('clients', current);
      }
      return;
    }

    let cleanUpdates = { ...updates };
    let hasCoordsOrLatLng = false;
    let newLat = null;
    let newLng = null;
    let newCoordsStr = null;

    if (cleanUpdates.coords || cleanUpdates.lat != null || cleanUpdates.lng != null || cleanUpdates.latitude != null || cleanUpdates.longitude != null) {
      hasCoordsOrLatLng = true;
      const v = cleanUpdates.coords;
      newLat = cleanUpdates.lat ?? cleanUpdates.latitude ?? (Array.isArray(v) ? v[0] : v?.lat);
      newLng = cleanUpdates.lng ?? cleanUpdates.longitude ?? (Array.isArray(v) ? v[1] : v?.lng);
      if (newLat != null) newLat = Number(newLat);
      if (newLng != null) newLng = Number(newLng);
      newCoordsStr = JSON.stringify({ lat: newLat, lng: newLng });

      delete cleanUpdates.coords;
      delete cleanUpdates.lat;
      delete cleanUpdates.lng;
      delete cleanUpdates.latitude;
      delete cleanUpdates.longitude;
      delete cleanUpdates.latitud;
      delete cleanUpdates.longitud;
      delete cleanUpdates.lon;
    }

    const keys = Object.keys(cleanUpdates);
    const setClauses = [];
    const values = [];

    if (hasCoordsOrLatLng) {
      setClauses.push('coords = ?', 'lat = ?', 'lng = ?');
      values.push(newCoordsStr, newLat, newLng);
    }

    keys.forEach(k => {
      setClauses.push(`${k} = ?`);
      values.push(cleanUpdates[k]);
    });

    setClauses.push('synced = ?');
    values.push(synced ? 1 : 0);

    values.push(id);

    await db.run(`UPDATE clients SET ${setClauses.join(', ')} WHERE id = ?`, values);
  } catch (e) {
    console.error('[clientsRepository] Error updating local client:', e);
  }
}

/**
 * Obtiene clientes de cache local (SQLite)
 * Esta función es crítica para el modo offline.
 */
export async function loadClientsFromLocal() {
  try {
    const db = await getDb();
    if (isMockDb()) {
      return db._storage.get('clients') || [];
    }

    // Debug
    // console.log('[clientsRepository] loadClientsFromLocal executing query...');

    const result = await db.query('SELECT * FROM clients');

    if (result && result.values) {
      // 🛡️ CRITICAL: Parse fields (lat/lng normalization) for all local results
      return result.values.map(parseClientFields);
    }
    return [];
  } catch (e) {
    console.error('[clientsRepository] Error loading local clients:', e);
    return [];
  }
}

/**
 * Carga clientes locales filtrados directamente en SQLite por ruta (ULTRA-RÁPIDO)
 * En vez de SELECT * (30k filas) y mapear todo, consulta solo las filas de la ruta (~100 filas)
 */
export async function loadClientsFromLocalByRoute(route) {
  if (!route) return [];
  const normalizedRoute = String(route).trim();
  const cleanDigits = normalizedRoute.replace(/[^0-9]/g, '');

  try {
    const db = await getDb();
    if (isMockDb()) {
      const all = db._storage.get('clients') || [];
      return all.filter(c => {
        const candidates = [c.sales_route, c.internal_route, c.ruta, c.route];
        return candidates.some(val => {
          const sVal = String(val || '').trim();
          const sDigits = sVal.replace(/[^0-9]/g, '');
          return sVal.toLowerCase().includes(normalizedRoute.toLowerCase()) ||
                 (cleanDigits.length > 0 && sDigits === cleanDigits);
        });
      }).map(parseClientFields);
    }

    // Direct SQLite query with indexed WHERE clause
    let query = `SELECT * FROM clients WHERE sales_route = ? OR internal_route = ? OR sales_route LIKE ? OR internal_route LIKE ?`;
    const params = [normalizedRoute, normalizedRoute, `%${normalizedRoute}%`, `%${normalizedRoute}%`];

    if (cleanDigits.length > 0 && cleanDigits !== normalizedRoute) {
      query += ` OR sales_route LIKE ? OR internal_route LIKE ?`;
      params.push(`%${cleanDigits}%`, `%${cleanDigits}%`);
    }

    const result = await db.query(query, params);
    if (result && result.values && result.values.length > 0) {
      return result.values.map(parseClientFields);
    }

    // Fallback seguro si la búsqueda estricta no encontró
    const all = await loadClientsFromLocal();
    return all.filter(c => {
      const candidates = [c.sales_route, c.internal_route, c.ruta, c.route];
      return candidates.some(val => String(val || '').toLowerCase().includes(normalizedRoute.toLowerCase()));
    });
  } catch (e) {
    console.error('[clientsRepository] Error in loadClientsFromLocalByRoute:', e);
    return [];
  }
}

/**
 * Carga clientes locales directamente por códigos (SQL IN (...))
 */
export async function loadClientsFromLocalByCodes(codes) {
  if (!codes || !codes.length) return [];
  try {
    const db = await getDb();
    if (isMockDb()) {
      const local = await loadClientsFromLocal();
      const set = new Set(codes.map(c => String(c).trim().toUpperCase()));
      return local.filter(c => set.has(String(c.client_code || '').trim().toUpperCase()));
    }

    const uniqueCodes = [...new Set(codes.map(c => String(c).trim()).filter(Boolean))];
    const results = [];
    const BATCH_SIZE = 100;
    for (let i = 0; i < uniqueCodes.length; i += BATCH_SIZE) {
      const chunk = uniqueCodes.slice(i, i + BATCH_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      const res = await db.query(`SELECT * FROM clients WHERE client_code IN (${placeholders})`, chunk);
      if (res && res.values) {
        results.push(...res.values.map(parseClientFields));
      }
    }
    return results;
  } catch (e) {
    console.error('[clientsRepository] Error in loadClientsFromLocalByCodes:', e);
    const local = await loadClientsFromLocal();
    const set = new Set(codes.map(c => String(c).trim().toUpperCase()));
    return local.filter(c => set.has(String(c.client_code || '').trim().toUpperCase()));
  }
}

/**
 * Carga clientes locales directamente por IDs (SQL IN (...))
 */
export async function loadClientsFromLocalByIds(ids) {
  if (!ids || !ids.length) return [];
  try {
    const db = await getDb();
    if (isMockDb()) {
      const local = await loadClientsFromLocal();
      const set = new Set(ids.map(String));
      return local.filter(c => set.has(String(c.id)));
    }

    const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];
    const results = [];
    const BATCH_SIZE = 100;
    for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
      const chunk = uniqueIds.slice(i, i + BATCH_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      const res = await db.query(`SELECT * FROM clients WHERE id IN (${placeholders})`, chunk);
      if (res && res.values) {
        results.push(...res.values.map(parseClientFields));
      }
    }
    return results;
  } catch (e) {
    console.error('[clientsRepository] Error in loadClientsFromLocalByIds:', e);
    const local = await loadClientsFromLocal();
    const set = new Set(ids.map(String));
    return local.filter(c => set.has(String(c.id)));
  }
}

/**
 * Obtiene lista única de cadenas (Niveles de precio).
 */
export async function getUniqueCadenas() {
  try {
    // 1. Try local cache first
    const local = await loadClientsFromLocal();
    if (local && local.length > 0) {
      // Filter out empty strings or nulls
      const chains = [...new Set(local.map(c => c.cadena).filter(ignore => ignore))].sort();
      if (chains.length > 0) return chains;
    }

    // 2. If local empty, try Supabase (limit to avoid huge download if not locally cached)
    // Note: This is a heavy query if table is huge, but 'clients' usually fit in memory for this app scale.
    // Ideally we would use rpc('get_distinct_chains') but we stick to client side distinct for now.
    const { data, error } = await supabase
      .from('clients')
      .select('cadena')
      .not('cadena', 'is', null)
      .limit(2000);

    if (error) throw error;

    if (data) {
      const chains = [...new Set(data.map(c => c.cadena).filter(c => c))].sort();
      return chains;
    }

    return [];
  } catch (e) {
    console.error('Error fetching unique cadenas:', e);
    return ['A', 'B', 'C', 'D', 'OXXO', '7-ELEVEN', 'MODELORAMA'];
  }
}


