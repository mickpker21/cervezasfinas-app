import { Capacitor, CapacitorHttp } from '@capacitor/core';

// APK uses absolute URL, Web uses proxy
const API_BASE = Capacitor.isNativePlatform()
    ? "https://cervezasfinas.com/api"
    : "/api";

/**
 * Reads visits from MySQL.
 */
export async function fetchVisitsApi({ route, start_date, end_date, client_id, client_code, limit }) {
    const params = new URLSearchParams();
    if (route) params.append('route', route);
    if (start_date) params.append('start_date', start_date);
    if (end_date) params.append('end_date', end_date);
    if (client_id) params.append('client_id', client_id);
    if (client_code) params.append('client_code', client_code);
    if (limit) params.append('limit', limit);

    // Cache bust
    params.append('_t', new Date().getTime());

    const url = `${API_BASE}/visitas-read.php?${params.toString()}`;
    if (Capacitor.isNativePlatform()) {
        const response = await CapacitorHttp.get({
            url,
            headers: { Accept: 'application/json' },
            connectTimeout: 5000,
            readTimeout: 10000,
        });
        if (response.status < 200 || response.status >= 300) {
            throw new Error(`visitas-read HTTP ${response.status}`);
        }
        return response.data?.rows || [];
    }

    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error(`visitas-read HTTP ${res.status}`);
    const json = await res.json();
    return json.rows || [];
}

/**
 * Imports visits to MySQL (Upsert).
 * @param {Array} visitsArray
 */
export async function importVisitsApi(visitsArray) {
    if (!visitsArray?.length) return { processed: 0, errors: [] };

    const url = `${API_BASE}/visitas-import.php`;
    if (Capacitor.isNativePlatform()) {
        const response = await CapacitorHttp.post({
            url,
            headers: { 'Content-Type': 'application/json' },
            data: { visitas: visitsArray },
            connectTimeout: 5000,
            readTimeout: 15000,
        });
        if (response.status < 200 || response.status >= 300) {
            throw new Error(`visitas-import HTTP ${response.status}`);
        }
        return response.data;
    }

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitas: visitsArray })
    });

    if (!res.ok) {
        throw new Error(`visitas-import HTTP ${res.status}`);
    }
    return await res.json();
}
