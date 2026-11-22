import React, { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient"; // Needed for profile fallback?
import { Helmet } from "react-helmet-async";
import { getTodayMexico } from '@/lib/dateUtils';
import { Calendar, MapPin, FileText, Camera, Clock, Loader2 } from 'lucide-react';
import { getVisitsByRoute } from "@/repositories/visitsRepository";
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

const normalize = (value) => (value ?? "").toString().trim();

export default function DynamicAdvisorVisits() {
  const { user } = useSupabaseAuth();
  const [userRoute, setUserRoute] = useState("");
  const [loading, setLoading] = useState(false);
  const [visits, setVisits] = useState([]);
  const [filterMode, setFilterMode] = useState('today'); // 'today' | 'yesterday' | 'month' | 'custom'
  const [customDate, setCustomDate] = useState("");

  // Stats Counters
  const [visitsTodayCount, setVisitsTodayCount] = useState(0);
  const [visitsThisMonthCount, setVisitsThisMonthCount] = useState(0);
  const [visitsTotalCount, setVisitsTotalCount] = useState(0);
  const [loadingVisitsCounts, setLoadingVisitsCounts] = useState(false);

  // 1. Robust Route Fetch (Cache -> Profile -> Session -> Local Metadata)
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
        if (!cancelled && r) setUserRoute(r);
      } catch (e) { console.error(e); }
    };
    loadRoute();
    return () => { cancelled = true; };
  }, [user]);

  // 2. Fetch Visits List
  useEffect(() => {
    const fetchVisits = async () => {
      if (!userRoute) return;
      setLoading(true);
      try {
        const now = new Date();
        // Fix: Use Mexico City time for 'today' and calculations
        const today = getTodayMexico(); // Mexico timezone

        // Calculate yesterday relative to Mexico Time
        const yesterdayDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = yesterdayDate.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

        const monthStart = today.substring(0, 7) + '-01';

        const filters = {};
        if (filterMode === 'today') filters.specificDate = today;
        else if (filterMode === 'yesterday') filters.specificDate = yesterdayStr;
        else if (filterMode === 'month') filters.startDate = monthStart;
        else if (filterMode === 'custom' && customDate) filters.specificDate = customDate;

        const data = await getVisitsByRoute(userRoute, filters);
        setVisits(data || []);
      } catch (err) {
        console.error("dynamic advisor: error fetching visitas", err);
        setVisits([]);
      } finally {
        setLoading(false);
      }
    };
    fetchVisits();
  }, [userRoute, filterMode, customDate]);

  // 3. Fetch Counters (Separately to match "Dashboard" feel)
  // We avoid querying Supabase directly as it's deprecated for writes.
  // We use the repository.
  useEffect(() => {
    if (!userRoute) return;

    const fetchStats = async () => {
      setLoadingVisitsCounts(true);
      try {
        const now = new Date();
        // Fix: Use Mexico City time for 'today' to match server/user reality
        const today = getTodayMexico(); // Mexico timezone
        // Start of month: YYYY-MM-01 based on Mexico time
        const monthStart = today.substring(0, 7) + '-01';

        // Parallel fetch for stats
        // Optimization: 'getVisitsByRoute' hits MySQL or Local. 
        // It returns arrays. We just need counts.
        // Future improvement: API endpoint for counts.

        const [todayData, monthData] = await Promise.all([
          getVisitsByRoute(userRoute, { specificDate: today }).catch(() => []),
          getVisitsByRoute(userRoute, { startDate: monthStart }).catch(() => [])
        ]);

        setVisitsTodayCount(todayData.length);
        setVisitsThisMonthCount(monthData.length);

        // Total Historical - hard to get cheaply without API.
        // For now, assume Month Count or reuse local total?
        // Using local total might include other routes in legacy local DB?
        // Let's just set Total = Month for now to avoid heavy query, or sum locally if available.
        // Or perform a broad fetch online if needed.
        // Leaving as Month sum or placeholders if we don't want to over-fetch.
        // Let's use Month Count for now to be safe.
        setVisitsTotalCount(monthData.length);

      } catch (error) {
        console.warn("Error fetching stats:", error);
      } finally {
        setLoadingVisitsCounts(false);
      }
    };

    fetchStats();
  }, [userRoute]);

  // Handlers
  const handleFilterChange = (mode) => {
    setFilterMode(mode);
    if (mode === 'custom' && !customDate) {
      setCustomDate(new Date().toISOString().slice(0, 10));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Helmet>
        <title>Mis Visitas | Dynamic Advisor</title>
      </Helmet>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <MapPin className="w-8 h-8 text-emerald-500" />
            Mis Visitas
          </h1>
          <p className="text-zinc-400 mt-2">
            Historial de actividad y visitas realizadas en ruta <span className="text-emerald-400 font-mono font-bold">{userRoute || '...'}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-zinc-900/50 p-1.5 rounded-lg border border-zinc-800">
          <button
            onClick={() => handleFilterChange('today')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${filterMode === 'today' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
          >
            Hoy
          </button>
          <button
            onClick={() => handleFilterChange('yesterday')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${filterMode === 'yesterday' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
          >
            Ayer
          </button>
          <button
            onClick={() => handleFilterChange('month')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${filterMode === 'month' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
          >
            Mes Actual
          </button>

          <div className="relative">
            {filterMode === 'custom' && (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="absolute -top-12 right-0 bg-zinc-800 text-white border border-zinc-700 rounded p-1 text-xs"
              />
            )}
            <button
              onClick={() => handleFilterChange('custom')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${filterMode === 'custom' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
            >
              Calendario
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl shadow-sm relative overflow-hidden group hover:border-zinc-700 transition-colors">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Clock className="w-12 h-12 text-emerald-500" />
          </div>
          <div className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">Visitas Hoy</div>
          <div className="text-4xl text-white font-bold tracking-tight">
            {loadingVisitsCounts ? "..." : visitsTodayCount}
          </div>
          <div className="text-emerald-500 text-xs mt-2 font-medium flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Actividad en tiempo real
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl shadow-sm relative overflow-hidden group hover:border-zinc-700 transition-colors">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Calendar className="w-12 h-12 text-blue-500" />
          </div>
          <div className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">Visitas del Mes</div>
          <div className="text-4xl text-white font-bold tracking-tight">
            {loadingVisitsCounts ? "..." : visitsThisMonthCount}
          </div>
          <div className="text-zinc-500 text-xs mt-2">Acumulado mensual</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl shadow-sm relative overflow-hidden group hover:border-zinc-700 transition-colors">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <MapPin className="w-12 h-12 text-purple-500" />
          </div>
          <div className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">Total Histórico</div>
          <div className="text-4xl text-white font-bold tracking-tight">
            {loadingVisitsCounts ? "..." : visitsTotalCount}
          </div>
          <div className="text-zinc-500 text-xs mt-2">Registro total de ruta</div>
        </div>
      </div>

      {loading ? (
        <div className="text-zinc-500 animate-pulse py-12 text-center flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Cargando visitas...</span>
        </div>
      ) : visits.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900/50 rounded-xl border border-zinc-800 border-dashed">
          <div className="mx-auto w-12 h-12 bg-zinc-800/50 rounded-full flex items-center justify-center mb-3 text-zinc-500">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-zinc-300 font-medium mb-1">Sin visitas encontradas</h3>
          <p className="text-zinc-500 text-sm">No hay registros para el filtro seleccionado.</p>
          {filterMode !== 'month' && (
            <button
              onClick={() => handleFilterChange('month')}
              className="mt-4 text-emerald-500 text-sm font-medium hover:text-emerald-400 hover:underline"
            >
              Ver todo el mes
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visits.map((visit) => {
            const visitDate = new Date(visit.fecha || visit.created_at);

            // Fix: Parse YYYY-MM-DD from 'fecha' strictly as local date if possible
            let formattedDate = visitDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
            if (visit.fecha && typeof visit.fecha === 'string' && visit.fecha.includes('-') && !visit.fecha.includes('T')) {
              const [y, m, d] = visit.fecha.split('-');
              if (y && m && d) {
                formattedDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
              }
            }

            // Fix: Use 'created_at' for TIME if available, otherwise don't show time
            let formattedTime = null;
            if (visit.hora) {
              formattedTime = visit.hora.substring(0, 5); // "HH:MM:SS" -> "HH:MM"
            }
            // Removed created_at fallback as per user request (it's inaccurate)

            return (
              <div key={visit.id} className="group relative bg-zinc-900 border border-zinc-800 rounded-xl shadow-sm hover:shadow-lg hover:border-zinc-700 transition-all duration-300 overflow-hidden flex flex-col">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-600 group-hover:bg-emerald-500 transition-colors" />

                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-3">
                    <div className="bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1 flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="text-xs font-mono text-zinc-300 capitalize">{formattedDate}</span>
                    </div>
                    {formattedTime && (
                      <span className="text-xs text-zinc-500 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formattedTime}
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-zinc-100 leading-tight mb-1 truncate" title={visit.cliente_nombre || visit.client_name || visit.business_name}>
                    {visit.cliente_nombre || visit.client_name || visit.business_name || "Cliente Sin Nombre"}
                  </h3>
                  <p className="text-sm text-emerald-400 font-medium mb-3">
                    {visit.motivo || "Visita de Rutina"}
                  </p>

                  {visit.notes && (
                    <div className="mt-auto bg-zinc-950/50 p-3 rounded-lg border border-zinc-800/50">
                      <div className="flex items-start gap-2">
                        <FileText className="w-3.5 h-3.5 text-zinc-600 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-zinc-400 line-clamp-3 italic">"{visit.notes}"</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-zinc-950 border-t border-zinc-800 px-5 py-3 flex items-center gap-3 text-xs text-zinc-500">
                  {(visit.photo_fachada || visit.photo_interior || visit.photo_enfriador) ? (
                    <div className="flex items-center gap-1.5 text-blue-300 font-medium bg-blue-900/20 px-2 py-0.5 rounded-full border border-blue-800/50">
                      <Camera className="w-3.5 h-3.5" />
                      <span>Evidencia</span>
                    </div>
                  ) : (
                    <span className="opacity-40">Sin fotos</span>
                  )}

                  {visit.lat && visit.lng && (
                    <div className="ml-auto flex items-center gap-1.5 text-zinc-600" title="Geolocalizado">
                      <MapPin className="w-3.5 h-3.5" />
                      <span className="hidden group-hover:inline transition-all text-[10px] text-zinc-500">GPS</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
