import { useEffect } from 'react';
import { setupNetworkSync, isOnline } from '@/lib/network';
import { syncPendingOperations } from '@/sync/syncService';

/**
 * Componente invisible que maneja la sincronización automática.
 * 1. Al montar: Intenta subir pendientes si hay internet.
 * 2. Al cambiar red de Offline -> Online: Sube pendientes.
 */
export default function NetworkAutoSync() {
    useEffect(() => {
        // 1. Configurar listener de cambios de red
        setupNetworkSync().catch(err => console.error('[NetworkAutoSync] Error setup listeners:', err));

        // 2. Intentar sync inicial al abrir la app (Startup Sync)
        const runStartupSync = async () => {
            const online = await isOnline().catch(() => false);
            if (online) {
                console.log('[NetworkAutoSync] App iniciada y Online -> Verificando pendientes...');
                try {
                    await syncPendingOperations();
                } catch (e) {
                    console.error('[NetworkAutoSync] Error en startup sync:', e);
                }
            }
        };

        runStartupSync();
    }, []);

    return null; // Componente lógico, no renderiza nada
}
