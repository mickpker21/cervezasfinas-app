// src/pages/DynamicAdvisorDashboard.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { getTodayMexico } from '@/lib/dateUtils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PieChart,
  Activity,
  ShoppingCart,
  Target,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Users,
  Search,
  SlidersHorizontal,
  Calendar,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Phone,
  MapPin,
  Sparkles,
  ChevronRight,
  Award,
  BarChart3,
  RefreshCw,
  Store
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import DonutProgress from '@/components/DonutProgress';
import SyncButton from '@/components/SyncButton';
import SalesDialog from '@/components/SalesDialog';
import { supabase } from '@/supabaseClient';
import { getSalesBySku } from '@/repositories/salesRepository';
import { getVisitsSummary } from '@/repositories/visitsRepository';
import { getClients, getClientsByCodes } from '@/repositories/clientsRepository';
import { getEvaluations } from '@/repositories/evaluationsRepository';
import { getGoals } from '@/repositories/goalsRepository';
import DashboardSkeleton from '@/components/skeletons/DashboardSkeleton';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { kvStorage } from '@/services/kvStorage';
import { detectUserRoute } from '@/repositories/routeRepository';
import { useNavigate } from 'react-router-dom';

export default function DynamicAdvisorDashboard() {
  const { user } = useSupabaseAuth();
  const navigate = useNavigate();

  // ---------- STATE ----------
  const [userName, setUserName] = useState('Asesor');
  const [loading, setLoading] = useState(true);
  const [isComparativeLoading, setIsComparativeLoading] = useState(false);

  // Rutas (permitidas vs presentes)
  const [allowedRoutes, setAllowedRoutes] = useState([]);
  const [salesRoute, setSalesRoute] = useState('');

  // Periodo seleccionado
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Datos base
  const [clients, setClients] = useState([]);
  const [evalsThisMonth, setEvalsThisMonth] = useState([]);

  // Ventas crudas para el periodo actual, mes anterior y mismo mes año anterior
  const [vpsRows, setVpsRows] = useState([]);
  const [vpsRowsPrevMonth, setVpsRowsPrevMonth] = useState([]);
  const [vpsRowsPrevYear, setVpsRowsPrevYear] = useState([]);

  // Ventas derivadas (HL)
  const [totalSalesAll, setTotalSalesAll] = useState(0);
  const [salesByZonaRaw, setSalesByZonaRaw] = useState([]);
  const [salesBySku, setSalesBySku] = useState([]);

  // Meta y zona/aportación
  const [routeMeta, setRouteMeta] = useState(0);
  const [routeZona, setRouteZona] = useState('OAXACA');
  const [zoneTotalSales, setZoneTotalSales] = useState(0);
  const [routeSalesInZone, setRouteSalesInZone] = useState(0);

  // Visitas
  const [visitsTodayCount, setVisitsTodayCount] = useState(0);
  const [visitsThisMonthCount, setVisitsThisMonthCount] = useState(0);
  const [visitsTotalCount, setVisitsTotalCount] = useState(0);

  // SKUs (búsqueda y catálogo)
  const [skuSearch, setSkuSearch] = useState('');
  const [skuDescMap, setSkuDescMap] = useState({});

  // Diálogo de ventas para cliente seleccionado
  const [salesClientDialog, setSalesClientDialog] = useState(null);

  // Estado del Módulo de Clientes con Caída
  const [dropComparisonMode, setDropComparisonMode] = useState('vs_prev_year'); // 'vs_prev_year' | 'vs_prev_month'
  const [dropFilterSeverity, setDropFilterSeverity] = useState('all'); // 'all' | 'lost' | 'severe' | 'moderate'
  const [dropSearch, setDropSearch] = useState('');
  const [dropSort, setDropSort] = useState('hl_desc'); // 'hl_desc' | 'pct_desc' | 'name_asc'
  const [visibleDropLimit, setVisibleDropLimit] = useState(15);

  // ---------- HELPERS ----------
  const strip = (s) => (s ?? '').toString().trim();
  const norm = (s) => strip(s).toUpperCase();
  const routeKey = (s) => {
    const key = norm(s).replace(/[^A-Z0-9]/g, '');
    return /^\d+$/.test(key) ? key.replace(/^0+(?=\d)/, '') : key;
  };
  const clientCodeKey = (s) => norm(strip(s)).replace(/^0+/, '').replace(/[^A-Z0-9]/g, '');
  const isZeroLike = (s) => {
    const t = strip(s);
    if (!t) return false;
    if (/^0+(\.0+)?$/.test(t)) return true;
    if (/^\d+$/.test(t) && Number(t) === 0) return true;
    return false;
  };
  const zoneClean = (z) => strip(z).replace(/\.xlsx$/i, '');

  const normalizeRouteValue = (value) => {
    if (value == null) return '';
    return String(value).toLowerCase().replace(/\.xlsx$/g, '').trim();
  };

  const splitMultiValue = (raw) => {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw.map((entry) => String(entry));
    const text = String(raw).trim();
    if (!text) return [];
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed.map((entry) => String(entry));
      } catch (e) { }
    }
    return text.split(/[,;|]/).map((entry) => entry.trim()).filter(Boolean);
  };

  const ROUTE_CANDIDATE_FIELDS = ['sales_route', 'internal_route', 'route', 'ruta'];

  const collectClientRouteCandidates = (client) => {
    const set = new Set();
    if (!client) return [];
    ROUTE_CANDIDATE_FIELDS.forEach((field) => {
      if (field in client) {
        const entries = splitMultiValue(client[field]);
        entries.forEach((entry) => {
          const normalized = normalizeRouteValue(entry);
          if (normalized) set.add(normalized);
        });
      }
    });
    return Array.from(set);
  };

  function endOfMonthISO(y, m) {
    const dt = new Date(y, m, 0);
    return dt.toISOString().slice(0, 10);
  }

  function countBusinessDays(fromISO, toISO) {
    if (!fromISO || !toISO) return 0;
    const from = new Date(fromISO);
    const to = new Date(toISO);
    if (to < from) return 0;
    let c = 0, d = new Date(from);
    while (d <= to) {
      const dow = d.getDay();
      if (dow !== 0) c += 1;
      d.setDate(d.getDate() + 1);
    }
    return c;
  }

  function normalizeClientCode(code) {
    if (code === undefined || code === null) return '';
    return String(code).trim();
  }

  function getSkuImage(sku) {
    // Primary: cervezasfinas.com/portafolio/ (same as SupervisorDashboard)
    const key = (sku || '').toString().trim();
    if (key) return `https://cervezasfinas.com/portafolio/${key}.png`;
    return '/brands/default.png';
  }

  function getSkuImageFallback(sku) {
    // Fallback chain: uppercase variant → Supabase storage → default
    const key = (sku || '').toString().trim().toUpperCase();
    if (key) return `https://cervezasfinas.com/portafolio/${key}.png`;
    return '/brands/default.png';
  }

  // Índice de clientes por múltiples variantes de clave para búsqueda infalible
  const [clientsIndexByKey, setClientsIndexByKey] = useState(new Map());

  // Helper para resolver el nombre comercial o nombre más claro del cliente
  const getClientDisplayName = useCallback((clientObj, fallbackCode) => {
    const code = strip(clientObj?.client_code || clientObj?.cve_cliente || clientObj?.code || fallbackCode || '');
    if (!clientObj) return code ? `Cliente ${code}` : 'Cliente';

    const bName = strip(
      clientObj.business_name ||
      clientObj.nombre_comercial ||
      clientObj.razon_social ||
      clientObj.nombre_negocio ||
      clientObj.negocio
    );
    const name = strip(clientObj.name);

    // 1. Preferir nombre comercial si es descriptivo (no numérico puro ni igual al código)
    if (bName && bName.toLowerCase() !== code.toLowerCase() && !/^cliente\s+\d+$/i.test(bName) && isNaN(Number(bName))) {
      return bName;
    }
    // 2. Preferir nombre de contacto o razón social si es descriptivo
    if (name && name.toLowerCase() !== code.toLowerCase() && !/^cliente\s+\d+$/i.test(name) && isNaN(Number(name))) {
      return name;
    }
    if (bName) return bName;
    if (name) return name;
    return `Cliente ${code}`;
  }, []);

  // Helper para buscar cliente en el mapa por cualquier variante de código
  const lookupClient = useCallback((codeOrKey) => {
    if (!codeOrKey) return null;
    const raw = strip(codeOrKey);
    const k1 = clientCodeKey(raw);
    const k2 = raw;
    const k3 = raw.replace(/^0+/, '');
    const k4 = raw.toUpperCase();
    return (
      clientsIndexByKey.get(k1) ||
      clientsIndexByKey.get(k2) ||
      clientsIndexByKey.get(k3) ||
      clientsIndexByKey.get(k4) ||
      null
    );
  }, [clientsIndexByKey]);

  // Derivar ruta para una fila de ventas_por_sku
  const routeFromRow = (r) => {
    const rx = strip(r?.ruta_express);
    if (rx && !isZeroLike(rx)) return rx;

    const rn = r?.ruta;
    const n = Number(rn);
    if (Number.isFinite(n) && n > 0) return String(n);
    if (typeof rn === 'string' && rn && !isZeroLike(rn)) return strip(rn);

    const c = lookupClient(r?.cve_cliente);
    const alt = strip(c?.sales_route || c?.ruta || c?.internal_route || c?.route);
    return alt && !isZeroLike(alt) ? alt : null;
  };

  // ---------- RANGO COMPARATIVO DE PERIODOS ----------
  const comparativePeriods = useMemo(() => {
    const isPicker = /^\d{4}-\d{2}$/.test(period);
    const now = new Date();
    const todayStr = getTodayMexico();

    const [currY, currM] = (isPicker ? period : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
      .split('-')
      .map(Number);

    // Detectar si estamos viendo el mes en curso
    const isCurrentMonth = currY === now.getFullYear() && currM === (now.getMonth() + 1);

    // 1. Periodo Actual
    const startCurrent = `${currY}-${String(currM).padStart(2, '0')}-01`;
    const nextCurrent = `${currM === 12 ? currY + 1 : currY}-${String(currM === 12 ? 1 : currM + 1).padStart(2, '0')}-01`;
    const monthEnd = endOfMonthISO(currY, currM);
    // BUGFIX: Si es el mes actual, usar todayStr para elapsed correcto (tendencia)
    // Si es un mes pasado (picker o no), usar el fin del mes completo
    const endCurrent = isCurrentMonth ? (todayStr < monthEnd ? todayStr : monthEnd) : monthEnd;

    const totalBusiness = countBusinessDays(startCurrent, monthEnd);
    const elapsedBusiness = countBusinessDays(startCurrent, endCurrent);

    // 2. Mes Anterior (MoM)
    const prevMonthY = currM === 1 ? currY - 1 : currY;
    const prevMonthM = currM === 1 ? 12 : currM - 1;
    const startPrevMonth = `${prevMonthY}-${String(prevMonthM).padStart(2, '0')}-01`;
    const nextPrevMonth = `${currY}-${String(currM).padStart(2, '0')}-01`;
    const endPrevMonth = endOfMonthISO(prevMonthY, prevMonthM);

    // 3. Mismo Mes Año Anterior (YoY)
    const prevYearY = currY - 1;
    const prevYearM = currM;
    const startPrevYear = `${prevYearY}-${String(prevYearM).padStart(2, '0')}-01`;
    const nextPrevYear = `${prevYearM === 12 ? prevYearY + 1 : prevYearY}-${String(prevYearM === 12 ? 1 : prevYearM + 1).padStart(2, '0')}-01`;
    const endPrevYear = endOfMonthISO(prevYearY, prevYearM);

    const formatLabel = (y, m) => {
      try {
        const d = new Date(y, m - 1, 1);
        return d.toLocaleString('es-ES', { month: 'short', year: 'numeric' });
      } catch (e) {
        return `${y}-${String(m).padStart(2, '0')}`;
      }
    };

    return {
      current: {
        from: startCurrent,
        nextFrom: nextCurrent,
        to: endCurrent,
        year: currY,
        month: currM,
        label: formatLabel(currY, currM),
        totalBusiness,
        elapsedBusiness,
      },
      prevMonth: {
        from: startPrevMonth,
        nextFrom: nextPrevMonth,
        to: endPrevMonth,
        year: prevMonthY,
        month: prevMonthM,
        label: formatLabel(prevMonthY, prevMonthM),
      },
      prevYear: {
        from: startPrevYear,
        nextFrom: nextPrevYear,
        to: endPrevYear,
        year: prevYearY,
        month: prevYearM,
        label: formatLabel(prevYearY, prevYearM),
      },
    };
  }, [period]);

  const periodLabel = comparativePeriods.current.label;

  // ---------- CARGAR USUARIO & RUTAS ----------
  useEffect(() => {
    let active = true;
    (async () => {
      // El contexto conserva la sesión en SQLite para poder iniciar offline.
      // auth.getUser() fuerza una petición a Supabase y falla sin internet.
      const u = user;
      let route = '';
      if (u) {
        const metadata = u.user_metadata || {};
        try {
          route = await detectUserRoute(u) || '';
        } catch (e) {
          console.warn('Error resolving cached user route:', e);
        }
        if (!active) return;
        if (route) setSalesRoute(route);
        if (metadata.name) setUserName(metadata.name);
        else if (u.email) setUserName(u.email);
      }

      let list = [];
      try {
        const cachedAllowed = u?.id
          ? await kvStorage.getItem(`advisor_allowed_routes_${u.id}`)
          : null;
        if (cachedAllowed && Array.isArray(cachedAllowed)) list = cachedAllowed;
      } catch (e) { }
      if (active) setAllowedRoutes(list);

      try {
        const { data: routes } = u?.id
          ? await supabase
            .from('supervisor_allowed_sales_routes')
            .select('sales_route')
            .eq('supervisor_id', u.id)
          : { data: null };
        if (routes && Array.isArray(routes)) {
          const freshList = routes.map((r) => strip(r.sales_route)).filter(Boolean);
          if (freshList.length > 0 && active) {
            list = freshList;
            setAllowedRoutes(list);
            try { kvStorage.setItem(`advisor_allowed_routes_${u.id}`, list); } catch (e) { }
          }
        }
      } catch (e) {
        console.warn('Error fetching allowed routes', e);
      }

      if (!list.length && route && active) {
        setAllowedRoutes([route]);
      }
    })();
    return () => { active = false; };
  }, [user]);

  // ---------- CARGA DE VENTAS EN PARALELO (ACTUAL + MES ANTERIOR + AÑO ANTERIOR) ----------
  useEffect(() => {
    let active = true;
    (async () => {
      const isAdmin = user?.user_metadata?.role === 'admin' || user?.user_metadata?.role === 'manager';
      if (!salesRoute && !isAdmin) {
        if (active) {
          setVpsRows([]);
          setVpsRowsPrevMonth([]);
          setVpsRowsPrevYear([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setIsComparativeLoading(true);
      try {
        const { current, prevMonth, prevYear } = comparativePeriods;

        // 3 descargas en paralelo optimizadas con filtro de ruta
        const [currRows, prevMRows, prevYRows] = await Promise.all([
          getSalesBySku({
            from: current.from,
            to: current.to,
            nextFrom: current.nextFrom,
            salesRoute: salesRoute || undefined,
          }).catch((e) => { console.warn('Error loading current sales', e); return []; }),

          getSalesBySku({
            from: prevMonth.from,
            to: prevMonth.to,
            nextFrom: prevMonth.nextFrom,
            salesRoute: salesRoute || undefined,
          }).catch((e) => { console.warn('Error loading prev month sales', e); return []; }),

          getSalesBySku({
            from: prevYear.from,
            to: prevYear.to,
            nextFrom: prevYear.nextFrom,
            salesRoute: salesRoute || undefined,
          }).catch((e) => { console.warn('Error loading prev year sales', e); return []; }),
        ]);

        if (active) {
          setVpsRows(currRows || []);
          setVpsRowsPrevMonth(prevMRows || []);
          setVpsRowsPrevYear(prevYRows || []);
          setLoading(false);
          setIsComparativeLoading(false);
        }
      } catch (err) {
        console.error('advisor dashboard: error loading comparative sales', err);
        if (active) {
          setVpsRows([]);
          setVpsRowsPrevMonth([]);
          setVpsRowsPrevYear([]);
          setLoading(false);
          setIsComparativeLoading(false);
        }
      }
    })();
    return () => { active = false; };
  }, [comparativePeriods, salesRoute, user]);

  // Rutas presentes
  const presentRoutes = useMemo(() => {
    const map = new Map();
    for (const r of vpsRows || []) {
      const raw = routeFromRow(r);
      if (!raw) continue;
      const k = routeKey(raw);
      if (!map.has(k)) map.set(k, strip(raw));
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  }, [vpsRows, clientsIndexByKey]);

  const routeOptions = useMemo(() => {
    if (!allowedRoutes.length) return [];
    const allowedSet = new Set(allowedRoutes.map(routeKey));
    const filtered = presentRoutes.filter((r) => allowedSet.has(routeKey(r)));
    return filtered.length ? filtered : allowedRoutes;
  }, [allowedRoutes, presentRoutes]);

  useEffect(() => {
    if (!routeOptions.length) return;
    const loadSaved = async () => {
      let saved = null;
      try { saved = user?.id ? await kvStorage.getItem(`advisor.salesRoute_${user.id}`) : null; } catch (e) { }
      const found = saved && routeOptions.find((r) => routeKey(r) === routeKey(saved));
      const current = routeOptions.find((r) => routeKey(r) === routeKey(salesRoute));
      const assigned = user?.profile?.route || user?.profile?.sales_route || user?.profile?.ruta
        || user?.user_metadata?.route_number || user?.user_metadata?.route
        || user?.user_metadata?.sales_route || user?.user_metadata?.ruta;
      const assignedOption = assigned && routeOptions.find((r) => routeKey(r) === routeKey(assigned));
      setSalesRoute(found || current || assignedOption || routeOptions[0]);
    };
    loadSaved();
  }, [routeOptions, salesRoute, user]);

  useEffect(() => {
    if (salesRoute && user?.id) {
      try { kvStorage.setItem(`advisor.salesRoute_${user.id}`, salesRoute); } catch (e) { }
    }
  }, [salesRoute, user?.id]);

  // ---------- FILTRAR VENTAS POR RUTA ACTIVA ----------
  const rowsForRoute = useMemo(() => {
    const key = routeKey(salesRoute || '');
    return (vpsRows || []).filter((r) => {
      const raw = routeFromRow(r);
      return raw && routeKey(raw) === key;
    });
  }, [vpsRows, salesRoute, clientsIndexByKey]);

  const rowsPrevMonthForRoute = useMemo(() => {
    const key = routeKey(salesRoute || '');
    return (vpsRowsPrevMonth || []).filter((r) => {
      const raw = routeFromRow(r);
      return raw && routeKey(raw) === key;
    });
  }, [vpsRowsPrevMonth, salesRoute, clientsIndexByKey]);

  const rowsPrevYearForRoute = useMemo(() => {
    const key = routeKey(salesRoute || '');
    return (vpsRowsPrevYear || []).filter((r) => {
      const raw = routeFromRow(r);
      return raw && routeKey(raw) === key;
    });
  }, [vpsRowsPrevYear, salesRoute, clientsIndexByKey]);

  // ---------- CLIENTES (CARGA ONLINE Y OFFLINE OPTIMIZADA CON NOMBRES COMERCIALES) ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!salesRoute) {
        if (!cancelled) setClients([]);
        return;
      }

      let collected = [];
      try {
        // Pasar la ruta explícita a getClients para que descargue online los clientes con su nombre comercial
        collected = await getClients(salesRoute);
      } catch (err) {
        console.error('advisor dashboard: error loading clients', err);
        collected = [];
      }

      if (cancelled) return;

      const normalizedRoute = normalizeRouteValue(salesRoute);
      let filtered = (collected || []).filter((client) =>
        collectClientRouteCandidates(client).some((value) => value === normalizedRoute)
      );
      if (filtered.length === 0 && (collected || []).length > 0) {
        filtered = collected;
      }

      // Recopilar todos los códigos de clientes que aparecen en las ventas de los 3 periodos
      const allSalesCodesSet = new Set();
      [
        ...(rowsForRoute || []),
        ...(rowsPrevMonthForRoute || []),
        ...(rowsPrevYearForRoute || []),
      ].forEach((r) => {
        const c = normalizeClientCode(r.cve_cliente || r.clave_cliente || r.client_code || r.client_id);
        if (c) allSalesCodesSet.add(c);
      });

      const haveSet = new Set(
        filtered.map((c) => normalizeClientCode(c.client_code || c.cve_cliente || c.code))
      );
      const missingCodes = Array.from(allSalesCodesSet).filter((code) => !haveSet.has(code));

      if (missingCodes.length > 0) {
        try {
          const localExtras = (collected || []).filter((c) =>
            missingCodes.includes(normalizeClientCode(c.client_code || c.cve_cliente || c.code))
          );
          filtered.push(...localExtras);

          const stillMissing = missingCodes.filter(
            (code) => !filtered.some((c) => normalizeClientCode(c.client_code || c.cve_cliente || c.code) === code)
          );

          if (stillMissing.length > 0) {
            const apiExtras = await getClientsByCodes(stillMissing);
            if (apiExtras && apiExtras.length > 0) {
              filtered.push(...apiExtras);
            }
          }
        } catch (e) {
          console.warn('Error fetching missing clients by codes', e);
        }
      }

      const deduped = [];
      const seen = new Set();
      for (const client of filtered) {
        const key = clientCodeKey(client?.client_code || client?.cve_cliente || client?.id || JSON.stringify(client));
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(client);
      }
      if (!cancelled) setClients(deduped);
    })();
    return () => { cancelled = true; };
  }, [salesRoute, rowsForRoute, rowsPrevMonthForRoute, rowsPrevYearForRoute]);

  // Índice exhaustivo de clientes por múltiples variantes de clave
  useEffect(() => {
    const map = new Map();
    for (const c of clients || []) {
      const code1 = c?.client_code ? String(c.client_code).trim() : '';
      const code2 = c?.cve_cliente ? String(c.cve_cliente).trim() : '';
      const code3 = c?.code ? String(c.code).trim() : '';
      const idStr = c?.id ? String(c.id).trim() : '';

      [code1, code2, code3, idStr].filter(Boolean).forEach((cd) => {
        map.set(clientCodeKey(cd), c);
        map.set(cd, c);
        map.set(cd.toUpperCase(), c);
        map.set(cd.replace(/^0+/, ''), c);
      });
    }
    setClientsIndexByKey(map);
  }, [clients]);

  const filteredClients = useMemo(() => clients || [], [clients]);

  // ---------- DESCRIPCIONES DE SKUs (OFFLINE-SAFE via Repository) ----------
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { getSkuDescriptions } = await import('@/repositories/metadataRepository');
        const dDesc = await getSkuDescriptions();
        const mapDesc = {};
        for (const row of dDesc || []) {
          const key = (row.cve_marca || '').toString().trim().toUpperCase();
          mapDesc[key] = row.descripcion || row.cve_marca;
        }
        if (active) setSkuDescMap(mapDesc);
      } catch (e) {
        console.warn('Error fetching SKU descriptions', e);
      }
    })();
    return () => { active = false; };
  }, []);

  // ---------- VENTAS DERIVADAS (HL y SKUs) ----------
  useEffect(() => {
    const total = (rowsForRoute || []).reduce((acc, r) => acc + (Number(r.htls_total) || 0), 0);
    setTotalSalesAll(total);

    const zoneRows = (rowsForRoute || []).map((r) => ({
      venta: Number(r.htls_total) || 0,
      period_date: r.period_date,
      client_code: r.cve_cliente,
      zona: r.zona,
      sales_route: salesRoute,
    }));
    setSalesByZonaRaw(zoneRows);

    const acc = new Map();
    for (const r of rowsForRoute || []) {
      const sku = strip(r.cve_marca);
      const v = Number(r.htls_total) || 0;
      if (!sku || v <= 0) continue;
      acc.set(sku, (acc.get(sku) || 0) + v);
    }
    const rows = Array.from(acc.entries())
      .map(([sku, total]) => ({ ruta: salesRoute, sku: sku.toUpperCase(), total }))
      .sort((a, b) => b.total - a.total);
    setSalesBySku(rows);
  }, [rowsForRoute, salesRoute]);

  // ---------- META (RUTA) ----------
  useEffect(() => {
    if (!salesRoute) return;
    let active = true;
    (async () => {
      const { from, to, nextFrom } = comparativePeriods.current;
      try {
        const data = await getGoals({
          salesRoute,
          from,
          to,
          nextFrom,
          isMonthPicker: true,
        });

        let meta = 0;
        if (Array.isArray(data) && data.length) {
          const latest = data.reduce((a, b) => (new Date(a.period_date) > new Date(b.period_date) ? a : b));
          meta = Number(latest.meta) || 0;
        }
        if (active) setRouteMeta(meta);
      } catch (e) {
        console.error('Error loading goals', e);
      }
    })();
    return () => { active = false; };
  }, [salesRoute, comparativePeriods]);

  // ---------- ZONA + APORTACIÓN ----------
  const computedRouteZona = useMemo(() => {
    const byZone = new Map();
    for (const r of rowsForRoute || []) {
      const z = zoneClean(r.zona);
      const v = Number(r.htls_total) || 0;
      if (!z) continue;
      byZone.set(z, (byZone.get(z) || 0) + v);
    }
    if (!byZone.size) return 'OAXACA';
    let bestZ = 'OAXACA', bestV = -1;
    for (const [z, v] of byZone) {
      if (v > bestV) { bestV = v; bestZ = z; }
    }
    return bestZ;
  }, [rowsForRoute]);

  useEffect(() => { setRouteZona(computedRouteZona); }, [computedRouteZona]);

  useEffect(() => {
    const z = zoneClean(routeZona);
    const routeK = routeKey(salesRoute || '');
    if (!z) { setZoneTotalSales(0); setRouteSalesInZone(0); return; }

    let zoneTotal = 0;
    let routeInZone = 0;
    for (const r of vpsRows || []) {
      const zz = zoneClean(r.zona);
      if (zz !== z) continue;
      const v = Number(r.htls_total) || 0;
      zoneTotal += v;

      const rr = routeFromRow(r);
      if (rr && routeKey(rr) === routeK) routeInZone += v;
    }
    setZoneTotalSales(zoneTotal);
    setRouteSalesInZone(routeInZone);
  }, [routeZona, salesRoute, vpsRows, clientsIndexByKey, lookupClient]);

  // ---------- EVALUACIONES ----------
  useEffect(() => {
    if (!salesRoute) return;
    let active = true;
    (async () => {
      const { from, to, nextFrom } = comparativePeriods.current;
      try {
        const all = await getEvaluations();
        const start = from;
        const end = nextFrom || to || '9999-12-31';

        const inDate = all.filter((e) => {
          const d = e.fecha || e.created_at;
          if (d < start) return false;
          if (nextFrom) {
            if (d >= end) return false;
          } else {
            if (d > end) return false;
          }
          return true;
        });

        const clientCodes = new Set((filteredClients || []).map((c) => normalizeClientCode(c.client_code)));
        const filtered = inDate.filter((e) => clientCodes.has(normalizeClientCode(e.client_code)));

        if (active) setEvalsThisMonth(filtered);
      } catch (e) {
        console.error('Error loading evaluations', e);
      }
    })();
    return () => { active = false; };
  }, [salesRoute, comparativePeriods, filteredClients.length]);

  // ---------- VISITAS ----------
  useEffect(() => {
    if (!salesRoute || filteredClients.length === 0) {
      setVisitsTodayCount(0);
      setVisitsThisMonthCount(0);
      setVisitsTotalCount(0);
      return;
    }

    let active = true;
    (async () => {
      const { from, to, nextFrom } = comparativePeriods.current;
      const clientIds = filteredClients.map((c) => c.id);
      const summary = await getVisitsSummary(clientIds, from, nextFrom ? nextFrom : to);

      if (active) {
        setVisitsTodayCount(summary.today);
        setVisitsThisMonthCount(summary.total);
        setVisitsTotalCount(summary.total);
      }
    })();
    return () => { active = false; };
  }, [salesRoute, comparativePeriods, filteredClients]);

  // ---------- DERIVADOS CLAVE ----------
  const clientsTotal = filteredClients.length;
  const clientsWithPurchase = useMemo(() => {
    const set = new Set((salesByZonaRaw || []).filter((r) => Number(r.venta) > 0).map((r) => normalizeClientCode(r.client_code)));
    return set.size;
  }, [salesByZonaRaw]);

  const skuShare = useMemo(() => {
    const rows = (salesBySku || []).map(({ sku, total }) => ({
      sku,
      desc: skuDescMap[norm(sku)] || sku,
      total,
      pct: totalSalesAll > 0 ? Math.round((total / totalSalesAll) * 100) : 0,
    }));
    rows.sort((a, b) => b.total - a.total);
    return rows;
  }, [salesBySku, totalSalesAll, skuDescMap]);

  const visibleSkus = useMemo(() => {
    const q = (skuSearch || '').trim().toLowerCase();
    if (!q) return skuShare;
    return skuShare.filter((r) =>
      r.sku.toLowerCase().includes(q) || (r.desc && r.desc.toLowerCase().includes(q))
    );
  }, [skuShare, skuSearch]);

  const avgDailyVisits = useMemo(() => {
    const { elapsedBusiness } = comparativePeriods.current;
    return elapsedBusiness > 0 ? (visitsTotalCount / elapsedBusiness).toFixed(1) : '0';
  }, [comparativePeriods, visitsTotalCount]);

  const avgEval = useMemo(() => {
    const scores = (evalsThisMonth || []).map((e) => Number(e.puntajeTotal ?? e.puntaje_total ?? 0)).filter((n) => Number.isFinite(n));
    if (!scores.length) return 0;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return Math.round(avg * 10) / 10;
  }, [evalsThisMonth]);

  const aportacionZonaPct = useMemo(() => {
    if (zoneTotalSales <= 0) return 0;
    const val = Math.round((routeSalesInZone / zoneTotalSales) * 100);
    return Number.isFinite(val) ? val : 0;
  }, [routeSalesInZone, zoneTotalSales]);

  const tendencia = useMemo(() => {
    const { elapsedBusiness, totalBusiness } = comparativePeriods.current;
    const hlPorDia = elapsedBusiness > 0 ? totalSalesAll / elapsedBusiness : 0;
    const hlProyectado = elapsedBusiness > 0
      ? Math.round(((totalSalesAll / elapsedBusiness) * totalBusiness) * 100) / 100
      : totalSalesAll;
    const pctMeta = routeMeta > 0 ? Math.round((hlProyectado / routeMeta) * 100) : 0;
    const pctActual = routeMeta > 0 ? Math.round((totalSalesAll / routeMeta) * 100) : 0;
    const hlFaltantes = Math.max(routeMeta - totalSalesAll, 0);
    return { hlPorDia, hlProyectado, pctMeta, pctActual, hlFaltantes, elapsedBusiness, totalBusiness };
  }, [comparativePeriods, totalSalesAll, routeMeta]);

  const efectividadVisitaPct = useMemo(() => {
    const base = visitsThisMonthCount > 0 ? visitsThisMonthCount : clientsTotal;
    if (base === 0) return 0;
    const val = (clientsWithPurchase / base) * 100;
    return val > 100 ? 100 : Math.round(val);
  }, [clientsWithPurchase, visitsThisMonthCount, clientsTotal]);

  const dropSize = useMemo(() => {
    if (clientsWithPurchase === 0) return 0;
    return (totalSalesAll / clientsWithPurchase).toFixed(1);
  }, [totalSalesAll, clientsWithPurchase]);

  const avgClientsWithPurchasePerDay = useMemo(() => {
    const { elapsedBusiness } = comparativePeriods.current;
    if (elapsedBusiness <= 0) return 0;
    return (clientsWithPurchase / elapsedBusiness).toFixed(1);
  }, [clientsWithPurchase, comparativePeriods]);

  // ---------- TOP 10 CLIENTES (MAYOR VOLUMEN HL) ----------
  const topPerformers = useMemo(() => {
    const acc = new Map();
    for (const r of rowsForRoute || []) {
      const code = strip(r.cve_cliente || r.clave_cliente || r.client_code);
      if (!code) continue;
      const v = Number(r.htls_total) || 0;
      acc.set(code, (acc.get(code) || 0) + v);
    }
    const list = Array.from(acc.entries())
      .map(([code, total]) => {
        const c = lookupClient(code);
        const name = getClientDisplayName(c, code);
        const pctOfRoute = totalSalesAll > 0 ? Math.round((total / totalSalesAll) * 100) : 0;
        return { code, name, total, pctOfRoute, clientObj: c };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    return list;
  }, [rowsForRoute, lookupClient, getClientDisplayName, totalSalesAll]);

  // ---------- CÁLCULO AVANZADO: TOP CLIENTES CON CAÍDA ----------
  const clientSalesMapCurrent = useMemo(() => {
    const map = new Map();
    for (const r of rowsForRoute || []) {
      const key = clientCodeKey(r.cve_cliente || r.clave_cliente || r.client_code);
      if (!key) continue;
      const prev = map.get(key) || { totalHL: 0, totalSales: 0, orders: 0 };
      prev.totalHL += Number(r.htls_total) || 0;
      prev.totalSales += Number(r.venta) || 0;
      prev.orders += 1;
      map.set(key, prev);
    }
    return map;
  }, [rowsForRoute]);

  const clientSalesMapPrevMonth = useMemo(() => {
    const map = new Map();
    for (const r of rowsPrevMonthForRoute || []) {
      const key = clientCodeKey(r.cve_cliente || r.clave_cliente || r.client_code);
      if (!key) continue;
      const prev = map.get(key) || { totalHL: 0, totalSales: 0, orders: 0 };
      prev.totalHL += Number(r.htls_total) || 0;
      prev.totalSales += Number(r.venta) || 0;
      prev.orders += 1;
      map.set(key, prev);
    }
    return map;
  }, [rowsPrevMonthForRoute]);

  const clientSalesMapPrevYear = useMemo(() => {
    const map = new Map();
    for (const r of rowsPrevYearForRoute || []) {
      const key = clientCodeKey(r.cve_cliente || r.clave_cliente || r.client_code);
      if (!key) continue;
      const prev = map.get(key) || { totalHL: 0, totalSales: 0, orders: 0 };
      prev.totalHL += Number(r.htls_total) || 0;
      prev.totalSales += Number(r.venta) || 0;
      prev.orders += 1;
      map.set(key, prev);
    }
    return map;
  }, [rowsPrevYearForRoute]);

  // Lista unificada de todos los clientes con análisis de caídas
  const clientDropAnalysis = useMemo(() => {
    const keys = new Set();
    for (const c of filteredClients || []) {
      const k = clientCodeKey(c.client_code || c.cve_cliente || c.code || c.id);
      if (k) keys.add(k);
    }
    for (const k of clientSalesMapCurrent.keys()) keys.add(k);
    for (const k of clientSalesMapPrevMonth.keys()) keys.add(k);
    for (const k of clientSalesMapPrevYear.keys()) keys.add(k);

    const items = [];

    for (const key of keys) {
      const c = lookupClient(key);
      const code = c?.client_code || c?.cve_cliente || c?.code || key;
      const name = getClientDisplayName(c, code);
      const address = c?.address || c?.street || c?.colonia || c?.town || '';
      const phone = c?.phone || c?.whatsapp || c?.cellphone || '';

      const hlCurrent = clientSalesMapCurrent.get(key)?.totalHL || 0;
      const hlPrevMonth = clientSalesMapPrevMonth.get(key)?.totalHL || 0;
      const hlPrevYear = clientSalesMapPrevYear.get(key)?.totalHL || 0;

      // Caída vs Mes Anterior (MoM)
      const diffMoM = hlCurrent - hlPrevMonth;
      const dropHLMoM = diffMoM < -0.001 ? Math.abs(diffMoM) : 0;
      const pctChangeMoM = hlPrevMonth > 0
        ? ((hlCurrent - hlPrevMonth) / hlPrevMonth) * 100
        : (hlCurrent > 0 ? 100 : 0);

      // Caída vs Mismo Mes Año Anterior (YoY)
      const diffYoY = hlCurrent - hlPrevYear;
      const dropHLYoY = diffYoY < -0.001 ? Math.abs(diffYoY) : 0;
      const pctChangeYoY = hlPrevYear > 0
        ? ((hlCurrent - hlPrevYear) / hlPrevYear) * 100
        : (hlCurrent > 0 ? 100 : 0);

      items.push({
        key,
        code,
        name,
        address,
        phone,
        clientObj: c,
        hlCurrent,
        hlPrevMonth,
        hlPrevYear,
        // MoM
        diffMoM,
        dropHLMoM,
        pctChangeMoM,
        isDropMoM: dropHLMoM > 0.001,
        // YoY
        diffYoY,
        dropHLYoY,
        pctChangeYoY,
        isDropYoY: dropHLYoY > 0.001,
      });
    }

    return items;
  }, [
    filteredClients,
    lookupClient,
    getClientDisplayName,
    clientSalesMapCurrent,
    clientSalesMapPrevMonth,
    clientSalesMapPrevYear,
  ]);

  // Lista filtrada y ordenada según la pestaña activa (YoY vs MoM)
  const activeDropData = useMemo(() => {
    const isYoY = dropComparisonMode === 'vs_prev_year';

    // Filtrar solo los que presentan caída en la métrica activa
    let list = clientDropAnalysis.filter((item) => (isYoY ? item.isDropYoY : item.isDropMoM));

    // Mapear campos normalizados para la vista
    list = list.map((item) => {
      const baseHL = isYoY ? item.hlPrevYear : item.hlPrevMonth;
      const currentHL = item.hlCurrent;
      const lostHL = isYoY ? item.dropHLYoY : item.dropHLMoM;
      const pctDrop = isYoY ? item.pctChangeYoY : item.pctChangeMoM;

      let severity = 'moderate';
      if (currentHL === 0 && baseHL > 0) {
        severity = 'lost'; // Sin compra este mes
      } else if (pctDrop <= -50) {
        severity = 'severe'; // Caída mayor a 50%
      }

      return {
        ...item,
        baseHL,
        currentHL,
        lostHL,
        pctDrop,
        severity,
      };
    });

    // Filtro por severidad
    if (dropFilterSeverity === 'lost') {
      list = list.filter((i) => i.severity === 'lost');
    } else if (dropFilterSeverity === 'severe') {
      list = list.filter((i) => i.severity === 'severe');
    } else if (dropFilterSeverity === 'moderate') {
      list = list.filter((i) => i.severity === 'moderate');
    }

    // Filtro por búsqueda de texto
    const q = (dropSearch || '').trim().toLowerCase();
    if (q) {
      list = list.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q) ||
        i.address.toLowerCase().includes(q)
      );
    }

    // Ordenamiento
    if (dropSort === 'hl_desc') {
      list.sort((a, b) => b.lostHL - a.lostHL);
    } else if (dropSort === 'pct_desc') {
      list.sort((a, b) => a.pctDrop - b.pctDrop); // Más negativo primero
    } else if (dropSort === 'name_asc') {
      list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }

    return list;
  }, [clientDropAnalysis, dropComparisonMode, dropFilterSeverity, dropSearch, dropSort]);

  // Resumen métrico de la caída activa
  const dropSummary = useMemo(() => {
    const isYoY = dropComparisonMode === 'vs_prev_year';
    const allDrops = clientDropAnalysis.filter((i) => (isYoY ? i.isDropYoY : i.isDropMoM));

    const totalLostHL = allDrops.reduce((sum, i) => sum + (isYoY ? i.dropHLYoY : i.dropHLMoM), 0);
    const countTotal = allDrops.length;
    const countLostZero = allDrops.filter((i) => i.hlCurrent === 0 && (isYoY ? i.hlPrevYear : i.hlPrevMonth) > 0).length;
    const countSevere = allDrops.filter((i) => i.hlCurrent > 0 && (isYoY ? i.pctChangeYoY : i.pctChangeMoM) <= -50).length;
    const countModerate = allDrops.filter((i) => i.hlCurrent > 0 && (isYoY ? i.pctChangeYoY : i.pctChangeMoM) > -50).length;

    const maxDrop = allDrops.slice().sort((a, b) => (isYoY ? b.dropHLYoY - a.dropHLYoY : b.dropHLMoM - a.dropHLMoM))[0];

    return {
      totalLostHL: Math.round(totalLostHL * 100) / 100,
      countTotal,
      countLostZero,
      countSevere,
      countModerate,
      maxDrop,
      basePeriodLabel: isYoY ? comparativePeriods.prevYear.label : comparativePeriods.prevMonth.label,
    };
  }, [clientDropAnalysis, dropComparisonMode, comparativePeriods]);

  // Manejar acciones rápidas de clientes
  const handleOpenClientDetails = (clientObj, clientCode) => {
    navigate(`/asesor-dinamico/clientes?search=${encodeURIComponent(clientCode)}`);
  };

  const handleOpenSimulator = (clientObj, clientCode) => {
    const cId = clientObj?.id || clientCode;
    navigate(`/asesor-dinamico/clientes/${cId}/simulator`);
  };

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#151624] via-[#1a1b2e] to-[#12131f] text-slate-100 pb-12">
      <Helmet>
        <title>Dashboard Asesor Dinámico | Cervezas Finas</title>
      </Helmet>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 space-y-6">

        {/* ========== 1. HEADER MODERNO ========== */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 right-1/4 w-96 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-80 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/50">
                  Panel de Asesoría Dinámica
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                Control de Ruta y Ventas
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
                <span>Asesor: <strong className="text-slate-200">{userName}</strong></span>
                <span className="text-slate-600">·</span>
                <span>Ruta: <strong className="text-emerald-300 font-semibold">{salesRoute || 'General'}</strong></span>
                <span className="text-slate-600">·</span>
                <span>{new Date().toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <SyncButton
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium border-0 shadow-lg shadow-emerald-950/50 transition-all text-xs"
                size="sm"
                showLabel={true}
              />

              {(routeOptions || []).length > 0 && (
                <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 rounded-xl px-2.5 py-1 text-xs">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-slate-400 hidden sm:inline">Ruta:</span>
                  <Select value={salesRoute} onValueChange={setSalesRoute}>
                    <SelectTrigger className="h-7 w-32 sm:w-36 bg-transparent border-0 text-white font-semibold text-xs focus:ring-0 px-1">
                      <SelectValue placeholder="Ruta" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 text-white">
                      {routeOptions.map((r) => (
                        <SelectItem key={r} value={r} className="text-xs hover:bg-slate-800">
                          Ruta {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 rounded-xl px-2.5 py-1 text-xs">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-slate-400 hidden sm:inline">Mes:</span>
                <input
                  type="month"
                  value={/^\d{4}-\d{2}$/.test(period) ? period : (() => {
                    const d = new Date();
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                  })()}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="bg-transparent text-white font-medium text-xs rounded border-0 outline-none cursor-pointer"
                />
              </div>

              <button
                onClick={() => {
                  const d = new Date();
                  setPeriod(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                }}
                className={`text-[11px] px-2.5 py-1.5 rounded-xl font-medium transition-all ${
                  period === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
                    ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50'
                    : 'bg-slate-800/60 text-slate-400 hover:text-white border border-slate-700/40'
                }`}
              >
                Mes Actual
              </button>
            </div>
          </div>
        </motion.div>

        {/* ========== 2. HERO: VENTA VS META & PARTICIPACIÓN SKU ========== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* Venta vs Meta */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="lg:col-span-7 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Venta vs Meta de Ruta</h2>
                  <p className="text-xs text-slate-400">Periodo: <span className="text-emerald-400 font-semibold">{periodLabel}</span></p>
                </div>
              </div>

              <Badge className={`${
                tendencia.pctActual >= 100
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
              } text-xs font-semibold px-2.5 py-0.5 border`}>
                {tendencia.pctActual}% Realizado
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center py-4">
              <div className="sm:col-span-5 flex flex-col items-center justify-center">
                <div className="relative flex items-center justify-center p-2">
                  <DonutProgress
                    value={tendencia.pctActual}
                    text={`${tendencia.pctActual}%`}
                    color={tendencia.pctActual >= 100 ? '#10b981' : tendencia.pctActual >= 75 ? '#3b82f6' : '#f59e0b'}
                    size={160}
                    textSize="24px"
                  />
                </div>
                <div className="text-center mt-1 text-[11px] text-slate-400">
                  Meta Ruta: <span className="font-semibold text-white">{routeMeta.toLocaleString('es-MX')} HL</span>
                </div>
              </div>

              <div className="sm:col-span-7 space-y-2.5 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-800/70 p-2.5 rounded-xl border border-slate-700/50">
                    <span className="text-slate-400 text-[11px] block">Venta Alcanzada</span>
                    <span className="text-lg font-black text-emerald-400">
                      {(totalSalesAll || 0).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-1">HL</span>
                  </div>

                  <div className="bg-slate-800/70 p-2.5 rounded-xl border border-slate-700/50">
                    <span className="text-slate-400 text-[11px] block">Tendencia de Cierre</span>
                    <span className="text-lg font-black text-blue-300">
                      {tendencia.hlProyectado.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-1">HL ({tendencia.pctMeta}%)</span>
                  </div>
                </div>

                <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/40 space-y-1.5">
                  <div className="flex justify-between items-center text-slate-300">
                    <span>Ritmo de venta diario:</span>
                    <strong className="text-white font-mono">{tendencia.hlPorDia.toFixed(2)} HL/día</strong>
                  </div>
                  <div className="flex justify-between items-center text-slate-300">
                    <span>Volumen faltante para meta:</span>
                    <strong className={tendencia.hlFaltantes > 0 ? 'text-amber-400 font-mono' : 'text-emerald-400 font-mono'}>
                      {tendencia.hlFaltantes > 0 ? `${tendencia.hlFaltantes.toFixed(1)} HL` : '¡Meta Superada!'}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1 border-t border-slate-700/50">
                    <span>Días hábiles transcurridos:</span>
                    <span className="font-semibold text-slate-200">
                      {tendencia.elapsedBusiness} de {tendencia.totalBusiness} días (L–S)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80">
              <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                <span>Avance vs Meta ({periodLabel})</span>
                <span className="font-semibold text-slate-200">{Math.min(tendencia.pctActual, 100)}%</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    tendencia.pctActual >= 100
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : 'bg-gradient-to-r from-blue-500 to-emerald-400'
                  }`}
                  style={{ width: `${Math.min(tendencia.pctActual, 100)}%` }}
                />
              </div>
            </div>
          </motion.div>

          {/* Participación por SKU */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-5 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 shadow-xl flex flex-col h-[420px]"
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                  <PieChart className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider">Participación por SKU</h2>
                  <p className="text-[11px] text-slate-400">Volumen sobre el total de la ruta</p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-blue-400 bg-blue-950/60 border border-blue-800/40 px-2 py-0.5 rounded-md">
                {skuShare.length} SKUs
              </span>
            </div>

            <div className="pt-2 pb-2 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filtrar SKU o marca..."
                  value={skuSearch}
                  onChange={(e) => setSkuSearch(e.target.value)}
                  className="w-full bg-slate-800/80 border border-slate-700/60 text-white pl-8 pr-3 py-1.5 rounded-xl text-xs placeholder-slate-500 focus:outline-none focus:border-blue-500/60 transition-colors"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1.5 custom-scrollbar min-h-0">
              {visibleSkus.map((row) => (
                <div
                  key={row.sku}
                  className="group relative flex items-center gap-2.5 p-1.5 rounded-xl bg-slate-800/40 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700/80 transition-all overflow-hidden"
                >
                  <div className="w-8 h-8 bg-white rounded-lg p-0.5 shrink-0 flex items-center justify-center shadow-sm">
                    <img
                      src={getSkuImage(row.sku)}
                      alt={row.sku}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = getSkuImageFallback(row.sku);
                      }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs font-semibold text-slate-200 truncate group-hover:text-white" title={row.desc}>
                        {row.desc}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-mono text-slate-300">{row.total.toFixed(1)} HL</span>
                        <span className="text-[10px] font-bold text-blue-400 bg-blue-950/80 px-1.5 py-0.5 rounded border border-blue-800/30">
                          {row.pct}%
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-1 bg-slate-700/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 group-hover:bg-blue-400 rounded-full transition-all"
                        style={{ width: `${Math.min(100, row.pct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}

              {visibleSkus.length === 0 && (
                <div className="text-slate-400 text-xs text-center py-8">
                  No se encontraron SKUs con ese criterio.
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* ========== 3. INDICADORES CLAVE (KPIS) ========== */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">Indicadores Clave de Operación</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Card className="bg-slate-900/60 backdrop-blur-md border-slate-800/80 p-3 shadow-lg flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Clientes con Compra</span>
                <div className="text-xl font-black text-white mt-1">
                  {clientsWithPurchase} <span className="text-xs text-slate-400 font-normal">/ {clientsTotal}</span>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                <span>Cobertura de padrón</span>
                <span className="font-bold text-blue-400">
                  {clientsTotal > 0 ? Math.round((clientsWithPurchase / clientsTotal) * 100) : 0}%
                </span>
              </div>
            </Card>

            <Card className="bg-slate-900/60 backdrop-blur-md border-slate-800/80 p-3 shadow-lg flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Aportación a Zona</span>
                <div className="text-xl font-black text-white mt-1">
                  {aportacionZonaPct}%
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                <span className="truncate max-w-[80px]" title={routeZona}>{routeZona}</span>
                <span className="font-mono text-emerald-300">{routeSalesInZone.toFixed(0)} HL</span>
              </div>
            </Card>

            <Card className="bg-slate-900/60 backdrop-blur-md border-slate-800/80 p-3 shadow-lg flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">Visitas de Hoy</span>
                <div className="text-xl font-black text-white mt-1">{visitsTodayCount}</div>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-400">
                Registradas en jornada
              </div>
            </Card>

            <Card className="bg-slate-900/60 backdrop-blur-md border-slate-800/80 p-3 shadow-lg flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Visitas del Mes</span>
                <div className="text-xl font-black text-white mt-1">{visitsThisMonthCount}</div>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-400 truncate">
                {periodLabel}
              </div>
            </Card>

            <Card className="bg-slate-900/60 backdrop-blur-md border-slate-800/80 p-3 shadow-lg flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Prom. Visitas / Día</span>
                <div className="text-xl font-black text-white mt-1">{avgDailyVisits}</div>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-400">
                Días hábiles laborados
              </div>
            </Card>

            <Card className="bg-slate-900/60 backdrop-blur-md border-slate-800/80 p-3 shadow-lg flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Calificación Promedio</span>
                <div className="text-xl font-black text-white mt-1">{avgEval} <span className="text-xs text-slate-400 font-normal">pts</span></div>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-400">
                Auditorías de servicio
              </div>
            </Card>
          </div>
        </div>

        {/* ========== 3.5. EFICIENCIA DE RUTA ========== */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-gradient-to-r from-blue-950/40 to-slate-900/80 border border-blue-900/40 rounded-2xl p-4 relative overflow-hidden shadow-lg">
            <div className="absolute right-2 top-2 p-2 opacity-10 text-blue-400">
              <Target className="w-16 h-16" />
            </div>
            <div className="relative z-10">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Efectividad de Visita</div>
              <div className="text-2xl font-black text-white mt-1">{efectividadVisitaPct}%</div>
              <p className="text-[11px] text-slate-400 mt-0.5">Clientes con compra vs visitas realizadas</p>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(efectividadVisitaPct, 100)}%` }} />
            </div>
          </div>

          <div className="bg-gradient-to-r from-emerald-950/40 to-slate-900/80 border border-emerald-900/40 rounded-2xl p-4 relative overflow-hidden shadow-lg">
            <div className="absolute right-2 top-2 p-2 opacity-10 text-emerald-400">
              <ShoppingCart className="w-16 h-16" />
            </div>
            <div className="relative z-10">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Drop Size Promedio</div>
              <div className="text-2xl font-black text-white mt-1">{dropSize} <span className="text-sm font-semibold text-emerald-300">HL</span></div>
              <p className="text-[11px] text-slate-400 mt-0.5">Volumen promedio por cliente con compra</p>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: '100%' }} />
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-950/40 to-slate-900/80 border border-purple-900/40 rounded-2xl p-4 relative overflow-hidden shadow-lg">
            <div className="absolute right-2 top-2 p-2 opacity-10 text-purple-400">
              <Activity className="w-16 h-16" />
            </div>
            <div className="relative z-10">
              <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400">Clientes con Compra / Día</div>
              <div className="text-2xl font-black text-white mt-1">{avgClientsWithPurchasePerDay}</div>
              <p className="text-[11px] text-slate-400 mt-0.5">Promedio diario de clientes efectivos</p>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full" style={{ width: '100%' }} />
            </div>
          </div>
        </div>

        {/* ========== 4. SECCIÓN PRINCIPAL: TOP CLIENTES CON CAÍDA + TOP PERFORMERS ========== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* === PANEL DE CLIENTES CON CAÍDA (8 cols on lg) === */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="lg:col-span-8 bg-slate-900/70 backdrop-blur-md border border-rose-900/40 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4"
          >
            {/* Header del Módulo de Caídas */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 shadow-inner">
                  <TrendingDown className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    Top Clientes con Caída en Ventas
                    <span className="flex h-2 w-2 rounded-full bg-rose-500" />
                  </h2>
                  <p className="text-xs text-slate-400">
                    Cuentas con pérdida de volumen HL para recuperación y visita comercial
                  </p>
                </div>
              </div>

              {/* Selector de Comparativa: Año Anterior vs Mes Anterior */}
              <div className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700/80 shadow-inner self-start sm:self-auto">
                <button
                  onClick={() => setDropComparisonMode('vs_prev_year')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    dropComparisonMode === 'vs_prev_year'
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Calendar className="w-3 h-3" />
                  <span>Vs Año Anterior ({comparativePeriods.prevYear.label})</span>
                </button>

                <button
                  onClick={() => setDropComparisonMode('vs_prev_month')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    dropComparisonMode === 'vs_prev_month'
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Vs Mes Anterior ({comparativePeriods.prevMonth.label})</span>
                </button>
              </div>
            </div>

            {/* Resumen Métrico de Alerta */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-rose-950/30 border border-rose-900/40 rounded-xl p-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 block">Volumen Caído</span>
                <span className="text-lg font-black text-rose-300 font-mono">
                  -{dropSummary.totalLostHL.toLocaleString('es-MX', { minimumFractionDigits: 1 })} HL
                </span>
                <span className="text-[10px] text-slate-400 block">vs {dropSummary.basePeriodLabel}</span>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 block">Clientes con Caída</span>
                <span className="text-lg font-black text-white font-mono">
                  {dropSummary.countTotal} <span className="text-xs font-normal text-slate-400">cuentas</span>
                </span>
                <span className="text-[10px] text-slate-400 block">en ruta {salesRoute}</span>
              </div>

              <div className="bg-red-950/40 border border-red-800/50 rounded-xl p-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-300 block">Sin Compra (100% Caída)</span>
                <span className="text-lg font-black text-red-400 font-mono">
                  {dropSummary.countLostZero} <span className="text-xs font-normal text-red-300/80">clientes</span>
                </span>
                <span className="text-[10px] text-slate-400 block">Venta actual: 0 HL</span>
              </div>

              <div className="bg-amber-950/30 border border-amber-900/40 rounded-xl p-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block">Caída Crítica (&gt;50%)</span>
                <span className="text-lg font-black text-amber-400 font-mono">
                  {dropSummary.countSevere} <span className="text-xs font-normal text-amber-300/80">clientes</span>
                </span>
                <span className="text-[10px] text-slate-400 block">alerta comercial</span>
              </div>
            </div>

            {/* Controles de Filtrado & Búsqueda */}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por nombre comercial, negocio o clave..."
                  value={dropSearch}
                  onChange={(e) => setDropSearch(e.target.value)}
                  className="w-full bg-slate-800/90 border border-slate-700/80 text-white pl-9 pr-3 py-1.5 rounded-xl text-xs placeholder-slate-500 focus:outline-none focus:border-rose-500/60 transition-colors"
                />
              </div>

              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                <button
                  onClick={() => setDropFilterSeverity('all')}
                  className={`text-[11px] px-2.5 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap ${
                    dropFilterSeverity === 'all'
                      ? 'bg-slate-700 text-white font-bold border border-slate-600'
                      : 'bg-slate-800/60 text-slate-400 hover:text-white'
                  }`}
                >
                  Todos ({dropSummary.countTotal})
                </button>
                <button
                  onClick={() => setDropFilterSeverity('lost')}
                  className={`text-[11px] px-2.5 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap ${
                    dropFilterSeverity === 'lost'
                      ? 'bg-red-600 text-white font-bold border border-red-500'
                      : 'bg-slate-800/60 text-red-400 hover:text-red-300'
                  }`}
                >
                  Sin Compra ({dropSummary.countLostZero})
                </button>
                <button
                  onClick={() => setDropFilterSeverity('severe')}
                  className={`text-[11px] px-2.5 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap ${
                    dropFilterSeverity === 'severe'
                      ? 'bg-amber-600 text-white font-bold border border-amber-500'
                      : 'bg-slate-800/60 text-amber-400 hover:text-amber-300'
                  }`}
                >
                  &gt;50% Caída ({dropSummary.countSevere})
                </button>
              </div>

              <div className="flex items-center gap-1 bg-slate-800/90 border border-slate-700/80 rounded-xl px-2 py-1">
                <SlidersHorizontal className="w-3 h-3 text-slate-400" />
                <Select value={dropSort} onValueChange={setDropSort}>
                  <SelectTrigger className="h-6 w-32 bg-transparent border-0 text-white text-xs focus:ring-0 p-0">
                    <SelectValue placeholder="Ordenar" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="hl_desc" className="text-xs hover:bg-slate-800">Mayor Caída HL</SelectItem>
                    <SelectItem value="pct_desc" className="text-xs hover:bg-slate-800">Mayor % Caída</SelectItem>
                    <SelectItem value="name_asc" className="text-xs hover:bg-slate-800">Nombre (A-Z)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* LISTA DE CLIENTES EN CAÍDA */}
            <div className="space-y-2.5 max-h-[550px] overflow-y-auto pr-1 custom-scrollbar">
              {activeDropData.slice(0, visibleDropLimit).map((client, idx) => (
                <div
                  key={client.key}
                  className="bg-slate-800/60 hover:bg-slate-800/90 border border-slate-800 hover:border-rose-900/50 rounded-xl p-3 sm:p-3.5 transition-all shadow-md group"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    {/* Info Cliente */}
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                        idx === 0
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : idx < 3
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-slate-700/50 text-slate-300'
                      }`}>
                        #{idx + 1}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3
                            onClick={() => handleOpenClientDetails(client.clientObj, client.code)}
                            className="text-sm font-bold text-white hover:text-blue-300 cursor-pointer transition-colors truncate flex items-center gap-1.5"
                            title={client.name}
                          >
                            <Store className="w-3.5 h-3.5 text-slate-400 shrink-0 inline" />
                            <span>{client.name}</span>
                          </h3>

                          <Badge className="bg-slate-700/80 text-slate-300 border-slate-600 text-[10px] px-1.5 py-0 font-mono">
                            {client.code}
                          </Badge>

                          {client.severity === 'lost' && (
                            <Badge className="bg-red-950/80 text-red-300 border-red-800 text-[10px] px-1.5 py-0">
                              Sin Compra (0 HL)
                            </Badge>
                          )}
                          {client.severity === 'severe' && (
                            <Badge className="bg-amber-950/80 text-amber-300 border-amber-800 text-[10px] px-1.5 py-0">
                              Caída Severa
                            </Badge>
                          )}
                        </div>

                        {client.address && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5 truncate max-w-md">
                            <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                            <span className="truncate">{client.address}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Métricas de Pérdida & Acciones */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-700/40">
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block">
                              Base ({dropSummary.basePeriodLabel})
                            </span>
                            <span className="font-mono text-xs font-semibold text-slate-300">
                              {client.baseHL.toFixed(1)} HL
                            </span>
                          </div>

                          <span className="text-slate-600 text-xs">→</span>

                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block">
                              Actual ({periodLabel})
                            </span>
                            <span className="font-mono text-xs font-semibold text-white">
                              {client.currentHL.toFixed(1)} HL
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-rose-950/60 border border-rose-800/60 rounded-xl px-2.5 py-1 text-right min-w-[90px]">
                        <span className="text-xs font-black text-rose-300 block font-mono">
                          -{client.lostHL.toFixed(1)} HL
                        </span>
                        <span className="text-[10px] font-bold text-rose-400 flex items-center justify-end gap-0.5">
                          <ArrowDownRight className="w-3 h-3" />
                          {client.pctDrop.toFixed(0)}%
                        </span>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSalesClientDialog(client.clientObj || { client_code: client.code, name: client.name, business_name: client.name })}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-700/80 rounded-lg"
                        title="Ver detalle de ventas"
                      >
                        <ShoppingCart className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Barra Visual de Retención */}
                  <div className="mt-2.5 pt-2 border-t border-slate-700/40 flex items-center gap-3 text-[10px] text-slate-400">
                    <span>Volumen Retenido:</span>
                    <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rose-500 rounded-full transition-all"
                        style={{
                          width: `${client.baseHL > 0 ? Math.min(100, (client.currentHL / client.baseHL) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <span className="font-mono font-semibold text-slate-300">
                      {client.baseHL > 0 ? Math.round((client.currentHL / client.baseHL) * 100) : 0}%
                    </span>

                    <button
                      onClick={() => handleOpenSimulator(client.clientObj, client.code)}
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium ml-2 hover:underline"
                    >
                      <Sparkles className="w-3 h-3" />
                      Simular
                    </button>
                  </div>
                </div>
              ))}

              {activeDropData.length === 0 && (
                <div className="bg-slate-800/30 border border-slate-800 rounded-2xl p-8 text-center space-y-2">
                  <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                    <Award className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-white">¡Excelente desempeño comercial!</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    No se encontraron clientes con caída en ventas para los filtros seleccionados vs{' '}
                    {dropSummary.basePeriodLabel}.
                  </p>
                </div>
              )}

              {activeDropData.length > visibleDropLimit && (
                <div className="text-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleDropLimit((prev) => prev + 15)}
                    className="bg-slate-800 border-slate-700 text-slate-300 hover:text-white text-xs"
                  >
                    Ver más ({activeDropData.length - visibleDropLimit} restantes)
                  </Button>
                </div>
              )}
            </div>
          </motion.div>

          {/* === PANEL DE TOP PERFORMERS (4 cols on lg) === */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-4 bg-slate-900/70 backdrop-blur-md border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-3.5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Top 10 Clientes</h2>
                  <p className="text-xs text-slate-400">Mayor volumen en el mes ({periodLabel})</p>
                </div>
              </div>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
              {topPerformers.map((c, idx) => (
                <div
                  key={c.code}
                  className="bg-slate-800/50 hover:bg-slate-800/80 border border-slate-800/80 hover:border-slate-700 rounded-xl p-3 transition-all group"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 ${
                        idx === 0
                          ? 'bg-amber-400 text-slate-950 font-black'
                          : idx === 1
                          ? 'bg-slate-300 text-slate-950 font-bold'
                          : idx === 2
                          ? 'bg-amber-600 text-white font-bold'
                          : 'bg-slate-700 text-slate-300'
                      }`}>
                        {idx + 1}
                      </span>
                      <span
                        onClick={() => handleOpenClientDetails(c.clientObj, c.code)}
                        className="text-xs font-bold text-slate-200 group-hover:text-white truncate cursor-pointer hover:underline"
                        title={c.name}
                      >
                        {c.name}
                      </span>
                    </div>

                    <span className="font-mono text-xs font-bold text-emerald-400 shrink-0">
                      {c.total.toFixed(1)} HL
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span>Código: <strong className="text-slate-300 font-mono">{c.code}</strong></span>
                    <span>{c.pctOfRoute}% de la ruta</span>
                  </div>

                  <div className="w-full h-1 bg-slate-700/40 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full group-hover:bg-emerald-400 transition-all"
                      style={{ width: `${Math.min(100, c.pctOfRoute * 3)}%` }}
                    />
                  </div>
                </div>
              ))}

              {topPerformers.length === 0 && (
                <div className="text-slate-400 text-xs text-center py-8">
                  Sin ventas registradas para este periodo en la ruta.
                </div>
              )}
            </div>
          </motion.div>

        </div>

        {/* ========== FOOTER ========== */}
        <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 pt-4 border-t border-slate-800/80 gap-2">
          <div>Heineken México · Sistema de Asesoría Dinámica</div>
          <div className="flex items-center gap-2">
            <span>Ruta: <strong className="text-slate-400">{salesRoute || 'General'}</strong></span>
            <span>·</span>
            <span>Zona: <strong className="text-slate-400">{routeZona}</strong></span>
          </div>
        </div>

      </div>

      {/* ========== MODAL DE VENTAS DE CLIENTE ========== */}
      {salesClientDialog && (
        <SalesDialog
          client={salesClientDialog}
          onClose={() => setSalesClientDialog(null)}
        />
      )}
    </div>
  );
}
