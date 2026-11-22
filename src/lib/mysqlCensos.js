import { Capacitor } from '@capacitor/core';

const API_BASE = Capacitor.isNativePlatform()
    ? "https://cervezasfinas.com/api"
    : "/api";

/**
 * Imports Censos Supervisor to MySQL.
 */
export async function importCensosApi(censosArray) {
    if (!censosArray?.length) return { processed: 0, errors: [] };

    const url = `${API_BASE}/censos-import.php`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ censos: censosArray })
    });

    if (!res.ok) throw new Error(`censos-import HTTP ${res.status}`);
    return await res.json();
}

/**
 * Reads Censos Supervisor from MySQL.
 * @param {Object} params - { supervisor_id, from, to, client_code, limit, offset }
 */
export async function fetchCensosApi(params = {}) {
    const q = new URLSearchParams(params).toString();
    const url = `${API_BASE}/censos-read.php?${q}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`censos-read HTTP ${res.status}`);
    const json = await res.json();
    return Array.isArray(json) ? json : (json.rows || []);
}
