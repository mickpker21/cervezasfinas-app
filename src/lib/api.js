import { supabase } from '@/supabaseClient';

const productionShopApi = 'https://cervezasfinas.com/api/shop';
const isMxOrFile = typeof window !== 'undefined' && (
    /(^|\.)cervezasfinas\.com\.mx$/i.test(window.location.hostname) ||
    window.location.protocol === 'file:'
);

// The .com.mx frontend uses the production MySQL shop API hosted on .com; Electron uses its built-in local proxy (/api/shop).
export const API_URL = import.meta.env.VITE_API_URL || (isMxOrFile ? productionShopApi : '/api/shop');
export const BASE_URL = (isMxOrFile || (typeof window !== 'undefined' && Boolean(window.electronDesktop))) ? 'https://cervezasfinas.com' : '';

export async function getShopAuthHeaders(existingHeaders = {}) {
    const headers = new Headers(existingHeaders);
    if (!headers.has('Authorization')) {
        let { data: { session } } = await supabase.auth.getSession();

        // getSession can return an expired token while refresh is still pending.
        // Refresh before calling staff endpoints so the browser does not send a
        // stale bearer token and receive an ambiguous 401.
        const expiresSoon = session?.expires_at
            && session.expires_at <= Math.floor(Date.now() / 1000) + 30;
        if (!session?.access_token || expiresSoon) {
            const { data, error } = await supabase.auth.refreshSession();
            if (!error && data?.session) session = data.session;
        }

        if (!session?.access_token) {
            throw new Error('No hay una sesión de personal válida en Supabase. Cierra sesión e inicia de nuevo con tu cuenta de Televenta.');
        }
        headers.set('Authorization', `Bearer ${session.access_token}`);
    }
    return Object.fromEntries(headers.entries());
}

export const getImageUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    return `${BASE_URL}/${cleanPath}`;
};

const CACHE_PREFIX = 'cf_api_cache:';
const QUEUE_KEY = 'cf_api_offline_queue_v1';
let isFlushingQueue = false;

function readApiCache(endpoint) {
    try {
        const raw = localStorage.getItem(CACHE_PREFIX + endpoint);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function writeApiCache(endpoint, data) {
    try {
        localStorage.setItem(CACHE_PREFIX + endpoint, JSON.stringify(data));
    } catch {
        // ignore quota errors
    }
}

function applyOptimisticOverrideCache(body) {
    if (!body || !body.preventa_id) return;
    try {
        const cached = readApiCache('/televenta/preventa-overrides.php') || { success: true, overrides: [] };
        const list = Array.isArray(cached.overrides) ? [...cached.overrides] : [];
        const pid = String(body.preventa_id);
        const idx = list.findIndex((o) => String(o.preventa_id) === pid);
        const record = {
            ...(idx >= 0 ? list[idx] : {}),
            preventa_id: pid,
            client_code: body.client_code ?? (idx >= 0 ? list[idx].client_code : null),
            client_name: body.client_name ?? (idx >= 0 ? list[idx].client_name : null),
            status: body.status ?? (idx >= 0 ? list[idx].status : 'confirmado'),
            total_amount: body.total_amount ?? (idx >= 0 ? list[idx].total_amount : 0),
            cargo: body.cargo ?? body.cargo_extra ?? (idx >= 0 ? list[idx].cargo : 0),
            cargo_extra: body.cargo_extra ?? body.cargo ?? (idx >= 0 ? list[idx].cargo_extra : 0),
            notes: body.notes ?? (idx >= 0 ? list[idx].notes : ''),
            delivery_date: body.delivery_date ?? (idx >= 0 ? list[idx].delivery_date : null),
            items_json: Array.isArray(body.items) ? JSON.stringify(body.items) : (idx >= 0 ? list[idx].items_json : '[]'),
            updated_at: new Date().toISOString(),
        };
        if (idx >= 0) list[idx] = record;
        else list.unshift(record);
        writeApiCache('/televenta/preventa-overrides.php', { ...cached, success: true, overrides: list });
    } catch (e) {
        console.warn('[API Offline] Error aplicando cache optimista de preventa:', e);
    }
}

function enqueueOfflinePost(endpoint, bodyObj) {
    try {
        const raw = localStorage.getItem(QUEUE_KEY);
        const queue = raw ? JSON.parse(raw) : [];
        queue.push({
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            endpoint,
            body: bodyObj,
            created_at: new Date().toISOString(),
        });
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        if (endpoint.includes('/televenta/update-preventa.php')) {
            applyOptimisticOverrideCache(bodyObj);
        }
    } catch (e) {
        console.warn('[API Offline] No se pudo encolar petición POST:', e);
    }
}

export async function flushOfflineApiQueue() {
    if (isFlushingQueue) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    let queue = [];
    try {
        const raw = localStorage.getItem(QUEUE_KEY);
        queue = raw ? JSON.parse(raw) : [];
    } catch {
        queue = [];
    }
    if (!Array.isArray(queue) || queue.length === 0) return;

    isFlushingQueue = true;
    try {
        const headers = await getShopAuthHeaders({ 'Content-Type': 'application/json' });
        const remaining = [];
        for (const item of queue) {
            try {
                const res = await fetch(`${API_URL}${item.endpoint}`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(item.body),
                });
                if (!res.ok && res.status >= 500) {
                    remaining.push(item);
                }
            } catch {
                remaining.push(item);
            }
        }
        localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    } catch {
        // retry on next online event
    } finally {
        isFlushingQueue = false;
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        flushOfflineApiQueue().catch(() => {});
    });
}

async function request(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`;
    const method = (options.method || 'GET').toUpperCase();
    let headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    try {
        headers = await getShopAuthHeaders(headers);
    } catch (authErr) {
        if (method === 'GET') {
            const cached = readApiCache(endpoint);
            if (cached) return { ...cached, _offlineCache: true };
        }
        throw authErr;
    }

    try {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            throw new Error('OFFLINE');
        }
        const response = await fetch(url, { ...options, headers });
        const text = await response.text();
        try {
            const parsed = JSON.parse(text);
            if (parsed?.offline) {
                throw new Error('OFFLINE_PROXY');
            }
            if (method === 'GET' && parsed && parsed.success !== false && !parsed.error) {
                writeApiCache(endpoint, parsed);
            }
            if (method === 'POST' && parsed?.success && endpoint.includes('/televenta/update-preventa.php') && options._rawBody) {
                applyOptimisticOverrideCache(options._rawBody);
            }
            return parsed;
        } catch (_) {
            console.warn('Non-JSON API response from', endpoint);
            if (method === 'GET') {
                const cached = readApiCache(endpoint);
                if (cached) return { ...cached, _offlineCache: true };
            }
            return { success: false, error: `Respuesta inválida del servidor (${response.status})` };
        }
    } catch (error) {
        if (method === 'GET') {
            const cached = readApiCache(endpoint);
            if (cached) {
                console.info(`[API Offline] Usando caché local para GET ${endpoint}`);
                return { ...cached, _offlineCache: true };
            }
        } else if (method === 'POST' && options._rawBody) {
            enqueueOfflinePost(endpoint, options._rawBody);
            console.info(`[API Offline] POST encolado para sincronizar al reconectar: ${endpoint}`);
            return { success: true, queued_offline: true };
        }
        console.error('API Request Error:', error);
        return { success: false, error: error.message };
    }
}

export const api = {
    get: (endpoint) => request(endpoint, { method: 'GET' }),
    post: (endpoint, body) => request(endpoint, { method: 'POST', body: JSON.stringify(body), _rawBody: body }),
    put: (endpoint, body) => request(endpoint, { method: 'PUT', body: JSON.stringify(body), _rawBody: body }),
    delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
};
