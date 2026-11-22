import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import InteractiveMap from '@/components/common/InteractiveMap';
import { getClientsPaged } from '@/repositories/clientsRepository';
import { getAllEvaluations } from '@/repositories/evaluationsRepository';
import { getAllowedRoutes } from '@/repositories/metadataRepository';
import { Card, CardContent } from '@/components/ui/card';
import { Search, MapPin, Filter, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { startOfMonth, isAfter } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

export default function ControlInternoMapPage() {
  const { user } = useSupabaseAuth();
  const [clients, setClients] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noRoutesAssigned, setNoRoutesAssigned] = useState(false);

  const [filters, setFilters] = useState({
    search: '',
    zona: 'all',
    rutaInterna: 'all',
    rutaVenta: 'all'
  });

  const userType = (user?.user_metadata?.type || '').toLowerCase().trim();
  const isJefeControlInterno = userType === 'jefe-control-interno' || userType === 'jefe control interno';
  const isControlInterno = userType === 'control-interno' || userType === 'control interno';

  useEffect(() => {
    if (!user) return;
    let active = true;
    const fetchData = async () => {
      setLoading(true);
      setNoRoutesAssigned(false);
      try {
        const userId = user.id;

        let allClients = [];
        const evals = await getAllEvaluations();

        if (isJefeControlInterno) {
          // Jefe ve todos los clientes
          let page = 1;
          const PAGE_SIZE = 500;
          while (true) {
            const res = await getClientsPaged({ page, pageSize: PAGE_SIZE, filters: {} });
            const chunk = res.data || [];
            allClients = allClients.concat(chunk);
            if (chunk.length < PAGE_SIZE) break;
            page++;
          }
        } else if (isControlInterno) {
          // Control Interno: misma lógica que Supervisor - rutas permitidas desde BD
          const allowed = await getAllowedRoutes(userId);
          const internalRoutes = allowed.internal || [];
          const salesRoutes = allowed.sales || [];

          // Fallback a metadata del perfil
          const metaRoute = user?.user_metadata?.route || null;
          const metaZona = user?.user_metadata?.zona || null;

          const hasDbRoutes = internalRoutes.length > 0 || salesRoutes.length > 0;
          const hasMetaRoutes = !!metaRoute || !!metaZona;

          const apiFilters = {};
          if (hasDbRoutes) {
            apiFilters.internal_routes = internalRoutes;
            apiFilters.sales_routes = salesRoutes;
          } else if (hasMetaRoutes) {
            if (metaRoute) apiFilters.internal_route = metaRoute;
            if (metaZona) apiFilters.zona = metaZona;
          }
          // Si no hay nada asignado, apiFilters queda vacío y trae todos (fallback como admin)

          let page = 1;
          const PAGE_SIZE = 500;
          while (true) {
            const res = await getClientsPaged({ page, pageSize: PAGE_SIZE, filters: apiFilters });
            const chunk = res.data || [];
            allClients = allClients.concat(chunk);
            if (chunk.length < PAGE_SIZE) break;
            page++;
          }
        }

        if (active) {
          setClients(allClients);
          setEvaluations(evals || []);
        }
      } catch (e) {
        console.error("Error loading map data:", e);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchData();
    return () => { active = false; };
  }, [user?.id, userType]);

  // Filter options built from loaded clients
  const filterOptions = useMemo(() => {
    const zones = new Set();
    const internalRoutes = new Set();
    const salesRoutes = new Set();

    clients.forEach(c => {
      const z = (c.zona_comercial || c.zona || '').toString().trim().toUpperCase();
      if (z) zones.add(z);
      const ri = c.internal_route || c.ruta_interna;
      if (ri) internalRoutes.add(String(ri));
      const rv = c.sales_route || c.ruta_venta;
      if (rv) salesRoutes.add(String(rv));
    });

    return {
      zones: Array.from(zones).sort(),
      internalRoutes: Array.from(internalRoutes).sort(),
      salesRoutes: Array.from(salesRoutes).sort()
    };
  }, [clients]);

  // Process clients with status markers
  const filteredClients = useMemo(() => {
    const monthStart = startOfMonth(new Date());
    const evaluatedIds = new Set(
      evaluations
        .filter(e => isAfter(new Date(e.fecha), monthStart))
        .map(e => e.client_id)
    );

    return clients.filter(c => {
      if (filters.search) {
        const s = filters.search.toLowerCase();
        const match = c.name?.toLowerCase().includes(s) || c.client_code?.toString().includes(s);
        if (!match) return false;
      }
      if (filters.zona !== 'all') {
        const z = (c.zona_comercial || c.zona || '').toString().trim().toUpperCase();
        if (z !== filters.zona) return false;
      }
      if (filters.rutaInterna !== 'all' && String(c.internal_route || c.ruta_interna) !== filters.rutaInterna) return false;
      if (filters.rutaVenta !== 'all' && String(c.sales_route || c.ruta_venta) !== filters.rutaVenta) return false;
      return true;
    }).map(c => {
      const toNumber = (v) => {
        if (typeof v === 'number') return isFinite(v) ? v : null;
        if (typeof v === 'string') { const n = parseFloat(v); return isFinite(n) ? n : null; }
        return null;
      };

      let coords = c.coords;
      if (typeof coords === 'string') {
        try { coords = JSON.parse(coords); } catch (e) { /* noop */ }
      }

      let lat = null, lng = null;
      if (Array.isArray(coords) && coords.length >= 2) {
        lat = toNumber(coords[0]); lng = toNumber(coords[1]);
      } else if (coords && typeof coords === 'object') {
        lat = toNumber(coords.lat ?? coords.latitude ?? coords.Lat);
        lng = toNumber(coords.lng ?? coords.longitude ?? coords.Lng);
      } else {
        lat = toNumber(c.lat); lng = toNumber(c.lng);
      }

      if (lat == null || lng == null) return null;

      const isEvaluated = evaluatedIds.has(c.id);

      return {
        ...c,
        coords: { lat, lng },
        color: isEvaluated ? '#10b981' : '#ef4444',
        status: isEvaluated ? 'Evaluado' : 'Pendiente'
      };
    }).filter(Boolean);
  }, [clients, evaluations, filters]);

  const stats = useMemo(() => {
    const total = filteredClients.length;
    const evaluated = filteredClients.filter(c => c.status === 'Evaluado').length;
    return {
      total,
      evaluated,
      pending: total - evaluated,
      pct: total ? Math.round((evaluated / total) * 100) : 0
    };
  }, [filteredClients]);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white">
      <Helmet><title>Mapa Maestro | Control Interno</title></Helmet>

      {/* Header & Stats Strip */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-white/5 px-6 py-4 shrink-0 shadow-2xl z-20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-500 mb-0.5">
              <MapPin size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Geolocalización Operativa</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">Mapa Maestro de Clientes</h1>
            {isControlInterno && (
              <p className="text-[10px] text-slate-500 mt-0.5">Solo rutas y zonas asignadas a tu perfil</p>
            )}
          </div>

          <div className="flex items-center gap-8">
            <div className="text-right">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Cobertura Visual</p>
              <p className="text-2xl font-black text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]">{stats.pct}%</p>
            </div>
            <div className="h-10 w-px bg-white/10" />
            <div className="flex gap-4">
              <div className="bg-emerald-500/10 px-4 py-2 rounded-2xl border border-emerald-500/20 flex items-center gap-3 shadow-lg">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <div>
                  <p className="text-[8px] font-bold text-emerald-500/60 uppercase">Evaluados</p>
                  <p className="text-sm font-black text-emerald-400 leading-none">{stats.evaluated}</p>
                </div>
              </div>
              <div className="bg-rose-500/10 px-4 py-2 rounded-2xl border border-rose-500/20 flex items-center gap-3 shadow-lg">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <div>
                  <p className="text-[8px] font-bold text-rose-500/60 uppercase">Pendientes</p>
                  <p className="text-sm font-black text-rose-400 leading-none">{stats.pending}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Filters Bar */}
      <div className="bg-slate-900/40 p-4 border-b border-white/5 flex flex-wrap gap-4 items-center shrink-0 backdrop-blur-sm">
        <div className="relative min-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <Input
            placeholder="Buscar por nombre o código..."
            className="pl-10 h-11 rounded-xl bg-white/5 border-white/10 text-white placeholder-white/20 focus:bg-white/10 focus:border-emerald-500/50 transition-all shadow-inner"
            value={filters.search}
            onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
          />
        </div>

        <Select value={filters.zona} onValueChange={v => setFilters(p => ({ ...p, zona: v }))}>
          <SelectTrigger className="w-[180px] h-11 rounded-xl bg-white/5 border-white/10 text-white hover:bg-white/10 transition-colors">
            <Filter size={14} className="mr-2 opacity-50 text-emerald-400" />
            <SelectValue placeholder="Zona" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-white/10 text-white">
            <SelectItem value="all">Todas las Zonas</SelectItem>
            {filterOptions.zones.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filters.rutaInterna} onValueChange={v => setFilters(p => ({ ...p, rutaInterna: v }))}>
          <SelectTrigger className="w-[160px] h-11 rounded-xl bg-white/5 border-white/10 text-white hover:bg-white/10 transition-colors">
            <SelectValue placeholder="Ruta Interna" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-white/10 text-white">
            <SelectItem value="all">Ruta Interna</SelectItem>
            {filterOptions.internalRoutes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filters.rutaVenta} onValueChange={v => setFilters(p => ({ ...p, rutaVenta: v }))}>
          <SelectTrigger className="w-[160px] h-11 rounded-xl bg-white/5 border-white/10 text-white hover:bg-white/10 transition-colors">
            <SelectValue placeholder="Ruta Venta" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-white/10 text-white">
            <SelectItem value="all">Ruta Venta</SelectItem>
            {filterOptions.salesRoutes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>

        {(filters.zona !== 'all' || filters.rutaInterna !== 'all' || filters.rutaVenta !== 'all' || filters.search) && (
          <button
            onClick={() => setFilters({ search: '', zona: 'all', rutaInterna: 'all', rutaVenta: 'all' })}
            className="p-2.5 text-slate-500 hover:text-rose-400 transition-colors bg-white/5 rounded-xl border border-white/5 hover:bg-white/10"
            title="Limpiar filtros"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Main Map Area */}
      <main className="flex-1 relative overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 z-20 bg-slate-950/60 backdrop-blur-sm flex flex-col items-center justify-center">
            <div className="relative">
              <Loader2 className="animate-spin text-emerald-500 mb-4" size={48} />
              <div className="absolute inset-0 blur-xl bg-emerald-500/20 animate-pulse" />
            </div>
            <p className="text-[10px] font-black text-emerald-500/70 uppercase tracking-[0.3em]">Cargando clientes permitidos...</p>
          </div>
        ) : noRoutesAssigned ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 bg-slate-900/20 gap-4">
            <AlertCircle size={64} className="opacity-20" />
            <div className="text-center">
              <p className="font-black uppercase tracking-widest text-sm mb-2">Sin rutas asignadas</p>
              <p className="text-xs text-slate-600 max-w-xs">
                Tu cuenta no tiene rutas o zonas asignadas. Contacta a un administrador para que configure tus rutas permitidas.
              </p>
            </div>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 bg-slate-900/20">
            <AlertCircle size={64} className="mb-4 opacity-10" />
            <p className="font-black uppercase tracking-widest text-xs">No hay datos para estos criterios</p>
          </div>
        ) : (
          <div className="absolute inset-0">
            <InteractiveMap
              items={filteredClients}
              showFilters={false}
              height="100%"
              renderPopup={(client) => (
                <div className="p-3 min-w-[220px] bg-slate-900 text-white">
                  <div className="flex items-center justify-between mb-2.5">
                    <Badge className={client.status === 'Evaluado' ? 'bg-emerald-500 text-white border-0' : 'bg-rose-500 text-white border-0'}>
                      {client.status}
                    </Badge>
                    <span className="text-[10px] font-black text-slate-500 tracking-tighter">#{client.client_code}</span>
                  </div>
                  <h3 className="font-black text-white leading-tight mb-1 text-base">{client.name}</h3>
                  <p className="text-[10px] text-slate-400 uppercase font-medium mb-3 italic">{client.address || 'Sin ubicación registrada'}</p>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/10">
                    <div className="bg-white/5 p-2 rounded-lg">
                      <p className="text-[8px] font-black text-slate-500 uppercase mb-0.5">Zona Comercial</p>
                      <p className="text-[10px] font-bold text-white truncate">{client.zona_comercial || client.zona || 'N/A'}</p>
                    </div>
                    <div className="bg-white/5 p-2 rounded-lg">
                      <p className="text-[8px] font-black text-slate-500 uppercase mb-0.5">Ruta Operativa</p>
                      <p className="text-[10px] font-bold text-white truncate">{client.ruta_venta || client.sales_route || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              )}
            />
          </div>
        )}
      </main>
    </div>
  );
}
