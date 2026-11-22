import { kvStorage } from '@/services/kvStorage';
import { isOnline } from '@/lib/network';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

const SHOP_API_BASE = Capacitor.isNativePlatform()
    ? 'https://cervezasfinas.com/api/shop'
    : '/api/shop';

// ... (fetchShopProducts signature)
// Helper to fetch from Shop API with Native Support
async function fetchShopApi(endpoint, paramsObj) {
    const params = new URLSearchParams();
    Object.entries(paramsObj).forEach(([k, v]) => params.append(k, v));

    // Cache bust
    params.append("_t", Date.now());

    const url = `${SHOP_API_BASE}/${endpoint}?${params.toString()}`;
    console.log(`[ShopRepository] Fetching: ${url}`);

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
        if (Capacitor.isNativePlatform()) {
            const options = {
                url: url,
                headers: { 'Content-Type': 'application/json' },
                connectTimeout: 10000,
                readTimeout: 10000
            };
            const response = await CapacitorHttp.get(options);
            clearTimeout(id);
            if (response.status !== 200) {
                throw new Error(`Native HTTP Error ${response.status}: ${JSON.stringify(response.data)}`);
            }
            return response.data;
        } else {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(id);
            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}`);
            }
            return await response.json();
        }
    } catch (e) {
        clearTimeout(id);
        if (e.name === 'AbortError' || e.message?.includes('aborted')) {
            console.warn("[ShopRepository] Fetch timed out or aborted for: " + url);
            return null;
        }
        throw e;
    }
}

export async function fetchShopProducts(clientCode) {
    if (!clientCode) return [];

    let online = false;
    try { online = await isOnline(); } catch (e) { online = false; }

    if (online) {
        try {
            // Pagination Loop
            let allProducts = [];
            let offset = 0;
            const limit = 500; // Safe chunk size
            let moreAvailable = true;

            console.log(`[ShopRepository] Starting product fetch for: ${clientCode}`);

            while (moreAvailable) {
                const json = await fetchShopApi('products/list.php', {
                    limit: limit,
                    offset: offset,
                    client_code: clientCode
                });

                if (!json.success || !Array.isArray(json.data)) {
                    throw new Error(json.error || 'Invalid response format');
                }

                const rows = json.data;

                if (rows.length > 0) {
                    allProducts = allProducts.concat(rows);
                    offset += limit;
                }

                if (rows.length < limit) {
                    moreAvailable = false;
                }

                // Safety break
                if (offset > 10000) moreAvailable = false;
            }

            console.log(`[ShopRepository] Total products fetched: ${allProducts.length}`);

            // Map format to match SalesSimulator expectations
            const mapped = allProducts.map(p => {
                const priceInfo = p.priceData || {};
                return {
                    id: p.id,
                    cve_marca: p.sku,
                    des_marca: p.name,
                    price: Number(priceInfo.unit_price) || Number(p.base_price) || 0,
                    originalPrice: Number(priceInfo.original_price),
                    imageUrl: p.image_url || null,
                    photo_url: p.photo_url || null,
                    presentations: Array.isArray(p.presentations) ? p.presentations : [],
                    _pricingBreakdown: Array.isArray(priceInfo.breakdown) ? priceInfo.breakdown : Object.values(priceInfo.breakdown || {}),
                    hasPromo: !!priceInfo.has_promo
                };
            });

            // Save to Cache (Async)
            await savePricesToLocal(clientCode, mapped);
            return mapped;

        } catch (error) {
            console.warn("[ShopRepository] Failed to fetch shop prices online, attempting fallback cache:", error);
        }
    }

    // Offline or Online Failed -> Fallback is simple local cache
    console.log(`[ShopRepository] Loading prices from local DB cache for ${clientCode}`);
    return await loadPricesFromLocal(clientCode);
}

async function savePricesToLocal(clientCode, data) {
    try {
        const payload = {
            timestamp: Date.now(),
            data: data
        };
        const key = `shop_pricing_${clientCode}`;
        await kvStorage.setItem(key, payload);
        if (Array.isArray(data) && data.length > 0) {
            await kvStorage.setItem('shop_pricing_DEFAULT_CATALOG', payload);
        }
    } catch (e) {
        console.warn("Error saving prices to local storage", e);
    }
}

async function loadPricesFromLocal(clientCode) {
    try {
        const key = `shop_pricing_${clientCode}`;
        const record = await kvStorage.getItem(key);
        if (record && Array.isArray(record.data) && record.data.length > 0) {
            return record.data;
        }
        const fallback = await kvStorage.getItem('shop_pricing_DEFAULT_CATALOG');
        if (fallback && Array.isArray(fallback.data)) {
            return fallback.data;
        }
        return [];
    } catch (e) {
        console.warn("Error loading prices from local storage", e);
        return [];
    }
}

export async function saveClientCustomPrices(clientCode, prices) {
    if (!clientCode || !Array.isArray(prices) || prices.length === 0) return { success: false };
    try {
        // Actualizar también el caché local del cliente para uso offline inmediato
        try {
            const current = await loadPricesFromLocal(clientCode);
            if (Array.isArray(current) && current.length > 0) {
                const priceMap = new Map(prices.map((p) => [String(p.sku), Number(p.price)]));
                const updated = current.map((item) =>
                    priceMap.has(String(item.cve_marca))
                        ? { ...item, price: priceMap.get(String(item.cve_marca)) }
                        : item
                );
                await kvStorage.setItem(`shop_pricing_${clientCode}`, { timestamp: Date.now(), data: updated });
            }
        } catch {}

        const { api } = await import('@/lib/api');
        return await api.post('/televenta/save-client-prices.php', { client_code: clientCode, prices });
    } catch (e) {
        console.warn('[ShopRepository] Failed to save client custom prices:', e);
        return { success: false, error: e.message };
    }
}
