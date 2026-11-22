import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "../../../supabaseClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Map, Truck, Navigation, CheckCircle2, Circle, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/* ---------------- Helpers ---------------- */

function uniqClean(arr) {
  return Array.from(
    new Set(
      (arr || [])
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

/** Paginación robusta para tabla en Supabase */
async function fetchAllRows({ table, columns = "*", pageSize = 1000, buildQuery }) {
  let offset = 0;
  let rows = [];
  while (true) {
    let q = buildQuery(supabase.from(table).select(columns));
    const { data, error } = await q.range(offset, offset + pageSize - 1);
    if (error) throw error;
    const chunk = Array.isArray(data) ? data : [];
    rows = rows.concat(chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

/* ------------- Subcomponente: SelectionGrid Premium ------------- */

function SelectionGrid({ 
  items, 
  selectedItems, 
  onToggle, 
  onSelectAll, 
  onUnselectAll, 
  searchPlaceholder = "Buscar...",
  loading = false,
  emptyMessage = "No hay elementos disponibles"
}) {
  const [query, setQuery] = useState("");

  const filteredItems = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(item => item.toLowerCase().includes(q));
  }, [items, query]);

  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every(i => selectedItems.includes(i));

  const handleToggleAll = () => {
    if (allFilteredSelected) {
      onUnselectAll(filteredItems);
    } else {
      onSelectAll(filteredItems);
    }
  };

  return (
    <div className="flex flex-col h-[500px] border border-white/10 rounded-lg bg-black/20 overflow-hidden">
      {/* Top Bar */}
      <div className="p-3 bg-white/5 border-b border-white/10 flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <Input 
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9 h-9 bg-black/40 border-white/10 focus-visible:ring-green-500/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/50 bg-black/30 px-2 py-1 rounded-md font-mono">
            {selectedItems.length} / {items.length}
          </span>
          <Button 
            variant="secondary" 
            size="sm" 
            className="h-9 text-xs"
            onClick={handleToggleAll}
            disabled={filteredItems.length === 0 || loading}
          >
            {allFilteredSelected ? "Desmarcar Visibles" : "Marcar Visibles"}
          </Button>
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-2 custom-scroll">
        {loading ? (
          <div className="flex h-full items-center justify-center text-white/50 text-sm">Cargando datos...</div>
        ) : filteredItems.length === 0 ? (
          <div className="flex h-full items-center justify-center text-white/50 text-sm">{emptyMessage}</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            <AnimatePresence>
              {filteredItems.map(item => {
                const isSelected = selectedItems.includes(item);
                return (
                  <motion.button
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={item}
                    onClick={() => onToggle(item)}
                    className={`
                      relative flex items-center gap-3 p-3 text-left rounded-lg border transition-all duration-200 group
                      ${isSelected 
                        ? 'bg-green-500/20 border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.15)]' 
                        : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                      }
                    `}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate transition-colors duration-200 ${isSelected ? 'text-green-300 font-medium' : 'text-white/80'}`}>
                        {item}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      {isSelected ? (
                        <CheckCircle2 className="w-5 h-5 text-green-400 drop-shadow-[0_0_5px_rgba(74,222,128,0.5)]" />
                      ) : (
                        <Circle className="w-5 h-5 text-white/20 group-hover:text-white/40 transition-colors" />
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Componente principal del diálogo ---------------- */

export default function SupervisorRoutesDialog({ isOpen, onClose, supervisor: user }) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [loadingAvail, setLoadingAvail] = useState(false);

  // Disponibles globales
  const [availableZonas, setAvailableZonas] = useState([]);
  const [availableRoutes, setAvailableRoutes] = useState([]);          // internal_route
  const [availableSalesRoutes, setAvailableSalesRoutes] = useState([]); // sales_route
  const [zonasRutasMap, setZonasRutasMap] = useState({}); // Mapa: zona -> [rutas]

  // Asignadas (DB)
  const [zones, setZones] = useState([]);           // supervisor_allowed_zonas
  const [routes, setRoutes] = useState([]);         // supervisor_allowed_routes
  const [salesRoutes, setSalesRoutes] = useState([]); // supervisor_allowed_sales_routes

  const supervisorId = user?.id;
  const [newSalesRoute, setNewSalesRoute] = useState("");
  const [newInternalRoute, setNewInternalRoute] = useState("");
  const [zonaToAssign, setZonaToAssign] = useState(null);

  // Cargar asignadas + disponibles al abrir
  useEffect(() => {
    const load = async () => {
      if (!isOpen || !supervisorId) return;
      setLoading(true);
      setLoadingAvail(true);
      try {
        // 1) Asignadas de este usuario
        const [z1, r1, r2] = await Promise.all([
          supabase.from("supervisor_allowed_zonas").select("zona").eq("supervisor_id", supervisorId).range(0, 99999),
          supabase.from("supervisor_allowed_routes").select("route").eq("supervisor_id", supervisorId).range(0, 99999),
          supabase.from("supervisor_allowed_sales_routes").select("sales_route").eq("supervisor_id", supervisorId).range(0, 99999),
        ]);
        setZones(uniqClean((z1.data || []).map((r) => r.zona)));
        setRoutes(uniqClean((r1.data || []).map((r) => r.route)));
        setSalesRoutes(uniqClean((r2.data || []).map((r) => r.sales_route)));

        // 2) Disponibles globales y mapa de zonas->rutas
        let allZonas = [];
        let mapZonaRutas = {};
        try {
          let zrRows = [];
          try {
            zrRows = await fetchAllRows({
              table: "zonas_rutas",
              columns: "zona, ruta, tipo_ruta",
              pageSize: 1000,
              buildQuery: (q) => q,
            });
          } catch (e) {
            console.warn("No tipo_ruta column, fallback to zona, ruta");
            zrRows = await fetchAllRows({
              table: "zonas_rutas",
              columns: "zona, ruta",
              pageSize: 1000,
              buildQuery: (q) => q,
            });
          }
          
          allZonas = uniqClean((zrRows || []).map((r) => r.zona));
          
          // Construir mapa estructurado
          zrRows.forEach(row => {
            if (row.zona && row.ruta) {
              if (!mapZonaRutas[row.zona]) {
                mapZonaRutas[row.zona] = { ventas: [], reparto: [], conquista: [] };
              }
              const tipo = row.tipo_ruta || 'ventas';
              if (mapZonaRutas[row.zona][tipo]) {
                mapZonaRutas[row.zona][tipo].push(row.ruta);
              } else {
                mapZonaRutas[row.zona]['ventas'].push(row.ruta);
              }
            }
          });
          setZonasRutasMap(mapZonaRutas);
        } catch (e) {
          console.warn("Could not load zonas_rutas from Supabase", e);
        }

        // Fetch routes from local DB (via Repository)
        const { getAvailableRoutes } = await import('../../../repositories/routeRepository');
        const available = await getAvailableRoutes();

        setAvailableZonas(allZonas);
        setAvailableRoutes(uniqClean(available.internal));
        setAvailableSalesRoutes(uniqClean(available.sales));
      } catch (error) {
        console.error(error);
        toast({
          title: "Error al cargar",
          description: error?.message || "No se pudo cargar la información.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
        setLoadingAvail(false);
      }
    };

    load();
  }, [isOpen, supervisorId, toast]);

  /* --------- Operaciones de Sincronización Automática Zona -> Rutas --------- */
  
  // Agrega rutas de manera masiva
  const addRoutesSilently = async (routesToAdd, table, column) => {
    if (!routesToAdd.length) return [];
    try {
      const payload = routesToAdd.map((r) => ({ supervisor_id: supervisorId, [column]: r }));
      const { error } = await supabase.from(table).upsert(payload, { onConflict: `supervisor_id,${column}` });
      if (error) throw error;
      return routesToAdd;
    } catch (e) {
      console.error("Error auto-assigning routes:", e);
      return [];
    }
  };

  // Quita rutas de manera masiva
  const removeRoutesSilently = async (routesToRemove, table, column) => {
    if (!routesToRemove.length) return [];
    try {
      await Promise.all(
        routesToRemove.map((r) =>
          supabase.from(table).delete().eq("supervisor_id", supervisorId).eq(column, r)
        )
      );
      return routesToRemove;
    } catch (e) {
      console.error("Error auto-removing routes:", e);
      return [];
    }
  };


  /* --------- Handlers: Zonas --------- */

  const toggleZona = async (zona) => {
    if (!supervisorId || !zona) return;
    const isAssigned = zones.includes(zona);
    
    if (isAssigned) {
      setLoading(true);
      try {
        // Desasignar Zona
        const { error } = await supabase.from("supervisor_allowed_zonas").delete().eq("supervisor_id", supervisorId).eq("zona", zona);
        if (error) throw error;
        setZones(prev => prev.filter(z => z !== zona));
        toast({ title: "Zona Desasignada", description: `Se ha quitado la zona "${zona}".` });
        
        // Auto-desasignar TODAS las rutas vinculadas (de todos los tipos)
        const rutasMapa = zonasRutasMap[zona] || { ventas: [], reparto: [], conquista: [] };
        const ventasRoutes = rutasMapa.ventas || [];
        const conquistaRoutes = rutasMapa.conquista || [];
        const repartoRoutes = rutasMapa.reparto || [];

        const allSalesTypes = [...ventasRoutes, ...repartoRoutes]; // En la DB actual, todo se guarda como sales_route si es operativo o venta
        
        if (allSalesTypes.length > 0) {
           await removeRoutesSilently(allSalesTypes, "supervisor_allowed_sales_routes", "sales_route");
           setSalesRoutes(prev => prev.filter(r => !allSalesTypes.includes(r)));
        }
        if (conquistaRoutes.length > 0) {
           await removeRoutesSilently(conquistaRoutes, "supervisor_allowed_routes", "route");
           setRoutes(prev => prev.filter(r => !conquistaRoutes.includes(r)));
        }
        
        toast({ title: "Rutas Actualizadas", description: `Se quitaron las rutas asociadas a la zona.` });
      } catch (e) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    } else {
      // Abre el diálogo para elegir el modo de asignación
      setZonaToAssign(zona);
    }
  };

  const confirmAssignZona = async (zona, mode) => {
    setZonaToAssign(null);
    setLoading(true);
    try {
      // Asignar Zona en la DB
      const { error } = await supabase.from("supervisor_allowed_zonas").upsert({ supervisor_id: supervisorId, zona });
      if (error) throw error;
      setZones(prev => uniqClean([...prev, zona]));
      toast({ title: "Zona Asignada", description: `Se ha agregado la zona "${zona}".` });
      
      const rutasMapa = zonasRutasMap[zona] || { ventas: [], reparto: [], conquista: [] };
      const ventasRoutes = rutasMapa.ventas || [];
      const conquistaRoutes = rutasMapa.conquista || [];
      const repartoRoutes = rutasMapa.reparto || [];

      let routesToAssignSales = [];
      let routesToAssignConquest = [];

      if (mode === 'ventas' || mode === 'todo') {
        routesToAssignSales.push(...ventasRoutes);
        routesToAssignConquest.push(...conquistaRoutes);
      }
      if (mode === 'reparto' || mode === 'todo') {
        routesToAssignSales.push(...repartoRoutes); // Reparto usa la misma columna en SupervisorAllowedSalesRoutes actualmente
      }

      if (routesToAssignSales.length > 0) {
         await addRoutesSilently(routesToAssignSales, "supervisor_allowed_sales_routes", "sales_route");
         setSalesRoutes(prev => uniqClean([...prev, ...routesToAssignSales]));
      }
      if (routesToAssignConquest.length > 0) {
         await addRoutesSilently(routesToAssignConquest, "supervisor_allowed_routes", "route");
         setRoutes(prev => uniqClean([...prev, ...routesToAssignConquest]));
      }

      toast({ title: "Rutas Asignadas", description: `Se asignaron las rutas correspondientes.` });
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const selectAllZonas = async (arr) => {
    if (!supervisorId || !arr.length) return;
    setLoading(true);
    try {
      const payload = arr.map((z) => ({ supervisor_id: supervisorId, zona: z }));
      const { error } = await supabase.from("supervisor_allowed_zonas").upsert(payload, { onConflict: 'supervisor_id,zona' });
      if (error) throw error;
      setZones(prev => uniqClean([...prev, ...arr]));
      
      // Auto-assign linked sales routes for ALL these zones (zonas_rutas.ruta = sales routes)
      let allLinked = [];
      arr.forEach(z => { if(zonasRutasMap[z]) allLinked.push(...zonasRutasMap[z]) });
      allLinked = uniqClean(allLinked);
      
      if(allLinked.length > 0) {
        await addRoutesSilently(allLinked, "supervisor_allowed_sales_routes", "sales_route");
        setSalesRoutes(prev => uniqClean([...prev, ...allLinked]));
      }
      
      toast({ title: "Zonas Asignadas", description: `Se han asignado ${arr.length} zonas y sus rutas correspondientes.` });
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const unselectAllZonas = async (arr) => {
    if (!supervisorId || !arr.length) return;
    setLoading(true);
    try {
      await Promise.all(
        arr.map((z) => supabase.from("supervisor_allowed_zonas").delete().eq("supervisor_id", supervisorId).eq("zona", z))
      );
      setZones(prev => prev.filter(z => !arr.includes(z)));
      
      // Auto-remove linked sales routes (zonas_rutas.ruta = sales routes)
      let allLinked = [];
      arr.forEach(z => { if(zonasRutasMap[z]) allLinked.push(...zonasRutasMap[z]) });
      allLinked = uniqClean(allLinked);
      
      if(allLinked.length > 0) {
        await removeRoutesSilently(allLinked, "supervisor_allowed_sales_routes", "sales_route");
        setSalesRoutes(prev => prev.filter(r => !allLinked.includes(r)));
      }

      toast({ title: "Zonas Desasignadas", description: `Se han quitado ${arr.length} zonas y sus rutas correspondientes.` });
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  /* --------- Handlers: Rutas de Conquista --------- */

  const toggleRoute = async (route) => {
    if (!supervisorId || !route) return;
    const isAssigned = routes.includes(route);
    setLoading(true);
    try {
      if (isAssigned) {
        const { error } = await supabase.from("supervisor_allowed_routes").delete().eq("supervisor_id", supervisorId).eq("route", route);
        if (error) throw error;
        setRoutes(prev => prev.filter(r => r !== route));
        toast({ title: "Ruta Desasignada", description: `Se quitó la ruta "${route}".` });
      } else {
        const { error } = await supabase.from("supervisor_allowed_routes").upsert({ supervisor_id: supervisorId, route });
        if (error) throw error;
        setRoutes(prev => uniqClean([...prev, route]));
        toast({ title: "Ruta Asignada", description: `Se agregó la ruta "${route}".` });
      }
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const selectAllRoutes = async (arr) => {
    if (!supervisorId || !arr.length) return;
    setLoading(true);
    try {
      const payload = arr.map((r) => ({ supervisor_id: supervisorId, route: r }));
      const { error } = await supabase.from("supervisor_allowed_routes").upsert(payload, { onConflict: 'supervisor_id,route' });
      if (error) throw error;
      setRoutes(prev => uniqClean([...prev, ...arr]));
      toast({ title: "Rutas Asignadas", description: `Se asignaron ${arr.length} rutas.` });
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const unselectAllRoutes = async (arr) => {
    if (!supervisorId || !arr.length) return;
    setLoading(true);
    try {
      await Promise.all(
        arr.map((r) => supabase.from("supervisor_allowed_routes").delete().eq("supervisor_id", supervisorId).eq("route", r))
      );
      setRoutes(prev => prev.filter(r => !arr.includes(r)));
      toast({ title: "Rutas Desasignadas", description: `Se quitaron ${arr.length} rutas.` });
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  /* --------- Handlers: Rutas de Venta --------- */

  const toggleSalesRoute = async (route) => {
    if (!supervisorId || !route) return;
    const isAssigned = salesRoutes.includes(route);
    setLoading(true);
    try {
      if (isAssigned) {
        const { error } = await supabase.from("supervisor_allowed_sales_routes").delete().eq("supervisor_id", supervisorId).eq("sales_route", route);
        if (error) throw error;
        setSalesRoutes(prev => prev.filter(r => r !== route));
        toast({ title: "Ruta Desasignada", description: `Se quitó la ruta "${route}".` });
      } else {
        const { error } = await supabase.from("supervisor_allowed_sales_routes").upsert({ supervisor_id: supervisorId, sales_route: route });
        if (error) throw error;
        setSalesRoutes(prev => uniqClean([...prev, route]));
        toast({ title: "Ruta Asignada", description: `Se agregó la ruta "${route}".` });
      }
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const selectAllSalesRoutes = async (arr) => {
    if (!supervisorId || !arr.length) return;
    setLoading(true);
    try {
      const payload = arr.map((r) => ({ supervisor_id: supervisorId, sales_route: r }));
      const { error } = await supabase.from("supervisor_allowed_sales_routes").upsert(payload, { onConflict: 'supervisor_id,sales_route' });
      if (error) throw error;
      setSalesRoutes(prev => uniqClean([...prev, ...arr]));
      toast({ title: "Rutas Asignadas", description: `Se asignaron ${arr.length} rutas de venta.` });
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const unselectAllSalesRoutes = async (arr) => {
    if (!supervisorId || !arr.length) return;
    setLoading(true);
    try {
      await Promise.all(
        arr.map((r) => supabase.from("supervisor_allowed_sales_routes").delete().eq("supervisor_id", supervisorId).eq("sales_route", r))
      );
      setSalesRoutes(prev => prev.filter(r => !arr.includes(r)));
      toast({ title: "Rutas Desasignadas", description: `Se quitaron ${arr.length} rutas de venta.` });
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };


  const handleAddNewSalesRoute = async () => {
    const r = newSalesRoute.trim();
    if (!r || !supervisorId) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("supervisor_allowed_sales_routes").upsert({ supervisor_id: supervisorId, sales_route: r }, { onConflict: 'supervisor_id,sales_route' });
      if (error) throw error;
      setAvailableSalesRoutes(prev => {
        const merged = Array.from(new Set([...prev, r])).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
        return merged;
      });
      setSalesRoutes(prev => Array.from(new Set([...prev, r])).sort());
      setNewSalesRoute("");
      toast({ title: "Ruta Agregada", description: `Ruta de venta "${r}" asignada correctamente.` });
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleAddNewInternalRoute = async () => {
    const r = newInternalRoute.trim();
    if (!r || !supervisorId) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("supervisor_allowed_routes").upsert({ supervisor_id: supervisorId, route: r }, { onConflict: 'supervisor_id,route' });
      if (error) throw error;
      setAvailableRoutes(prev => {
        const merged = Array.from(new Set([...prev, r])).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
        return merged;
      });
      setRoutes(prev => Array.from(new Set([...prev, r])).sort());
      setNewInternalRoute("");
      toast({ title: "Ruta Agregada", description: `Ruta de conquista "${r}" asignada correctamente.` });
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent
        aria-describedby="desc-supervisor-routes"
        className="max-w-[1000px] overflow-hidden flex flex-col p-0 gap-0"
      >
        <div id="desc-supervisor-routes" className="sr-only">
          Panel avanzado para asignar zonas y rutas
        </div>
        
        {/* Header Premium */}
        <div className="bg-gradient-to-r from-neutral-900 to-neutral-800 p-6 border-b border-white/10">
          <DialogTitle className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Navigation className="w-6 h-6 text-green-400" />
            Control de Acceso Territorial
          </DialogTitle>
          <p className="text-white/60 mt-1 text-sm">
            Configurando permisos para: <span className="text-white font-medium">{user?.name || user?.email}</span>
          </p>
          <div className="mt-2 text-xs text-green-400 bg-green-500/10 w-fit px-3 py-1 rounded-full border border-green-500/20">
            Automático: Al asignar una Zona, se asignarán sus rutas correspondientes.
          </div>
        </div>

        {/* Content Body with Tabs */}
        <div className="p-6 bg-black/95">
          <Tabs defaultValue="zonas" className="w-full">
            <TabsList className="w-full bg-white/5 border border-white/10 p-1 rounded-lg grid grid-cols-3 mb-6">
              <TabsTrigger 
                value="zonas" 
                className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-300 data-[state=active]:border-green-500/30 border border-transparent rounded-md transition-all"
              >
                <div className="flex items-center gap-2">
                  <Map className="w-4 h-4" />
                  <span>Zonas Comerciales</span>
                  <span className="ml-2 text-xs bg-black/40 px-2 py-0.5 rounded-full">{zones.length}</span>
                </div>
              </TabsTrigger>
              <TabsTrigger 
                value="sales" 
                className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300 data-[state=active]:border-blue-500/30 border border-transparent rounded-md transition-all"
              >
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4" />
                  <span>Rutas de Venta</span>
                  <span className="ml-2 text-xs bg-black/40 px-2 py-0.5 rounded-full">{salesRoutes.length}</span>
                </div>
              </TabsTrigger>
              <TabsTrigger 
                value="internal" 
                className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-300 data-[state=active]:border-orange-500/30 border border-transparent rounded-md transition-all"
              >
                <div className="flex items-center gap-2">
                  <Navigation className="w-4 h-4" />
                  <span>Rutas de Conquista</span>
                  <span className="ml-2 text-xs bg-black/40 px-2 py-0.5 rounded-full">{routes.length}</span>
                </div>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="zonas" className="m-0 mt-2 focus-visible:outline-none">
              <SelectionGrid 
                items={availableZonas} 
                selectedItems={zones} 
                onToggle={toggleZona}
                onSelectAll={selectAllZonas}
                onUnselectAll={unselectAllZonas}
                searchPlaceholder="Buscar zona comercial..."
                loading={loadingAvail || loading}
                emptyMessage="No se encontraron zonas"
              />
            </TabsContent>

            <TabsContent value="sales" className="m-0 mt-2 focus-visible:outline-none">
              <SelectionGrid 
                items={availableSalesRoutes} 
                selectedItems={salesRoutes} 
                onToggle={toggleSalesRoute}
                onSelectAll={selectAllSalesRoutes}
                onUnselectAll={unselectAllSalesRoutes}
                searchPlaceholder="Buscar ruta de venta..."
                loading={loadingAvail || loading}
                emptyMessage="No se encontraron rutas de venta. Agrega una nueva abajo."
              />
              {/* Agregar ruta nueva */}
              <div className="flex gap-2 mt-3">
                <Input
                  value={newSalesRoute}
                  onChange={e => setNewSalesRoute(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddNewSalesRoute()}
                  placeholder="Nueva ruta de venta (ej: R105, PALMAR-01...)"
                  className="h-9 bg-black/40 border-white/10 text-sm focus-visible:ring-blue-500/50"
                  disabled={loading}
                />
                <Button size="sm" className="h-9 gap-1 bg-blue-600 hover:bg-blue-500 shrink-0" onClick={handleAddNewSalesRoute} disabled={loading || !newSalesRoute.trim()}>
                  <Plus className="w-4 h-4" /> Agregar
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="internal" className="m-0 mt-2 focus-visible:outline-none">
              <SelectionGrid 
                items={availableRoutes} 
                selectedItems={routes} 
                onToggle={toggleRoute}
                onSelectAll={selectAllRoutes}
                onUnselectAll={unselectAllRoutes}
                searchPlaceholder="Buscar ruta de conquista..."
                loading={loadingAvail || loading}
                emptyMessage="No se encontraron rutas de conquista. Agrega una nueva abajo."
              />
              {/* Agregar ruta nueva */}
              <div className="flex gap-2 mt-3">
                <Input
                  value={newInternalRoute}
                  onChange={e => setNewInternalRoute(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddNewInternalRoute()}
                  placeholder="Nueva ruta de conquista (ej: A-1, OAXACA-07...)"
                  className="h-9 bg-black/40 border-white/10 text-sm focus-visible:ring-orange-500/50"
                  disabled={loading}
                />
                <Button size="sm" className="h-9 gap-1 bg-orange-600 hover:bg-orange-500 shrink-0" onClick={handleAddNewInternalRoute} disabled={loading || !newInternalRoute.trim()}>
                  <Plus className="w-4 h-4" /> Agregar
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="bg-white/5 p-4 border-t border-white/10 flex justify-end">
          <Button variant="outline" className="min-w-[120px]" onClick={onClose} disabled={loading}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Dialog de Asignación por Tipo */}
    <Dialog open={!!zonaToAssign} onOpenChange={() => setZonaToAssign(null)}>
      <DialogContent className="max-w-md bg-[#1e213a] text-white border-white/10">
        <DialogHeader>
          <DialogTitle>Asignar rutas para {zonaToAssign}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-4">
          <Button 
            onClick={() => confirmAssignZona(zonaToAssign, 'ventas')}
            className="bg-green-600 hover:bg-green-500 h-12 text-lg justify-start px-6"
          >
            🛒 Asignar Ventas y Conquista
          </Button>
          <Button 
            onClick={() => confirmAssignZona(zonaToAssign, 'reparto')}
            className="bg-blue-600 hover:bg-blue-500 h-12 text-lg justify-start px-6"
          >
            🚚 Asignar Reparto
          </Button>
          <Button 
            onClick={() => confirmAssignZona(zonaToAssign, 'todo')}
            className="bg-purple-600 hover:bg-purple-500 h-12 text-lg justify-start px-6"
          >
            ⚡ Asignar Todo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
