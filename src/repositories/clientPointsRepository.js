import { api } from '@/lib/api';
import { kvStorage } from '@/services/kvStorage';
import { isOnline } from '@/lib/network';

const POINTS_CACHE_KEY = 'supervisor_client_points_v1';
const CLIENTS_SNAPSHOT_PREFIX = 'supervisor_permitted_clients_v1_';

/**
 * Obtiene del almacenamiento local (SQLite / SharedPreferences / localStorage)
 * el último resumen de puntos sincronizado.
 */
export async function getCachedClientPointsSummary() {
    try {
        const cached = await kvStorage.getItem(POINTS_CACHE_KEY);
        if (cached && typeof cached === 'object') {
            return {
                points_by_client: cached.points_by_client || {},
                redemption_catalog: Array.isArray(cached.redemption_catalog) ? cached.redemption_catalog : [],
                synced_at: cached.synced_at || null,
                fromCache: true,
            };
        }
    } catch (e) {
        console.warn('[clientPointsRepository] Error leyendo cache local de puntos:', e);
    }
    return {
        points_by_client: {},
        redemption_catalog: [],
        synced_at: null,
        fromCache: true,
    };
}

/**
 * Sincroniza el resumen de puntos de clientes desde el servidor MySQL y lo persiste
 * en kvStorage para uso 100% offline. Si no hay red o falla, devuelve el cache local.
 */
export async function syncClientPointsSummary() {
    const online = await isOnline().catch(() => navigator.onLine);
    if (!online) {
        return await getCachedClientPointsSummary();
    }

    try {
        const res = await api.get('/points/clients-summary.php');
        if (res && res.success && res.data) {
            const payload = {
                points_by_client: res.data.points_by_client || {},
                redemption_catalog: Array.isArray(res.data.redemption_catalog) ? res.data.redemption_catalog : [],
                synced_at: res.synced_at || new Date().toISOString(),
            };
            await kvStorage.setItem(POINTS_CACHE_KEY, payload);
            return {
                ...payload,
                fromCache: false,
            };
        }
    } catch (e) {
        console.warn('[clientPointsRepository] No se pudo sincronizar online, usando cache offline:', e);
    }

    return await getCachedClientPointsSummary();
}

/**
 * Guarda un snapshot ligero de la cartera permitida del supervisor para garantizar
 * disponibilidad offline inmediata incluso si la tabla local aún no ha sido consultada.
 */
export async function saveSupervisorClientsSnapshot(userId, clients) {
    if (!userId || !Array.isArray(clients)) return;
    try {
        const compact = clients.map(c => ({
            id: c.id,
            client_code: c.client_code || c.code || '',
            name: c.name || '',
            business_name: c.business_name || '',
            address: c.address || '',
            phone: c.phone || '',
            sales_route: c.sales_route || c.ruta_venta || c.ruta || '',
            internal_route: c.internal_route || c.ruta_interna || c.ruta_conquista || '',
            zona: c.zona_comercial || c.zona || c.region || c.branch_id || '',
            gec: c.gec || c.level || '',
            cadena: c.cadena || c.chain || '',
        }));
        await kvStorage.setItem(`${CLIENTS_SNAPSHOT_PREFIX}${userId}`, {
            updated_at: new Date().toISOString(),
            clients: compact,
        });
    } catch (e) {
        console.warn('[clientPointsRepository] No se pudo guardar snapshot de clientes:', e);
    }
}

export async function getSupervisorClientsSnapshot(userId) {
    if (!userId) return [];
    try {
        const snap = await kvStorage.getItem(`${CLIENTS_SNAPSHOT_PREFIX}${userId}`);
        if (snap && Array.isArray(snap.clients)) {
            return snap.clients;
        }
    } catch (e) {
        console.warn('[clientPointsRepository] Error leyendo snapshot de clientes:', e);
    }
    return [];
}
