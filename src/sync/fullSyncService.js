// src/sync/fullSyncService.js
import { getAllEvaluations } from '@/repositories/evaluationsRepository';
import { getAllVisits } from '@/repositories/visitsRepository';
import { getSalesBySku } from '@/repositories/salesRepository';
import { getGoals, getZoneGoals } from '@/repositories/goalsRepository';
import { getTruckInventory } from '@/repositories/inventoryRepository';
import { syncPendingOperations } from './syncService';
import { supabase } from '@/supabaseClient';
import { kvStorage } from '@/services/kvStorage';
import { isOnline } from '@/lib/network';
import { syncEvaluationConfig } from '@/lib/evaluationConfig';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { Capacitor } from '@capacitor/core';

/**
 * Descarga completa de todos los datos al login
 */
export async function downloadAllData(userId, userRole, onProgress = null) {
    console.log('[FullSync] Iniciando descarga completa de datos...');

    const online = await isOnline().catch(() => false);
    const meta = (typeof userRole === 'string') ? { role: userRole } : (userRole || {});
    const rawRole = meta.type || meta.role || (typeof userRole === 'string' ? userRole : 'user');
    const normalizedRole = rawRole.toLowerCase().replace(/[_-]/g, ' ');
    const isJefe = normalizedRole === 'jefe operaciones' || normalizedRole === 'jefeoperaciones' || normalizedRole === 'jefe-operaciones' || normalizedRole === 'jefe de operaciones';

    // 🔒 REGRA DE ORO: no intentar sync si está offline
    if (!online) {
        console.warn('[FullSync] Offline detectado. Se omite descarga.');
        return {
            success: false,
            timestamp: new Date().toISOString(),
            results: [{ name: 'Offline', success: false, error: 'No network' }]
        };
    }

    // 1. Obtener rutas y zonas permitidas
    let allowedRoutes = [];
    let allowedZones = [];
    try {
        const [routesRes, zonesRes] = await Promise.all([
            supabase.from('supervisor_allowed_sales_routes').select('sales_route').eq('supervisor_id', userId),
            supabase.from('supervisor_allowed_zonas').select('zona').eq('supervisor_id', userId)
        ]);

        if (routesRes.data) allowedRoutes = routesRes.data.map(r => r.sales_route);
        if (zonesRes.data) allowedZones = zonesRes.data.map(r => r.zona);

    } catch (e) {
        console.warn('[FullSync] Error obteniendo permisos online:', e);
    }

    // Resolve the advisor's own route from profile, scoped cache or metadata.
    // Previously we only checked user_metadata.sales_route, so profiles that
    // store their route in profiles.route/ruta synced only the first 1,000 clients.
    if (allowedRoutes.length === 0) {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { detectUserRoute } = await import('@/repositories/routeRepository');
                const detectedRoute = await detectUserRoute(user);
                if (detectedRoute) {
                    console.log(`[FullSync] No supervisor routes found, using advisor route: ${detectedRoute}`);
                    allowedRoutes.push(detectedRoute);
                }
            }
        } catch (e) {
            console.warn('[FullSync] Error detecting advisor route:', e);
        }
    }

    if (allowedRoutes.length === 0) {
        try {
            const { getAllowedRoutes } = await import('@/repositories/metadataRepository');
            const res = await getAllowedRoutes(userId);
            allowedRoutes = res.sales || [];
        } catch (e) { console.warn('[FullSync] Error rutas locales:', e); }
    }

    const tasks = [
        {
            name: 'Clientes',
            weight: 50,
            fn: async () => {
                const { syncClientsForRoutes, syncAllClients } = await import('@/repositories/clientsRepository');
                if (isJefe) {
                    return await syncAllClients();
                }
                return await syncClientsForRoutes(allowedRoutes);
            }
        },
        { name: 'Evaluaciones', weight: 5, fn: () => getAllEvaluations() },
        {
            name: 'Visitas',
            weight: 15,
            fn: async () => {
                const { syncVisitsForRoutes } = await import('@/repositories/visitsRepository');
                return await syncVisitsForRoutes(allowedRoutes);
            }
        },
        {
            name: 'Ventas (3 meses + Año anterior)',
            weight: 15,
            fn: async () => {
                const threeMonthsAgo = new Date();
                threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

                const { syncSalesForRoutes } = await import('@/repositories/salesRepository');

                // 1. Ventas recientes (últimos 3 meses)
                const recentResult = await syncSalesForRoutes(allowedRoutes, {
                    from: threeMonthsAgo.toISOString().slice(0, 10),
                    to: new Date().toISOString().slice(0, 10)
                });

                // 2. Ventas del mismo periodo del año anterior (para comparativa YoY en dashboards)
                const prevYearFrom = new Date();
                prevYearFrom.setFullYear(prevYearFrom.getFullYear() - 1);
                prevYearFrom.setMonth(prevYearFrom.getMonth() - 1); // 1 mes extra para cubrir MoM del año anterior
                prevYearFrom.setDate(1);
                const prevYearTo = new Date();
                prevYearTo.setFullYear(prevYearTo.getFullYear() - 1);
                // Fin del mes actual del año anterior
                prevYearTo.setMonth(prevYearTo.getMonth() + 1, 0);

                try {
                    await syncSalesForRoutes(allowedRoutes, {
                        from: prevYearFrom.toISOString().slice(0, 10),
                        to: prevYearTo.toISOString().slice(0, 10)
                    });
                    console.log('[FullSync] Ventas año anterior sincronizadas correctamente');
                } catch (e) {
                    console.warn('[FullSync] Error sincronizando ventas año anterior (no crítico):', e);
                }

                return recentResult;
            }
        },
        {
            name: 'Metas',
            weight: 5,
            fn: async () => {
                const { syncGoalsForRoutes } = await import('@/repositories/goalsRepository');
                return await syncGoalsForRoutes(allowedRoutes);
            }
        },
        {
            name: 'Metas de Zona',
            weight: 5,
            fn: async () => {
                const { syncZoneGoalsForZones } = await import('@/repositories/goalsRepository');
                return await syncZoneGoalsForZones(allowedZones);
            }
        },
        {
            name: 'Metadatos',
            weight: 10,
            fn: async () => {
                const [d1, d3, d4] = await Promise.all([
                    supabase.from('sku_descripcion').select('*'),
                    // sku_images deprecated
                    supabase.from('Canal').select('*'),
                    supabase.from('asset_types').select('*')
                ]);

                const {
                    saveSkuDescriptionsToLocal,
                    // saveSkuImagesToLocal,
                    saveChannelsToLocal,
                    saveAssetTypesToLocal
                } = await import('@/repositories/metadataRepository');

                if (d1.data) await saveSkuDescriptionsToLocal(d1.data);
                // if (d2.data) await saveSkuImagesToLocal(d2.data); 
                if (d3.data) await saveChannelsToLocal(d3.data);
                if (d4.data) await saveAssetTypesToLocal(d4.data);
            }
        },
        {
            name: 'Catálogo de Productos',
            weight: 10,
            fn: async () => {
                const { syncProducts } = await import('@/repositories/productsRepository');
                await syncProducts();
            }
        },
        {
            name: 'Configuración de Evaluaciones',
            weight: 5,
            fn: async () => {
                await syncEvaluationConfig();
            }
        },
        {
            name: 'Reglas de Precio',
            weight: 5,
            fn: async () => {
                const { syncPricingData } = await import('@/repositories/pricingRepository');
                await syncPricingData();
            }
        },
        {
            name: 'Puntos de Clientes',
            weight: 5,
            fn: async () => {
                const { syncClientPointsSummary } = await import('@/repositories/clientPointsRepository');
                await syncClientPointsSummary();
            }
        },
        {
            name: 'Configuración Supervisor',
            weight: 5,
            fn: async () => {
                const [r1, r2, r3] = await Promise.all([
                    supabase.from('supervisor_allowed_routes').select('*').eq('supervisor_id', userId),
                    supabase.from('supervisor_allowed_sales_routes').select('*').eq('supervisor_id', userId),
                    supabase.from('supervisor_allowed_zonas').select('*').eq('supervisor_id', userId)
                ]);
                // RLS/network errors can return null data. Do not interpret that as
                // an empty permission snapshot and erase the device's offline cache.
                if (r1.error || r2.error || r3.error || !Array.isArray(r1.data) || !Array.isArray(r2.data) || !Array.isArray(r3.data)) {
                    throw r1.error || r2.error || r3.error || new Error('Invalid supervisor routes response');
                }
                const { saveAllowedRoutesToLocal } = await import('@/repositories/metadataRepository');
                await saveAllowedRoutesToLocal(r1.data, r2.data, r3.data, userId);
            }
        },
        {
            name: 'Inventario (Camión)',
            weight: 10,
            fn: async () => getTruckInventory(userId)
        },
        {
            name: 'Órdenes de Trabajo',
            weight: 20,
            fn: async () => {
                const { syncOrders, syncAllOrders, getAssetTypes } = await import('@/repositories/ordersRepository');
                await getAssetTypes();
                if (isJefe) {
                    await syncAllOrders();
                } else {
                    await syncOrders(userId);
                }
            }
        },
        {
            name: 'Mapas Offline',
            weight: 20,
            fn: async () => {
                if (isJefe) {
                    console.log('[FullSync] Skipping MapTiles for Jefe Role (Performance)');
                    return;
                }
                const { getClients } = await import('@/repositories/clientsRepository');
                const clients = await getClients();
                const { syncMapTilesOffline } = await import('@/lib/mapOfflineHelper');
                await syncMapTilesOffline(clients);
            }
        },
        {
            name: 'Supervisiones a Bordo',
            weight: 15,
            fn: async () => {
                const { syncOnboardSupervisions } = await import('@/repositories/onboardSupervisionRepository');
                return await syncOnboardSupervisions(userId);
            }
        }
    ];

    const totalWeight = tasks.reduce((sum, t) => sum + (t.weight || 10), 0);
    let completedWeight = 0;
    const results = [];

    try {
        // Prevent screen sleep on Native
        if (Capacitor.isNativePlatform()) {
            await KeepAwake.keepAwake().catch(() => {});
        }

        for (const task of tasks) {
            const weight = task.weight || 10;
            
            // Setup smooth interpolator for this task
            let simulatedProgress = 0;
            const tickInterval = setInterval(() => {
                // Progress up to 90% of the task's weight
                if (simulatedProgress < 0.9) {
                    simulatedProgress += 0.05; 
                    if (onProgress) {
                        onProgress(completedWeight + (simulatedProgress * weight), totalWeight, `Descargando: ${task.name}...`);
                    }
                }
            }, 500);

            if (onProgress) {
                onProgress(completedWeight, totalWeight, `Descargando: ${task.name}...`);
            }

            try {
                const start = Date.now();
                const res = await task.fn();
                const elapsed = Date.now() - start;

                let info = '';
                if (Array.isArray(res)) info = `${res.length} ítems`;

                results.push({ name: task.name, success: true, elapsed, info, count: Array.isArray(res) ? res.length : 1 });
                console.log(`[SYNC_PROGRESS] ✓ ${task.name} completado (${info})`);
                console.log(`[FullSync] ✓ ${task.name} (${info}) (${elapsed}ms)`);
            } catch (e) {
                console.error(`[FullSync] Task ${task.name} failed:`, e);
                results.push({ name: task.name, success: false, error: e.message });
                console.error(`[FullSync] ✗ Error en ${task.name}:`, e);
            } finally {
                clearInterval(tickInterval);
            }

            completedWeight += weight;
            if (onProgress) {
                onProgress(completedWeight, totalWeight, `✓ ${task.name}`);
            }

            // Anti-freeze pause between tasks
            await new Promise(r => setTimeout(r, 200));
        }
    } finally {
        // Allow screen to sleep again
        if (Capacitor.isNativePlatform()) {
            await KeepAwake.allowSleep().catch(() => {});
        }
    }

    if (onProgress) onProgress(totalWeight, totalWeight, 'Descarga completa');

    const now = new Date().toISOString();
    await kvStorage.setItem('last_full_sync', now);
    await kvStorage.setItem('last_full_sync_user', userId);

    const successCount = results.filter(r => r.success).length;
    console.log(`[FullSync] Finalizado: ${successCount}/${tasks.length}`);

    return { success: successCount > 0, timestamp: now, results };
}

/**
 * Sincronización completa
 */
export async function fullSync(userId, userRole, onProgress = null) {
    if (onProgress) onProgress(0, 2, 'Subiendo datos pendientes...');

    try {
        await syncPendingOperations();
        console.log('[FullSync] ✓ Pendientes sincronizados');
    } catch (e) {
        console.error('[FullSync] ✗ Error subiendo pendientes:', e);
    }

    if (onProgress) onProgress(1, 2, 'Descargando datos actualizados...');

    await downloadAllData(userId, userRole, (curr, total, status) => {
        if (onProgress) {
            const overall = 1 + (curr / total);
            onProgress(overall, 2, status);
        }
    });

    if (onProgress) onProgress(2, 2, '¡Sincronización completa!');

    return { success: true };
}

export async function getLastSyncTime() {
    try {
        const timestamp = await kvStorage.getItem('last_full_sync');
        return timestamp ? new Date(timestamp) : null;
    } catch {
        return null;
    }
}

export async function getLastSyncUser() {
    try {
        return await kvStorage.getItem('last_full_sync_user');
    } catch {
        return null;
    }
}

export async function needsSync(hours = 24) {
    const lastSync = await getLastSyncTime();
    if (!lastSync) return true;

    const hoursAgo = Date.now() - hours * 3600000;
    return lastSync.getTime() < hoursAgo;
}
