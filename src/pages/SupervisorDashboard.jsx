// src/pages/SupervisorDashboard.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { getTodayMexico } from '@/lib/dateUtils';
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DonutProgress from "@/components/DonutProgress";
import InteractiveMap from "@/components/common/InteractiveMap";
import { supabase } from "@/supabaseClient";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { getSalesBySku } from '@/repositories/salesRepository';
import { getSkuDescriptions, getSkuImages, getChannels, getAllowedRoutes, getAllowedZonas, getSkuEquivalencias } from '@/repositories/metadataRepository';
import { getProductImageUrl, resolvePublicAssetUrl } from '@/lib/imageCatalog';
import SkuEquivalenciasDialog from '@/components/SkuEquivalenciasDialog';
import ComparativeSalesChart from '@/components/ComparativeSalesChart';

// Lazy load SalesDialog to optimize initial load and isolate errors
const SalesDialog = React.lazy(() => import("@/components/SalesDialog"));
import { getClients, getClientsPaged, loadClientsFromLocal, syncClientsForRoutes } from '@/repositories/clientsRepository';
import { getAllEvaluations } from '@/repositories/evaluationsRepository';
import { getWorkPlan } from '@/repositories/workPlanRepository';
import { getActiveSupervision, getSupervisionData } from '@/repositories/onboardSupervisionRepository';
import { Store, TrendingUp, Users, User, Car, Calendar, Map as MapIcon, BarChart3, ArrowUpRight, ArrowDownRight, Search, Filter, Download, X, ChevronRight, ChevronLeft, AlertCircle, Target, ChevronDown, PieChart, Trophy, Star, TrendingDown, ClipboardCheck, CheckCircle2, Play, GitMerge } from 'lucide-react';

// Persistent session cache for Zero-Reload experience
let cachedAllowedZonas = null;
let cachedAllowedRoutes = null;
let cachedClients = null;
let cachedVpsRows = null;
let cachedSkuDescMap = null;
let cachedChannelMap = null;
let cachedLastParams = { dateFilter: null, selectedZona: null, selectedRoute: null };
let cachedAllZonesTotalHL = null;
let cachedMetaTotalClientes = 0;

const SectionTitle = ({ children, className = "" }) => (
  <h2 className={`text-xl font-bold text-white mb-4 flex items-center gap-2 ${className}`}>
    <div className="w-1 h-6 bg-emerald-500 rounded-full" />
    {children}
  </h2>
);

const PremiumCard = ({ children, className = "", ...props }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={`rounded-xl border border-white/10 shadow-xl backdrop-blur-sm ${className}`}
    {...props}
  >
    {children}
  </motion.div>
);
// ... (imports remain the same)

// Helper functions
const strip = (s) => (s || "").toString().trim();
const norm = (s) => strip(s).toUpperCase();
const getChannelImage = (canal) => {
  const c = (canal || "").toString().trim().toUpperCase();
  if (c.includes("BRONCE 7%")) return resolvePublicAssetUrl("/bronce.png");
  if (c.includes("PLATA8%")) return resolvePublicAssetUrl("/plata.png");
  if (c.includes("ORO 10%")) return resolvePublicAssetUrl("/oro.png");
  if (c.includes("PLATINO 12 %")) return resolvePublicAssetUrl("/platino.png");
  if (c.includes("TITANIO14%")) return resolvePublicAssetUrl("/titanio.png");
  if (c.includes("TITANIO 17%")) return resolvePublicAssetUrl("/titanio2.png");
  return resolvePublicAssetUrl(`/${encodeURIComponent(c)}.png`);
};
const clientCodeKey = (s) => norm(s).replace(/[^A-Z0-9]/g, "");
const normalizeClientCoords = (c) => {
  if (!c) return null;
  const lat = Number(c.latitud || c.lat);
  const lng = Number(c.longitud || c.lng || c.lon);
  if (!lat || !lng) return null;
  return { ...c, coords: { lat, lng } };
};
const routeKey = (r) => norm(r);
const businessDaysMonSat = (fromISO, toISO) => {
  const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
  const from = parse(fromISO), to = parse(toISO);
  if (to < from) return 0;
  let c = 0, cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (cur <= to) { if (cur.getDay() !== 0) c++; cur.setDate(cur.getDate() + 1); }
  return c;
};
const isZeroLike = (s) => {
  if (!s) return true;
  const str = String(s).trim();
  return str === "0" || str === "00" || str === "000";
};
const endOfMonthISO = (year, month) => {
  const d = new Date(year, month, 0);
  return d.toISOString().slice(0, 10);
};
const isYYYYMM = (x) => /^\d{4}-\d{2}$/.test(String(x));
const startFromYYYYMM = (ym) => (isYYYYMM(ym) ? `${ym}-01` : null);
const nextFromYYYYMM = (ym) => {
  if (!isYYYYMM(ym)) return null;
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
const toNum = (v) => (typeof v === "number" ? (Number.isFinite(v) ? v : null) :
  typeof v === "string" ? (Number.isFinite(+v) ? +v : null) : null);
const getClientBaseRoute = (c) => {
  const r = strip(c?.sales_route || c?.ruta || c?.internal_route || c?.route);
  return r && !isZeroLike(r) ? r : null;
};
const getClientZona = (c) => strip(c?.zona || c?.region || c?.zona_comercial);

// ... (inside component)

export default function SupervisorDashboard() {
  const { user } = useSupabaseAuth();
  const navigate = useNavigate();
  const [isSupervisor, setIsSupervisor] = useState(false);

  useEffect(() => {
    if (user) {
      const metaType = (user.user_metadata?.type || user.user_metadata?.role || '').toLowerCase();
      const appType = (user.app_metadata?.roles?.[0] || '').toLowerCase();
      const userRole = (user.role || '').toLowerCase();

      const type = metaType || appType || userRole;

      console.log('[SupervisorDashboard] Role Check:', { metaType, appType, userRole, finalType: type });

      setIsSupervisor(type.includes('supervisor') || type.includes('coortrade'));
    }
  }, [user]);

  const isAnalista = useMemo(() => {
    if (!user) return false;
    const type = (user.user_metadata?.type || user.user_metadata?.role || '').toLowerCase();
    const appType = (user.app_metadata?.roles?.[0] || '').toLowerCase();
    const role = type || appType || (user.role || '').toLowerCase();
    return ['admin', 'administrador', 'analista', 'analyst', 'gerente', 'coordinador', 'coortrade', 'jefe', 'director'].includes(role);
  }, [user]);


  const [dateFilter, setDateFilter] = useState({
    year: String(new Date().getFullYear()),
    month: String(new Date().getMonth() + 1),
    day: "__ALL__"
  });

  const userName = user?.profile?.name || user?.user_metadata?.nombre || user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || "Supervisor";


  // Periodo calculado
  const periodRange = useMemo(() => {
    const now = new Date();
    // Fix: Use Mexico City time for 'today' to avoid UTC shifts
    const today = getTodayMexico(); // Use centralized utility

    const { year, month, day } = dateFilter;
    const isYear = month === "__ALL__";
    const isMonth = !isYear && day === "__ALL__";
    const isDay = !isYear && !isMonth;

    let from, to, nextFrom;

    if (isYear) {
      from = `${year}-01-01`;
      to = `${year}-12-31`;
      nextFrom = `${Number(year) + 1}-01-01`;
    } else if (isMonth) {
      from = `${year}-${month.padStart(2, "0")}-01`;
      to = endOfMonthISO(Number(year), Number(month));
      nextFrom = nextFromYYYYMM(`${year}-${month.padStart(2, "0")}`);
    } else {
      // Specific Day
      const dStr = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      from = dStr;
      to = dStr;
      nextFrom = new Date(new Date(dStr).getTime() + 86400000).toISOString().slice(0, 10);
    }

    // Business days calculation
    const totalBusiness = businessDaysMonSat(from, to); // In range
    const elapsedBusiness = businessDaysMonSat(from, to < today ? to : today); // Up to today

    return { from, to, nextFrom, isPicker: true, totalBusiness, elapsedBusiness, isYear, isMonth, isDay };
  }, [dateFilter]);

  // Otros estados necesarios para evitar errores de referencia
  const [vpsRows, setVpsRows] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [zonesProgressTop, setZonesProgressTop] = useState([]);
  const [routesProgressTop, setRoutesProgressTop] = useState([]);
  const [clientsModalOpen, setClientsModalOpen] = useState(false);
  const [clientsModalView, setClientsModalView] = useState("with"); // "with" | "without"
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [channelSearch, setChannelSearch] = useState("");
  const [mainChannelSearch, setMainChannelSearch] = useState("");
  const [salesClient, setSalesClient] = useState(null);
  const [isLoadingSales, setIsLoadingSales] = useState(false);
  const [comparativeData, setComparativeData] = useState({ data: [], xAxisKey: 'month' });
  const [zoneMeta, setZoneMeta] = useState(0);
  const [allZonesTotalHL, setAllZonesTotalHL] = useState(0);
  const [avgEval, setAvgEval] = useState(0);

  // Permisos / filtros
  const [allowedZonas, setAllowedZonas] = useState(cachedAllowedZonas || []);
  const [allowedRoutes, setAllowedRoutes] = useState(cachedAllowedRoutes || []);
  const [selectedZona, setSelectedZona] = useState("__ALL__");
  const [selectedRoute, setSelectedRoute] = useState("__ALL__");
  const [metaTotalClientes, setMetaTotalClientes] = useState(cachedMetaTotalClientes || 0);
  const [workPlanProgress, setWorkPlanProgress] = useState(0);
  const [activeSupervision, setActiveSupervision] = useState(null);

  // Check for active supervision session
  useEffect(() => {
    if (user) {
      getActiveSupervision(user.id).then(async (active) => {
        if (active) {
          const data = await getSupervisionData(active.id);
          setActiveSupervision(data);
        }
      });
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      const d = new Date();
      const monthYear = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      getWorkPlan(user.id, monthYear).then(plan => {
        if (plan) setWorkPlanProgress(plan.progress || 0);
      });
    }
  }, [user]);

  useEffect(() => {
    if (cachedAllowedZonas && cachedAllowedRoutes) return;
    let active = true;
    (async () => {
      if (!user) return;
      try {
        const { data: zonas } = await supabase.from("supervisor_allowed_zonas").select("zona").eq("supervisor_id", user.id);
        const { data: routes } = await supabase.from("supervisor_allowed_sales_routes").select("sales_route").eq("supervisor_id", user.id);
        if (!active) return;
        const zList = (zonas || []).map(z => strip(z.zona)).filter(Boolean);
        const rList = (routes || []).map(r => strip(r.sales_route)).filter(Boolean);
        cachedAllowedZonas = zList;
        cachedAllowedRoutes = rList;
        setAllowedZonas(zList);
        setAllowedRoutes(rList);
        setSelectedZona(zList.length > 1 ? "__ALL__" : (zList[0] ?? "__ALL__"));
        setSelectedRoute("__ALL__");
      } catch (e) {
        if (active) { setAllowedZonas([]); setAllowedRoutes([]); }
      }
    })();
    return () => { active = false; };
  }, [user]);





  // Descripciones e imágenes de SKU (Supabase)
  // Descripciones de SKU (Repository only for descriptions now)
  const [skuDescMap, setSkuDescMap] = useState({});
  const [skuEquivalenciasMap, setSkuEquivalenciasMap] = useState(new Map());
  const [isEquivalenciasOpen, setIsEquivalenciasOpen] = useState(false);

  // Descripciones y Equivalencias de SKU (Repository)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [d1, eqMap] = await Promise.all([
          getSkuDescriptions(),
          getSkuEquivalencias()
        ]);
        if (!active) return;

        const m1 = {};
        for (const r of d1 || []) if (r.cve_marca) m1[norm(r.cve_marca)] = r.descripcion || r.cve_marca;

        setSkuDescMap(m1);
        if (eqMap) setSkuEquivalenciasMap(eqMap);
      } catch (e) {
        if (active) {
          setSkuDescMap({});
          setSkuEquivalenciasMap(new Map());
        }
      }
    })();
    return () => { active = false; };
  }, []);

  // Canales (Repository)
  const [channelMap, setChannelMap] = useState({});

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const allData = await getChannels();
        if (!active) return;

        const m = {};
        for (const r of allData) {
          if (r.cve_cliente) {
            const k = clientCodeKey(r.cve_cliente);
            m[k] = r.canal;
          }
        }
        setChannelMap(m);
        cachedChannelMap = m; // Actualizar cache global
      } catch (e) {
        console.error("[DEBUG] Error loading Canal table:", e);
        if (active) setChannelMap({});
      }
    })();
    return () => { active = false; };
  }, []);

  // Clientes para Metadata (Repository)
  useEffect(() => {
    if (cachedClients && cachedClients.length > 0) {
      setClients(cachedClients);
    }
    let active = true;
    (async () => {
      setClientsLoading(true);
      try {
        const validRoutes = (allowedRoutes || []).filter(r => r && String(r).trim() !== "");
        const filters = { basic: true };
        if (validRoutes.length > 0) {
          filters.sales_routes = validRoutes.join(',');
        }

        const res = await getClientsPaged({ page: 1, pageSize: 50000, filters, userId: user?.id });
        const list = res?.data || res?.rows || [];
        if (active && list.length > 0) {
          cachedClients = list;
          setClients(list);
        }
      } catch (e) {
        console.error("Error loading clients for dashboard:", e);
      } finally {
        if (active) setClientsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [allowedRoutes, user]);

  // Índices de clientes (exacto y normalizado)
  const getClientCode = (c) => strip(c?.client_code || c?.code || c?.cve_cliente || c?.clave_cliente || c?.id || "");


  const clientsByCode = useMemo(() => {
    const map = new Map();
    for (const c of clients || []) {
      const code = getClientCode(c); if (!code) continue;
      map.set(code, c);
    }
    return map;
  }, [clients]);

  const clientsByKey = useMemo(() => {
    const map = new Map();
    for (const c of clients || []) {
      const code = getClientCode(c); 
      if (code) map.set(clientCodeKey(code), c);
      
      // Indexar también por nombre para casos donde la venta trae el nombre en cve_cliente
      const name = strip(c.name || "");
      if (name) map.set(clientCodeKey(name), c);
      const bname = strip(c.business_name || "");
      if (bname) map.set(clientCodeKey(bname), c);
    }
    return map;
  }, [clients]);

  // Cadena / Canal Metadata Map
  const clientCanalMetadataMap = useMemo(() => {
    const map = new Map();
    for (const c of clients || []) {
      const code = getClientCode(c);
      const rawCode = strip(c.cve_cliente || c.client_code);
      const key = code ? clientCodeKey(code) : null;
      const strippedKey = rawCode ? rawCode.replace(/^0+/, "") : null;
      
      const nameVal = strip(c.name || "");
      const nameKey = nameVal ? clientCodeKey(nameVal) : null;
      
      const bnameVal = strip(c.business_name || "");
      const bnameKey = bnameVal ? clientCodeKey(bnameVal) : null;

      // Cadena / GEC / Channel de la tabla clients
      const val = strip(c.cadena || c.gec || c.channel || c.canal);
      
      if (val) {
        if (key) map.set(key, val);
        if (strippedKey) map.set(strippedKey, val);
        if (nameKey) map.set(nameKey, val);
        if (bnameKey) map.set(bnameKey, val);
      }
    }
    return map;
  }, [clients]);

  // Evaluaciones (Repository + Supabase) - Cálculo de Promedio para el periodo seleccionado
  const clientsByKeyRef = useRef(clientsByKey);
  useEffect(() => { clientsByKeyRef.current = clientsByKey; }, [clientsByKey]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { from, to, nextFrom } = periodRange;
        
        let q = supabase.from("evaluaciones_pdv").select("*");
        if (from) q = q.gte("fecha", from);
        if (nextFrom) q = q.lt("fecha", nextFrom);
        else if (to) q = q.lte("fecha", to);

        const [{ data: sbEvals }, repoEvals] = await Promise.all([
          q.catch(() => ({ data: [] })),
          getAllEvaluations({ from, to }).catch(() => [])
        ]);

        if (!active) return;

        const evalMap = new Map();
        [...(sbEvals || []), ...(repoEvals || [])].forEach(e => {
          if (e && (e.id || e.client_code)) {
            const key = String(e.id || `${e.client_code}_${e.fecha || e.created_at}`);
            if (!evalMap.has(key)) evalMap.set(key, e);
          }
        });
        const allEvals = Array.from(evalMap.values());

        const currentClientsByKey = clientsByKeyRef.current;
        const hydratedEvals = allEvals.map((e) => {
          const code = e.client_code || e.client_id;
          const key = code ? clientCodeKey(code) : null;
          const c = key ? currentClientsByKey.get(key) : null;
          
          // Debugging log para ver qué trae repoEvals
          let finalScore = Number(e.score ?? e.puntaje ?? e.total_score ?? 0);
          if (isNaN(finalScore)) finalScore = 0;

          return {
            ...e,
            score: finalScore,
            zona: e.zona || c?.zona || c?.region || c?.zona_comercial,
            ruta: e.ruta || c?.sales_route || c?.ruta || c?.internal_route || c?.route,
          };
        });

        const filtered = hydratedEvals.filter(e => {
          // Robust date extraction
          const rawDate = e.fecha || e.created_at || "";
          let eDate = rawDate.toString().slice(0, 10);
          
          // Fix for DD/MM/YYYY formats which fail string comparisons like "01/08/2026" < "2026-08-01"
          if (eDate.includes('/')) {
            const parts = eDate.split('/');
            if (parts.length === 3) {
              if (parts[2].length === 4) { // DD/MM/YYYY -> YYYY-MM-DD
                eDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
              }
            }
          }
          
          if (from && eDate && eDate < from) return false;
          if (to && eDate && eDate > to) return false;

          const z = strip(e.zona);
          const r = strip(e.ruta || e.sales_route || e.client_route);

          if (allowedZonas && allowedZonas.length > 0 && z) {
            const allowed = allowedZonas.map(strip);
            if (!allowed.some(az => norm(az) === norm(z))) return false;
          }
          if (selectedZona !== "__ALL__" && z && norm(z) !== norm(selectedZona)) return false;
          if (selectedRoute !== "__ALL__" && r) {
            const sel = norm(selectedRoute);
            const rut = norm(r);
            if (!rut.includes(sel) && !sel.includes(rut)) return false;
          }
          return true;
        });

        if (filtered.length === 0) {
          if (active) setAvgEval(0);
        } else {
          // Extraemos los scores > 0 para hacer un promedio justo
          const validScores = filtered.map(e => e.score).filter(n => n > 0 && Number.isFinite(n));
          if (validScores.length === 0) {
            if (active) setAvgEval(0);
          } else {
            const total = validScores.reduce((acc, curr) => acc + curr, 0);
            const avg = total / validScores.length;
            if (active) setAvgEval(Math.round(avg * 10) / 10);
          }
        }
      } catch (e) {
        console.error("Error loading evaluations:", e);
        if (active) setAvgEval(0);
      }
    })();
    return () => { active = false; };
  }, [periodRange, allowedZonas, selectedZona, selectedRoute, clients]);

  // ✓ Ruta derivada por fila (ventas)
  const routeFromRow = (r) => {
    const rx = strip(r?.ruta_express);
    if (rx && !isZeroLike(rx)) return rx;

    const rn = r?.ruta;
    const n = Number(rn);
    if (Number.isFinite(n) && n > 0) return String(n);
    if (typeof rn === "string" && rn && !isZeroLike(rn)) return strip(rn);

    const codeKey = clientCodeKey(r?.cve_cliente);
    const c = clientsByKey.get(codeKey);
    const alt = strip(c?.sales_route || c?.ruta || c?.internal_route || c?.route);
    return alt && !isZeroLike(alt) ? alt : null;
  };




  // ⚡ OPTIMIZACIÓN: Un solo useEffect para ventas + comparativo + allZonaHL
  // En lugar de 4 llamadas API separadas, hacemos 2 en paralelo (actual + año anterior)
  // y derivamos allZonesTotalHL del mismo resultado sin un fetch extra.
  useEffect(() => {
    let active = true;
    (async () => {
      const { from, to, nextFrom, isYear, isMonth, isDay } = periodRange;
      
      const currentParamsStr = JSON.stringify({ dateFilter, selectedZona, selectedRoute });
      const lastParamsStr = JSON.stringify(cachedLastParams);

      if (cachedVpsRows && currentParamsStr === lastParamsStr) {
        setVpsRows(cachedVpsRows);
        setIsLoadingSales(false);
        return;
      }

      setIsLoadingSales(true);
      try {
        const { year, month } = dateFilter;
        const currentYear = Number(year);
        const prevYear = currentYear - 1;

        let startCurrent, endCurrent, startPrev, endPrev;
        let xAxisKey = "month";

        if (isYear) {
          startCurrent = `${currentYear}-01-01`;
          endCurrent = `${currentYear}-12-31`;
          startPrev = `${prevYear}-01-01`;
          endPrev = `${prevYear}-12-31`;
          xAxisKey = "month";
        } else {
          const m = month.padStart(2, "0");
          startCurrent = `${currentYear}-${m}-01`;
          endCurrent = endOfMonthISO(currentYear, Number(month));
          startPrev = `${prevYear}-${m}-01`;
          endPrev = endOfMonthISO(prevYear, Number(month));
          xAxisKey = "day";
        }

        // ⚡ 2 fetches en paralelo (antes eran 4 secuenciales/paralelos separados)
        // Serializamos las llamadas y filtramos por las rutas permitidas para evitar el Timeout (504) en la API
        const zonaFilter = selectedZona && selectedZona !== "__ALL__" ? selectedZona : undefined;
        const routeFilter = selectedRoute && selectedRoute !== "__ALL__" ? selectedRoute : undefined;
        const routesFilter = !routeFilter && allowedRoutes && allowedRoutes.length > 0 ? allowedRoutes : undefined;

        const rowsCurrent = await getSalesBySku({ from: startCurrent, to: endCurrent, nextFrom, zona: zonaFilter, salesRoute: routeFilter, sales_routes: routesFilter });
        const rowsPrev = await getSalesBySku({ from: startPrev, to: endPrev, zona: zonaFilter, salesRoute: routeFilter, sales_routes: routesFilter });

        if (!active) return;

        // El periodo actual es rowsCurrent — reutilizamos para los KPIs
        cachedVpsRows = rowsCurrent;
        cachedLastParams = { dateFilter, selectedZona, selectedRoute };
        setVpsRows(rowsCurrent);

        // ⚡ allZonesTotalHL derivado del mismo fetch — sin llamada extra
        const allowed = Array.from(new Set((allowedZonas || []).map(strip).filter(Boolean)));
        let totalHL = 0;
        for (const row of rowsCurrent || []) {
          const z = strip(row.zona);
          
          if (!isAnalista && allowed.length > 0) {
            if (!z) continue; // If we can't verify the zone, exclude it for supervisors
            const match = allowed.some((az) => norm(z).includes(norm(az)) || norm(az).includes(norm(z)));
            if (!match) continue;
          }
          
          totalHL += Number(row.htls_total) || 0;
        }
        setAllZonesTotalHL(Math.round(totalHL * 1000) / 1000);

        // Construir gráfica comparativa
        let chartData = [];

        if (xAxisKey === "month") {
          const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
          const aggCurrent = new Array(12).fill(0);
          const aggPrev = new Array(12).fill(0);

          const process = (rows, agg) => {
            for (const r of rows) {
              if (selectedRoute !== "__ALL__") {
                const raw = routeFromRow(r);
                if (!raw || routeKey(raw) !== routeKey(selectedRoute)) continue;
              }
              let dateStr = String(r.fecha_alta || r.fecha || r.period_date || "");
              dateStr = dateStr.replace(/\//g, "-");
              const d = new Date(dateStr);
              if (!isNaN(d.getTime())) agg[d.getMonth()] += (Number(r.htls_total) || 0);
            }
          };
          process(rowsCurrent, aggCurrent);
          process(rowsPrev, aggPrev);

          let accC = 0, accP = 0;
          chartData = months.map((m, i) => {
            accC += aggCurrent[i];
            accP += aggPrev[i];
            const now = new Date();
            const isFuture = (currentYear === now.getFullYear() && i > now.getMonth());
            return { month: m, current: isFuture ? null : Number(accC.toFixed(2)), previous: Number(accP.toFixed(2)) };
          });
        } else {
          const daysInMonth = new Date(currentYear, Number(month), 0).getDate();
          const aggCurrent = new Array(daysInMonth + 1).fill(0);
          const aggPrev = new Array(daysInMonth + 1).fill(0);

          const process = (rows, agg) => {
            for (const r of rows) {
              if (selectedRoute !== "__ALL__") {
                const raw = routeFromRow(r);
                if (!raw || routeKey(raw) !== routeKey(selectedRoute)) continue;
              }
              let dateStr = String(r.fecha_alta || r.fecha || r.period_date || "");
              dateStr = dateStr.replace(/\//g, "-");
              const parts = dateStr.split("-");
              if (parts.length >= 3) {
                const day = parseInt(parts[2], 10);
                if (!isNaN(day) && day >= 1 && day < agg.length) {
                  agg[day] += (Number(r.htls_total) || 0);
                }
              }
            }
          };
          process(rowsCurrent, aggCurrent);
          process(rowsPrev, aggPrev);

          let lastDayWithSales = 0;
          for (let d = 1; d <= daysInMonth; d++) {
            if (aggCurrent[d] > 0) lastDayWithSales = d;
          }

          const now = new Date();
          const isCurrentMonth = (currentYear === now.getFullYear() && Number(month) - 1 === now.getMonth());

          let accC = 0, accP = 0;
          for (let d = 1; d <= daysInMonth; d++) {
            accC += aggCurrent[d];
            accP += aggPrev[d];
            let valCurrent = Number(accC.toFixed(2));
            const isFutureDate = isCurrentMonth && d > now.getDate();
            const isTrailingZero = isCurrentMonth && d > lastDayWithSales && d <= now.getDate();
            if (isFutureDate || isTrailingZero) valCurrent = null;
            chartData.push({ day: d, current: valCurrent, previous: Number(accP.toFixed(2)) });
          }
        }

        setComparativeData({ data: chartData, xAxisKey });

      } catch (e) {
        console.error("Error fetching data:", e);
        if (active) { setVpsRows([]); setComparativeData({ data: [], xAxisKey: 'month' }); }
      } finally {
        if (active) setIsLoadingSales(false);
      }
    })();
    return () => { active = false; };
  }, [selectedZona, selectedRoute, periodRange, dateFilter, allowedZonas]);

  // ⚡ OPTIMIZACIÓN: allZonesTotalHL ahora se calcula dentro del useEffect principal de ventas
  // Este useEffect fue eliminado para evitar el 4to fetch de API innecesario.

  // ðŸ”¥ Rutas visibles de la zona
  const zoneRoutes = useMemo(() => {
    if (selectedZona === "__ALL__") return allowedRoutes || [];
    const set = new Set();
    for (const r of vpsRows || []) {
      const z = strip(r.zona);
      if (!z) continue;
      if (norm(z).includes(norm(selectedZona)) || norm(selectedZona).includes(norm(z))) {
        const raw = routeFromRow(r);
        if (raw) set.add(strip(raw));
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [selectedZona, vpsRows, allowedRoutes, clientsByKey]);

  // Rutas en alcance
  const scopeRoutes = useMemo(() => {
    if (selectedRoute !== "__ALL__") return [selectedRoute];
    if (selectedZona !== "__ALL__") return zoneRoutes || [];
    return allowedRoutes || [];
  }, [selectedRoute, selectedZona, zoneRoutes, allowedRoutes]);

  // Si cambias de zona, volvemos a "Todas" las rutas
  useEffect(() => { setSelectedRoute("__ALL__"); }, [selectedZona]);

  const scopeLabelText = useMemo(() => {
    if (selectedRoute !== "__ALL__") return `Ruta ${selectedRoute}`;
    if (selectedZona !== "__ALL__") return `Zona ${selectedZona}`;
    return "Todas las zonas";
  }, [selectedRoute, selectedZona]);



  const periodLabel = useMemo(() => {
    const { year, month, day } = dateFilter;

    const monthNames = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    // Solo año
    if (month === "__ALL__") return `Año ${year}`;

    const monthIndex = Number(month) - 1;
    const monthName = monthNames[monthIndex] || `Mes ${month}`;

    // Año + mes
    if (day === "__ALL__") return `${monthName} ${year}`;

    // Año + mes + día
    const dayStr = String(day).padStart(2, "0");
    return `${dayStr} de ${monthName} de ${year}`;
  }, [dateFilter]);

  // Filtrado por rutas (en memoria)
  const rowsInScope = useMemo(() => {
    let result = vpsRows || [];

    // 1. Filter by allowedZonas for non-analysts
    if (!isAnalista && allowedZonas && allowedZonas.length > 0) {
      const allowed = Array.from(new Set(allowedZonas.map(strip).filter(Boolean)));
      result = result.filter(r => {
        const z = strip(r.zona);
        // If row has no zone, we can't verify it belongs to them, so we exclude it (or include it? Safe approach is exclude unless allowed)
        if (!z) return false; 
        return allowed.some(az => norm(z).includes(norm(az)) || norm(az).includes(norm(z)));
      });
    }

    // 2. Filter by selected route
    if (selectedRoute !== "__ALL__") {
      const W = new Set([routeKey(selectedRoute)]);
      result = result.filter(r => {
        const raw = routeFromRow(r);
        if (!raw) return false;
        return W.has(routeKey(raw));
      });
    }

    return result;
  }, [vpsRows, selectedRoute, isAnalista, allowedZonas]);

  // Totales HL
  const zoneOrRoutesTotalHL = useMemo(() => {
    const rows = (selectedZona === "__ALL__" && selectedRoute === "__ALL__") ? vpsRows : rowsInScope;
    return (rows || []).reduce((a, r) => a + (Number(r.htls_total) || 0), 0);
  }, [vpsRows, rowsInScope, selectedZona, selectedRoute]);

  // ================== KPI clientes ==================
  const clientsBreakdown = useMemo(() => {
    // helpers moved to top level

    // 1) Mapa de ventas por cliente
    const salesByClientKey = new Map();
    const anyRows = Array.isArray(rowsInScope) ? rowsInScope : [];
    for (const row of anyRows) {
      const code = strip(row.cve_cliente);
      if (!code) continue;
      const key = clientCodeKey(code);
      const v = Number(row.htls_total) || 0;
      salesByClientKey.set(key, (salesByClientKey.get(key) || 0) + v);
    }

    // 2) Match por vista
    const clientMatchesScope = (c) => {
      const code = getClientCode(c);
      if (!code) return false;
      const key = clientCodeKey(code);

      // Si tiene ventas en el scope actual (rowsInScope), SIEMPRE entra (es un cliente con compra)
      if (salesByClientKey.has(key)) return true;

      // Si NO tiene ventas, verificamos si "pertenece" a la zona/ruta seleccionada (para ser "sin compra")
      const cz = getClientZona(c);
      const cr = getClientBaseRoute(c);

      // (debug logs eliminados — causaban 140k+ console.logs por cada render)

      // Necesitamos verificar AMBOS filtros (zona Y ruta) si están activos
      let zonaMatches = true;
      let rutaMatches = true;

      // Zona
      if (selectedZona !== "__ALL__") {
        zonaMatches = (cz && (norm(cz).includes(norm(selectedZona)) || norm(selectedZona).includes(norm(cz))));
      }

      // Ruta
      if (selectedRoute !== "__ALL__") {
        rutaMatches = (cr && routeKey(cr) === routeKey(selectedRoute));
      }

      // El cliente pertenece al scope si cumple AMBOS criterios (zona Y ruta)
      const matches = zonaMatches && rutaMatches;


      return matches;
    };

    const withPurchase = [];
    const withoutPurchase = [];

    const baseClients = (clients || []).filter(clientMatchesScope);
    const processedKeys = new Set();

    for (const c of baseClients) {
      const code = getClientCode(c);
      if (!code) continue;

      const key = clientCodeKey(code);
      processedKeys.add(key);
      const totalHL = Math.round(((salesByClientKey.get(key) || 0) + Number.EPSILON) * 1000) / 1000;

      const name = c?.name || c?.business_name || `Cliente ${code}`;
      const baseRoute = getClientBaseRoute(c) || "—";
      const zona = getClientZona(c) || "—";

      const item = { code, name, route: baseRoute, zona, totalHL };

      if (totalHL > 0) withPurchase.push(item);
      else withoutPurchase.push(item);
    }

    // GHOST CLIENTS: Agregar registros de venta para clientes que NO están físicamente en el array de clientes sincronizados
    for (const [key, totalHL] of salesByClientKey.entries()) {
      if (!processedKeys.has(key)) {
        const item = { 
          code: key.toUpperCase(), 
          name: `Cliente en Ruta (${key})`, 
          route: "S/S", 
          zona: selectedZona !== "__ALL__" ? selectedZona : "S/S", 
          totalHL 
        };
        withPurchase.push(item);
      }
    }

    withPurchase.sort((a, b) => (b.totalHL - a.totalHL) || a.name.localeCompare(b.name, "es"));
    withoutPurchase.sort((a, b) => a.name.localeCompare(b.name, "es"));

    return { withPurchase, withoutPurchase };
  }, [clients, rowsInScope, selectedZona, selectedRoute]);

  const clientsWithPurchase = clientsBreakdown.withPurchase.length;
  const clientsWithoutPurchase = clientsBreakdown.withoutPurchase.length;
  const clientsTotal = clientsWithPurchase + clientsWithoutPurchase;

  // SKU share (Consolidado mediante Homologación de Equivalencias)
  const [skuShare, setSkuShare] = useState([]);
  useEffect(() => {
    const denom = zoneOrRoutesTotalHL > 0 ? zoneOrRoutesTotalHL : 1;
    const acc = new Map();
    for (const r of rowsInScope || []) {
      const rawCm = strip(r.cve_marca); if (!rawCm) continue;
      // Homologación: Si existe un código canónico mapeado, consolidar a ese SKU
      const cmNorm = norm(rawCm);
      const cm = (skuEquivalenciasMap && (skuEquivalenciasMap.get(cmNorm) || skuEquivalenciasMap.get(rawCm))) || rawCm;
      const v = Number(r.htls_total) || 0;
      acc.set(cm, (acc.get(cm) || 0) + v);
    }
    const arr = Array.from(acc.entries()).map(([cve_marca, totalHL]) => {
      const desc = skuDescMap[norm(cve_marca)] || cve_marca;
      const img = getProductImageUrl(cve_marca);
      const pct = Math.min(100, Math.round((totalHL / denom) * 100));
      return { cve_marca, desc, img, totalHL, pct };
    }).sort((a, b) => b.totalHL - a.totalHL);
    setSkuShare(arr);
  }, [rowsInScope, skuDescMap, skuEquivalenciasMap, zoneOrRoutesTotalHL]);

  // Venta por GEC (Original, Sin Agrupar)
  // Priority: r.cadena from PHP JOIN > r.gec > in-memory client metadata > "PDV"
  const gecStats = useMemo(() => {
    const denom = zoneOrRoutesTotalHL > 0 ? zoneOrRoutesTotalHL : 1;
    const acc = new Map();

    for (const r of rowsInScope || []) {
      const code = strip(r.cve_cliente);
      if (!code) continue;

      const key = clientCodeKey(code);
      const strippedKey = code.replace(/^0+/, "");
      // Use cadena directly from the PHP JOIN first (most reliable)
      const rawCadena = strip(r.cadena) || strip(r.gec);
      let canal = rawCadena || clientCanalMetadataMap.get(key) || clientCanalMetadataMap.get(strippedKey) || "PDV";
      canal = norm(canal);

      const v = Number(r.htls_total) || 0;
      acc.set(canal, (acc.get(canal) || 0) + v);
    }

    return Array.from(acc.entries()).map(([canal, totalHL]) => {
      const pct = Math.min(100, Math.round((totalHL / denom) * 100));
      const img = getChannelImage(canal);
      return { canal, totalHL, pct, img };
    }).sort((a, b) => b.totalHL - a.totalHL);
  }, [rowsInScope, channelMap, clientCanalMetadataMap, zoneOrRoutesTotalHL]);

  // Venta Agrupada (Unifica Metas a PDV)
  const groupedChannelStats = useMemo(() => {
    const denom = zoneOrRoutesTotalHL > 0 ? zoneOrRoutesTotalHL : 1;
    const acc = new Map();

    const UNIFY_REGEX = /BRONCE|PLATA|PLATINO|ORO|TITANIO/i;

    for (const r of rowsInScope || []) {
      const code = strip(r.cve_cliente);
      if (!code) continue;

      const key = clientCodeKey(code);
      const strippedKey = code.replace(/^0+/, "");
      // Use cadena directly from the PHP JOIN first (most reliable)
      const rawCadena = strip(r.cadena) || strip(r.gec);
      let canal = rawCadena || clientCanalMetadataMap.get(key) || clientCanalMetadataMap.get(strippedKey) || "PDV";
      
      // Lógica de Unificación
      if (UNIFY_REGEX.test(canal)) {
        canal = "PDV";
      }

      canal = norm(canal);
      const v = Number(r.htls_total) || 0;
      acc.set(canal, (acc.get(canal) || 0) + v);
    }

    return Array.from(acc.entries()).map(([canal, totalHL]) => {
      const pct = Math.min(100, Math.round((totalHL / denom) * 100));
      const img = getChannelImage(canal);
      return { canal, totalHL, pct, img };
    }).sort((a, b) => b.totalHL - a.totalHL);
  }, [rowsInScope, channelMap, clientCanalMetadataMap, zoneOrRoutesTotalHL]);

  const filteredGecStats = useMemo(() => {
    const q = mainChannelSearch.toLowerCase().trim();
    if (!q) return gecStats;
    return gecStats.filter(s => s.canal.toLowerCase().includes(q));
  }, [gecStats, mainChannelSearch]);

  const [mainGroupedSearch, setMainGroupedSearch] = useState("");
  const filteredGroupedStats = useMemo(() => {
    const q = mainGroupedSearch.toLowerCase().trim();
    if (!q) return groupedChannelStats;
    return groupedChannelStats.filter(s => s.canal.toLowerCase().includes(q));
  }, [groupedChannelStats, mainGroupedSearch]);

  const channelClientsDetails = useMemo(() => {
    if (!selectedChannel) return [];
    const allStats = [...gecStats, ...groupedChannelStats];
    const channelInfo = allStats.find(s => s.canal === selectedChannel);
    const channelTotalHL = channelInfo ? channelInfo.totalHL : 1;
    
    const acc = new Map();
    for (const r of rowsInScope || []) {
      const rawId = strip(r.cve_cliente);
      if (!rawId) continue;
      
      const key = clientCodeKey(rawId);
      const strippedKey = rawId.replace(/^0+/, "");
      const c = clientsByCode.get(rawId) || clientsByKey.get(key) || clientsByKey.get(strippedKey);
      const code = c?.client_code || rawId;

      // Priority: cadena from PHP JOIN > gec from PHP JOIN > in-memory metadata > "PDV"
      const rawCadena = strip(r.cadena) || strip(r.gec);
      let canal = rawCadena || clientCanalMetadataMap.get(key) || clientCanalMetadataMap.get(strippedKey) || "PDV";
      const canalNorm = norm(canal);
      const isSelected = canalNorm === selectedChannel || 
                        (selectedChannel === "PDV" && /BRONCE|PLATA|PLATINO|ORO|TITANIO/i.test(canal));

      if (!isSelected) continue;

      const v = Number(r.htls_total) || 0;
      acc.set(code, (acc.get(code) || 0) + v);
    }

    const list = Array.from(acc.entries()).map(([code, totalHL]) => {
      const c = clientsByCode.get(code) || clientsByKey.get(clientCodeKey(code));
      const name = c?.name || c?.business_name || `Cliente ${code}`;
      const zona = getClientZona(c) || "—";
      const pct = channelTotalHL > 0 ? (totalHL / channelTotalHL) * 100 : 0;
      return { code, name, totalHL, pct, zona };
    }).sort((a, b) => b.totalHL - a.totalHL);

    const q = channelSearch.toLowerCase();
    return q ? list.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)) : list;
  }, [selectedChannel, rowsInScope, channelMap, gecStats, groupedChannelStats, clientsByCode, clientsByKey, channelSearch]);

  // Metas (zona/ruta) — Usando Repository (Offline Support)

  useEffect(() => {
    let active = true;
    (async () => {
      const { from, to, nextFrom, isMonthPicker } = periodRange;

      try {
        // Importar dinámicamente si no está arriba, o asumir que ya lo importamos (lo agregaré en los imports)
        // Para este replace, asumiré que los imports se agregan en otro paso o ya están disponibles.
        // Pero mejor usar los imports que agregaré.
        const { getGoals, getZoneGoals } = await import('@/repositories/goalsRepository');

        if (selectedRoute !== "__ALL__") {
          const data = await getGoals({
            salesRoute: selectedRoute,
            from,
            to,
            nextFrom,
            isMonthPicker
          });

          let meta = 0;
          if (Array.isArray(data) && data.length) {
            const latest = data.reduce((a, b) => new Date(a.period_date) > new Date(b.period_date) ? a : b);
            meta = Number(latest.meta) || 0;
          }
          if (active) setZoneMeta(meta);
          return;
        }

        if (selectedZona !== "__ALL__") {
          const data = await getZoneGoals({
            zona: selectedZona,
            from,
            to,
            nextFrom,
            isMonthPicker
          });

          let meta = 0;
          if (Array.isArray(data) && data.length) {
            const latest = data.reduce((a, b) => new Date(a.period_date) > new Date(b.period_date) ? a : b);
            meta = Number(latest.meta) || 0;
          }
          if (active) setZoneMeta(meta);
          return;
        }

        // Todas las zonas
        const zonas = (allowedZonas || []).map(strip).filter(Boolean);

        // Obtener meta para TODAS las zonas y sumar
        // Si `zonas` está vacío = sin restricciones (admin/HR), sumar todo.
        // getZoneGoals con zona '__ALL__' trae todas las filas de metas_zona.
        const data = await getZoneGoals({
          zona: '__ALL__',
          from,
          to,
          nextFrom,
          isMonthPicker
        });

        const latestByZ = new Map();
        for (const row of data || []) {
          const z = strip(row.zona);
          if (!z) continue;
          // Filtrar solo zonas permitidas (si aplica)
          if (zonas.length > 0 && !zonas.find(zz => norm(zz) === norm(z))) continue;

          const prev = latestByZ.get(z);
          if (!prev || new Date(row.period_date) > new Date(prev.period_date)) {
            latestByZ.set(z, row);
          }
        }

        let metaTotal = 0;
        for (const [, row] of latestByZ) metaTotal += Number(row.meta) || 0;

        if (active) setZoneMeta(metaTotal || 0);

      } catch (e) {
        console.error("Error loading goals:", e);
        if (active) setZoneMeta(0);
      }
    })();
    return () => { active = false; };
  }, [selectedRoute, selectedZona, allowedZonas, periodRange]);

  // Tendencia
  const tendencia = useMemo(() => {
    const { from, to, totalBusiness } = periodRange;

    // 1. Determinar la última fecha con ventas en el periodo actual
    let maxSalesDate = null;
    if (rowsInScope && rowsInScope.length > 0) {
      // Buscar la fecha máxima en los registros
      for (const r of rowsInScope) {
        const dStr = String(r.fecha_alta || r.fecha || r.period_date || "");
        if (dStr) {
          const d = new Date(dStr);
          if (!isNaN(d.getTime())) {
            if (!maxSalesDate || d > maxSalesDate) {
              maxSalesDate = d;
            }
          }
        }
      }
    }

    // 2. Definir "Hoy" y "Ayer"
    const now = new Date();
    const todayISO = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayISO = yesterday.toISOString().slice(0, 10);

    // 3. Lógica de Corte Ajustada (Petición Usuario: "cuenta 13 días pero en ventas solo hay 12")
    // Usamos la fecha de la última venta como corte real para no diluir el promedio con días sin datos (retraso de actualización).
    let effectiveCutoffDate = yesterdayISO;

    if (maxSalesDate) {
      const maxSalesISO = maxSalesDate.toISOString().slice(0, 10);
      // Si la última venta es anterior o igual a hoy, usamos esa fecha exacta.
      // Ejemplo: Hoy es 15, última venta el 12 -> Cortamos en 12.
      if (maxSalesISO <= todayISO) {
        effectiveCutoffDate = maxSalesISO;
      }
    } else {
      // Si no hay ventas, fallback a ayer (o hoy si es el primer día)
      if (todayISO === from) effectiveCutoffDate = todayISO;
    }

    // 4. Recalcular días hábiles transcurridos hasta la fecha de corte efectiva
    // (from, to, totalBusiness ya desestructurados arriba)

    // El límite superior es el menor entre: el fin del periodo (to) y la fecha de corte efectiva
    // Esto maneja tanto meses pasados (donde to < effectiveCutoffDate) como el mes actual.
    const effectiveTo = to < effectiveCutoffDate ? to : effectiveCutoffDate;

    const effectiveElapsedBusiness = businessDaysMonSat(from, effectiveTo);

    // 5. Cálculos finales
    const hlPerDay = effectiveElapsedBusiness > 0 ? zoneOrRoutesTotalHL / effectiveElapsedBusiness : 0;

    // Proyección: (Promedio Diario * Días Totales Hábiles)
    // Nota: Si el mes ya acabó, effectiveElapsedBusiness == totalBusiness, así que hlProj == zoneOrRoutesTotalHL
    const hlProj = effectiveElapsedBusiness > 0 ? Math.round(hlPerDay * totalBusiness * 1000) / 1000 : zoneOrRoutesTotalHL;

    const pctMeta = zoneMeta > 0 ? Math.round((hlProj / zoneMeta) * 100) : 0; // % Proyectado
    const pctActual = zoneMeta > 0 ? (zoneOrRoutesTotalHL / zoneMeta) * 100 : 0; // % Real (Avance)
    const faltan = Math.max(zoneMeta - hlProj, 0);

    return {
      hlPerDay,
      hlProj,
      pctMeta,
      pctActual,
      faltan,
      elapsedBusiness: effectiveElapsedBusiness, // Usamos el efectivo para mostrar en UI si se desea
      totalBusiness
    };
  }, [periodRange, zoneOrRoutesTotalHL, zoneMeta, rowsInScope]);

  // Totales por ruta
  const routeTotals = useMemo(() => {
    const acc = new Map();
    for (const r of rowsInScope || []) {
      const raw = routeFromRow(r);
      if (!raw) continue;
      const v = Number(r.htls_total) || 0;
      acc.set(raw, (acc.get(raw) || 0) + v);
    }
    const rows = Array.from(acc.entries()).map(([ruta, total]) => ({ ruta, total }));
    rows.sort((a, b) => b.total - a.total);
    return rows;
  }, [rowsInScope, clientsByKey]);

  const bestRoute = routeTotals[0] || null;
  const worstRoute = useMemo(() => {
    const positives = (routeTotals || []).filter(r => r.total > 0);
    return positives.length ? positives[positives.length - 1] : null;
  }, [routeTotals]);

  // ✅ KPIs Eficiencia Operativa — calculados en memoria (sin llamadas extra a la API)
  const activeRouteCount = useMemo(() => routeTotals.filter(r => r.total > 0).length, [routeTotals]);

  const hlPerActiveRoute = useMemo(() => {
    if (!activeRouteCount) return 0;
    return zoneOrRoutesTotalHL / activeRouteCount;
  }, [zoneOrRoutesTotalHL, activeRouteCount]);

  const hlPerClient = useMemo(() => {
    if (!clientsWithPurchase) return 0;
    return zoneOrRoutesTotalHL / clientsWithPurchase;
  }, [zoneOrRoutesTotalHL, clientsWithPurchase]);

  const avgClientsWithPurchasePerDay = useMemo(() => {
    const elapsed = tendencia.elapsedBusiness || 0;
    if (!elapsed) return 0;
    return Math.round((clientsWithPurchase / elapsed) * 10) / 10;
  }, [clientsWithPurchase, tendencia.elapsedBusiness]);

  const routesWithNoSales = useMemo(() => {
    const routesWithSales = new Set(routeTotals.map(r => routeKey(r.ruta)));
    const expected = (scopeRoutes && scopeRoutes.length > 0 ? scopeRoutes : allowedRoutes) || [];
    return expected.filter(r => !routesWithSales.has(routeKey(r)));
  }, [routeTotals, scopeRoutes, allowedRoutes]);

  const top5Concentration = useMemo(() => {
    const top5HL = (clientsBreakdown.withPurchase || [])
      .slice(0, 5)
      .reduce((sum, c) => sum + (c.totalHL || 0), 0);
    return zoneOrRoutesTotalHL > 0 ? (top5HL / zoneOrRoutesTotalHL) * 100 : 0;
  }, [clientsBreakdown, zoneOrRoutesTotalHL]);

  // Top 10 avance por ruta (zona completa)

  useEffect(() => {
    let active = true;
    (async () => {
      if (!(selectedZona !== "__ALL__" && selectedRoute === "__ALL__")) {
        if (active) setRoutesProgressTop([]);
        return;
      }

      const inScopeKeysSet = new Set();
      const salesByKey = new Map();
      const displayNameByKey = new Map();

      for (const r of rowsInScope || []) {
        const raw = routeFromRow(r);
        if (!raw) continue;
        const k = routeKey(raw);
        inScopeKeysSet.add(k);
        const v = Number(r.htls_total) || 0;
        salesByKey.set(k, (salesByKey.get(k) || 0) + v);
        if (!displayNameByKey.has(k)) displayNameByKey.set(k, raw);
      }

      if (inScopeKeysSet.size === 0) { if (active) setRoutesProgressTop([]); return; }

      const { from, to, nextFrom, isPicker } = periodRange;
      const applyPeriod = (q) => { if (from) q = q.gte("period_date", from); if (isPicker && from && nextFrom) q = q.lt("period_date", nextFrom); else if (to) q = q.lte("period_date", to); return q; };
      let q = supabase.from("metas_venta").select("sales_route, meta, period_date");
      q = applyPeriod(q);
      const { data: metaRows } = await q;

      const latestMetaByKey = new Map();
      for (const row of metaRows || []) {
        const txt = strip(row.sales_route); if (!txt) continue;
        const k = routeKey(txt);
        const prev = latestMetaByKey.get(k);
        if (!prev || new Date(row.period_date) > new Date(prev.period_date)) {
          latestMetaByKey.set(k, { meta: Number(row.meta) || 0, period_date: row.period_date });
        }
      }

      const list = Array.from(inScopeKeysSet).map(k => {
        const sale = salesByKey.get(k) || 0;
        const meta = latestMetaByKey.get(k)?.meta || 0;
        const pct = meta > 0 ? Math.round((sale / meta) * 100) : 0;
        const name = displayNameByKey.get(k) || k;
        return { route: name, sale, meta, pct };
      }).sort((a, b) => b.pct - a.pct).slice(0, 10);

      if (active) setRoutesProgressTop(list);
    })();
    return () => { active = false; };
  }, [rowsInScope, periodRange, selectedZona, selectedRoute, clientsByKey]);

  // Zonas progreso cuando se ve todo

  useEffect(() => {
    let active = true;
    (async () => {
      if (!(selectedZona === "__ALL__" && selectedRoute === "__ALL__")) { if (active) setZonesProgressTop([]); return; }
      const salesByZone = new Map();
      for (const r of vpsRows || []) {
        const z = strip(r.zona); if (!z) continue;
        const v = Number(r.htls_total) || 0;
        salesByZone.set(z, (salesByZone.get(z) || 0) + v);
      }
      const zonas = Array.from(salesByZone.keys());
      const { from, to, nextFrom, isPicker } = periodRange;
      const applyPeriod = (q) => { if (from) q = q.gte("period_date", from); if (isPicker && from && nextFrom) q = q.lt("period_date", nextFrom); else if (to) q = q.lte("period_date", to); return q; };
      let q = supabase.from("metas_zona").select("zona, meta, period_date");
      q = applyPeriod(q);
      const { data: metaRows } = await q;

      const latestByZona = new Map();
      for (const row of metaRows || []) {
        const z = strip(row.zona);
        const prev = latestByZona.get(z);
        if (!prev || new Date(row.period_date) > new Date(prev.period_date)) latestByZona.set(z, row);
      }

      const list = zonas.map(z => {
        const sale = salesByZone.get(z) || 0;
        const meta = Number(latestByZona.get(z)?.meta) || 0;
        const pct = meta > 0 ? Math.round((sale / meta) * 100) : 0;
        return { zone: z, sale, meta, pct };
      }).sort((a, b) => b.pct - a.pct).slice(0, 10);
      if (active) setZonesProgressTop(list);
    })();
    return () => { active = false; };
  }, [selectedZona, selectedRoute, vpsRows, periodRange]);

  // Meta de clientes por compra
  useEffect(() => {
    let active = true;
    (async () => {
      if (!allowedRoutes.length) return;
      try {
        const { from, to, nextFrom, isPicker } = periodRange;
        const applyPeriod = (q) => {
          if (from) q = q.gte("period_date", from);
          if (isPicker && from && nextFrom) q = q.lt("period_date", nextFrom);
          else if (to) q = q.lte("period_date", to);
          return q;
        };

        let q = supabase.from("metas_venta").select("sales_route, meta_clientes, period_date");
        q = applyPeriod(q);
        
        // Filtrar por rutas en alcance
        const routesInScope = scopeRoutes || [];
        if (routesInScope.length > 0 && selectedRoute !== "__ALL__") {
           q = q.in("sales_route", routesInScope);
        } else if (allowedRoutes.length > 0) {
           // Si no hay ruta específica seleccionada pero sí zona, filtramos por las rutas de esa zona
           // o simplemente traemos todas las permitidas y sumamos localmente.
           q = q.in("sales_route", allowedRoutes);
        }

        const { data: metaRows } = await q;
        if (!active) return;

        // Sumar meta de clientes (tomando la más reciente para cada ruta en el periodo si se repiten)
        const latestMetaByRoute = new Map();
        for (const row of metaRows || []) {
          const r = strip(row.sales_route);
          const meta = Number(row.meta_clientes) || 0;
          const prev = latestMetaByRoute.get(r);
          if (!prev || new Date(row.period_date) > new Date(prev.period_date)) {
            latestMetaByRoute.set(r, { meta, period_date: row.period_date });
          }
        }

        // Si hay una ruta específica seleccionada, solo esa. Si no, todas las del scope.
        let total = 0;
        if (selectedRoute !== "__ALL__") {
          total = latestMetaByRoute.get(routeKey(selectedRoute))?.meta || 0;
        } else {
          // Sumar solo las que pertenecen a la zona seleccionada si aplica
          const currentScopeRoutes = scopeRoutes.map(routeKey);
          for (const [rKey, data] of latestMetaByRoute.entries()) {
             if (currentScopeRoutes.includes(rKey)) total += data.meta;
          }
        }

        cachedMetaTotalClientes = total;
        setMetaTotalClientes(total);
      } catch (e) {
        console.error("Error loading metas clientes:", e);
      }
    })();
    return () => { active = false; };
  }, [periodRange, selectedZona, selectedRoute, allowedRoutes, scopeRoutes]);


  // Mapa
  const clientsWithCoords = useMemo(() => {
    return (clients || [])
      .map(c => normalizeClientCoords(c))
      .filter(Boolean)
      .map(c => {
        const { lat, lng } = c.coords;
        return {
          ...c,
          lat, lng,
          coords: { lat, lng },
          title: c.name ?? c.business_name ?? c.id ?? "Cliente",
          subtitle: strip(c.sales_route || c.ruta || c.internal_route || c.route || ""),
        };
      });
  }, [clients]);

  // Top 10 clientes
  const topClients = useMemo(() => {
    if (selectedRoute === "__ALL__") return [];
    const acc = new Map();
    for (const r of rowsInScope || []) {
      const code = strip(r.cve_cliente); if (!code) continue;
      const v = Number(r.htls_total) || 0;
      acc.set(code, (acc.get(code) || 0) + v);
    }
    return Array.from(acc.entries()).map(([code, total]) => {
      const c = clientsByCode.get(code) || clientsByKey.get(clientCodeKey(code));
      const name = c?.name || c?.business_name || `Cliente ${code}`;
      return { code, name, total };
    }).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [selectedRoute, rowsInScope, clientsByCode, clientsByKey]);


  const clientsModalData = clientsModalView === "with" ? clientsBreakdown.withPurchase : clientsBreakdown.withoutPurchase;
  const openClientsModal = (view) => {
    setClientsModalView(view);
    setClientsModalOpen(true);
  };
  const handleDownloadClientsList = useCallback(() => {
    const rows = clientsModalView === "with" ? clientsBreakdown.withPurchase : clientsBreakdown.withoutPurchase;
    const header = ["codigo", "nombre", "zona", "ruta", "hl_periodo"];
    const csv = [header.join(",")];
    const toCsvValue = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    rows.forEach((row) => {
      csv.push([row.code, row.name, row.zona, row.route, row.totalHL].map(toCsvValue).join(","));
    });
    const blob = new Blob(["\uFEFF" + csv.join("\n")], { type: "text/csv;charset=utf-8;" });
    const scopeLabel = selectedRoute !== "__ALL__"
      ? `ruta-${selectedRoute}`
      : (selectedZona !== "__ALL__" ? `zona-${selectedZona}` : "todas");
    const baseName = `clientes-${clientsModalView}-${scopeLabel}-${periodRange.from}`;
    const fileName = baseName.replace(/[^a-zA-Z0-9._-]+/g, "_") + ".csv";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }, [clientsModalView, clientsBreakdown, selectedRoute, selectedZona, periodRange]);

  const handleDownloadChannelCSV = useCallback(() => {
    if (!selectedChannel) return;
    const rows = channelClientsDetails;
    const header = ["codigo", "nombre", "zona", "hl_periodo", "participacion_canal_pct"];
    const csv = [header.join(",")];
    const toCsvValue = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    rows.forEach((row) => {
      csv.push([row.code, row.name, row.zona, row.totalHL, row.pct.toFixed(2)].map(toCsvValue).join(","));
    });
    const blob = new Blob(["\uFEFF" + csv.join("\n")], { type: "text/csv;charset=utf-8;" });
    const scopeLabel = selectedRoute !== "__ALL__"
      ? `ruta-${selectedRoute}`
      : (selectedZona !== "__ALL__" ? `zona-${selectedZona}` : "todas");
    const baseName = `detalle-canal-${selectedChannel}-${scopeLabel}-${periodRange.from}`;
    const fileName = baseName.replace(/[^a-zA-Z0-9._-]+/g, "_") + ".csv";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }, [selectedChannel, channelClientsDetails, selectedRoute, selectedZona, periodRange]);


  const openSalesDialog = async ({ code, name }) => {
    let client = clientsByCode.get(code) || clientsByKey.get(clientCodeKey(code));
    if (!client) {
      client = await getClientByCode(code) || { client_code: code, name };
    }
    setSalesClient(client);
  };

  /* ================== UI ================== */
  return (
    <>
      <Helmet>
        <title>Dashboard Supervisor - Cervezas Finas</title>
      </Helmet>

      {/* Loading Overlay */}
      {isLoadingSales && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-slate-900 p-6 rounded-2xl border border-white/10 shadow-2xl flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-white font-medium">Cargando datos...</p>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-slate-900 text-white font-sans selection:bg-emerald-500/30 pb-20">
        {/* Header Premium */}
        <div className="sticky top-0 z-40 bg-black/60 backdrop-blur-xl border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 py-2 md:h-16 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-0">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <img src="/logo3.png" alt="Cervezas Finas Logo" className="h-10 object-contain drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
            </div>

            <div className="grid grid-cols-3 sm:flex items-center gap-2 w-full md:w-auto">
              {/* Año */}
              <Select value={dateFilter.year} onValueChange={y => setDateFilter(prev => ({ ...prev, year: y }))}>
                <SelectTrigger className="h-9 bg-white/5 border-white/10 text-white text-sm w-full md:min-w-[80px]">
                  <Calendar className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                  <SelectValue placeholder="Año" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  {[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* Mes */}
              <Select value={dateFilter.month} onValueChange={m => setDateFilter(prev => ({ ...prev, month: m, day: "__ALL__" }))}>
                <SelectTrigger className="h-9 bg-white/5 border-white/10 text-white text-sm w-full md:min-w-[100px]">
                  <SelectValue placeholder="Mes" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectItem value="__ALL__">Todos</SelectItem>
                  {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Día */}
              <Select
                value={dateFilter.day}
                onValueChange={d => setDateFilter(prev => ({ ...prev, day: d }))}
                disabled={dateFilter.month === "__ALL__"}
              >
                <SelectTrigger className="h-9 bg-white/5 border-white/10 text-white text-sm w-full md:min-w-[70px] disabled:opacity-30">
                  <SelectValue placeholder="Día" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectItem value="__ALL__">Todos</SelectItem>
                  {dateFilter.month !== "__ALL__" && Array.from({ length: new Date(Number(dateFilter.year), Number(dateFilter.month), 0).getDate() }, (_, i) => i + 1).map(d => (
                    <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Zona */}
              <Select value={selectedZona} onValueChange={setSelectedZona}>
                <SelectTrigger className="h-9 bg-white/5 border-white/10 text-white text-sm w-full md:min-w-[100px] col-span-1 sm:col-span-auto">
                  <MapIcon className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                  <SelectValue placeholder="Zona" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectItem value="__ALL__">Todas</SelectItem>
                  {allowedZonas.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* Ruta */}
              <Select value={selectedRoute} onValueChange={setSelectedRoute}>
                <SelectTrigger className="h-9 bg-white/5 border-white/10 text-white text-sm w-full md:min-w-[100px] col-span-2 sm:col-span-auto">
                  <Target className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                  <SelectValue placeholder="Ruta" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectItem value="__ALL__">Todas</SelectItem>
                  {zoneRoutes.map(r => <SelectItem key={r} value={r}>Ruta {r}</SelectItem>)}
                </SelectContent>
              </Select>

              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-medium text-white/70">{userName}</span>
              </div>
            </div>
          </div>
        </div>

        <header className="p-4 sm:p-6 border-b border-white/5 bg-slate-900/50 backdrop-blur-md sticky top-0 z-30">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Trophy size={18} className="text-emerald-500" />
                </div>
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                  ¡Hola, {userName.split(' ')[0]}!
                </h1>
              </div>
              <p className="text-sm text-slate-400">Panel de Control de Supervisión</p>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                 variant="outline" 
                 size="sm"
                 className="bg-slate-800 border-white/10 hover:bg-slate-700 text-xs h-9 px-4 gap-2"
                 onClick={() => navigate('/supervisor/onboard-supervision')}
              >
                <ClipboardCheck size={14} /> Supervisión Abordo
              </Button>
              <Button 
                 variant="outline" 
                 size="sm"
                 className="bg-slate-800 border-white/10 hover:bg-slate-700 text-xs h-9 px-4 gap-2"
                 onClick={() => navigate('/supervisor/onboard-summary')}
              >
                <Calendar size={14} /> Historial
              </Button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-8">
          {/* ACTIVE SUPERVISION ALIGNMENT */}
          {activeSupervision && (
            <motion.div 
              initial={{ opacity: 0, y: -20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="relative group overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 shadow-lg shadow-emerald-500/10"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Play size={120} className="text-emerald-500 -rotate-12 translate-x-10 -translate-y-10" />
              </div>

              <div className="relative flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/40">
                    <Car size={32} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Supervisión en Curso</h3>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="flex items-center gap-1 text-emerald-400 font-medium">
                        <MapIcon size={14} /> Ruta {activeSupervision.route_name}
                      </span>
                      <span className="text-slate-500">•</span>
                      <span className="flex items-center gap-1 text-slate-300">
                        <User size={14} /> {activeSupervision.vendedor_name}
                      </span>
                      <span className="text-slate-500">•</span>
                      <span className="flex items-center gap-1 text-slate-300">
                        <CheckCircle2 size={14} /> {activeSupervision.visits?.length || 0} visitas
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  <Button 
                    onClick={() => navigate('/supervisor/onboard-supervision')}
                    className="flex-1 md:flex-initial h-12 bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-bold px-8 rounded-xl shadow-lg shadow-emerald-500/20 gap-2"
                  >
                    Reanudar Supervisión <ArrowUpRight size={18} />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Avance de Actividades Mensuales (COMPACTO Y ANCHO) */}
          <PremiumCard className="p-3 bg-slate-900/60 border-white/10 backdrop-blur-xl group cursor-pointer" onClick={() => navigate("/supervisor/work-plan")}>
            <div className="flex items-center gap-4">
              {/* Icon & Title - Minimized vertically */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 border border-cyan-500/20 group-hover:scale-105 transition-transform">
                  <Calendar size={20} />
                </div>
                <div className="hidden xsm:block">
                  <h3 className="text-[9px] font-black uppercase tracking-widest text-cyan-400/80 leading-none mb-1">Plan Mensual</h3>
                  <div className="text-white font-black text-sm uppercase tracking-tight leading-none">Plan de Trabajo</div>
                </div>
              </div>

              {/* Progress Bar - Takes most of the width */}
              <div className="flex-1 flex flex-col justify-center">
                <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden border border-white/5 shadow-inner relative">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${workPlanProgress}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.4)] relative overflow-hidden"
                  >
                    <motion.div 
                      animate={{ x: ['-100%', '100%'] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent w-full"
                    />
                  </motion.div>
                </div>
              </div>

              {/* Percentage - Large but horizontally aligned */}
              <div className="flex items-baseline gap-1 shrink-0 px-2">
                <span className="text-2xl font-black text-white leading-none tracking-tighter drop-shadow-md">{Math.round(workPlanProgress)}</span>
                <span className="text-sm font-black text-cyan-500">%</span>
              </div>
            </div>
          </PremiumCard>

          {/* Indicadores Claves de Impulso */}
          <SectionTitle>Indicadores Claves de Impulso</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* SKU 4239 */}
            <PremiumCard className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                <div className="text-5xl font-black text-white">4239</div>
              </div>
              <div className="flex items-start gap-3 relative z-10">
                <div className="w-16 h-16 shrink-0 bg-white/5 rounded-lg p-1.5 backdrop-blur-sm border border-white/10">
                  <img
                    src={getProductImageUrl('4239')}
                    alt="4239"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-green-300 text-[10px] font-bold uppercase tracking-wider mb-0.5">
                    Producto Impulso
                  </div>
                  <div className="text-white font-bold text-xs leading-tight mb-2 truncate" title={skuDescMap[norm('4239')] || '4239'}>
                    {skuDescMap[norm('4239')] || '4239'}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <div>
                      <div className="text-white/50 text-[9px] uppercase">Venta Cajas</div>
                      <div className="text-white font-bold text-base">
                        {(() => {
                          const sku = rowsInScope.filter(r => String(r.cve_marca).includes('4239'));
                          const cases = sku.reduce((a, r) => a + (Number(r.unidades) || 0), 0);
                          return Math.round(cases).toLocaleString('es-MX');
                        })()}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/50 text-[9px] uppercase">Venta HL</div>
                      <div className="text-white font-bold text-base">
                        {(() => {
                          const sku = rowsInScope.filter(r => String(r.cve_marca).includes('4239'));
                          return sku.reduce((a, r) => a + (Number(r.htls_total) || 0), 0).toLocaleString('es-MX', { maximumFractionDigits: 1 });
                        })()}
                      </div>
                    </div>
                    <div className="col-span-2 pt-1.5 border-t border-white/10 mt-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-white/60 text-[10px]">Clientes con compra</span>
                        <span className="px-1.5 py-0.5 rounded text-green-300 font-bold text-xs bg-green-500/20">
                          {(() => {
                            const sku = rowsInScope.filter(r => String(r.cve_marca).includes('4239'));
                            const uniqueClients = new Set(sku.map(r => strip(r.cve_cliente)));
                            return uniqueClients.size;
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </PremiumCard>

            {/* SKU 380 */}
            <PremiumCard className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                <div className="text-5xl font-black text-white">380</div>
              </div>
              <div className="flex items-start gap-3 relative z-10">
                <div className="w-16 h-16 shrink-0 bg-white/5 rounded-lg p-1.5 backdrop-blur-sm border border-white/10">
                  <img
                    src={getProductImageUrl('380')}
                    alt="380"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-green-300 text-[10px] font-bold uppercase tracking-wider mb-0.5">
                    Producto Impulso
                  </div>
                  <div className="text-white font-bold text-xs leading-tight mb-2 truncate" title={skuDescMap[norm('380')] || '380'}>
                    {skuDescMap[norm('380')] || '380'}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <div>
                      <div className="text-white/50 text-[9px] uppercase">Venta Cajas</div>
                      <div className="text-white font-bold text-base">
                        {(() => {
                          const sku = rowsInScope.filter(r => String(r.cve_marca).includes('380'));
                          const cases = sku.reduce((a, r) => a + (Number(r.unidades) || 0), 0);
                          return Math.round(cases).toLocaleString('es-MX');
                        })()}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/50 text-[9px] uppercase">Venta HL</div>
                      <div className="text-white font-bold text-base">
                        {(() => {
                          const sku = rowsInScope.filter(r => String(r.cve_marca).includes('380'));
                          return sku.reduce((a, r) => a + (Number(r.htls_total) || 0), 0).toLocaleString('es-MX', { maximumFractionDigits: 1 });
                        })()}
                      </div>
                    </div>
                    <div className="col-span-2 pt-1.5 border-t border-white/10 mt-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-white/60 text-[10px]">Clientes con compra</span>
                        <span className="px-1.5 py-0.5 rounded text-green-300 font-bold text-xs bg-green-500/20">
                          {(() => {
                            const sku = rowsInScope.filter(r => String(r.cve_marca).includes('380'));
                            const uniqueClients = new Set(sku.map(r => strip(r.cve_cliente)));
                            return uniqueClients.size;
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </PremiumCard>

            {/* SKU 7214 */}
            <PremiumCard className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                <div className="text-5xl font-black text-white">7214</div>
              </div>
              <div className="flex items-start gap-3 relative z-10">
                <div className="w-16 h-16 shrink-0 bg-white/5 rounded-lg p-1.5 backdrop-blur-sm border border-white/10">
                  <img
                    src={getProductImageUrl('7214')}
                    alt="7214"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-green-300 text-[10px] font-bold uppercase tracking-wider mb-0.5">
                    Producto Impulso
                  </div>
                  <div className="text-white font-bold text-xs leading-tight mb-2 truncate" title={skuDescMap[norm('7214')] || '7214'}>
                    {skuDescMap[norm('7214')] || '7214'}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <div>
                      <div className="text-white/50 text-[9px] uppercase">Venta Cajas</div>
                      <div className="text-white font-bold text-base">
                        {(() => {
                          const sku = rowsInScope.filter(r => String(r.cve_marca).includes('7214'));
                          const cases = sku.reduce((a, r) => a + (Number(r.unidades) || 0), 0);
                          return Math.round(cases).toLocaleString('es-MX');
                        })()}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/50 text-[9px] uppercase">Venta HL</div>
                      <div className="text-white font-bold text-base">
                        {(() => {
                          const sku = rowsInScope.filter(r => String(r.cve_marca).includes('7214'));
                          return sku.reduce((a, r) => a + (Number(r.htls_total) || 0), 0).toLocaleString('es-MX', { maximumFractionDigits: 1 });
                        })()}
                      </div>
                    </div>
                    <div className="col-span-2 pt-1.5 border-t border-white/10 mt-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-white/60 text-[10px]">Clientes con compra</span>
                        <span className="px-1.5 py-0.5 rounded text-green-300 font-bold text-xs bg-green-500/20">
                          {(() => {
                            const sku = rowsInScope.filter(r => String(r.cve_marca).includes('7214'));
                            const uniqueClients = new Set(sku.map(r => strip(r.cve_cliente)));
                            return uniqueClients.size;
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </PremiumCard>

            {/* SKU 9307 */}
            <PremiumCard className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                <div className="text-5xl font-black text-white">9307</div>
              </div>
              <div className="flex items-start gap-3 relative z-10">
                <div className="w-16 h-16 shrink-0 bg-white/5 rounded-lg p-1.5 backdrop-blur-sm border border-white/10">
                  <img
                    src={getProductImageUrl('9307')}
                    alt="9307"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-green-300 text-[10px] font-bold uppercase tracking-wider mb-0.5">
                    Producto Impulso
                  </div>
                  <div className="text-white font-bold text-xs leading-tight mb-2 truncate" title={skuDescMap[norm('9307')] || '9307'}>
                    {skuDescMap[norm('9307')] || '9307'}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <div>
                      <div className="text-white/50 text-[9px] uppercase">Venta Cajas</div>
                      <div className="text-white font-bold text-base">
                        {(() => {
                          const sku = rowsInScope.filter(r => String(r.cve_marca).includes('9307'));
                          const cases = sku.reduce((a, r) => a + (Number(r.unidades) || 0), 0);
                          return Math.round(cases).toLocaleString('es-MX');
                        })()}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/50 text-[9px] uppercase">Venta HL</div>
                      <div className="text-white font-bold text-base">
                        {(() => {
                          const sku = rowsInScope.filter(r => String(r.cve_marca).includes('9307'));
                          return sku.reduce((a, r) => a + (Number(r.htls_total) || 0), 0).toLocaleString('es-MX', { maximumFractionDigits: 1 });
                        })()}
                      </div>
                    </div>
                    <div className="col-span-2 pt-1.5 border-t border-white/10 mt-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-white/60 text-[10px]">Clientes con compra</span>
                        <span className="px-1.5 py-0.5 rounded text-green-300 font-bold text-xs bg-green-500/20">
                          {(() => {
                            const sku = rowsInScope.filter(r => String(r.cve_marca).includes('9307'));
                            const uniqueClients = new Set(sku.map(r => strip(r.cve_cliente)));
                            return uniqueClients.size;
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </PremiumCard>
          </div>

          {/* 3-Column Layout: HL vs Meta | Comparative | SKU Share */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 1) HL vs Meta */}
            <PremiumCard className="p-6 relative overflow-hidden group bg-[#2a2c44] border-0 flex flex-col min-h-[400px] lg:h-[520px]">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <TrendingUp className="w-32 h-32 text-emerald-500" />
              </div>

              <div className="relative z-10 w-full flex-1 flex flex-col min-h-0">
                <div className="text-sm text-white/60 font-medium uppercase tracking-wider mb-3 text-center">
                  HL vs Meta — {selectedZona === "__ALL__" ? "Todas las zonas" : selectedZona}
                </div>

                {/* Donut Chart - Full Width/Centered */}
                <div className="flex justify-center mb-4">
                  <div className="w-40 h-40 relative flex items-center justify-center">
                    <DonutProgress
                      value={tendencia.pctActual}
                      text=""
                      color={tendencia.pctActual >= 100 ? "#10b981" : "#3b82f6"} // Blue for progress, Green for goal met
                      size={160}
                      strokeWidth={10}
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold text-white">{Math.round(tendencia.pctActual)}%</span>
                      <span className="text-[10px] text-white/50 uppercase tracking-widest mt-1">Avance</span>
                    </div>
                  </div>
                </div>

                {/* Metrics List - Scrollable */}
                <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                  <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                    <span className="text-xs text-white/50 uppercase">Meta HL</span>
                    <span className="text-sm font-bold text-white">{zoneMeta.toLocaleString("es-MX")}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                    <span className="text-xs text-white/50 uppercase">HL Actual</span>
                    <span className="text-sm font-bold text-emerald-500">{zoneOrRoutesTotalHL.toLocaleString("es-MX")}</span>
                  </div>

                  <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                    <span className="text-xs text-white/50 uppercase">Tendencia/Día</span>
                    <span className="text-sm font-bold text-white">{tendencia.hlPerDay.toLocaleString("es-MX", { maximumFractionDigits: 1 })}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                    <span className="text-xs text-white/50 uppercase">Días Hábiles</span>
                    <span className="text-sm font-bold text-white">{tendencia.elapsedBusiness} / {tendencia.totalBusiness}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-xs text-white/50 uppercase">Cierre Est.</span>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${tendencia.pctMeta >= 100 ? "text-emerald-400" : "text-amber-400"}`}>
                        {tendencia.hlProj.toLocaleString("es-MX", { maximumFractionDigits: 1 })} HL
                      </div>
                      <div className="text-[10px] text-white/40">
                        {Math.round(tendencia.pctMeta)}% de Meta
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Bar */}
                <div className="mt-3 shrink-0">
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.min(100, tendencia.pctActual)}% ` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-white/40">0%</span>
                    <span className="text-[10px] text-white/40">100%</span>
                  </div>
                </div>
              </div>
            </PremiumCard>

            {/* 2) Comparative Chart (Middle) */}
            <PremiumCard className="p-4 flex flex-col bg-[#2a2c44] border-0 min-h-[400px] lg:h-[520px]">
              <div className="flex-1 min-h-0 overflow-hidden">
                <ComparativeSalesChart
                  data={comparativeData.data || []}
                  currentYear={dateFilter.year}
                  prevYear={Number(dateFilter.year) - 1}
                  xAxisKey={comparativeData.xAxisKey}
                />
              </div>
            </PremiumCard>

            {/* 3) Participación por SKU */}
            <PremiumCard className="p-0 overflow-hidden flex flex-col bg-[#2a2c44] border-0 h-[520px]">
              <div className="p-4 pb-2 border-b border-white/5 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-blue-400" />
                    <div className="text-sm text-white/60 font-medium uppercase tracking-wider">Participación por SKU</div>
                  </div>
                  <button
                    onClick={() => setIsEquivalenciasOpen(true)}
                    className="flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-1 rounded transition-colors"
                    title="Vincular y homologar códigos de sistemas alternos"
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    <span>Homologar</span>
                  </button>
                </div>
                <div className="text-xs text-white/40 mt-0.5">(vs HL total)</div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 mb-6 space-y-1 custom-scrollbar min-h-0">
                {skuShare.filter(item => item.totalHL > 0).map((item, idx) => (
                  <div key={item.cve_marca} className="relative flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group overflow-hidden">
                    {/* Background Watermark */}
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 p-1 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                      <div className="text-5xl font-black text-white tracking-tighter">{item.cve_marca}</div>
                    </div>

                    <div className="w-8 h-8 bg-white rounded p-1 shrink-0 relative z-10">
                      <img src={item.img} alt={item.desc} className="w-full h-full object-contain" />
                    </div>
                    <div className="flex-1 min-w-0 relative z-10">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-xs font-medium text-white truncate" title={item.desc}>
                          {item.desc}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white/60">{item.totalHL.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} HL</span>
                          <span className="text-xs font-bold text-white">{item.pct}%</span>
                        </div>
                      </div>
                      <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full group-hover:bg-blue-400 transition-colors"
                          style={{ width: `${item.pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </PremiumCard>
          </div>


          {/* KPIs Principales (Restantes) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">

            <PremiumCard className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Users className="w-24 h-24 text-blue-500" />
              </div>
              <div className="relative z-10">
                <div className="text-sm text-white/60 font-medium uppercase tracking-wider mb-1">Cobertura</div>
                <div className="text-2xl font-bold text-white mb-2">{clientsWithPurchase} <span className="text-lg text-white/40">/ {clientsTotal}</span></div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-white/50">Clientes con compra</span>
                  <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">
                    {clientsTotal > 0 ? Math.round((clientsWithPurchase / clientsTotal) * 100) : 0}%
                  </span>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10">
                <div className="h-full bg-blue-500" style={{ width: `${clientsTotal > 0 ? (clientsWithPurchase / clientsTotal) * 100 : 0}%` }} />
              </div>
            </PremiumCard>

            <PremiumCard className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <ClipboardCheck className="w-24 h-24 text-emerald-500" />
              </div>
              <div className="relative z-10">
                <div className="text-sm text-white/60 font-medium uppercase tracking-wider mb-1 truncate">Meta Clientes</div>
                <div className="text-2xl font-bold text-white mb-2">
                  {clientsWithPurchase} <span className="text-lg text-white/40">/ {metaTotalClientes || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-white/50">Avance de Objetivo</span>
                  <span className={`px-2 py-0.5 rounded font-bold ${metaTotalClientes > 0 && (clientsWithPurchase / metaTotalClientes) >= 1 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                    {metaTotalClientes > 0 ? Math.round((clientsWithPurchase / metaTotalClientes) * 100) : 0}%
                  </span>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10">
                <div className="h-full bg-emerald-500" style={{ width: `${metaTotalClientes > 0 ? Math.min(100, (clientsWithPurchase / metaTotalClientes) * 100) : 0}%` }} />
              </div>
            </PremiumCard>

            <PremiumCard className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Star className="w-24 h-24 text-purple-500" />
              </div>
              <div className="relative z-10">
                <div className="text-sm text-white/60 font-medium uppercase tracking-wider mb-1">Ejecución</div>
                <div className="text-2xl font-bold text-white mb-2">{avgEval} <span className="text-lg text-white/40">/ 100</span></div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-white/50">Promedio evaluación</span>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10">
                <div className="h-full bg-purple-500" style={{ width: `${avgEval}% ` }} />
              </div>
            </PremiumCard>

            <PremiumCard className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Target className="w-24 h-24 text-emerald-500" />
              </div>
              <div className="relative z-10">
                <div className="text-sm text-white/60 font-medium uppercase tracking-wider mb-1">Proyección</div>
                <div className="text-2xl font-bold text-white mb-2">{tendencia.hlProj.toLocaleString()} <span className="text-base text-emerald-500">HL</span></div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-white/50">Cierre estimado</span>
                </div>
              </div>
            </PremiumCard>

            {/* NUEVA CARD: Aportación a Venta Global */}
            <PremiumCard className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <PieChart className="w-24 h-24 text-pink-500" />
              </div>
              <div className="relative z-10">
                <div className="text-sm text-white/60 font-medium uppercase tracking-wider mb-1">Aportación</div>
                {(() => {
                  const totalGlobal = allZonesTotalHL > 0 ? allZonesTotalHL : 1;
                  const contributionPct = (zoneOrRoutesTotalHL / totalGlobal) * 100;
                  return (
                    <>
                      <div className="text-2xl font-bold text-white mb-2">{contributionPct.toFixed(1)}%</div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-white/50">De la venta total ({allZonesTotalHL.toLocaleString("es-MX")} HL)</span>
                      </div>
                      <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10">
                        <div className="h-full bg-pink-500" style={{ width: `${Math.min(100, contributionPct)}% ` }} />
                      </div>
                    </>
                  );
                })()}
              </div>
            </PremiumCard>
          </div >

          {/* ✅ Eficiencia Operativa — 5 nuevos KPIs */}
          <SectionTitle>Eficiencia Operativa</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">

            {/* 1) HL / Ruta Activa */}
            <PremiumCard className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <BarChart3 className="w-24 h-24 text-yellow-500" />
              </div>
              <div className="relative z-10">
                <div className="text-[10px] text-white/60 font-bold uppercase tracking-wider mb-1">HL / Ruta Activa</div>
                <div className="text-2xl font-bold text-yellow-400 mb-1">
                  {hlPerActiveRoute > 0 ? hlPerActiveRoute.toLocaleString("es-MX", { maximumFractionDigits: 1 }) : "—"}
                </div>
                <div className="text-[10px] text-white/40">
                  {activeRouteCount} ruta{activeRouteCount !== 1 ? "s" : ""} activa{activeRouteCount !== 1 ? "s" : ""}
                </div>
              </div>
              <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10">
                <div className="h-full bg-yellow-500" style={{ width: "100%" }} />
              </div>
            </PremiumCard>

            {/* 2) HL / Cliente — Ticket Promedio */}
            <PremiumCard className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Store className="w-24 h-24 text-sky-500" />
              </div>
              <div className="relative z-10">
                <div className="text-[10px] text-white/60 font-bold uppercase tracking-wider mb-1">HL / Cliente</div>
                <div className="text-2xl font-bold text-sky-400 mb-1">
                  {hlPerClient > 0 ? hlPerClient.toLocaleString("es-MX", { maximumFractionDigits: 2 }) : "—"}
                </div>
                <div className="text-[10px] text-white/40">Ticket promedio con compra</div>
              </div>
              <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10">
                <div className="h-full bg-sky-500" style={{ width: `${Math.min(100, hlPerClient * 10)}%` }} />
              </div>
            </PremiumCard>

            {/* 3) Clientes con Compra / Día Hábil */}
            <PremiumCard className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Users className="w-24 h-24 text-teal-500" />
              </div>
              <div className="relative z-10">
                <div className="text-[10px] text-white/60 font-bold uppercase tracking-wider mb-1">Clientes / Día</div>
                <div className="text-2xl font-bold text-teal-400 mb-1">
                  {avgClientsWithPurchasePerDay > 0
                    ? avgClientsWithPurchasePerDay.toLocaleString("es-MX", { maximumFractionDigits: 1 })
                    : "—"}
                </div>
                <div className="text-[10px] text-white/40">
                  Prom. con compra por día hábil
                </div>
              </div>
              <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10">
                <div className="h-full bg-teal-500" style={{ width: `${Math.min(100, avgClientsWithPurchasePerDay * 5)}%` }} />
              </div>
            </PremiumCard>

            {/* 4) Rutas sin Venta — alerta */}
            <PremiumCard className={`p-4 relative overflow-hidden group border-0 ${
              routesWithNoSales.length > 0 ? "bg-red-950/60" : "bg-[#2a2c44]"
            }`}>
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <AlertCircle className={`w-24 h-24 ${routesWithNoSales.length > 0 ? "text-red-400" : "text-emerald-500"}`} />
              </div>
              <div className="relative z-10">
                <div className="text-[10px] text-white/60 font-bold uppercase tracking-wider mb-1">Rutas sin Venta</div>
                <div className={`text-2xl font-bold mb-1 ${
                  routesWithNoSales.length > 0 ? "text-red-400" : "text-emerald-400"
                }`}>
                  {routesWithNoSales.length}
                  <span className="text-sm text-white/30 ml-2">/ {(scopeRoutes.length > 0 ? scopeRoutes : allowedRoutes).length || routeTotals.length}</span>
                </div>
                <div className="text-[10px] text-white/50 truncate">
                  {routesWithNoSales.length === 0
                    ? "✓ Todas activas"
                    : routesWithNoSales.slice(0, 2).join(", ") + (routesWithNoSales.length > 2 ? ` +${routesWithNoSales.length - 2}` : "")}
                </div>
              </div>
              <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10">
                <div className={`h-full ${
                  routesWithNoSales.length > 0 ? "bg-red-500" : "bg-emerald-500"
                }`} style={{ width: "100%" }} />
              </div>
            </PremiumCard>

            {/* 5) Concentración Top 5 Clientes */}
            <PremiumCard className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <TrendingUp className="w-24 h-24 text-orange-500" />
              </div>
              <div className="relative z-10">
                <div className="text-[10px] text-white/60 font-bold uppercase tracking-wider mb-1">Concentración</div>
                <div className="text-2xl font-bold text-white mb-1">
                  {top5Concentration > 0 ? `${top5Concentration.toFixed(1)}%` : "—"}
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-white/40">Top 5 clientes</span>
                  {top5Concentration > 0 && (
                    <span className={`px-1.5 py-0.5 rounded font-bold ${
                      top5Concentration > 60
                        ? "bg-orange-500/20 text-orange-300"
                        : "bg-emerald-500/20 text-emerald-300"
                    }`}>
                      {top5Concentration > 60 ? "⚠ Alta" : "✓ OK"}
                    </span>
                  )}
                </div>
              </div>
              <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10">
                <div className="h-full bg-orange-500" style={{ width: `${Math.min(100, top5Concentration)}%` }} />
              </div>
            </PremiumCard>
          </div>

          {/* Grid de Secciones: Agrupada + Top 10 + GEC */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            
            {/* 1) Venta por Canal (Agrupada) - Ocupa 2 columnas */}
            <Card className="bg-[#2a2c44] border-0 shadow-lg overflow-hidden relative group lg:col-span-2">
<div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                <BarChart3 size={120} className="text-white" />
              </div>
              <CardHeader className="pb-1 relative z-10">
                <CardTitle className="text-white text-sm flex items-center justify-between">
                  <span>Venta por Cadena</span>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/40" />
                      <input
                        type="text"
                        placeholder="Buscar..."
                        value={mainGroupedSearch}
                        onChange={(e) => setMainGroupedSearch(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg py-1 pl-7 pr-2 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 w-24"
                      />
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 relative z-10">
                <div className="space-y-2 mt-2">
                  {filteredGroupedStats.map((row, idx) => (
                    <motion.div
                      key={row.canal}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="group/item cursor-pointer"
                      onClick={() => setSelectedChannel(row.canal)}
                    >
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-white/5 to-white/0 hover:from-emerald-500/10 hover:to-white/5 transition-all duration-300 border border-white/5">
                        <div className="w-12 h-12 bg-white rounded-xl p-2 shrink-0">
                          <img src={row.img} alt={row.canal} className="w-full h-full object-contain" 
                               onError={(e) => { e.target.onerror = null; e.target.src = "/brands/default.png"; }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-xs mb-1.5">
                            <span className="text-white font-bold truncate">{row.canal}</span>
                            <span className="text-emerald-400 font-bold">{row.pct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-black/20 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${row.pct}%` }}
                              className="h-full bg-emerald-500" 
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* 2) Panel Top 10 dinámico - Ocupa 1 columna */}
            <Card className="bg-[#2a2c44] border-0 shadow-lg overflow-hidden relative group lg:col-span-1">
              <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                <Trophy size={120} className="text-white" />
              </div>
              <CardHeader className="pb-1 relative z-10">
                <CardTitle className="text-white text-sm">
                  {selectedZona === "__ALL__" && selectedRoute === "__ALL__"
                    ? "Top 10 zonas (avance %)"
                    : (selectedRoute === "__ALL__" ? "Top 10 rutas de la zona (avance %)" : "Top 10 clientes (por HL)")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {selectedZona === "__ALL__" && selectedRoute === "__ALL__" && (
                  <div className="space-y-2">
                    {zonesProgressTop.map(z => (
                      <button key={z.zone} onClick={() => { setSelectedZona(z.zone); setSelectedRoute("__ALL__"); }}
                        className="w-full text-left bg-white/5 hover:bg-white/10 rounded-lg p-3 transition flex items-center gap-3 border border-white/5">
                        <div className="flex-1">
                          <div className="flex justify-between text-white/80 text-[13px] mb-1">
                            <span className="font-semibold">{z.zone}</span>
                            <span className="tabular-nums font-bold text-green-400">{z.pct}%</span>
                          </div>
                          <div className="w-full bg-white/10 rounded-full h-1.5">
                            <div className="bg-green-400 h-full rounded-full" style={{ width: `${Math.min(100, z.pct)}%` }} />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {selectedZona !== "__ALL__" && selectedRoute === "__ALL__" && (
                  <div className="space-y-2">
                    {routesProgressTop.map(r => (
                      <button key={r.route} onClick={() => setSelectedRoute(r.route)}
                        className="w-full text-left bg-white/5 hover:bg-white/10 rounded-lg p-3 transition flex items-center gap-3 border border-white/5">
                        <div className="flex-1">
                          <div className="flex justify-between text-white/80 text-[13px] mb-1">
                            <span className="font-semibold">{r.route}</span>
                            <span className="tabular-nums font-bold text-green-400">{r.pct}%</span>
                          </div>
                          <div className="w-full bg-white/10 rounded-full h-1.5">
                            <div className="bg-green-400 h-full rounded-full" style={{ width: `${Math.min(100, r.pct)}%` }} />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {selectedRoute !== "__ALL__" && (
                  <div className="space-y-2">
                    {topClients.map(c => (
                      <button key={c.code} onClick={() => openSalesDialog({ code: c.code, name: c.name })}
                        className="w-full text-left bg-white/5 hover:bg-white/10 rounded-lg p-3 border border-white/5 transition flex justify-between items-center">
                        <div className="min-w-0">
                          <div className="font-semibold text-white/80 text-[13px] truncate">{c.name}</div>
                          <div className="text-[10px] text-white/40 uppercase tracking-wider">Código: {c.code}</div>
                        </div>
                        <div className="tabular-nums font-bold text-emerald-400 text-sm">{c.total.toLocaleString("es-MX")} <span className="text-[10px] font-normal text-white/40">HL</span></div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 3) Venta por GEC - Ocupa 3 columnas (Ancho completo abajo) */}
            <Card className="bg-[#2a2c44] border-0 shadow-lg overflow-hidden relative group lg:col-span-3">
              <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                <Store size={120} className="text-white" />
              </div>
              <CardHeader className="pb-1 relative z-10">
                <CardTitle className="text-white text-sm flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-emerald-400" />
                    <span>Venta por Cadena (Detallado)</span>
                    <span className="text-[10px] text-white/40 font-normal uppercase tracking-widest ml-2">Distribución por Cadena</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/40" />
                      <input
                        type="text"
                        placeholder="Buscar..."
                        value={mainChannelSearch}
                        onChange={(e) => setMainChannelSearch(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg py-1 pl-7 pr-2 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 w-32"
                      />
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                  {filteredGecStats.map((row, idx) => (
                    <motion.div
                      key={row.canal}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="group/gec cursor-pointer"
                      onClick={() => setSelectedChannel(row.canal)}
                    >
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-emerald-500/10 transition-all border border-white/5 hover:border-emerald-500/30">
                        <div className="w-10 h-10 bg-white rounded-lg p-1.5 shrink-0 shadow-md">
                          <img src={row.img} alt={row.canal} className="w-full h-full object-contain" 
                               onError={(e) => { e.target.onerror = null; e.target.src = "/brands/default.png"; }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-1">
                            <span className="text-white font-bold text-xs truncate">{row.canal}</span>
                            <div className="text-right">
                              <span className="text-white font-bold text-xs">{row.totalHL.toLocaleString("es-MX", { maximumFractionDigits: 1 })}</span>
                              <span className="text-[10px] text-white/40 ml-1">HL</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 bg-black/20 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500" style={{ width: `${row.pct}%` }} />
                            </div>
                            <span className="text-[10px] font-bold text-emerald-400">{row.pct}%</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
                {filteredGecStats.length === 0 && (
                  <div className="text-white/50 text-sm py-12 text-center">No se encontraron resultados para "{mainChannelSearch}"</div>
                )}
              </CardContent>
            </Card>
          </div>

          <Dialog open={clientsModalOpen} onOpenChange={(open) => { if (!open) setClientsModalOpen(false); }}>
            <DialogContent
              description="Detalle de clientes segmentados por compra"
              className="bg-[#1f2031] text-white border border-white/20 w-[min(95vw,900px)] max-w-4xl"
            >
              <DialogHeader className="space-y-1">
                <DialogTitle className="text-white text-xl font-semibold">
                  {clientsModalView === "with" ? "Clientes con compra" : "Clientes sin compra"}
                </DialogTitle>
                <DialogDescription className="text-white/70 text-sm">
                  Vista: {scopeLabelText} · {periodLabel}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setClientsModalView("with")}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${clientsModalView === "with" ? "bg-green-400/20 text-white border border-green-300/50" : "bg-white/10 text-white/70 border border-white/10"}`}
                  >
                    Con compra ({clientsWithPurchase})
                  </button>
                  <button
                    type="button"
                    onClick={() => setClientsModalView("without")}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${clientsModalView === "without" ? "bg-amber-400/20 text-white border border-amber-200/50" : "bg-white/10 text-white/70 border border-white/10"}`}
                  >
                    Sin compra ({clientsWithoutPurchase})
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadClientsList}
                  className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300"
                >
                  Descargar CSV
                </button>
              </div>
              <div className="rounded-xl border border-white/10 overflow-hidden bg-white/5">
                {clientsModalData.length === 0 ? (
                  <div className="p-6 text-sm text-white/70">No hay clientes para mostrar con el filtro seleccionado.</div>
                ) : (
                  <>
                    {/* PC View: Table */}
                    <div className="hidden md:block max-h-[60vh] overflow-auto">
                      <table className="min-w-full text-xs text-white/80">
                        <thead className="bg-white/5 text-[11px] uppercase tracking-wide text-white/60 sticky top-0 backdrop-blur-sm z-10">
                          <tr>
                            <th className="px-3 py-2 text-left">#</th>
                            <th className="px-3 py-2 text-left">Cliente</th>
                            <th className="px-3 py-2 text-left">Código</th>
                            <th className="px-3 py-2 text-left">Zona</th>
                            <th className="px-3 py-2 text-left">Ruta</th>
                            <th className="px-3 py-2 text-right">HL periodo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientsModalData.map((client, idx) => (
                            <tr key={client.code} className={`border-b border-white/5 ${idx % 2 === 0 ? "bg-transparent" : "bg-white/5"}`}>
                              <td className="px-3 py-2 text-left text-white/60">{idx + 1}</td>
                              <td className="px-3 py-2 font-semibold text-white">{client.name}</td>
                              <td className="px-3 py-2 text-white/70">{client.code}</td>
                              <td className="px-3 py-2 text-white/70">{client.zona}</td>
                              <td className="px-3 py-2 text-white/70">{client.route}</td>
                              <td className="px-3 py-2 text-right text-white">
                                {client.totalHL.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile View: Cards */}
                    <div className="md:hidden max-h-[60vh] overflow-auto p-4 space-y-3">
                      {clientsModalData.map((client, idx) => (
                        <div key={client.code} className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-bold text-white text-sm">{client.name}</div>
                              <div className="text-xs text-white/60">Posición #{idx + 1}</div>
                            </div>
                            <div className="text-right">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${clientsModalView === "with" ? "bg-green-500/20 text-green-300" : "bg-amber-500/20 text-amber-300"}`}>
                                {client.totalHL.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} HL
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs text-white/70 border-t border-white/5 pt-2 mt-2">
                            <div>
                              <span className="block text-white/40 uppercase text-[9px]">Código</span>
                              {client.code}
                            </div>
                            <div className="text-right">
                              <span className="block text-white/40 uppercase text-[9px]">Ruta</span>
                              {client.route}
                            </div>
                            <div>
                              <span className="block text-white/40 uppercase text-[9px]">Zona</span>
                              {client.zona}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-white/10 px-3 py-2 text-right text-xs text-white/60">
                      Total registros: {clientsModalData.length}
                    </div>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={!!selectedChannel} onOpenChange={(open) => { if (!open) setSelectedChannel(null); }}>
            <DialogContent
              description={`Detalle de clientes para el canal ${selectedChannel}`}
              className="bg-[#1f2031] text-white border border-white/20 w-[min(95vw,900px)] max-w-4xl"
            >
              <DialogHeader className="space-y-1">
                <DialogTitle className="text-white text-xl font-semibold flex items-center justify-between pr-8">
                  <span>Detalle Canal: {selectedChannel}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadChannelCSV}
                    className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 text-xs gap-2"
                  >
                    <Download size={14} />
                    Exportar Canal
                  </Button>
                </DialogTitle>
                <DialogDescription className="text-white/70 text-sm">
                  {scopeLabelText} · {periodLabel}
                </DialogDescription>
              </DialogHeader>

              <div className="pt-2 pb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="text"
                    placeholder="Buscar cliente por nombre o código..."
                    value={channelSearch}
                    onChange={(e) => setChannelSearch(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-white/10 overflow-hidden bg-white/5">
                {channelClientsDetails.length === 0 ? (
                  <div className="p-6 text-sm text-white/70 text-center">No se encontraron clientes para este canal.</div>
                ) : (
                  <>
                    <div className="max-h-[60vh] overflow-auto">
                      <table className="min-w-full text-xs text-white/80">
                        <thead className="bg-white/5 text-[11px] uppercase tracking-wide text-white/60 sticky top-0 backdrop-blur-sm z-10">
                          <tr>
                            <th className="px-3 py-2 text-left">#</th>
                            <th className="px-3 py-2 text-left">Cliente</th>
                            <th className="px-3 py-2 text-left">Código</th>
                            <th className="px-3 py-2 text-left">Zona</th>
                            <th className="px-3 py-2 text-right">HL</th>
                            <th className="px-3 py-2 text-right">Participación</th>
                          </tr>
                        </thead>
                        <tbody>
                          {channelClientsDetails.map((client, idx) => (
                            <tr
                              key={client.code}
                              className={`border-b border-white/5 hover:bg-white/10 cursor-pointer transition-colors ${idx % 2 === 0 ? "bg-transparent" : "bg-white/5"}`}
                              onClick={() => {
                                openSalesDialog({ code: client.code, name: client.name });
                                // Opcional: Cerrar modal de canal si se quiere, o dejarlo abierto detras.
                                // Yo lo dejo abierto por si el usuario quiere revisar varios clientes.
                              }}
                            >
                              <td className="px-3 py-2 text-left text-white/60">{idx + 1}</td>
                              <td className="px-3 py-2 font-semibold text-white">{client.name}</td>
                              <td className="px-3 py-2 text-white/70">{client.code}</td>
                              <td className="px-3 py-2 text-white/70">{client.zona}</td>
                              <td className="px-3 py-2 text-right text-white font-medium">
                                {client.totalHL.toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <div className="flex flex-col items-end">
                                  <span className="text-emerald-400 font-bold">{client.pct.toFixed(1)}%</span>
                                  <div className="w-16 h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
                                    <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, client.pct)}%` }} />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="border-t border-white/10 px-3 py-2 text-right text-xs text-white/60">
                      Total registros: {channelClientsDetails.length}
                    </div>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {salesClient && (
            <React.Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 text-white">Cargando diálogo...</div>}>
              <SalesDialog client={salesClient} onClose={() => setSalesClient(null)} />
            </React.Suspense>
          )}

          <SkuEquivalenciasDialog
            open={isEquivalenciasOpen}
            onOpenChange={setIsEquivalenciasOpen}
            onSaved={(updatedMap) => {
              setSkuEquivalenciasMap(updatedMap);
            }}
          />
        </main>
      </div>
    </>
  );
}
