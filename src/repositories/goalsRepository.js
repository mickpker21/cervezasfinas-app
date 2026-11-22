import { isOnline, withTimeout } from '@/lib/network';
import { getDb, isMockDb } from '@/lib/localDb';
import { supabase } from '@/supabaseClient';

/**
 * Obtiene las metas de venta para una ruta y periodo.
 * - ONLINE: Descarga de Supabase y guarda en local.
 * - OFFLINE: Lee de SQLite.
 */
export async function getGoals({ salesRoute, from, to, nextFrom, isMonthPicker }) {
    let online = false;
    try {
        online = await isOnline();
    } catch (e) {
        online = false;
    }

    if (online) {
        try {
            // Query a Supabase con soporte para variantes de ruta (ej. '101' y 'R-101')
            const cleanDigits = String(salesRoute || '').replace(/[^0-9]/g, '');
            let q = supabase.from('metas_venta').select('*');

            if (cleanDigits.length > 0 && cleanDigits !== String(salesRoute)) {
                q = q.or(`sales_route.ilike.%${salesRoute}%,sales_route.ilike.%${cleanDigits}%`);
            } else {
                q = q.ilike('sales_route', `%${salesRoute}%`);
            }

            q = q.gte('period_date', from);

            if (isMonthPicker && nextFrom) q = q.lt('period_date', nextFrom);
            else if (!isMonthPicker && to) q = q.lte('period_date', to);

            // RACE: API vs 2s Timeout
            const { data, error } = await withTimeout(q, 5000);
            if (error) throw error;

            // Guardar en local (Await)
            await saveGoalsToLocal(data);
            return data || [];
        } catch (error) {
            console.error('[goalsRepository] Error fetching online, falling back to local:', error);
            return await loadLocalGoals({ salesRoute, from, to, nextFrom, isMonthPicker });
        }
    } else {
        return await loadLocalGoals({ salesRoute, from, to, nextFrom, isMonthPicker });
    }
}

/**
 * Obtiene TODAS las metas del mes (para Rankings).
 */
export async function getAllGoals({ from, to }) {
    let online = false;
    try { online = await isOnline(); } catch (e) { online = false; }

    if (online) {
        try {
            const { data, error } = await supabase
                .from('metas_venta')
                .select('*')
                .gte('period_date', from)
                .lte('period_date', to);

            if (error) throw error;
            if (data && data.length > 0) await saveGoalsToLocal(data);
            return data || [];
        } catch (e) {
            console.error('[goalsRepo] Error fetching all goals online, falling back to local:', e);
            return await loadAllLocalGoals({ from, to });
        }
    }
    return await loadAllLocalGoals({ from, to });
}

async function loadAllLocalGoals({ from, to }) {
    try {
        const db = await getDb();
        if (isMockDb()) {
            const all = db._storage.get('metas_venta') || [];
            return all.filter(r => r.period_date >= from && r.period_date <= to);
        }
        const res = await db.query('SELECT * FROM metas_venta WHERE period_date >= ? AND period_date <= ?', [from, to]);
        return res.values || [];
    } catch (e) {
        console.error('[goalsRepository] Error loading all local goals:', e);
        return [];
    }
}

async function loadLocalGoals({ salesRoute, from, to, nextFrom, isMonthPicker }) {
    try {
        const db = await getDb();
        const start = from;
        const end = nextFrom ? nextFrom : (to || '9999-12-31');
        const isNextFrom = !!nextFrom;

        const cleanDigits = String(salesRoute || '').replace(/[^0-9]/g, '');

        if (isMockDb()) {
            const all = db._storage.get('metas_venta') || [];
            return all.filter(r => {
                const rRoute = String(r.sales_route || '');
                const rDigits = rRoute.replace(/[^0-9]/g, '');
                const matchesRoute = !salesRoute || salesRoute === '__ALL__'
                    || rRoute.includes(salesRoute)
                    || salesRoute.includes(rRoute)
                    || (cleanDigits.length > 0 && rDigits === cleanDigits);

                if (!matchesRoute) return false;
                if (r.period_date < start) return false;
                if (isNextFrom) {
                    if (r.period_date >= end) return false;
                } else {
                    if (r.period_date > end) return false;
                }
                return true;
            });
        }

        // SQLite Query con soporte flexible para nombres de ruta (ej: '101' vs 'R-101' vs 'Ruta 101')
        let query = `SELECT * FROM metas_venta WHERE period_date >= ?`;
        const queryParams = [start];

        if (salesRoute && salesRoute !== '__ALL__') {
            if (cleanDigits.length > 0) {
                query += ` AND (sales_route LIKE ? OR sales_route LIKE ? OR ? LIKE '%' || sales_route || '%')`;
                queryParams.push(`%${salesRoute}%`, `%${cleanDigits}%`, salesRoute);
            } else {
                query += ` AND (sales_route LIKE ? OR ? LIKE '%' || sales_route || '%')`;
                queryParams.push(`%${salesRoute}%`, salesRoute);
            }
        }

        if (isNextFrom) {
            query += ` AND period_date < ?`;
            queryParams.push(end);
        } else {
            query += ` AND period_date <= ?`;
            queryParams.push(end);
        }

        const res = await db.query(query, queryParams);
        return res.values || [];
    } catch (e) {
        console.error('[goalsRepository] Error loading local goals:', e);
        return [];
    }
}

async function saveGoalsToLocal(rows) {
    if (!rows || rows.length === 0) return;

    try {
        const db = await getDb();
        const now = new Date().toISOString();

        if (isMockDb()) {
            const current = db._storage.get('metas_venta') || [];
            const map = new Map(current.map(r => [r.id, r]));
            for (const r of rows) {
                const id = r.id || `${r.sales_route}_${r.period_date}`;
                map.set(id, { ...r, id, created_at: now });
            }
            db._storage.set('metas_venta', Array.from(map.values()));
            return;
        }

        const statements = rows.map(r => {
            const id = r.id || `${r.sales_route}_${r.period_date}`;
            return [
                id,
                r.sales_route,
                r.period_date,
                Number(r.meta) || 0,
                Number(r.meta_clientes) || 0,
                Number(r.meta_clientes_1htl) || 0,
                now
            ];
        });

        const BATCH_SIZE = 50;
        for (let i = 0; i < statements.length; i += BATCH_SIZE) {
            const chunk = statements.slice(i, i + BATCH_SIZE);
            const placeholders = chunk.map(() => `(?, ?, ?, ?, ?, ?, ?)`).join(',');
            const values = chunk.flat();

            try {
                await db.run(`
                    INSERT OR REPLACE INTO metas_venta (
                      id, sales_route, period_date, meta, meta_clientes, meta_clientes_1htl, created_at
                    ) VALUES ${placeholders}
                `, values);
            } catch (errCol) {
                console.warn('[goalsRepository] Fallback guardando columnas base en metas_venta:', errCol);
                const basePlaceholders = chunk.map(() => `(?, ?, ?, ?, ?)`).join(',');
                const baseValues = chunk.map(c => [c[0], c[1], c[2], c[3], c[6]]).flat();
                await db.run(`
                    INSERT OR REPLACE INTO metas_venta (
                      id, sales_route, period_date, meta, created_at
                    ) VALUES ${basePlaceholders}
                `, baseValues);
            }
        }
    } catch (e) {
        console.error('[goalsRepository] Error saving goals to local:', e);
    }
}

/**
 * Obtiene metas de ZONA.
 */
export async function getZoneGoals({ zona, from, to, nextFrom, isMonthPicker }) {
    let online = false;
    try { online = await isOnline(); } catch (e) { online = false; }

    if (online) {
        try {
            let q = supabase.from('metas_zona').select('*').gte('period_date', from);
            if (zona && zona !== '__ALL__') q = q.eq('zona', zona);

            if (isMonthPicker && nextFrom) q = q.lt('period_date', nextFrom);
            else if (!isMonthPicker && to) q = q.lte('period_date', to);

            // RACE: API vs 10s Timeout
            const { data, error } = await withTimeout(q, 10000);
            if (error) throw error;
            await saveZoneGoalsToLocal(data);
            return data || [];
        } catch (error) {
            console.error('[goalsRepository] Error fetching zone goals online:', error);
            return await loadLocalZoneGoals({ zona, from, to, nextFrom, isMonthPicker });
        }
    } else {
        return await loadLocalZoneGoals({ zona, from, to, nextFrom, isMonthPicker });
    }
}

async function loadLocalZoneGoals({ zona, from, to, nextFrom, isMonthPicker }) {
    try {
        const db = await getDb();
        const start = from;
        const end = nextFrom ? nextFrom : (to || '9999-12-31');
        const isNextFrom = !!nextFrom;

        if (isMockDb()) {
            const all = db._storage.get('metas_zona') || [];
            return all.filter(r => {
                if (zona && zona !== '__ALL__' && r.zona !== zona) return false;
                if (r.period_date < start) return false;
                if (isNextFrom) { if (r.period_date >= end) return false; }
                else { if (r.period_date > end) return false; }
                return true;
            });
        }

        let query = `SELECT * FROM metas_zona WHERE period_date >= ?`;
        const queryParams = [start];

        if (isNextFrom) { query += ` AND period_date < ?`; queryParams.push(end); }
        else { query += ` AND period_date <= ?`; queryParams.push(end); }

        if (zona && zona !== '__ALL__') {
            query += ` AND zona = ?`;
            queryParams.push(zona);
        }

        const res = await db.query(query, queryParams);
        return res.values || [];
    } catch (e) {
        console.error('[goalsRepository] Error loading local zone goals:', e);
        return [];
    }
}

async function saveZoneGoalsToLocal(rows) {
    if (!rows || rows.length === 0) return;
    try {
        const db = await getDb();
        const now = new Date().toISOString();

        if (isMockDb()) {
            const current = db._storage.get('metas_zona') || [];
            const map = new Map(current.map(r => [r.id, r]));
            for (const r of rows) {
                const id = r.id || `${r.zona}_${r.period_date}`;
                map.set(id, { ...r, id, created_at: now });
            }
            db._storage.set('metas_zona', Array.from(map.values()));
            return;
        }

        const statements = rows.map(r => {
            const id = r.id || `${r.zona}_${r.period_date}`;
            return [id, r.zona, r.period_date, r.meta, now];
        });

        const BATCH_SIZE = 50;
        for (let i = 0; i < statements.length; i += BATCH_SIZE) {
            const chunk = statements.slice(i, i + BATCH_SIZE);
            const placeholders = chunk.map(() => `(?, ?, ?, ?, ?)`).join(',');
            const values = chunk.flat();
            await db.run(`INSERT OR REPLACE INTO metas_zona (id, zona, period_date, meta, created_at) VALUES ${placeholders}`, values);
        }
    } catch (e) {
        console.error('[goalsRepository] Error saving zone goals:', e);
    }
}

/**
 * Sync logic for Full Sync Service
 */
export async function syncGoalsForRoutes(routes) {
    if (!routes || routes.length === 0) return;

    // Default range: Last 2 months to next 2 months?
    // Or just "Current Year"? Safe bet: 3 months back, 3 months forward.
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    const from = d.toISOString().slice(0, 10);

    // We can't iterate efficiently with 'ilike' for many routes in one query if we want to be precise,
    // but we can try 'in' if we strip the fuzzy match requirement, or just loop.
    // Given Supabase, 'or' syntax is messy for many items.
    // Let's loop for now (routes are usually < 50).

    console.log(`[goalsRepository] Syncing goals for ${routes.length} routes...`);

    for (const route of routes) {
        try {
            // We reuse getGoals but we must force it to "fetch online" if we want to sync.
            // But getGoals checks isOnline internally.
            await getGoals({ salesRoute: route, from, isMonthPicker: false });
        } catch (e) {
            console.warn(`[goalsRepository] Failed to sync goals for route ${route}`, e);
        }
    }
}

export async function syncZoneGoalsForZones(zones) {
    if (!zones || zones.length === 0) return;

    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    const from = d.toISOString().slice(0, 10);

    console.log(`[goalsRepository] Syncing goals for ${zones.length} zones...`);

    for (const zona of zones) {
        try {
            await getZoneGoals({ zona, from, isMonthPicker: false });
        } catch (e) {
            console.warn(`[goalsRepository] Failed to sync goals for zona ${zona}`, e);
        }
    }
}
