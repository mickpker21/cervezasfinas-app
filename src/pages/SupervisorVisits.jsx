// src/pages/SupervisorVisits.jsx
import React, { useState, useEffect, useMemo, Children, cloneElement } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  MapPin,
  List,
  Download,
  Eraser,
  SlidersHorizontal,
  Search,
  ClipboardCheck,
  TrendingUp,
  Award,
  Users,
  Filter,
} from 'lucide-react';

import VisitsFilters from '@/components/admin/visits/VisitsFilters';
import VisitsTable from '@/components/admin/visits/VisitsTable';
import VisitsMap from '@/components/admin/visits/VisitsMap';

import { Button } from '@/components/ui/button';
import { getTodayMexico, getTodayDayOfWeekMexico } from '@/lib/dateUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { supabase } from '../supabaseClient';
import { getAllVisits, getVisitsCount } from '@/repositories/visitsRepository';
import { getClients } from '@/repositories/clientsRepository';
import { getProfileById } from '@/repositories/workPlanRepository';
import {
  format,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { kvStorage } from '@/services/kvStorage';

// ... (imports)

/* ===== Fallbacks shadcn (por si faltan piezas) ===== */
const Skeleton = ({ className }) => (
  <div className={cn('animate-pulse rounded-md bg-slate-200 dark:bg-slate-800', className)} />
);

const ScrollArea = ({ className, children }) => (
  <div className={cn('overflow-auto', className)}>{children}</div>
);

const ToggleGroup = ({ value, onValueChange, children, className }) => (
  <div className={cn('inline-flex items-center gap-1 rounded-xl border border-slate-700/60 bg-slate-900/60 p-1', className)}>
    {Children.map(children, (child) =>
      cloneElement(child, {
        selected: child.props.value === value,
        onSelect: (val) => onValueChange && onValueChange(val),
      }),
    )}
  </div>
);

const ToggleGroupItem = ({ value, selected, onSelect, children, className, ...props }) => (
  <button
    type="button"
    onClick={() => onSelect && onSelect(value)}
    className={cn(
      'inline-flex items-center rounded-lg px-2.5 py-1.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-sky-500',
      selected ? 'bg-slate-100 text-slate-900' : 'bg-transparent text-slate-200 hover:bg-slate-800',
      className,
    )}
    {...props}
  >
    {children}
  </button>
);

/* ===== Helpers visuales ===== */
const Glass = ({ className, children }) => (
  <div className={cn('rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-900/50 backdrop-blur-md shadow-xl', className)}>
    {children}
  </div>
);

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

const StatCard = ({ title, value }) => (
  <div className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-4 transition-all hover:border-slate-700 hover:bg-slate-800/60 hover:shadow-lg hover:shadow-emerald-900/10">
    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
    <div className="relative z-10">
      <div className="text-[13px] font-medium text-slate-400 uppercase tracking-wider">{title}</div>
      <div className="mt-2 text-3xl font-bold tracking-tight tabular-nums text-slate-100 group-hover:text-emerald-400 transition-colors">{value}</div>
    </div>
  </div>
);

/* ===== Preferencias ===== */
// Prefs helper removed


export default function SupervisorVisits() {
  const { toast } = useToast();
  const [visits, setVisits] = useState([]);
  const [totalVisitsCount, setTotalVisitsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const PAGE_SIZE = 15;
  const [filters, setFilters] = useState({
    searchTerm: '',
    route: ''
  });
  const [dateRange, setDateRange] = useState('today');
  const [customDate, setCustomDate] = useState('');
  const [customMonth, setCustomMonth] = useState('');
  const [density, setDensity] = useState('comfortable');
  const [roleFilter, setRoleFilter] = useState('');
  const [clustered, setClustered] = useState(true);
  const [showMap, setShowMap] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedVisit, setSelectedVisit] = useState(null);

  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const d = await kvStorage.getItem('visits:density');
        if (d) setDensity(d);
        const c = await kvStorage.getItem('visits:clustered');
        if (c !== null) setClustered(c);
      } catch (e) { }
    };
    loadPrefs();
  }, []);

  useEffect(() => { kvStorage.setItem('visits:density', density).catch(() => { }); }, [density]);
  useEffect(() => { kvStorage.setItem('visits:clustered', clustered).catch(() => { }); }, [clustered]);

  /* URL → filtros (inicial) */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q') ?? '';
    const route = params.get('route') ?? '';

    setFilters(prev => ({
      searchTerm: q || prev.searchTerm,
      route: route || prev.route
    }));
  }, []);

  /* filtros → URL */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    filters.searchTerm ? params.set('q', filters.searchTerm) : params.delete('q');
    filters.route ? params.set('route', filters.route) : params.delete('route');
    const qs = params.toString();
    window.history.replaceState({}, '', qs ? `?${qs}` : window.location.pathname);
  }, [filters]);

  // Rango de fechas con Timezone MEXICO CITY Safe
  const { startDate, endDate } = useMemo(() => {
    // Helper para obtener cadena YYYY-MM-DD en hora CDMX
    // Use centralized date utils
    const getMexicoDate = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    const today = getTodayMexico(); // Use centralized function

    // Obtenemos "ahora" y calculamos "hoy" en CDMX
    const now = new Date();
    const todayStr = getMexicoDate(now);

    // Para manipulación (ayer, semana, mes), creamos objetos fecha basados en la cadena YMD de CDMX
    // Usamos hora 12:00 para evitar bordes
    const [y, m, d] = todayStr.split('-').map(Number);
    const todayObj = new Date(y, m - 1, d, 12, 0, 0);

    switch (dateRange) {
      case 'today':
        return {
          startDate: todayStr,
          endDate: todayStr,
        };
      case 'yesterday':
        const yest = new Date(todayObj);
        yest.setDate(yest.getDate() - 1);
        const yestStr = getMexicoDate(yest);
        return {
          startDate: yestStr,
          endDate: yestStr,
        };
      case 'thisWeek': {
        const start = startOfWeek(todayObj, { weekStartsOn: 1 });
        const end = endOfWeek(todayObj, { weekStartsOn: 1 });
        return {
          startDate: getMexicoDate(start),
          endDate: getMexicoDate(end),
        };
      }
      case 'thisMonth': {
        const start = startOfMonth(todayObj);
        const end = endOfMonth(todayObj);
        return {
          startDate: getMexicoDate(start),
          endDate: getMexicoDate(end),
        };
      }
      case 'month': {
        if (!customMonth) return { startDate: null, endDate: null };
        const [yStr, mStr] = customMonth.split('-');
        const yVal = Number(yStr);
        const mVal = Number(mStr);
        if (!yVal || !mVal) return { startDate: null, endDate: null };
        const base = new Date(yVal, mVal - 1, 1, 12, 0, 0);
        return {
          startDate: getMexicoDate(startOfMonth(base)),
          endDate: getMexicoDate(endOfMonth(base)),
        };
      }
      case 'specificDate': {
        if (!customDate) return { startDate: null, endDate: null };
        return {
          startDate: customDate,
          endDate: customDate,
        };
      }
      case 'all':
      default:
        return { startDate: null, endDate: null };
    }
  }, [dateRange, customMonth, customDate]);

  /* Fetch visitas (todas, una sola vez) */
  useEffect(() => {
    const fetchVisits = async () => {
      setLoading(true);
      try {
        // 1. Fetch Visits (Repo)
        const rawVisits = await getAllVisits();

        // 1.5 Fetch Total Count (Async)
        getVisitsCount().then(count => setTotalVisitsCount(count));

        // 2. Fetch Clients (Repo) for joining
        // ... (rest of logic)

        // 2. Fetch Clients (Repo) for joining
        const allClients = await getClients();
        const clientMap = new Map();
        allClients.forEach(c => clientMap.set(c.id, c));

        // 3. Profiles (Online only for now, or cache if possible)
        // We collect user_ids and try to fetch profiles if online
        const userIds = Array.from(new Set(rawVisits.map(v => v.user_id).filter(Boolean)));
        let profileMap = {};

        try {
          // Try fetching profiles using repo (offline-ready)
          const profilesData = await Promise.all(userIds.map(id => getProfileById(id)));
          profilesData.filter(Boolean).forEach((p) => { profileMap[p.id] = p; });
        } catch (e) {
          // Fallback en caso de error extremo
          console.warn("Could not fetch profiles", e);
        }

        const populated = rawVisits.map((visit) => {
          const client = clientMap.get(visit.client_id) || {};
          const profile = profileMap[visit.user_id] || {};

          const fachada = visit.photo_fachada ?? visit.photoFachada ?? null;
          const interior = visit.photo_interior ?? visit.photoInterior ?? null;
          const enfriador = visit.photo_enfriador ?? visit.photoEnfriador ?? null;

          const computedClientName = visit.cliente_nombre || visit.client_name || visit.business_name || client.business_name || client.name || 'Cliente no encontrado';
          const computedBusinessName = client.business_name || visit.business_name || computedClientName;

          return {
            hora: visit.hora || '',
            ...visit, // conserva snake_case por compatibilidad
            clientName: computedClientName,
            businessName: computedBusinessName,
            clientCode: visit.client_code || client.client_code || client.code || '',
            coords: client.coords || (client.lat ? { lat: client.lat, lng: client.lng } : null),
            exclusivity: client.exclusivity || null,
            userName:
              profile.name ||
              profile.email ||
              visit.user_id ||
              'Usuario',
            routeNumber:
              profile.route ||
              visit.ruta ||
              visit.route ||
              'N/A',
            userRole: profile.role || visit.role || '',
            photoFachada: fachada,
            photoInterior: interior,
            photoEnfriador: enfriador,
            visit_date: visit.fecha || visit.visit_date || null,
          };
        });

        setVisits(populated);
      } catch (e) {
        console.error(e);
        toast({
          title: 'Error al cargar datos',
          description: 'No se pudieron cargar las visitas.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchVisits();
  }, [toast]);

  const normalize = (s) =>
    (s || '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const filteredVisits = useMemo(() => {
    const term = filters.searchTerm.toLowerCase();
    return visits.filter((visit) => {
      let visitDate = '';
      if (visit.visit_date) {
        // Safe extraction of YYYY-MM-DD regardless of time/timezone
        const s = String(visit.visit_date);
        visitDate = s.length >= 10 ? s.slice(0, 10) : '';
      }

      const matchesSearch =
        !term ||
        (visit.clientName && visit.clientName.toLowerCase().includes(term)) ||
        (visit.businessName && visit.businessName.toLowerCase().includes(term)) ||
        (visit.userName && visit.userName.toLowerCase().includes(term)) ||
        (visit.comments && visit.comments.toLowerCase().includes(term));

      let matchesDate = true;
      if (startDate && endDate) {
        matchesDate = visitDate >= startDate && visitDate <= endDate;
      }

      const matchesRoute = !filters.route || visit.routeNumber === filters.route;
      const matchesRole = !roleFilter || normalize(visit.userRole).includes(roleFilter);

      return matchesSearch && matchesDate && matchesRoute && matchesRole;
    });
  }, [visits, filters, roleFilter, startDate, endDate]);

  // Reset a primera página cuando cambian filtros o datos base
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, roleFilter, visits.length]);

  const totalPages = Math.max(1, Math.ceil(filteredVisits.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedVisits = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredVisits.slice(start, start + PAGE_SIZE);
  }, [filteredVisits, safePage]);

  const pageStartIndex = filteredVisits.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE;
  const pageEndIndex =
    filteredVisits.length === 0
      ? 0
      : Math.min(filteredVisits.length, pageStartIndex + PAGE_SIZE);

  const uniqueRoutes = useMemo(
    () => [...new Set(visits.map((v) => v.routeNumber).filter(Boolean))],
    [visits],
  );

  const roleCardCounts = useMemo(() => {
    const counts = { conquista: 0, 'control interno': 0, 'asesor dinamico': 0, otros: 0 };
    filteredVisits.forEach((v) => {
      const r = normalize(v.userRole);
      if (r.includes('conquista')) counts['conquista'] += 1;
      else if (r.includes('control') && r.includes('interno')) counts['control interno'] += 1;
      else if (r.includes('asesor') && r.includes('dinamico')) counts['asesor dinamico'] += 1;
      else counts.otros += 1;
    });
    return counts;
  }, [filteredVisits]);

  const isEmpty = !loading && filteredVisits.length === 0;

  const exportCSV = () => {
    const cols = [
      'id',
      'clientName',
      'businessName',
      'userName',
      'userRole',
      'routeNumber',
      'visit_date',
      'hora',
      'exclusivity',
      'comments',
    ];
    const q = (val) => {
      const s =
        val == null ? '' : String(typeof val === 'string' ? val : JSON.stringify(val));
      return `"${s.replace(/"/g, '""')}"`;
    };
    const header = cols.map(q).join(',');
    const rows = filteredVisits.map((v) => cols.map((c) => q(v[c])).join(','));
    const csv = [header, ...rows].join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visitas_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Helmet>
        <title>Panel Supervisor · Visitas</title>
        <meta
          name="description"
          content="Panel de control de visitas para supervisores."
        />
        <style>{`
          .map-shell .leaflet-container {
            width: 100%;
            height: 100%;
            border-radius: 12px;
            z-index: 1; /* Ensure map stays below sidebar/modals */
          }
          /* Fix leaflet controls z-index if needed */
          .leaflet-top, .leaflet-bottom {
             z-index: 500;
          }
        `}</style>
      </Helmet>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8 text-slate-100">
        <div className="mx-auto w-full max-w-[1400px] pb-24 min-h-[110vh]">
          {/* Header */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" className="mb-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 flex items-center gap-3">
                  <ClipboardCheck className="h-8 w-8 text-emerald-400" />
                  Panel de Visitas
                </h1>
                <p className="text-slate-400">Monitorea las visitas realizadas por tu equipo en tiempo real.</p>
              </div>
              {!loading && (
                <Badge className="rounded-full px-3 py-1 text-xs" variant="secondary">
                  {filteredVisits.length} resultados
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={exportCSV}>
                <Download className="mr-1 h-4 w-4" /> Exportar CSV
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilters({ searchTerm: '', date: '', route: '' });
                  setRoleFilter('');
                }}
              >
                <Eraser className="mr-1 h-4 w-4" /> Limpiar
              </Button>
              <Button
                variant={showMap ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setShowMap((v) => !v)}
              >
                <MapPin className="mr-1 h-4 w-4" />{' '}
                {showMap ? 'Ocultar mapa' : 'Mostrar mapa'}
              </Button>
            </div>
          </motion.div>

          {/* KPIs */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 border-0 text-white shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100 text-sm font-medium mb-1">Total Visitas</p>
                    <p className="text-3xl font-bold">{filters.searchTerm || filters.date || filters.route || roleFilter ? filteredVisits.length : totalVisitsCount}</p>
                  </div>
                  <MapPin className="h-12 w-12 text-blue-200 opacity-80" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 text-white shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-emerald-100 text-sm font-medium mb-1">Conquista</p>
                    <p className="text-3xl font-bold">{roleCardCounts['conquista'] ?? 0}</p>
                  </div>
                  <Award className="h-12 w-12 text-emerald-200 opacity-80" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500 to-purple-600 border-0 text-white shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-100 text-sm font-medium mb-1">Asesor Dinámico</p>
                    <p className="text-3xl font-bold">{roleCardCounts['asesor dinamico'] ?? 0}</p>
                  </div>
                  <Users className="h-12 w-12 text-purple-200 opacity-80" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-500 to-orange-600 border-0 text-white shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-orange-100 text-sm font-medium mb-1">Control Interno</p>
                    <p className="text-3xl font-bold">{roleCardCounts['control interno'] ?? 0}</p>
                  </div>
                  <TrendingUp className="h-12 w-12 text-orange-200 opacity-80" />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Panel de control (Filtros) */}
          <Card className="mb-6 bg-slate-800/50 border-slate-700 backdrop-blur shadow-xl">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filtros de Búsqueda
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Búsqueda */}
              <div className="mb-4">
                <label className="mb-1 block text-xs text-slate-400">Buscar</label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="visits-quick-search"
                    className="pl-8 bg-slate-700/50 border-slate-600 text-white"
                    placeholder="Cliente, usuario, comentario..."
                    value={filters.searchTerm}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, searchTerm: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/* Filtros Componente */}
              <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                      <SelectValue placeholder="Filtrar por fecha" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Hoy</SelectItem>
                      <SelectItem value="yesterday">Ayer</SelectItem>
                      <SelectItem value="thisWeek">Esta semana</SelectItem>
                      <SelectItem value="thisMonth">Este mes</SelectItem>
                      <SelectItem value="month">Mes específico</SelectItem>
                      <SelectItem value="specificDate">Día específico</SelectItem>
                      <SelectItem value="all">Todas las fechas</SelectItem>
                    </SelectContent>
                  </Select>
                  {dateRange === 'month' && (
                    <Input
                      type="month"
                      className="bg-slate-700/50 border-slate-600 text-white text-sm"
                      value={customMonth}
                      onChange={(e) => {
                        setCustomMonth(e.target.value);
                        setCurrentPage(1);
                      }}
                    />
                  )}
                  {dateRange === 'specificDate' && (
                    <Input
                      type="date"
                      className="bg-slate-700/50 border-slate-600 text-white text-sm"
                      value={customDate}
                      onChange={(e) => {
                        setCustomDate(e.target.value);
                        setCurrentPage(1);
                      }}
                    />
                  )}
                </div>

                <Select
                  value={filters.route || 'all'}
                  onValueChange={(val) => setFilters(prev => ({ ...prev, route: val === 'all' ? '' : val }))}
                >
                  <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                    <SelectValue placeholder="Filtrar por ruta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las rutas</SelectItem>
                    {uniqueRoutes.map((r) => (
                      <SelectItem key={r} value={r}>{`Ruta ${r}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Rol */}
              <div>
                <div className="mb-2 text-xs text-slate-400">Filtrar por Rol</div>
                <div className="flex flex-wrap gap-2">
                  {['conquista', 'control interno', 'asesor dinamico'].map((r) => (
                    <Badge
                      key={r}
                      variant={normalize(roleFilter) === r ? 'default' : 'outline'}
                      className={`cursor-pointer select-none px-3 py-1 ${normalize(roleFilter) === r
                        ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-500'
                        : 'border-slate-600 text-slate-300 hover:bg-slate-700'}`}
                      onClick={() =>
                        setRoleFilter((cur) => (normalize(cur) === r ? '' : r))
                      }
                    >
                      {r} · {roleCardCounts[r] ?? 0}
                    </Badge>
                  ))}
                  <Badge
                    variant={normalize(roleFilter) === 'otros' ? 'default' : 'outline'}
                    className={`cursor-pointer select-none px-3 py-1 ${normalize(roleFilter) === 'otros'
                      ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-500'
                      : 'border-slate-600 text-slate-300 hover:bg-slate-700'}`}
                    onClick={() =>
                      setRoleFilter((cur) =>
                        normalize(cur) === 'otros' ? '' : 'otros'
                      )
                    }
                  >
                    otros · {roleCardCounts.otros ?? 0}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Listado */}
          <Card className="mb-5 bg-slate-800/50 border-slate-700 backdrop-blur shadow-xl">
            <CardHeader className="flex items-center justify-between space-y-0">
              <CardTitle className="text-base">Listado</CardTitle>
              <ToggleGroup
                value={density}
                onValueChange={(d) => d && setDensity(d)}
                className="hidden sm:inline-flex"
              >
                <ToggleGroupItem value="comfortable">
                  <List className="mr-1 h-4 w-4" /> Cómodo
                </ToggleGroupItem>
                <ToggleGroupItem value="compact">
                  <SlidersHorizontal className="mr-1 h-4 w-4" /> Compacto
                </ToggleGroupItem>
              </ToggleGroup>
            </CardHeader>
            <Separator className="bg-slate-800" />
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-220px)] min-h-[520px] scrollbar-thin scrollbar-thumb-green-600 scrollbar-track-gray-200">
                <div
                  className={cn('p-2', density === 'compact' && 'p-1 text-sm')}
                >
                  <VisitsTable
                    visits={paginatedVisits}
                    density={density}
                    onViewDetails={setSelectedVisit}
                  />
                </div>
              </ScrollArea>
              {!loading && filteredVisits.length > 0 && (
                <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2 text-xs text-slate-300">
                  <span>
                    Mostrando {pageStartIndex + 1}–{pageEndIndex} de{' '}
                    {filteredVisits.length} visitas
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 py-1 text-xs"
                      disabled={safePage <= 1}
                      onClick={() =>
                        setCurrentPage((p) => Math.max(1, p - 1))
                      }
                    >
                      Anterior
                    </Button>
                    <span className="text-slate-400">
                      Página {safePage} de {totalPages}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 py-1 text-xs"
                      disabled={safePage >= totalPages}
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mapa – sin recortes */}
          {showMap && (
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur shadow-xl overflow-visible">
              <CardHeader className="flex items-center justify-between space-y-0">
                <CardTitle className="text-base">Mapa</CardTitle>
                <Badge
                  variant="secondary"
                  className="cursor-pointer select-none"
                  onClick={() => setClustered((c) => !c)}
                  title="Alternar clustering"
                >
                  {clustered ? 'Clustering ON' : 'Clustering OFF'}
                </Badge>
              </CardHeader>
              <Separator className="bg-slate-800" />
              <CardContent className="overflow-visible p-3">
                <div className="map-shell h-[50vh] md:h-[65vh] min-h-[300px] md:min-h-[460px] w-full">
                  {loading ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">
                      Cargando visitas para el mapa...
                    </div>
                  ) : filteredVisits.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">
                      Sin visitas para mostrar en el mapa.
                    </div>
                  ) : (
                    <VisitsMap visits={filteredVisits} clustered={clustered} />
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Estados */}
          {loading && (
            <Card className="mt-6 border-slate-800 bg-slate-900/60">
              <CardContent className="p-6">
                <Skeleton className="h-10 w-full" />
                <div className="mt-4 space-y-2">
                  {[...Array(8)].map((_, i) => (
                    <Skeleton key={i} className="h-6 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {!loading && isEmpty && (
            <Card className="mt-6 border-slate-800 bg-slate-900/60">
              <CardContent className="space-y-6 p-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800">
                  <List className="h-7 w-7 opacity-70" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Sin resultados</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Ajusta la búsqueda o filtros.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Volver arriba */}
        <div className="fixed bottom-6 right-6 z-40">
          <Button
            size="icon"
            className="rounded-full shadow-lg bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500/50"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Volver arriba"
          >
            â†‘
          </Button>
        </div>

        {/* Detalle de visita */}
        {
          selectedVisit && (
            <Dialog
              open={!!selectedVisit}
              onOpenChange={(open) => !open && setSelectedVisit(null)}
            >
              <DialogContent className="max-w-lg border border-slate-700 bg-slate-900 text-slate-100">
                <DialogHeader>
                  <DialogTitle>Detalle de visita</DialogTitle>
                </DialogHeader>
                <div className="mt-2 space-y-4 text-sm">
                  <div>
                    <div className="text-xs text-slate-400">Cliente</div>
                    <div className="font-semibold">{selectedVisit.businessName}</div>
                    <div className="text-xs text-slate-300">
                      {selectedVisit.clientName}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-slate-400">Usuario</div>
                      <div className="font-medium">{selectedVisit.userName}</div>
                      <div className="text-xs text-slate-300">
                        {selectedVisit.userRole || 'Sin rol'} · Ruta{' '}
                        {selectedVisit.routeNumber || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Fecha y hora</div>
                      <div className="font-medium">
                        {(() => {
                          const raw = selectedVisit.visit_date;
                          if (!raw) return 'Sin fecha';
                          const isoLike = /^\d{4}-\d{2}-\d{2}$/.test(String(raw));
                          const d = isoLike
                            ? new Date(String(raw) + 'T00:00:00')
                            : new Date(raw);
                          if (Number.isNaN(d.getTime())) return String(raw);
                          return d.toLocaleDateString('es-MX', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          });
                        })()}
                        {selectedVisit.hora ? ` · ${selectedVisit.hora}` : ''}
                      </div>
                    </div>
                  </div>

                  {selectedVisit.motivo && (
                    <div>
                      <div className="mb-1 text-xs text-slate-400">Motivo de visita</div>
                      <p className="whitespace-pre-wrap text-slate-200">
                        {selectedVisit.motivo}
                      </p>
                    </div>
                  )}

                  {(selectedVisit.notes || selectedVisit.comments) && (
                    <div>
                      <div className="mb-1 text-xs text-slate-400">Notas detalladas</div>
                      <p className="whitespace-pre-wrap text-slate-200">
                        {selectedVisit.notes || selectedVisit.comments}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <div className="mb-1 text-xs text-slate-400">Fachada</div>
                      {selectedVisit.photoFachada ? (
                        <a
                          href={selectedVisit.photoFachada}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs text-emerald-400 underline"
                        >
                          Ver foto
                        </a>
                      ) : (
                        <div className="text-xs text-slate-500">Sin foto</div>
                      )}
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-slate-400">Interior</div>
                      {selectedVisit.photoInterior ? (
                        <a
                          href={selectedVisit.photoInterior}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs text-emerald-400 underline"
                        >
                          Ver foto
                        </a>
                      ) : (
                        <div className="text-xs text-slate-500">Sin foto</div>
                      )}
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-slate-400">Enfriador</div>
                      {selectedVisit.photoEnfriador ? (
                        <a
                          href={selectedVisit.photoEnfriador}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs text-emerald-400 underline"
                        >
                          Ver foto
                        </a>
                      ) : (
                        <div className="text-xs text-slate-500">Sin foto</div>
                      )}
                    </div>
                  </div>

                  {selectedVisit.coords &&
                    selectedVisit.coords.lat != null &&
                    selectedVisit.coords.lng != null && (
                      <div>
                        <div className="mb-1 text-xs text-slate-400">Ubicación</div>
                        <a
                          href={`https://www.google.com/maps?q=${selectedVisit.coords.lat},${selectedVisit.coords.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-xs text-emerald-400 underline"
                        >
                          Ver en Google Maps
                        </a>
                      </div>
                    )}
                </div>
              </DialogContent>
            </Dialog>
          )
        }
      </div >
    </>
  );
}
