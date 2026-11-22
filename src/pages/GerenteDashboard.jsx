// src/pages/GerenteDashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DonutProgress from "@/components/DonutProgress";
import InteractiveMap from "@/components/common/InteractiveMap";
import { supabase } from "@/supabaseClient";
import SyncButton from "@/components/SyncButton";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { getSalesBySku } from "@/repositories/salesRepository";
import { fetchAllClientsOnline, getClientByCode } from "@/repositories/clientsRepository";
import { getGoals } from "@/repositories/goalsRepository";
import { getSkuEquivalencias } from "@/repositories/metadataRepository";
import SalesDialog from "@/components/SalesDialog";
import DashboardSkeleton from "@/components/skeletons/DashboardSkeleton";
import { getProductImageUrl } from "@/lib/imageCatalog";
import { TrendingUp, Users, AlertTriangle, Route } from "lucide-react";
const ALL_ROUTES_VALUE = "__ALL__";

const strip = (value) => (value ?? "").toString().trim();
const isZeroLike = (s) => !s || s === "0" || s === "0.00";
const norm = (s) => strip(s).toUpperCase();
const routeKey = (r) => norm(r).replace(/[^A-Z0-9]/g, "");
const clientCodeKey = (c) => strip(c).replace(/^0+/, "");
const pickHL = (r) => Number(r.htls_total || r.hlts_total || 0);
const isYYYYMM = (s) => /^\d{4}-\d{2}$/.test(s);

export default function GerenteDashboard() {
  const { user } = useSupabaseAuth();
  const [userName, setUserName] = useState("Gerente");
  const [loading, setLoading] = useState(true);

  const [salesRoute, setSalesRoute] = useState(ALL_ROUTES_VALUE);
  const [allowedRoutes, setAllowedRoutes] = useState([]);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [now, setNow] = useState(new Date());

  /* =============== Helpers de Periodo =============== */
  const periodRange = useMemo(() => {
    const now = new Date();
    const isPicker = isYYYYMM(period);
    const [y, m] = (isPicker ? period : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`).split("-").map(Number);

    const from = isPicker
      ? `${y}-${String(m).padStart(2, "0")}-01`
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const nextFrom = isPicker
      ? (m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`)
      : null;

    const lastDay = new Date(y, m, 0).getDate();
    const to = isPicker
      ? `${y}-${String(m).padStart(2, "0")}-${lastDay}`
      : now.toISOString().slice(0, 10);

    // Días hábiles (L-S)
    const countBusiness = (startISO, endISO) => {
      if (!startISO || !endISO) return 0;
      const s = new Date(startISO);
      const e = new Date(endISO);
      if (e < s) return 0;
      let c = 0;
      const cur = new Date(s);
      while (cur <= e) {
        if (cur.getDay() !== 0) c++;
        cur.setDate(cur.getDate() + 1);
      }
      return c;
    };

    const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
    const monthEnd = `${y}-${String(m).padStart(2, "0")}-${lastDay}`;
    const totalBusiness = countBusiness(monthStart, monthEnd);
    const elapsedBusiness = countBusiness(monthStart, to);

    return { from, to, isPicker, nextFrom, elapsedBusiness, totalBusiness };
  }, [period]);

  const periodLabel = useMemo(() => {
    if (isYYYYMM(period)) {
      const [y, m] = period.split("-");
      const d = new Date(Number(y), Number(m) - 1, 1);
      return d.toLocaleString("es-ES", { month: "long", year: "numeric" });
    }
    return "mes actual";
  }, [period]);

  /* =============== User & Rutas =============== */
  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) return;
      if (user.profile?.name || user.user_metadata?.nombre || user.user_metadata?.name) {
        setUserName(user.profile?.name || user.user_metadata?.nombre || user.user_metadata?.name);
      }

      // Cargar rutas permitidas
      try {
        const { data } = await supabase.from("supervisor_allowed_sales_routes").select("sales_route").eq("supervisor_id", user.id);
        const list = (data || []).map(r => strip(r.sales_route)).filter(Boolean);
        if (active && list.length) {
          setAllowedRoutes(list);
        }
      } catch (e) {
        console.warn("Error loading routes", e);
      }
    })();
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const isAllSelected = (salesRoute === ALL_ROUTES_VALUE);
  const selectedKey = routeKey(salesRoute);
  const allowedKeys = useMemo(() => new Set(allowedRoutes.map(routeKey)), [allowedRoutes]);

  /* =============== Clientes =============== */
  const [clients, setClients] = useState([]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Cargar clientes (podría ser optimizado para cargar solo rutas permitidas, pero getClients carga todo o filtra por ruta)
        // Aquí cargamos todo y filtramos en memoria por allowedRoutes
        const data = await fetchAllClientsOnline();
        if (active) {
          const filtered = (data || []).filter(c => {
            const rk = routeKey(c.sales_route || "");
            return allowedKeys.has(rk);
          });
          setClients(filtered);
        }
      } catch (e) {
        console.error("Error loading clients", e);
      }
    })();
    return () => { active = false; };
  }, [allowedKeys]);

  const getClientCode = (c) => strip(c?.client_code || c?.code || c?.cve_cliente || c?.clave_cliente || c?.id || "");
  const clientsByCode = useMemo(() => {
    const map = new Map();
    for (const c of clients || []) { const code = getClientCode(c); if (code) map.set(code, c); }
    return map;
  }, [clients]);
  const clientsByKey = useMemo(() => {
    const map = new Map();
    for (const c of clients || []) { const code = getClientCode(c); if (code) map.set(clientCodeKey(code), c); }
    return map;
  }, [clients]);
  const toNum = (v) =>
    typeof v === "number" ? (Number.isFinite(v) ? v : null)
      : typeof v === "string" ? (Number.isFinite(+v) ? +v : null)
        : null;
  const clientsWithCoords = useMemo(() => {
    const out = [];
    for (const c of clients || []) {
      let lat = toNum(c.lat ?? c.latitude);
      let lng = toNum(c.lng ?? c.longitude);
      if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && typeof c.coords === "string") {
        try { const p = JSON.parse(c.coords); lat = toNum(p?.lat ?? p?.latitude); lng = toNum(p?.lng ?? p?.longitude); } catch (e) { }
      } else if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && c.coords && typeof c.coords === "object") {
        lat = toNum(c.coords.lat ?? c.coords.latitude);
        lng = toNum(c.coords.lng ?? c.coords.longitude);
      }
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        out.push({
          ...c,
          lat, lng,
          coords: { lat, lng },
          title: c.name ?? c.business_name ?? c.id ?? "Cliente",
          subtitle: strip(c.sales_route || c.ruta || c.internal_route || c.route || ""),
        });
      }
    }
    return out;
  }, [clients]);

  /* =============== Ruta derivada por fila =============== */
  const routeFromVpsRow = (r) => {
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

  /* =============== SKU desc + img + equivalencias =============== */
  const [skuDescMap, setSkuDescMap] = useState({});
  const [skuImgMap, setSkuImgMap] = useState({});
  const [skuEquivalenciasMap, setSkuEquivalenciasMap] = useState(new Map());
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [{ data: d1 }, eqMap] = await Promise.all([
          supabase.from("sku_descripcion").select("cve_marca, descripcion"),
          getSkuEquivalencias()
        ]);
        if (!active) return;

        const m1 = {};
        const m2 = {};

        for (const r of d1 || []) {
          if (r.cve_marca) {
            const k = norm(r.cve_marca);
            m1[k] = r.descripcion || r.cve_marca;
            m2[k] = getProductImageUrl(k);
          }
        }

        setSkuDescMap(m1);
        setSkuImgMap(m2);
        if (eqMap) setSkuEquivalenciasMap(eqMap);
      } catch (e) {
        if (active) {
          setSkuDescMap({});
          setSkuImgMap({});
          setSkuEquivalenciasMap(new Map());
        }
      }
    })();
    return () => { active = false; };
  }, []);

  /* =============== ÚNICA carga de ventas_por_sku =============== */
  const [vpsRows, setVpsRows] = useState([]);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!allowedRoutes.length) {
        if (active) {
          setVpsRows([]);
          setLoading(false);
        }
        return;
      }
      const { from, to, isPicker, nextFrom } = periodRange;
      try {
        // Usar repositorio de ventas (offline support)
        const rows = await getSalesBySku({
          from,
          to: isPicker ? undefined : to,
          nextFrom: isPicker ? nextFrom : undefined,
          // Para gerente cargamos todo lo del periodo y filtramos en memoria por allowedRoutes
          // Opcionalmente podríamos iterar por ruta si son pocas, pero getSalesBySku descarga todo si no se pasa ruta
        });

        const filtered = (rows || []).filter((r) => {
          const rv = routeFromVpsRow(r);
          if (!rv || isZeroLike(rv)) return false;
          const k = routeKey(rv);
          return allowedKeys.has(k);
        });

        if (active) {
          setVpsRows(filtered);
          setLoading(false);
        }
      } catch (err) {
        console.error("GerenteDashboard: error leyendo ventas_por_sku", err);
        if (active) {
          setVpsRows([]);
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [allowedRoutes, allowedKeys, periodRange, clientsByKey]);

  /* =============== Carga de ventas del Año Anterior =============== */
  const [vpsRowsPrevYear, setVpsRowsPrevYear] = useState([]);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!allowedRoutes.length) {
        if (active) setVpsRowsPrevYear([]);
        return;
      }
      const { from, to, isPicker } = periodRange;
      const dFrom = new Date(`${from}T00:00:00`);
      dFrom.setFullYear(dFrom.getFullYear() - 1);
      const prevFrom = dFrom.toISOString().slice(0, 10);

      let prevTo;
      let nextFrom;
      if (isPicker) {
        const dNext = new Date(dFrom);
        dNext.setMonth(dNext.getMonth() + 1);
        nextFrom = dNext.toISOString().slice(0, 10);
      } else {
        const dTo = new Date(`${to}T00:00:00`);
        dTo.setFullYear(dTo.getFullYear() - 1);
        prevTo = dTo.toISOString().slice(0, 10);
      }

      try {
        const rows = await getSalesBySku({
          from: prevFrom,
          to: isPicker ? undefined : prevTo,
          nextFrom: isPicker ? nextFrom : undefined,
        });

        const filtered = (rows || []).filter((r) => {
          const rv = routeFromVpsRow(r);
          if (!rv || isZeroLike(rv)) return false;
          const k = routeKey(rv);
          return allowedKeys.has(k);
        });

        if (active) setVpsRowsPrevYear(filtered);
      } catch (err) {
        console.error("Error leyendo ventas año anterior", err);
        if (active) setVpsRowsPrevYear([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [allowedRoutes, allowedKeys, periodRange, clientsByKey]);

  // Subconjunto visible
  const vpsRowsInScope = useMemo(() => {
    if (isAllSelected) return vpsRows;
    return (vpsRows || []).filter((r) => routeKey(routeFromVpsRow(r)) === selectedKey);
  }, [vpsRows, isAllSelected, selectedKey]);

  /* =============== Totales, SKU share, KPIs =============== */
  const totalSalesAll = useMemo(() => (vpsRowsInScope || []).reduce((a, r) => a + pickHL(r), 0), [vpsRowsInScope]);

  const vpsRowsPrevYearInScope = useMemo(() => {
    if (isAllSelected) return vpsRowsPrevYear;
    return (vpsRowsPrevYear || []).filter((r) => routeKey(routeFromVpsRow(r)) === selectedKey);
  }, [vpsRowsPrevYear, isAllSelected, selectedKey]);

  const totalSalesPrevYearAll = useMemo(() => (vpsRowsPrevYearInScope || []).reduce((a, r) => a + pickHL(r), 0), [vpsRowsPrevYearInScope]);

  const variacionAA = useMemo(() => {
    if (totalSalesPrevYearAll === 0) return { pct: 0, val: "N/A" };
    const val = ((totalSalesAll - totalSalesPrevYearAll) / totalSalesPrevYearAll) * 100;
    return { pct: val, val: val > 0 ? `+${val.toFixed(1)}%` : `${val.toFixed(1)}%` };
  }, [totalSalesAll, totalSalesPrevYearAll]);

  const [skuSearch, setSkuSearch] = useState("");
  const skuShare = useMemo(() => {
    const acc = new Map();
    for (const r of vpsRowsInScope || []) {
      const rawCm = strip(r.cve_marca || "");
      if (!rawCm) continue;
      const cmNorm = norm(rawCm);
      const sku = (skuEquivalenciasMap && (skuEquivalenciasMap.get(cmNorm) || skuEquivalenciasMap.get(rawCm))) || cmNorm;
      acc.set(sku, (acc.get(sku) || 0) + pickHL(r));
    }
    const rows = Array.from(acc.entries()).map(([sku, total]) => {
      const desc = skuDescMap[sku] || sku;
      const img = skuImgMap[sku] || "/brands/default.png";
      const pct = totalSalesAll > 0 ? Math.round((total / totalSalesAll) * 100) : 0;
      return { sku, desc, img, total, pct };
    }).sort((a, b) => b.total - a.total);
    const q = (skuSearch || "").toLowerCase();
    return q ? rows.filter((r) => r.sku.toLowerCase().includes(q) || (r.desc || "").toLowerCase().includes(q)) : rows;
  }, [vpsRowsInScope, skuDescMap, skuImgMap, skuEquivalenciasMap, totalSalesAll, skuSearch]);

  // Clientes
  const clientsSetInScope = useMemo(() => {
    const set = new Set((vpsRowsInScope || []).map((r) => strip(r.cve_cliente)).filter(Boolean));
    return set;
  }, [vpsRowsInScope]);
  const clientsTotal = useMemo(() => clientsSetInScope.size, [clientsSetInScope]);
  const clientsWithPurchase = useMemo(() => {
    const set = new Set(
      (vpsRowsInScope || [])
        .filter((r) => pickHL(r) > 0)
        .map((r) => strip(r.cve_cliente))
        .filter(Boolean)
    );
    return set.size;
  }, [vpsRowsInScope]);

  const promClientesCompraDia = useMemo(() => {
    const elapsed = periodRange.elapsedBusiness;
    if (elapsed <= 0) return "0.0";
    return (clientsWithPurchase / elapsed).toFixed(1);
  }, [clientsWithPurchase, periodRange]);

  /* =============== Metas (ruta / suma) =============== */
  const [routeMeta, setRouteMeta] = useState(0);
  useEffect(() => {
    let active = true;
    (async () => {
      const { from, to, isPicker, nextFrom } = periodRange;

      const latestByKey = new Map();

      try {
        const promises = Array.from(allowedKeys).map(async (k) => {
          // Necesitamos el nombre real de la ruta, no la key. Buscamos en allowedRoutes
          const realRoute = allowedRoutes.find(r => routeKey(r) === k);
          if (!realRoute) return [];
          return getGoals({
            salesRoute: realRoute,
            from,
            to: isPicker ? undefined : to,
            nextFrom: isPicker ? nextFrom : undefined,
            isMonthPicker: isPicker
          });
        });

        const results = await Promise.all(promises);
        const allGoals = results.flat();

        for (const row of allGoals || []) {
          const k = routeKey(row.sales_route || "");
          if (!k || !allowedKeys.has(k) || isZeroLike(row.sales_route)) continue;
          const prev = latestByKey.get(k);
          if (!prev || new Date(row.period_date) > new Date(prev.period_date)) {
            latestByKey.set(k, { meta: Number(row.meta) || 0, period_date: row.period_date });
          }
        }
      } catch (e) {
        console.error("Error loading goals", e);
      }

      let meta = 0;
      if (isAllSelected) {
        for (const k of allowedKeys) meta += (latestByKey.get(k)?.meta || 0);
      } else {
        meta = latestByKey.get(selectedKey)?.meta || 0;
      }
      if (active) setRouteMeta(meta);
    })();
    return () => { active = false; };
  }, [periodRange, allowedKeys, isAllSelected, selectedKey, allowedRoutes]);

  /* =============== Telesales KPIs (Indicadores clave) =============== */
  const [callsTodayCount, setCallsTodayCount] = useState(0);
  const [callsAnsweredTodayCount, setCallsAnsweredTodayCount] = useState(0);
  const [callsUnansweredTodayCount, setCallsUnansweredTodayCount] = useState(0);
  const [callsThisMonthCount, setCallsThisMonthCount] = useState(0);
  const [avgDailyCalls, setAvgDailyCalls] = useState("0");
  const [avgPurchase, setAvgPurchase] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!allowedRoutes.length) return;
        const { from, to, isPicker, nextFrom, elapsedBusiness } = periodRange;

        // Autodetección de columnas
        let routeField = "route", timeField = "call_time", answeredField = "answered", boxesField = "boxes_sold";
        try {
          const { data: probe } = await supabase.from("telesales_calls").select("*").limit(1);
          if (Array.isArray(probe) && probe.length) {
            const keys = Object.keys(probe[0] || {});
            const find = (c, fb) => c.find((k) => keys.includes(k)) || fb;
            routeField = find(["route", "sales_route", "ruta"], routeField);
            timeField = find(["call_time", "created_at", "fecha"], timeField);
            answeredField = find(["answered", "contestada"], answeredField);
            boxesField = find(["boxes_sold", "cajas_vendidas"], boxesField);
          }
        } catch (e) { }

        const nowLocal = new Date();
        const todayStartISO = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 0, 0, 0, 0).toISOString();
        const todayEndISO = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 23, 59, 59, 999).toISOString();

        const fetchPagedCalls = async (base) => {
          const PAGE = 1000; let start = 0, rows = [];
          while (true) {
            const { data, error } = await base.range(start, start + PAGE - 1);
            if (error) break;
            const chunk = Array.isArray(data) ? data : [];
            rows = rows.concat(chunk);
            if (chunk.length < PAGE) break;
            start += PAGE;
          }
          return rows;
        };

        // HOY
        let qToday = supabase.from("telesales_calls").select("*")
          .gte(timeField, todayStartISO).lte(timeField, todayEndISO)
          .in(routeField, allowedRoutes);
        const todayRowsAll = await fetchPagedCalls(qToday);
        const todayRows = todayRowsAll.filter((r) => {
          const rk = routeKey(r[routeField]);
          return isAllSelected ? allowedKeys.has(rk) : rk === selectedKey;
        });
        const todayCount = todayRows.length;
        const answeredToday = todayRows.filter((r) => !!r[answeredField]).length;
        const unansweredToday = Math.max(0, todayCount - answeredToday);

        // MES (del periodo seleccionado)
        const fromStartISO = new Date(`${from}T00:00:00`).toISOString();
        const endISO = (isPicker && nextFrom)
          ? new Date(`${nextFrom}T00:00:00`).toISOString()
          : new Date(`${to}T23:59:59.999`).toISOString();

        let qMonth = supabase.from("telesales_calls").select("*").gte(timeField, fromStartISO);
        qMonth = (isPicker && nextFrom) ? qMonth.lt(timeField, endISO) : qMonth.lte(timeField, endISO);
        qMonth = qMonth.in(routeField, allowedRoutes);
        const monthRowsAll = await fetchPagedCalls(qMonth);
        const monthRows = monthRowsAll.filter((r) => {
          const rk = routeKey(r[routeField]);
          return isAllSelected ? allowedKeys.has(rk) : rk === selectedKey;
        });
        const monthCount = monthRows.length;
        const nums = monthRows.map((r) => Number(r[boxesField])).filter((n) => Number.isFinite(n) && n > 0);
        const avgBuy = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : 0;

        if (!active) return;
        setCallsTodayCount(todayCount);
        setCallsAnsweredTodayCount(answeredToday);
        setCallsUnansweredTodayCount(unansweredToday);
        setCallsThisMonthCount(monthCount);
        setAvgPurchase(avgBuy);
        setAvgDailyCalls(elapsedBusiness > 0 ? (monthCount / elapsedBusiness).toFixed(1) : "0");
      } catch (e) {
        if (active) {
          setCallsTodayCount(0);
          setCallsAnsweredTodayCount(0);
          setCallsUnansweredTodayCount(0);
          setCallsThisMonthCount(0);
          setAvgDailyCalls("0");
          setAvgPurchase(0);
        }
      }
    })();
    return () => { active = false; };
  }, [allowedRoutes, isAllSelected, allowedKeys, selectedKey, periodRange]);

  /* =============== Tendencia =============== */
  const tendencia = useMemo(() => {
    const { elapsedBusiness, totalBusiness } = periodRange;
    if (elapsedBusiness <= 0 || totalBusiness <= 0) {
      return {
        hlPorDia: 0,
        hlProyectado: totalSalesAll,
        pctMeta: routeMeta > 0 ? Math.round((totalSalesAll / routeMeta) * 100) : 0,
        hlFaltantes: Math.max(routeMeta - totalSalesAll, 0),
        elapsedBusiness, totalBusiness
      };
    }
    const hlPorDia = totalSalesAll / elapsedBusiness;
    const hlProyectado = hlPorDia * totalBusiness;
    const pctMeta = routeMeta > 0 ? Math.round((hlProyectado / routeMeta) * 100) : 0;
    const hlFaltantes = Math.max(routeMeta - hlProyectado, 0);
    return { hlPorDia, hlProyectado, pctMeta, hlFaltantes, elapsedBusiness, totalBusiness };
  }, [periodRange, totalSalesAll, routeMeta]);

  /* =============== Avance por ruta (para "Todas") =============== */
  const [routesProgress, setRoutesProgress] = useState([]);
  useEffect(() => {
    const salesByKey = new Map();
    const displayByKey = new Map();
    for (const r of vpsRows || []) {
      const txt = routeFromVpsRow(r);
      if (!txt || isZeroLike(txt)) continue;
      const k = routeKey(txt);
      if (!allowedKeys.has(k)) continue;
      salesByKey.set(k, (salesByKey.get(k) || 0) + pickHL(r));
      if (!displayByKey.has(k)) displayByKey.set(k, strip(txt));
    }
    (async () => {
      const { from, to, isPicker, nextFrom } = periodRange;

      // Reutilizamos la lógica de metas
      const latestMetaByKey = new Map();
      try {
        const promises = Array.from(allowedKeys).map(async (k) => {
          const realRoute = allowedRoutes.find(r => routeKey(r) === k);
          if (!realRoute) return [];
          return getGoals({
            salesRoute: realRoute,
            from,
            to: isPicker ? undefined : to,
            nextFrom: isPicker ? nextFrom : undefined,
            isMonthPicker: isPicker
          });
        });
        const results = await Promise.all(promises);
        const allGoals = results.flat();

        for (const row of allGoals || []) {
          const k = routeKey(row.sales_route || "");
          if (!k || !allowedKeys.has(k) || isZeroLike(row.sales_route)) continue;
          const prev = latestMetaByKey.get(k);
          if (!prev || new Date(row.period_date) > new Date(prev.period_date)) {
            latestMetaByKey.set(k, { meta: Number(row.meta) || 0, period_date: row.period_date });
          }
        }
      } catch (e) { console.error(e); }

      const list = Array.from(allowedKeys).map((k) => {
        const sale = salesByKey.get(k) || 0;
        const meta = Number(latestMetaByKey.get(k)?.meta) || 0;
        const pct = meta > 0 ? Math.round((sale / meta) * 100) : 0;
        const display = displayByKey.get(k) || k;
        return { route: display, sale, meta, pct };
      }).sort((a, b) => b.pct - a.pct);
      setRoutesProgress(list);
    })();
  }, [vpsRows, allowedKeys, periodRange, allowedRoutes]);

  const globalProgress = useMemo(() => {
    if (!routesProgress.length) return { sale: 0, meta: 0, pct: 0 };
    const sale = routesProgress.reduce((a, r) => a + (r.sale || 0), 0);
    const meta = routesProgress.reduce((a, r) => a + (r.meta || 0), 0);
    const pct = meta > 0 ? Math.round((sale / meta) * 100) : 0;
    return { sale, meta, pct };
  }, [routesProgress]);

  const rutasCriticas = useMemo(() => {
    return [...routesProgress].sort((a, b) => a.pct - b.pct).slice(0, 3);
  }, [routesProgress]);

  const hlPorRutaActiva = useMemo(() => {
    const rutasConVenta = routesProgress.filter((r) => r.sale > 0).length;
    if (rutasConVenta === 0) return "0.0";
    return (globalProgress.sale / rutasConVenta).toFixed(1);
  }, [routesProgress, globalProgress]);

  // Top 10 clientes (ruta seleccionada)
  const topClientsRoute = useMemo(() => {
    if (isAllSelected) return [];
    const acc = new Map();
    for (const r of vpsRowsInScope || []) {
      const code = strip(r.cve_cliente); if (!code) continue;
      const v = pickHL(r);
      acc.set(code, (acc.get(code) || 0) + v);
    }
    return Array.from(acc.entries())
      .map(([code, total]) => {
        const c = clientsByCode.get(code) || clientsByKey.get(clientCodeKey(code));
        const name = c?.name || c?.business_name || `Cliente ${code} `;
        return { code, name, total };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [isAllSelected, vpsRowsInScope, clientsByCode, clientsByKey]);

  // Modal cliente
  const [salesClient, setSalesClient] = useState(null);
  const openSalesDialog = async ({ code, name }) => {
    let client = clientsByCode.get(code) || clientsByKey.get(clientCodeKey(code));
    if (!client) {
      client = await getClientByCode(code) || { client_code: code, name };
    }
    setSalesClient(client);
  };

  const fmt = new Intl.NumberFormat("es-MX");

  /* =============== UI =============== */
  if (loading) return <DashboardSkeleton />;

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-4 space-y-6 bg-[#1f2031]">
      <Helmet><title>Dashboard Televenta</title></Helmet>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex-1">
            <div className="text-white text-3xl font-extrabold leading-tight">Reporte de Ruta</div>
            <div className="text-white/60 text-sm">de {userName} · {now.toLocaleDateString("es-MX")} — {now.toLocaleTimeString("es-MX")}</div>
          </div>

          <div className="flex flex-wrap gap-3">
            <SyncButton variant="outline" size="sm" showLabel={true} />
            <div className="flex items-center gap-2">
              <span className="text-white/70 text-sm">Periodo</span>
              <input
                type="month"
                value={isYYYYMM(period) ? period : (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })()}
                onChange={(e) => setPeriod(e.target.value)}
                className="bg-white/10 text-white px-2 py-1 rounded"
              />
            </div>

            {allowedRoutes.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-white/70 text-sm">Ruta</span>
                <Select value={salesRoute} onValueChange={setSalesRoute}>
                  <SelectTrigger className="w-56 bg-white/10 text-white">
                    <SelectValue placeholder="Selecciona ruta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem key={ALL_ROUTES_VALUE} value={ALL_ROUTES_VALUE}>Todas (permitidas)</SelectItem>
                    {allowedRoutes.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* 1) Venta vs Meta + Tendencia */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[#2a2c44] border-0 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base">Venta vs Meta ({periodLabel})</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-6">
              <div style={{ width: 180, height: 180 }} className="shrink-0 flex items-center justify-center">
                <DonutProgress
                  value={routeMeta > 0 ? Math.min(100, Math.round((totalSalesAll / routeMeta) * 100)) : 0}
                  text={`${routeMeta > 0 ? Math.min(100, Math.round((totalSalesAll / routeMeta) * 100)) : 0}% `}
                  color="#22c55e"
                  size={180}
                />
              </div>
              <div className="text-white/90 text-sm space-y-2">
                <div><span className="text-white/60">Ruta:</span> <span className="font-semibold text-green-200">{isAllSelected ? "Todas (permitidas)" : (salesRoute || "—")}</span></div>
                <div><span className="text-white/60">Meta HL:</span> <span className="font-semibold">{fmt.format(routeMeta)}</span></div>
                <div><span className="text-white/60">Venta HL:</span> <span className="font-semibold">{fmt.format(totalSalesAll || 0)}</span></div>
                <div className="pt-2 border-t border-white/10 space-y-1">
                  <div><span className="text-white/60">Tendencia HL/día hábil:</span> <span className="font-semibold">{(tendencia.hlPorDia || 0).toLocaleString("es-MX")}</span></div>
                  <div><span className="text-white/60">Tendencia de cierre:</span> <span className="font-semibold">{fmt.format(tendencia.hlProyectado || 0)} HL</span> <span className="text-white/70">({tendencia.pctMeta}% de meta)</span></div>
                  <div><span className="text-white/60">HL faltantes (tendencia):</span> <span className="font-semibold">{fmt.format(tendencia.hlFaltantes || 0)} HL</span></div>
                  <div className="text-xs text-white/60">Cálculo: {tendencia.elapsedBusiness}/{tendencia.totalBusiness} días hábiles (L–S)</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2) Participación por SKU */}
        <Card className="bg-[#2a2c44] border-0 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base">Participación por SKU (vs venta del periodo)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="mb-3">
              <input
                type="text"
                placeholder="Buscar SKU o descripción..."
                value={skuSearch}
                onChange={(e) => setSkuSearch(e.target.value)}
                className="w-full bg-white/10 text-white px-3 py-2 rounded text-sm placeholder-white/50"
              />
            </div>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {(skuShare.length ? skuShare : []).map((row) => (
                <div key={row.sku} className="flex items-center gap-3">
                  <div className="w-10 shrink-0">
                    <img
                      src={row.img || "/brands/default.png"}
                      alt={row.sku}
                      className="w-10 h-10 object-contain rounded bg-white"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between text-xs text-white/70">
                      <span className="font-semibold text-white/90">
                        {row.desc} <span className="text-white/50">({row.sku})</span>
                      </span>
                      <span className="tabular-nums text-white/80">
                        {fmt.format(row.total)} HL · {row.pct}%
                      </span>
                    </div>
                    <div className="w-full bg-white/10 rounded h-2 mt-1">
                      <div className="bg-green-400 h-2 rounded" style={{ width: `${Math.min(100, row.pct)}% ` }} />
                    </div>
                  </div>
                </div>
              ))}
              {skuShare.length === 0 && (
                <div className="text-white/70 text-sm">Sin ventas por SKU en el periodo.</div>
              )}
            </div>
            <div className="text-[11px] text-white/60 mt-2">
              * Fuente: <code className="text-white/70">ventas_por_sku</code> (HL: <code>htls_total</code>).
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3) Indicadores Clave (COMPLETO) */}
      <div>
        <div className="text-sm text-white/80 tracking-wide uppercase">Indicadores Clave</div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4 mt-2">
          {/* Clientes con compra */}
          <Card className="bg-[#2a2c44] border-0">
            <CardHeader className="pb-1">
              <CardTitle className="text-green-200 text-xs">Clientes con compra</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-col items-center justify-center gap-2">
                <div style={{ width: 100, height: 100 }}>
                  <DonutProgress
                    value={clientsTotal > 0 ? Math.round((clientsWithPurchase / clientsTotal) * 100) : 0}
                    text={`${clientsTotal > 0 ? Math.round((clientsWithPurchase / clientsTotal) * 100) : 0}% `}
                    color="#3b82f6"
                    size={100}
                  />
                </div>
                <div className="text-white text-lg font-bold">{clientsWithPurchase}</div>
                <div className="text-white/60 text-xs -mt-1">de {clientsTotal} clientes</div>
              </div>
            </CardContent>
          </Card>

          {/* Aportación al total visible */}
          <Card className="bg-[#2a2c44] border-0">
            <CardHeader className="pb-1">
              <CardTitle className="text-green-200 text-xs">% Aportación al total</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {(() => {
                const totalEmpresa = (vpsRows || []).reduce((a, r) => a + pickHL(r), 0);
                const visible = totalSalesAll;
                const denom = totalEmpresa > 0 ? totalEmpresa : 1;
                const pct = Math.round((visible / denom) * 100);
                return (
                  <div className="flex flex-col items-center justify-center">
                    <div style={{ width: 100, height: 100 }}>
                      <DonutProgress value={pct} text={`${pct}% `} color="#22c55e" size={100} />
                    </div>
                    <div className="text-white/60 text-xs mt-2">
                      HL total: <span className="text-white font-semibold">{fmt.format(totalEmpresa)} HL</span>
                    </div>
                    <div className="text-white/60 text-xs">
                      HL visibles: <span className="text-white font-semibold">{fmt.format(visible)} HL</span>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Llamadas del día */}
          <Card className="bg-[#2a2c44] border-0">
            <CardHeader className="pb-1"><CardTitle className="text-green-200 text-xs">Llamadas del día</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <div className="text-white text-3xl font-extrabold">{callsTodayCount}</div>
              <div className="text-white/60 text-xs mt-1">Hoy</div>
            </CardContent>
          </Card>

          {/* Contestadas hoy */}
          <Card className="bg-[#2a2c44] border-0">
            <CardHeader className="pb-1"><CardTitle className="text-green-200 text-xs">Llamadas contestadas (día)</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <div className="text-white text-3xl font-extrabold">{callsAnsweredTodayCount}</div>
              <div className="text-white/60 text-xs mt-1">Hoy</div>
            </CardContent>
          </Card>

          {/* No contestadas hoy */}
          <Card className="bg-[#2a2c44] border-0">
            <CardHeader className="pb-1"><CardTitle className="text-green-200 text-xs">Llamadas no contestadas (día)</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <div className="text-white text-3xl font-extrabold">{callsUnansweredTodayCount}</div>
              <div className="text-white/60 text-xs mt-1">Hoy</div>
            </CardContent>
          </Card>

          {/* Llamadas del mes */}
          <Card className="bg-[#2a2c44] border-0">
            <CardHeader className="pb-1"><CardTitle className="text-green-200 text-xs">Llamadas del mes</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <div className="text-white text-3xl font-extrabold">{callsThisMonthCount}</div>
              <div className="text-white/60 text-xs mt-1">{periodLabel}</div>
            </CardContent>
          </Card>

          {/* Promedio llamadas diarias */}
          <Card className="bg-[#2a2c44] border-0">
            <CardHeader className="pb-1"><CardTitle className="text-green-200 text-xs">Promedio de llamadas diarias</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <div className="text-white text-3xl font-extrabold">{avgDailyCalls}</div>
              <div className="text-white/60 text-xs mt-1">Llamadas del mes / días hábiles</div>
            </CardContent>
          </Card>

          {/* Promedio de compra */}
          <Card className="bg-[#2a2c44] border-0">
            <CardHeader className="pb-1"><CardTitle className="text-green-200 text-xs">Promedio de compra</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <div className="text-white text-3xl font-extrabold">{Number.isFinite(avgPurchase) ? avgPurchase : 0}</div>
              <div className="text-white/60 text-xs mt-1">{periodLabel}</div>
              <div className="text-white/50 text-[11px] mt-1">Cajas promedio por llamada con compra</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Eficiencia Operativa */}
      <div>
        <div className="text-sm text-white/80 tracking-wide uppercase">Eficiencia Operativa</div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-2">
          {/* Variación vs Año Anterior */}
          <Card className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
            <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingUp className="w-24 h-24 text-blue-400" /></div>
            <div className="relative z-10">
              <div className="text-[10px] text-white/60 font-bold uppercase tracking-wider mb-1">Var. vs Año Anterior</div>
              <div className="text-2xl font-bold text-blue-400 mb-1">{variacionAA.val}</div>
              <div className="text-[10px] text-white/40">HL vs mismo periodo (año anterior)</div>
            </div>
            <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10"><div className="h-full bg-blue-400" style={{ width: `${Math.min(100, Math.max(0, 100 + variacionAA.pct))}%` }} /></div>
          </Card>

          {/* Promedio Clientes con Compra al Día */}
          <Card className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Users className="w-24 h-24 text-purple-400" /></div>
            <div className="relative z-10">
              <div className="text-[10px] text-white/60 font-bold uppercase tracking-wider mb-1">Prom. Clientes / Día</div>
              <div className="text-2xl font-bold text-purple-400 mb-1">{promClientesCompraDia}</div>
              <div className="text-[10px] text-white/40">Clientes con compra / Días hábiles ({periodRange.elapsedBusiness})</div>
            </div>
            <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10"><div className="h-full bg-purple-400" style={{ width: `100%` }} /></div>
          </Card>

          {/* HL por Ruta Activa */}
          <Card className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Route className="w-24 h-24 text-green-400" /></div>
            <div className="relative z-10">
              <div className="text-[10px] text-white/60 font-bold uppercase tracking-wider mb-1">HL por Ruta Activa</div>
              <div className="text-2xl font-bold text-green-400 mb-1">{hlPorRutaActiva} HL</div>
              <div className="text-[10px] text-white/40">Volumen promedio en rutas con venta</div>
            </div>
            <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10"><div className="h-full bg-green-400" style={{ width: `100%` }} /></div>
          </Card>

          {/* Rutas Críticas */}
          <Card className="p-4 relative overflow-hidden group bg-[#2a2c44] border-0">
            <div className="absolute top-0 right-0 p-4 opacity-10"><AlertTriangle className="w-24 h-24 text-red-400" /></div>
            <div className="relative z-10">
              <div className="text-[10px] text-white/60 font-bold uppercase tracking-wider mb-1">Rutas Críticas</div>
              <div className="text-sm font-bold text-red-400 mb-1 mt-2 space-y-1">
                {rutasCriticas.length > 0 ? rutasCriticas.map((rc, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs">
                    <span className="truncate max-w-[120px]" title={rc.route}>{rc.route}</span>
                    <span className="tabular-nums text-white/90">{rc.pct}%</span>
                  </div>
                )) : <div className="text-xs">Sin rutas</div>}
              </div>
              <div className="text-[10px] text-white/40 mt-1">Más bajo % de avance</div>
            </div>
            <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10"><div className="h-full bg-red-400" style={{ width: `100%` }} /></div>
          </Card>
        </div>
      </div>

      {/* 4) Mapa + Panel derecho dinámico */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-[#2a2c44] border-0">
          <CardHeader className="pb-2"><CardTitle className="text-white text-base">Mapa de Clientes</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <div className="rounded-lg overflow-hidden ring-1 ring-white/10">
              <InteractiveMap items={clientsWithCoords} height="24rem" allowManualPick={false} />
            </div>
          </CardContent>
        </Card>

        {/* Panel derecho: Avance por ruta (Todas)  /  Top 10 clientes (Ruta) */}
        <Card className="bg-[#2a2c44] border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base">
              {isAllSelected ? "Avance por ruta (permitidas)" : `Top 10 clientes — ${salesRoute || "Ruta"} `}
            </CardTitle>
          </CardHeader>

          <CardContent className="pt-0">
            {isAllSelected ? (
              <>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSalesRoute(ALL_ROUTES_VALUE)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSalesRoute(ALL_ROUTES_VALUE); }}
                  className={`p - 2 rounded transition mb - 2
                    ${isAllSelected ? "ring-2 ring-green-400 bg-white/5" : "hover:bg-white/5 cursor-pointer"} `}
                  title="Click para ver el agregado de todas tus rutas"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/80 font-medium flex items-center gap-2">
                      Todas (permitidas)
                      {isAllSelected && <span className="px-1.5 py-0.5 rounded bg-green-400/20 text-green-300 text-[10px]">Actual</span>}
                    </span>
                    <span className="text-white/80 tabular-nums">{Math.min(100, globalProgress.pct)}%</span>
                  </div>
                  <div className="w-full bg-white/10 rounded h-2 mt-1">
                    <div className="bg-green-400 h-2 rounded" style={{ width: `${Math.min(100, globalProgress.pct)}% ` }} />
                  </div>
                  <div className="text-[11px] text-white/60 mt-1">
                    Venta: <span className="text-white">{fmt.format(globalProgress.sale)} HL</span> · Meta: <span className="text-white">{fmt.format(globalProgress.meta)} HL</span>
                  </div>
                </div>

                {routesProgress.length === 0 ? (
                  <div className="text-white/70 text-sm">Sin datos para el periodo.</div>
                ) : (
                  <div className="space-y-2 max-h-[22rem] overflow-y-auto pr-1">
                    {routesProgress.map((r) => {
                      const selected = !isAllSelected && routeKey(r.route) === selectedKey;
                      return (
                        <div
                          key={r.route}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSalesRoute(r.route)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSalesRoute(r.route); }}
                          className={`p - 2 rounded transition
                            ${selected ? "ring-2 ring-green-400 bg-white/5" : "hover:bg-white/5 cursor-pointer"} `}
                          title="Click para ver esta ruta en el dashboard"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-white/80 font-medium flex items-center gap-2">
                              {r.route}
                              {selected && <span className="px-1.5 py-0.5 rounded bg-green-400/20 text-green-300 text-[10px]">Actual</span>}
                            </span>
                            <span className="text-white/80 tabular-nums">{Math.min(100, r.pct)}%</span>
                          </div>
                          <div className="w-full bg-white/10 rounded h-2 mt-1">
                            <div className="bg-green-400 h-2 rounded" style={{ width: `${Math.min(100, r.pct)}% ` }} />
                          </div>
                          <div className="text-[11px] text-white/60 mt-1">
                            Venta: <span className="text-white">{fmt.format(r.sale)} HL</span> · Meta: <span className="text-white">{fmt.format(r.meta)} HL</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="text-[11px] text-white/50 mt-3">Periodo: {periodLabel}</div>
              </>
            ) : (
              <div className="space-y-2">
                {topClientsRoute.length === 0 ? (
                  <div className="text-white/70 text-sm">Sin clientes con compra en esta ruta para el periodo.</div>
                ) : (
                  topClientsRoute.map((c) => (
                    <button
                      key={c.code}
                      onClick={() => openSalesDialog({ code: c.code, name: c.name })}
                      className="w-full text-left bg-white/5 hover:bg-white/10 rounded-lg p-3 transition flex items-center justify-between"
                      title="Ver detalle de ventas del cliente"
                    >
                      <div className="text-white/90 text-sm font-semibold">{c.name}</div>
                      <div className="text-white/70 text-xs">Cod: {c.code}</div>
                      <div className="text-white text-sm font-bold tabular-nums">{fmt.format(c.total)} HL</div>
                    </button>
                  ))
                )}
                <div className="text-[11px] text-white/50 mt-2">
                  * Fuente: <code className="text-white/70">ventas_por_sku</code> (HL por cliente en la ruta seleccionada).
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {salesClient && <SalesDialog client={salesClient} onClose={() => setSalesClient(null)} />}

      <div className="text-[11px] text-white/50 text-right pb-4">Heineken · Dashboard Televenta</div>
    </div>
  );
}
