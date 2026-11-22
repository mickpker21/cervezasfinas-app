import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import SyncButton from '@/components/SyncButton';
import { getLocalClients, getClients } from '@/repositories/clientsRepository';
import { getAllEvaluations, getEvaluationById } from '@/repositories/evaluationsRepository';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, Cell
} from 'recharts';
import { 
  ClipboardCheck, Users, MapPin, TrendingUp, TrendingDown, AlertCircle, 
  CheckCircle2, Clock, Map as MapIcon, Star, ArrowUpRight, ArrowDownRight, Search, 
  LayoutDashboard, MapPinned, Sparkles, ShieldCheck, RefreshCw, Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EvaluationDetailViewer from '@/components/EvaluationDetailViewer';
import AuditoresResumen from '@/components/AuditoresResumen';
import PreguntasCriticas from '@/components/PreguntasCriticas';
import { format, startOfMonth, isAfter, subDays, startOfWeek, subMonths, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

export default function ControlInternoDashboard() {
  const { user } = useSupabaseAuth();
  const [clients, setClients] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvaluation, setSelectedEvaluation] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const navigate = useNavigate();
  const [kpis, setKpis] = useState({
    totalMonth: 0,
    avgScore: 0,
    coverage: 0,
    missingGps: 0,
    evaluatedClients: 0,
    avgEsteMes: 0,
    avgMesAnterior: 0,
    diffAvg: 0,
    hasPrevMonth: false,
    clientsWithoutRecidivism: 0,
    pctSinReincidencia: 0,
    totalClientsAudited2M: 0,
    syncedMonthEvals: 0,
    syncPercentage: 100,
    avgEvaluatedPerDay: '0.0',
    businessDays: 1
  });
  const [trendData, setTrendData] = useState([]);
  const [zoneData, setZoneData] = useState([]);
  const [atypicalSales, setAtypicalSales] = useState([]);

  // Selector de meses
  const [selectedDate, setSelectedDate] = useState(() => startOfMonth(new Date()));

  const monthOptions = useMemo(() => {
    const opts = [];
    let d = startOfMonth(new Date());
    for (let i = 0; i < 6; i++) {
      opts.push({
        value: d.toISOString(),
        label: format(d, 'MMMM yyyy', { locale: es }).toUpperCase()
      });
      d = subMonths(d, 1);
    }
    return opts;
  }, []);

  useEffect(() => {
    let active = true;
    const processData = (fetchedClients, fetchedEvals) => {
      if (!fetchedClients || !fetchedEvals) return;
      
      const userType = (user?.user_metadata?.type || '').toLowerCase();
      const isNormalControlInterno = userType === 'control-interno' || userType === 'control interno';
      
      let allClients = fetchedClients;
      let allEvals = fetchedEvals;
      
      if (isNormalControlInterno) {
        const route = user?.user_metadata?.route;
        const zona = user?.user_metadata?.zona;
        
        if (route || zona) {
          allClients = fetchedClients.filter(c => 
            (route && c.internal_route === route) || 
            (zona && c.zona_comercial === zona) || 
            (zona && c.zona === zona)
          );
          
          const validClientIds = new Set(allClients.map(c => c.id));
          allEvals = fetchedEvals.filter(e => validClientIds.has(e.client_id));
        }
      }

      const firstOfMonth = startOfMonth(selectedDate);
      const endOfSelectedMonth = endOfMonth(selectedDate);
      const prevMonthStart = startOfMonth(subMonths(selectedDate, 1));
      const prevMonthEnd = endOfMonth(subMonths(selectedDate, 1));
      
      const monthEvals = allEvals.filter(e => {
        const d = new Date(e.fecha);
        return isAfter(d, subDays(firstOfMonth, 1)) && !isAfter(d, endOfSelectedMonth);
      });
      const prevMonthEvals = allEvals.filter(e => {
        const d = new Date(e.fecha);
        return isAfter(d, subDays(prevMonthStart, 1)) && !isAfter(d, prevMonthEnd);
      });
      const evaluatedClientIds = new Set(monthEvals.map(e => e.client_id));
      
      // 1. Puntaje Promedio Este Mes vs Mes Anterior
      const avgEsteMes = monthEvals.length 
        ? Math.round((monthEvals.reduce((acc, curr) => acc + (Number(curr.puntaje) || 0), 0) / monthEvals.length) * 10) / 10 
        : 0;
      const avgMesAnterior = prevMonthEvals.length 
        ? Math.round((prevMonthEvals.reduce((acc, curr) => acc + (Number(curr.puntaje) || 0), 0) / prevMonthEvals.length) * 10) / 10 
        : 0;
      const diffAvg = Math.round((avgEsteMes - avgMesAnterior) * 10) / 10;
      const hasPrevMonth = prevMonthEvals.length > 0;

      // 2. Clientes Auditados sin Reincidencia (Últimos 2 Meses >= 70 pts)
      const twoMonthsEvals = allEvals.filter(e => {
        const d = new Date(e.fecha);
        return isAfter(d, subDays(prevMonthStart, 1)) && !isAfter(d, endOfSelectedMonth);
      });
      const clientEvalsMap = {};
      twoMonthsEvals.forEach(e => {
        if (!e.client_id) return;
        if (!clientEvalsMap[e.client_id]) clientEvalsMap[e.client_id] = [];
        clientEvalsMap[e.client_id].push(Number(e.puntaje) || 0);
      });
      const APPROVAL_THRESHOLD = 70;
      let clientsWithoutRecidivism = 0;
      const totalClientsAudited2M = Object.keys(clientEvalsMap).length;
      Object.values(clientEvalsMap).forEach(scores => {
        if (Math.min(...scores) >= APPROVAL_THRESHOLD) {
          clientsWithoutRecidivism++;
        }
      });
      const pctSinReincidencia = totalClientsAudited2M 
        ? Math.round((clientsWithoutRecidivism / totalClientsAudited2M) * 100) 
        : 0;

      // 3. % Evaluaciones Sincronizadas (Mes Seleccionado)
      const syncedMonthEvals = monthEvals.filter(e => e.synced !== 0 && e.synced !== false).length;
      const syncPercentage = monthEvals.length 
        ? Math.round((syncedMonthEvals / monthEvals.length) * 100) 
        : 100;

      // 4. Promedio Clientes Evaluados al Día (Días Hábiles Lun-Sáb)
      const isCurrentMonth = selectedDate.getMonth() === new Date().getMonth() && selectedDate.getFullYear() === new Date().getFullYear();
      const lastDayToCount = isCurrentMonth ? new Date().getDate() : endOfSelectedMonth.getDate();
      let businessDays = 0;
      const yr = selectedDate.getFullYear();
      const mo = selectedDate.getMonth();
      for (let day = 1; day <= lastDayToCount; day++) {
        const dCheck = new Date(yr, mo, day);
        const dayOfWeek = dCheck.getDay();
        if (dayOfWeek >= 1 && dayOfWeek <= 6) { // Lunes a Sábado
          businessDays++;
        }
      }
      if (businessDays < 1) businessDays = 1;
      const avgEvaluatedPerDay = (monthEvals.length / businessDays).toFixed(1);

      const noGps = allClients.filter(c => {
        let coords = c.coords;
        if (typeof coords === 'string') {
          try { coords = JSON.parse(coords); } catch { return true; }
        }
        const lat = coords?.lat ?? coords?.[0] ?? c.lat;
        const lng = coords?.lng ?? coords?.[1] ?? c.lng;
        return !lat || !lng;
      }).length;

      setKpis({
        totalMonth: monthEvals.length,
        avgScore: allEvals.length ? Math.round(((allEvals).reduce((acc, curr) => acc + (Number(curr.puntaje) || 0), 0) / allEvals.length) * 10) / 10 : 0,
        coverage: allClients.length ? Math.round((evaluatedClientIds.size / allClients.length) * 100) : 0,
        missingGps: noGps,
        evaluatedClients: evaluatedClientIds.size,
        avgEsteMes,
        avgMesAnterior,
        diffAvg,
        hasPrevMonth,
        clientsWithoutRecidivism,
        pctSinReincidencia,
        totalClientsAudited2M,
        syncedMonthEvals,
        syncPercentage,
        avgEvaluatedPerDay,
        businessDays
      });

      // Trend Data
      const weeklyStats = [];
      const baseDate = (selectedDate.getMonth() === new Date().getMonth() && selectedDate.getFullYear() === new Date().getFullYear()) 
                        ? new Date() 
                        : endOfSelectedMonth;

      for (let i = 3; i >= 0; i--) {
        const start = startOfWeek(subDays(baseDate, i * 7), { weekStartsOn: 1 });
        const end = subDays(subDays(baseDate, (i - 1) * 7), 1);
        const weekLabel = format(start, 'dd MMM', { locale: es });
        const weekEvals = allEvals.filter(e => {
          const d = new Date(e.fecha);
          return isAfter(d, start) && !isAfter(d, end);
        });
        const avg = weekEvals.length ? Math.round((weekEvals.reduce((acc, curr) => acc + (Number(curr.puntaje) || 0), 0) / weekEvals.length) * 10) / 10 : 0;
        weeklyStats.push({ name: weekLabel, promedio: avg, total: weekEvals.length });
      }
      setTrendData(weeklyStats);

      // Zone Data
      const zones = {};
      allClients.forEach(c => {
        const zRaw = c.zona_comercial || c.zona || 'OTRAS';
        const z = zRaw.toString().trim().toUpperCase();
        if (!zones[z]) zones[z] = { name: z, total: 0, evaluated: 0 };
        zones[z].total++;
      });
      evaluatedClientIds.forEach(id => {
        const c = allClients.find(client => client.id === id);
        if (c) {
          const zRaw = c.zona_comercial || c.zona || 'OTRAS';
          const z = zRaw.toString().trim().toUpperCase();
          if (zones[z]) zones[z].evaluated++;
        }
      });
      setZoneData(Object.values(zones).sort((a, b) => b.total - a.total).slice(0, 8));
    };

    const loadData = async () => {
      setLoading(true);
      try {
        // 1. CARGA RÁPIDA (Local)
        // Traemos evaluaciones desde unos días antes del mes para llenar la primera semana de tendencia
        const fromDateStr = format(startOfMonth(subMonths(selectedDate, 1)), 'yyyy-MM-dd');
        const [localClients, localEvals] = await Promise.all([
          getLocalClients(),
          getAllEvaluations({ from: fromDateStr })
        ]);
        
        if (active && localClients?.length > 0) {
          setClients(localClients);
          setEvaluations(localEvals || []);
          processData(localClients, localEvals);
          setLoading(false); // Ya mostramos algo
        }

        // 2. SINCRONIZACIÓN (Fondo/Online)
        const freshClients = await getClients(); 
        const freshEvals = await getAllEvaluations({ from: fromDateStr });
        
        if (active) {
          setClients(freshClients || []);
          setEvaluations(freshEvals || []);
          processData(freshClients, freshEvals);
          
          // Analytical extra: Atypical Sales (Keep it as background process)
          loadAtypicalSales(freshClients);
        }
      } catch (err) {
        console.error('[ControlInternoDashboard] Load Error:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    const loadAtypicalSales = async (allClients) => {
      const d = new Date(selectedDate);
      const months = [];
      for (let i = 0; i < 4; i++) {
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        months.push(`${y}-${String(m).padStart(2, '0')}-01`);
        d.setMonth(d.getMonth() - 1);
      }
      const currentMonth = months[0];
      const oldestMonth = months[months.length - 1];

      try {
        const { fetchVentasPorSku } = await import('@/lib/mysqlVentasPorSku');
        const salesRaw = await fetchVentasPorSku({ from: oldestMonth });

        if (salesRaw && salesRaw.length > 0) {
          const clientSalesByMonth = {};
          
          salesRaw.forEach(s => {
            const idStr = String(s.client_id || s.cve_cliente || "");
            if (!idStr) return;
            
            const sDate = String(s.period_date || s.fecha || "").substring(0, 10);
            if (!months.includes(sDate)) return;
            
            const vol = Number(s.htls || s.hl || 0);

            if (!clientSalesByMonth[idStr]) clientSalesByMonth[idStr] = {};
            if (!clientSalesByMonth[idStr][sDate]) clientSalesByMonth[idStr][sDate] = 0;
            clientSalesByMonth[idStr][sDate] += vol;
          });

          const alerts = [];
          Object.entries(clientSalesByMonth).forEach(([id, monthData]) => {
            const current = monthData[currentMonth] || 0;
            let sumHistory = 0;
            let countHistory = 0;
            
            months.forEach(m => {
              if (m !== currentMonth && monthData[m] !== undefined) {
                sumHistory += monthData[m];
                countHistory++;
              }
            });
            
            const avg = countHistory > 0 ? sumHistory / countHistory : 0;
            if (avg > 0) {
              const ratio = current / avg;
              const absDiff = Math.abs(current - avg);
              
              // Regla: ratio > 2.0 (pico) o ratio < 0.3 (caída), Y la diferencia absoluta >= 10 HL
              if ((ratio < 0.3 || ratio > 2.0) && absDiff >= 10) {
                const client = allClients.find(c => String(c.id) === id || String(c.client_code) === id);
                if (client) {
                  alerts.push({
                    id,
                    name: client.business_name || client.name,
                    avg: avg.toFixed(2),
                    current: current.toFixed(2),
                    ratio: Math.round(ratio * 100),
                    diff: absDiff.toFixed(1),
                    type: ratio < 0.3 ? 'drop' : 'spike',
                    zona: client.zona_comercial || client.zona || 'N/A'
                  });
                }
              }
            }
          });
          setAtypicalSales(alerts.sort((a, b) => b.diff - a.diff).slice(0, 10)); // Ordenamos por mayor desvío neto
        }
      } catch (err) {
        console.error("Error cargando ventas atípicas:", err);
      }
    };

    loadData();
    return () => { active = false; };
  }, [selectedDate]);

  const handleViewDetails = async (ev) => {
    setDetailsLoading(true);
    setSelectedEvaluation(ev);
    try {
      const fullEv = await getEvaluationById(ev.id);
      if (fullEv) {
        setSelectedEvaluation(fullEv);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDetailsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mb-4"></div>
        <p className="text-slate-400 animate-pulse">Analizando indicadores de control...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 pb-12 selection:bg-emerald-500/30">
      <Helmet>
        <title>Dashboard de Control | Cervezas Finas</title>
      </Helmet>

      {/* Header Premium - Glassmorphism */}
      <div className="bg-slate-900/60 border-b border-white/5 backdrop-blur-xl sticky top-0 z-30 transition-all duration-300">
        <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/20">
              <LayoutDashboard size={20} className="text-emerald-500" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-white leading-tight">Panel de Control Interno</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Supervisión Directa PPD
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto no-scrollbar py-1">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/control-interno/mapa')}
              className="bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 font-bold rounded-xl gap-2 h-9 px-4 shrink-0"
            >
              <MapPinned size={16} />
              Mapa Maestro
            </Button>

            <div className="h-4 w-px bg-white/10 hidden md:block mx-1" />

            <div className="hidden md:block text-right">
              <p className="text-[10px] font-black text-white hover:text-emerald-400 transition-colors cursor-default uppercase tracking-tight">{user?.profile?.name || user?.user_metadata?.nombre || user?.user_metadata?.name || 'Supervisor'}</p>
              <p className="text-[8px] text-slate-500 font-black uppercase tracking-tighter">Acceso Autorizado</p>
            </div>
            
            <Select value={selectedDate.toISOString()} onValueChange={(val) => setSelectedDate(new Date(val))}>
              <SelectTrigger className="w-full sm:w-[150px] bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-black uppercase tracking-wider text-[10px] h-9 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 text-slate-200 z-[100]">
                {monthOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs font-bold uppercase">{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <SyncButton variant="outline" size="sm" className="bg-white/5 border-white/10 hover:bg-white/20 text-white rounded-xl h-9 px-3" />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-8">
        
        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard 
            title="Evaluaciones" 
            value={kpis.totalMonth} 
            subtitle="Este mes" 
            icon={<ClipboardCheck className="w-5 h-5 text-emerald-400" />}
            color="emerald"
          />
          <KPICard 
            title="Promedio Gral" 
            value={kpis.avgScore} 
            subtitle="Puntaje histórico" 
            icon={<Star className="w-5 h-5 text-amber-400" />}
            color="amber"
          />
          <KPICard 
            title="Cobertura" 
            value={`${kpis.coverage}%`} 
            subtitle={`${kpis.evaluatedClients} clientes`} 
            icon={<Users className="w-5 h-5 text-blue-400" />}
            color="blue"
          />
          <KPICard 
            title="Alertas GPS" 
            value={kpis.missingGps} 
            subtitle="Sin coordenadas" 
            icon={<AlertCircle className="w-5 h-5 text-rose-400" />}
            color="rose"
          />
        </div>

        {/* Indicadores de Calidad */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Indicadores de Calidad
            </h2>
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
              Desempeño Operativo
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Puntaje Promedio Este Mes vs Mes Anterior */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10 relative overflow-hidden group hover:border-emerald-500/30 transition-all">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-white/50 uppercase font-bold">Prom. Este Mes vs Ant.</div>
                {kpis.diffAvg >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-rose-400" />
                )}
              </div>
              <div className="text-2xl font-bold text-emerald-400 flex items-baseline gap-1.5">
                {kpis.avgEsteMes} <span className="text-xs text-white/40 font-normal">pts</span>
              </div>
              <div className="text-xs text-white/40 mt-1 flex items-center gap-1">
                {kpis.hasPrevMonth ? (
                  <>
                    <span className={`font-bold flex items-center ${kpis.diffAvg >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {kpis.diffAvg >= 0 ? <ArrowUpRight className="w-3 h-3 inline" /> : <ArrowDownRight className="w-3 h-3 inline" />}
                      {kpis.diffAvg >= 0 ? `+${kpis.diffAvg}` : kpis.diffAvg} pts
                    </span>
                    <span>vs mes ant. ({kpis.avgMesAnterior})</span>
                  </>
                ) : (
                  <span>Sin datos mes anterior</span>
                )}
              </div>
              <div className="w-full bg-slate-800 h-1 rounded-full mt-3 overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.min(100, kpis.avgEsteMes)}%` }} />
              </div>
            </div>

            {/* 2. Clientes Auditados sin Reincidencia */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10 relative overflow-hidden group hover:border-blue-500/30 transition-all">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-white/50 uppercase font-bold">Sin Reincidencia</div>
                <ShieldCheck className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-bold text-blue-400 flex items-baseline gap-1.5">
                {kpis.clientsWithoutRecidivism} <span className="text-xs text-white/40 font-normal">clientes</span>
              </div>
              <div className="text-xs text-white/40 mt-1">
                {kpis.pctSinReincidencia}% de {kpis.totalClientsAudited2M} auditados (últ. 2 meses ≥70 pts)
              </div>
              <div className="w-full bg-slate-800 h-1 rounded-full mt-3 overflow-hidden">
                <div className="bg-blue-500 h-full rounded-full" style={{ width: `${Math.min(100, kpis.pctSinReincidencia)}%` }} />
              </div>
            </div>

            {/* 3. % Evaluaciones Sincronizadas */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10 relative overflow-hidden group hover:border-amber-500/30 transition-all">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-white/50 uppercase font-bold">% Sincronizadas</div>
                <RefreshCw className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold text-amber-400">
                {kpis.syncPercentage}%
              </div>
              <div className="text-xs text-white/40 mt-1">
                {kpis.syncedMonthEvals} de {kpis.totalMonth} evals sincronizadas
              </div>
              <div className="w-full bg-slate-800 h-1 rounded-full mt-3 overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full" style={{ width: `${Math.min(100, kpis.syncPercentage)}%` }} />
              </div>
            </div>

            {/* 4. Promedio Clientes Evaluados al Día */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10 relative overflow-hidden group hover:border-purple-500/30 transition-all">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-white/50 uppercase font-bold">Evaluados / Día</div>
                <Calendar className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-bold text-purple-400 flex items-baseline gap-1.5">
                {kpis.avgEvaluatedPerDay} <span className="text-xs text-white/40 font-normal">/ día</span>
              </div>
              <div className="text-xs text-white/40 mt-1">
                {kpis.totalMonth} evals en {kpis.businessDays} días hábiles
              </div>
              <div className="w-full bg-slate-800 h-1 rounded-full mt-3 overflow-hidden">
                <div className="bg-purple-500 h-full rounded-full" style={{ width: `${Math.min(100, (Number(kpis.avgEvaluatedPerDay) / 10) * 100)}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Trend Chart */}
          <Card className="bg-slate-900/40 border-white/5 backdrop-blur-lg overflow-hidden shadow-2xl rounded-3xl group hover:border-emerald-500/20 transition-all duration-500">
            <CardHeader className="pb-2 border-b border-white/5 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base text-white flex items-center gap-2 font-black tracking-tight">
                    <TrendingUp className="w-5 h-5 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]" />
                    Tendencia de Calidad
                  </CardTitle>
                  <CardDescription className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Evolución Semanal de Puntaje</CardDescription>
                </div>
                <Badge variant="outline" className="bg-emerald-500/5 border-emerald-500/20 text-emerald-500 text-[10px] font-black">ACTIVO</Badge>
              </div>
            </CardHeader>
            <CardContent className="h-64 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <defs>
                    <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} strokeOpacity={0.2} />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', backdropFilter: 'blur(8px)', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                    itemStyle={{ color: '#10b981', fontWeight: 'bold' }}
                    cursor={{ stroke: '#1e293b', strokeWidth: 2 }}
                  />
                  <Line type="monotone" dataKey="promedio" stroke="#10b981" strokeWidth={4} dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#020617' }} activeDot={{ r: 8, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Coverage by Zone */}
          <Card className="bg-slate-900/40 border-white/5 backdrop-blur-lg overflow-hidden shadow-2xl rounded-3xl group hover:border-blue-500/20 transition-all duration-500">
            <CardHeader className="pb-2 border-b border-white/5 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base text-white flex items-center gap-2 font-black tracking-tight">
                    <MapIcon className="w-5 h-5 text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]" />
                    Penetración por Zona
                  </CardTitle>
                  <CardDescription className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Comparativa de Cobertura Geográfica</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-64 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={zoneData} layout="vertical" margin={{ left: -10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} strokeOpacity={0.2} />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={9} width={90} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', backdropFilter: 'blur(8px)' }}
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  />
                  <Bar dataKey="total" fill="#1e293b" radius={[0, 6, 6, 0]} barSize={14} stackId="a" />
                  <Bar dataKey="evaluated" fill="#3b82f6" radius={[0, 6, 6, 0]} barSize={14} stackId="a">
                    {zoneData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.evaluated/entry.total > 0.8 ? '#10b981' : '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Map & Recent Activity */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Atipical Sales Section (Replaced Map) */}
          <div className="xl:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                Ventas Atípicas del Mes
              </h2>
              <span className="text-[10px] uppercase tracking-widest text-slate-500">Alertas de volumen inusual</span>
            </div>
            
            <Card className="bg-slate-900/40 border-white/5 backdrop-blur-sm shadow-xl overflow-hidden min-h-[400px]">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-white/5 text-slate-400 text-[10px] uppercase tracking-wider">
                        <th className="px-4 py-3 font-semibold">Cliente</th>
                        <th className="px-4 py-3 font-semibold text-center">Zona</th>
                        <th className="px-4 py-3 font-semibold text-right">Prom. (3m)</th>
                        <th className="px-4 py-3 font-semibold text-right">Actual</th>
                        <th className="px-4 py-3 font-semibold text-right">Desv. (HL)</th>
                        <th className="px-4 py-3 font-semibold text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {atypicalSales.map((alert) => (
                        <tr key={alert.id} className="hover:bg-white/5 transition-colors group">
                          <td className="px-4 py-4">
                            <div className="font-bold text-slate-200 group-hover:text-emerald-400 transition-colors">{alert.name}</div>
                            <div className="text-[10px] text-slate-500 font-medium">ID: {alert.id.substring(0,8)}</div>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 border border-white/5 font-black uppercase tracking-tighter">
                              {alert.zona}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right text-slate-400 font-mono text-xs">{alert.avg} HL</td>
                          <td className="px-4 py-4 text-right text-slate-200 font-mono text-xs font-bold">{alert.current} HL</td>
                          <td className={`px-4 py-4 text-right font-black ${alert.type === 'drop' ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {alert.diff} HL
                          </td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {alert.type === 'drop' ? (
                                <div className="flex items-center justify-center gap-1 text-rose-500 bg-rose-500/10 px-2 py-1 rounded-lg text-[9px] font-black border border-rose-500/20">
                                  <TrendingDown className="w-3 h-3" /> -{alert.diff} HL
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1 text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-lg text-[9px] font-black border border-emerald-500/20">
                                  <TrendingUp className="w-3 h-3" /> +{alert.diff} HL
                                </div>
                              )}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 text-slate-500 hover:text-white hover:bg-white/10"
                                onClick={() => navigate(`/clientes/${alert.id}`)}
                              >
                                <ArrowUpRight size={14} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {atypicalSales.length === 0 && (
                        <tr>
                          <td colSpan="6" className="py-20 text-center text-slate-600 italic">
                            No se detectaron desviaciones significativas este mes.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Evaluations */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              Últimas Actividades
            </h2>
            <Card className="bg-slate-900/40 border-white/5 backdrop-blur-sm shadow-xl min-h-[400px]">
              <CardContent className="p-0">
                <div className="divide-y divide-white/5">
                  {evaluations.slice(0, 7).map((ev) => (
                    <div 
                      key={ev.id} 
                      onClick={() => handleViewDetails(ev)}
                      className="p-4 hover:bg-white/5 transition-colors cursor-pointer group"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-sm font-semibold text-slate-200 line-clamp-1">{ev.punto_venta}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          ev.puntaje > 85 ? 'bg-emerald-500/10 text-emerald-400' : 
                          ev.puntaje > 70 ? 'bg-amber-500/10 text-amber-400' : 
                          'bg-rose-500/10 text-rose-400'
                        }`}>
                          {ev.puntaje}%
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {ev.zona || 'N/A'}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {format(new Date(ev.fecha), 'HH:mm')}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1 bg-slate-800 flex-1 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${
                             ev.puntaje > 85 ? 'bg-emerald-500' : ev.puntaje > 70 ? 'bg-amber-500' : 'bg-rose-500'
                          }`} style={{ width: `${ev.puntaje}%` }}></div>
                        </div>
                        <CheckCircle2 className={`w-3 h-3 ${ev.synced ? 'text-emerald-500' : 'text-slate-600'}`} />
                      </div>
                    </div>
                  ))}
                  {evaluations.length === 0 && (
                    <div className="p-12 text-center text-slate-600">
                      <Star className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">Sin evaluaciones recientes</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Secciones Adicionales (Sprint 2 y 3) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <AuditoresResumen />
        <PreguntasCriticas />
      </div>

      {/* Detalle de Evaluación Modal */}
      <Dialog open={!!selectedEvaluation} onOpenChange={(open) => !open && setSelectedEvaluation(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-900 border-white/10 text-slate-100 p-0 overflow-hidden">
          <DialogHeader className="p-6 bg-slate-950/50 border-b border-white/5 sticky top-0 z-10">
            <DialogTitle className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-emerald-400 text-xs font-black uppercase tracking-widest mb-1">
                  {selectedEvaluation?.tipo} | PUNTAJE: {selectedEvaluation?.puntaje}%
                </span>
                <span className="text-white text-xl font-bold">{selectedEvaluation?.punto_venta}</span>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          <div className="p-6">
            {detailsLoading ? (
               <div className="flex flex-col items-center justify-center py-20 gap-4">
                 <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                 <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Cargando expediente completo...</p>
               </div>
            ) : (
              selectedEvaluation && <EvaluationDetailViewer evaluation={selectedEvaluation} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KPICard({ title, value, subtitle, icon, color }) {
  const colors = {
    emerald: "from-emerald-500/10 to-transparent border-emerald-500/20 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.05)]",
    amber: "from-amber-500/10 to-transparent border-amber-500/20 text-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.05)]",
    blue: "from-blue-500/10 to-transparent border-blue-500/20 text-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.05)]",
    rose: "from-rose-500/10 to-transparent border-rose-500/20 text-rose-400 shadow-[0_0_30px_rgba(244,63,94,0.05)]"
  };

  const glows = {
    emerald: "bg-emerald-500/20",
    amber: "bg-amber-500/20",
    blue: "bg-blue-500/20",
    rose: "bg-rose-500/20"
  };

  return (
    <Card className={`bg-slate-900/40 border ${colors[color]} backdrop-blur-xl shadow-2xl relative overflow-hidden group rounded-3xl transition-all duration-300 hover:scale-[1.02] hover:bg-slate-900/60`}>
      <div className={`absolute -top-10 -right-10 w-32 h-32 ${glows[color]} blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-700`} />
      
      <CardHeader className="p-5 pb-0 space-y-0 relative z-10">
        <div className="flex items-center gap-2.5 text-[10px] font-black uppercase tracking-[0.2em] opacity-60">
          <div className="p-1.5 bg-white/5 rounded-lg border border-white/5">
            {icon}
          </div>
          {title}
        </div>
      </CardHeader>
      <CardContent className="p-5 pt-2 relative z-10">
        <div className="text-3xl font-black mb-1 tracking-tighter text-white drop-shadow-sm">{value}</div>
        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-2">
           <span className="w-1 h-3 rounded-full bg-current opacity-40" />
           {subtitle}
        </div>
      </CardContent>
    </Card>
  );
}
