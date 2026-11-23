import { useEffect } from 'react';
import { Network } from '@capacitor/network';
import { initLocalDb, getDb } from '@/lib/localDb';
import { syncPendingOperations, syncKioskData } from '@/sync/syncService';
import { syncProducts } from '@/repositories/productsRepository';
import { syncPricingData } from '@/repositories/pricingRepository';
import { syncInstallerData } from '@/repositories/ordersRepository';
import { getClientsPaged } from '@/repositories/clientsRepository';
import { fetchShopProducts } from '@/repositories/shopRepository';
import { api, flushOfflineApiQueue } from '@/lib/api';
import { getTodayMexico } from '@/lib/dateUtils';

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
          const currentMonth = (getTodayMexico() || new Date().toISOString().slice(0, 10)).slice(0, 7);
          api.get(`/televenta/orders-list.php?month=${encodeURIComponent(currentMonth)}`).then(async (res) => {
            if (res?.success && Array.isArray(res?.data) && res.data.length > 0) {
              const cacheKey = `cached_televenta_orders_${currentMonth}`;
              const db = await getDb().catch(() => null);
              const existing = db?._storage?.get(cacheKey);
              const existingOrders = Array.isArray(existing?.orders) ? existing.orders : [];
              if (existingOrders.length === 0) {
                const mapped = res.data.map(order => ({
                  ...order,
                  source: 'shop',
                  created_by_name: order.client_name ? `${order.client_name} (Cliente)` : `Cliente Online (${order.client_code})`,
                  created_by_role: 'Cliente Web',
                  created_by_type: 'client'
                }));
                const payload = { savedAt: Date.now(), orders: mapped };
                try { db?._storage?.set(cacheKey, payload); } catch {}
                try { localStorage.setItem(cacheKey, JSON.stringify(payload)); } catch {}
              }
            }
          }).catch(() => {});
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
