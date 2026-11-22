import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { resilientFetch } from './network';

// En APK (Nativo) usamos la URL completa porque no hay proxy Vite.
// En Web usamos /api para aprovechar el proxy (dev) o rutas relativas (prod).
const API_BASE = Capacitor.isNativePlatform() ? 'https://cervezasfinas.com/api' : '/api';

/**
 * Reads clients from MySQL via PHP.
 * Optional parameters:
 *  - limit (default 1000)
 *  - offset (default 0)
 *  - sales_route: filter by route
 *  - updated_after: filter by updated_at date (ISO string)
 */
export async function fetchClientsApi({ limit = 500, offset = 0, sales_route, internal_route, sales_routes, internal_routes, client_code, client_codes, owner_id, search, zona, zonas, updated_after, created_after, id, ids } = {}) {
    const params = new URLSearchParams();
    params.append("limit", limit);
    params.append("offset", offset);

    if (sales_route && sales_route !== "__ALL__") params.append("sales_route", sales_route);
    if (sales_routes && Array.isArray(sales_routes) && sales_routes.length) params.append("sales_routes", sales_routes.join(','));
    if (internal_route) params.append("internal_route", internal_route);
    if (internal_routes && Array.isArray(internal_routes) && internal_routes.length) params.append("internal_routes", internal_routes.join(','));
    if (ids && Array.isArray(ids) && ids.length) params.append("ids", ids.join(','));
    if (client_code) params.append("client_code", client_code);
    if (client_codes && Array.isArray(client_codes) && client_codes.length) params.append("client_codes", client_codes.join(','));
    if (owner_id) params.append("owner_id", owner_id);
    if (search) params.append("search", search);
    if (zona) params.append("zona", zona);
    if (zonas && Array.isArray(zonas) && zonas.length) params.append("zonas", zonas.join(','));
    if (updated_after) params.append("updated_after", updated_after);
    if (created_after) params.append("created_after", created_after);
    if (id) params.append("id", id);

    // Bust cache
    const timestamp = new Date().getTime();
    params.append("_t", timestamp);

    const url = `${API_BASE}/clients-read.php`;
    const queryString = params.toString();
    const fullUrl = `${url}?${queryString}`;

    console.log(`[clientsRepository] Fetching from: ${fullUrl}`);

    try {
        let rows = [];
        let count = 0;

        if (Capacitor.isNativePlatform()) {
            // Use Native HTTP to bypass CORS on Android/iOS
            const options = {
                url: fullUrl,
                headers: { 'Content-Type': 'application/json' }
            };
            const response = await CapacitorHttp.get(options);

            if (response.status !== 200) {
                throw new Error(`clients-read Native HTTP ${response.status}: ${JSON.stringify(response.data)}`);
            }

            // CapacitorHttp returns parsed JSON in 'data' if content-type is json
            const json = response.data;
            rows = Array.isArray(json.rows) ? json.rows : [];
            count = json.count || 0;

            if (rows.length === 0) {
                console.warn(`[mysqlClients] WARNING: 0 rows returned.`);
                console.warn(`[mysqlClients] Request URL: ${fullUrl}`);
                console.warn(`[mysqlClients] Params: ${queryString}`);
            } else {
                console.log(`[mysqlClients] Native HTTP response rows: ${rows.length}`);
            }
        } else {
            // Web Fetch - uses resilience helper
            const res = await resilientFetch(fullUrl, { method: "GET" });
            const json = await res.json();
            rows = Array.isArray(json.rows) ? json.rows : [];
            count = json.count || 0;
            console.log(`[mysqlClients] Web HTTP response rows: ${rows.length}`);
        }

        return { rows, count };

    } catch (error) {
        console.error('[clientsRepository] API Error:', error);
        throw error;
    }
}

/**
 * Upserts clients list via PHP import
 */
export async function importClientsApi(clientsArray) {
    console.log('[mysqlClients] 📤 importClientsApi llamado con', clientsArray.length, 'clientes');
    console.log('[mysqlClients] 📋 Primer cliente:', clientsArray[0]);

    if (!clientsArray || !clientsArray.length) return { inserted: 0, errors: [] };

    const url = `${API_BASE}/clients-import.php`;
    console.log('[mysqlClients] 🌐 URL:', url);

    try {
        if (Capacitor.isNativePlatform()) {
            const options = {
                url: url,
                headers: { "Content-Type": "application/json" },
                data: { clients: clientsArray }
            };
            const response = await CapacitorHttp.post(options);

            if (response.status !== 200) {
                throw new Error(`clients-import Native HTTP ${response.status}: ${JSON.stringify(response.data)}`);
            }
            console.log('[mysqlClients] ✅ Native response:', response.data);
            return response.data;
        } else {
            console.log('[mysqlClients] 🌐 Web fetch to:', url);
            const res = await resilientFetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clients: clientsArray })
            });

            console.log('[mysqlClients] 📡 Response status:', res.status);

            if (!res.ok) {
                const text = await res.text().catch(() => "");
                console.error('[mysqlClients] ❌ Error response:', text);
                throw new Error(`clients-import HTTP ${res.status}: ${text}`);
            }
            const result = await res.json();
            console.log('[mysqlClients] ✅ Import result:', result);
            return result;
        }
    } catch (error) {
        console.error("[mysqlClients] ❌ Error importing clients:", error);
        throw error;
    }
}

/**
 * Deletes a client via PHP API
 */
export async function deleteClientApi(id) {
    if (!id) return false;
    const url = `${API_BASE}/clients-delete.php`;
    console.log('[mysqlClients] 🗑️ Deleting client via API:', url, id);

    try {
        if (Capacitor.isNativePlatform()) {
            const options = {
                url: url,
                headers: { "Content-Type": "application/json" },
                data: { id }
            };
            const response = await CapacitorHttp.post(options);
            if (response.status !== 200) throw new Error(`Native HTTP ${response.status}`);
            return response.data;
        } else {
            const res = await resilientFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        }
    } catch (error) {
        console.warn(`[mysqlClients] Delete API failed (maybe endpoint doesn't exist?):`, error);
        // Fallback: Try Soft Delete via Import
        return await importClientsApi([{ id, is_active: 0, activo: 0, status: 'deleted' }]);
    }
}
