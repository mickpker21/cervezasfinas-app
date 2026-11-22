import React, { useEffect, useState } from 'react';
import { Network } from '@capacitor/network';
import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let subscription;

    async function init() {
      try {
        const status = await Network.getStatus();
        setOffline(!status.connected);

        subscription = await Network.addListener('networkStatusChange', (status) => {
          setOffline(!status.connected);
        });
      } catch (err) {
        console.warn('[OfflineBanner] Error inicializando Network', err);
      }
    }

    init();

    return () => {
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      className="w-full z-50 flex items-center justify-center gap-2 bg-amber-400 text-amber-950 py-2 px-4 shadow-md animate-in slide-in-from-top"
      style={{ position: 'sticky', top: 0 }}
    >
      <WifiOff className="h-4 w-4" />
      <span className="text-xs sm:text-sm font-medium">
        Modo Offline: Los cambios se guardarán localmente y se sincronizarán al conectar.
      </span>
    </div>
  );
}
