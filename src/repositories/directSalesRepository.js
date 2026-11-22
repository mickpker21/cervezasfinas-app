import { supabase } from '@/supabaseClient';
import { getTruckInventory } from './inventoryRepository';
import { isOnline } from '@/lib/network';
import { getDb, isMockDb } from '@/lib/localDb';
import { awardDirectSalePoints } from '@/lib/directSalePoints';

async function queueDirectSalePointsAward(saleId) {
    try {
        const { addPendingOperation } = await import('@/sync/syncService');
        await addPendingOperation({
            entity_type: 'direct_sale_points',
            operation: 'award',
            payload: { sale_id: saleId },
            created_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('[directSalesRepository] No se pudo encolar la acreditación de puntos:', error);
    }
}

/**
 * Crea una venta directa (Autoventa).
 * OFFLINE CAPABLE
 */
export async function createDirectSale(userId, client, items, totalAmount, discountDetails = {}) {
    const online = await isOnline().catch(() => false);
    // Use Mexico Time for created_at to avoid UTC shift
    const now = new Date().toLocaleString('en-CA', { timeZone: 'America/Mexico_City', hour12: false }).replace(', ', 'T');
    const saleId = crypto.randomUUID();

    // 1. Verificar Stock Local (Optimistic)
    // El repo de inventario ya maneja fallback local, así que esto valida contra lo que el dispositivo 'cree' que tiene.
    const currentStock = await getTruckInventory(userId);
    const insufficient = [];

    if (items && Array.isArray(items)) {
        items.forEach(item => {
            const available = currentStock[item.cve_marca] || 0;
            if (available < item.quantity) {
                insufficient.push(`${item.des_marca} (Stock: ${available}, Req: ${item.quantity})`);
            }
        });
    }

    if (insufficient.length > 0) {
        throw new Error(`Stock insuficiente para: ${insufficient.join(', ')}`);
    }

    const salePayload = {
        id: saleId, // Generate ID explicitly
        user_id: userId,
        client_id: client.id,
        total_amount: totalAmount,
        status: 'COMPLETED',
        payment_method: 'CASH',
        created_at: now,
        synced: 1,
        gec_discount: discountDetails.gec || 0,
        promo_discount: discountDetails.promo || 0,
        cargo: discountDetails.cargo || null, // Capture Cargo (Text)
        // Snapshot for Offline/Mock usage
        clients: {
            name: client.name || 'Cliente',
            client_code: client.client_code || '---'
        }
    };

    if (online) {
        try {
            // 🔍 DEBUG: Log del payload ANTES de enviar a Supabase
            console.log('═══════════════════════════════════════════════════');
            console.log('📤 [SUPABASE INSERT] Preparando envío a Supabase');
            console.log('═══════════════════════════════════════════════════');
            console.log('📋 PAYLOAD DE VENTA:');
            console.log('  Sale ID:', saleId);
            console.log('  User ID:', userId);
            console.log('  Client ID:', client.id);
            console.log('  Total Amount:', totalAmount);
            console.log('  Payment Method: CASH');
            console.log('  Status: COMPLETED');
            console.log('  Created At:', now);
            console.log('');
            console.log('💰 DESCUENTOS Y CARGOS:');
            console.log('  gec_discount:', discountDetails.gec || 0, typeof (discountDetails.gec || 0));
            console.log('  promo_discount:', discountDetails.promo || 0, typeof (discountDetails.promo || 0));
            console.log('  cargo:', discountDetails.cargo || null, typeof (discountDetails.cargo || null));
            console.log('');
            console.log('📦 ITEMS:', items.length);
            items.forEach((item, idx) => {
                console.log(`  [${idx + 1}]`, item.cve_marca, `x${item.quantity}`, `@$${item.price}`);
            });
            console.log('═══════════════════════════════════════════════════');

            // A) Insert Sale
            const { error: saleError } = await supabase
                .from('direct_sales')
                .insert({
                    id: saleId,
                    user_id: userId,
                    client_id: client.id,
                    total_amount: totalAmount,
                    status: 'COMPLETED',
                    payment_method: 'CASH',
                    gec_discount: discountDetails.gec || 0,
                    promo_discount: discountDetails.promo || 0,
                    cargo: discountDetails.cargo || null, // Insert Cargo
                    created_at: now
                });

            if (saleError) {
                console.error('❌ [SUPABASE ERROR] Falló el INSERT:');
                console.error('  Message:', saleError.message);
                console.error('  Code:', saleError.code);
                console.error('  Details:', saleError.details);
                console.error('  Hint:', saleError.hint);
                console.error('  Full Error:', JSON.stringify(saleError, null, 2));
                throw saleError;
            }

            console.log('✅ [SUPABASE SUCCESS] Venta guardada correctamente');
            console.log('   Sale ID:', saleId);

            // B) Insert Items
            const saleItems = items.map(item => ({
                sale_id: saleId,
                cve_marca: item.cve_marca,
                quantity: item.quantity,
                unit_price: item.price,
                total_price: item.price * item.quantity,
                des_marca: item.des_marca // Optional, depending on schema
            }));

            // Filter out fields not in DB if strict, but 'des_marca' is usually separate. 
            // Assuming DB schema 'direct_sales_items' has cve_marca, quantity, unit_price, total_price.
            // We TRY to save des_marca too if the column exists (it helps reports).
            // const dbItems = saleItems.map(({ des_marca, ...rest }) => rest);
            const dbItems = saleItems;

            const { error: itemsError } = await supabase
                .from('direct_sales_items')
                .insert(dbItems);

            if (itemsError) throw itemsError;

            // C) Deduct Stock (Supabase - Atomic RPC)
            for (const item of items) {
                await supabase.rpc('decrement_stock', {
                    p_user_id: userId,
                    p_sku: item.cve_marca,
                    p_qty: item.quantity
                });
            }

            // Save to Local for History/Consistency
            await saveDirectSaleToLocal(salePayload, items);

            // Optimistic Local Stock Update: Always update local stock to ensure consistency
            // nicely handles the case where getTruckInventory fallback is needed immediately after.
            await deductLocalStock(userId, items);

            // Direct sales live in Supabase, while the customer points ledger is
            // in MySQL. Award through the trusted API and queue a retry on failure.
            try {
                await awardDirectSalePoints(saleId);
            } catch (pointsError) {
                console.error('[directSalesRepository] Acreditación pendiente para venta directa:', pointsError);
                await queueDirectSalePointsAward(saleId);
            }

            return { id: saleId, offline: false };

        } catch (e) {
            console.warn('Online sale failed, falling back to offline:', e);
            // Fallthrough to offline
        }
    }

    console.log('[createDirectSale] Discount Payload:', discountDetails);

    // OFFLINE
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔴 [OFFLINE SALE] Iniciando guardado offline de venta');
    console.log('═══════════════════════════════════════════════════════');
    console.log('[OFFLINE SALE] 1️⃣ Sale ID:', saleId);
    console.log('[OFFLINE SALE] 1️⃣ Client:', client.client_code || client.id);
    console.log('[OFFLINE SALE] 1️⃣ Items:', items.length);

    salePayload.synced = 0;
    await saveDirectSaleToLocal(salePayload, items);
    console.log('[OFFLINE SALE] 2️⃣ ✅ Guardada en SQLite local');


    // Update Local Stock Immediately (Critical for subsequent offline sales)
    console.log('[OFFLINE SALE] 3️⃣ Deduciendo stock local...');
    try {
        await deductLocalStock(userId, items);
        console.log('[OFFLINE SALE] 3️⃣ ✅ Stock deducido correctamente');
    } catch (stockError) {
        // If stock deduction fails, we should NOT complete the sale
        console.error('[OFFLINE SALE] ❌ Stock deduction failed. Aborting sale.', stockError);
        throw new Error('Failed to update inventory. Sale aborted.');
    }

    // Add Pending Op
    console.log('[OFFLINE SALE] 4️⃣ Agregando a pending_operations...');
    try {
        const { addPendingOperation } = await import('@/sync/syncService');
        await addPendingOperation({
            entity_type: 'direct_sale',
            operation: 'insert',
            payload: { sale: salePayload, items: items },
            created_at: now
        });
        console.log('[OFFLINE SALE] 4️⃣ ✅ Operación agregada a cola de sincronización');
        console.log('[OFFLINE SALE] 📋 Entity Type:', 'direct_sale');
        console.log('[OFFLINE SALE] 📋 Payload Preview:', {
            saleId: salePayload.id,
            items: items.length,
            total: salePayload.total_amount
        });
    } catch (e) {
        console.error('[OFFLINE SALE] 4️⃣ ❌ ERROR al agregar pending op:', e);
        console.error('[OFFLINE SALE] 4️⃣ ⚠️ CRÍTICO: La venta NO se sincronizará!');
        throw e; // FAIL FAST - don't let sale complete if can't queue
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ [OFFLINE SALE] Venta guardada completamente');
    console.log('⏳ Se sincronizará cuando haya conexión');
    console.log('═══════════════════════════════════════════════════════');

    return { id: saleId, offline: true };
}

/**
 * Obtiene historial de ventas directas de un usuario (para reporte final).
 * OFFLINE CAPABLE
 */
export async function getDailySales(userId, dateStr) {
    let online = false;
    try { online = await isOnline(); } catch (e) { online = false; }

    const localSales = await loadLocalDailySales(userId, dateStr);

    if (online) {
        try {
            const nextDay = new Date(dateStr);
            nextDay.setDate(nextDay.getDate() + 1);
            const nextDayStr = nextDay.toISOString().split('T')[0];
            const start = `${dateStr}T00:00:00`;
            const end = `${nextDayStr}T23:59:59`;

            const { data: serverSales, error } = await supabase
                .from('direct_sales')
                .select(`*, direct_sales_items (*)`)
                .eq('user_id', userId)
                .gte('created_at', start)
                .lte('created_at', end)
                .order('created_at', { ascending: false });

            if (!error && serverSales) {
                // Hydrate Client Names for Online Data
                const { getLocalClients, getClients } = await import('./clientsRepository');
                const localClientsList = await getLocalClients();
                let clientsData = localClientsList;
                if (!clientsData || clientsData.length === 0) {
                    clientsData = await getClients();
                }
                const clientMap = {};
                clientsData?.forEach(c => clientMap[c.id] = c);

                const serverSalesHydrated = serverSales.map(s => {
                    const client = clientMap[s.client_id];
                    const displayName = client ? (client.business_name || client.name || 'Sin Nombre') : `Cliente ${s.client_id}`;
                    return {
                        ...s,
                        clients: client ? { name: displayName, client_code: client.client_code } : { name: displayName, client_code: '---' }
                    };
                });

                // MERGE STRATEGY: 
                // 1. Use Local as Base (contains unsynced).
                // 2. Update/Add from Server (contains synced from other devices or updated status).
                const salesMap = new Map();
                localSales.forEach(s => salesMap.set(s.id, s));

                serverSalesHydrated.forEach(s => {
                    salesMap.set(s.id, s); // Server overwrites local if exists (updates status)
                });

                // Save fetched server sales to local for future offline usage
                for (const s of serverSalesHydrated) {
                    try {
                        await saveDirectSaleToLocal(s, s.direct_sales_items || []);
                    } catch (err) { console.warn('Error syncing back to local:', err); }
                }

                return Array.from(salesMap.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }
        } catch (e) {
            console.error('Error fetching online sales, using local only:', e);
        }
    }

    return localSales;
}

// --- Local Helpers ---

async function saveDirectSaleToLocal(sale, items) {
    try {
        console.log(`[salesRepo] Saving Local Sale: ${sale.id}, Synced: ${sale.synced}`);
        const db = await getDb();

        // WEB FALLBACK (Mock DB)
        if (isMockDb()) {
            const sales = db._storage.get('direct_sales') || [];
            // Remove existing if replace (simple filter)
            const filteredSales = sales.filter(s => s.id !== sale.id);
            db._storage.set('direct_sales', [...filteredSales, sale]);

            // Save Items
            const allItems = db._storage.get('direct_sales_items') || [];
            const otherItems = allItems.filter(i => i.sale_id !== sale.id);

            const newItems = items.map(item => ({
                id: crypto.randomUUID(),
                sale_id: sale.id,
                cve_marca: item.cve_marca,
                quantity: item.quantity,
                unit_price: Number(item.price || 0),
                total_price: Number(item.price || 0) * Number(item.quantity || 0),
                des_marca: item.des_marca || 'Sin Nombre'
            }));

            db._storage.set('direct_sales_items', [...otherItems, ...newItems]);
            return;
        }

        // Insert Sale
        await db.run(`INSERT OR REPLACE INTO direct_sales 
            (id, user_id, client_id, total_amount, status, payment_method, created_at, synced, gec_discount, promo_discount, cargo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [sale.id, sale.user_id, sale.client_id, sale.total_amount, sale.status, sale.payment_method, sale.created_at, sale.synced, sale.gec_discount || 0, sale.promo_discount || 0, sale.cargo || null]
        );
        console.log(`[salesRepo] Local Sale Header saved. ID: ${sale.id}`);

    } catch (e) {
        console.error('[salesRepository] Error saving local sale header:', e);
        throw e; // Stop if header fails
    }

    // Insert Items
    console.log('[DEBUG] Saving items:', items.length);
    for (const item of items) {
        try {
            const itemId = crypto.randomUUID();
            const unitPrice = Number(item.price || 0);
            const total = unitPrice * Number(item.quantity || 0);

            await db.run(`INSERT OR REPLACE INTO direct_sales_items
                (id, sale_id, cve_marca, quantity, unit_price, total_price, des_marca)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [itemId, sale.id, item.cve_marca, item.quantity, unitPrice, total, item.des_marca || 'Sin Nombre']
            );
        } catch (itemErr) {
            console.error('[salesRepository] Error saving item:', item, itemErr);
        }
    }

    console.log('[DEBUG] Scale saved successfully');
}

async function deductLocalStock(userId, items) {
    try {
        console.log('[salesRepository] ✅ Deducting local stock IMMEDIATELY for instant UI update.');
        const db = await getDb();

        if (isMockDb()) {
            // Mock DB: Update in-memory
            const key = `truck_inventory_${userId}`;
            const stockItems = db._storage.get(key) || [];
            const stockMap = {};
            stockItems.forEach(i => stockMap[i.cve_marca] = i);

            items.forEach(soldItem => {
                if (stockMap[soldItem.cve_marca]) {
                    const currentQty = Number(stockMap[soldItem.cve_marca].quantity || 0);
                    const newQty = Math.max(0, currentQty - soldItem.quantity);
                    stockMap[soldItem.cve_marca].quantity = newQty;
                    console.log(`[STOCK] ✅ Deducted ${soldItem.cve_marca}: ${currentQty} → ${newQty}`);
                } else {
                    console.warn(`[STOCK] ⚠️ SKU ${soldItem.cve_marca} not found in inventory. Skipping.`);
                }
            });

            db._storage.set(key, Object.values(stockMap));
            console.log('[salesRepository] ✅ Mock inventory updated successfully.');
            return;
        }

        // SQLite: Update database
        for (const item of items) {
            const res = await db.query(
                'SELECT quantity FROM truck_inventory WHERE user_id = ? AND cve_marca = ?',
                [userId, item.cve_marca]
            );

            if (res.values && res.values.length > 0) {
                const current = Number(res.values[0].quantity);
                const newQty = Math.max(0, current - item.quantity);

                await db.run(
                    'UPDATE truck_inventory SET quantity = ?, updated_at = ? WHERE user_id = ? AND cve_marca = ?',
                    [newQty, new Date().toISOString(), userId, item.cve_marca]
                );

                // Verify the update
                const verify = await db.query(
                    'SELECT quantity FROM truck_inventory WHERE user_id = ? AND cve_marca = ?',
                    [userId, item.cve_marca]
                );
                const verifiedQty = verify.values?.[0]?.quantity;
                console.log(`[STOCK] ✅ Deducted ${item.cve_marca}: ${current} → ${verifiedQty} (Sold: ${item.quantity})`);
            } else {
                console.warn(`[STOCK] ⚠️ SKU ${item.cve_marca} not found in local inventory. Skipping deduction.`);
            }
        }

        console.log('[salesRepository] ✅ Local inventory updated successfully.');

    } catch (e) {
        console.error('[salesRepository] ❌ CRITICAL ERROR deducting local stock:', e);
        // Propagate error to prevent sale completion if stock update fails
        throw new Error(`Failed to update inventory: ${e.message}`);
    }
}

async function loadLocalDailySales(userId, dateStr) {
    try {
        const db = await getDb();

        // WEB FALLBACK (Mock DB)
        if (isMockDb()) {
            const allSales = db._storage.get('direct_sales') || [];
            const allItems = db._storage.get('direct_sales_items') || [];

            // Robust date filter (extract date portion to avoid timezone issues)
            const sales = allSales.filter(s => {
                if (s.user_id !== userId) return false;
                // Extract YYYY-MM-DD from ISO string
                const saleDate = s.created_at ? s.created_at.split('T')[0] : '';
                return saleDate === dateStr;
            }).sort((a, b) => b.created_at.localeCompare(a.created_at));

            // Hydrate
            sales.forEach(sale => {
                sale.direct_sales_items = allItems.filter(i => i.sale_id === sale.id);
                // Use stored client snapshot if available, else fallback
                if (!sale.clients) {
                    sale.clients = { name: 'Cliente Mock', client_code: 'MOCK' };
                }
            });

            return sales;
        }

        // SQLite: Fetch with wider window to account for Timezones (UTC vs Local)
        // We look from [Date-1] to [Date+1] in SQL, then filter exactly in JS
        const targetDate = new Date(dateStr + 'T00:00:00');
        const prevDay = new Date(targetDate); prevDay.setDate(prevDay.getDate() - 1);
        const nextDay = new Date(targetDate); nextDay.setDate(nextDay.getDate() + 2); // +2 to be safe covering full next day

        const startSql = prevDay.toISOString(); // e.g. 2026-01-17T...
        const endSql = nextDay.toISOString();   // e.g. 2026-01-20T...

        const res = await db.query(`
            SELECT * FROM direct_sales 
            WHERE user_id = ? AND created_at >= ? AND created_at <= ? 
            ORDER BY created_at DESC`,
            [userId, startSql, endSql]
        );
        let sales = res.values || [];

        // STRICT JS FILTER (Local Timezone)
        // Check if the UTC timestamp in 'created_at' falls on 'dateStr' in device local time
        const [tYear, tMonth, tDay] = dateStr.split('-').map(Number);

        sales = sales.filter(s => {
            const d = new Date(s.created_at);
            return d.getFullYear() === tYear &&
                (d.getMonth() + 1) === tMonth &&
                d.getDate() === tDay;
        });

        // Hydrate with items and client name (if available locally)
        for (const sale of sales) {
            const itemsRes = await db.query('SELECT * FROM direct_sales_items WHERE sale_id = ?', [sale.id]);
            sale.direct_sales_items = itemsRes.values || [];

            const clientRes = await db.query('SELECT name, client_code FROM clients WHERE id = ?', [sale.client_id]);
            sale.clients = clientRes.values?.[0] || { name: 'Desconocido' };
        }

        return sales;
    } catch (e) {
        console.error('[salesRepository] Error loading local sales:', e);
        return [];
    }
}


/**
 * Crea una preventa (Simulador)
 * - ONLINE: Inserta en Supabase direct table 'preventa' & 'preventa_items'.
 * - OFFLINE: Crea pending operation 'preventa'.
 */
export async function createPreventa(userId, clientId, totalAmount, items, extraData = {}) {
    let online = false;
    try { online = await isOnline(); } catch (e) { online = false; }
    const preventaId = crypto.randomUUID();

    // Prepare payload for header
    const payload = {
        id: preventaId,
        user_id: userId,
        client_id: clientId,
        total_amount: totalAmount,
        gec_discount: extraData.gec_discount || 0,
        promo_discount: extraData.promo_discount || 0,
        cargo: extraData.cargo || null,
        ...extraData,
        id: preventaId,
        created_at: new Date().toISOString(),
        // The Supabase check constraint uses Spanish status values. Set it
        // after extraData so callers cannot accidentally override it.
        status: 'pendiente'
    };

    if (online) {
        try {
            // Lazy import to avoid circular dependencies if any
            const { supabase } = await import('@/supabaseClient');

            console.log('[salesRepository] 📤 Attempting online preventa save:', payload);

            const { data: header, error: headInErr } = await supabase
                .from('preventa')
                .insert(payload)
                .select()
                .single();

            if (headInErr) {
                console.error('[salesRepository] ❌ Supabase Preventa Header Error:', headInErr);
                throw headInErr;
            }

            if (items && items.length > 0) {
                const itemsWithId = items.map(i => ({
                    ...i,
                    preventa_id: header.id
                }));
                const { error: itemsErr } = await supabase
                    .from('preventa_items')
                    .insert(itemsWithId);

                if (itemsErr) {
                    // Rollback header
                    await supabase.from('preventa').delete().eq('id', header.id);
                    throw itemsErr;
                }
            }
            return { success: true, id: header.id, offline: false };
        } catch (e) {
            console.warn('[salesRepository] Error creating preventa online, attempting offline save:', e);
            // Fallthrough to offline save
        }
    }

    // Offline Save (Pending Operation)
    try {
        const { addPendingOperation } = await import('@/sync/syncService');
        await addPendingOperation({
            entity_type: 'preventa',
            operation: 'insert',
            payload: {
                ...payload,
                items: items || []
            },
            created_at: new Date().toISOString()
        });
        return { success: true, id: preventaId, offline: true };
    } catch (e) {
        console.error('[salesRepository] Error saving preventa offline:', e);
        throw e;
    }
}

