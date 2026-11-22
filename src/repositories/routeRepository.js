import { supabase } from '@/supabaseClient';
import { getTodayMexico, getNowMexico } from '@/lib/dateUtils';
import { kvStorage } from '@/services/kvStorage';
import { isOnline } from '@/lib/network';

/**
 * Route Repository
 * Manages "Route Sessions" (Open/Closed days)
 */

export const ROUTE_STATUS = {
    OPEN: 'OPEN',
    CLOSED: 'CLOSED'
};

export const getAdvisorRouteCacheKey = userId => `advisor_user_route_${userId}`;

/**
 * Robustly detects the user's route in Online/Offline scenarios.
 * Priority:
 * 1. KV Storage Cache (Fastest)
 * 2. Supabase Profile (Source of Truth - Online)
 * 3. User Metadata (Session)
 * 4. Local DB Metadata (Offline Fallback for 'supervisor_allowed_sales_routes')
 * 
 * @param {object} user - Supabase user object
 * @returns {Promise<string|null>}
 */
export async function detectUserRoute(user) {
    let u = user;
    if (!u) {
        try {
            u = await kvStorage.getItem('last_known_user');
        } catch (e) { }
    }

    const cacheKey = u?.id ? getAdvisorRouteCacheKey(u.id) : null;
    let cachedRoute = null;
    if (cacheKey) {
        try {
            cachedRoute = await kvStorage.getItem(cacheKey);
        } catch (e) { }
    }

    // Try last_known_route fallback immediately
    if (!cachedRoute) {
        try {
            cachedRoute = await kvStorage.getItem('last_known_route');
        } catch (e) { }
    }

    let route = "";

    // Prefer the current profile when online; the cache is only a fallback.
    const online = await isOnline().catch(() => false);
    if (online && u?.id) {
        try {
            const { data } = await supabase.from("profiles").select("*").eq("id", u.id).single();
            if (data) {
                route = data.route || data.sales_route || data.ruta || "";
            }
        } catch (e) { console.warn('[RouteRepo] Profile fetch failed:', e); }
    }

    // Use cached route if online profile didn't provide one
    if (!route && cachedRoute) route = String(cachedRoute).trim();

    // The auth provider persists this profile inside the SQLite-cached session.
    if (!route && u?.profile) {
        const p = u.profile;
        route = p.route || p.sales_route || p.ruta || p.route_number || "";
    }

    // Fallback to Session Metadata
    if (!route && u) {
        const m = u.user_metadata || {};
        route = m.route || m.sales_route || m.ruta || m.route_number || m.user_route || "";
    }

    // 4. Critical Offline Fallback: Local DB (Metadata)
    if (!route && u?.id) {
        try {
            const { getAllowedRoutes } = await import('./metadataRepository');
            const localRoutes = await getAllowedRoutes(u.id);
            if (localRoutes && localRoutes.sales && localRoutes.sales.length > 0) {
                route = localRoutes.sales[0];
                console.log('[RouteRepo] Recovered route from Local DB:', route);
            } else if (localRoutes && localRoutes.internal && localRoutes.internal.length > 0) {
                route = localRoutes.internal[0];
            }
        } catch (e) {
            console.warn('[RouteRepo] Local DB route recovery failed:', e);
        }
    }

    // 5. Last resort: infer from cached clients in SQLite
    if (!route) {
        try {
            const { getDb, isMockDb } = await import('@/lib/localDb');
            const db = await getDb();
            if (db && !isMockDb()) {
                if (u?.id) {
                    const ownerRes = await db.query(
                        `SELECT DISTINCT sales_route FROM clients
                         WHERE owner_id = ? AND sales_route IS NOT NULL AND TRIM(sales_route) <> ''`,
                        [u.id]
                    );
                    const ownerRoutes = [...new Set((ownerRes.values || []).map(row => String(row.sales_route || '').trim()).filter(Boolean))];
                    if (ownerRoutes.length === 1) {
                        route = ownerRoutes[0];
                    }
                }
                if (!route) {
                    const allRes = await db.query(
                        `SELECT DISTINCT sales_route FROM clients WHERE sales_route IS NOT NULL AND TRIM(sales_route) <> '' LIMIT 10`
                    );
                    const allRoutes = [...new Set((allRes.values || []).map(row => String(row.sales_route || '').trim()).filter(Boolean))];
                    if (allRoutes.length === 1) {
                        route = allRoutes[0];
                        console.log('[RouteRepo] Recovered unique route from local clients:', route);
                    }
                }
            }
        } catch (e) {
            console.warn('[RouteRepo] Cached client route recovery failed:', e);
        }
    }

    // Save if found (both user-scoped and global last_known_route)
    const final = String(route || "").trim();
    if (final) {
        if (cacheKey) {
            kvStorage.setItem(cacheKey, final).catch(() => { });
        }
        kvStorage.setItem('last_known_route', final).catch(() => { });
    }

    return final || null;
}

/**
 * Gets the session status for a specific user and date (defaults to Today Mexico)
 * @param {string} userId 
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<{status: string, closed_at: string, summary: object}>}
 */
export async function getRouteSession(userId, date = null) {
    if (!userId) return null;
    const targetDate = date || getTodayMexico();

    // 1. Try Local Storage First (Fastest)
    const localKey = `route_session_${userId}_${targetDate}`;
    try {
        const local = await kvStorage.getItem(localKey);
        if (local && local.status) {
            return local;
        }
    } catch (e) { }

    // 2. Try Online if available
    if (await isOnline()) {
        try {
            const { data, error } = await supabase
                .from('route_sessions')
                .select('*')
                .eq('user_id', userId)
                .eq('date', targetDate)
                .maybeSingle();

            if (data) {
                await kvStorage.setItem(localKey, data);
                return data;
            }
        } catch (e) {
            console.warn('[RouteRepo] Error fetching online session:', e);
        }
    }

    // Default: Open
    return { status: ROUTE_STATUS.OPEN };
}

/**
 * Closes the current day for the user.
 * @param {string} userId 
 * @param {object} stats - Daily stats summary to save
 */
export async function closeRouteSession(userId, stats) {
    const today = getTodayMexico();
    const now = getNowMexico();

    const sessionData = {
        user_id: userId,
        date: today,
        status: ROUTE_STATUS.CLOSED,
        closed_at: now,
        summary_stats: stats
    };

    // 1. Save Locally (Immediate Lock)
    const localKey = `route_session_${userId}_${today}`;
    await kvStorage.setItem(localKey, sessionData);

    // 2. Sync to Supabase (Best Effort)
    if (await isOnline()) {
        try {
            const { error } = await supabase
                .from('route_sessions')
                .upsert(sessionData, { onConflict: 'user_id, date' });

            if (error) throw error;
            return true;
        } catch (e) {
            console.error('[RouteRepo] Error syncing close session:', e);
            return true;
        }
    }

    return true;
}

/**
 * Gets active sessions for a specific date (for Monitoring Dashboard)
 * Only works Online.
 */
export async function getRouteSessionsForDate(date = null) {
    const targetDate = date || getTodayMexico();

    const { data, error } = await supabase
        .from('route_sessions')
        .select(`
            *,
            profiles: user_id (name, email, route)
        `)
        .eq('date', targetDate);

    if (error) throw error;
    return data || [];
}

/**
 * Gets all profiles with a route or sales_route assigned (for Ranking/Reports)
 */
export async function getAllRouteProfiles() {
    if (!await isOnline()) return [];

    const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, route, ruta, role');

    if (error) {
        console.error('[RouteRepo] Error fetching route profiles:', error);
        return [];
    }

    return data.filter(p =>
        (p.route && p.route.trim() !== '') ||
        (p.ruta && p.ruta.trim() !== '')
    );
}

/**
 * Gets distinct available routes (sales and internal) from all available sources.
 * Priority: MySQL API (fully paginated) → Supabase (clients + zonas_rutas + supervisor_allowed_routes) → LocalDB SQLite.
 *
 * - Sales routes come from: MySQL clients, Supabase clients, and zonas_rutas.ruta (authoritative catalog)
 * - Internal/Conquest routes come from: MySQL clients, Supabase clients, and supervisor_allowed_routes.route
 */
export async function getAvailableRoutes() {
    const salesSet = new Set();
    const internalSet = new Set();

    // 1. MySQL API — master client data, fully paginated
    // DESACTIVADO POR RENDIMIENTO EXTREMO (Bloqueaba el sistema con 32k clientes)
    // Las rutas ahora se extraen de la base local (SQLite) y de la tabla zonas_rutas de Supabase.
    // Esto reduce el tiempo de carga de 30 segundos a < 1 segundo.

    // 2. Supabase — clients table (may not exist) + zonas_rutas (catalog) + supervisor_allowed_routes (catalog)
    try {
        const online = await isOnline().catch(() => false);
        if (online) {
            const { supabase: sb } = await import('@/supabaseClient');

            // Use allSettled so a 404 on 'clients' doesn't prevent zonas_rutas / supervisor_allowed_routes from loading
            const [salesResult, internalResult, zonasRutasResult, conquestResult] = await Promise.allSettled([
                // Sales routes registered in clients (may 404 if table not in Supabase)
                sb.from('clients').select('sales_route').not('sales_route', 'is', null).neq('sales_route', ''),
                // Internal routes registered in clients (may 404 if table not in Supabase)
                sb.from('clients').select('internal_route').not('internal_route', 'is', null).neq('internal_route', ''),
                // zonas_rutas.ruta is the authoritative sales route catalog — always populate
                sb.from('zonas_rutas').select('ruta').not('ruta', 'is', null).neq('ruta', ''),
                // All conquest routes already assigned to any supervisor — populate as options
                sb.from('supervisor_allowed_routes').select('route').not('route', 'is', null).neq('route', ''),
            ]);

            // clients.sales_route
            if (salesResult.status === 'fulfilled' && salesResult.value?.data) {
                salesResult.value.data.forEach(r => {
                    const sr = String(r.sales_route || '').trim();
                    if (sr) salesSet.add(sr);
                });
            }
            // clients.internal_route
            if (internalResult.status === 'fulfilled' && internalResult.value?.data) {
                internalResult.value.data.forEach(r => {
                    const ir = String(r.internal_route || '').trim();
                    if (ir) internalSet.add(ir);
                });
            }
            // zonas_rutas.ruta → sales routes (authoritative catalog — always works)
            if (zonasRutasResult.status === 'fulfilled' && zonasRutasResult.value?.data) {
                zonasRutasResult.value.data.forEach(r => {
                    const sr = String(r.ruta || '').trim();
                    if (sr) salesSet.add(sr);
                });
                console.log(`[RouteRepo] zonas_rutas sales routes: ${zonasRutasResult.value.data.length}`);
            } else {
                console.warn('[RouteRepo] zonas_rutas query failed:', zonasRutasResult.reason || zonasRutasResult.value?.error);
            }
            // supervisor_allowed_routes.route → conquest/internal route catalog
            if (conquestResult.status === 'fulfilled' && conquestResult.value?.data) {
                conquestResult.value.data.forEach(r => {
                    const ir = String(r.route || '').trim();
                    if (ir) internalSet.add(ir);
                });
                console.log(`[RouteRepo] supervisor_allowed_routes internal routes: ${conquestResult.value.data.length}`);
            } else {
                console.warn('[RouteRepo] supervisor_allowed_routes query failed:', conquestResult.reason || conquestResult.value?.error);
            }
        }
    } catch (e) {
        console.warn('[RouteRepo] Supabase route fetch failed:', e);
    }


    // 3. LocalDB (SQLite on native — offline fallback)
    try {
        const { getDb, isMockDb } = await import('@/lib/localDb');
        const db = await getDb();

        if (!isMockDb()) {
            const [resInternal, resSales] = await Promise.all([
                db.query('SELECT DISTINCT internal_route FROM clients WHERE internal_route IS NOT NULL AND internal_route != "" ORDER BY internal_route'),
                db.query('SELECT DISTINCT sales_route FROM clients WHERE sales_route IS NOT NULL AND sales_route != "" ORDER BY sales_route')
            ]);

            (resSales.values || []).forEach(r => {
                const sr = String(r.sales_route || r.SALES_ROUTE || r.Sales_Route || '').trim();
                if (sr) salesSet.add(sr);
            });
            (resInternal.values || []).forEach(r => {
                const ir = String(r.internal_route || r.INTERNAL_ROUTE || r.Internal_Route || '').trim();
                if (ir) internalSet.add(ir);
            });
        }
    } catch (e) {
        console.warn('[RouteRepo] LocalDB route fetch failed:', e);
    }

    const salesList = Array.from(salesSet).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    const internalList = Array.from(internalSet).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));

    console.log(`[RouteRepo] Final merged routes: ${salesList.length} sales, ${internalList.length} internal`);

    return {
        sales: salesList,
        internal: internalList
    };
}
