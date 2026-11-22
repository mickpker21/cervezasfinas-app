import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Helmet } from "react-helmet-async";
import InteractiveMap from "@/components/common/InteractiveMap";
import { Loader2 } from "lucide-react";
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

function currentMonthYYYYMM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function DynamicAdvisorMap() {
  const { user } = useSupabaseAuth();
  const [userRoute, setUserRoute] = useState("");
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);

  const [month, setMonth] = useState(currentMonthYYYYMM());
  const [flaggedCodes, setFlaggedCodes] = useState(new Set());
  const [loadingFlags, setLoadingFlags] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loadRoute = async () => {
      try {
        const { detectUserRoute } = await import('@/repositories/routeRepository');
        let currentUser = user;
        if (!currentUser) {
          const { data } = await supabase.auth.getSession();
          currentUser = data?.session?.user;
        }
        const r = await detectUserRoute(currentUser);
        if (!cancelled && r) {
          setUserRoute(r);
        }
      } catch (e) { console.error(e); }
    };
    loadRoute();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!userRoute) return;
    let cancelled = false;
    (async () => {
      setLoadingClients(true);
      setError(null);
      try {
        // OFFLINE-FIRST: Usar repositorio
        const { getClients } = await import('@/repositories/clientsRepository');

        // Pass userRoute to enable server-side filtering (MySQL)
        // This prevents downloading thousands of unrelated clients
        const clientsData = await getClients(userRoute);

        // Filter valid matches (exact or partial if route formats vary)
        const ur = String(userRoute).trim().toLowerCase();

        const filtered = clientsData.filter(c => {
          const sr = String(c.sales_route || '').trim().toLowerCase();
          const ir = String(c.internal_route || '').trim().toLowerCase();

          return sr === ur || ir === ur || (ur && (sr.includes(ur) || ir.includes(ur)));
        });

        if (!cancelled) setClients(filtered);
      } catch (err) {
        console.error("Error fetching clients:", err);
        if (!cancelled) {
          setClients([]);
          setError("No se pudieron cargar clientes.");
        }
      } finally {
        if (!cancelled) setLoadingClients(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userRoute]);

  useEffect(() => {
    if (!userRoute || clients.length === 0) return;
    let cancelled = false;
    (async () => {
      setLoadingFlags(true);
      try {
        const { getMonthlyRouteSales } = await import('@/repositories/salesRepository');

        // 1. Get sales for this route/month
        const salesData = await getMonthlyRouteSales(userRoute, month);
        // Map client_code -> total sales
        const clientSales = new Map();
        salesData.forEach(s => {
          // normalize code if needed
          const code = String(s.client_code || '').trim();
          if (code) clientSales.set(code, (clientSales.get(code) || 0) + Number(s.total_hl || 0));
        });

        // 2. Identify clients with assets
        const flagged = new Set();
        clients.forEach(c => {
          // check if has assets
          const hasAssets = (Array.isArray(c.cooler_serials) && c.cooler_serials.length > 0) ||
            (c.cooler_serials && typeof c.cooler_serials === 'string' && c.cooler_serials.length > 2);

          if (hasAssets) {
            const code = String(c.client_code || '').trim();
            const sales = clientSales.get(code) || 0;
            if (sales <= 0 && code) {
              flagged.add(code);
            }
          }
        });

        console.log("Calculated flagged codes (Assets w/o Sales):", flagged.size);
        if (!cancelled) setFlaggedCodes(flagged);
      } catch (err) {
        console.error("Error calculating flagged clients:", err);
        if (!cancelled) setFlaggedCodes(new Set());
      } finally {
        if (!cancelled) setLoadingFlags(false);
      }
    })();
    return () => { cancelled = true; };
  }, [month, userRoute, clients]);

  const itemsForMap = useMemo(() => {
    const mapped = (clients || []).map((c) => ({
      ...c,
      client_code: c.client_code ?? c.codigo ?? null,
    }));
    console.log(
      "itemsForMap sample:",
      mapped.slice(0, 5).map((c) => ({ code: String(c.client_code), name: c.name || c.business_name }))
    );
    console.log("flaggedCodes size:", flaggedCodes.size);
    return mapped;
  }, [clients, flaggedCodes]);

  return (
    <div className="container mx-auto py-8">
      <Helmet><title>Mapa Asesor Dinámico</title></Helmet>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Mapa de mi ruta</h1>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-gray-700">
            Mes (YYYY-MM):
            <input
              type="month"
              className="ml-2 border rounded px-2 py-1 text-sm"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          {loadingFlags && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-600">
              <Loader2 className="w-4 h-4 animate-spin" /> Actualizando banderas...
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-rose-200 bg-rose-50 text-rose-700 p-2 text-sm">{error}</div>
      )}

      {loadingClients ? (
        <div className="h-96 flex items-center justify-center text-gray-600">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Cargando clientes...
        </div>
      ) : (
        <InteractiveMap
          items={itemsForMap}
          height="28rem"
          allowManualPick={false}
          flaggedClientCodes={flaggedCodes}
        />
      )}
    </div>
  );
}
