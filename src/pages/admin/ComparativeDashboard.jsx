// src/pages/ComparativeDashboard.jsx
import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/supabaseClient'; // ⇐ si usas alias, cambia a: '@/supabaseClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchVentasPorSku } from '@/lib/mysqlVentasPorSku';
import { fetchAllClientsOnline } from '@/repositories/clientsRepository';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Ban, BarChart2, DollarSign, Package, TrendingUp, Users, Wallet } from 'lucide-react';

/* ---------------- Helpers ---------------- */
const fmt = (val, style = 'decimal', currency = 'MXN', fractionDigits = 1) => {
  if (val == null || (typeof val === 'number' && isNaN(val))) return '-';
  if (style === 'percent') return `${(val * 100).toFixed(Math.max(0, fractionDigits))}%`;
  if (style === 'currency') {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(val);
  }
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(val);
};

const monthNames = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];
const formatMonthLabel = (monthString) => {
  if (!monthString) return '';
  const [year, month] = monthString.split('-');
  return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
};

const zoneClean = (z) => (z ?? '').toString().trim().replace(/\.xlsx$/i, '');
const strip = (s) => (s ?? '').toString().trim();
const initials = (name) => {
  const t = strip(name).split(/\s+/).filter(Boolean);
  if (!t.length) return '?';
  if (t.length === 1) return t[0].slice(0, 2).toUpperCase();
  return (t[0][0] + t[t.length - 1][0]).toUpperCase();
};

/* ------- Colores consistentes por etiqueta ------- */
const BASE_COLORS = ['#f97316', '#60a5fa', '#84cc16', '#eab308', '#f43f5e', '#a855f7', '#14b8a6', '#f472b6', '#fb7185', '#93c5fd'];
const buildColorMap = (labels, palette = BASE_COLORS) => {
  const uniqueSorted = [...new Set(labels)].filter(Boolean).sort((a, b) => `${a}`.localeCompare(`${b}`));
  const map = {};
  uniqueSorted.forEach((lab, i) => { map[lab] = palette[i % palette.length]; });
  return map;
};

const SwatchLegend = ({ items, getKey, getLabel, colorMap }) => (
  <div className="flex flex-wrap gap-2 mt-2">
    {items.map((it) => {
      const key = typeof it === 'string' ? it : getKey(it);
      const label = typeof it === 'string' ? it : getLabel(it);
      const color = colorMap[key] || '#9ca3af';
      return (
        <div key={key} className="flex items-center gap-1 text-[10px] text-slate-300 max-w-full">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
          <span className="truncate max-w-[180px]" title={label}>{label}</span>
        </div>
      );
    })}
  </div>
);

/* ---------------- Date helpers ---------------- */
const getMonthDateRange = (monthString) => {
  if (!monthString || !monthString.includes('-')) {
    const t = new Date();
    monthString = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
  }
  const [y, m] = monthString.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const next = new Date(Date.UTC(y, m, 1)); // first day of next month UTC
  const toISO = (d) => d.toISOString().split('T')[0];
  return { startInclusive: toISO(start), endExclusive: toISO(next) };
};

/* ---------------- Data fetchers (paginados) ---------------- */

// ventas_por_sku con filtros de zona/ruta (MySQL vía PHP)
const fetchVpsRowsForRange = async (
  startInclusive,
  endExclusive,
  { zoneFilter = null, routeFilter = null } = {}
) => {
  let rows = await fetchVentasPorSku({
    from: startInclusive,
    nextFrom: endExclusive,
    zona: zoneFilter && zoneFilter !== '__ALL__' ? zoneFilter : undefined,
  });

  rows = rows || [];

  if (routeFilter && routeFilter !== '__ALL__') {
    const f = routeFilter;
    rows = rows.filter((r) => {
      const ruta = strip(r.ruta || '');
      const rx = strip(r.ruta_express || '');
      return ruta.includes(f) || rx.includes(f);
    });
  }

  return rows;
};

// todos los clientes
const fetchAllClients = async () => {
  return await fetchAllClientsOnline();
};

// catálogo de SKU → descripción
const fetchAllSkuDescriptions = async () => {
  const pageSize = 1000;
  let from = 0;
  let out = [];
  while (true) {
    const { data, error } = await supabase
      .from('sku_descripcion')
      .select('cve_marca, descripcion, marca')
      .range(from, from + pageSize - 1);
    if (error) break;
    const chunk = Array.isArray(data) ? data : [];
    out = out.concat(chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return out;
};

/* Normaliza y resume datos del rango */
const fetchDataForPeriod = async (startInclusive, endExclusive, filters) => {
  const salesData = await fetchVpsRowsForRange(startInclusive, endExclusive, filters);

  const results = {
    kpis: { venta: 0, htls_total: 0, descuento: 0, unidades: 0 },
    daily: {},            // {day -> {venta, htls_total, descuento, clientsSet}}
    skus: {},             // {sku -> htl}
    clientsMap: {},       // {client_code -> htl}
    zones_htl: {},        // {zona -> htl}
    routes_htl: {},       // {ruta/ruta_express -> htl}
    uniqueSkusCount: 0,
    clientsCount: 0
  };

  const uniqueSkus = new Set();
  const clientsSet = new Set();

  (salesData || []).forEach(r => {
    const venta = Number(r.venta) || 0;
    const htls = Number(r.htls_total) || 0;
    const descuento = Number(r.descuento) || 0;
    const unidades = Number(r.unidades) || 0;

    results.kpis.venta += venta;
    results.kpis.htls_total += htls;
    results.kpis.descuento += descuento;
    results.kpis.unidades += unidades;

    // día
    const ds = strip(r.fecha_alta || r.period_date);
    const day = ds && ds.includes('-') ? parseInt(ds.split('-')[2], 10) : NaN;
    if (!isNaN(day)) {
      if (!results.daily[day]) results.daily[day] = { venta: 0, htls_total: 0, descuento: 0, clientsSet: new Set() };
      results.daily[day].venta += venta;
      results.daily[day].htls_total += htls;
      results.daily[day].descuento += descuento;
      if (r.cve_cliente) results.daily[day].clientsSet.add(r.cve_cliente);
    }

    // SKUs (cve_marca o producto)
    const skuKey = strip(r.cve_marca || r.producto);
    if (skuKey) {
      results.skus[skuKey] = (results.skus[skuKey] || 0) + htls;
      uniqueSkus.add(skuKey);
    }

    // Clientes
    const ccode = strip(r.cve_cliente);
    if (ccode) {
      clientsSet.add(ccode);
      results.clientsMap[ccode] = (results.clientsMap[ccode] || 0) + htls;
    }

    // Zonas
    const z = zoneClean(r.zona) || 'SIN ZONA';
    results.zones_htl[z] = (results.zones_htl[z] || 0) + htls;

    // Rutas (pref ruta_express)
    const route = strip(r.ruta_express) || strip(r.ruta) || 'SIN RUTA';
    results.routes_htl[route] = (results.routes_htl[route] || 0) + htls;
  });

  // serializar daily
  const dailySerializable = {};
  Object.entries(results.daily).forEach(([day, obj]) => {
    dailySerializable[day] = {
      venta: obj.venta,
      htls_total: obj.htls_total,
      descuento: obj.descuento,
      clientsCount: obj.clientsSet ? obj.clientsSet.size : 0
    };
  });

  return {
    kpis: results.kpis,
    daily: dailySerializable,
    skus: results.skus,
    clientsMap: results.clientsMap,
    zones_htl: results.zones_htl,
    routes_htl: results.routes_htl,
    uniqueSkusCount: uniqueSkus.size,
    clientsCount: clientsSet.size
  };
};

/* ---------------- Component ---------------- */
const ComparativeDashboard = () => {
  // Defaults: Mes actual vs Mes anterior dinámicos
  const [month1, setMonth1] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [month2, setMonth2] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1); // Mes anterior
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    p1: null,
    p2: null,
    clients: {},                // {client_code -> displayName}
    skuDescMap: {},             // {cve_marca -> descripcion}
    metaHtl: 0,
    totalClientsInSystem: 0
  });

  // Filtros zona/ruta
  const [selectedZone, setSelectedZone] = useState('__ALL__');
  const [selectedRoute, setSelectedRoute] = useState('__ALL__');

  const M1Label = useMemo(() => formatMonthLabel(month1), [month1]);
  const M2Label = useMemo(() => formatMonthLabel(month2), [month2]);

  // Carga y armado de datos
  const handleUpdate = async () => {
    try {
      setLoading(true);
      const r1 = getMonthDateRange(month1);
      const r2 = getMonthDateRange(month2);

      // metas (solo usada como “cumplimiento” de referencia global)
      let totalMeta = 0;
      try {
        const metaQ = await supabase
          .from('metas_zona')
          .select('meta, period_date')
          .gte('period_date', r1.startInclusive)
          .lt('period_date', r1.endExclusive);
        totalMeta = (metaQ.data || []).reduce((sum, row) => sum + (Number(row.meta) || 0), 0);
      } catch (e) {
        console.error('Error fetching metas_zona', e);
      }

      // clientes display
      const allClients = await fetchAllClients();
      const totalActiveClients = (allClients || []).length;
      const clientsMap = (allClients || []).reduce((acc, c) => {
        const code = strip(c.client_code);
        if (!code) return acc;
        const display = strip(c.business_name) || strip(c.name) || `Cliente ${code}`;
        acc[code] = display;
        return acc;
      }, {});

      // catálogo de sku
      const skuRows = await fetchAllSkuDescriptions();
      const skuDescMap = (skuRows || []).reduce((acc, r) => {
        const key = strip(r.cve_marca);
        if (!key) return acc;
        const label = strip(r.descripcion) || strip(r.marca) || key;
        acc[key] = label;
        return acc;
      }, {});

      const filters = { zoneFilter: selectedZone, routeFilter: selectedRoute };

      const [p1, p2] = await Promise.all([
        fetchDataForPeriod(r1.startInclusive, r1.endExclusive, filters),
        fetchDataForPeriod(r2.startInclusive, r2.endExclusive, filters)
      ]);

      setData({
        p1,
        p2,
        clients: clientsMap,
        skuDescMap,
        metaHtl: totalMeta,
        totalClientsInSystem: totalActiveClients
      });
    } catch (err) {
      console.error('Error fetching dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  // carga inicial
  useEffect(() => {
    handleUpdate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // recálculo por filtros/meses
  useEffect(() => {
    handleUpdate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedZone, selectedRoute, month1, month2]);

  /* --------- Post-procesamiento para UI --------- */
  const processedData = useMemo(() => {
    if (!data.p1 || !data.p2) {
      return {
        kpis: {},
        charts: { dailyTrends: [] },
        tables: { topClients: [] },
        pies: {},
        metaHtl: data.metaHtl || 0,
        legends: { zone: [], sku: [] },
        colorMaps: { zone: {}, sku: {} },
        zoneOptions: [],
        routeOptions: [],
      };
    }

    const { p1, p2, clients, metaHtl, skuDescMap } = data;
    const calcChange = (v1, v2) =>
      (typeof v2 === 'number' && v2 > 0)
        ? ((v1 - v2) / v2) * 100
        : (v1 > 0 && (v2 === 0 || v2 == null) ? 100 : null);

    const kpis = {
      venta: { val: p1.kpis.venta, change: calcChange(p1.kpis.venta, p2.kpis.venta), base: p2.kpis.venta },
      htls: { val: p1.kpis.htls_total, change: calcChange(p1.kpis.htls_total, p2.kpis.htls_total), base: p2.kpis.htls_total },
      cajas: { val: p1.kpis.unidades, change: calcChange(p1.kpis.unidades, p2.kpis.unidades), base: p2.kpis.unidades },
      clientes: { val: p1.clientsCount, change: calcChange(p1.clientsCount, p2.clientsCount), base: p2.clientsCount },
      descuento: { val: p1.kpis.descuento, change: calcChange(p1.kpis.descuento, p2.kpis.descuento), base: p2.kpis.descuento },
      cumplimiento: { val: metaHtl > 0 ? p1.kpis.htls_total / metaHtl : 0, base: metaHtl },
      skuVendidos: { val: p1.uniqueSkusCount, change: calcChange(p1.uniqueSkusCount, p2.uniqueSkusCount), base: p2.uniqueSkusCount },
    };

    // zona mayor/menor
    const zonesSorted = Object.entries(p1.zones_htl || {}).sort((a, b) => b[1] - a[1]);
    const zoneMayor = zonesSorted.length > 0 ? zonesSorted[0] : null;
    const zoneMenor = zonesSorted.length > 0 ? zonesSorted[zonesSorted.length - 1] : null;

    // timeline
    const allDays = [...new Set([...(Object.keys(p1.daily || {})), ...(Object.keys(p2.daily || {}))])]
      .map(Number).sort((a, b) => a - b);

    let cumulativeHtlP1 = 0;
    let cumulativeHtlP2 = 0;
    let cumulativeDescP1 = 0;
    let cumulativeDescP2 = 0;

    const dailyTrends = allDays.map((d) => {
      const p1d = p1.daily[d] || { htls_total: 0, clientsCount: 0, descuento: 0 };
      const p2d = p2.daily[d] || { htls_total: 0, clientsCount: 0, descuento: 0 };
      cumulativeHtlP1 += p1d.htls_total || 0;
      cumulativeHtlP2 += p2d.htls_total || 0;
      cumulativeDescP1 += p1d.descuento || 0;
      cumulativeDescP2 += p2d.descuento || 0;
      return {
        name: `Día ${d}`,
        [`HTL Acum. ${M1Label}`]: cumulativeHtlP1,
        [`HTL Acum. ${M2Label}`]: cumulativeHtlP2,
        [`Clientes ${M1Label}`]: p1d.clientsCount || 0,
        [`Clientes ${M2Label}`]: p2d.clientsCount || 0,
        [`Descuento Acum. ${M1Label}`]: cumulativeDescP1,
        [`Descuento Acum. ${M2Label}`]: cumulativeDescP2,
      };
    });

    // Top 10 clientes — **ordenado por Mes 2**
    const totalHltBase = p2.kpis.htls_total || 1;
    const topClients = Object.entries(p2.clientsMap || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([cve, htlsP2]) => {
        const display = clients[cve] || `Cliente ${cve}`;
        const htlsP1 = p1.clientsMap?.[cve] || 0;
        const diff = (htlsP1 || 0) - (htlsP2 || 0);
        const share = Math.max(0, Math.min(100, Math.round(((htlsP2 || 0) / totalHltBase) * 100)));
        return { name: display, cve, htlsP1, htlsP2, diff, share };
      });

    // Pies: zonas (mismo color)
    const toZonePie = (obj) =>
      Object.entries(obj || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, value]) => ({ name, value }));

    const zoneP1 = toZonePie(p1.zones_htl);
    const zoneP2 = toZonePie(p2.zones_htl);
    const zoneUnionLabels = [...new Set([...zoneP1.map(d => d.name), ...zoneP2.map(d => d.name)])];
    const zoneColorMap = buildColorMap(zoneUnionLabels);

    // Pies: SKUs (usar nombre de catálogo; color consistente por código)
    const toSkuPie = (obj) =>
      Object.entries(obj || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code, value]) => ({ code, name: skuDescMap[code] || code, value }));

    const skuP1 = toSkuPie(p1.skus);
    const skuP2 = toSkuPie(p2.skus);
    const skuUnionCodes = [...new Set([...skuP1.map(d => d.code), ...skuP2.map(d => d.code)])];
    const skuColorMap = buildColorMap(skuUnionCodes);

    const pies = {
      zoneP1, zoneP2,
      skuP1, skuP2,
      clientsRatioP1: [
        { name: 'Con Compra', value: p1.clientsCount || 0 },
        { name: 'Activos sin Compra', value: Math.max(0, (data.totalClientsInSystem || 0) - (p1.clientsCount || 0)) },
      ],
      clientsRatioP2: [
        { name: 'Con Compra', value: p2.clientsCount || 0 },
        { name: 'Activos sin Compra', value: Math.max(0, (data.totalClientsInSystem || 0) - (p2.clientsCount || 0)) },
      ],
    };

    // Leyendas
    const legends = {
      zone: zoneUnionLabels,
      sku: skuUnionCodes.map(code => ({ key: code, label: skuDescMap[code] || code })),
    };

    // Opciones para selects
    const zoneOptions = [...new Set([...(Object.keys(p1.zones_htl || {})), ...(Object.keys(p2.zones_htl || {}))])].sort((a, b) => a.localeCompare(b, 'es'));
    const routeOptions = [...new Set([...(Object.keys(p1.routes_htl || {})), ...(Object.keys(p2.routes_htl || {}))])].sort((a, b) => a.localeCompare(b, 'es'));

    return {
      kpis,
      zoneMayor,
      zoneMenor,
      charts: { dailyTrends },
      tables: { topClients },
      pies,
      metaHtl,
      colorMaps: { zone: zoneColorMap, sku: skuColorMap },
      legends,
      zoneOptions,
      routeOptions,
    };
  }, [data, M1Label, M2Label]);

  /* ---------------- Render ---------------- */
  return (
    <div className="min-h-screen bg-slate-900 text-slate-300 p-4 lg:p-6">
      <div className="max-w-screen-xl mx-auto">
        <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h1 className="text-xl font-bold text-white">Dashboard Comparativo de Ventas</h1>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="text-xs font-medium text-slate-400">Mes 1</label>
              <Input
                type="month"
                value={month1}
                onChange={e => setMonth1(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-300 mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400">Mes 2 (vs.)</label>
              <Input
                type="month"
                value={month2}
                onChange={e => setMonth2(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-300 mt-1"
              />
            </div>

            {/* Filtros por Zona / Ruta */}
            <div>
              <label className="text-xs font-medium text-slate-400">Zona</label>
              <select
                value={selectedZone}
                onChange={(e) => { setSelectedZone(e.target.value); setSelectedRoute('__ALL__'); }}
                className="bg-slate-800 border-slate-700 text-slate-300 mt-1 rounded-md px-2 py-2 text-sm min-w-[10rem]"
              >
                <option value="__ALL__">Todas</option>
                {processedData.zoneOptions?.map(z => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400">Ruta</label>
              <select
                value={selectedRoute}
                onChange={(e) => setSelectedRoute(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-300 mt-1 rounded-md px-2 py-2 text-sm min-w-[10rem]"
              >
                <option value="__ALL__">Todas</option>
                {processedData.routeOptions?.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <Button
              onClick={handleUpdate}
              disabled={loading}
              className="bg-orange-600 hover:bg-orange-700 px-5 py-2 self-end"
            >
              {loading ? 'Cargando...' : 'Actualizar'}
            </Button>
          </div>
        </header>

        {/* KPIs principales */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          <KpiCard title="Venta en Pesos" value={fmt(processedData.kpis.venta?.val, 'currency', 'MXN', 0)} change={processedData.kpis.venta?.change} baseLabel={M2Label} baseValue={fmt(processedData.kpis.venta?.base, 'currency', 'MXN', 0)} icon={DollarSign} isLoading={loading} />
          <KpiCard title="Venta HTL" value={`${fmt(processedData.kpis.htls?.val, 'decimal', '', 2)} HL`} change={processedData.kpis.htls?.change} baseLabel={M2Label} baseValue={`${fmt(processedData.kpis.htls?.base, 'decimal', '', 2)} HL`} icon={BarChart2} isLoading={loading} />
          <KpiCard title="Venta en Cajas" value={fmt(processedData.kpis.cajas?.val, 'decimal', '', 0)} change={processedData.kpis.cajas?.change} baseLabel={M2Label} baseValue={fmt(processedData.kpis.cajas?.base, 'decimal', '', 0)} icon={Package} isLoading={loading} />
          <KpiCard title="Clientes con Compra" value={fmt(processedData.kpis.clientes?.val, 'decimal', '', 0)} change={processedData.kpis.clientes?.change} baseLabel={M2Label} baseValue={fmt(processedData.kpis.clientes?.base, 'decimal', '', 0)} icon={Users} isLoading={loading} />
          <KpiCard title="Descuento Otorgado" value={fmt(processedData.kpis.descuento?.val, 'currency', 'MXN', 0)} change={processedData.kpis.descuento?.change} baseLabel={M2Label} baseValue={fmt(processedData.kpis.descuento?.base, 'currency', 'MXN', 0)} icon={Wallet} isLoading={loading} />
        </div>

        {/* KPIs secundarios */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KpiCard
            title="Cumplimiento Meta HTL"
            value={fmt(processedData.kpis.cumplimiento?.val, 'percent')}
            subValue={`Meta: ${fmt(processedData.metaHtl, 'decimal', '', 2)} HL`}
            baseLabel="Meta"
            baseValue={`${fmt(processedData.kpis.cumplimiento?.base, 'decimal', '', 2)} HL`}
            icon={TrendingUp}
            isLoading={loading}
          />
          <KpiCard
            title="SKU Vendidos"
            value={fmt(processedData.kpis.skuVendidos?.val, 'decimal', '', 0)}
            change={processedData.kpis.skuVendidos?.change}
            baseLabel={M2Label}
            baseValue={fmt(processedData.kpis.skuVendidos?.base, 'decimal', '', 0)}
            icon={Package}
            isLoading={loading}
          />
          <KpiCard
            title="Zona con Mayor Venta (HTL)"
            value={processedData.zoneMayor ? fmt(processedData.zoneMayor[1], 'decimal', '', 2) : '-'}
            subValue={processedData.zoneMayor?.[0]}
            icon={TrendingUp}
            isLoading={loading}
          />
          <KpiCard
            title="Zona con Menor Venta (HTL)"
            value={processedData.zoneMenor ? fmt(processedData.zoneMenor[1], 'decimal', '', 2) : '-'}
            subValue={processedData.zoneMenor?.[0]}
            icon={Ban}
            isLoading={loading}
          />
        </div>

        {/* Gráficas de línea */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <Card className="rounded-xl bg-slate-900/50 border-slate-700/50 h-72">
            <CardContent className="p-4 h-full">
              <h4 className="font-semibold text-slate-200 mb-2 text-sm">Venta Acumulada en Hectolitros (HTL)</h4>
              <ResponsiveContainer width="100%" height="90%">
                {loading ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <LineChart data={processedData.charts.dailyTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => fmt(v, 'decimal', '', 1)} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line name={`HTL Acum. ${M1Label}`} type="monotone" dataKey={`HTL Acum. ${M1Label}`} stroke="#fb923c" strokeWidth={2} dot={false} />
                    <Line name={`HTL Acum. ${M2Label}`} type="monotone" dataKey={`HTL Acum. ${M2Label}`} stroke="#60a5fa" strokeWidth={2} dot={false} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="rounded-xl bg-slate-900/50 border-slate-700/50 h-72">
            <CardContent className="p-4 h-full">
              <h4 className="font-semibold text-slate-200 mb-2 text-sm">Clientes por Día</h4>
              <ResponsiveContainer width="100%" height="90%">
                {loading ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <LineChart data={processedData.charts.dailyTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line name={`Clientes ${M1Label}`} type="monotone" dataKey={`Clientes ${M1Label}`} stroke="#84cc16" strokeWidth={2} dot={false} />
                    <Line name={`Clientes ${M2Label}`} type="monotone" dataKey={`Clientes ${M2Label}`} stroke="#a855f7" strokeWidth={2} dot={false} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="rounded-xl bg-slate-900/50 border-slate-700/50 h-72">
            <CardContent className="p-4 h-full">
              <h4 className="font-semibold text-slate-200 mb-2 text-sm">Descuentos por Día (Acumulado)</h4>
              <ResponsiveContainer width="100%" height="90%">
                {loading ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <LineChart data={processedData.charts.dailyTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `${fmt(v / 1000, 'decimal', '', 0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line name={`Descuento Acum. ${M1Label}`} type="monotone" dataKey={`Descuento Acum. ${M1Label}`} stroke="#f43f5e" strokeWidth={2} dot={false} />
                    <Line name={`Descuento Acum. ${M2Label}`} type="monotone" dataKey={`Descuento Acum. ${M2Label}`} stroke="#eab308" strokeWidth={2} dot={false} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Top clientes + Pies */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Top 10 Clientes (base Mes 2) */}
          <div className="lg:col-span-2">
            <Card className="rounded-xl bg-slate-900/50 border-slate-700/50">
              <CardHeader className="p-3">
                <CardTitle className="text-sm">Top 10 Clientes por Compra (HTL)</CardTitle>
                <p className="text-[11px] text-slate-400">Ordenados por {M2Label} para identificar caídas en {M1Label}.</p>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <Skeleton className="h-[370px] w-full" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left text-slate-300">
                      <thead className="text-[10px] text-slate-400 uppercase bg-slate-800/60 sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-2">Cliente</th>
                          <th className="px-3 py-2 text-right">HTL {M1Label}</th>
                          <th className="px-3 py-2 text-right">HTL {M2Label}</th>
                          <th className="px-3 py-2 text-right">Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {processedData.tables.topClients.map((client, index) => (
                          <tr key={index} className="border-b border-slate-700/40 hover:bg-slate-800/40">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-400/20 to-sky-400/20 ring-1 ring-white/10 flex items-center justify-center text-[10px] font-semibold text-emerald-200">
                                  {initials(client.name)}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-slate-50 truncate max-w-[260px]">{client.name}</div>
                                  <div className="text-[10px] text-slate-400">
                                    <span className="px-1.5 py-0.5 rounded-full bg-slate-800/70 ring-1 ring-slate-700/60">{client.cve}</span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right align-top">
                              <div className="inline-block min-w-[80px]">{fmt(client.htlsP1, 'decimal', '', 2)}</div>
                            </td>
                            <td className="px-3 py-2 text-right align-top">
                              <div className="inline-block min-w-[80px]">{fmt(client.htlsP2, 'decimal', '', 2)}</div>
                              <div className="mt-1 h-1.5 rounded bg-slate-700/60 overflow-hidden" title={`${client.share}% del total del mes base`}>
                                <div
                                  className="h-full bg-gradient-to-r from-orange-400 to-amber-300"
                                  style={{ width: `${client.share}%` }}
                                />
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right align-top">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] ring-1
                                  ${client.diff >= 0
                                    ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
                                    : 'bg-rose-500/10 text-rose-400 ring-rose-500/20'
                                  }`}
                              >
                                {client.diff >= 0 ? '▲' : '▼'} {fmt(Math.abs(client.diff), 'decimal', '', 2)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Pies */}
          <div className="grid grid-cols-1 gap-6">
            {/* Zonas */}
            <Card className="rounded-xl bg-slate-900/50 border-slate-700/50">
              <CardHeader className="p-3"><CardTitle className="text-sm text-center">Aportación por Zona (HTL)</CardTitle></CardHeader>
              <CardContent className="p-2">
                {loading ? (
                  <Skeleton className="h-[160px] w-full" />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 items-center">
                      <div>
                        <h5 className="text-center text-xs font-medium text-slate-300">{M1Label}</h5>
                        <ResponsiveContainer width="100%" height={110}>
                          <PieChart>
                            <Pie data={processedData.pies.zoneP1} dataKey="value" nameKey="name"
                              innerRadius="40%" outerRadius="60%" paddingAngle={2} cy="50%">
                              {processedData.pies.zoneP1?.map((e, i) => (
                                <Cell key={`cell-z1-${i}`} fill={processedData.colorMaps.zone[e.name] || BASE_COLORS[i % BASE_COLORS.length]} onClick={() => setSelectedZone(e.name)} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(val, name) => [fmt(val, 'decimal', '', 2) + ' HL', name]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div>
                        <h5 className="text-center text-xs font-medium text-slate-300">{M2Label}</h5>
                        <ResponsiveContainer width="100%" height={110}>
                          <PieChart>
                            <Pie data={processedData.pies.zoneP2} dataKey="value" nameKey="name"
                              innerRadius="40%" outerRadius="60%" paddingAngle={2} cy="50%">
                              {processedData.pies.zoneP2?.map((e, i) => (
                                <Cell key={`cell-z2-${i}`} fill={processedData.colorMaps.zone[e.name] || BASE_COLORS[i % BASE_COLORS.length]} onClick={() => setSelectedZone(e.name)} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(val, name) => [fmt(val, 'decimal', '', 2) + ' HL', name]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <SwatchLegend
                      items={processedData.legends.zone}
                      getKey={(x) => x}
                      getLabel={(x) => x}
                      colorMap={processedData.colorMaps.zone}
                    />
                  </>
                )}
              </CardContent>
            </Card>

            {/* SKUs */}
            <Card className="rounded-xl bg-slate-900/50 border-slate-700/50">
              <CardHeader className="p-3"><CardTitle className="text-sm text-center">Aportación por SKU (Top 5 HTL)</CardTitle></CardHeader>
              <CardContent className="p-2">
                {loading ? (
                  <Skeleton className="h-[160px] w-full" />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 items-center">
                      <div>
                        <h5 className="text-center text-xs font-medium text-slate-300">{M1Label}</h5>
                        <ResponsiveContainer width="100%" height={110}>
                          <PieChart>
                            <Pie data={processedData.pies.skuP1} dataKey="value" nameKey="name"
                              innerRadius="40%" outerRadius="60%" paddingAngle={2} cy="50%">
                              {processedData.pies.skuP1?.map((e, i) => (
                                <Cell key={`cell-s1-${i}`} fill={processedData.colorMaps.sku[e.code] || BASE_COLORS[i % BASE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(val, name) => [fmt(val, 'decimal', '', 2) + ' HL', name]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div>
                        <h5 className="text-center text-xs font-medium text-slate-300">{M2Label}</h5>
                        <ResponsiveContainer width="100%" height={110}>
                          <PieChart>
                            <Pie data={processedData.pies.skuP2} dataKey="value" nameKey="name"
                              innerRadius="40%" outerRadius="60%" paddingAngle={2} cy="50%">
                              {processedData.pies.skuP2?.map((e, i) => (
                                <Cell key={`cell-s2-${i}`} fill={processedData.colorMaps.sku[e.code] || BASE_COLORS[i % BASE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(val, name) => [fmt(val, 'decimal', '', 2) + ' HL', name]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <SwatchLegend
                      items={processedData.legends.sku}
                      getKey={(x) => x.key}
                      getLabel={(x) => x.label}
                      colorMap={processedData.colorMaps.sku}
                    />
                  </>
                )}
              </CardContent>
            </Card>

            {/* Clientes ratio */}
            <Card className="rounded-xl bg-slate-900/50 border-slate-700/50">
              <CardHeader className="p-3"><CardTitle className="text-sm text-center">Clientes: Compra vs Total</CardTitle></CardHeader>
              <CardContent className="p-2">
                {loading ? (
                  <Skeleton className="h-[120px] w-full" />
                ) : (
                  <div className="grid grid-cols-2 gap-2 items-center">
                    <div>
                      <h5 className="text-center text-xs font-medium text-slate-300">{M1Label}</h5>
                      <ResponsiveContainer width="100%" height={100}>
                        <PieChart>
                          <Pie data={processedData.pies.clientsRatioP1} dataKey="value" nameKey="name"
                            innerRadius="40%" outerRadius="60%" paddingAngle={2} cy="50%">
                            {processedData.pies.clientsRatioP1?.map((e, i) => (
                              <Cell key={`cell-c1-${i}`} fill={BASE_COLORS[i % BASE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(val) => (val || 0).toLocaleString('es-MX')} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div>
                      <h5 className="text-center text-xs font-medium text-slate-300">{M2Label}</h5>
                      <ResponsiveContainer width="100%" height={100}>
                        <PieChart>
                          <Pie data={processedData.pies.clientsRatioP2} dataKey="value" nameKey="name"
                            innerRadius="40%" outerRadius="60%" paddingAngle={2} cy="50%">
                            {processedData.pies.clientsRatioP2?.map((e, i) => (
                              <Cell key={`cell-c2-${i}`} fill={BASE_COLORS[i % BASE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(val) => (val || 0).toLocaleString('es-MX')} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------------- Small components ---------------- */
const KpiCard = ({ title, value, change, icon: Icon, isLoading, subValue, baseLabel, baseValue }) => {
  const changeColor = (typeof change === 'number' && change < 0) ? 'text-red-400' : 'text-green-400';
  const changeSymbol = (typeof change === 'number' && change < 0) ? '▼' : '▲';

  return (
    <Card className="bg-slate-800/60 border-slate-700/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">{title}</CardTitle>
        {Icon && <Icon className="h-4 w-4 text-slate-500" />}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <>
            <Skeleton className="h-8 w-1/2 mb-1" />
            <Skeleton className="h-4 w-1/4" />
          </>
        ) : (
          <>
            <div className="text-2xl font-bold text-slate-50">{value}</div>
            {change !== undefined && change !== null && isFinite(change) && (
              <p className={`text-xs ${changeColor}`}>
                {`${changeSymbol} ${Math.abs(change).toFixed(1)}%`}
                {baseLabel && baseValue ? ` · vs ${baseLabel}: ${baseValue}` : ''}
              </p>
            )}
            {subValue && <p className="text-xs text-slate-400 mt-1">{subValue}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-lg p-3 text-sm">
        <p className="font-bold text-slate-200 mb-2">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>
            {`${p.name}: ${Number(p.value).toLocaleString('es-MX', { maximumFractionDigits: 2 })}`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default ComparativeDashboard;
