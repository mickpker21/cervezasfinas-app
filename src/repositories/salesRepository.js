import { isOnline, withTimeout } from '@/lib/network';
import { getDb, isMockDb } from '@/lib/localDb';
import { fetchVentasPorSku as fetchFromApi } from '@/lib/mysqlVentasPorSku';
import { supabase } from '@/supabaseClient';
import { getClientsByIds } from '@/repositories/clientsRepository';

/**
 * Obtiene el historial de ventas por SKU.
 * - ONLINE: Descarga de la API MySQL y guarda en local.
 * - OFFLINE: Lee de la base de datos local SQLite.
 */
export async function getSalesBySku(params) {
    let online = false;
    try {
        online = await isOnline();
    } catch (e) {
        online = false;
    }

    if (online) {
        try {
            const [apiData, supabaseData] = await Promise.all([
                withTimeout(fetchFromApi(params), 65000).catch(e => { console.warn('[salesRepository] API error', e); return []; }),
                fetchSupabaseDeliveredSales(params).catch(e => { console.warn('[salesRepository] Supabase error', e); return []; })
            ]);
            const combinedData = [...(apiData || []), ...(supabaseData || [])];
            console.log(`[salesRepository] Fetched ${apiData?.length || 0} API + ${supabaseData?.length || 0} Supabase sales.`);
            await saveSalesToLocal(combinedData);
            return combinedData;
        } catch (error) {
            console.warn('[salesRepository] Error fetching online, falling back to local:', error);
            return await loadLocalSales(params);
        }
    } else {
        return await loadLocalSales(params);
    }
}

/**
 * Carga ventas desde SQLite filtrando por fecha (aproximado).
 * Nota: SQLite no tiene todos los filtros complejos de la API, 
 * pero soportaremos el rango de fechas que es lo más importante.
 */
async function loadLocalSales(params = {}) {
    try {
        const { from, to, nextFrom, zona, salesRoute, sales_routes, cve_cliente } = params;
        const db = await getDb();

        // Normalizar fechas
        const start = from;
        const end = nextFrom ? nextFrom : (to || '9999-12-31');
        const isNextFrom = !!nextFrom;

        const effectiveRoutes = (Array.isArray(sales_routes) && sales_routes.length > 0)
            ? sales_routes
            : (salesRoute && salesRoute !== '__ALL__' ? [salesRoute] : []);

        if (isMockDb()) {
            const all = db._storage.get('ventas_por_sku') || [];
            const filtered = all.filter(r => {
                // Normalización de campo de fecha para el filtro
                const rFecha = r.fecha || r.period_date || '';
                
                if (rFecha < start) return false;
                if (isNextFrom) {
                    if (rFecha >= end) return false;
                } else {
                    if (rFecha > end) return false;
                }
                
                if (zona && zona !== '__ALL__' && r.zona !== zona) return false;

                if (effectiveRoutes.length > 0) {
                    const rRoute = String(r.ruta || '');
                    const rDigits = rRoute.replace(/[^0-9]/g, '');
                    const matched = effectiveRoutes.some(reqRoute => {
                        const qRoute = String(reqRoute);
                        const qDigits = qRoute.replace(/[^0-9]/g, '');
                        return rRoute === qRoute ||
                               rRoute.includes(qRoute) ||
                               qRoute.includes(rRoute) ||
                               (qDigits.length > 0 && rDigits === qDigits);
                    });
                    if (!matched) return false;
                }
                return true;
            });
            // Aggregate (same as MySQL GROUP BY) to avoid double-counting
            return aggregateRows(filtered);
        }

        // SQLite Query - Usamos date() para asegurar comparación de fecha pura (sin hora)
        let query = `SELECT * FROM ventas_por_sku WHERE date(fecha) >= date(?)`;
        const queryParams = [start];

        if (isNextFrom) {
            query += ` AND date(fecha) < date(?)`;
            queryParams.push(end);
        } else {
            query += ` AND date(fecha) <= date(?)`;
            queryParams.push(end);
        }

        if (zona && zona !== '__ALL__') {
            query += ` AND zona = ?`;
            queryParams.push(zona);
        }

        if (cve_cliente) {
            query += ` AND cve_cliente = ?`;
            queryParams.push(cve_cliente);
        }

        // Filtrar por ruta(s) con normalización flexible
        if (effectiveRoutes.length > 0) {
            const routeClauses = [];
            for (const r of effectiveRoutes) {
                const cleanDigits = String(r).replace(/[^0-9a-zA-Z]/g, '');
                routeClauses.push(`(ruta = ? OR ruta LIKE ? OR ? LIKE '%' || ruta || '%')`);
                queryParams.push(r, `%${r}%`, r);
                if (cleanDigits.length > 0) {
                    routeClauses.push(`replace(ruta, ' ', '') LIKE ?`);
                    queryParams.push(`%${cleanDigits}%`);
                }
            }
            query += ` AND (${routeClauses.join(' OR ')})`;
        }

        const res = await db.query(query, queryParams);
        const rows = res.values || [];

        // ─────────────────────────────────────────────────────────────────────
        // AGGREGATE to match PHP API behavior:
        // The PHP API returns 1 row per (cve_cliente, cve_marca, fecha) with
        // htls_total already summed. SQLite can hold multiple rows for the
        // same key if the sync ran several times (different remision/venta IDs),
        // causing inflated totals offline. We re-aggregate here to normalize.
        // ─────────────────────────────────────────────────────────────────────
        const aggregated = aggregateRows(rows);

        // Normalizar para que coincida con la API (period_date/fecha_alta)
        return aggregated.map(r => ({
            ...r,
            period_date: r.fecha, // API usa period_date
            fecha_alta: r.fecha,  // Algunas pantallas usan fecha_alta
            sales_route: r.ruta   // API usa sales_route (a veces) o ruta
        }));
    } catch (e) {
        console.error('[salesRepository] Error loading local sales:', e);
        return [];
    }
}

/**
 * Agrupa filas por (cve_cliente, cve_marca, fecha, zona, ruta) sumando htls_total.
 * Esto replica el GROUP BY que hace el backend PHP para evitar doble conteo
 * cuando la tabla local tiene múltiples registros por el mismo período.
 */
function aggregateRows(rows) {
    const map = new Map();
    for (const r of rows) {
        // Normalize route to digits-only for key comparison.
        // 'RUTA 101', 'Ruta101', '101' must all group together.
        const rutaStr = String(r.ruta || '');
        const rutaNorm = rutaStr.replace(/[^0-9]/g, '') || rutaStr.trim().toUpperCase();
        // Key: campos de negocio únicos, con ruta normalizada
        const key = `${r.cve_cliente}|${r.cve_marca}|${r.fecha}|${r.zona || ''}|${rutaNorm}`;
        if (map.has(key)) {
            map.get(key).htls_total += Number(r.htls_total) || 0;
        } else {
            map.set(key, { ...r, htls_total: Number(r.htls_total) || 0 });
        }
    }
    return Array.from(map.values());
}



/**
 * Guarda (o reemplaza) registros de ventas en local.
 * Estrategia: INSERT OR REPLACE basado en ID.
 * Como la API original no devuelve ID único persistente, generaremos uno compuesto:
 * ID = cve_cliente + "_" + cve_marca + "_" + fecha
 */
async function saveSalesToLocal(rows) {
    if (!rows || rows.length === 0) return;

    try {
        const db = await getDb();
        const now = new Date().toISOString();

        // ✓ PRE-AGGREGATION: Sumar htls_total para filas que comparten el mismo ID
        // Esto evita que el INSERT OR REPLACE borre datos al encontrar colisiones
        const aggregatedMap = new Map();
        for (const r of rows) {
            const id = generateId(r);
            if (aggregatedMap.has(id)) {
                const existing = aggregatedMap.get(id);
                existing.htls_total = (Number(existing.htls_total) || 0) + (Number(r.htls_total) || 0);
                // Sumar también unidades y venta (dinero)
                existing.unidades = (Number(existing.unidades) || 0) + (Number(r.unidades) || 0);
                existing.venta = (Number(existing.venta) || 0) + (Number(r.venta) || 0);
                if (r.htls) existing.htls = (Number(existing.htls) || 0) + (Number(r.htls) || 0);
            } else {
                aggregatedMap.set(id, { ...r, id });
            }
        }

        const preAggregatedRows = Array.from(aggregatedMap.values());

        if (isMockDb()) {
            const current = db._storage.get('ventas_por_sku') || [];
            const map = new Map(current.map(r => [r.id, r]));

            for (const r of preAggregatedRows) {
                const id = r.id;
                // Al guardar en el Mock, nos aseguramos de que tenga el campo 'fecha'
                map.set(id, { ...r, id, fecha: r.period_date || r.fecha, created_at: now });
            }
            db._storage.set('ventas_por_sku', Array.from(map.values()));
            return;
        }

        // SQLite Batch
        const statements = preAggregatedRows.map(r => {
            const id = r.id;
            const rutaRaw = (r.ruta || r.sales_route || '').toString().trim().toUpperCase();

            return [
                id,
                r.cve_cliente,
                r.cve_marca,
                r.htls_total,
                r.period_date || r.fecha,
                r.zona,
                rutaRaw,
                r.num_remision || '',
                Number(r.unidades) || 0,
                Number(r.precio_venta_marca) || 0,
                Number(r.venta) || 0,
                now
            ];
        });

        // Insertar en lotes
        // 50 items * 12 columns = 600 parameters (Safe vs 999 limit)
        const BATCH_SIZE = 50;
        let totalInserted = 0;
        for (let i = 0; i < statements.length; i += BATCH_SIZE) {
            const chunk = statements.slice(i, i + BATCH_SIZE);
            const placeholders = chunk.map(() => `(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).join(',');
            const values = chunk.flat();

            await db.run(`
        INSERT OR REPLACE INTO ventas_por_sku (
          id, cve_cliente, cve_marca, htls_total, fecha, zona, ruta, 
          num_remision, unidades, precio_venta_marca, venta, created_at
        ) VALUES ${placeholders}
      `, values);
            totalInserted += chunk.length;
        }

        console.log(`[salesRepository] SUCCESS: ${totalInserted} sales saved to SQLite.`);

    } catch (e) {
        console.error('[salesRepository] Error saving to local:', e);
    }
}

function generateId(row) {
    // Si la fila ya trae un ID único del servidor (MySQL), lo usamos directamente.
    if (row.id) return String(row.id);

    const fecha = row.period_date || row.fecha || 'unknown';
    const cliente = row.cve_cliente || row.client_code || 'unknown';
    const marca = row.cve_marca || row.sku || 'unknown';
    const zona = (row.zona || 'nozone').toString().trim().toUpperCase();

    // CRITICAL: Normalize route to digits-only so that 'RUTA 101', 'Ruta101', '101'
    // all produce the same ID — preventing duplicate rows from INSERT OR REPLACE.
    const rawRuta = (row.ruta || row.sales_route || '').toString().trim();
    const rutaNorm = rawRuta.replace(/[^0-9]/g, '') || rawRuta.toUpperCase() || 'noroute';

    // Remisión y clave de venta (si existen en transacciones individuales)
    const remision = row.num_remision || 'norem';
    const cveVenta = row.cve_venta || 'novta';

    const clean = (s) => String(s).replace(/[^a-zA-Z0-9]/g, '');

    return `${clean(cliente)}_${clean(marca)}_${clean(fecha)}_${clean(rutaNorm)}_${clean(zona)}_${clean(remision)}_${clean(cveVenta)}`;
}

/**
 * Sincroniza las ventas iterando por ruta para evitar saturar la memoria/red.
 * @param {Array} routes - Lista de rutas permitidas
 * @param {Object} dateParams - { from, to }
 */
export async function syncSalesForRoutes(routes, dateParams) {
    const online = await isOnline().catch(() => false);
    if (!online) return { count: 0, offline: true };

    const db = await getDb();
    
    // ✓ MIGRACIÓN DE DATOS (NUEVA LÓGICA DE IDs EN APK)
    // Para evitar duplicados de ventas antiguas con el ID corto vs las nuevas con ID largo/remisión,
    // limpiamos la tabla local solo la primera vez que sincronizamos con esta versión.
    try {
        const check = await db.query("SELECT value FROM kv_store WHERE key = 'sales_v2_migrated'");
        if (!check.values || check.values.length === 0) {
            // Keep the existing offline sales cache. The version marker is only
            // bookkeeping; clearing this table made historical data disappear
            // until the next successful download.
            console.log("[salesRepository] Marking sales cache migration without deleting offline records.");
            await db.run("INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)", 
                ['sales_v2_migrated', 'true', new Date().toISOString()]);
        }
    } catch (e) {
        console.warn("[salesRepository] Migración sales_v2_migrated falló (posible tabla inexistente):", e);
    }

    console.log(`[salesRepository] Syncing Sales for ${routes.length} routes...`);
    let totalSaved = 0;
    // ... REST OF THE FUNCTION

    for (let i = 0; i < routes.length; i++) {
        const route = routes[i];

        // Anti-freeze throttle
        if (i > 0) await new Promise(r => setTimeout(r, 150));

        try {
            console.log(`[salesRepository] Fetching sales for route ${route}...`);
            // Pass the route to the API call. 
            // Note: fetchVentasPorSku needs to receive the route.
            const params = { ...dateParams, salesRoute: route };

            // We use the raw API fetcher here to bypass "getSalesBySku" logic which might try to load local if offline
            // But verify: does getSalesBySku save? Yes.
            // But we want to ensure we don't return big arrays.
            // Let's use getSalesBySku but ignoring the return value to save RAM.
            // AND we need to ensure getSalesBySku actually uses the route param we pass.
            // Looking at getSalesBySku, it passes params to fetchFromApi.

            const [sales, supabaseSales] = await Promise.all([
                fetchFromApi(params).catch(() => []),
                fetchSupabaseDeliveredSales(params).catch(() => [])
            ]);
            
            const combined = [...(sales || []), ...(supabaseSales || [])];
            if (combined.length > 0) {
                await saveSalesToLocal(combined);
                totalSaved += combined.length;
            }
        } catch (e) {
            console.error(`[salesRepository] Error syncing sales for route ${route}:`, e);
        }
    }

    console.log(`[salesRepository] Sales Sync Complete. Total: ${totalSaved}`);
    return { count: totalSaved };
}

async function fetchSupabaseDeliveredSales(params) {
    const { from, to, nextFrom, zona, salesRoute } = params;
    const isDay = (from === to) && !!from && !nextFrom;

    // Día único → rango completo del día local (00:00:00 a 23:59:59)
    // Mes/Año  → rango por nextFrom igual que antes
    let startTs, endTs, useLt;
    if (isDay) {
        startTs = `${from}T00:00:00`;
        endTs   = `${from}T23:59:59`;
        useLt   = false; // lte
    } else {
        startTs = from;
        endTs   = nextFrom ? nextFrom : (to ? `${to}T23:59:59` : '9999-12-31');
        useLt   = !!nextFrom;
    }
    const isNextFrom = !!nextFrom && !isDay;

    try {
        // 1. Fetch Prices for HTL conversion (Fallback for when column does not exist)
        const { data: precios, error: preciosErr } = await supabase.from('precios').select('cve_marca');
        if (preciosErr) console.warn('[salesRepository] Tabla precios no disponible.', preciosErr.message);
        const htlMap = {};
        if (precios) {
            precios.forEach(p => htlMap[p.cve_marca] = 0);
        }

        // 2. Fetch Delivered Preventas
        // NOTE: 'preventa' table does not have a 'status' column — we fetch all in the date range
        let queryPrev = supabase
            .from('preventa')
            .select(`
                id, 
                created_at, 
                client_id,
                preventa_items(cve_marca, quantity, unit_price)
            `)
            .gte('created_at', startTs);

        if (isNextFrom) {
            queryPrev = queryPrev.lt('created_at', endTs);
        } else {
            queryPrev = queryPrev.lte('created_at', endTs);
        }

        const { data: preventas, error: prevErr } = await queryPrev;
        if (prevErr) {
            console.warn('[salesRepository] Error fetching preventas (skipping):', prevErr.message);
        }

        // 3. Fetch Direct Sales (Autoventa)
        let queryDirect = supabase
            .from('direct_sales')
            .select(`
                id,
                created_at,
                client_id,
                direct_sales_items(cve_marca, quantity, unit_price)
            `)
            .gte('created_at', startTs);

        if (isNextFrom) {
            queryDirect = queryDirect.lt('created_at', endTs);
        } else {
            queryDirect = queryDirect.lte('created_at', endTs);
        }

        // if (zona && zona !== '__ALL__') {
        //    queryDirect = queryDirect.eq('clients.branch_id', zona);
        // }

        const { data: directSales, error: dirErr } = await queryDirect;
        if (dirErr) console.error("Error fetching direct_sales:", dirErr);

        // Fetch clients locally to replace the join
        const uniqueClientIds = new Set();
        (preventas || []).forEach(p => p.client_id && uniqueClientIds.add(p.client_id));
        (directSales || []).forEach(d => d.client_id && uniqueClientIds.add(d.client_id));

        const clientMap = {};
        if (uniqueClientIds.size > 0) {
            // chunk if more than 100
            const idArray = Array.from(uniqueClientIds);
            for (let i = 0; i < idArray.length; i += 100) {
                const chunk = idArray.slice(i, i + 100);
                try {
                    // Reuse the offline-first client repository. It reads from
                    // SQLite when the device has no internet and uses the
                    // native HTTP client on APK, avoiding WebView CORS errors.
                    const clients = await getClientsByIds(chunk);
                    clients.forEach(c => { clientMap[c.id] = c; });
                } catch (e) {
                    console.error("Error resolving sales clients:", e);
                }
            }
        }

        // 4. Combine and Transform
        let combined = [];

        const processOrder = (order, isPreventa) => {
            const client = clientMap[order.client_id];
            if (!client) return;

            // Manual zona filter since we removed it from the query
            if (zona && zona !== '__ALL__' && client.branch_id !== zona) return;
            
            // Filter by salesRoute if needed
            if (salesRoute && salesRoute !== '__ALL__') {
                const rRoute = String(client.sales_route || '').replace(/[^0-9]/g, '');
                const qRoute = String(salesRoute).replace(/[^0-9]/g, '');
                if (rRoute !== qRoute) return;
            }

            const items = isPreventa ? order.preventa_items : order.direct_sales_items;
            if (!items) return;

            items.forEach(item => {
                const qty = Number(item.quantity) || 0;
                const price = Number(item.unit_price) || 0;
                const sku = item.cve_marca;
                const htlsFactor = htlMap[sku] || 0; // Default 0 if unknown
                const htlsTotal = qty * htlsFactor;

                combined.push({
                    cve_cliente: client.client_code,
                    cve_marca: sku,
                    htls_total: htlsTotal,
                    period_date: order.created_at.split('T')[0],
                    fecha: order.created_at.split('T')[0],
                    zona: client.branch_id,
                    ruta: client.sales_route,
                    num_remision: `${isPreventa ? 'PREV' : 'AUTO'}-${order.id.slice(0,8)}`,
                    unidades: qty,
                    precio_venta_marca: price,
                    venta: qty * price
                });
            });
        };

        (preventas || []).forEach(o => processOrder(o, true));
        (directSales || []).forEach(o => processOrder(o, false));

        return combined;
    } catch (err) {
        console.error("Error in fetchSupabaseDeliveredSales:", err);
        return [];
    }
}
