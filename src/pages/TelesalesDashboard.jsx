import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DonutProgress from "@/components/DonutProgress";
import InteractiveMap from "@/components/common/InteractiveMap";
import { supabase } from "@/supabaseClient";
import SyncButton from "@/components/SyncButton";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { kvStorage } from "@/services/kvStorage";
import { getSalesBySku } from "@/repositories/salesRepository";
import { getClients } from "@/repositories/clientsRepository";
import { getGoals } from '@/repositories/goalsRepository';
import ComparativeSalesChart from "@/components/ComparativeSalesChart";
import { getSkuImages, getSkuDescriptions } from "@/repositories/metadataRepository";
import {
  Store,
  TrendingUp,
  Users,
  Calendar,
  Map as MapIcon,
  BarChart3,
  Search,
  Filter,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  ShoppingCart,
  Percent,
  Target,
  ChevronDown,
  ClipboardList,
} from "lucide-react";

// --- Components Helpers ---
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

// --- Logic Helpers ---
const strip = (s) => (s || "").toString().trim();
// Robust normalization to match SKUs (e.g. "0783" == "783")
const norm = (s) => {
  let str = strip(s).toUpperCase();
  if (/^\d+$/.test(str)) {
    str = String(Number(str));
  }
  return str;
};
const endOfMonthISO = (year, month) => {
  const d = new Date(year, month, 0);
  return d.toISOString().slice(0, 10);
};
const normalizeRoute = (r) => (r || "").toString().trim().toUpperCase().replace(/[^0-9A-Z]/g, "");

// Helper for strict route matching (Handle "06" == "6")
const isRouteMatch = (dataRoute, targetRoute) => {
  const r = normalizeRoute(dataRoute);
  const t = normalizeRoute(targetRoute);

  // Direct match
  if (r === t) return true;

  // Numeric match (ignore leading zeros)
  const nR = parseInt(r, 10);
  const nT = parseInt(t, 10);
  if (!isNaN(nR) && !isNaN(nT) && nR === nT) return true;

  return false;
}

export default function TelesalesDashboard() {
  // ... existing code ...
  const { user } = useSupabaseAuth();
  const [userName, setUserName] = useState("Usuario");
  const [salesRoute, setSalesRoute] = useState("");
  const [allowedRoutes, setAllowedRoutes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Date Filter State (Supervisor Style)
  const [dateFilter, setDateFilter] = useState({
    year: String(new Date().getFullYear()),
    month: String(new Date().getMonth() + 1),
    day: "__ALL__",
  });

  // Data States
  const [clients, setClients] = useState([]);
  const [totalSalesHL, setTotalSalesHL] = useState(0);
  const [skuShare, setSkuShare] = useState([]);
  const [routeMeta, setRouteMeta] = useState(0);
  const [comparativeData, setComparativeData] = useState({ data: [], xAxisKey: "month" });

  const [skuImagesMap, setSkuImagesMap] = useState({});
  const [skuDescMap, setSkuDescMap] = useState({});

  // Calls Data States
  const [callsStats, setCallsStats] = useState({
    todayTotal: 0,
    todayAnswered: 0,
    todayUnanswered: 0,
    monthTotal: 0,
    monthAnswered: 0,
    buyingCallsCount: 0,
    avgPurchase: 0, // Cajas promedio
    avgDailyCalls: 0,
    elapsedBusiness: 0,
  });

  // Calculate Period Range based on Date Filter
  const periodRange = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      .toISOString()
      .slice(0, 10);

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
      // Calculate next month for API filters
      const d = new Date(Number(year), Number(month), 1);
      nextFrom = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    } else {
      const dStr = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      from = dStr;
      to = dStr;
      const d = new Date(dStr);
      d.setDate(d.getDate() + 1);
      nextFrom = d.toISOString().slice(0, 10);
    }

    return {
      from,
      to,
      nextFrom,
      today,
      isYear,
      isMonth,
      isDay
    };
  }, [dateFilter]);

  // --- Effects ---

  // 1. User & Routes
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cached = await kvStorage.getItem("telesales_allowed_routes");
        if (cached) setAllowedRoutes(cached);
      } catch (e) { }

      if (!user) return;
      setUserName(user.user_metadata?.full_name || user.email || "Usuario");

      try {
        const { data: routes } = await supabase
          .from("supervisor_allowed_sales_routes")
          .select("sales_route")
          .eq("supervisor_id", user.id);

        const list = (routes || [])
          .map((r) => (r.sales_route || "").toString().trim())
          .filter(Boolean);

        if (!active) return;
        if (list.length > 0) {
          setAllowedRoutes(list);
          try { await kvStorage.setItem("telesales_allowed_routes", list); } catch (e) { }
        }

        // Restore selected route or default
        let saved = null;
        try { saved = await kvStorage.getItem("advisor.salesRoute"); } catch (e) { }
        setSalesRoute(saved && list.includes(saved) ? saved : list[0] || "");

        // Fallback: If no supervisor routes, try user metadata
        if (list.length === 0 && !salesRoute) {
          const metaRoute = user.user_metadata?.route || user.user_metadata?.ruta;
          if (metaRoute) {
            setAllowedRoutes([metaRoute]);
            setSalesRoute(metaRoute);
          }
        }

      } catch (e) {
        console.warn("Error loading allowed routes", e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (salesRoute) {
      kvStorage.setItem("advisor.salesRoute", salesRoute).catch(() => { });
    }
  }, [salesRoute]);

  // 2. Fetch SKU Metadata (Directly from Supabase like SupervisorDashboard)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: d1 } = await supabase.from("sku_descripcion").select("cve_marca, descripcion");
        if (!active) return;

        const m1 = {};
        const m2 = {};

        for (const r of d1 || []) {
          if (r.cve_marca) {
            const k = norm(r.cve_marca);
            m1[k] = r.descripcion || r.cve_marca;
            m2[k] = `https://cervezasfinas.com/portafolio/${k}.png`;
          }
        }

        setSkuDescMap(m1);
        setSkuImagesMap(m2);
      } catch (e) {
        console.error("Error fetching metadata", e);
      }
    })();
    return () => { active = false; };
  }, []); // Run once on mount

  // 3. Main Data Fetch (Sales, Comparative, Meta)
  useEffect(() => {
    if (!salesRoute) return;
    let active = true;
    (async () => {
      const { from, to, nextFrom, isYear, isMonth } = periodRange;

      try {
        // A. Current Period Sales
        const rowsRaw = await getSalesBySku({
          salesRoute,
          from,
          to,
          nextFrom,
        });

        // Client-side filtering fallback (in case backend ignores route param)
        // Strict Match: "101" !== "1010"
        const rows = rowsRaw.filter(r => isRouteMatch(r.sales_route || r.ruta, salesRoute));

        if (!active) return;

        // Calc Total HL
        const total = rows.reduce((acc, row) => acc + (Number(row.htls_total) || 0), 0);
        setTotalSalesHL(total);

        // Calc SKU Share
        const skuMap = new Map();
        rows.forEach(r => {
          const s = strip(r.cve_marca);
          if (s) skuMap.set(s, (skuMap.get(s) || 0) + (Number(r.htls_total) || 0));
        });
        const shares = Array.from(skuMap.entries()).map(([sku, val]) => ({
          sku,
          desc: skuDescMap[norm(sku)] || sku,
          total: val,
          pct: total > 0 ? Math.round((val / total) * 100) : 0,
          img: skuImagesMap[norm(sku)] || "/brands/default.png"
        })).sort((a, b) => b.total - a.total);
        setSkuShare(shares);

        // B. Meta (Goal)
        const goalsRaw = await getGoals({ salesRoute, from, to, nextFrom });
        const goals = goalsRaw.filter(g => isRouteMatch(g.sales_route, salesRoute));
        let m = 0;
        if (Array.isArray(goals) && goals.length) {
          const latest = goals.reduce((a, b) => (new Date(a.period_date) > new Date(b.period_date) ? a : b));
          m = Number(latest.meta) || 0;
        }
        setRouteMeta(m);

        // C. Comparative Data (Chart)
        // Ensure we fetch prev year matches
        const { year, month } = dateFilter;
        const currYear = Number(year);
        const prevYear = currYear - 1;
        let startCurr, endCurr, startPrev, endPrev, xAxisKey = "month";

        if (isYear) {
          startCurr = `${currYear}-01-01`;
          // Use nextFrom logic for proper exclusive upper bound
          endCurr = `${currYear + 1}-01-01`;

          startPrev = `${prevYear}-01-01`;
          endPrev = `${prevYear + 1}-01-01`;
          xAxisKey = "month";
        } else {
          const mm = month.padStart(2, "0");
          startCurr = `${currYear}-${mm}-01`;
          // Calculate next month first day
          const dC = new Date(currYear, Number(month), 1);
          endCurr = `${dC.getFullYear()}-${String(dC.getMonth() + 1).padStart(2, "0")}-01`;

          startPrev = `${prevYear}-${mm}-01`;
          const dP = new Date(prevYear, Number(month), 1);
          endPrev = `${dP.getFullYear()}-${String(dP.getMonth() + 1).padStart(2, "0")}-01`;
          xAxisKey = "day";
        }

        const [rowsCurrCompRaw, rowsPrevCompRaw] = await Promise.all([
          getSalesBySku({ salesRoute, from: startCurr, nextFrom: endCurr }),
          getSalesBySku({ salesRoute, from: startPrev, nextFrom: endPrev })
        ]);

        // Client-side filtering fallback for comparative data
        const filterRows = (toFilter) => toFilter.filter(r => isRouteMatch(r.sales_route || r.ruta, salesRoute));

        const rowsCurrComp = filterRows(rowsCurrCompRaw);
        const rowsPrevComp = filterRows(rowsPrevCompRaw);

        // Process Chart Data
        let chartData = [];
        if (xAxisKey === "month") {
          const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
          const aggC = new Array(12).fill(0);
          const aggP = new Array(12).fill(0);
          const fill = (rs, agg) => rs.forEach(r => {
            const d = new Date(r.period_date || r.fecha);
            if (!isNaN(d)) agg[d.getMonth()] += (Number(r.htls_total) || 0);
          });
          fill(rowsCurrComp, aggC);
          fill(rowsPrevComp, aggP);

          let ac = 0, ap = 0;
          chartData = months.map((m, i) => {
            ac += aggC[i]; ap += aggP[i];
            const cleanAc = (currYear > new Date().getFullYear() || (currYear === new Date().getFullYear() && i > new Date().getMonth())) ? null : Number(ac.toFixed(2));
            return { month: m, current: cleanAc, previous: Number(ap.toFixed(2)) };
          });
        } else {
          // Day logic (Matched with SupervisorDashboard)
          const daysInMonth = new Date(currYear, Number(month), 0).getDate();
          const aggC = new Array(daysInMonth + 1).fill(0);
          const aggP = new Array(daysInMonth + 1).fill(0);

          const fill = (rs, agg) => rs.forEach(r => {
            // Use safer string parsing like Supervisor to avoid TZ issues
            // User suggests 'fecha_alta' might be the key one.
            const dateStr = String(r.fecha_alta || r.period_date || r.fecha || "").replace(/\//g, "-");
            const parts = dateStr.split("-");
            if (parts.length >= 3) {
              const day = parseInt(parts[2], 10);
              if (!isNaN(day) && day >= 1 && day < agg.length) {
                agg[day] += (Number(r.htls_total) || 0);
              }
            }
          });
          fill(rowsCurrComp, aggC);
          fill(rowsPrevComp, aggP);

          // Logic to cut off the line at the last actual sale or today
          let lastDayWithSales = 0;
          for (let d = 1; d <= daysInMonth; d++) {
            if (aggC[d] > 0) lastDayWithSales = d;
          }

          const now = new Date();
          const isCurrentMonth = (currYear === now.getFullYear() && Number(month) - 1 === now.getMonth());

          let ac = 0, ap = 0;
          for (let d = 1; d <= daysInMonth; d++) {
            ac += aggC[d]; ap += aggP[d];
            let valC = Number(ac.toFixed(2));

            // Supervisor Logic: Cutoff future AND trailing zeros (flatline)
            const isFutureDate = isCurrentMonth && d > now.getDate();
            const isTrailingZero = isCurrentMonth && d > lastDayWithSales && d <= now.getDate();

            if (isFutureDate || isTrailingZero) {
              valC = null;
            }
            chartData.push({ day: d, current: valC, previous: Number(ap.toFixed(2)) });
          }
        }
        setComparativeData({ data: chartData, xAxisKey });

      } catch (err) {
        console.error("Telesales Data Fetch Error:", err);
      }
    })();
    return () => { active = false; };
  }, [salesRoute, periodRange, dateFilter, skuImagesMap, skuDescMap]);


  // 4. Calls Data Fetching
  useEffect(() => {
    if (!salesRoute) return;
    let active = true;
    (async () => {
      try {
        const { from, to, today } = periodRange;
        const now = new Date(); // Local time reference

        // Helper to count Business Days L-S
        const countBusinessDays = (s, e) => {
          const start = new Date(s);
          const end = new Date(e);
          let counts = 0;
          let cur = new Date(start);
          while (cur <= end) {
            if (cur.getDay() !== 0) counts++;
            cur.setDate(cur.getDate() + 1);
          }
          return counts;
        };
        const elapsedBusiness = countBusinessDays(from, today < to ? today : to);

        // Fetch Calls
        // Note: For Calls, we use 'telesales_calls' table. 
        // We need to match 'route' or 'sales_route' column.

        // Determine column names dynamically if needed, or assume standard 'route'
        const routeCol = 'route';
        const timeCol = 'call_time';
        const ansCol = 'answered';
        const boxCol = 'boxes_sold';

        const todayStart = `${today}T00:00:00`;
        const todayEnd = `${today}T23:59:59`;

        const fetchAll = async (q) => {
          let all = []; let page = 0; const size = 1000;
          while (true) {
            const { data, error } = await q.range(page * size, (page + 1) * size - 1);
            if (error || !data.length) break;
            all = all.concat(data);
            if (data.length < size) break;
            page++;
          }
          return all;
        };

        // Today's Calls
        const todayRows = await fetchAll(
          supabase.from('telesales_calls')
            .select('*')
            .eq(routeCol, salesRoute)
            .gte(timeCol, todayStart)
            .lte(timeCol, todayEnd)
        );

        // Period Calls
        const monthRows = await fetchAll(
          supabase.from('telesales_calls')
            .select('*')
            .eq(routeCol, salesRoute)
            .gte(timeCol, `${from}T00:00:00`)
            .lte(timeCol, `${to}T23:59:59`)
        );

        if (!active) return;

        const tTotal = todayRows.length;
        const tAns = todayRows.filter(r => r[ansCol]).length;
        const tUnans = tTotal - tAns;

        const mTotal = monthRows.length;
        const mAns = monthRows.filter(r => r[ansCol]).length;
        // Calc Avg Boxes Per Successful Call
        const buyingCalls = monthRows.filter(r => Number(r[boxCol]) > 0);
        const totalBoxes = buyingCalls.reduce((sum, r) => sum + Number(r[boxCol]), 0);
        const avgPurchase = buyingCalls.length ? (totalBoxes / buyingCalls.length) : 0;

        const avgDaily = elapsedBusiness > 0 ? (mTotal / elapsedBusiness) : 0;

        setCallsStats({
          todayTotal: tTotal,
          todayAnswered: tAns,
          todayUnanswered: tUnans,
          monthTotal: mTotal,
          monthAnswered: mAns,
          buyingCallsCount: buyingCalls.length,
          avgPurchase,
          avgDailyCalls: avgDaily,
          elapsedBusiness
        });

      } catch (err) {
        console.error("Telesales Calls Error:", err);
      }
    })();
    return () => { active = false; };
  }, [salesRoute, periodRange]);

  // --- Derived Calculations ---

  const pctMeta = routeMeta > 0 ? Math.round((totalSalesHL / routeMeta) * 100) : 0;
  const conversionRate = callsStats.monthAnswered > 0 ? (callsStats.buyingCallsCount / callsStats.monthAnswered) * 100 : 0;
  const callsNoPurchase = callsStats.monthAnswered - callsStats.buyingCallsCount;
  const avgHLPerPurchase = callsStats.buyingCallsCount > 0 ? (totalSalesHL / callsStats.buyingCallsCount) : 0;
  const avgClientsWithPurchasePerDay = callsStats.elapsedBusiness > 0 ? (callsStats.buyingCallsCount / callsStats.elapsedBusiness) : 0;

  // Render
  return (
    <div className="min-h-screen bg-[#1f2031] pb-12 text-slate-100">
      <Helmet>
        <title>Dashboard Televenta | Cervezas Finas</title>
      </Helmet>

      {/* --- HEADER --- */}
      <header className="border-b border-white/5 bg-[#1f2031]/80 backdrop-blur-md px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
              Reporte de Ruta
            </h1>
            <p className="text-sm text-slate-400">
              Analítica de Televenta · {userName}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/televenta/work-orders"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/10 transition-all"
            >
              <ClipboardList size={14} />
              Órdenes de Equipo
            </Link>
            <Link
              to="/televenta/tercerizados"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-500/20 bg-blue-500/5 text-xs font-bold text-blue-400 hover:bg-blue-500/10 transition-all"
            >
              <Users size={14} />
              Tercerizados
            </Link>
            <SyncButton variant="outline" size="sm" showLabel={true} />

            {/* Route Selector */}
            {allowedRoutes.length > 0 && (
              <Select value={salesRoute} onValueChange={setSalesRoute}>
                <SelectTrigger className="w-[160px] border-white/10 bg-white/5 text-white">
                  <SelectValue placeholder="Ruta" />
                </SelectTrigger>
                <SelectContent>
                  {allowedRoutes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {/* Date Filters */}
            <Select
              value={dateFilter.year}
              onValueChange={(v) => setDateFilter((prev) => ({ ...prev, year: v }))}
            >
              <SelectTrigger className="w-[100px] border-white/10 bg-white/5 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select
              value={dateFilter.month}
              onValueChange={(v) => setDateFilter((prev) => ({ ...prev, month: v, day: "__ALL__" }))}
            >
              <SelectTrigger className="w-[140px] border-white/10 bg-white/5 text-white">
                <SelectValue placeholder="Mes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">Todo el Año</SelectItem>
                {["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"].map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {dateFilter.month !== "__ALL__" && (
              <Select
                value={dateFilter.day}
                onValueChange={(v) => setDateFilter((prev) => ({ ...prev, day: v }))}
              >
                <SelectTrigger className="w-[80px] border-white/10 bg-white/5 text-white">
                  <SelectValue placeholder="Día" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">Todos</SelectItem>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

          </div>
        </div>
      </header>

      <main className="px-4 py-8 sm:px-6 lg:px-8 space-y-8 max-w-7xl mx-auto">

        {/* 1. KPIS ROW - CALLS stats */}
        <section>
          <SectionTitle>Actividad del Día</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <PremiumCard className="bg-emerald-500/10 border-emerald-500/20">
              <CardContent className="p-4 flex flex-col items-center justify-center">
                <Phone className="w-6 h-6 text-emerald-400 mb-2" />
                <div className="text-2xl font-bold text-white">{callsStats.todayTotal}</div>
                <div className="text-xs text-emerald-200 uppercase tracking-widest mt-1">Llamadas Hoy</div>
              </CardContent>
            </PremiumCard>

            <PremiumCard className="bg-blue-500/10 border-blue-500/20">
              <CardContent className="p-4 flex flex-col items-center justify-center">
                <PhoneIncoming className="w-6 h-6 text-blue-400 mb-2" />
                <div className="text-2xl font-bold text-white">{callsStats.todayAnswered}</div>
                <div className="text-xs text-blue-200 uppercase tracking-widest mt-1">Contestadas</div>
              </CardContent>
            </PremiumCard>

            <PremiumCard className="bg-rose-500/10 border-rose-500/20">
              <CardContent className="p-4 flex flex-col items-center justify-center">
                <PhoneMissed className="w-6 h-6 text-rose-400 mb-2" />
                <div className="text-2xl font-bold text-white">{callsStats.todayUnanswered}</div>
                <div className="text-xs text-rose-200 uppercase tracking-widest mt-1">No Contestadas</div>
              </CardContent>
            </PremiumCard>

            <PremiumCard className="bg-slate-800/50">
              <CardContent className="p-4 flex flex-col items-center justify-center">
                <BarChart3 className="w-6 h-6 text-orange-400 mb-2" />
                <div className="text-2xl font-bold text-white">{callsStats.avgDailyCalls.toFixed(0)}</div>
                <div className="text-xs text-slate-400 uppercase tracking-widest mt-1">Prom. Diario</div>
              </CardContent>
            </PremiumCard>

            <PremiumCard className="bg-slate-800/50 col-span-2 md:col-span-2 lg:col-span-2">
              <CardContent className="p-4 flex flex-row items-center justify-between h-full px-6">
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400 uppercase tracking-widest mb-1">Efectividad Compra</span>
                  <span className="text-2xl font-bold text-white">
                    {callsStats.avgPurchase.toFixed(1)} <span className="text-sm font-normal text-slate-500">cajas/pedido</span>
                  </span>
                </div>
                <ShoppingCart className="w-10 h-10 text-violet-400 opacity-80" />
              </CardContent>
            </PremiumCard>
          </div>
        </section>

        {/* NUEVA SECCIÓN: Eficiencia de Llamadas */}
        <section className="mt-8">
          <SectionTitle>Eficiencia de Llamadas (Periodo)</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Tasa de Conversión */}
            <PremiumCard className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
              <div className="absolute top-0 right-0 p-4 opacity-10"><Percent className="w-24 h-24 text-emerald-400" /></div>
              <div className="relative z-10">
                <div className="text-[10px] text-white/60 font-bold uppercase tracking-wider mb-1">TASA DE CONVERSIÓN</div>
                <div className="text-2xl font-bold text-emerald-400 mb-1">{conversionRate.toFixed(1)}%</div>
                <div className="text-[10px] text-white/40">Pedidos / Llamadas Contestadas</div>
              </div>
              <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10"><div className="h-full bg-emerald-400" style={{ width: `${Math.min(conversionRate, 100)}%` }} /></div>
            </PremiumCard>

            {/* KPI 2: Llamadas sin compra */}
            <PremiumCard className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
              <div className="absolute top-0 right-0 p-4 opacity-10"><PhoneMissed className="w-24 h-24 text-rose-400" /></div>
              <div className="relative z-10">
                <div className="text-[10px] text-white/60 font-bold uppercase tracking-wider mb-1">LLAMADAS SIN COMPRA</div>
                <div className="text-2xl font-bold text-rose-400 mb-1">{callsNoPurchase > 0 ? callsNoPurchase : 0}</div>
                <div className="text-[10px] text-white/40">Contestadas sin pedido</div>
              </div>
              <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10"><div className="h-full bg-rose-400" style={{ width: '100%' }} /></div>
            </PremiumCard>

            {/* KPI 3: Promedio HL / Llamada */}
            <PremiumCard className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
              <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingUp className="w-24 h-24 text-blue-400" /></div>
              <div className="relative z-10">
                <div className="text-[10px] text-white/60 font-bold uppercase tracking-wider mb-1">PROM. HL / COMPRA</div>
                <div className="text-2xl font-bold text-blue-400 mb-1">{avgHLPerPurchase.toFixed(2)} HL</div>
                <div className="text-[10px] text-white/40">Volumen por llamada con pedido</div>
              </div>
              <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10"><div className="h-full bg-blue-400" style={{ width: '100%' }} /></div>
            </PremiumCard>

            {/* KPI 4: Clientes con Compra al Día */}
            <PremiumCard className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
              <div className="absolute top-0 right-0 p-4 opacity-10"><Users className="w-24 h-24 text-violet-400" /></div>
              <div className="relative z-10">
                <div className="text-[10px] text-white/60 font-bold uppercase tracking-wider mb-1">CLIENTES EFECTIVOS / DÍA</div>
                <div className="text-2xl font-bold text-violet-400 mb-1">{avgClientsWithPurchasePerDay.toFixed(1)}</div>
                <div className="text-[10px] text-white/40">Compras promedio por día hábil</div>
              </div>
              <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10"><div className="h-full bg-violet-400" style={{ width: '100%' }} /></div>
            </PremiumCard>
          </div>
        </section>

        {/* 2. SALES CHARTS ROW */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* DONUT: Venta vs Meta */}
          <PremiumCard className="bg-[#2a2c44] flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-slate-300 flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-400" />
                Venta vs Meta
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col items-center justify-center py-6">
              <DonutProgress
                value={pctMeta > 100 ? 100 : pctMeta}
                text={`${pctMeta}%`}
                size={180}
                strokeWidth={12}
                color={pctMeta >= 100 ? "#10b981" : "#3b82f6"}
              />
              <div className="mt-6 w-full space-y-3 px-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Meta Periodo</span>
                  <span className="text-white font-medium">{routeMeta.toLocaleString()} HL</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Venta Actual</span>
                  <span className="text-emerald-400 font-bold">{totalSalesHL.toLocaleString()} HL</span>
                </div>
              </div>
            </CardContent>
          </PremiumCard>

          {/* COMPARATIVE CHART */}
          <div className="lg:col-span-2">
            <ComparativeSalesChart
              data={comparativeData.data || []}
              title="Tendencia de Ventas (Ruta)"
              xAxisKey={comparativeData.xAxisKey}
              currentYear={dateFilter.year}
              prevYear={String(Number(dateFilter.year) - 1)}
            />
          </div>
        </section>

        {/* 3. SKU PARTICIPATION */}
        <section>
          <SectionTitle className="text-lg">Participación por SKU</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {skuShare.slice(0, 12).map((item) => (
              <PremiumCard key={item.sku} className="bg-[#2a2c44]/80 hover:bg-[#2a2c44] transition-colors">
                <CardContent className="p-4 flex items-center gap-4">
                  <img
                    src={item.img}
                    alt={item.sku}
                    className="w-12 h-12 object-contain bg-white rounded-md p-1"
                    onError={(e) => { e.currentTarget.src = "/brands/default.png" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h4 className="font-bold text-white truncate text-sm" title={item.desc}>{item.desc}</h4>
                      <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{item.pct}%</span>
                    </div>
                    {item.sku !== item.desc && <div className="text-[10px] text-slate-500 truncate">{item.sku}</div>}
                    <div className="text-xs text-slate-400 mt-1">{item.total.toLocaleString()} HL</div>

                    <div className="w-full bg-slate-700/50 h-1.5 rounded-full mt-2 overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                </CardContent>
              </PremiumCard>
            ))}
            {skuShare.length === 0 && (
              <div className="col-span-full text-center py-12 text-slate-500 border border-dashed border-white/10 rounded-xl">
                Sin ventas registradas en este periodo
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
