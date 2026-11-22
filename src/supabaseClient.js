import { createClient } from "@supabase/supabase-js";
import { kvStorage } from "@/services/kvStorage";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error("Faltan variables de entorno: VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY");
}

// Usa un Symbol global para evitar colisiones entre bundles/HMR
const GLOBAL_KEY = Symbol.for("app.supabase.client");

function _create() {
  // Eliminamos la storageKey personalizada para usar el default de Supabase.
  // Esto puede resolver conflictos si en otra parte del código se crea un cliente
  // sin esta configuración, ya que ahora ambos usarán el mismo storage.
  return createClient(supabaseUrl, supabaseAnon, {
    auth: {
      storage: {
        // Adapter to align kvStorage (Object based) with Supabase (String based)
        // Prevents "Cannot create property 'user' on string" error
        async getItem(key) {
          const val = await kvStorage.getItem(key); // Returns Object or null
          return val ? JSON.stringify(val) : null;  // Return JSON String to Supabase
        },
        async setItem(key, value) {
          // Supabase passes a JSON string. kvStorage expects Object (will stringify it).
          // So we parse it first to avoid double stringification.
          try {
            const parsed = JSON.parse(value);
            await kvStorage.setItem(key, parsed);
          } catch {
            // Fallback for non-JSON strings
            await kvStorage.setItem(key, value);
          }
        },
        async removeItem(key) {
          try {
            const { isOnline } = await import('@/lib/network');
            const online = await isOnline().catch(() => false);
            if (!online) {
              console.warn(`[supabaseClient] 🛡️ Ignorando removeItem("${key}") porque el dispositivo está OFFLINE. Preservando sesión.`);
              return;
            }
            await kvStorage.removeItem(key);
          } catch {
            await kvStorage.removeItem(key);
          }
        }
      },
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    },
  });
}

const globalScope = globalThis;

// Reutiliza instancia si ya existe (HMR, StrictMode)
export const supabase = (() => {
  if (!globalScope[GLOBAL_KEY]) {
    globalScope[GLOBAL_KEY] = _create();
  }
  return globalScope[GLOBAL_KEY];
})();

// Exponer en window solo para depuración (Chrome DevTools)
if (typeof window !== "undefined") {
  window.supabase = supabase;
}
