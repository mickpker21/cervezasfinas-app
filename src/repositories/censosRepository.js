import { getDb, isMockDb } from '@/lib/localDb';
import { isOnline } from '@/lib/network';
import { importCensosApi, fetchCensosApi } from '@/lib/mysqlCensos';

// ─────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────
export async function createCenso(censo) {
    const now = new Date().toISOString();
    if (!censo.id) censo.id = crypto.randomUUID();
    const row = { ...censo, created_at: censo.created_at || now, synced: 0 };

    // Always save locally first (idempotent INSERT OR REPLACE)
    await insertLocalCenso(row);

    const online = await isOnline().catch(() => false);
    if (online) {
        try {
            // Try to upload photo first if it's base64 (Enfriador)
            let rowToSync = { ...row };
            if (rowToSync.photo_url && rowToSync.photo_url.startsWith('data:')) {
                try {
                    const { uploadPhoto } = await import('@/lib/uploadService');
                    const { base64ToBlob } = await import('@/lib/fileUtils');
                    const blob = await base64ToBlob(rowToSync.photo_url);
                    const photoUrl = await uploadPhoto(blob, 'visitas-fotos');
                    if (photoUrl) {
                        rowToSync.photo_url = photoUrl;
                        // Update local record with real URL
                        await updateLocalCensoField(row.id, 'photo_url', photoUrl);
                    }
                } catch (photoErr) {
                    console.warn('[censosRepository] Photo upload failed, keeping base64:', photoErr);
                }
            }

            // Try to upload photo first if it's base64 (Fachada)
            if (rowToSync.photo_fachada && rowToSync.photo_fachada.startsWith('data:')) {
                try {
                    const { uploadPhoto } = await import('@/lib/uploadService');
                    const { base64ToBlob } = await import('@/lib/fileUtils');
                    const blob = await base64ToBlob(rowToSync.photo_fachada);
                    const photoFachadaUrl = await uploadPhoto(blob, 'visitas-fotos');
                    if (photoFachadaUrl) {
                        rowToSync.photo_fachada = photoFachadaUrl;
                        // Update local record with real URL
                        await updateLocalCensoField(row.id, 'photo_fachada', photoFachadaUrl);
                    }
                } catch (photoErr) {
                    console.warn('[censosRepository] Fachada Photo upload failed, keeping base64:', photoErr);
                }
            }

            await importCensosApi([rowToSync]);
            await markCensoSynced(row.id);
        } catch (e) {
            console.warn('[censosRepository] Online import failed, queuing for later sync:', e);
            await addPendingCenso(row, now);
        }
    } else {
        await addPendingCenso(row, now);
    }

    return row;
}

async function addPendingCenso(row, now) {
    try {
        const { addPendingOperation } = await import('@/sync/syncService');
        await addPendingOperation({
            entity_type: 'censo_supervisor',
            operation: 'insert',
            payload: row,
            created_at: now,
        });
    } catch (e) {
        console.error('[censosRepository] Error adding pending op:', e);
    }
}

async function insertLocalCenso(row) {
    try {
        const db = await getDb();
        if (isMockDb()) {
            const all = db._storage.get('censos_supervisor') || [];
            db._storage.set('censos_supervisor', [...all, row]);
            return;
        }
        await db.run(
            `INSERT OR REPLACE INTO censos_supervisor
             (id, client_id, client_code, client_name, supervisor_id, supervisor_name,
              survey_type, tiene_fachada, tipo_fachada, tiene_enfriador, modelo, serial, posicion, invadido,
              photo_url, photo_fachada, lat, lng, notas, created_at, synced, validated_assets)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                row.id, row.client_id, row.client_code, row.client_name,
                row.supervisor_id, row.supervisor_name, row.survey_type || 'CENSO_SUPERVISOR',
                row.tiene_fachada ? 1 : 0, row.tipo_fachada, row.tiene_enfriador ? 1 : 0, row.modelo, row.serial,
                row.posicion, row.invadido ? 1 : 0,
                row.photo_url, row.photo_fachada, row.lat, row.lng, row.notas,
                row.created_at, row.synced ?? 0, row.validated_assets
            ]
        );
    } catch (e) {
        console.error('[censosRepository] insertLocalCenso error:', e);
    }
}

async function markCensoSynced(id) {
    try {
        const db = await getDb();
        if (isMockDb()) {
            const all = db._storage.get('censos_supervisor') || [];
            db._storage.set('censos_supervisor', all.map(c => c.id === id ? { ...c, synced: 1 } : c));
            return;
        }
        await db.run('UPDATE censos_supervisor SET synced = 1 WHERE id = ?', [id]);
    } catch (e) { /* non-critical */ }
}

async function updateLocalCensoField(id, field, value) {
    try {
        const db = await getDb();
        if (isMockDb()) {
            const all = db._storage.get('censos_supervisor') || [];
            db._storage.set('censos_supervisor', all.map(c => c.id === id ? { ...c, [field]: value } : c));
            return;
        }
        await db.run(`UPDATE censos_supervisor SET ${field} = ? WHERE id = ?`, [value, id]);
    } catch (e) { /* non-critical */ }
}

// ─────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────
/**
 * @param {Object} filters - { supervisor_id, from, to, client_code, limit, offset }
 */
export async function getCensos(filters = {}) {
    const online = await isOnline().catch(() => false);
    if (online) {
        try {
            return await fetchCensosApi(filters);
        } catch (e) {
            console.warn('[censosRepository] Online fetch failed, using local:', e);
        }
    }
    return await loadLocalCensos(filters);
}

async function loadLocalCensos(filters = {}) {
    try {
        const db = await getDb();
        if (isMockDb()) {
            let all = db._storage.get('censos_supervisor') || [];
            if (filters.supervisor_id) all = all.filter(c => c.supervisor_id === filters.supervisor_id);
            if (filters.client_code) all = all.filter(c => c.client_code === filters.client_code);
            return all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        let query = 'SELECT * FROM censos_supervisor WHERE 1=1';
        const params = [];
        if (filters.supervisor_id) { query += ' AND supervisor_id = ?'; params.push(filters.supervisor_id); }
        if (filters.client_code)   { query += ' AND client_code = ?';   params.push(filters.client_code); }
        if (filters.from)          { query += ' AND created_at >= ?';   params.push(filters.from); }
        if (filters.to)            { query += ' AND created_at <= ?';   params.push(filters.to + 'T23:59:59'); }
        query += ' ORDER BY created_at DESC';
        if (filters.limit)  { query += ' LIMIT ?';  params.push(Number(filters.limit)); }
        if (filters.offset) { query += ' OFFSET ?'; params.push(Number(filters.offset)); }

        const res = await db.query(query, params);
        return res.values || [];
    } catch (e) {
        console.error('[censosRepository] loadLocalCensos error:', e);
        return [];
    }
}

/**
 * Get all unsynced censos for the sync service.
 */
export async function getUnsyncedCensos() {
    try {
        const db = await getDb();
        if (isMockDb()) {
            return (db._storage.get('censos_supervisor') || []).filter(c => !c.synced);
        }
        const res = await db.query('SELECT * FROM censos_supervisor WHERE synced = 0', []);
        return res.values || [];
    } catch (e) { return []; }
}
