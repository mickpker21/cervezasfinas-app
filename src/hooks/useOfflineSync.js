import { useEffect } from 'react';
import { Network } from '@capacitor/network';
import { initLocalDb } from '@/lib/localDb';
import { syncPendingOperations, syncKioskData } from '@/sync/syncService';
import { syncProducts } from '@/repositories/productsRepository';
import { syncPricingData } from '@/repositories/pricingRepository';
import { syncInstallerData } from '@/repositories/ordersRepository';
import { getClientsPaged } from '@/repositories/clientsRepository';
import { fetchShopProducts } from '@/repositories/shopRepository';
import { api, flushOfflineApiQueue } from '@/lib/api';

export function useOfflineSync() {
  useEffect(() => {
    // ✅ FIX: cancelled flag prevents a zombie Network listener from accumulating
    // when the component remounts (e.g. hot-reload, StrictMode double-invoke).
    let cancelled = false;
    let subscription = null;

    async function init() {
      try {
        await initLocalDb();

        const status = await Network.getStatus();
        const isConn = status.connected;

        if (isConn) {
          await syncPendingOperations();
          flushOfflineApiQueue().catch(() => {});
          syncProducts().catch(() => {});
          syncPricingData().catch(() => {});
          syncKioskData().catch(() => {});
          syncInstallerData().catch(() => {});
          // Precargar padrón de clientes, catálogo Shop con presentaciones y pedidos Televenta en disco para modo Offline
          getClientsPaged({ page: 1, pageSize: 3500, filters: {} }).catch(() => {});
          fetchShopProducts('DEFAULT').catch(() => {});
          api.get('/televenta/orders-list.php').catch(() => {});
          api.get('/televenta/preventa-overrides.php').catch(() => {});
        }

        // ✅ FIX: Assign subscription THEN check if we were cancelled while awaiting.
        // If yes, remove immediately so we don't leak a listener.
        let wasOffline = !isConn;
        const sub = await Network.addListener('networkStatusChange', async (netStatus) => {
          const nowOnline = netStatus.connected;

          if (wasOffline && nowOnline) {
            try {
              await syncPendingOperations();
              await flushOfflineApiQueue();
            } catch (e) {
              // Failed silently — will retry on next reconnect
            }
          }

          wasOffline = !nowOnline;
        });

        if (cancelled) {
          // Component unmounted while addListener was resolving — clean up now
          sub?.remove();
        } else {
          subscription = sub;
        }

      } catch (err) {
        console.error('[OfflineSync] No se pudo inicializar el almacenamiento persistente:', err);
        if (!cancelled) {
          window.dispatchEvent(new CustomEvent('offline-storage-error', {
            detail: { message: err?.message || 'No se pudo iniciar el almacenamiento local.' }
          }));
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
        subscription = null;
      }
    };
  }, []);
}
