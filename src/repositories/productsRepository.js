import { isOnline, withTimeout } from '@/lib/network';
import { getDb, isMockDb } from '@/lib/localDb';
import { supabase } from '@/supabaseClient';
import { Capacitor } from '@capacitor/core';

/**
 * Fetches products from Supabase and syncs them to local SQLite.
 * This ensures we have a base catalog even when offline.
 */
import { fetchShopProducts } from './shopRepository';
import { getProductImageUrl } from '@/lib/imageCatalog';

/**
 * Fetches products from Supabase and syncs them to local SQLite.
 * This ensures we have a base catalog even when offline.
 * 
 * UPDATE: Now also fetches Base Prices from MySQL (Shop API) to ensure consistency.
 */
export async function syncProducts() {
    let online = false;
    try { online = await isOnline(); } catch (e) { online = false; }

    if (!online) {
        console.log('[productsRepository] Offline, skipping product sync.');
        return;
    }

    try {
        console.log('[productsRepository] Starting product sync...');

        // 1. Fetch Structure from Supabase (Source of Truth for Catalog items)
        // PAGINATED FETCH to overcome 1000-row limit
        let supabaseData = [];
        let from = 0;
        const PAGE_SIZE = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await withTimeout(
                supabase
                    .from('precios')
                    .select('*')
                    .range(from, from + PAGE_SIZE - 1),
                10000
            );

            if (error) throw error;
            if (data && data.length > 0) {
                supabaseData = supabaseData.concat(data);
                from += PAGE_SIZE;
                if (data.length < PAGE_SIZE) hasMore = false;
            } else {
                hasMore = false;
            }
            
            // Safety break 
            if (from > 10000) hasMore = false;
        }

        if (!supabaseData || supabaseData.length === 0) {
            console.log('[productsRepository] No products found in Supabase.');
            return;
        }

        // 2. Fetch Base Prices from MySQL (Shop API)
        // We use a dummy client 'BASE_SYNC' to get general list/prices
        let shopData = [];
        try {
            console.log('[productsRepository] Fetching live base prices from MySQL...');
            shopData = await fetchShopProducts('BASE_SYNC');
            console.log(`[productsRepository] Received ${shopData.length} products from MySQL.`);
        } catch (e) {
            console.warn('[productsRepository] Failed to fetch MySQL prices, using Supabase prices only', e);
        }

        // 3. Union Merge
        // We create a map indexed by SKU (cve_marca)
        const productMap = new Map();

        // 3a. Add Supabase items first
        supabaseData.forEach(p => {
            const sku = String(p.cve_marca || p.sku || "").trim();
            if (sku) productMap.set(sku, { ...p });
        });

        // 3b. Overlay/Add Shop API items (MySQL)
        // If an item is in MySQL but NOT Supabase, we add it!
        shopData.forEach(s => {
            const sku = String(s.cve_marca || s.sku || "").trim();
            if (!sku) return;

            const existing = productMap.get(sku);
            if (existing) {
                // Update price from MySQL (Priority: Use originalPrice if available to keep catalog base)
                const basePrice = Number(s.originalPrice || s.price || existing.price);
                productMap.set(sku, {
                    ...existing,
                    price: basePrice,
                    current_price: basePrice
                });
            } else {
                // NEW ITEM found in MySQL (like SKU 7214)
                // IMPORTANT: Use originalPrice as the catalog base, so local engine can apply GEC correctly
                const basePrice = Number(s.originalPrice || s.price || 0);
                productMap.set(sku, {
                    cve_marca: sku,
                    des_marca: s.des_marca || s.name,
                    name: s.name,
                    price: basePrice,
                    current_price: basePrice,
                    family: s.family || s.category,
                    presentation: s.presentation,
                    brand: s.brand,
                    unit_metric: s.unit_metric,
                    display: s.is_active || 1,
                    returnable_factor: s.returnable_factor || 0,
                    image_url: s.image_url
                });
            }
        });

        const mergedData = Array.from(productMap.values());
        await saveProductsToLocal(mergedData);
        console.log(`[productsRepository] Final Synced: ${mergedData.size || mergedData.length} products to local DB.`);

    } catch (e) {
        console.error('[productsRepository] Error syncing products:', e);
    }
}

async function saveProductsToLocal(products) {
    try {
        if (!Array.isArray(products) || products.length === 0) {
            console.warn('[productsRepository] Empty/invalid catalog response; keeping local catalog intact.');
            return;
        }
        const db = await getDb();
        if (isMockDb()) {
            db._storage.set('products', products);
            return;
        }

        // TRANSACTION
        await db.execute('BEGIN TRANSACTION');

        try {
            // Delete all (safe inside transaction)
            await db.execute('DELETE FROM products');

            // Batch insert
            // Batch insert
            // FIXED: Correctly map attributes and ensure image_url uses the static portfolio path
            const statements = products.map(p => {
                const sku = p.cve_marca || p.sku;
                const safeSku = sku ? sku.trim() : '';
                const newPortfolioUrl = getProductImageUrl(safeSku);

                return [
                    p.id,
                    sku, // cve_marca
                    p.des_marca || p.name,
                    p.name,
                    p.current_price || p.price,
                    newPortfolioUrl, // image_url (Overridden)
                    p.family,
                    p.presentation,
                    p.brand,
                    p.unit_metric,
                    p.display ? 1 : 0,
                    p.returnable_factor || 0,
                    new Date().toISOString()
                ];
            });

            const BATCH_SIZE = 50;
            for (let i = 0; i < statements.length; i += BATCH_SIZE) {
                const chunk = statements.slice(i, i + BATCH_SIZE);
                const placeholders = chunk.map(() => `(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).join(',');
                const values = chunk.flat();

                await db.run(`
                    INSERT INTO products (
                        id, cve_marca, des_marca, name, price, 
                        image_url, family, presentation, brand, 
                        unit_metric, display, returnable_factor, created_at
                    ) VALUES ${placeholders}
                `, values);
            }

            await db.execute('COMMIT');
            console.log(`[productsRepository] Synced ${products.length} products to local DB.`);

        } catch (innerError) {
            console.error('[productsRepository] Transaction failed, rolling back:', innerError);
            await db.execute('ROLLBACK');
        }

    } catch (e) {
        console.error('[productsRepository] Error saving products to local:', e);
    }
}

/**
 * Get products from local DB (Offline capability)
 */
export async function getLocalProducts() {
    try {
        const db = await getDb();
        if (isMockDb()) {
            return db._storage.get('products') || [];
        }

        const res = await db.query('SELECT * FROM products');
        return res.values || [];
    } catch (e) {
        console.error('[productsRepository] Error loading local products:', e);
        return [];
    }
}
