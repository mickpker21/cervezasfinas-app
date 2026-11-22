import { getDb, isMockDb } from '@/lib/localDb';
import { isOnline } from '@/lib/network';
import { supabase } from '@/supabaseClient';
import { Capacitor } from '@capacitor/core';

/**
 * Repositorio para datos de "Solo Lectura" / Metadatos que se descargan al inicio
 * y raramente cambian (o no se editan desde la app).
 */

const API_BASE = "/api";

// Helper to fetch products from API (Shop List)
async function fetchProductsMetadata() {
    try {
        const timestamp = new Date().getTime();
        const res = await fetch(`${API_BASE}/products/list.php?limit=1000&_t=${timestamp}`);
        if (!res.ok) return [];
        const json = await res.json();
        return Array.isArray(json.data) ? json.data : [];
    } catch (e) {
        console.warn("Error fetching metadata from API", e);
        return [];
    }
}

// --- SKU Descriptions ---
export async function getSkuDescriptions() {
    try {
        const db = await getDb();
        if (isMockDb()) {
            const all = db._storage.get('sku_descripcion') || [];
            if (all.length > 0) return all;
        } else {
            const res = await db.query('SELECT * FROM sku_descripcion');
            if (res.values && res.values.length > 0) return res.values;
        }

        // Fallback 1: Supabase 'sku_descripcion' (Source of Truth for App Text)
        try {
            const { data, error } = await supabase.from('sku_descripcion').select('cve_marca, descripcion, marca');
            if (data && data.length > 0) {
                await saveSkuDescriptionsToLocal(data);
                return data;
            }
        } catch (errSupa) {
            console.warn("Supabase fetch failed for descriptions", errSupa);
        }

        // Fallback 2: Fetch from API (Shop)
        try {
            const products = await fetchProductsMetadata();
            const rows = products.map(p => ({
                cve_marca: p.sku,
                descripcion: p.name // Shop 'name' is the description
            }));
            if (rows.length > 0) {
                await saveSkuDescriptionsToLocal(rows); // Save for next time
                return rows;
            }
        } catch (e) {
            console.warn("API fallback failed for descriptions", e);
        }
        return [];
    } catch (e) {
        console.error('[metadataRepository] Error loading sku_descripcion:', e);
        return [];
    }
}

export async function saveSkuDescriptionsToLocal(rows) {
    if (!rows || !rows.length) return;
    try {
        const db = await getDb();
        if (isMockDb()) {
            db._storage.set('sku_descripcion', rows);
            return;
        }
        await db.run('DELETE FROM sku_descripcion');
        const BATCH_SIZE = 100;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const chunk = rows.slice(i, i + BATCH_SIZE);
            const placeholders = chunk.map(() => '(?, ?, ?)').join(',');
            const values = chunk.flatMap(r => [r.cve_marca, r.descripcion || null, r.marca || null]);
            await db.run(`INSERT INTO sku_descripcion (cve_marca, descripcion, marca) VALUES ${placeholders}`, values);
        }
    } catch (e) { console.error(e); }
}

// --- SKU Brand Map (cve_marca -> marca) para Scorecard offline ---
export async function getSkuBrandMap(cveMaras = []) {
    const result = new Map();
    try {
        const db = await getDb();
        // 1. Leer de SQLite local primero
        if (!isMockDb()) {
            let rows = [];
            if (cveMaras.length > 0) {
                const placeholders = cveMaras.map(() => '?').join(',');
                const res = await db.query(
                    `SELECT cve_marca, marca FROM sku_descripcion WHERE cve_marca IN (${placeholders})`,
                    cveMaras
                ).catch(() => ({ values: [] }));
                rows = res.values || [];
            } else {
                const res = await db.query('SELECT cve_marca, marca FROM sku_descripcion').catch(() => ({ values: [] }));
                rows = res.values || [];
            }
            for (const r of rows) {
                if (r.cve_marca && r.marca) result.set(r.cve_marca.toUpperCase(), r.marca);
            }
            if (result.size > 0) return result;
        } else {
            const all = db._storage.get('sku_descripcion') || [];
            for (const r of all) {
                if (r.cve_marca && r.marca) result.set(r.cve_marca.toUpperCase(), r.marca);
            }
            if (result.size > 0) return result;
        }

        // 2. Fallback Supabase si local vacío
        const query = supabase.from('sku_descripcion').select('cve_marca, marca');
        if (cveMaras.length > 0) query.in('cve_marca', cveMaras);
        const { data } = await query.limit(50000);
        for (const r of (data || [])) {
            if (r.cve_marca && r.marca) result.set(r.cve_marca.toUpperCase(), r.marca);
        }
        return result;
    } catch (e) {
        console.error('[metadataRepository] Error in getSkuBrandMap:', e);
        return result;
    }
}

// --- SKU Images ---
// --- SKU Images ---
import { getProductImageUrl } from '@/lib/imageCatalog';


export async function getSkuImages() {
    // Return generated URLs for all known products (from basic metadata fetch)
    // We don't need to query sku_images table anymore.
    try {
        const products = await fetchProductsMetadata();
        if (!products || products.length === 0) return [];

        return products.map(p => {
            const safeSku = (p.sku || '').trim();
            return {
                sku: safeSku,
                image_url: getProductImageUrl(safeSku)
            };
        });
    } catch (e) {
        console.warn("Error generating sku images", e);
        return [];
    }
}

export async function saveSkuImagesToLocal(rows) {
    if (!rows || !rows.length) return;
    try {
        const db = await getDb();
        if (isMockDb()) {
            db._storage.set('sku_images', rows);
            return;
        }
        await db.run('DELETE FROM sku_images');
        const BATCH_SIZE = 100;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const chunk = rows.slice(i, i + BATCH_SIZE);
            const placeholders = chunk.map(() => '(?, ?)').join(',');
            const values = chunk.flatMap(r => [r.sku, r.image_url]);
            await db.run(`INSERT INTO sku_images (sku, image_url) VALUES ${placeholders}`, values);
        }
    } catch (e) { console.error(e); }
}

// --- Canales ---
export async function getChannels(forceRefresh = false) {
    try {
        const db = await getDb();
        const online = await isOnline();

        // Si no forzamos refresco y estamos offline, devolver local inmediatamente
        if (!forceRefresh && !online) {
            if (isMockDb()) {
                return db._storage.get('Canal') || [];
            } else {
                const res = await db.query('SELECT * FROM Canal');
                return res.values || [];
            }
        }

        // Si estamos online o forzamos refresco, intentar traer de Supabase
        try {
            let allData = [];
            let idx = 0;
            const PAGE = 1000;
            while (true) {
                const { data, error } = await supabase.from('Canal').select('cve_cliente, canal').range(idx, idx + PAGE - 1);
                if (error) throw error;
                if (!data || data.length === 0) break;
                allData = allData.concat(data);
                if (data.length < PAGE) break;
                idx += PAGE;
            }
            if (allData.length > 0) {
                await saveChannelsToLocal(allData);
                return allData;
            }
        } catch (err) {
            console.warn("Error fetching channels from Supabase, falling back to local", err);
        }

        // Fallback final a local
        if (isMockDb()) {
            return db._storage.get('Canal') || [];
        } else {
            const res = await db.query('SELECT * FROM Canal');
            return res.values || [];
        }
    } catch (e) {
        console.error('[metadataRepository] Error in getChannels:', e);
        return [];
    }
}

export async function saveChannelsToLocal(rows) {
    if (!rows || !rows.length) return;
    try {
        const db = await getDb();
        if (isMockDb()) {
            db._storage.set('Canal', rows);
            return;
        }
        await db.run('DELETE FROM Canal');
        const BATCH_SIZE = 100;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const chunk = rows.slice(i, i + BATCH_SIZE);
            const placeholders = chunk.map(() => '(?, ?)').join(',');
            const values = chunk.flatMap(r => [r.cve_cliente, r.canal]);
            await db.run(`INSERT INTO Canal (cve_cliente, canal) VALUES ${placeholders}`, values);
        }
    } catch (e) {
        console.error('[metadataRepository] Error saving channels:', e);
    }
}

export async function updateChannel(clientCode, newChannel) {
    if (!clientCode) return;
    try {
        const db = await getDb();
        if (isMockDb()) {
            const all = db._storage.get('Canal') || [];
            const idx = all.findIndex(r => r.cve_cliente === clientCode);
            if (idx >= 0) {
                all[idx].canal = newChannel;
            } else {
                all.push({ cve_cliente: clientCode, canal: newChannel });
            }
            db._storage.set('Canal', all);
        } else {
            await db.run('INSERT OR REPLACE INTO Canal (cve_cliente, canal) VALUES (?, ?)', [clientCode, newChannel]);
        }

        // Online sync
        if (await isOnline()) {
            await supabase.from('Canal').upsert({ cve_cliente: clientCode, canal: newChannel });
        }
    } catch (e) {
        console.error('[metadataRepository] Error updating channel:', e);
        throw e;
    }
}

// --- Asset Types ---
export async function getAssetTypes() {
    try {
        const db = await getDb();
        let localData = [];
        
        if (isMockDb()) {
            localData = (db._storage.get('asset_types') || []).map(t => t.name);
        } else {
            const res = await db.query('SELECT name FROM asset_types');
            localData = (res.values || []).map(r => r.name);
        }

        if (localData.length > 0) return localData;

        // Fallback: Supabase
        const { data, error } = await supabase.from('asset_types').select('name').order('name');
        if (data && data.length > 0) {
            await saveAssetTypesToLocal(data);
            return data.map(d => d.name);
        }
        return [];
    } catch (e) {
        console.error('[metadataRepository] Error loading asset_types:', e);
        return [];
    }
}

export async function saveAssetTypesToLocal(rows) {
    if (!rows || !rows.length) return;
    try {
        const db = await getDb();
        if (isMockDb()) {
            db._storage.set('asset_types', rows);
            return;
        }
        await db.run('DELETE FROM asset_types');
        const placeholders = rows.map(() => '(?)').join(',');
        const values = rows.map(r => r.name);
        await db.run(`INSERT INTO asset_types (name) VALUES ${placeholders}`, values);
    } catch (e) { console.error(e); }
}

export async function addAssetType(name) {
    if (!name) return;
    const cleanName = name.trim().toUpperCase();
    try {
        const db = await getDb();
        if (isMockDb()) {
            const all = db._storage.get('asset_types') || [];
            if (!all.find(t => t.name === cleanName)) {
                all.push({ name: cleanName });
                db._storage.set('asset_types', all);
            }
        } else {
            await db.run('INSERT OR IGNORE INTO asset_types (name) VALUES (?)', [cleanName]);
        }

        // Online sync
        if (await isOnline()) {
            await supabase.from('asset_types').upsert({ name: cleanName });
        }
    } catch (e) {
        console.error('[metadataRepository] Error adding asset type:', e);
        throw e;
    }
}

export async function deleteAssetType(name) {
    if (!name) return;
    try {
        const db = await getDb();
        if (isMockDb()) {
            const all = db._storage.get('asset_types') || [];
            db._storage.set('asset_types', all.filter(t => t.name !== name));
        } else {
            await db.run('DELETE FROM asset_types WHERE name = ?', [name]);
        }

        // Online sync
        if (await isOnline()) {
            await supabase.from('asset_types').delete().eq('name', name);
        }
    } catch (e) {
        console.error('[metadataRepository] Error deleting asset type:', e);
        throw e;
    }
}

// --- Supervisor Allowed Routes/Zonas ---
export async function getAllowedRoutes(supervisorId) {
    try {
        const db = await getDb();
        let internal = [];
        let sales = [];

        if (isMockDb()) {
            const internalRes = (db._storage.get('supervisor_allowed_routes') || []).filter(r => r.supervisor_id === supervisorId);
            const salesRes = (db._storage.get('supervisor_allowed_sales_routes') || []).filter(r => r.supervisor_id === supervisorId);
            internal = internalRes.map(r => r.route);
            sales = salesRes.map(r => r.sales_route);
        } else {
            const resInternal = await db.query('SELECT route FROM supervisor_allowed_routes WHERE supervisor_id = ?', [supervisorId]);
            const resSales = await db.query('SELECT sales_route FROM supervisor_allowed_sales_routes WHERE supervisor_id = ?', [supervisorId]);
            internal = (resInternal.values || []).map(r => r.route);
            sales = (resSales.values || []).map(r => r.sales_route);
        }

        // Fallback: Supabase if local is empty
        if (internal.length === 0 && sales.length === 0) {
            try {
                const { data: routeData } = await supabase.from('supervisor_allowed_sales_routes').select('sales_route').eq('supervisor_id', supervisorId);
                const { data: internalData } = await supabase.from('supervisor_allowed_routes').select('route').eq('supervisor_id', supervisorId);
                
                if (routeData || internalData) {
                    sales = (routeData || []).map(r => r.sales_route);
                    internal = (internalData || []).map(r => r.route);
                    
                    // Optional: Save to local for next time
                    // but we'll stick to returning for now to fix the immediate issue
                }
            } catch (supaErr) {
                console.warn("Supabase fallback failed for routes", supaErr);
            }
        }

        return { internal, sales };
    } catch (e) {
        console.error(e);
        return { internal: [], sales: [] };
    }
}

export async function getAllowedZonas(supervisorId) {
    try {
        const db = await getDb();
        if (isMockDb()) {
            const zonas = (db._storage.get('supervisor_allowed_zonas') || []).filter(r => r.supervisor_id === supervisorId);
            return zonas.map(r => r.zona);
        }
        const res = await db.query('SELECT zona FROM supervisor_allowed_zonas WHERE supervisor_id = ?', [supervisorId]);
        return (res.values || []).map(r => r.zona);
    } catch (e) {
        return [];
    }
}

export async function saveAllowedRoutesToLocal(internalRows, salesRows, zonasRows, supervisorId = null) {
    try {
        const db = await getDb();
        if (isMockDb()) {
            const mergeForSupervisor = (key, incoming) => {
                const existing = db._storage.get(key) || [];
                if (!supervisorId) {
                    db._storage.set(key, [...existing, ...incoming]);
                    return;
                }
                db._storage.set(key, [
                    ...existing.filter(row => row.supervisor_id !== supervisorId),
                    ...incoming
                ]);
            };
            mergeForSupervisor('supervisor_allowed_routes', internalRows || []);
            mergeForSupervisor('supervisor_allowed_sales_routes', salesRows || []);
            mergeForSupervisor('supervisor_allowed_zonas', zonasRows || []);
            return;
        }

        // TRANSACTION
        await db.execute('BEGIN TRANSACTION');

        try {
            if (supervisorId) await db.run('DELETE FROM supervisor_allowed_routes WHERE supervisor_id = ?', [supervisorId]);
            else if (internalRows?.length) await db.run('DELETE FROM supervisor_allowed_routes WHERE supervisor_id = ?', [internalRows[0].supervisor_id]);
            if (internalRows?.length) {
                const placeholders = internalRows.map(() => '(?, ?)').join(',');
                const values = internalRows.flatMap(r => [r.supervisor_id, r.route]);
                await db.run(`INSERT INTO supervisor_allowed_routes (supervisor_id, route) VALUES ${placeholders}`, values);
            }

            if (supervisorId) await db.run('DELETE FROM supervisor_allowed_sales_routes WHERE supervisor_id = ?', [supervisorId]);
            else if (salesRows?.length) await db.run('DELETE FROM supervisor_allowed_sales_routes WHERE supervisor_id = ?', [salesRows[0].supervisor_id]);
            if (salesRows?.length) {
                const placeholders = salesRows.map(() => '(?, ?)').join(',');
                const values = salesRows.flatMap(r => [r.supervisor_id, r.sales_route]);
                await db.run(`INSERT INTO supervisor_allowed_sales_routes (supervisor_id, sales_route) VALUES ${placeholders}`, values);
            }

            if (supervisorId) await db.run('DELETE FROM supervisor_allowed_zonas WHERE supervisor_id = ?', [supervisorId]);
            else if (zonasRows?.length) await db.run('DELETE FROM supervisor_allowed_zonas WHERE supervisor_id = ?', [zonasRows[0].supervisor_id]);
            if (zonasRows?.length) {
                const placeholders = zonasRows.map(() => '(?, ?)').join(',');
                const values = zonasRows.flatMap(r => [r.supervisor_id, r.zona]);
                await db.run(`INSERT INTO supervisor_allowed_zonas (supervisor_id, zona) VALUES ${placeholders}`, values);
            }

            await db.execute('COMMIT');

        } catch (innerError) {
            console.error('[metadataRepo] Transaction failed, rolling back:', innerError);
            await db.execute('ROLLBACK');
        }

    } catch (e) { console.error(e); }
}

// --- SKU Equivalencias / Homologación de Códigos entre Sistemas ---
let cachedSkuEquivalenciasMap = null;

export async function getSkuEquivalencias(forceRefresh = false) {
    if (!forceRefresh && cachedSkuEquivalenciasMap) {
        return cachedSkuEquivalenciasMap;
    }
    const map = new Map();

    // 1. Intentar primero desde Supabase
    try {
        const { data, error } = await supabase
            .from('sku_equivalencias')
            .select('sku_origen, sku_canonico');

        if (!error && Array.isArray(data) && data.length > 0) {
            for (const row of data) {
                if (row.sku_origen && row.sku_canonico) {
                    map.set(String(row.sku_origen).trim().toUpperCase(), String(row.sku_canonico).trim().toUpperCase());
                }
            }
            cachedSkuEquivalenciasMap = map;
            return map;
        }
    } catch (errSupa) {
        console.warn("[metadataRepository] Supabase fetch sku_equivalencias fallback:", errSupa);
    }

    // 2. Fallback a la API de Hostinger MySQL
    try {
        const timestamp = new Date().getTime();
        const res = await fetch(`${API_BASE}/sku-equivalencias.php?_t=${timestamp}`);
        if (res.ok) {
            const json = await res.json();
            if (json.map) {
                for (const [k, v] of Object.entries(json.map)) {
                    map.set(String(k).trim().toUpperCase(), String(v).trim().toUpperCase());
                }
            } else if (Array.isArray(json.data)) {
                for (const row of json.data) {
                    if (row.sku_origen && row.sku_canonico) {
                        map.set(String(row.sku_origen).trim().toUpperCase(), String(row.sku_canonico).trim().toUpperCase());
                    }
                }
            }
        }
    } catch (e) {
        console.warn("[metadataRepository] Error loading sku_equivalencias from API:", e);
    }

    cachedSkuEquivalenciasMap = map;
    return map;
}

export async function getSkuEquivalenciasList() {
    // 1. Intentar desde Supabase
    try {
        const { data, error } = await supabase
            .from('sku_equivalencias')
            .select('*')
            .order('sku_canonico', { ascending: true });

        if (!error && Array.isArray(data) && data.length > 0) {
            return data;
        }
    } catch (err) {
        console.warn("[metadataRepository] Supabase list fallback:", err);
    }

    // 2. Fallback API Hostinger
    try {
        const timestamp = new Date().getTime();
        const res = await fetch(`${API_BASE}/sku-equivalencias.php?_t=${timestamp}`);
        if (!res.ok) return [];
        const json = await res.json();
        return Array.isArray(json.data) ? json.data : [];
    } catch (e) {
        console.warn("[metadataRepository] Error loading sku_equivalencias list from API:", e);
        return [];
    }
}

export async function saveSkuEquivalencia(sku_origen, sku_canonico, descripcion = "") {
    const orig = String(sku_origen).trim().toUpperCase();
    const canon = String(sku_canonico).trim().toUpperCase();
    const desc = String(descripcion || "").trim();

    cachedSkuEquivalenciasMap = null; // Invalidate cache

    // 1. Guardar en Supabase
    try {
        const { error } = await supabase
            .from('sku_equivalencias')
            .upsert({
                sku_origen: orig,
                sku_canonico: canon,
                descripcion: desc
            }, { onConflict: 'sku_origen' });

        if (error) {
            console.warn("[metadataRepository] Supabase upsert error, trying API:", error);
        }
    } catch (err) {
        console.warn("[metadataRepository] Supabase upsert failed:", err);
    }

    // 2. Sincronizar en Hostinger MySQL
    try {
        const res = await fetch(`${API_BASE}/sku-equivalencias.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "save",
                sku_origen: orig,
                sku_canonico: canon,
                descripcion: desc
            })
        });
        return await res.json();
    } catch (e) {
        return { success: true };
    }
}

export async function deleteSkuEquivalencia(id, sku_origen) {
    cachedSkuEquivalenciasMap = null; // Invalidate cache

    // 1. Eliminar en Supabase
    try {
        if (id) {
            await supabase.from('sku_equivalencias').delete().eq('id', id);
        } else if (sku_origen) {
            await supabase.from('sku_equivalencias').delete().eq('sku_origen', sku_origen);
        }
    } catch (err) {
        console.warn("[metadataRepository] Supabase delete failed:", err);
    }

    // 2. Eliminar en Hostinger MySQL
    try {
        const res = await fetch(`${API_BASE}/sku-equivalencias.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "delete",
                id,
                sku_origen
            })
        });
        return await res.json();
    } catch (e) {
        return { success: true };
    }
}

