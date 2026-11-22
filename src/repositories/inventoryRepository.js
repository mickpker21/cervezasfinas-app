import { supabase } from '@/supabaseClient';
import { isOnline, withTimeout } from '@/lib/network';
import { getDb, isMockDb } from '@/lib/localDb';
import { Capacitor } from '@capacitor/core';
import { base64ToBlob } from '@/lib/fileUtils';
import { logger } from '@/lib/logger';
import { getTodayMexico } from '@/lib/dateUtils';
import { safeUpsert } from '@/lib/dbHelper';

const isWeb = () => !Capacitor.isNativePlatform();

// Safe logger wrapper for APK compatibility
const safeLog = {
    info: (module, action, payload) => {
        try {
            logger?.info(module, action, payload);
        } catch (e) {
            console.log(`[${module}] ${action}`, payload);
        }
    },
    warn: (module, action, payload) => {
        try {
            logger?.warn(module, action, payload);
        } catch (e) {
            console.warn(`[${module}] ${action}`, payload);
        }
    },
    error: (module, action, payload) => {
        try {
            logger?.error(module, action, payload);
        } catch (e) {
            console.error(`[${module}] ${action}`, payload);
        }
    }
};


/**
 * Obtiene el inventario actual del camión/vendedor.
 * Retorna un objeto map: { 'SKU123': { quantity: 10, ... }, ... }
 * ESTRATEGIA: Offline First (o Network First con Fallback)
 */
export async function getTruckInventory(userId) {
    let online = false;
    try { online = await isOnline(); } catch (e) { online = false; }

    if (online) {
        // WEB & NATIVE Combined Logic (Simpler)
        try {
            // RACE: API vs 2s Timeout
            const data = await withTimeout(fetchInventoryOnline(userId), 2000).catch(() => null);

            if (data && data.length > 0) {
                // Fail-Safe: On error, hasPendingSales returns TRUE to protect local data
                const hasPending = await hasPendingSales(userId);

                safeLog.info('INVENTORY', 'STOCK_FETCH', { hasPending, source: 'ONLINE' });

                if (!hasPending) {
                    saveInventoryToLocal(userId, data).catch(e => safeLog.error('INVENTORY', 'BG_SAVE_FAIL', e));
                } else {
                    safeLog.warn('INVENTORY', 'OVERWRITE_BLOCKED', { reason: 'Pending sales detected' });
                }

                // Computed Read: Apply deductions to online snapshot
                const effectiveData = await applyPendingDeductions(userId, data);
                return arrayToMap(effectiveData);
            } else {
                logger.warn('INVENTORY', 'ONLINE_EMPTY', { msg: 'Keeping local if exists' });
                // Fallback to local
                const local = await loadLocalInventory(userId);
                if (Object.keys(local).length > 0) return local;
                return {};
            }
        } catch (e) {
            logger.warn('INVENTORY', 'ONLINE_FETCH_FAIL', e);
        }
    }

    // OFFLINE
    logger.info('INVENTORY', 'OFFLINE_MODE', { userId });
    return await loadLocalInventory(userId);
}

// Helper: Fetch from Supabase
async function fetchInventoryOnline(userId) {
    const { data, error } = await supabase
        .from('truck_inventory')
        .select('cve_marca, quantity')
        .eq('user_id', userId);

    if (error) throw error;
    return data || [];
}

// Helper: Convert array to map
function arrayToMap(data) {
    const inventory = {};
    if (data && Array.isArray(data)) {
        data.forEach(item => {
            if (item && item.cve_marca) {
                inventory[item.cve_marca] = item.quantity;
            }
        });
    }
    return inventory;
}

// Helper: Save to Local DB
async function saveInventoryToLocal(userId, items) {
    if (!items || items.length === 0) return; // Prevent saving empty list (wiping)
    try {
        const db = await getDb();
        const now = new Date().toISOString();

        if (isMockDb()) {
            db._storage.set(`truck_inventory_${userId}`, items);
            return;
        }

        // TRANSACTION
        await db.execute('BEGIN TRANSACTION');

        try {
            // Delete previous (safe inside tx)
            await db.run('DELETE FROM truck_inventory WHERE user_id = ?', [userId]);

            const statements = items.map(item => [
                userId,
                item.cve_marca,
                item.quantity,
                now
            ]);

            const BATCH_SIZE = 100;
            for (let i = 0; i < statements.length; i += BATCH_SIZE) {
                const chunk = statements.slice(i, i + BATCH_SIZE);
                const placeholders = chunk.map(() => `(?, ?, ?, ?)`).join(',');
                const values = chunk.flat();
                await db.run(`INSERT INTO truck_inventory(user_id, cve_marca, quantity, updated_at) VALUES ${placeholders} `, values);
            }

            await db.execute('COMMIT');
            // console.log(`[inventoryRepo] Saved ${ items.length } items for user ${ userId }`);

        } catch (innerError) {
            console.error('[inventoryRepo] Transaction failed, rolling back:', innerError);
            await db.execute('ROLLBACK');
        }

    } catch (e) {
        console.error('[inventoryRepo] Error saving to local:', e);
    }
}

// Helper: Load from Local DB
async function loadLocalInventory(userId) {
    try {
        const db = await getDb();
        if (isMockDb()) {
            const items = db._storage.get(`truck_inventory_${userId}`) || [];
            return arrayToMap(items);
        }

        const res = await db.query('SELECT cve_marca, quantity FROM truck_inventory WHERE user_id = ?', [userId]);
        const items = res.values || [];

        // STRATEGY: Immediate Deduction + Pending Ops for Sync
        // Since we now deduct stock IMMEDIATELY on sale (via deductLocalStock), 
        // we do NOT apply pending deductions when loading LOCAL inventory.
        // The local DB already has the deductions applied.
        // We ONLY apply deductions to ONLINE data (see getTruckInventory line 39).

        console.log(`[INVENTORY] Loaded ${items.length} items from local DB (already deducted)`);
        return arrayToMap(items);
    } catch (e) {
        console.error('[inventoryRepo] Error loading local:', e);
        return {};
    }
}


/**
 * Registra una CARGA o DESCARGA de inventario al camión.
 * Solo debe ser llamado por un ALMACENISTA (siempre Online).
 */
export async function registerLoad(driverId, items, auditorId, type = 'LOAD') {
    if (!items || items.length === 0) return;

    // 1. Registrar en truck_loads (Log)
    const loadLogs = items.map(item => ({
        driver_id: driverId,
        loaded_by: auditorId,
        cve_marca: item.sku,
        quantity_change: item.qty,
        type: type
    }));

    const { error: logError } = await supabase.from('truck_loads').insert(loadLogs);
    if (logError) throw logError;

    // 2. Actualizar truck_inventory (Upsert)
    for (const item of items) {
        const { data: current } = await supabase
            .from('truck_inventory')
            .select('quantity')
            .eq('user_id', driverId)
            .eq('cve_marca', item.sku)
            .maybeSingle();

        const currentQty = current ? current.quantity : 0;
        const newQty = currentQty + item.qty;

        const { error: upsertError } = await supabase
            .from('truck_inventory')
            .upsert({
                user_id: driverId,
                cve_marca: item.sku,
                quantity: newQty,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id, cve_marca' });

        if (upsertError) console.error('Error updating inventory item', item, upsertError);
    }

    return true;
}

/**
 * Realiza una auditoría de inventario.
 */
export async function performAudit(driverId, auditorId, counts) {
    // 1. Obtener inventario actual del sistema
    const systemInventory = await getTruckInventory(driverId); // Can rely on online fetch within this

    // Fix Timezone: Use Mexico Time
    const nowMx = new Date().toLocaleString('en-CA', { timeZone: 'America/Mexico_City', hour12: false }).replace(', ', 'T');

    // 2. Preparar registros de auditoría
    const auditRecords = counts.map(item => {
        const systemQty = systemInventory[item.sku] || 0;
        return {
            driver_id: driverId,
            auditor_id: auditorId,
            cve_marca: item.sku,
            system_qty: systemQty,
            physical_qty: item.physicalQty,
            created_at: nowMx // Force Mexico Time
        };
    });

    // 3. Insertar auditoría
    const { error } = await supabase
        .from('inventory_audits')
        .insert(auditRecords);

    if (error) throw error;

    return auditRecords;
}

export async function adjustInventoryFromAudit(auditRecords) {
    const nowMx = new Date().toLocaleString('en-CA', { timeZone: 'America/Mexico_City', hour12: false }).replace(', ', 'T');

    for (const record of auditRecords) {
        if (record.system_qty !== record.physical_qty) {
            await supabase
                .from('truck_inventory')
                .upsert({
                    user_id: record.driver_id,
                    cve_marca: record.cve_marca,
                    quantity: record.physical_qty,
                    updated_at: nowMx
                }, { onConflict: 'user_id, cve_marca' });

            await supabase.from('truck_loads').insert({
                driver_id: record.driver_id,
                loaded_by: record.auditor_id,
                cve_marca: record.cve_marca,
                quantity_change: record.physical_qty - record.system_qty,
                type: 'ADJUSTMENT',
                created_at: nowMx
            });
        }
    }
}

/**
 * Crea una solicitud de carga de inventario.
 * OFFLINE CAPABLE
 */
export async function createStockRequest(driverId, items) {
    if (!items || items.length === 0) return;

    const online = await isOnline().catch(() => false);
    const now = new Date().toISOString();
    // Generate UUID if we can, or let sync service handle it. 
    // Ideally we generate UUID here for consistency.
    const tempId = crypto.randomUUID();

    const request = {
        id: tempId,
        driver_id: driverId,
        items: items,
        status: 'PENDING',
        created_at: now,
        updated_at: now
    };

    if (online) {
        const { error } = await supabase.from('stock_requests').insert(request);
        if (error) throw error;
        // Save to local for history view (synced=1 because we just sent it)
        await saveStockRequestsToLocal([{ ...request, synced: 1 }]);
        return true;
    }

    // OFFLINE - Store via unified pending queue
    await saveStockRequestsToLocal([{ ...request, synced: 0 }]);

    try {
        const { addPendingOperation } = await import('@/sync/syncService');
        await addPendingOperation({
            entity_type: 'stock_request',
            operation: 'insert',
            payload: request,
            created_at: now
        });
        // Dispatch explicit network refresh to attempt immediate sync if connection alive
        window.dispatchEvent(new CustomEvent('network-status-changed'));
    } catch (e) {
        logger.error('INVENTORY', 'PENDING_OP_FAIL', e);
    }

    safeLog.info('INVENTORY', 'STOCK_REQUEST_OFFLINE', { id: request.id });

    return true;
}

/**
 * Obtiene solicitudes de carga pendientes.
 * OFFLINE CAPABLE (only for driver view, warehouse view is online only generally)
 */
export async function getPendingStockRequests(driverId = null) {
    // If no driverId, it implies Warehouse View (ALL requests) -> Requires Online usually
    if (!driverId) {
        // Warehouse view logic (Online only for now as defined in scope)
        const { data, error } = await supabase.from('stock_requests')
            .select(`id, driver_id, status, items, created_at, profiles: driver_id(name, email, role)`)
            .eq('status', 'PENDING')
            .order('created_at', { ascending: true });
        if (error) { console.error(error); return []; }
        return data;
    }

    // Driver View -> Offline Capable
    let online = false;
    try { online = await isOnline(); } catch (e) { online = false; }

    if (online) {
        try {
            const { data, error } = await supabase
                .from('stock_requests')
                .select(`id, driver_id, status, items, created_at, updated_at`)
                .eq('driver_id', driverId)
                .eq('status', 'PENDING')
                .order('created_at', { ascending: true });

            if (data) {
                // Save to local (replace pending)
                // We might keep others? We should merge.
                // For MVP: Fetching pending is small.
                await saveStockRequestsToLocal(data);
                return data;
            }
        } catch (e) { console.error(e); }
    }

    // Local
    return await loadLocalStockRequests(driverId, 'PENDING');
}

export async function updateStockRequestStatus(requestId, status, items = null) {
    const payload = { status, updated_at: new Date().toISOString() };
    if (items) { payload.items = items; }
    const { error } = await supabase.from('stock_requests').update(payload).eq('id', requestId);
    if (error) throw error;
    return true;
}

/**
 * Obtiene el historial.
 * OFFLINE CAPABLE
 */
export async function getStockRequestHistory(driverId) {
    let online = false;
    try { online = await isOnline(); } catch (e) { online = false; }

    if (online) {
        try {
            const { data, error } = await supabase
                .from('stock_requests')
                .select(`id, status, items, created_at, updated_at`)
                .eq('driver_id', driverId)
                .in('status', ['COMPLETED', 'REJECTED'])
                .order('updated_at', { ascending: false })
                .limit(20);

            if (data) {
                await saveStockRequestsToLocal(data);
                return data;
            }
        } catch (e) { console.error(e); }
    }

    // Local
    return await loadLocalStockRequests(driverId, ['COMPLETED', 'REJECTED']); // This generic loader needs update
}

// --- Local Helpers for Requests --- //

async function saveStockRequestsToLocal(requests) {
    if (!requests || requests.length === 0) return;
    try {
        // ENTERPRISE FIX: Use safeUpsert loop instead of bulk delete/insert
        // This ensures we don't overwrite dirty records (synced=0) with stale data
        for (const req of requests) {
            await safeUpsert('stock_requests', req, 'id');
        }
    } catch (e) {
        logger.error('INVENTORY', 'SAVE_REQUESTS_FAIL', e);
    }
}

async function loadLocalStockRequests(driverId, statusFilter) {
    try {
        const db = await getDb();
        if (isMockDb()) {
            const all = db._storage.get('stock_requests') || [];
            return all.filter(r => r.driver_id === driverId && checkStatus(r.status, statusFilter));
        }

        let query = 'SELECT * FROM stock_requests WHERE driver_id = ?';
        const params = [driverId];

        if (Array.isArray(statusFilter)) {
            const flags = statusFilter.map(() => '?').join(',');
            query += ` AND status IN(${flags})`;
            params.push(...statusFilter);
        } else if (statusFilter) {
            query += ` AND status = ? `;
            params.push(statusFilter);
        }

        query += ' ORDER BY created_at DESC';

        const res = await db.query(query, params);
        const rows = res.values || [];
        return rows.map(r => ({
            ...r,
            items: r.items ? JSON.parse(r.items) : []
        }));
    } catch (e) {
        console.error('[inventoryRepo] Error loading requests local:', e);
        return [];
    }
}

function checkStatus(status, filter) {
    if (Array.isArray(filter)) return filter.includes(status);
    return status === filter;
}

export async function checkDailyAudit(driverId) {
    const todayStr = getTodayMexico(); // Mexico timezone
    const start = `${todayStr}T00:00:00`;
    const end = `${todayStr}T23:59:59`;

    const { count, error } = await supabase
        .from('inventory_audits')
        .select('id', { count: 'exact', head: true })
        .eq('driver_id', driverId)
        .gte('created_at', start)
        .lte('created_at', end);

    if (error) {
        // Fix: Log the error message properly
        console.error('Error checking daily audit', error);
        return false;
    }
    return count > 0;
}

async function applyPendingDeductions(userId, onlineData) {
    // DEBUG: Start
    console.log(`[DEBUG] applyPendingDeductions START. User: ${userId}, DataItems: ${onlineData?.length || 0}`);

    if (!onlineData || !Array.isArray(onlineData)) {
        console.warn('[inventoryRepo] Invalid onlineData passed to applyPendingDeductions, returning empty array.');
        return [];
    }

    try {
        const db = await getDb();
        let pending = [];

        // 1. Get Pending Operations (Local)
        if (isMockDb()) {
            const rawOps = db._storage.get('pending_operations') || [];
            pending = rawOps.map(op => op.payload || {});
        } else {
            const res = await db.query("SELECT payload FROM pending_operations WHERE entity_type = 'direct_sale'");
            pending = (res.values || []).map(row => {
                try {
                    return typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
                } catch (e) { return null; }
            }).filter(p => p !== null);
        }

        console.log(`[DEBUG] Raw Pending Ops found: ${pending.length}`);

        // 2. Build Deduction Map
        const deductions = {}; // SKU -> Qty

        for (const op of pending) {
            try {
                // Defensive Payload Parsing
                // V1: { sale: { user_id, ... }, items: [...] }
                // V2: { user_id, ..., items: [...] } (Flat)
                let opUserId = null;
                let opItems = null;

                if (op.sale && typeof op.sale === 'object') {
                    opUserId = op.sale.user_id;
                } else {
                    opUserId = op.user_id;
                }

                // Strict User Filtering
                // FORCE STRING COMPARISON
                if (String(opUserId) !== String(userId)) {
                    console.log(`[DEBUG] Skipping op (User mismatch). OpUser: ${opUserId}, Target: ${userId}`);
                    continue;
                }

                opItems = op.items;
                if (!Array.isArray(opItems)) {
                    console.warn('[DEBUG] Pending op has invalid items array:', op);
                    continue;
                }

                // Accumulate Deductions
                opItems.forEach(item => {
                    if (!item.cve_marca) return;
                    const sku = item.cve_marca;
                    const qty = Number(item.quantity || 0);
                    deductions[sku] = (deductions[sku] || 0) + qty;
                });

            } catch (innerOpError) {
                console.error('[inventoryRepo] Error processing pending op deduction:', innerOpError);
                // Continue to next op, don't break entire flow
            }
        }

        // 3. Apply to Online Data
        if (Object.keys(deductions).length === 0) {
            console.log('[DEBUG] No deductions found for this user.');
            return onlineData;
        }

        console.log(`[STOCK] Pending deductions applied for User ${userId}:`, deductions);

        return onlineData.map(item => {
            const deduct = deductions[item.cve_marca] || 0;
            if (deduct > 0) {
                const newQty = Math.max(0, item.quantity - deduct);
                console.log(`[DEBUG] Applied deduction for SKU ${item.cve_marca}: ${item.quantity} -> ${newQty} (Deduct: ${deduct})`);
                return { ...item, quantity: newQty };
            }
            return item;
        });

    } catch (e) {
        console.error('[inventoryRepo] Critical error applying deductions:', e);
        // Fallback: Return original data to avoid breaking UI, though stock might be wrong.
        return onlineData;
    }
}

async function hasPendingSales(userId) {
    try {
        const db = await getDb();
        let pending = [];

        if (isMockDb()) {
            pending = db._storage.get('pending_operations') || [];
        } else {
            // We must fetch payload to check user_id. 
            // Querying count(*) is insufficient if multiple users share the device (rare but possible) 
            // or to be strictly correct as per requirements.
            const res = await db.query("SELECT payload FROM pending_operations WHERE entity_type = 'direct_sale'");
            pending = (res.values || []).map(row => {
                try {
                    return typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
                } catch (e) { return null; }
            }).filter(p => p !== null);
        }

        // Check if ANY of the pending ops belongs to this user
        const hasUserPending = pending.some(op => {
            let opUserId = null;
            if (op.sale && typeof op.sale === 'object') {
                opUserId = op.sale.user_id;
            } else {
                opUserId = op.user_id;
            }
            return String(opUserId) === String(userId);
        });

        if (hasUserPending) {
            console.log(`[STOCK] User ${userId} has pending sales. Locking local overwrite.`);
        }

        return hasUserPending;

    } catch (e) {
        logger.error('INVENTORY', 'PENDING_CHECK_FATAL', e);
        // Fail-Safe: Locked Mode
        // If we can't verify pending, assume we HAVE pending to prevent overwriting local data.
        return true;
    }
}

/**
 * Enterprise Inventory Audit
 * Checks for negative stock, corrupted pending ops, etc.
 */
export async function validateInventoryState(userId) {
    const report = { valid: true, issues: [] };

    // 1. Check Negative Stock
    const local = await loadLocalInventory(userId);
    let negativeStockCount = 0;
    Object.entries(local).forEach(([sku, qty]) => {
        if (qty < 0) {
            negativeStockCount++;
            report.issues.push({ type: 'NEGATIVE_STOCK', sku, qty });
            logger.error('AUDIT', 'NEGATIVE_STOCK', { sku, qty, userId });
        }
    });

    if (negativeStockCount > 0) report.valid = false;

    // 2. Check Pending Ops Integrity & Stalls
    try {
        const db = await getDb();
        let pending = [];
        if (isMockDb()) {
            pending = db._storage.get('pending_operations') || [];
        } else {
            const res = await db.query('SELECT * FROM pending_operations');
            pending = res.values || [];
        }

        const STALL_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
        const now = new Date().getTime();

        pending.forEach(op => {
            const created = new Date(op.created_at).getTime();
            const age = now - created;

            if (age > STALL_THRESHOLD_MS) {
                report.valid = false;
                report.issues.push({ type: 'STALE_PENDING_OP', id: op.id, ageHours: age / 3600000 });
                logger.warn('AUDIT', 'STALE_PENDING_OP', { id: op.id, ageHours: (age / 3600000).toFixed(1) });
            }
        });

        if (pending.length > 0) {
            logger.info('AUDIT', 'PENDING_OPS_STATUS', { count: pending.length, stale: report.issues.filter(i => i.type === 'STALE_PENDING_OP').length });
        }

    } catch (e) {
        logger.error('AUDIT', 'PENDING_CHECK_FAIL', e);
    }

    return report;
}
