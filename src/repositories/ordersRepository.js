import { importOrdersApi, fetchOrdersApi, searchAssetsApi, completeOrderApi, importAssetsApi, fetchAssetHistoryApi, updateAssetApi, fetchWarehousesApi, fetchAssetLocationsApi, updateOrderApi } from '@/lib/mysqlOrders';
import { getDb, isMockDb } from '@/lib/localDb';
import { isOnline } from '@/lib/network';

export async function updateOrder(orderId, data) {
    const online = await isOnline().catch(() => false);
    if (online) {
        try {
            // Sync items to server if provided (to ensure serials are persisted)
            if (data.items && Array.isArray(data.items)) {
                try {
                    await importOrdersApi([{ 
                        order: { id: orderId, ...data }, 
                        items: data.items 
                    }]);
                } catch (syncErr) {
                    console.error('[ordersRepository] updateOrder item sync failed:', syncErr);
                }
            }
            
            const res = await updateOrderApi(orderId, data);
            if (res.status === 'success') {
                await saveOrdersToLocal([{ ...data, id: orderId, synced: 1 }]);
            }
            return res;
        } catch (e) {
            console.error('[ordersRepository] Online update failed:', e);
        }
    }
    
    // Fallback/Offline
    await saveOrdersToLocal([{ ...data, id: orderId, synced: 0 }]);
    return { status: 'success', message: 'Guardado localmente' };
}
export async function getAssets(params = {}) {
    const online = await isOnline().catch(() => false);
    if (online) {
        try {
            const res = await searchAssetsApi(params);
            const rows = res.rows || [];
            
            // Resolve warehouse names from local cache if missing from API
            const db = await getDb();
            const localWarehouses = isMockDb() 
                ? (db._storage.get('warehouses') || [])
                : (await db.query('SELECT id, name FROM warehouses').then(r => r.values || []));

            const normalized = rows.map(r => {
                let whName = r.warehouse_name;
                if (!whName && r.warehouse_id) {
                    const found = localWarehouses.find(w => w.id === r.warehouse_id);
                    if (found) whName = found.name;
                }
                
                return {
                    ...r,
                    warehouse_name: whName,
                    current_client_name: r.current_client_name || r.client_name,
                    current_client_address: r.current_client_address || r.client_address
                };
            });
            
            // Deduplicate by serial / id
            const seenAssetKeys = new Set();
            const uniqueNormalized = normalized.filter(r => {
                const key = r.serial || r.id;
                if (!key) return true;
                if (seenAssetKeys.has(key)) return false;
                seenAssetKeys.add(key);
                return true;
            });

            if (uniqueNormalized.length > 0) {
                await saveAssetsToLocal(uniqueNormalized);
            }
            return uniqueNormalized;
        } catch (e) {
            console.error('[ordersRepository] Error fetching assets:', e);
        }
    }

    // Local Fallback
    try {
        const db = await getDb();
        if (isMockDb()) {
            let all = db._storage.get('assets') || [];
            if (!Array.isArray(all)) all = [];
            
            const locations = db._storage.get('current_asset_locations') || [];
            const locArray = Array.isArray(locations) ? locations : [];
            
            const clients = db._storage.get('clients') || [];
            const clientArray = Array.isArray(clients) ? clients : [];
            
            const warehouses = db._storage.get('warehouses') || [];
            const warehouseArray = Array.isArray(warehouses) ? warehouses : [];

            if (params.serial) all = all.filter(a => a.serial && a.serial.includes(params.serial));
            if (params.type) all = all.filter(a => a.type === params.type);
            if (params.status) all = all.filter(a => a.status === params.status);
            if (params.warehouse_ids) {
                try {
                    const whIds = JSON.parse(params.warehouse_ids);
                    if (Array.isArray(whIds) && whIds.length > 0) {
                        all = all.filter(a => whIds.includes(a.warehouse_id));
                    }
                } catch (e) {}
            }

            const results = all.map(a => {
                const locs = locArray.filter(l => l.asset_serial === a.serial);
                const loc = locs.length > 0 ? locs.sort((x, y) => new Date(y.created_at || 0) - new Date(x.created_at || 0))[0] : null;
                const client = loc ? clientArray.find(c => c.id === loc.client_id) : null;
                const wh = a.warehouse_id ? warehouseArray.find(w => w.id === a.warehouse_id) : null;
                return {
                    ...a,
                    client_id: loc?.client_id, // Add client_id for filtering
                    warehouse_name: wh?.name || (a.status === 'EN_ALMACEN' ? 'Almacén Central' : null),
                    current_client_name: client?.name || (a.status === 'INSTALADO' ? 'Cliente Desconocido' : null),
                    current_client_address: client?.address
                };
            });

            if (params.client_id) {
                return results.filter(r => r.client_id === params.client_id);
            }
            return results;
        }

        let sql = `
            SELECT a.*, w.name as warehouse_name, c.name as current_client_name, c.address as current_client_address
            FROM assets a
            LEFT JOIN warehouses w ON a.warehouse_id = w.id
            LEFT JOIN (
                SELECT t1.*
                FROM current_asset_locations t1
                JOIN (
                    SELECT asset_serial, MAX(created_at) as max_created
                    FROM current_asset_locations
                    GROUP BY asset_serial
                ) t2 ON t1.asset_serial = t2.asset_serial AND t1.created_at = t2.max_created
            ) loc ON a.serial = loc.asset_serial
            LEFT JOIN clients c ON loc.client_id = c.id
            WHERE 1=1
        `;
        const vals = [];
        if (params.serial) {
            sql += ' AND a.serial LIKE ?';
            vals.push(`%${params.serial}%`);
        }
        if (params.type) {
            sql += ' AND a.type = ?';
            vals.push(params.type);
        }
        if (params.status) {
            sql += ' AND a.status = ?';
            vals.push(params.status);
        }
        if (params.warehouse_ids) {
            try {
                const whIds = JSON.parse(params.warehouse_ids);
                if (Array.isArray(whIds) && whIds.length > 0) {
                    const placeholders = whIds.map(() => '?').join(',');
                    sql += ` AND a.warehouse_id IN (${placeholders})`;
                    vals.push(...whIds);
                }
            } catch (e) {
                console.error('[ordersRepository] Error parsing warehouse_ids:', e);
            }
        }
        if (params.client_id) {
            sql += ' AND loc.client_id = ?';
            vals.push(params.client_id);
        }
        sql += ' ORDER BY a.created_at DESC';

        const res = await db.query(sql, vals);
        return res.values || [];
    } catch (e) {
        console.error('[ordersRepository] Local assets fetch failed:', e);
        return [];
    }
}

export async function getAssetLocations() {
    const online = await isOnline().catch(() => false);
    if (online) {
        try {
            const res = await fetchAssetLocationsApi();
            if (res && Array.isArray(res)) {
                // Deduplicate by serial / asset_id
                const seen = new Set();
                const unique = res.filter(r => {
                    const key = r.asset_serial || r.asset_id;
                    if (!key || seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
                await saveAssetLocationsToLocal(unique);
                return unique;
            }
            return [];
        } catch (e) {
            console.error('[ordersRepository] Error fetching asset locations online:', e);
        }
    }

    try {
        const db = await getDb();
        if (isMockDb()) {
            const locations = db._storage.get('current_asset_locations') || [];
            const locArray = Array.isArray(locations) ? locations : [];
            const clients = db._storage.get('clients') || [];
            const clientArray = Array.isArray(clients) ? clients : [];
            
            return locArray.map(l => {
                const client = clientArray.find(c => c.id === l.client_id);
                return {
                    ...l,
                    client_name: client?.name || (l.client_id ? 'Cliente Desconocido' : 'ALMACEN'),
                    client_business_name: client?.business_name,
                    client_address: client?.address,
                    client_code: client?.client_code
                };
            });
        }

        const sql = `
            SELECT loc.*, c.name as client_name, c.business_name as client_business_name, c.address as client_address, c.client_code as client_code
            FROM current_asset_locations loc
            LEFT JOIN clients c ON loc.client_id = c.id
        `;
        const res = await db.query(sql);
        return res.values || [];
    } catch (e) {
        console.error('[ordersRepository] Error fetching asset locations local:', e);
        return [];
    }
}

export async function syncInstallerData() {
    const online = await isOnline().catch(() => false);
    if (!online) return;

    try {
        console.log('[ordersRepository] 🔄 Sincronizando inventario de activos para modo offline...');
        
        // 1. Sincronizar ubicaciones actuales (mapeo serie -> cliente)
        const locations = await fetchAssetLocationsApi();
        if (locations && Array.isArray(locations)) {
            await saveAssetLocationsToLocal(locations);
        }

        // 2. Sincronizar detalles de los activos
        const assetsRes = await searchAssetsApi({});
        const assets = assetsRes.rows || [];
        if (assets.length > 0) {
            await saveAssetsToLocal(assets);
        }
        
        console.log(`[ordersRepository] ✅ Sync de activos completado: ${locations?.length || 0} ubicaciones, ${assets?.length || 0} activos.`);
    } catch (e) {
        console.error('[ordersRepository] ❌ Error en syncInstallerData:', e);
    }
}

export async function updateAsset(assetData) {
    const online = await isOnline().catch(() => false);
    const now = new Date().toISOString();

    if (online) {
        try {
            const res = await updateAssetApi(assetData);
            if (res.status === 'error') throw new Error(res.message);
            // Apply local update to SQLite
            await updateLocalAsset(assetData.id, assetData, true);
            return res;
        } catch (e) {
            console.error('[ordersRepository] Online update failed, falling back to offline:', e);
        }
    }

    // Offline update
    await updateLocalAsset(assetData.id, assetData, false);
    try {
        const { addPendingOperation } = await import('@/sync/syncService');
        await addPendingOperation({
            entity_type: 'asset',
            operation: 'update',
            payload: assetData,
            created_at: now
        });
    } catch (e) {
        console.error('[ordersRepository] Failed to queue offline update:', e);
    }
    
    return { status: 'success', offline: true };
}

async function updateLocalAsset(id, data, synced = false) {
    try {
        const db = await getDb();
        if (isMockDb()) {
            const assets = db._storage.get('assets') || [];
            const index = assets.findIndex(a => a.id === id);
            if (index !== -1) {
                assets[index] = { ...assets[index], ...data };
                db._storage.set('assets', assets);
            }
            return;
        }
        
        // SQLite
        const updateFields = [];
        const updateValues = [];
        Object.keys(data).forEach(key => {
            if (key !== 'id') {
                updateFields.push(`${key} = ?`);
                updateValues.push(data[key]);
            }
        });
        if (updateFields.length > 0) {
            updateValues.push(id);
            await db.run(`UPDATE assets SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
        }
    } catch (e) {
        console.error('[ordersRepository] Error in updateLocalAsset:', e);
    }
}

export async function deactivateAsset(assetId) {
    return await updateAsset({ id: assetId, status: 'DE_BAJA' });
}

export async function transferAssetToWarehouse(assetId, warehouseId) {
    return await updateAsset({ 
        id: assetId, 
        warehouse_id: warehouseId, 
        status: 'EN_ALMACEN',
        current_client_id: null 
    });
}


export async function getWarehouses() {
    try {
        const { data, error } = await supabase.from('warehouses').select('id, name').order('name');
        if (error) {
            console.error('[ordersRepository] Error fetching Supabase warehouses:', error);
            return [];
        }
        if (data && data.length > 0) {
            await saveWarehousesToLocal(data);
        }
        return data || [];
    } catch (e) {
        console.error('[ordersRepository] Error fetching warehouses:', e);
        return [];
    }
}



export async function getAssetHistory(assetId) {
    const online = await isOnline().catch(() => false);
    if (online) {
        try {
            const res = await fetchAssetHistoryApi(assetId);
            return res.rows || [];
        } catch (e) {
            console.error('[ordersRepository] Error fetching asset history:', e);
        }
    }
    // No local history for now, but could be added if needed
    return [];
}

/**
 * Repositorio para Órdenes de Instalación y Activos
 */

// --- Asset Types ---
export async function getAssetTypes() {
    return await loadLocalAssetTypes();
}

async function loadLocalAssetTypes() {
    try {
        const { getAssetTypes: getTypes } = await import('./metadataRepository');
        return await getTypes();
    } catch (e) {
        console.error('[ordersRepository] Error fetching asset types:', e);
        return [];
    }
}

// --- Asset Search (Locations) ---
export async function searchAsset(serial) {
    const online = await isOnline().catch(() => false);
    console.log('[ordersRepository] searchAsset:', serial, 'Online:', online);

    if (online) {
        try {
            const res = await searchAssetsApi({ serial });
            if (res.rows && res.rows.length > 0) {
                const asset = res.rows[0];
                // Sync to local for future offline use
                await saveAssetLocationsToLocal([asset]);
                return asset;
            }
        } catch (e) {
            console.error('[ordersRepository] Online asset search failed:', e);
        }
    }

    // Fallback to Local Search
    try {
        const db = await getDb();
        if (isMockDb()) {
            const all = db._storage.get('current_asset_locations') || [];
            const found = all.find(a => a.asset_serial === serial);
            if (found) {
                const clients = db._storage.get('clients') || [];
                const client = clients.find(c => c.id === found.client_id);
                return { ...found, client_name: client?.name };
            }
            return null;
        }

        const res = await db.query('SELECT * FROM current_asset_locations WHERE asset_serial = ?', [serial]);
        if (res.values && res.values.length > 0) {
            const asset = res.values[0];
            const resClient = await db.query('SELECT name FROM clients WHERE id = ?', [asset.client_id]);
            const clientName = resClient.values?.[0]?.name;
            return { ...asset, client_name: clientName };
        }
    } catch (e) { console.error(e); }
    return null;
}

export async function saveAssetLocationsToLocal(rows) {
    if (!rows?.length) return;
    try {
        const db = await getDb();
        if (isMockDb()) db._storage.set('current_asset_locations', rows);

        const BATCH_SIZE = 50;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const chunk = rows.slice(i, i + BATCH_SIZE);
            const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
            const values = chunk.flatMap(r => [r.asset_id || r.id, r.asset_serial || r.serial, r.asset_type || r.type, r.client_id, r.action || r.last_action, r.created_at]);

            await db.run(`INSERT OR REPLACE INTO current_asset_locations 
        (asset_id, asset_serial, asset_type, client_id, action, created_at) 
        VALUES ${placeholders}`, values);
        }
    } catch (e) { console.error(e); }
}

async function saveAssetsToLocal(rows) {
    if (!rows?.length) return;
    try {
        const db = await getDb();
        if (isMockDb()) {
            const existing = db._storage.get('assets') || [];
            const merged = [...existing];
            for (const r of rows) {
                const idx = merged.findIndex(e => e.id === r.id);
                if (idx !== -1) merged[idx] = { ...merged[idx], ...r };
                else merged.push(r);
            }
            db._storage.set('assets', merged);
        }

        for (const r of rows) {
            await db.run(`INSERT OR REPLACE INTO assets 
                (id, serial, type, status, brand, model, qr_value, warehouse_id, created_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [r.id, r.serial, r.type, r.status, r.brand, r.model, r.qr_value, r.warehouse_id, r.created_at]);
        }
    } catch (e) { console.error(e); }
}

async function saveWarehousesToLocal(rows) {
    if (!rows?.length) return;
    try {
        const db = await getDb();
        if (isMockDb()) {
            const existing = db._storage.get('warehouses') || [];
            const merged = [...existing];
            for (const r of rows) {
                const idx = merged.findIndex(e => e.id === r.id);
                if (idx !== -1) merged[idx] = { ...merged[idx], ...r };
                else merged.push(r);
            }
            db._storage.set('warehouses', merged);
        }

        for (const r of rows) {
            await db.run(`INSERT OR REPLACE INTO warehouses (id, name, address, created_at) VALUES (?, ?, ?, ?)`,
                [r.id, r.name, r.address, r.created_at]);
        }
    } catch (e) { console.error(e); }
}

// --- Orders ---
export async function syncOrders(userId) {
    const online = await isOnline().catch(() => false);
    if (!online || !userId) return;

    try {
        console.log('[ordersRepository] Syncing orders for user:', userId);
        const res = await fetchOrdersApi({ assigned_to: userId, limit: 100 });
        const resCreated = await fetchOrdersApi({ created_by: userId, limit: 100 });

        const allOrders = [...(res.rows || []), ...(resCreated.rows || [])];
        const uniqueOrders = Array.from(new Map(allOrders.map(o => [o.id, o])).values());

        if (uniqueOrders.length > 0) {
            await saveOrdersToLocal(uniqueOrders);
        }
    } catch (e) { console.error(e); }
}

export async function syncAllOrders() {
    const online = await isOnline().catch(() => false);
    if (!online) return;

    try {
        console.log('[ordersRepository] Syncing ALL orders');
        const res = await fetchOrdersApi({ limit: 300 });
        if (res.rows && res.rows.length > 0) {
            const uniqueOrders = Array.from(new Map(res.rows.map(o => [o.id, o])).values());
            await saveOrdersToLocal(uniqueOrders);
        }
    } catch (e) { console.error(e); }
}

export async function getOrders(userId) {
    try { await syncOrders(userId); } catch (e) { }
    return await loadLocalOrders(userId);
}

export async function getAllOrders() {
    try { await syncAllOrders(); } catch (e) { }
    return await loadLocalOrdersAll();
}

export async function getOrderById(id) {
    const online = await isOnline().catch(() => false);
    if (online) {
        try {
            const res = await fetchOrdersApi({ id });
            if (res.rows?.[0]) {
                await saveOrdersToLocal([res.rows[0]]);
            }
        } catch (e) { }
    }
    return await loadLocalOrderById(id);
}

async function loadLocalOrderById(id) {
    try {
        const db = await getDb();
        if (isMockDb()) {
            const all = db._storage.get('installation_orders') || [];
            const r = all.find(o => o.id === id);
            if (!r) return null;

            // Enrich/Fallback with client info (Mock)
            const clients = db._storage.get('clients') || [];
            const client = clients.find(c => String(c.id) === String(r.client_id));

            // Check original server field names if cached ones are missing
            const name = client?.name || r.client_name_cached || r.origin_client_name;
            const address = client?.address || r.client_address_cached || r.origin_client_address || (client ? `${client.colony || ''} ${client.city || ''}`.trim() : 'N/A');
            const lat = client?.lat || r.lat;
            const lng = client?.lng || r.lng;

            if (name) {
                    r.origin_client = { 
                        name, 
                        address,
                        lat,
                        lng,
                        coords: r.client_coords || r.origin_client_coords,
                        business_name: client?.business_name || r.client_business_name_cached || r.origin_client_business_name
                    };
            }

            if (r.destination_client_id) {
                const dest = clients.find(c => String(c.id) === String(r.destination_client_id));
                const destName = dest?.name || r.destination_client_name_cached || r.destination_client_name;
                const destAddress = dest?.address || r.destination_client_address_cached || r.destination_client_address;
                const destBusiness = dest?.business_name || r.destination_client_business_name_cached || r.destination_client_business_name;

                if (destName) {
                    r.destination_client = { 
                        name: destName, 
                        address: destAddress,
                        business_name: destBusiness
                    };
                }
            }

            const items = (db._storage.get('installation_order_items') || []).filter(i => i.order_id === id);

            // Proactively fix/persist IDs for existing items that lack them
            let needsSave = false;
            const itemsWithId = items.map((item, idx) => {
                if (!item.id) {
                    needsSave = true;
                    // USE STABLE ID: order_id + index
                    return { ...item, id: `mock-item-${id}-${idx}` };
                }
                return item;
            });

            if (needsSave) {
                console.log('[ordersRepository] loadLocalOrderById: Persisting missing IDs for order', id);
                const allItems = db._storage.get('installation_order_items') || [];
                // Create a map of items for this order by their position to assign the new IDs
                const orderItemsInStorage = allItems.filter(ai => ai.order_id === id);

                const updatedAll = allItems.map(ai => {
                    if (ai.order_id !== id) return ai;
                    const pos = orderItemsInStorage.indexOf(ai);
                    if (pos !== -1 && itemsWithId[pos]) return itemsWithId[pos];
                    return ai;
                });
                db._storage.set('installation_order_items', updatedAll);
                r.items = itemsWithId;
            } else {
                r.items = items;
            }

            return r;
        }

        const res = await db.query('SELECT * FROM installation_orders WHERE id = ?', [id]);
        if (!res.values?.[0]) return null;
        const row = res.values[0];

        let originClient = null;
        const cRes = await db.query('SELECT name, address, colony, city, business_name, lat, lng FROM clients WHERE id = ?', [row.client_id]);
        
        if (cRes.values?.[0]) {
            const c = cRes.values[0];
            originClient = {
                name: c.name,
                address: c.address || `${c.colony || ''} ${c.city || ''}`.trim(),
                business_name: c.business_name,
                lat: c.lat,
                lng: c.lng
            };
        } else {
            // -- MEJORA: Buscar online si no está local --
            try {
                const { getClientById } = await import('./clientsRepository');
                const onlineClient = await getClientById(row.client_id);
                if (onlineClient) {
                    originClient = {
                        name: onlineClient.name,
                        address: onlineClient.address || `${onlineClient.colony || ''} ${onlineClient.city || ''}`.trim(),
                        business_name: onlineClient.business_name,
                        lat: onlineClient.lat,
                        lng: onlineClient.lng
                    };
                }
            } catch (e) {
                console.warn('[ordersRepository] Falló búsqueda online de cliente:', e);
            }
        }

        // Si después de buscar online seguimos sin cliente, usamos el cache de la orden
        if (originClient) {
            row.origin_client = originClient;
        } else if (row.client_name_cached) {
            row.origin_client = { 
                name: row.client_name_cached, 
                address: row.client_address_cached || 'N/A',
                business_name: row.client_business_name_cached || row.origin_client_business_name,
                lat: row.client_lat || row.lat,
                lng: row.client_lng || row.lng,
                coords: row.client_coords
            };
        }

        if (row.destination_client_id) {
            const dcRes = await db.query('SELECT name, address, business_name FROM clients WHERE id = ?', [row.destination_client_id]);
            if (dcRes.values?.[0]) {
                row.destination_client = dcRes.values[0];
            } else if (row.destination_client_name_cached) {
                row.destination_client = { 
                    name: row.destination_client_name_cached, 
                    address: row.destination_client_address_cached || 'N/A',
                    business_name: row.destination_client_business_name_cached || row.destination_client_business_name
                };
            }
        }

        const iRes = await db.query('SELECT * FROM installation_order_items WHERE order_id = ?', [row.id]);
        row.items = iRes.values || [];
        return row;
    } catch (e) { return null; }
}

async function loadLocalOrders(userId) {
    try {
        const db = await getDb();
        if (isMockDb()) {
            const all = db._storage.get('installation_orders') || [];
            const clients = db._storage.get('clients') || [];
            const allItems = db._storage.get('installation_order_items') || [];

            const itemsByOrder = new Map();
            allItems.forEach(i => {
                const list = itemsByOrder.get(i.order_id) || [];
                list.push(i);
                itemsByOrder.set(i.order_id, list);
            });

            return all
                .filter(o => String(o.created_by) === String(userId) || String(o.assigned_to) === String(userId))
                .map(o => {
                    const client = clients.find(c => String(c.id) === String(o.client_id));
                    const name = client?.name || o.client_name_cached || o.origin_client_name;
                    const address = client?.address || o.client_address_cached || o.origin_client_address || (client ? `${client.colony || ''} ${client.city || ''}`.trim() : 'N/A');

                    const itemData = itemsByOrder.get(o.id) || [];
                    // Ensure IDs even in list view and PERSIST them
                    let listNeedsSave = false;
                    const itemsWithId = itemData.map((item, idx) => {
                        if (!item.id) {
                            listNeedsSave = true;
                            return { ...item, id: `mock-item-${o.id}-${idx}` };
                        }
                        return item;
                    });

                    if (listNeedsSave) {
                        console.log('[ordersRepository] loadLocalOrders: Persisting missing IDs for order', o.id);
                        const allItemsUpdate = db._storage.get('installation_order_items') || [];
                        const orderItemsInStorage = allItemsUpdate.filter(ai => ai.order_id === o.id);

                        const updated = allItemsUpdate.map(ai => {
                            if (ai.order_id !== o.id) return ai;
                            const pos = orderItemsInStorage.indexOf(ai);
                            if (pos !== -1 && itemsWithId[pos]) return itemsWithId[pos];
                            return ai;
                        });
                        db._storage.set('installation_order_items', updated);
                    }

                    return {
                        ...o,
                        origin_client: name ? { 
                            name, 
                            address, 
                            lat: client?.lat || o.client_lat || o.lat,
                            lng: client?.lng || o.client_lng || o.lng,
                            coords: client?.coords || o.client_coords,
                            business_name: client?.business_name || o.client_business_name_cached || o.origin_client_business_name
                        } : null,
                        items: itemsWithId
                    };
                })
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        const res = await db.query(
            'SELECT * FROM installation_orders WHERE assigned_to = ? OR created_by = ? ORDER BY created_at DESC',
            [userId, userId]
        );
        const rows = res.values || [];
        for (const row of rows) {
            const cRes = await db.query('SELECT name, address, colony, city, business_name, lat, lng, coords FROM clients WHERE id = ?', [row.client_id]);
            if (cRes.values?.[0]) {
                const c = cRes.values[0];
                row.origin_client = { 
                    name: c.name, 
                    address: c.address || `${c.colony || ''} ${c.city || ''}`.trim(), 
                    business_name: c.business_name,
                    lat: c.lat,
                    lng: c.lng,
                    coords: c.coords
                };
            } else if (row.client_name_cached) {
                row.origin_client = { 
                    name: row.client_name_cached, 
                    address: row.client_address_cached || 'N/A', 
                    business_name: row.client_business_name_cached || row.origin_client_business_name,
                    lat: row.client_lat || row.lat,
                    lng: row.client_lng || row.lng,
                    coords: row.client_coords
                };
            }
            const iRes = await db.query('SELECT * FROM installation_order_items WHERE order_id = ?', [row.id]);
            row.items = iRes.values || [];
        }
        return rows;
    } catch (e) { return []; }
}

async function loadLocalOrdersAll() {
    try {
        const db = await getDb();
        if (isMockDb()) {
            const all = db._storage.get('installation_orders') || [];
            const clients = db._storage.get('clients') || [];
            const allItems = db._storage.get('installation_order_items') || [];
            const itemsByOrder = new Map();
            allItems.forEach(i => {
                const list = itemsByOrder.get(i.order_id) || [];
                list.push(i);
                itemsByOrder.set(i.order_id, list);
            });

            return all.map(o => {
                const client = clients.find(c => String(c.id) === String(o.client_id));
                const name = client?.name || o.client_name_cached || o.origin_client_name;
                const address = client?.address || o.client_address_cached || o.origin_client_address || (client ? `${client.colony || ''} ${client.city || ''}`.trim() : 'N/A');
                const lat = client?.lat || o.lat;
                const lng = client?.lng || o.lng;
                return {
                    ...o,
                    origin_client: name ? { 
                        name, 
                        address, 
                        lat, 
                        lng, 
                        business_name: client?.business_name || o.client_business_name_cached || o.origin_client_business_name 
                    } : null,
                    items: itemsByOrder.get(o.id) || []
                };
            }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        const res = await db.query('SELECT * FROM installation_orders ORDER BY created_at DESC');
        const rows = res.values || [];
        for (const row of rows) {
            const cRes = await db.query('SELECT name, address, colony, city, business_name, lat, lng, coords FROM clients WHERE id = ?', [row.client_id]);
            if (cRes.values?.[0]) {
                const c = cRes.values[0];
                row.origin_client = { 
                    name: c.name, 
                    address: c.address || `${c.colony || ''} ${c.city || ''}`.trim(), 
                    business_name: c.business_name,
                    lat: c.lat,
                    lng: c.lng,
                    coords: c.coords
                };
            } else if (row.client_name_cached) {
                row.origin_client = { name: row.client_name_cached, address: row.client_address_cached || 'N/A', business_name: row.client_business_name_cached || row.origin_client_business_name };
            }
            const iRes = await db.query('SELECT * FROM installation_order_items WHERE order_id = ?', [row.id]);
            row.items = iRes.values || [];
        }
        return rows;
    } catch (e) { return []; }
}

async function saveOrdersToLocal(rows) {
    if (!rows?.length) return;
    try {
        const db = await getDb();
        if (isMockDb()) {
            const existingOrders = db._storage.get('installation_orders') || [];
            const mergedOrders = [...existingOrders];
            let allItems = db._storage.get('installation_order_items') || [];

            for (const r of rows) {
                // Merge Orders
                const orderIdx = mergedOrders.findIndex(o => o.id === r.id);
                const enrichedOrder = {
                    ...r,
                    client_name_cached: r.client_name_cached || r.origin_client_name || r.origin_client?.name || r.client_name,
                    client_address_cached: r.client_address_cached || r.origin_client_address || r.origin_client?.address || r.client_address,
                    client_business_name_cached: r.client_business_name_cached || r.origin_client_business_name || r.origin_client?.business_name || r.client_business_name,
                    destination_client_name_cached: r.destination_client_name_cached || r.destination_client_name || r.destination_client?.name || r.dest_client_name,
                    destination_client_address_cached: r.destination_client_address_cached || r.destination_client_address || r.destination_client?.address || r.dest_client_address,
                    destination_client_business_name_cached: r.destination_client_business_name_cached || r.destination_client_business_name || r.destination_client?.business_name || r.dest_client_business_name,
                    client_lat: r.client_lat || r.origin_client_lat || r.origin_client?.lat || r.lat,
                    client_lng: r.client_lng || r.origin_client_lng || r.origin_client?.lng || r.lng,
                    client_coords: r.client_coords || r.origin_client_coords || (typeof r.origin_client?.coords === 'string' ? r.origin_client.coords : JSON.stringify(r.origin_client?.coords || {})),
                    destination_client_lat: r.destination_client_lat || r.dest_client_lat || r.destination_client?.lat,
                    destination_client_lng: r.destination_client_lng || r.dest_client_lng || r.destination_client?.lng,
                    destination_client_coords: r.destination_client_coords || r.dest_client_coords || (typeof r.destination_client?.coords === 'string' ? r.destination_client.coords : JSON.stringify(r.destination_client?.coords || {}))
                };

                if (orderIdx !== -1) mergedOrders[orderIdx] = { ...mergedOrders[orderIdx], ...enrichedOrder };
                else mergedOrders.push(enrichedOrder);

                // Merge items intelligently
                if (r.items) {
                    const localItems = allItems.filter(i => i.order_id === r.id);
                    // Remove old items for this order from global list
                    allItems = allItems.filter(i => i.order_id !== r.id);

                    const mergedItems = r.items.map((newItem, idx) => {
                        // Find a corresponding local item to preserve fields like asset_serial
                        const localIdx = idx; // Usually they match by position
                        const local = localItems[localIdx];

                        return {
                            ...newItem,
                            id: newItem.id || local?.id || `mock-item-${r.id}-${idx}`,
                            asset_serial: newItem.asset_serial || local?.asset_serial,
                            asset_id: newItem.asset_id || local?.asset_id
                        };
                    });

                    allItems = [...allItems, ...mergedItems];
                }
            }
            db._storage.set('installation_orders', mergedOrders);
            db._storage.set('installation_order_items', allItems);
        }

        await db.execute('BEGIN TRANSACTION');
        try {
            for (const r of rows) {
                await db.run(`INSERT OR REPLACE INTO installation_orders 
            (id, client_id, destination_client_id, action, assigned_to, created_by, status, notes, created_at, synced, 
             client_name_cached, client_address_cached, client_business_name_cached,
             destination_client_name_cached, destination_client_address_cached, destination_client_business_name_cached,
             client_lat, client_lng, client_coords,
             destination_client_lat, destination_client_lng, destination_client_coords)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        r.id, r.client_id, r.destination_client_id, r.action, r.assigned_to, r.created_by, r.status, r.notes, r.created_at, r.synced ?? 1,
                        r.origin_client_name || r.origin_client?.name || r.client_name || r.client_name_cached || r.origin_client_name,
                        r.origin_client_address || r.origin_client?.address || r.client_address || r.client_address_cached || r.origin_client_address,
                        r.origin_client_business_name || r.origin_client?.business_name || r.client_business_name || r.client_business_name_cached || r.origin_client_business_name,
                        r.destination_client_name || r.destination_client?.name || r.dest_client_name || r.destination_client_name_cached || r.destination_client_name,
                        r.destination_client_address || r.destination_client?.address || r.dest_client_address || r.destination_client_address_cached || r.destination_client_address,
                        r.destination_client_business_name || r.destination_client?.business_name || r.dest_client_business_name || r.destination_client_business_name_cached || r.destination_client_business_name,
                        r.origin_client_lat || r.client_lat || r.origin_client?.lat || r.lat,
                        r.origin_client_lng || r.client_lng || r.origin_client?.lng || r.lng,
                        r.origin_client_coords || r.client_coords || (typeof r.origin_client?.coords === 'string' ? r.origin_client.coords : JSON.stringify(r.origin_client?.coords || {})),
                        r.destination_client_lat || r.destination_client?.lat || r.dest_client_lat,
                        r.destination_client_lng || r.destination_client?.lng || r.dest_client_lng,
                        r.destination_client_coords || (typeof r.destination_client?.coords === 'string' ? r.destination_client.coords : JSON.stringify(r.destination_client?.coords || {}))
                    ]);

                // Some list endpoints omit item details or return an empty
                // placeholder. Preserve cached order lines unless details arrived.
                if (Array.isArray(r.items) && r.items.length > 0) {
                    await db.run('DELETE FROM installation_order_items WHERE order_id = ?', [r.id]);
                    for (const item of r.items) {
                        await db.run(`INSERT INTO installation_order_items 
                        (order_id, asset_id, asset_type, asset_serial, quantity, condition_status, notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [r.id, item.asset_id, item.asset_type, item.asset_serial, item.quantity, item.condition_status, item.notes]);
                    }
                }
            }
            await db.execute('COMMIT');
        } catch (inner) {
            await db.execute('ROLLBACK');
            throw inner;
        }
    } catch (e) { console.error(e); }
}

export async function createOrder(order, items) {
    const online = await isOnline().catch(() => false);
    const now = new Date().toISOString();
    const orderId = order.id || crypto.randomUUID();
    const newOrder = { status: 'PENDIENTE', ...order, id: orderId, created_at: now };

    if (online) {
        try {
            const cleanItems = items.map(i => ({
                order_id: i.order_id || orderId,
                asset_type: i.asset_type,
                asset_serial: i.asset_serial,
                quantity: i.quantity,
                condition_status: i.condition_status || 'BUENO',
                notes: i.notes || ''
            }));
            const payload = [{ 
                order: {
                    id: newOrder.id,
                    client_id: newOrder.client_id,
                    destination_client_id: newOrder.destination_client_id,
                    action: newOrder.action,
                    assigned_to: newOrder.assigned_to,
                    created_by: newOrder.created_by,
                    status: newOrder.status,
                    notes: newOrder.notes,
                    created_at: newOrder.created_at
                }, 
                items: cleanItems 
            }];
            const res = await importOrdersApi(payload);
            if (res.errors && res.errors.length > 0) throw new Error('MySQL Import Errors');
            await saveOrdersToLocal([{ ...newOrder, items, synced: 1 }]);
        } catch (e) {
            await handleOfflineOrder(newOrder, items, now);
        }
    } else {
        await handleOfflineOrder(newOrder, items, now);
    }
    
    // Apply immediate local impact if created as COMPLETADA (e.g. from Onboard Supervision)
    if (newOrder.status === 'COMPLETADA') {
        try {
            await applyLocalOrderImpact(orderId);
        } catch (e) {
            console.error('[ordersRepository] Failed to apply immediate impact for completed order:', e);
        }
    }

    return newOrder;
}

async function handleOfflineOrder(order, items, now) {
    await saveOrdersToLocal([{ ...order, items, synced: 0 }]);
    try {
        const { addPendingOperation } = await import('@/sync/syncService');
        await addPendingOperation({
            entity_type: 'installation_order',
            operation: 'insert',
            payload: { order: order, items: items },
            created_at: now
        });
    } catch (e) { console.error(e); }
}

export async function completeOrder(orderId, warehouseId = null) {
    const online = await isOnline().catch(() => false);
    const now = new Date().toISOString();

    if (online) {
        try {
            // SYNC items to server before completing, otherwise the server won't know which assets to transfer
            const localOrder = await loadLocalOrderById(orderId);
            if (localOrder && localOrder.items && localOrder.items.length > 0) {
                console.log('[ordersRepository] Pre-syncing items to server before completion:', orderId);
                try {
                    const cleanItems = localOrder.items.map(it => {
                        const cleaned = {
                            order_id: orderId,
                            asset_type: it.asset_type,
                            quantity: it.quantity,
                            notes: it.notes,
                            asset_id: it.asset_id,
                            asset_serial: it.asset_serial || it.serial
                        };
                        if (it.id) cleaned.id = it.id;
                        return cleaned;
                    });
                    
                    const payload = [{
                        order: {
                            id: orderId,
                            client_id: localOrder.client_id,
                            action: localOrder.action,
                            status: localOrder.status,
                            created_by: localOrder.created_by,
                            notes: localOrder.notes,
                            destination_client_id: localOrder.destination_client_id
                        },
                        items: cleanItems
                    }];
                    
                    await importOrdersApi(payload);
                } catch (syncErr) {
                    console.error('[ordersRepository] Pre-sync failed, but continuing with completion:', syncErr);
                }
            }

            const res = await completeOrderApi(orderId, warehouseId);
            if (res.status === 'error') {
                if (res.message && res.message.toLowerCase().includes('already completed')) {
                    console.warn('[ordersRepository] Order already completed on server, proceeding to apply local impact:', orderId);
                } else {
                    throw new Error(res.message);
                }
            }
            await applyLocalOrderImpact(orderId, warehouseId);
            await updateOrderLocal(orderId, { status: 'COMPLETADA', synced: 1 });
            return res;
        } catch (e) {
            return await handleOfflineCompletion(orderId, now);
        }
    } else {
        return await handleOfflineCompletion(orderId, now);
    }
}

async function handleOfflineCompletion(orderId, now) {
    await applyLocalOrderImpact(orderId);
    await updateOrderLocal(orderId, { status: 'COMPLETADA', synced: 0 });
    try {
        const { addPendingOperation } = await import('@/sync/syncService');
        await addPendingOperation({
            entity_type: 'installation_order',
            operation: 'complete',
            payload: { order_id: orderId, target_warehouse_id: warehouseId },
            created_at: now
        });
        return { status: 'success', message: 'Orden completada offline.' };
    } catch (e) { return { status: 'error', message: 'Error offline.' }; }
}

async function applyLocalOrderImpact(orderId, warehouseId = null) {
    try {
        console.log('[ordersRepository] Applying local impact for order:', orderId);
        const db = await getDb();
        const order = await loadLocalOrderById(orderId);
        if (!order || !order.items) {
            console.warn('[ordersRepository] Order or items not found for impact:', orderId);
            return;
        }

        const now = new Date().toISOString();

        for (const item of order.items) {
            const serial = item.asset_serial || item.serial;
            if (!serial) {
                console.warn('[ordersRepository] Item missing serial, skipping impact:', item);
                continue;
            }

            const action = order.action;
            let newStatus = null;
            let newClientId = null;
            let locationAction = action;

            // For CAMBIO_EQUIPO, each item has its own sub-action
            if (action === 'CAMBIO_EQUIPO') {
                let itemAction = 'INSTALAR';
                try {
                    const notesData = typeof item.notes === 'string' ? JSON.parse(item.notes) : item.notes;
                    if (notesData?.item_action) itemAction = notesData.item_action;
                } catch (e) { /* ignore parse errors */ }
                
                locationAction = itemAction;
                if (itemAction === 'RETIRAR') {
                    newStatus = 'EN_ALMACEN';
                    newClientId = null;
                } else {
                    newStatus = 'INSTALADO';
                    newClientId = order.client_id;
                }
            } else if (action === 'INSTALAR') {
                newStatus = 'INSTALADO';
                newClientId = order.client_id;
            } else if (action === 'RETIRAR') {
                newStatus = 'EN_ALMACEN';
                newClientId = null;
            } else if (action === 'MOVER') {
                newStatus = 'INSTALADO';
                newClientId = order.destination_client_id;
            }

            console.log(`[ordersRepository] Impact for ${serial}: Action=${action}, NewStatus=${newStatus}, NewClient=${newClientId}`);

            if (isMockDb()) {
                // Update Asset Status in Mock Store
                const assets = db._storage.get('assets') || [];
                let assetIdx = assets.findIndex(a => a.serial === serial);
                if (assetIdx === -1 && newStatus) {
                    const newAsset = { 
                        id: item.asset_id || `MOCK-${serial}`, 
                        serial: serial, 
                        type: item.asset_type || 'OTRO', 
                        status: newStatus, 
                        brand: 'N/A', 
                        model: 'N/A', 
                        created_at: now,
                        warehouse_id: action === 'INSTALAR' ? null : (warehouseId || order.origin_warehouse_id || null)
                    };
                    assets.push(newAsset);
                    assetIdx = assets.length - 1;
                    db._storage.set('assets', assets);
                } else if (assetIdx !== -1) {
                    assets[assetIdx] = {
                        ...assets[assetIdx],
                        status: newStatus || assets[assetIdx].status,
                        warehouse_id: newStatus === 'EN_ALMACEN' ? (warehouseId || order.origin_warehouse_id || assets[assetIdx].warehouse_id) : (action === 'INSTALAR' ? null : assets[assetIdx].warehouse_id)
                    };
                    db._storage.set('assets', assets);
                }

                // Update Current Location in Mock Store
                const locations = db._storage.get('current_asset_locations') || [];
                const locIdx = locations.findIndex(l => l.asset_serial === serial);
                const newLoc = {
                    asset_id: item.asset_id || (assetIdx !== -1 ? assets[assetIdx].id : `MOCK-${serial}`),
                    asset_serial: serial,
                    asset_type: item.asset_type,
                    client_id: newClientId,
                    action: locationAction,
                    created_at: now
                };
                if (locIdx !== -1) locations[locIdx] = newLoc;
                else locations.push(newLoc);
                db._storage.set('current_asset_locations', locations);
            } else {
                // SQLite (APK)
                if (newStatus) {
                    // Ensure the asset exists in the assets table before updating its status/warehouse
                    await db.run(`INSERT OR IGNORE INTO assets 
                        (id, serial, type, status, brand, model, warehouse_id, created_at) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
                        [item.asset_id || crypto.randomUUID(), serial, item.asset_type || 'OTRO', 'EN_ALMACEN', 'N/A', 'N/A', order.origin_warehouse_id || null, now]);

                    const warehouseUpdate = action === 'RETIRAR' ? ', warehouse_id = ?' : (action === 'INSTALAR' ? ', warehouse_id = NULL' : '');
                    const vals = [newStatus, serial];
                    if (action === 'RETIRAR') vals.splice(1, 0, order.origin_warehouse_id || null);

                    await db.run(`UPDATE assets SET status = ? ${warehouseUpdate} WHERE serial = ?`, vals);
                }
                await db.run(`INSERT OR REPLACE INTO current_asset_locations 
                    (asset_id, asset_serial, asset_type, client_id, action, created_at) 
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [item.asset_id, serial, item.asset_type, newClientId, locationAction, now]);
            }
        }
        console.log('[ordersRepository] Local impact applied successfully.');
    } catch (e) {
        console.error('[ordersRepository] Error applying local impact:', e);
    }
}

export async function updateOrderItem(itemId, data) {
    try {
        const db = await getDb();
        if (isMockDb()) {
            const items = db._storage.get('installation_order_items') || [];
            // Try matching by ID, or fallback to order_id + asset_type if ID is somehow still missing
            const updated = items.map(i => {
                const isMatch = i.id === itemId || (data.order_id && i.order_id === data.order_id && i.asset_type === data.asset_type);
                return isMatch ? { ...i, ...data } : i;
            });
            db._storage.set('installation_order_items', updated);
        } else {
            const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
            const vals = [...Object.values(data), itemId];
            await db.run(`UPDATE installation_order_items SET ${sets} WHERE id = ?`, vals);
        }
    } catch (e) { console.error(e); }
}

async function updateOrderLocal(id, data) {
    try {
        const db = await getDb();
        if (isMockDb()) {
            const orders = db._storage.get('installation_orders') || [];
            db._storage.set('installation_orders', orders.map(o => o.id === id ? { ...o, ...data } : o));
        } else {
            const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
            const vals = [...Object.values(data), id];
            await db.run(`UPDATE installation_orders SET ${sets} WHERE id = ?`, vals);
        }
    } catch (e) { console.error(e); }
}


async function handleOfflineStatusUpdate(orderId, data, now) {
    await updateOrderLocal(orderId, { ...data, synced: 0 });
    try {
        const { addPendingOperation } = await import('@/sync/syncService');
        await addPendingOperation({
            entity_type: 'installation_order',
            operation: 'update',
            payload: { order_id: orderId, ...data },
            created_at: now
        });
    } catch (e) { console.error(e); }
}

export async function createAsset(asset, locationId, isClient = false) {
    const online = await isOnline().catch(() => false);
    const now = new Date().toISOString();
    const assetId = asset.id || ("AST-" + Math.random().toString(36).substr(2, 9));
    
    const status = asset.status || (isClient ? 'INSTALADO' : 'EN_ALMACEN');
    const warehouseId = isClient ? null : locationId;
    const clientId = isClient ? locationId : null;

    const newAsset = { 
        ...asset, 
        id: assetId, 
        created_at: now, 
        status: status, 
        warehouse_id: warehouseId 
    };

    if (online) {
        try {
            const res = await importAssetsApi([newAsset]);
            if (res.errors && res.errors.length > 0) throw new Error('MySQL Import Errors');

            await saveAssetsToLocal([newAsset]); 
            await saveAssetLocationsToLocal([{
                ...newAsset,
                client_id: clientId,
                action: status
            }]);

            return newAsset;
        } catch (e) {
            console.error('[ordersRepository] Online asset creation failed, falling back to offline:', e);
            return await handleOfflineAssetCreation(newAsset, locationId, isClient, now);
        }
    } else {
        return await handleOfflineAssetCreation(newAsset, locationId, isClient, now);
    }
}

async function handleOfflineAssetCreation(asset, locationId, isClient, now) {
    const clientId = isClient ? locationId : null;
    try {
        await saveAssetsToLocal([asset]); 
        await saveAssetLocationsToLocal([{
            ...asset,
            client_id: clientId,
            action: asset.status,
            synced: 0
        }]);

        const { addPendingOperation } = await import('@/sync/syncService');
        await addPendingOperation({
            entity_type: 'asset',
            operation: 'insert',
            payload: { assets: [asset] },
            created_at: now
        });
        return asset;
    } catch (e) {
        console.error('[ordersRepository] Offline asset creation failed:', e);
        throw e;
    }
}

