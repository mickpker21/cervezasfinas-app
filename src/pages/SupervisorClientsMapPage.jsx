import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { getAllowedRoutes as getRoutesMeta, getAllowedZonas } from '@/repositories/metadataRepository';
import InteractiveMap from '@/components/common/InteractiveMap';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Store, Map as MapIcon, Target, Filter, ChevronLeft } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getClients, syncClientsForRoutes, countLocalClients } from '@/repositories/clientsRepository';
import { Link } from 'react-router-dom';

// Helper functions for normalization (shared with Dashboard)
const strip = (s) => (s || "").toString().trim();
const norm = (s) => strip(s).toUpperCase();
const clientCodeKey = (s) => norm(s).replace(/[^A-Z0-9]/g, "");

// Persistent session cache
let cachedAllowedZonas = null;
let cachedAllowedRoutes = null;
let cachedClients = null;
let cachedPermissionsLoaded = false;

export default function SupervisorClientsMapPage() {
  const { user } = useSupabaseAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState("Cargando...");

  // Permissions / Filters
  const [allowedZonas, setAllowedZonas] = useState(cachedAllowedZonas || []);
  const [allowedRoutes, setAllowedRoutes] = useState(cachedAllowedRoutes || []);
  const [selectedZona, setSelectedZona] = useState("__ALL__");
  const [selectedRoute, setSelectedRoute] = useState("__ALL__");
  const [permissionsLoaded, setPermissionsLoaded] = useState(cachedPermissionsLoaded);

  // Load Permissions
  useEffect(() => {
    if (cachedPermissionsLoaded) return;
    let active = true;
    (async () => {
      if (!user) return;
      try {
        setLoadingText("Verificando permisos...");
        // Usar metadataRepository con fallback SQLite → Supabase
        const [routesMeta, zonasList] = await Promise.all([
          getRoutesMeta(user.id),
          getAllowedZonas(user.id)
        ]);

        if (!active) return;

        const zList = (zonasList || []).filter(Boolean);
        const rList = (routesMeta?.sales || []).filter(Boolean);

        cachedAllowedZonas = zList;
        cachedAllowedRoutes = rList;
        cachedPermissionsLoaded = true;

        setAllowedZonas(zList);
        setAllowedRoutes(rList);

        // Auto-select if only one option
        setSelectedZona(zList.length > 1 ? "__ALL__" : (zList[0] ?? "__ALL__"));
        setSelectedRoute("__ALL__");
      } catch (e) {
        console.error("Error loading permissions:", e);
      } finally {
        if (active) setPermissionsLoaded(true);
      }
    })();
    return () => { active = false; };
  }, [user]);

  // Load Clients (Dependent on permissions)
  useEffect(() => {
    if (!permissionsLoaded) return;
    if (cachedClients && cachedClients.length > 0) {
      setClients(cachedClients);
      setLoading(false);
      return;
    }

    let active = true;
    (async () => {
      setLoading(true);
      setLoadingText("Cargando clientes...");
      try {
        // 1. Check if we have local clients
        const count = await countLocalClients();
        console.log(`[SupervisorMap] Local clients count: ${count}`);

        // 2. If empty (or force refresh logic implied), try to sync relevant routes
        if (count === 0) {
          setLoadingText("Sincronizando clientes (1ra vez)...");
          console.log(`[SupervisorMap] Local DB empty. Triggering sync for ${allowedRoutes.length} routes...`);
          await syncClientsForRoutes(allowedRoutes);
        }

        // 3. Load from local (now populated)
        // Note: passing allowedRoutes to getClients IS supported by fetchAllClientsOnline but getClients 
        // logic wraps it. Best to read purely local now that we synced.
        const allClients = await getClients();

        if (!active) return;
        cachedClients = allClients || [];
        setClients(cachedClients);
        console.log(`[SupervisorMap] Loaded ${cachedClients?.length || 0} clients.`);

      } catch (err) {
        console.error('Error fetching clients:', err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [permissionsLoaded, allowedRoutes]);

  // Filter Clients Logic
  const filteredClients = useMemo(() => {
    return (clients || []).filter(c => {
      // 1. Must have coordinates
      const hasCoords = (c.lat || c.latitud || c.latitude) && (c.lng || c.longitud || c.longitude);
      if (!hasCoords && !c.coords) return false;

      const z = strip(c.zona || c.region || c.zona_comercial);
      const r = strip(c.sales_route || c.ruta || c.internal_route || c.route);

      // 2. Permission check (if limited)
      if (allowedZonas.length > 0) {
        const allowed = allowedZonas.map(strip);
        // If client has no zona, we exclude it if strict, or maybe include? Safe bet: exclude if doesn't match.
        if (!z || !allowed.some(az => norm(az) === norm(z))) return false;
      }

      // 3. UI Selection filters
      if (selectedZona !== "__ALL__" && norm(z) !== norm(selectedZona)) return false;

      if (selectedRoute !== "__ALL__") {
        const sel = norm(selectedRoute);
        const rut = norm(r);
        // Fuzzy match for route (e.g. "101" matches "RUTA 101")
        if (!rut.includes(sel)) return false;
      }

      return true;
    });
  }, [clients, allowedZonas, selectedZona, selectedRoute]);

  // Normalize for Map Component
  const mapItems = useMemo(() => {
    const toNumber = (v) => {
      if (typeof v === 'number') return isFinite(v) ? v : null;
      if (typeof v === 'string') {
        const n = parseFloat(v);
        return isFinite(n) ? n : null;
      }
      return null;
    };

    return filteredClients.map(c => {
      let lat = toNumber(c.lat ?? c.latitude ?? c.latitud);
      let lng = toNumber(c.lng ?? c.longitude ?? c.longitud);

      // Try parsing 'coords' object/string if top-level fields failed
      if ((lat === null || lng === null) && c.coords) {
        let val = c.coords;
        if (typeof val === 'string') {
          try { val = JSON.parse(val); } catch (e) { }
        }
        if (Array.isArray(val) && val.length >= 2) {
          lat = toNumber(val[0]);
          lng = toNumber(val[1]);
        } else if (typeof val === 'object') {
          lat = toNumber(val.lat ?? val.latitude ?? val.Lat ?? val.latitud);
          lng = toNumber(val.lng ?? val.longitude ?? val.Lng ?? val.longitud);
        }
      }

      if (lat === null || lng === null) return null;

      return {
        ...c,
        coords: { lat, lng },
        title: c.name || c.business_name || "Cliente",
        subtitle: `Ruta: ${c.sales_route || c.ruta || '?'} | Zona: ${c.zona || '?'}`,
        // Add marker color logic if needed based on status, etc.
      };
    }).filter(Boolean);
  }, [filteredClients]);

  // Available Routes for Dropdown (based on filtered clients or permissions?)
  // Better to use permissions + what exists in data to avoid showing empty routes
  const availableRoutes = useMemo(() => {
    if (selectedZona === "__ALL__") {
      return allowedRoutes.length > 0 ? allowedRoutes : [];
      // Or derive from filteredClients if you only want to show routes that actually have map pins?
      // Let's stick to permissions for consistency with Dashboard first.
    }
    // If Zone selected, show routes from that zone (derived from clients would be most accurate here)
    const routesInZone = new Set();
    filteredClients.forEach(c => {
      const r = strip(c.sales_route || c.ruta || c.internal_route || c.route);
      if (r) routesInZone.add(r);
    });
    return Array.from(routesInZone).sort();
  }, [selectedZona, allowedRoutes, filteredClients]);


  return (
    <>
      <Helmet><title>Mapa de Clientes - Cervezas Finas</title></Helmet>

      <div className="flex flex-col h-screen bg-slate-900 text-white overflow-hidden">

        {/* Header Premium */}
        <div className="shrink-0 z-[1001] bg-black/60 backdrop-blur-xl border-b border-white/10 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-0">

            {/* Title / Back */}
            <div className="flex items-center gap-4 w-full md:w-auto">
              <Link to="/supervisor/dashboard" className="p-2 -ml-2 rounded-full hover:bg-white/10 transition text-white/70 hover:text-white">
                <ChevronLeft className="w-6 h-6" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <MapIcon className="w-6 h-6 text-black" />
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight text-white leading-none">
                    Mapa de Clientes
                  </h1>
                  <p className="text-xs text-emerald-400 font-medium mt-1">
                    Supervisión en Campo
                  </p>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-none">

              {/* Zona */}
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                <Filter className="w-3.5 h-3.5 text-emerald-500" />
                <Select value={selectedZona} onValueChange={setSelectedZona}>
                  <SelectTrigger className="border-0 bg-transparent p-0 h-auto text-sm text-white focus:ring-0 w-[100px] md:w-[140px]">
                    <SelectValue placeholder="Zona" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                    <SelectItem value="__ALL__">Todas las Zonas</SelectItem>
                    {allowedZonas.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Ruta */}
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                <Target className="w-3.5 h-3.5 text-emerald-500" />
                <Select value={selectedRoute} onValueChange={setSelectedRoute}>
                  <SelectTrigger className="border-0 bg-transparent p-0 h-auto text-sm text-white focus:ring-0 w-[100px] md:w-[140px]">
                    <SelectValue placeholder="Ruta" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                    <SelectItem value="__ALL__">Todas las Rutas</SelectItem>
                    {availableRoutes.map(r => <SelectItem key={r} value={r}>Ruta {r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="h-8 w-[1px] bg-white/10 mx-1"></div>

              <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold whitespace-nowrap">
                {mapItems.length} Clientes
              </div>
            </div>
          </div>
        </div>

        {/* Map Container */}
        <div className="flex-1 relative w-full h-full min-h-0 bg-slate-800">
          {loading && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-white font-medium animate-pulse">{loadingText}</p>
              </div>
            </div>
          )}

          <InteractiveMap
            items={mapItems}
            height="100%"
            className="mb-0"
          // We can add a custom pin render or color logic here if needed, 
          // but default green pins from InteractiveMap usually work well.
          // Assuming InteractiveMap uses "items" for pins.
          />
        </div>

      </div>
    </>
  );
}
