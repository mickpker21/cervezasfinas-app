import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from 'date-fns';
import { Link } from 'react-router-dom';
import EvaluationDetailViewer from '@/components/EvaluationDetailViewer';
import { getAllEvaluations, getEvaluationById, updateEvaluationAdmin } from '@/repositories/evaluationsRepository';
import { getAllSupervisions, syncOnboardSupervisions } from '@/repositories/onboardSupervisionRepository';
import { getClientsPaged, loadClientsFromLocal } from '@/repositories/clientsRepository';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { kvStorage } from '@/services/kvStorage';
import { ClipboardCheck, TrendingUp, Award, Users, MapPin, Filter, BarChart3, Pencil, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import Papa from 'papaparse';

let cachedEvalClients = null;

const StatsSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
    {[1, 2, 3, 4].map((i) => (
      <Card key={i} className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24 bg-slate-700" />
              <Skeleton className="h-8 w-16 bg-slate-700" />
            </div>
            <Skeleton className="h-12 w-12 rounded-full bg-slate-700" />
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
);

const TableSkeleton = () => (
  <div className="space-y-4">
    <div className="hidden md:block">
      <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
        <div className="flex gap-4 mb-4">
          <Skeleton className="h-8 w-1/4 bg-slate-700" />
          <Skeleton className="h-8 w-1/4 bg-slate-700" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex justify-between items-center py-2 border-b border-slate-700">
            <div className="space-y-2 w-1/3">
              <Skeleton className="h-4 w-3/4 bg-slate-700" />
              <Skeleton className="h-3 w-1/2 bg-slate-700" />
            </div>
            <Skeleton className="h-6 w-16 bg-slate-700" />
            <Skeleton className="h-8 w-24 bg-slate-700" />
          </div>
        ))}
      </div>
    </div>
    <div className="md:hidden space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-slate-800/50 p-4 rounded-lg space-y-3">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-32 bg-slate-700" />
            <Skeleton className="h-6 w-12 bg-slate-700" />
          </div>
          <Skeleton className="h-3 w-full bg-slate-700" />
          <Skeleton className="h-3 w-2/3 bg-slate-700" />
          <Skeleton className="h-8 w-full bg-slate-700" />
        </div>
      ))}
    </div>
  </div>
);

const PAGE_SIZE = 50;
const strip = (s) => (s ?? '').toString().trim();
const norm = (s) => strip(s).toUpperCase();
const clientCodeKey = (s) => norm(strip(s)).replace(/[^A-Z0-9]/g, '');
const safeFormatEvalDate = (fechaVal) => {
  if (!fechaVal) return '---';
  try {
    const raw = String(fechaVal).trim();
    const d = new Date(raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw);
    if (Number.isNaN(d.getTime())) return raw.slice(0, 16);
    return format(d, 'dd/MM/yyyy HH:mm');
  } catch {
    return String(fechaVal).slice(0, 16);
  }
};
const buildIn = (col, arr) => `${col}.in.(${arr.map((v) => `"${String(v).replaceAll('"', '\\"')}"`).join(',')})`;

export default function SupervisorEvaluationsPage() {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  const role = (user?.user_metadata?.type || user?.user_metadata?.role || user?.user_metadata?.user_type || '').toLowerCase();
  const isSupervisor = role === 'supervisor' || role === 'coortrade';
  const isAnalista = ['analista', 'analyst', 'admin', 'gerente', 'coortrade', 'coordinador', 'jefe', 'director'].includes(role);
  const isAdminUser = ['admin', 'analista', 'analyst', 'gerente', 'director'].includes(role);
  const canAccessFullData = isAnalista;

  const [rawEvaluations, setRawEvaluations] = useState([]);
  const [rawSupervisions, setRawSupervisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedEvaluation, setSelectedEvaluation] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [dateRange, setDateRange] = useState('thisMonth');
  const [customMonth, setCustomMonth] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [allowedRoutes, setAllowedRoutes] = useState({ internal: [], sales: [] });

  // Estado de edición para Admin
  const [editingEvaluation, setEditingEvaluation] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    punto_venta: '',
    client_code: '',
    ruta: '',
    zona: '',
    usuario: '',
    fecha: '',
    puntaje: 0,
    surtido_porcentaje: 0,
    observaciones: '',
  });

  // Catálogo de clientes (con caché en memoria y carga local instantánea primero)
  const [clients, setClients] = useState(() => cachedEvalClients || []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (cachedEvalClients && cachedEvalClients.length > 0) {
          setClients(cachedEvalClients);
          return;
        }
        // 1. Carga local rápida (<50ms)
        const localRows = await loadClientsFromLocal().catch(() => []);
        if (active && localRows?.length > 0) {
          cachedEvalClients = localRows;
          setClients(localRows);
        }
        // 2. Si local está vacío, traer catálogo paginado
        if (!localRows || localRows.length === 0) {
          const res = await getClientsPaged({ page: 1, pageSize: 50000 });
          const all = res?.data || res?.rows || [];
          if (active && all.length > 0) {
            cachedEvalClients = all;
            setClients(all);
          }
        }
      } catch (e) {
        if (active && !cachedEvalClients) setClients([]);
      }
    })();
    return () => { active = false; };
  }, []);

  const clientsByKey = useMemo(() => {
    const map = new Map();
    for (const c of clients || []) {
      const code = strip(c?.client_code || c?.code || '');
      if (!code) continue;
      map.set(clientCodeKey(code), c);
    }
    return map;
  }, [clients]);

  const zoneByRouteMap = useMemo(() => {
    const map = new Map();
    for (const c of clients || []) {
      const cr = norm(strip(c.sales_route || c.internal_route));
      const cz = strip(c.zona_comercial || c.region || c.zona);
      if (cr && cz && cz !== 'SIN ZONA' && cz !== 'SIN_ZONA') {
        if (!map.has(cr)) {
          map.set(cr, cz);
        }
      }
    }
    return map;
  }, [clients]);

  const fetchAllowedRoutes = useCallback(async () => {
    if (!user || !isSupervisor) return;
    try {
      const { getAllowedRoutes } = await import('@/repositories/metadataRepository');
      const routesObj = await getAllowedRoutes(user.id);
      const internal = routesObj.internal || [];
      const sales = routesObj.sales || [];
      if (internal.length > 0 || sales.length > 0) {
        const newVal = { internal, sales };
        setAllowedRoutes(newVal);
        kvStorage.setItem('supervisor_allowed_routes_full', newVal).catch(console.error);
      }
    } catch (e) { console.error(e); }
  }, [user, isSupervisor]);

  useEffect(() => { fetchAllowedRoutes(); }, [fetchAllowedRoutes]);

  const clientsById = useMemo(() => {
    const map = new Map();
    for (const c of clients || []) {
      if (c.id) map.set(c.id, c);
    }
    return map;
  }, [clients]);

  // Debounce búsqueda rápida (250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Rango de fechas según filtro
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case 'last7':
        return {
          startDate: format(subDays(now, 7), 'yyyy-MM-dd'),
          endDate: format(now, 'yyyy-MM-dd'),
        };
      case 'last30':
        return {
          startDate: format(subDays(now, 30), 'yyyy-MM-dd'),
          endDate: format(now, 'yyyy-MM-dd'),
        };
      case 'thisMonth':
        return {
          startDate: format(startOfMonth(now), 'yyyy-MM-dd'),
          endDate: format(endOfMonth(now), 'yyyy-MM-dd'),
        };
      case 'thisYear':
        return {
          startDate: format(startOfYear(now), 'yyyy-MM-dd'),
          endDate: format(endOfYear(now), 'yyyy-MM-dd'),
        };
      case 'month': {
        if (!customMonth) return { startDate: null, endDate: null };
        const [yStr, mStr] = customMonth.split('-');
        const y = Number(yStr);
        const m = Number(mStr);
        if (!y || !m) return { startDate: null, endDate: null };
        const base = new Date(y, m - 1, 1);
        return {
          startDate: format(startOfMonth(base), 'yyyy-MM-dd'),
          endDate: format(endOfMonth(base), 'yyyy-MM-dd'),
        };
      }
      default:
        return { startDate: null, endDate: null };
    }
  }, [dateRange, customMonth]);

  // Carga rápida local-first + sincronización en paralelo desde el servidor
  // Solo depende de startDate y endDate (no se re-ejecuta al paginar ni al cargar clientes)
  const fetchEvaluations = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Pintar caché local al instante (<100ms) si ya hay datos en el dispositivo
      const [localEvals, localSups] = await Promise.all([
        getAllEvaluations({ from: startDate, to: endDate, localOnly: true }).catch(() => []),
        getAllSupervisions('all').catch(() => []),
      ]);
      if ((localEvals && localEvals.length > 0) || (localSups && localSups.length > 0)) {
        setRawEvaluations(localEvals || []);
        setRawSupervisions(localSups || []);
        setLoading(false);
      }

      // 2. Sincronizar en paralelo Evaluaciones (PDV + CM) y Supervisiones a Bordo desde MySQL
      const [freshEvals] = await Promise.all([
        getAllEvaluations({ from: startDate, to: endDate }),
        syncOnboardSupervisions('all').catch(() => ({ count: 0 })),
      ]);
      const freshSups = await getAllSupervisions('all').catch(() => localSups || []);

      setRawEvaluations(freshEvals || []);
      setRawSupervisions(freshSups || []);
    } catch (err) {
      console.error('Error fetching evaluations:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchEvaluations();
  }, [fetchEvaluations]);

  // Enriquecimiento y filtrado en memoria (0ms al filtrar, buscar o cambiar página)
  const {
    baseFilteredEvaluations,
    baseFilteredSupervisions,
    allFilteredEvaluations,
    allFilteredSupervisions,
    availableZones,
    availableRoutes,
  } = useMemo(() => {
    let filtered = rawEvaluations || [];

    if (startDate) {
      filtered = filtered.filter((e) => String(e.fecha || '').slice(0, 10) >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter((e) => String(e.fecha || '').slice(0, 10) <= endDate);
    }

    if (typeFilter !== 'all') {
      const tf = typeFilter === 'pdv' ? 'PDV' : 'CANAL MODERNO';
      filtered = filtered.filter(
        (e) =>
          (e.tipo || '').toUpperCase() === tf ||
          (tf === 'CANAL MODERNO' && e.tipo === 'CC')
      );
    }

    const cleanRoute = (r) => {
      const s = (r || '').toString().trim();
      if (!s) return null;
      const upper = s.toUpperCase();
      if (upper === 'SIN RUTA' || upper === 'SIN_RUTA' || upper === 'N/A' || upper === 'NA') return null;
      return s;
    };

    // 1. Enriquecer PRIMERO con el catálogo de clientes para que Zona, Ruta y Nombre estén completos antes de buscar/filtrar
    const withZoneAndRoute = filtered.map((ev) => {
      let rawCode = strip(ev.client_code);
      if (!rawCode && ev.client_id && clientsById.has(ev.client_id)) {
        const c = clientsById.get(ev.client_id);
        rawCode = strip(c.client_code || c.code);
      }

      let foundClient = null;
      if (rawCode) {
        foundClient = clientsByKey.get(clientCodeKey(rawCode));
      }
      if (!foundClient && ev.client_id) {
        foundClient = clientsById.get(ev.client_id);
      }

      let zona = strip(ev.zona) || null;
      if (!zona && foundClient) {
        zona = strip(foundClient.zona_comercial || foundClient.region || foundClient.zona) || null;
      }

      let rutaFinal = cleanRoute(ev.ruta);
      let internal_route = null;
      let sales_route = null;
      let puntoVentaFinal = ev.punto_venta;

      if (foundClient) {
        internal_route = strip(foundClient.internal_route);
        sales_route = strip(foundClient.sales_route);
        const rutaFromClient = cleanRoute(
          foundClient.sales_route ||
            foundClient.ruta ||
            foundClient.internal_route ||
            foundClient.route
        );
        if (!rutaFinal && rutaFromClient) {
          rutaFinal = rutaFromClient;
        }
        if (puntoVentaFinal === 'PDV' || !puntoVentaFinal) {
          puntoVentaFinal =
            foundClient.address || foundClient.business_name || foundClient.name || 'PDV';
        }
      }

      if (!zona && rutaFinal) {
        zona = zoneByRouteMap.get(norm(rutaFinal)) || null;
      }
      if (!rutaFinal) rutaFinal = 'Sin ruta';

      return {
        ...ev,
        client_code: rawCode || ev.client_code || '',
        punto_venta: puntoVentaFinal,
        zona: zona || 'SIN ZONA',
        ruta: rutaFinal,
        internal_route,
        sales_route,
      };
    });

    const dynamicZoneMap = new Map(zoneByRouteMap);
    withZoneAndRoute.forEach((ev) => {
      const r = norm(strip(ev.ruta));
      let z = strip(ev.zona);
      if (!z || z === 'SIN ZONA') {
        const matchedClient = clientsByKey.get(clientCodeKey(ev.client_code));
        if (matchedClient) z = strip(matchedClient.zona_comercial || matchedClient.region || matchedClient.zona);
      }
      if (r && z && z !== 'SIN_ZONA' && z !== 'SIN ZONA') {
        dynamicZoneMap.set(r, z);
        if (r.startsWith('0')) dynamicZoneMap.set(r.replace(/^0+/, ''), z);
        if (r.length === 1) dynamicZoneMap.set('0' + r, z);
      }
    });

    let finalSups = rawSupervisions || [];
    if (startDate) {
      finalSups = finalSups.filter((s) => {
        if (!s.start_at) return false;
        const dStr = String(s.start_at).slice(0, 10);
        if (dStr < startDate) return false;
        if (endDate && dStr > endDate) return false;
        return true;
      });
    }

    finalSups = finalSups.map((s) => {
      let foundZona = null;
      if (s.visits && Array.isArray(s.visits)) {
        for (const v of s.visits) {
          if (v.client_code) {
            const matchedClient = clientsByKey.get(clientCodeKey(v.client_code));
            if (matchedClient) {
              foundZona = strip(matchedClient.zona_comercial || matchedClient.region || matchedClient.zona);
              if (foundZona) break;
            }
          }
        }
      }
      if (!foundZona) {
        const searchRutaKey = norm(strip(s.route_name));
        if (searchRutaKey) {
          foundZona = dynamicZoneMap.get(searchRutaKey);
          if (!foundZona) {
            for (const [route, zona] of dynamicZoneMap.entries()) {
              if (route === searchRutaKey || route.includes(searchRutaKey) || searchRutaKey.includes(route)) {
                foundZona = zona;
                break;
              }
            }
          }
        }
      }
      return { ...s, zona: foundZona || 'SIN ZONA', ruta: strip(s.route_name) || 'SIN RUTA' };
    });

    // 2. Aplicar búsqueda de texto sobre los datos ya enriquecidos
    let searchedEvals = withZoneAndRoute;
    let searchedSups = finalSups;
    if (debouncedSearchTerm) {
      const term = debouncedSearchTerm.toLowerCase();
      searchedEvals = withZoneAndRoute.filter(
        (e) =>
          (e.punto_venta || '').toLowerCase().includes(term) ||
          (e.client_code || '').toLowerCase().includes(term) ||
          (e.evaluator_name || '').toLowerCase().includes(term) ||
          (e.usuario || '').toLowerCase().includes(term) ||
          (e.ruta || '').toLowerCase().includes(term) ||
          (e.zona || '').toLowerCase().includes(term)
      );
      searchedSups = finalSups.filter(
        (s) =>
          (s.route_name || '').toLowerCase().includes(term) ||
          (s.vendedor_name || '').toLowerCase().includes(term) ||
          (s.supervisor_name || '').toLowerCase().includes(term) ||
          (s.zona || '').toLowerCase().includes(term)
      );
    }

    // Catálogo de zonas y rutas presentes en las evaluaciones actuales
    const zonesSet = new Set();
    const routesSet = new Set();
    searchedEvals.forEach((e) => {
      const z = (e.zona || 'SIN ZONA').toString().trim().toUpperCase();
      const r = (e.ruta || 'SIN RUTA').toString().trim().toUpperCase();
      if (z) zonesSet.add(z);
      if (!selectedZone || selectedZone === 'TOTAL' || z === selectedZone) {
        if (r) routesSet.add(r);
      }
    });
    searchedSups.forEach((s) => {
      const z = (s.zona || 'SIN ZONA').toString().trim().toUpperCase();
      const r = (s.ruta || 'SIN RUTA').toString().trim().toUpperCase();
      if (z) zonesSet.add(z);
      if (!selectedZone || selectedZone === 'TOTAL' || z === selectedZone) {
        if (r) routesSet.add(r);
      }
    });

    // 3. Aplicar filtro de Zona y Ruta seleccionadas sobre la tabla/KPIs
    let zoneRouteFilteredEvals = searchedEvals;
    let zoneRouteFilteredSups = searchedSups;

    if (selectedZone && selectedZone !== 'TOTAL') {
      zoneRouteFilteredEvals = zoneRouteFilteredEvals.filter(
        (e) => (e.zona || 'SIN ZONA').toString().trim().toUpperCase() === selectedZone
      );
      zoneRouteFilteredSups = zoneRouteFilteredSups.filter(
        (s) => (s.zona || 'SIN ZONA').toString().trim().toUpperCase() === selectedZone
      );
    }

    if (selectedRoute) {
      zoneRouteFilteredEvals = zoneRouteFilteredEvals.filter(
        (e) => (e.ruta || 'SIN RUTA').toString().trim().toUpperCase() === selectedRoute
      );
      zoneRouteFilteredSups = zoneRouteFilteredSups.filter(
        (s) => (s.ruta || 'SIN RUTA').toString().trim().toUpperCase() === selectedRoute
      );
    }

    return {
      baseFilteredEvaluations: searchedEvals,
      baseFilteredSupervisions: searchedSups,
      allFilteredEvaluations: zoneRouteFilteredEvals,
      allFilteredSupervisions: zoneRouteFilteredSups,
      availableZones: Array.from(zonesSet).sort(),
      availableRoutes: Array.from(routesSet).sort(),
    };
  }, [
    rawEvaluations,
    rawSupervisions,
    startDate,
    endDate,
    typeFilter,
    debouncedSearchTerm,
    selectedZone,
    selectedRoute,
    clientsById,
    clientsByKey,
    zoneByRouteMap,
  ]);

  const totalCount = allFilteredEvaluations.length;
  const evaluations = useMemo(() => {
    const from = (page - 1) * PAGE_SIZE;
    return allFilteredEvaluations.slice(from, from + PAGE_SIZE);
  }, [allFilteredEvaluations, page]);

  const openEditModal = (ev) => {
    const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload || '{}') : (ev.payload || {});
    const rawDate = String(ev.fecha || '').slice(0, 16).replace(' ', 'T');
    setEditingEvaluation(ev);
    setEditForm({
      punto_venta: ev.punto_venta || '',
      client_code: ev.client_code || '',
      ruta: ev.ruta && ev.ruta !== 'Sin ruta' ? ev.ruta : (payload.ruta || ''),
      zona: ev.zona || payload.zona || '',
      usuario: ev.usuario || '',
      fecha: rawDate || format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      puntaje: Number(ev.puntaje || 0),
      surtido_porcentaje: Number(payload.surtido_porcentaje || 0),
      observaciones: payload.observaciones || payload.comentarios || payload.notes || '',
    });
  };

  const handleSaveEvaluationEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editingEvaluation) return;
    setSavingEdit(true);
    try {
      const normalizedFecha = editForm.fecha ? editForm.fecha.replace('T', ' ') : editingEvaluation.fecha;
      await updateEvaluationAdmin(editingEvaluation, {
        ...editForm,
        fecha: normalizedFecha,
        puntaje: Number(editForm.puntaje) || 0,
        surtido_porcentaje: Number(editForm.surtido_porcentaje) || 0,
      });

      toast({
        title: 'Evaluación actualizada',
        description: `Se guardaron los cambios de ${editForm.punto_venta || editingEvaluation.id}.`,
        className: 'bg-emerald-600 text-white border-none',
      });
      setEditingEvaluation(null);
      await fetchEvaluations();
    } catch (err) {
      console.error('Error guardando edición de evaluación:', err);
      toast({
        title: 'Error al guardar',
        description: err?.message || 'No se pudo actualizar la evaluación.',
        variant: 'destructive',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE) || 1);

  // Estadísticas globales 
  const globalStats = useMemo(() => {
    const totals = (allFilteredEvaluations || []).reduce((acc, ev) => {
      acc.total += 1;
      acc.totalScore += Number(ev.puntaje || 0);
      const tipo = (ev.tipo || '').toUpperCase();
      if (tipo === 'PDV') acc.pdvCount += 1;
      if (tipo === 'CANAL MODERNO' || tipo === 'CC') acc.canalModernoCount += 1;
      return acc;
    }, { total: 0, totalScore: 0, pdvCount: 0, canalModernoCount: 0 });

    let supTotalScore = 0;
    let supCount = 0;
    (allFilteredSupervisions || []).forEach(s => {
       // DEBUG: Log status & score para diagnóstico
       console.log('[GlobalStats][Supervision]', { id: s.id, status: s.status, score: s.score });
       if (s.status === 'completed') {
           supTotalScore += Number(s.score || 0);
           supCount += 1;
       }
    });

    console.log('[GlobalStats] Evaluaciones:', totals.total, '| Supervisiones completed:', supCount, '| supTotalScore:', supTotalScore);

    const avgScore = totals.total > 0 ? totals.totalScore / totals.total : 0;
    const supAvg = supCount > 0 ? supTotalScore / supCount : 0;
    const finalAvg = totals.total && supCount ? (avgScore + supAvg) / 2 : (avgScore || supAvg);

    return {
      ...totals,
      avgScore,
      supAvg,
      supCount,
      finalAvg
    };
  }, [allFilteredEvaluations, allFilteredSupervisions]);

  const zoneStats = useMemo(() => {
    const map = new Map();
    const evalList = baseFilteredEvaluations || [];
    const supList = baseFilteredSupervisions || [];

    evalList.forEach((ev) => {
      const z = (ev.zona || 'SIN ZONA').toString().trim().toUpperCase() || 'SIN ZONA';
      const cur = map.get(z) || { zona: z, total: 0, count: 0, supTotal: 0, supCount: 0, supVisits: 0 };
      cur.total += Number(ev.puntaje || 0);
      cur.count += 1;
      map.set(z, cur);
    });
    supList.forEach((s) => {
      const z = (s.zona || 'SIN ZONA').toString().trim().toUpperCase() || 'SIN ZONA';
      const cur = map.get(z) || { zona: z, total: 0, count: 0, supTotal: 0, supCount: 0, supVisits: 0 };
      if (s.status === 'completed') {
        cur.supTotal = (cur.supTotal || 0) + Number(s.score || 0);
        cur.supCount = (cur.supCount || 0) + 1;
      }
      cur.supVisits = (cur.supVisits || 0) + (s.visits?.length || 0);
      map.set(z, cur);
    });

    const results = Array.from(map.values())
      .map((e) => {
        const avg = e.count ? e.total / e.count : 0;
        const supAvg = e.supCount ? e.supTotal / e.supCount : 0;
        const finalAvg = e.count && e.supCount ? (avg + supAvg) / 2 : (avg || supAvg);
        return { zona: e.zona, avg, count: e.count, supAvg, supCount: e.supCount, supVisits: e.supVisits, finalAvg };
      })
      .sort((a, b) => {
        if (a.zona === 'SIN ZONA') return 1;
        if (b.zona === 'SIN ZONA') return -1;
        return b.finalAvg - a.finalAvg;
      });

    // Add TOTAL row at the end
    const totalEvalCount = evalList.length;
    const totalEvalScore = evalList.reduce((acc, ev) => acc + Number(ev.puntaje || 0), 0);
    const completedSups = supList.filter((s) => s.status === 'completed');
    const totalSupCount = completedSups.length;
    const totalSupScore = completedSups.reduce((acc, s) => acc + Number(s.score || 0), 0);
    const totalAvg = totalEvalCount > 0 ? totalEvalScore / totalEvalCount : 0;
    const totalSupAvg = totalSupCount > 0 ? totalSupScore / totalSupCount : 0;
    const totalFinalAvg = totalEvalCount && totalSupCount ? (totalAvg + totalSupAvg) / 2 : (totalAvg || totalSupAvg);

    if (totalEvalCount > 0 || totalSupCount > 0) {
      results.push({
        zona: 'TOTAL',
        avg: totalAvg,
        count: totalEvalCount,
        supAvg: totalSupAvg,
        supCount: totalSupCount,
        supVisits: supList.reduce((acc, s) => acc + (s.visits?.length || 0), 0),
        finalAvg: totalFinalAvg,
        isTotal: true,
      });
    }

    return results;
  }, [baseFilteredEvaluations, baseFilteredSupervisions]);

  const routesForSelectedZone = useMemo(() => {
    const targetZone = selectedZone || 'TOTAL';
    const map = new Map();
    (baseFilteredEvaluations || []).forEach((ev) => {
      const z = (ev.zona || 'SIN ZONA').toString().trim().toUpperCase() || 'SIN ZONA';
      const isTarget = targetZone === 'TOTAL' || z === targetZone;
      if (!isTarget) return;

      const r = (ev.ruta || 'SIN RUTA').toString().trim().toUpperCase() || 'SIN RUTA';
      const cur = map.get(r) || { ruta: r, total: 0, count: 0, supTotal: 0, supCount: 0, supVisits: 0 };
      cur.total += Number(ev.puntaje || 0);
      cur.count += 1;
      map.set(r, cur);
    });
    (baseFilteredSupervisions || []).forEach((s) => {
      const z = (s.zona || 'SIN ZONA').toString().trim().toUpperCase() || 'SIN ZONA';
      const isTarget = targetZone === 'TOTAL' || z === targetZone;
      if (!isTarget) return;

      const r = (s.ruta || 'SIN RUTA').toString().trim().toUpperCase() || 'SIN RUTA';
      const cur = map.get(r) || { ruta: r, total: 0, count: 0, supTotal: 0, supCount: 0, supVisits: 0 };
      if (s.status === 'completed') {
        cur.supTotal = (cur.supTotal || 0) + Number(s.score || 0);
        cur.supCount = (cur.supCount || 0) + 1;
      }
      cur.supVisits = (cur.supVisits || 0) + (s.visits?.length || 0);
      map.set(r, cur);
    });

    return Array.from(map.values())
      .map((e) => {
        const avg = e.count ? e.total / e.count : 0;
        const supAvg = e.supCount ? e.supTotal / e.supCount : 0;
        const finalAvg = e.count && e.supCount ? (avg + supAvg) / 2 : (avg || supAvg);
        return { ruta: e.ruta, avg, count: e.count, supAvg, supCount: e.supCount, supVisits: e.supVisits, finalAvg };
      })
      .sort((a, b) => b.finalAvg - a.finalAvg);
  }, [selectedZone, baseFilteredEvaluations, baseFilteredSupervisions]);

  const handleViewDetails = async (ev) => {
    console.log('View details requested for:', ev);
    setSelectedEvaluation(ev);
    setDetailsLoading(true);
    try {
      console.log('Fetching full details for ID:', ev.id, 'Type:', ev.tipo);
      const fullEval = await getEvaluationById(ev.id, ev.tipo);
      console.log('Full details received:', fullEval);

      if (fullEval) {
        setSelectedEvaluation(prev => {
          const newState = { ...prev, ...fullEval };
          console.log('New selected evaluation state:', newState);
          return newState;
        });
      } else {
        console.warn('getEvaluationById returned null');
      }
    } catch (e) {
      console.error('Error fetching details:', e);
    } finally {
      setDetailsLoading(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <>
      <Helmet>
        <title>Evaluaciones - Supervisor</title>
      </Helmet>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-2 md:p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            Evaluaciones del Supervisor
          </h1>
          <p className="text-slate-400">Monitorea el rendimiento de las evaluaciones en tus rutas asignadas</p>

          <div className="flex flex-wrap justify-end gap-3 mt-4">
            <Button variant="outline" className="border-blue-500/20 text-blue-400 font-bold bg-blue-500/10 hover:bg-blue-500/20" asChild>
              <Link to="/supervisor/onboard-summary">
                Ver Supervisiones Abordo
              </Link>
            </Button>
            <Button
              onClick={() => {
                if (!allFilteredEvaluations || allFilteredEvaluations.length === 0) return;

                const csvData = allFilteredEvaluations.map(ev => {
                  const merged = { ...ev, ...(ev.payload || {}) };

                  // Extract Details
                  let detailsStr = '';
                  if (ev.tipo === 'PDV') {
                    // PDV Logic
                    const criteria = merged.criterios || [];
                    if (criteria.length > 0) {
                      detailsStr = criteria.map(c => `${c.nombre}: ${c.puntos} pts`).join(' | ');
                    } else {
                      // Fallback fields
                      const parts = [];
                      if (merged.surtido_porcentaje !== undefined) parts.push(`Surtido: ${merged.surtido_porcentaje}%`);
                      if (merged.enfriador_primera_pos) parts.push(`Enfriador 1ra: ${merged.enfriador_primera_pos}`);
                      if (merged.fachada_banderola) parts.push(`Fachada: ${merged.fachada_banderola}`);
                      detailsStr = parts.join(' | ');
                    }
                  } else {
                    // Canal Moderno Logic
                    let res = merged.resultados || {};
                    if (typeof res === 'string') {
                      try { res = JSON.parse(res); } catch (e) { }
                    }
                    const ok = res.detallesOk || [];
                    const mal = res.detallesMal || [];
                    detailsStr = `OK: [${ok.join(', ')}] | MAL: [${mal.join(', ')}]`;

                    // Fallback for older CM format
                    if (!ok.length && !mal.length && merged.sections) {
                      detailsStr = merged.sections.map(s => `${s.title}: ${s.score_final?.toFixed(0)}%`).join(' | ');
                    }
                  }

                  // Extract Photos
                  let photos = merged.fotos || merged.photos || [];
                  if (!photos.length) {
                    const photoUrls = [
                      merged.photo_fachada,
                      merged.photo_destino,
                      merged.photo_impulso,
                      merged.photo_enfriador,
                      merged.photo_interior,
                      ...(merged.photoUrls || []),
                      ...(merged.photo_urls || [])
                    ].filter(Boolean);
                    photos = photoUrls.map(url => (typeof url === 'string' ? { url } : url));
                  }

                  const fixUrl = (u) => {
                    if (!u) return '';
                    let url = u.url || u;
                    if (!url.startsWith('http')) {
                      url = url.startsWith('/') ? `https://cervezasfinas.com${url}` : `https://cervezasfinas.com/${url}`;
                    }
                    if (url.includes('/uploads/') && !url.includes('/api/uploads/')) {
                      url = url.replace('/uploads/', '/api/uploads/');
                    }
                    if (url.endsWith('.')) url += 'jpg';
                    return url;
                  };

                  const photosStr = photos.map(p => fixUrl(p)).join(', ');

                  return {
                    Fecha: safeFormatEvalDate(ev.fecha),
                    'Punto de Venta': ev.punto_venta,
                    'Código': ev.client_code || '',
                    Zona: (ev.zona || '').toUpperCase(),
                    Ruta: (ev.ruta || '').toUpperCase(),
                    Tipo: ev.tipo,
                    Puntaje: typeof ev.puntaje === 'number' ? ev.puntaje.toFixed(2) : 'N/A',
                    Evaluador: ev.usuario,
                    'Detalles': detailsStr,
                    'Foto 1': photos[0] ? fixUrl(photos[0]) : '',
                    'Foto 2': photos[1] ? fixUrl(photos[1]) : '',
                    'Foto 3': photos[2] ? fixUrl(photos[2]) : '',
                    'Foto 4': photos[3] ? fixUrl(photos[3]) : '',
                    'Foto 5': photos[4] ? fixUrl(photos[4]) : '',
                    'Foto 6': photos[5] ? fixUrl(photos[5]) : '',
                  };
                });

                const csv = Papa.unparse(csvData);
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `evaluaciones_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              variant="outline"
              className="border-emerald-500 text-emerald-400 hover:bg-emerald-900/20"
              disabled={!allFilteredEvaluations || allFilteredEvaluations.length === 0}
            >
              <ClipboardCheck className="mr-2 h-4 w-4" />
              Descargar Reporte CSV
            </Button>
          </div>
        </motion.div>

        {/* tarjetas de KPIs */}
        {loading ? (
          <StatsSkeleton />
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
          >
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 border-0 text-white shadow-lg shadow-blue-900/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100 text-sm font-medium mb-1">Total Evaluaciones</p>
                    <p className="text-3xl font-bold">{globalStats.total}</p>
                  </div>
                  <ClipboardCheck className="h-12 w-12 text-blue-200 opacity-80" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 text-white shadow-lg shadow-emerald-900/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-emerald-100 text-sm font-medium mb-1">Promedio General</p>
                    <p className="text-3xl font-bold">{globalStats.finalAvg.toFixed(1)}</p>
                    <p className="text-emerald-100 text-[9px] mt-1 uppercase font-bold tracking-wider">Combinado (Eval. + Abordo)</p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-emerald-100 text-[9px]">Eval: {globalStats.avgScore.toFixed(1)}</span>
                      <span className="text-emerald-100 text-[9px]">Abordo: {globalStats.supCount > 0 ? globalStats.supAvg.toFixed(1) : 'N/A'} ({globalStats.supCount})</span>
                    </div>
                  </div>
                  <Award className="h-12 w-12 text-emerald-200 opacity-80" />
                </div>
              </CardContent>
            </Card>


            <Card className="bg-gradient-to-br from-purple-500 to-purple-600 border-0 text-white shadow-lg shadow-purple-900/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-100 text-sm font-medium mb-1">PDV</p>
                    <p className="text-3xl font-bold">{globalStats.pdvCount}</p>
                  </div>
                  <Users className="h-12 w-12 text-purple-200 opacity-80" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-500 to-orange-600 border-0 text-white shadow-lg shadow-orange-900/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-orange-100 text-sm font-medium mb-1">Canal Moderno</p>
                    <p className="text-3xl font-bold">{globalStats.canalModernoCount}</p>
                  </div>
                  <TrendingUp className="h-12 w-12 text-orange-200 opacity-80" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Filtros */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card className="mb-6 bg-slate-800/50 border-slate-700 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filtros de Búsqueda
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <Input
                  placeholder="Buscar por punto de venta, código, ruta, zona o evaluador..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
                <div className="space-y-2">
                  <Select value={dateRange} onValueChange={(val) => { setDateRange(val); setPage(1); }}>
                    <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                      <SelectValue placeholder="Filtrar por fecha" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las fechas</SelectItem>
                      <SelectItem value="last7">Últimos 7 días</SelectItem>
                      <SelectItem value="last30">Últimos 30 días</SelectItem>
                      <SelectItem value="thisMonth">Este mes</SelectItem>
                      <SelectItem value="thisYear">Este año</SelectItem>
                      <SelectItem value="month">Mes específico</SelectItem>
                    </SelectContent>
                  </Select>
                  {dateRange === 'month' && (
                    <Input
                      type="month"
                      className="bg-slate-700/50 border-slate-600 text-white text-sm"
                      value={customMonth}
                      onChange={(e) => {
                        setCustomMonth(e.target.value);
                        setPage(1);
                      }}
                    />
                  )}
                </div>
                <Select value={typeFilter} onValueChange={(val) => { setTypeFilter(val); setPage(1); }}>
                  <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                    <SelectValue placeholder="Filtrar por tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los tipos</SelectItem>
                    <SelectItem value="pdv">PDV</SelectItem>
                    <SelectItem value="canal_moderno">Canal Moderno</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={selectedZone || 'ALL_ZONES'}
                  onValueChange={(val) => {
                    setSelectedZone(val === 'ALL_ZONES' ? null : val);
                    setSelectedRoute(null);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                    <SelectValue placeholder="Todas las zonas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL_ZONES">Todas las zonas</SelectItem>
                    {availableZones.map((z) => (
                      <SelectItem key={z} value={z}>{z}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={selectedRoute || 'ALL_ROUTES'}
                  onValueChange={(val) => {
                    setSelectedRoute(val === 'ALL_ROUTES' ? null : val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                    <SelectValue placeholder="Todas las rutas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL_ROUTES">Todas las rutas</SelectItem>
                    {availableRoutes.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(selectedZone || selectedRoute || searchTerm || typeFilter !== 'all') && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-700/70 text-xs">
                  <div className="flex flex-wrap items-center gap-2 text-slate-300">
                    <span>Filtros activos:</span>
                    {selectedZone && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
                        Zona: {selectedZone}
                      </span>
                    )}
                    {selectedRoute && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 font-bold">
                        Ruta: {selectedRoute}
                      </span>
                    )}
                    {typeFilter !== 'all' && (
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 font-bold">
                        Tipo: {typeFilter.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-slate-300 hover:text-white"
                    onClick={() => {
                      setSelectedZone(null);
                      setSelectedRoute(null);
                      setSearchTerm('');
                      setTypeFilter('all');
                      setPage(1);
                    }}
                  >
                    Limpiar filtros
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Estadísticas por Zona y Ruta */}
        {!loading && (baseFilteredEvaluations.length > 0 || baseFilteredSupervisions.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-white text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Promedio por Zona
                  </span>
                  <span className="text-xs text-slate-400">Zonas: {zoneStats.length}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto max-h-64">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-700/60 sticky top-0">
                      <tr>
                        <th className="p-2 text-slate-300">Zona</th>
                        <th className="p-2 text-right text-slate-300">Abordo</th>
                        <th className="p-2 text-right text-slate-300">Eval.</th>
                        <th className="p-2 text-right text-emerald-400 font-bold">Promedio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zoneStats.map((z) => (
                        <tr
                          key={z.zona}
                          className={`border-b border-slate-700 cursor-pointer hover:bg-slate-700/50 transition-colors ${selectedZone === z.zona ? 'bg-emerald-900/40' : ''} ${z.isTotal ? 'bg-slate-700/80 font-bold border-t-2 border-emerald-500/30 sticky bottom-0' : ''}`}
                          onClick={() => {
                            setSelectedZone((prev) => (prev === z.zona ? null : z.zona));
                            setSelectedRoute(null);
                            setPage(1);
                          }}
                        >
                          <td className="p-2 text-white flex items-center gap-2">
                            {z.isTotal && <BarChart3 className="h-3 w-3 text-emerald-400" />}
                            {z.zona}
                          </td>
                          <td className="p-2 text-right text-slate-300">
                            <span className={getScoreColor(z.supAvg)}>{z.supCount > 0 ? z.supAvg.toFixed(1) : '-'}</span> <span className="opacity-50 text-[10px]">({z.supVisits || 0})</span>
                          </td>
                          <td className="p-2 text-right text-slate-300">
                             <span className={getScoreColor(z.avg)}>{z.count > 0 ? z.avg.toFixed(1) : '-'}</span> <span className="opacity-50 text-[10px]">({z.count})</span>
                          </td>
                          <td className="p-2 text-right font-bold text-white bg-slate-700/30">
                             {(z.count > 0 || z.supCount > 0) ? z.finalAvg.toFixed(1) : '-'}
                          </td>
                        </tr>
                      ))}
                      {zoneStats.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-2 text-center text-slate-400">
                            Sin datos para el filtro actual.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-white text-sm flex items-center justify-between">
                  <span>Rutas {selectedZone ? `en ${selectedZone}` : '(Todas las zonas)'}</span>
                  <span className="text-xs text-slate-400">
                    Rutas: {routesForSelectedZone.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto max-h-64">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-700/60 sticky top-0">
                      <tr>
                        <th className="p-2 text-slate-300">Ruta</th>
                        <th className="p-2 text-right text-slate-300">Abordo</th>
                        <th className="p-2 text-right text-slate-300">Eval.</th>
                        <th className="p-2 text-right text-emerald-400 font-bold">Promedio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routesForSelectedZone.length > 0 ? (
                        routesForSelectedZone.map((r) => (
                          <tr
                            key={r.ruta}
                            onClick={() => {
                              setSelectedRoute((prev) => (prev === r.ruta ? null : r.ruta));
                              setPage(1);
                            }}
                            className={`border-b border-slate-700 cursor-pointer hover:bg-slate-700/40 transition-colors ${selectedRoute === r.ruta ? 'bg-blue-900/40 font-bold' : ''}`}
                          >
                            <td className="p-2 text-white">{r.ruta}</td>
                            <td className="p-2 text-right text-slate-300">
                              <span className={getScoreColor(r.supAvg)}>{r.supCount > 0 ? r.supAvg.toFixed(1) : '-'}</span> <span className="opacity-50 text-[10px]">({r.supVisits || 0})</span>
                            </td>
                            <td className="p-2 text-right text-slate-300">
                               <span className={getScoreColor(r.avg)}>{r.count > 0 ? r.avg.toFixed(1) : '-'}</span> <span className="opacity-50 text-[10px]">({r.count})</span>
                            </td>
                            <td className="p-2 text-right font-bold text-white bg-slate-700/30">
                               {(r.count > 0 || r.supCount > 0) ? r.finalAvg.toFixed(1) : '-'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="p-2 text-center text-slate-400">
                            Sin rutas para la zona seleccionada.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabla de Evaluaciones */}
        <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-white">Listado de Evaluaciones</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <TableSkeleton />
            ) : evaluations.length === 0 ? (
              <div className="text-center text-slate-400 py-8">
                No se encontraron evaluaciones.
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="space-y-4"
              >
                {/* Vista Móvil: Tarjetas */}
                <div className="block md:hidden space-y-4">
                  {evaluations.map((ev) => (
                    <div key={ev.id} className="bg-slate-700/40 p-4 rounded-lg border border-slate-600">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-white font-semibold text-sm">{ev.punto_venta}</p>
                          <p className="text-xs text-slate-400">{safeFormatEvalDate(ev.fecha)}</p>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-bold ${getScoreColor(ev.puntaje)} bg-slate-800 border border-slate-600`}>
                          {typeof ev.puntaje === 'number' ? ev.puntaje.toFixed(2) : 'N/A'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 mb-3">
                        <div>
                          <span className="text-slate-500 block">Tipo</span>
                          <span className={ev.tipo === 'PDV' ? 'text-purple-400' : 'text-orange-400'}>{ev.tipo}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Evaluador</span>
                          <span>{ev.usuario}</span>
                        </div>
                        {ev.zona && (
                          <div>
                            <span className="text-slate-500 block">Zona</span>
                            <span>{ev.zona}</span>
                          </div>
                        )}
                        {ev.ruta && (
                          <div>
                            <span className="text-slate-500 block">Ruta</span>
                            <span>{ev.ruta}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-600"
                          onClick={() => handleViewDetails(ev)}
                        >
                          Ver Detalles
                        </Button>
                        {isAdminUser && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                            onClick={() => openEditModal(ev)}
                          >
                            <Pencil className="w-3.5 h-3.5 mr-1" />
                            Editar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Vista Desktop: Tabla */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-700/50">
                      <tr className="border-b border-slate-700">
                        <th className="p-3 text-slate-300">Fecha</th>
                        <th className="p-3 text-slate-300">Punto de Venta</th>
                        <th className="p-3 text-slate-300">Código</th>
                        <th className="p-3 text-slate-300">Zona</th>
                        <th className="p-3 text-slate-300">Ruta</th>
                        <th className="p-3 text-slate-300">Tipo</th>
                        <th className="p-3 text-slate-300">Puntaje</th>
                        <th className="p-3 text-slate-300">Evaluador</th>
                        <th className="p-3 text-slate-300">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evaluations.map((ev) => (
                        <tr
                          key={ev.id}
                          className="border-b border-slate-700 hover:bg-slate-700/50 transition-colors"
                        >
                          <td className="p-3 text-slate-200">
                            {safeFormatEvalDate(ev.fecha)}
                          </td>
                          <td className="p-3 text-white">{ev.punto_venta}</td>
                          <td className="p-3 text-slate-300">{ev.client_code || 'Sin código'}</td>
                          <td className="p-3 text-slate-300">{ev.zona || 'Sin zona'}</td>
                          <td className="p-3 text-slate-300">{ev.ruta || 'Sin ruta'}</td>
                          <td className="p-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${(ev.tipo === 'Canal Moderno' || ev.tipo === 'CC' || ev.tipo === 'CANAL MODERNO')
                                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                }`}>
                                {ev.tipo}
                              </span>
                              {(ev.payload?.ai_mode || ev.payload?.ai_evaluation) && (
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  ev.payload?.ai_evaluation
                                    ? (ev.payload.ai_evaluation.fotos_validas === false ||
                                       (ev.payload.ai_evaluation.invasion === 'si' && String(ev.payload.invasion || 'no').toLowerCase() === 'no') ||
                                       (ev.payload.ai_evaluation.huecos === 'si' && String(ev.payload.huecos || 'no').toLowerCase() === 'no')
                                        ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40')
                                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                }`}>
                                  {ev.payload?.ai_evaluation
                                    ? (ev.payload.ai_evaluation.fotos_validas === false ||
                                       (ev.payload.ai_evaluation.invasion === 'si' && String(ev.payload.invasion || 'no').toLowerCase() === 'no') ||
                                       (ev.payload.ai_evaluation.huecos === 'si' && String(ev.payload.huecos || 'no').toLowerCase() === 'no')
                                        ? '🔴 IA Discrepancia'
                                        : '🟢 IA Verificada')
                                    : '⏳ IA Pendiente Sync'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className={`p-3 font-bold text-lg ${getScoreColor(ev.puntaje)}`}>
                            {typeof ev.puntaje === 'number'
                              ? ev.puntaje.toFixed(2)
                              : 'N/A'}
                          </td>
                          <td className="p-3 text-slate-300">{ev.usuario}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-slate-600 text-slate-300 hover:bg-slate-700"
                                onClick={() => handleViewDetails(ev)}
                              >
                                Ver Detalles
                              </Button>
                              {isAdminUser && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                                  onClick={() => openEditModal(ev)}
                                >
                                  <Pencil className="w-3.5 h-3.5 mr-1" />
                                  Editar
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>

        {/* Paginación */}
        <div className="flex justify-between items-center mt-6">
          <p className="text-sm text-slate-400">
            Mostrando {evaluations.length} de {totalCount} evaluaciones
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              variant="outline"
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Anterior
            </Button>
            <span className="text-slate-300 px-4 py-2">
              Página {page} de {totalPages}
            </span>
            <Button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              variant="outline"
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>

      {/* Dialog de Detalles */}
      {selectedEvaluation && (
        <Dialog
          open={!!selectedEvaluation}
          onOpenChange={() => setSelectedEvaluation(null)}
        >
          <DialogContent className="max-w-2xl bg-slate-800 text-white border-slate-700">
            <DialogHeader>
              <DialogTitle>Detalles de la Evaluación</DialogTitle>
              <DialogDescription className="text-slate-400">
                Tipo: {selectedEvaluation.tipo}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 max-h-[70vh] overflow-y-auto p-1 pr-2">
              {detailsLoading ? (
                <div className="text-center py-8 text-slate-300">Cargando detalles...</div>
              ) : (
                <EvaluationDetailViewer
                  evaluation={selectedEvaluation}
                  onEvaluationUpdated={(updated) => {
                    setSelectedEvaluation(updated);
                    fetchEvaluations();
                  }}
                />
              )}
            </div>
            <DialogFooter className="flex gap-2">
              {isAdminUser && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const target = selectedEvaluation;
                    setSelectedEvaluation(null);
                    openEditModal(target);
                  }}
                  className="border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                >
                  <Pencil className="w-4 h-4 mr-1.5" />
                  Editar Evaluación
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => setSelectedEvaluation(null)}
                className="bg-slate-700 hover:bg-slate-600"
              >
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal Admin: Editar Evaluación */}
      {editingEvaluation && (
        <Dialog open={!!editingEvaluation} onOpenChange={(open) => !open && setEditingEvaluation(null)}>
          <DialogContent className="max-w-lg bg-slate-900 text-white border-slate-700">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-amber-400" />
                Editar Evaluación ({editingEvaluation.tipo})
              </DialogTitle>
              <DialogDescription className="text-slate-400 text-xs">
                Modifica los datos de la evaluación y su calificación. Los cambios se sincronizan en el servidor.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveEvaluationEdit} className="space-y-3 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">Punto de Venta / Tienda</label>
                  <Input
                    value={editForm.punto_venta}
                    onChange={(e) => setEditForm({ ...editForm, punto_venta: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">Código Cliente</label>
                  <Input
                    value={editForm.client_code}
                    onChange={(e) => setEditForm({ ...editForm, client_code: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">Ruta</label>
                  <Input
                    value={editForm.ruta}
                    onChange={(e) => setEditForm({ ...editForm, ruta: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">Zona</label>
                  <Input
                    value={editForm.zona}
                    onChange={(e) => setEditForm({ ...editForm, zona: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">Evaluador</label>
                  <Input
                    value={editForm.usuario}
                    onChange={(e) => setEditForm({ ...editForm, usuario: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">Fecha y Hora</label>
                  <Input
                    type="datetime-local"
                    value={editForm.fecha}
                    onChange={(e) => setEditForm({ ...editForm, fecha: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-emerald-400">Puntaje Total (%)</label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={editForm.puntaje}
                    onChange={(e) => setEditForm({ ...editForm, puntaje: e.target.value })}
                    className="bg-slate-800 border-emerald-500/40 text-emerald-300 font-bold text-sm"
                  />
                </div>
                {editingEvaluation.tipo === 'PDV' && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Surtido (%)</label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={editForm.surtido_porcentaje}
                      onChange={(e) => setEditForm({ ...editForm, surtido_porcentaje: e.target.value })}
                      className="bg-slate-800 border-slate-700 text-white text-sm"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Observaciones / Comentarios</label>
                <textarea
                  rows={3}
                  value={editForm.observaciones}
                  onChange={(e) => setEditForm({ ...editForm, observaciones: e.target.value })}
                  className="w-full rounded-md bg-slate-800 border border-slate-700 p-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="Comentarios u observaciones de la evaluación..."
                />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingEvaluation(null)}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingEdit}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  {savingEdit ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                  Guardar Cambios
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
