import { Capacitor, CapacitorHttp } from '@capacitor/core';

const API_BASE = Capacitor.isNativePlatform() ? 'https://cervezasfinas.com/api' : '/api';

/**
 * Imports Orders to MySQL.
 * Expects array of { order: {...}, items: [...] }
 */
export async function importOrdersApi(ordersArray) {
    if (!ordersArray?.length) return { processed: 0, errors: [] };

    const url = `${API_BASE}/orders-import.php`;

    if (Capacitor.isNativePlatform()) {
        const options = {
            url: url,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            data: { orders: ordersArray }
        };
        const response = await CapacitorHttp.post(options);
        if (response.status !== 200) {
            throw new Error(`orders-import Native HTTP ${response.status}`);
        }
        return response.data;
    }

    const body = JSON.stringify({ orders: ordersArray });
    console.log('[mysqlOrders] importOrdersApi payload:', body);

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body
    });

    if (!res.ok) {
        throw new Error(`orders-import HTTP ${res.status}`);
    }
    return await res.json();
}

/**
 * Reads orders from MySQL via PHP.
 */
export async function fetchOrdersApi(params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = `${API_BASE}/orders-read.php?${query}`;

    try {
        if (Capacitor.isNativePlatform()) {
            const options = {
                url: url,
                headers: { 'Content-Type': 'application/json' }
            };
            const response = await CapacitorHttp.get(options);
            if (response.status !== 200) throw new Error(`orders-read Native HTTP ${response.status}`);
            return response.data; // { rows: [], count: 0 }
        } else {
            const res = await fetch(url);
            if (!res.ok) {
                let errorMsg = `orders-read HTTP ${res.status}`;
                try {
                    const errorData = await res.json();
                    if (errorData.error) errorMsg += `: ${errorData.error}`;
                } catch (e) { /* ignore parse error */ }
                throw new Error(errorMsg);
            }
            return await res.json();
        }
    } catch (error) {
        console.error('[mysqlOrders] Error fetching orders:', error);
        throw error;
    }
}

/**
 * Searches for assets in MySQL.
 */
export async function searchAssetsApi(params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = `${API_BASE}/assets-read.php?${query}`;

    if (Capacitor.isNativePlatform()) {
        const options = { url: url, headers: { 'Content-Type': 'application/json' } };
        const response = await CapacitorHttp.get(options);
        return response.data;
    } else {
        const res = await fetch(url);
        if (!res.ok) {
            console.warn(`[mysqlOrders] searchAssetsApi API Error: ${res.status}`);
            return [];
        }
        try {
            return await res.json();
        } catch (e) {
            console.warn(`[mysqlOrders] searchAssetsApi JSON Parse Error:`, e);
            return [];
        }
    }
}

/**
 * Completes an order in MySQL, triggering asset transfers.
 */
export async function completeOrderApi(orderId, targetWarehouseId = null) {
    const url = `${API_BASE}/complete-order.php`;
    
    if (Capacitor.isNativePlatform()) {
        const options = {
            url: url,
            method: 'POST',
            data: { order_id: orderId, target_warehouse_id: targetWarehouseId },
            headers: { 'Content-Type': 'application/json' }
        };
        const response = await CapacitorHttp.post(options);
        return response.data;
    } else {
        const res = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ order_id: orderId, target_warehouse_id: targetWarehouseId }),
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Error del servidor (${res.status}): ${text.substring(0, 100)}`);
        }
        
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return await res.json();
        } else {
            const text = await res.text();
            return { status: 'success', message: text };
        }
    }
}

/**
 * Imports Assets to MySQL.
 */
export async function importAssetsApi(assetsArray) {
    if (!assetsArray?.length) return { processed: 0, errors: [] };

    const url = `${API_BASE}/assets-import.php`;

    if (Capacitor.isNativePlatform()) {
        const options = {
            url: url,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            data: { assets: assetsArray }
        };
        const response = await CapacitorHttp.post(options);
        if (response.status !== 200) {
            throw new Error(`assets-import Native HTTP ${response.status}`);
        }
        return response.data;
    }

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assets: assetsArray })
    });

    if (!res.ok) {
        throw new Error(`assets-import HTTP ${res.status}`);
    }
    return await res.json();
}

/**
 * Fetches asset history from MySQL.
 */
export async function fetchAssetHistoryApi(assetId) {
    if (!assetId) return { rows: [], count: 0 };
    const url = `${API_BASE}/assets-history-read.php?asset_id=${assetId}`;

    if (Capacitor.isNativePlatform()) {
        const options = { url: url, headers: { 'Content-Type': 'application/json' } };
        const response = await CapacitorHttp.get(options);
        return response.data;
    } else {
        const res = await fetch(url);
        return await res.json();
    }
}

/**
 * Updates a single asset in MySQL.
 */
export async function updateAssetApi(assetData) {
    if (!assetData?.id) throw new Error("Asset ID is required for update");
    const url = `${API_BASE}/asset-update.php`;

    if (Capacitor.isNativePlatform()) {
        const options = {
            url: url,
            method: 'POST',
            data: assetData,
            headers: { 'Content-Type': 'application/json' }
        };
        const response = await CapacitorHttp.post(options);
        return response.data;
    } else {
        const res = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(assetData),
            headers: { 'Content-Type': 'application/json' }
        });
        return await res.json();
    }
}

/**
 * Fetches warehouses from MySQL.
 */
export async function fetchWarehousesApi() {
    const url = `${API_BASE}/warehouses-read.php`;

    if (Capacitor.isNativePlatform()) {
        const options = { url: url, headers: { 'Content-Type': 'application/json' } };
        const response = await CapacitorHttp.get(options);
        return response.data;
    } else {
        const res = await fetch(url);
        return await res.json();
    }
}
/**
 * Updates a single installation order in MySQL.
 */
export async function updateOrderApi(orderId, data) {
    if (!orderId) throw new Error("Order ID is required update");
    const url = `${API_BASE}/order-update.php`;

    if (Capacitor.isNativePlatform()) {
        const options = {
            url: url,
            method: 'POST',
            data: { ...data, id: orderId },
            headers: { 'Content-Type': 'application/json' }
        };
        const response = await CapacitorHttp.post(options);
        return response.data;
    } else {
        const res = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ ...data, id: orderId }),
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!res.ok) {
            const text = await res.text();
            console.error('[mysqlOrders] updateOrderApi error:', text);
            throw new Error(`Error del servidor (${res.status}): ${text.substring(0, 100)}`);
        }
        
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return await res.json();
        } else {
            const text = await res.text();
            console.error('[mysqlOrders] Non-JSON response:', text);
            return { status: 'success', message: text };
        }
    }
}

/**
 * Fetches current asset locations from MySQL.
 */
export async function fetchAssetLocationsApi() {
    const url = `${API_BASE}/asset-locations-read.php`;

    try {
        if (Capacitor.isNativePlatform()) {
            const options = { url: url, headers: { 'Content-Type': 'application/json' } };
            const response = await CapacitorHttp.get(options);
            return response.data || [];
        } else {
            const res = await fetch(url);
            if (!res.ok) {
                console.warn('[mysqlOrders] asset-locations-read HTTP', res.status);
                return [];
            }
            return await res.json();
        }
    } catch (err) {
        console.warn('[mysqlOrders] Error fetching asset locations:', err);
        return [];
    }
}
