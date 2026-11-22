import { Capacitor } from '@capacitor/core';

// En APK (Nativo) usamos la URL completa
// En Web usamos /api para proxy o ruta relativa
const API_BASE = Capacitor.isNativePlatform()
    ? "https://cervezasfinas.com/api"
    : "/api";

/**
 * Sube (inserta) ventas directas a MySQL
 * @param {Array} salesArray - Array de objetos sale con sus items
 * Estructura esperada:
 * {
 *   sale: { ...header fields... },
 *   items: [ { ...item fields... }, ... ]
 * }
 */
export async function importSalesApi(salesArray) {
    if (!salesArray || !salesArray.length) return { inserted: 0, errors: [] };

    const url = `${API_BASE}/sales-import.php`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales: salesArray })
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`sales-import HTTP ${res.status}: ${text}`);
    }
    return await res.json();
}
