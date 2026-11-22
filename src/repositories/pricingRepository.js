import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { getDbConnection } from '@/lib/localDb';
import { isOnline } from '@/lib/network';

const SHOP_API_BASE = Capacitor.isNativePlatform() ? 'https://cervezasfinas.com/api/shop' : '/api/shop';

// Safe Fetch Helper with Timeout
async function fetchShopApi(endpoint) {
    const url = `${SHOP_API_BASE}/${endpoint}`;
    console.log(`[PricingRepository] Fetching: ${url}`);

    const safeUrl = `${url}?_t=${Date.now()}`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
        if (Capacitor.isNativePlatform()) {
            const options = {
                url: safeUrl,
                headers: { 'Content-Type': 'application/json' },
                connectTimeout: 10000,
                readTimeout: 10000
            };
            const response = await CapacitorHttp.get(options);
            clearTimeout(id);
            if (response.status !== 200) throw new Error(`HTTP Error ${response.status}`);
            return response.data;
        } else {
            const response = await fetch(safeUrl, { signal: controller.signal });
            clearTimeout(id);
            if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
            return await response.json();
        }
    } catch (e) {
        clearTimeout(id);
        if (e.name === 'AbortError' || e.message?.includes('aborted')) {
            console.warn("[PricingRepository] Fetch timed out or aborted for: " + url);
            return null;
        }
        throw e;
    }
}

/**
 * Downloads pricing rules (Promos, GEC, Special) from Shop MySQL 
 * and saves them to local SQLite.
 */
export async function syncPricingData() {
    // 1. Check Online
    let online = false;
    try { online = await isOnline(); } catch (e) { online = false; }
    if (!online) {
        console.warn("Skipping pricing sync: offline");
        return;
    }

    try {
        console.log("Starting Pricing Rules Sync...");

        const json = await fetchShopApi('products/sync_pricing.php');

        if (!json.success || !json.data ||
            !Array.isArray(json.data.gec_discounts) ||
            !Array.isArray(json.data.promotions) ||
            !Array.isArray(json.data.special_prices) ||
            !Object.prototype.hasOwnProperty.call(json.data, 'surcharges_config')) {
            throw new Error("Incomplete pricing response; preserving cached rules");
        }

        const { gec_discounts, promotions, special_prices, surcharges_config } = json.data;

        await savePricingToLocal(gec_discounts, promotions, special_prices, surcharges_config);
        console.log("Pricing Rules Synced Successfully");

    } catch (error) {
        console.warn("[pricingRepository] Failed to sync pricing rules (might be offline or server timeout):", error.message);
    }
}

async function savePricingToLocal(gec, promos, special, surcharges) {
    const db = await getDbConnection();

    // WEB FALLBACK (Mock DB doesn't execute SQL)
    if (Capacitor.getPlatform() === 'web') {
        console.log('[pricingRepository] Web detected: Saving rules to localStorage');
        localStorage.setItem('pricing_rules_cache', JSON.stringify({ gec, promos, special, surcharges }));
        return;
    }

    // TRANSACTION START
    await db.execute('BEGIN TRANSACTION');

    try {
        // 1. GEC
        await db.execute(`DELETE FROM gec_discounts`);
        if (gec && gec.length > 0) {
            let stmt = `INSERT INTO gec_discounts (id, gec_level, discount_percentage) VALUES `;
            const values = [];
            gec.forEach(g => {
                const levelName = (g.gec_level || g.nivel_gec || '').replace(/'/g, "''");
                values.push(`(${g.id}, '${levelName}', ${g.discount_percentage})`);
            });
            await db.execute(stmt + values.join(","));
        }

        // 2. Promotions
        await db.execute(`DELETE FROM promotions`);
        if (promos && promos.length > 0) {
            const statements = promos.map(p => ([
                p.id,
                p.name,
                p.discount_amount,
                p.start_date,
                p.end_date,
                p.is_active,
                p.skus,
                p.zones || null,
                p.promo_type || 'amount_off',
                p.buy_n || 0,
                p.pay_m || 0
            ]));

            const BATCH_SIZE = 50;
            for (let i = 0; i < statements.length; i += BATCH_SIZE) {
                const chunk = statements.slice(i, i + BATCH_SIZE);
                const placeholders = chunk.map(() => `(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).join(',');
                const values = chunk.flat();
                await db.run(`INSERT INTO promotions 
                    (id, name, discount_amount, start_date, end_date, is_active, skus, zones, promo_type, buy_n, pay_m) 
                    VALUES ${placeholders}`, values);
            }
        }

        // 3. Special Prices
        await db.execute(`DELETE FROM special_prices`);
        if (special && special.length > 0) {
            const values = [];
            special.forEach(s => {
                const client = (s.client_code || '').replace(/'/g, "''");
                const sku = (s.sku || '').replace(/'/g, "''");
                values.push(`('${client}', '${sku}', ${s.special_price}, '${s.start_date || ''}', '${s.end_date || ''}')`);
            });
            // Loop insert
            for (const v of values) {
                await db.execute(`INSERT INTO special_prices (client_code, sku, special_price, start_date, end_date) VALUES ${v}`);
            }
        }

        // 4. Surcharges Config
        await db.execute(`DELETE FROM surcharges_config`);
        if (surcharges) {
            // surcharges is an Object { id, returnable_amount, disposable_amount } or Array
            const s = Array.isArray(surcharges) ? surcharges[0] : surcharges;
            if (s) {
                await db.run(`INSERT INTO surcharges_config (id, returnable_amount, disposable_amount) VALUES (?, ?, ?)`,
                    [1, s.returnable_amount, s.disposable_amount]);
            }
        }

        // COMMIT
        await db.execute('COMMIT');
        console.log("Pricing Rules Transaction Committed");

    } catch (dbError) {
        console.error("Error writing pricing to local DB (Rolled Back)", dbError);
        await db.execute('ROLLBACK');
        throw dbError;
    }
}

/**
 * Retrieves ALL relevant pricing rules for offline calculation.
 * Returns an object with the 3 arrays.
 */
export async function getLocalPricingRules() {
    const db = await getDbConnection();

    // WEB FALLBACK
    if (Capacitor.getPlatform() === 'web') {
        const cached = localStorage.getItem('pricing_rules_cache');
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                return {
                    gec: parsed.gec || [],
                    promotions: parsed.promos || [],
                    specialPrices: parsed.special || [],
                    surcharges: parsed.surcharges || null
                };
            } catch (e) {
                console.warn("Invalid pricing cache", e);
            }
        }
    }

    try {
        const gec = await db.query(`SELECT * FROM gec_discounts`);
        const promos = await db.query(`SELECT * FROM promotions WHERE is_active = 1`);
        const special = await db.query(`SELECT * FROM special_prices`);
        const surcharges = await db.query(`SELECT * FROM surcharges_config LIMIT 1`);

        // Fetch Trade Promotions from Supabase (Phase 5)
        let tradePromos = [];
        try {
            // Import dynamically to avoid circular deps if any
            const { supabase } = await import('@/supabaseClient');
            const today = new Date().toLocaleString('en-CA', { timeZone: 'America/Mexico_City', hour12: false }).split(',')[0];
            
            const { data, error } = await supabase
                .from('trade_promotions')
                .select('*')
                .eq('status', 'ACTIVE')
                .lte('start_date', today)
                .gte('end_date', today);
                
            if (!error && data) {
                tradePromos = data;
            }
        } catch (e) {
            console.warn("Could not fetch trade promotions", e);
        }

        return {
            gec: gec.values || [],
            promotions: promos.values || [],
            specialPrices: special.values || [],
            surcharges: (surcharges.values && surcharges.values.length > 0) ? surcharges.values[0] : null,
            tradePromotions: tradePromos
        };
    } catch (e) {
        console.warn("Could not load local pricing rules", e);
        return { gec: [], promotions: [], specialPrices: [], tradePromotions: [] };
    }
}
