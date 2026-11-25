import { getDb, isMockDb } from '@/lib/localDb';
import { isOnline, withTimeout } from '@/lib/network';
// import { supabase } from '@/supabaseClient';
import { getTodayMexico, getNowMexico, getMexicoTimeString } from '@/lib/dateUtils';
// Actually we use Supabase for Read fallback in some cases? 
// No, we use Supabase for Online Read in the OLD code.
// The NEW code uses mysqlVisits.js for Read presumably?
// Wait, `visitsRepository.js` refactor was to usage `mysqlVisits.js`.
// Let's check `mysqlVisits.js` exports: `fetchVisitsApi`, `importVisitsApi`.

import { fetchVisitsApi, importVisitsApi } from '@/lib/mysqlVisits';

export async function getVisitsByClient(clientId, clientCode) {
  // Guard: if neither identifier is provided, return empty to avoid fetching ALL visits
  if (!clientId && !clientCode) return [];

  const online = await isOnline().catch(() => false);

  if (online) {
    try {
      const params = {};
      if (clientId) {
        params.client_id = clientId;
      }
      if (clientCode) {
        params.client_code = clientCode;
      }

      const data = await fetchVisitsApi(params);

      // Merge server results; replacing the client's cache erased visits that
      // had been captured offline and were still waiting in the sync queue.
      await upsertLocalVisits(data || []);
      return data || [];
    } catch (error) {
      console.warn('[visitsRepository] Error fetching online visits for client:', error);
      return await loadLocalVisits(clientId, clientCode);
    }
  } else {
    return await loadLocalVisits(clientId, clientCode);
  }
}

/**
 * Obtiene visitas por ID de usuario (Fallback para usuarios sin ruta)
 * Nota: Esto es principalmente LOCAL, ya que la API MySQL suele requerir ruta.
 */
export async function getVisitsByUser(userId) {
  try {
    const db = await getDb();
    if (isMockDb()) {
      const all = db._storage.get('visitas') || [];
      return all.filter(v => v.user_id === userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    // Join with clients for names if needed, same as route query
    const query = `
      SELECT v.*, c.name as joined_client_name 
      FROM visitas v
      LEFT JOIN clients c ON v.client_id = c.id
      WHERE v.user_id = ?
      ORDER BY v.created_at DESC
    `;
    const res = await db.query(query, [userId]);
    const rows = res.values || [];

    return rows.map(r => ({
      ...r,
      inventory: r.inventory ? JSON.parse(r.inventory) : null,
      cliente_nombre: r.cliente_nombre || r.joined_client_name || r.client_name || ''
    }));
  } catch (e) {
    console.warn('[visitsRepository] Error loading visits by user:', e);
    return [];
  }
}

async function loadLocalVisits(clientId, clientCode) {
  try {
    const db = await getDb();
    if (isMockDb()) {
      const all = db._storage.get('visitas') || [];
      return all.filter(v =>
        (clientId && String(v.client_id) === String(clientId)) ||
        (clientCode && String(v.client_code) === String(clientCode))
      ).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    }

    const res = await db.query(
      'SELECT * FROM visitas WHERE (? IS NOT NULL AND client_id = ?) OR (? IS NOT NULL AND client_code = ?) ORDER BY fecha DESC',
      [clientId || null, clientId || null, clientCode || null, clientCode || null]
    );
    const rows = res.values || [];
    return rows.map(r => ({
      ...r,
      inventory: r.inventory ? JSON.parse(r.inventory) : null
    }));
  } catch (e) {
    console.warn('[visitsRepository] Error leyendo visitas locales:', e);
    return [];
  }
}

/**
 * Obtiene visitas por ruta (con soporte Offline)
 * @param {string} route - Nombre de la ruta (sales_route/user_route)
 * @param {Object} filters - { specificDate, startDate, endDate }
 */
export async function getVisitsByRoute(route, filters = {}) {
  const online = await isOnline().catch(() => false);
  const normalizedRoute = String(route).trim();

  if (online) {
    try {
      // Use MySQL API
      const params = { route: normalizedRoute, limit: 1000 };
      if (filters.specificDate) params.start_date = filters.specificDate; // Logic in PHP handles specific date if start==end?
      // Actually PHP `visitas-read.php` had `start_date` and `end_date`.
      if (filters.specificDate) {
        params.start_date = filters.specificDate;
        params.end_date = filters.specificDate;
      } else if (filters.startDate) {
        params.start_date = filters.startDate;
        if (filters.endDate) params.end_date = filters.endDate;
      }

      const visits = await fetchVisitsApi(params);

      // Upsert local
      await upsertLocalVisits(visits);

      return visits;

    } catch (e) {
      console.error('[visitsRepository] Online route fetch failed, fallback to local', e);
      return await loadLocalVisitsByRoute(normalizedRoute, filters);
    }
  }

  return await loadLocalVisitsByRoute(normalizedRoute, filters);
}

// Helper to upsert visits without wiping client history
async function upsertLocalVisits(visits) {
  if (!visits.length) return;
  try {
    const db = await getDb();
    if (isMockDb()) {
      const current = db._storage.get('visitas') || [];
      const map = new Map(current.map(v => [v.id, v]));
      visits.forEach(v => map.set(v.id, { ...v, synced: 1 }));
      db._storage.set('visitas', Array.from(map.values()));
      return;
    }

    // SQLite Upsert
    await db.execute('BEGIN TRANSACTION');
    for (const v of visits) {
      const inventory = v.inventory ? JSON.stringify(v.inventory) : null;
      await db.run(
        `INSERT OR REPLACE INTO visitas (
                id, client_id, client_code, business_name, cliente_nombre, user_id, fecha, hora, ruta, motivo, notes, 
                photo_fachada, photo_interior, photo_enfriador, lat, lng, inventory, created_at, synced
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          v.id, v.client_id, v.client_code, v.business_name, v.cliente_nombre || v.client_name || '', v.user_id,
          v.fecha || v.date, v.hora, v.ruta || v.route, v.motivo, v.notes,
          v.photo_fachada, v.photo_interior, v.photo_enfriador, v.lat, v.lng,
          inventory, v.created_at, 1
        ]
      );
    }
    await db.execute('COMMIT');
  } catch (e) {
    console.error('[visitsRepository] upsertLocalVisits error:', e);
    try { const db = await getDb(); await db.execute('ROLLBACK'); } catch (e2) { }
  }
}

async function loadLocalVisitsByRoute(route, filters) {
  try {
    const db = await getDb();
    const normalizedRoute = normalizeVisitRoute(route);

    let params = [];
    let whereClauses = [];

    // SQLite `visitas` stores the assigned route in `ruta`. The other route
    // columns belong to clients and are not present in this table.
    let query = `SELECT v.*, c.name as joined_client_name
             FROM visitas v
             LEFT JOIN clients c ON CAST(v.client_id AS TEXT) = CAST(c.id AS TEXT)`;

    if (filters.specificDate) {
      whereClauses.push(`v.fecha LIKE ?`);
      params.push(`${String(filters.specificDate).slice(0, 10)}%`);
    } else if (filters.startDate) {
      whereClauses.push(`v.fecha >= ?`);
      params.push(String(filters.startDate).slice(0, 10));
      if (filters.endDate) {
        whereClauses.push(`v.fecha < ?`);
        const end = new Date(`${String(filters.endDate).slice(0, 10)}T00:00:00Z`);
        end.setUTCDate(end.getUTCDate() + 1);
        params.push(end.toISOString().slice(0, 10));
      }
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    query += ` ORDER BY v.fecha DESC, v.created_at DESC`;

    if (isMockDb()) {
      return (db._storage.get('visitas') || []).filter(v =>
        normalizeVisitRoute(v.ruta || v.route || v.sales_route) === normalizedRoute &&
        matchesVisitDate(v, filters)
      ).sort((a, b) => new Date(b.fecha || b.created_at) - new Date(a.fecha || a.created_at));
    }

    const res = await db.query(query, params);
    return (res.values || []).filter(r => normalizeVisitRoute(r.ruta) === normalizedRoute).map(r => ({
      ...r,
      inventory: r.inventory ? JSON.parse(r.inventory) : null,
      // Ensure we expose a name for the UI
      cliente_nombre: r.cliente_nombre || r.joined_client_name || r.client_name || ''
    }));
  } catch (e) {
    console.error('[visitsRepository] loadLocalVisitsByRoute error:', e);
    return [];
  }
}

function normalizeVisitRoute(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^ruta\s*/, '')
    .replace(/[^a-z0-9]/g, '');
}

function matchesVisitDate(visit, filters = {}) {
  const date = String(visit.fecha || visit.created_at || '').slice(0, 10);
  if (filters.specificDate) return date === String(filters.specificDate).slice(0, 10);
  if (filters.startDate && date < String(filters.startDate).slice(0, 10)) return false;
  if (filters.endDate && date > String(filters.endDate).slice(0, 10)) return false;
  return true;
}

export async function createVisit(visit) {
  if (!visit?.photo_fachada) {
    throw new Error('La foto de fachada es obligatoria para registrar la visita.');
  }
  const online = await isOnline();
  const now = getNowMexico();

  // Asegurar ID
  if (!visit.id) visit.id = crypto.randomUUID();

  const row = {
    ...visit,
    fecha: visit.fecha || getTodayMexico(),
    hora: visit.hora || getMexicoTimeString(),
    created_at: visit.created_at || now,
  };

  if (online) {
    try {
      const uploadReadyRow = await uploadInlineVisitPhotos(row);
      const res = await importVisitsApi([uploadReadyRow]);
      if (res.errors && res.errors.length > 0) throw new Error('MySQL Import Errors: ' + JSON.stringify(res.errors));

      // The server has the visit; local cache failure must not enqueue a second
      // copy or report the successful server write as failed.
      await insertLocalVisit(uploadReadyRow, true).catch(error => {
        console.warn('[visitsRepository] Visit saved online but local cache failed:', error);
      });
    } catch (error) {
      console.error('[visitsRepository] Error inserting visit online, fallback to pending:', error);
      await handleOfflineVisit(row, now);
    }
  } else {
    await handleOfflineVisit(row, now);
  }

  return row;
}

async function uploadInlineVisitPhotos(visit) {
  const prepared = { ...visit };
  for (const field of ['photo_fachada', 'photo_interior', 'photo_enfriador']) {
    const dataUrl = prepared[field];
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) continue;

    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const { uploadPhoto } = await import('@/lib/uploadService');
    const photoUrl = await uploadPhoto(blob, 'visitas-fotos');
    if (!photoUrl) throw new Error(`No se pudo subir ${field}; la visita quedará pendiente para sincronizar.`);
    prepared[field] = photoUrl;
  }
  return prepared;
}

// Helper for offline logic
async function handleOfflineVisit(row, now) {
  let localSaveError = null;
  try {
    await insertLocalVisit(row, false);
  } catch (error) {
    localSaveError = error;
  }

  // Preparar payload para syncService
  const payload = { ...row };
  const base64Photos = {};

  // Detectar y extraer fotos Base64
  if (payload.photo_fachada?.startsWith('data:')) {
    base64Photos.fachada = payload.photo_fachada;
    payload.photo_fachada = null;
  }
  if (payload.photo_interior?.startsWith('data:')) {
    base64Photos.interior = payload.photo_interior;
    payload.photo_interior = null;
  }
  if (payload.photo_enfriador?.startsWith('data:')) {
    base64Photos.enfriador = payload.photo_enfriador;
    payload.photo_enfriador = null;
  }

  if (Object.keys(base64Photos).length > 0) {
    payload._base64_photos = base64Photos;
  }

  try {
    const { addPendingOperation } = await import('@/sync/syncService');
    await addPendingOperation({
      entity_type: 'visit',
      operation: 'insert',
      payload: payload,
      created_at: now,
    });
  } catch (e) {
    console.error('[visitsRepository] Error agregando operación pendiente:', e);
    throw new Error(localSaveError
      ? `No se pudo guardar la visita localmente ni ponerla en cola: ${e.message || e}`
      : `La visita quedó guardada localmente, pero no se pudo preparar su sincronización: ${e.message || e}`);
  }
}

async function insertLocalVisit(v, synced) {
  try {
    const db = await getDb();
    if (isMockDb()) {
      const current = db._storage.get('visitas') || [];
      db._storage.set('visitas', [...current, { ...v, synced: synced ? 1 : 0 }]);
      return;
    }

    const inventory = v.inventory ? JSON.stringify(v.inventory) : null;
    await db.run(
      `INSERT OR REPLACE INTO visitas (
        id, client_id, client_code, business_name, cliente_nombre, user_id, fecha, hora, ruta, motivo, notes, 
        photo_fachada, photo_interior, photo_enfriador, lat, lng, inventory, created_at, synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        v.id,
        v.client_id,
        v.client_code,
        v.business_name,
        v.cliente_nombre || v.client_name || '',
        v.user_id,
        v.fecha || v.date,
        v.hora,
        v.ruta || v.route,
        v.motivo,
        v.notes,
        v.photo_fachada,
        v.photo_interior,
        v.photo_enfriador,
        v.lat,
        v.lng,
        inventory,
        v.created_at,
        synced ? 1 : 0
      ]
    );
  } catch (e) {
    console.error('[visitsRepository] Error insertando visita local:', e);
    throw e;
  }
}

export async function getVisitsSummary(clientIds, fromDate, toDate) {
  const online = await isOnline().catch(() => false);
  let visits = [];

  if (online) {
    try {
      // Fetch all visits for the date range from MySQL
      // We don't filter by client_id in the API call because we have a list of IDs/Codes
      // and the API might only support single ID or Route.
      // Fetching one day of visits is lightweight.
      visits = await fetchVisitsApi({
        start_date: fromDate,
        end_date: toDate + ' 23:59:59', // Fix: Capture full day (datetime vs date)
        limit: 2000 // reasonable safety limit
      });

      // Filter locally to match the requested clients
      // We must handle string/number type mismatch
      const allowed = new Set(clientIds.map(String));

      // Fix: Check matches against client_id (UUID/Int) OR client_code (String)
      // The API returns 'client_id' as internal ID (e.g. 94) and 'client_code' (e.g. "999")
      visits = visits.filter(v => {
        const idMatch = allowed.has(String(v.client_id));
        const codeMatch = v.client_code && allowed.has(String(v.client_code));
        return idMatch || codeMatch;
      });

      // Save to local for offline caching (Background)
      if (visits && visits.length > 0) {
        saveVisitsToLocalBatch(visits).catch(e => console.warn('[visitsRepository] Background save failed', e));
      }

    } catch (err) {
      console.warn('[visitsRepository] Error fetching online summary, falling back to local', err);
      // Fallback to local
      visits = await loadLocalVisitsSummary(clientIds, fromDate, toDate);
    }
  } else {
    visits = await loadLocalVisitsSummary(clientIds, fromDate, toDate);
  }

  // Fix: Use Mexico City time for 'today' to match user reality and avoid UTC shift
  // 'sv-SE' implies YYYY-MM-DD format
  const today = getTodayMexico(); // Mexico timezone
  const todayCount = visits.filter(v => (v.fecha || '').startsWith(today)).length;
  const totalCount = visits.length;

  return {
    today: todayCount,
    total: totalCount,
    visits
  };
}

async function loadLocalVisitsSummary(clientIds, start, end) {
  try {
    const db = await getDb();
    if (clientIds.length === 0) return [];

    // slice dates to YYYY-MM-DD
    const s = start.slice(0, 10);
    const datePrefix = s;
    const sameDay = start.slice(0, 10) === end.slice(0, 10);

    if (isMockDb()) {
      const all = db._storage.get('visitas') || [];
      const set = new Set(clientIds.map(String)); // Normalize to String for lookup

      return all.filter(v => {
        const vId = String(v.client_id);
        const hasId = set.has(vId);

        let dateMatch = false;
        if (sameDay) {
          dateMatch = (v.fecha || '').startsWith(datePrefix);
        } else {
          const e = end.slice(0, 10) + 'T23:59:59';
          dateMatch = v.fecha >= s && v.fecha <= e;
        }

        return hasId && dateMatch;
      });
    }

    const placeholders = clientIds.map(() => '?').join(',');

    let query;
    let params;

    if (sameDay) {
      // Use LIKE to handle both "2023-01-01T..." and "2023-01-01 ..."
      query = `SELECT id, fecha, created_at, client_id FROM visitas WHERE client_id IN (${placeholders}) AND fecha LIKE ?`;
      params = [...clientIds, datePrefix + '%'];
    } else {
      // Range support
      const e = end.slice(0, 10) + '\uffff';
      query = `SELECT id, fecha, created_at, client_id FROM visitas WHERE client_id IN (${placeholders}) AND fecha >= ? AND fecha <= ?`;
      params = [...clientIds, s, e];
    }

    const res = await db.query(query, params);
    return res.values || [];
  } catch (e) {
    console.error('[visitsRepository] Error loading local summary:', e);
    return [];
  }
}

/**
 * Obtiene visitas completas para múltiples clientes.
 */
export async function getVisitsByClients(clientIds) {
  // Fallback local for now
  return await loadLocalVisitsByClients(clientIds);
}

async function loadLocalVisitsByClients(clientIds) {
  try {
    const db = await getDb();
    if (clientIds.length === 0) return [];

    if (isMockDb()) {
      const all = db._storage.get('visitas') || [];
      const set = new Set(clientIds);
      return all.filter(v => set.has(v.client_id)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    const placeholders = clientIds.map(() => '?').join(',');
    const query = `SELECT * FROM visitas WHERE client_id IN (${placeholders}) ORDER BY created_at DESC`;
    const res = await db.query(query, clientIds);
    const rows = res.values || [];
    return rows.map(r => ({
      ...r,
      inventory: r.inventory ? JSON.parse(r.inventory) : null
    }));
  } catch (e) {
    console.error('[visitsRepository] Error loading local batch visits:', e);
    return [];
  }
}

// ... existing code ...

/**
 * Sync visits for a list of routes (Chunked/Streamed)
 */
export async function syncVisitsForRoutes(routes) {
  const online = await isOnline().catch(() => false);
  if (!online) return await loadAllLocalVisits();

  console.log(`[visitsRepository] Syncing visits for ${routes.length} routes...`);

  // Use a sensible limit per route to allow history but not kill bandwidth
  // 500 visits per route is roughly 3-4 months if visiting 5/day.
  const LIMIT_PER_ROUTE = 500;
  let totalSaved = 0;

  // Process serially with pause to prevent ANR
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    try {
      if (i > 0) await new Promise(r => setTimeout(r, 150)); // Throttling

      console.log(`[visitsRepository] Fetching visits for route ${route}...`);
      const visits = await fetchVisitsApi({
        route: route,
        limit: LIMIT_PER_ROUTE
      });

      if (visits && visits.length > 0) {
        // Save immediately to clear RAM
        await saveVisitsToLocalBatch(visits);
        totalSaved += visits.length;
      }
    } catch (e) {
      console.error(`[visitsRepository] Error syncing route ${route}:`, e);
      // Continue to next route
    }
  }

  console.log(`[visitsRepository] Visits Sync Complete. Saved ${totalSaved} visits.`);
  // Return Count object for FullSyncService
  return { count: totalSaved };
}

// Optimized Batch Save (without deleting per client, as we have mixed clients)
// We use INSERT OR REPLACE.
async function saveVisitsToLocalBatch(visits) {
  if (!visits.length) return;
  try {
    const db = await getDb();
    if (isMockDb()) {
      const current = db._storage.get('visitas') || [];
      const map = new Map(current.map(v => [v.id, v]));
      visits.forEach(v => map.set(v.id, { ...v, synced: 1 }));
      db._storage.set('visitas', Array.from(map.values()));
      return;
    }

    // Transaction for speed
    await db.execute('BEGIN TRANSACTION');

    // SQLite Parameters limit ~999. 
    // Schema has 17 columns. 50 * 17 = 850. Safe size is 50.
    const BATCH_SIZE = 50;

    // Prepare statement? No, simple batch insert loop
    for (let i = 0; i < visits.length; i += BATCH_SIZE) {
      const chunk = visits.slice(i, i + BATCH_SIZE);
      const placeholders = chunk.map(() => `(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).join(',');
      const values = [];

      chunk.forEach(v => {
        const inventory = v.inventory ? JSON.stringify(v.inventory) : null;
        values.push(
          v.id, v.client_id, v.client_code, v.business_name, v.cliente_nombre || v.client_name || '', v.user_id,
          v.fecha || v.date, v.hora, v.ruta || v.route, v.motivo, v.notes,
          v.photo_fachada, v.photo_interior, v.photo_enfriador, v.lat, v.lng,
          inventory, v.created_at, 1
        );
      });

      await db.run(
        `INSERT OR REPLACE INTO visitas (
            id, client_id, client_code, business_name, cliente_nombre, user_id, fecha, hora, ruta, motivo, notes, 
            photo_fachada, photo_interior, photo_enfriador, lat, lng, inventory, created_at, synced
          ) VALUES ${placeholders}`,
        values
      );
    }

    await db.execute('COMMIT');
  } catch (e) {
    console.error('[visitsRepository] Batch save error:', e);
    try { await getDb().then(d => d.execute('ROLLBACK')); } catch { }
  }
}

/**
 * Obtiene todas las visitas (limitado para offline).
 */
export async function getAllVisits() {
  const online = await isOnline().catch(() => false);
  if (online) {
    try {
      console.log('[visitsRepository] Fetching global visits online...');
      const visits = await fetchVisitsApi({ limit: 1000 });
      if (visits && visits.length > 0) {
        // Cache-on-read: Save global visits to local
        saveVisitsToLocalBatch(visits).catch(e => console.warn('[visitsRepository] Warning: Background save failed', e));
      }
      return visits;
    } catch (e) {
      console.warn('[visitsRepository] Online global fetch failed, using local:', e);
    }
  }
  return await loadAllLocalVisits();
}
// ... existing code ...

async function loadAllLocalVisits() {
  try {
    const db = await getDb();
    if (isMockDb()) {
      return (db._storage.get('visitas') || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    const res = await db.query('SELECT * FROM visitas ORDER BY created_at DESC LIMIT 2000');
    const rows = res.values || [];
    return rows.map(r => ({
      ...r,
      inventory: r.inventory ? JSON.parse(r.inventory) : null
    }));
  } catch (e) { return []; }
}

/**
 * Obtiene el conteo total de visitas
 */
export async function getVisitsCount() {
  return await getLocalVisitsCount();
}

async function getLocalVisitsCount() {
  try {
    const db = await getDb();
    if (isMockDb()) {
      return (db._storage.get('visitas') || []).length;
    }
    const res = await db.query('SELECT COUNT(*) as count FROM visitas');
    return res.values[0]?.count || 0;
  } catch (e) {
    return 0;
  }
}
