// src/pages/admin/PromotionsAnalysisPage.jsx
// Análisis de Promociones — Solo Admin
// Carga datos ZONA POR ZONA para evitar el límite de filas de la API
// y permite ver exactamente en qué zonas, rutas y clientes se vendió cada SKU a qué precio.

import React, { useState, useMemo, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchVentasPorSku } from '@/lib/mysqlVentasPorSku';
import { fetchAllClientsOnline } from '@/repositories/clientsRepository';
import { supabase } from '@/supabaseClient';
import {
    Tag, Users, MapPin, TrendingDown, BarChart2, Box, DollarSign,
    Download, Loader2, Search, Filter, RefreshCw, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import Papa from 'papaparse';

/* ─────────────── helpers ─────────────── */
const strip = (s) => (s ?? '').toString().trim();
const fmt = (v, decimals = 2) =>
    v == null || isNaN(v) ? '—' :
        new Intl.NumberFormat('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
const fmtCur = (v) =>
    v == null || isNaN(v) ? '—' :
        new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

const NOW = new Date();
const defaultFrom = format(startOfMonth(subMonths(NOW, 0)), 'yyyy-MM-dd');
const defaultTo = format(endOfMonth(NOW), 'yyyy-MM-dd');


/* ─────────────── Helper: igual que SupervisorDashboard.routeFromRow ─────────────── */
const isZeroLike = (s) => {
    if (!s) return true;
    const str = String(s).trim();
    return str === '0' || str === '00' || str === '000';
};

/**
 * Extrae el identificador de ruta de una fila de ventas_por_sku.
 * Mismo algoritmo que SupervisorDashboard.routeFromRow:
 * 1. ruta_express si no es cero/vacío
 * 2. ruta como número
 * 3. fallback al sales_route del catálogo de clientes
 */
function routeFromRow(r, clientsByCode = new Map()) {
    const rx = strip(r?.ruta_express || '');
    if (rx && !isZeroLike(rx)) return rx;

    // ruta_resuelta es el nombre legible si la API lo incluye
    const rr = strip(r?.ruta_resuelta || '');
    if (rr && !isZeroLike(rr)) return rr;

    const rn = r?.ruta;
    const n = Number(rn);
    if (Number.isFinite(n) && n > 0) return String(n);
    if (typeof rn === 'string' && rn && !isZeroLike(rn)) return strip(rn);

    // Fallback: buscar en catálogo de clientes
    const cKey = strip(r?.cve_cliente || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const c = clientsByCode.get(cKey);
    const alt = strip(c?.sales_route || c?.ruta || c?.internal_route || c?.route || '');
    return alt && !isZeroLike(alt) ? alt : null;
}

/* ─────────────── Fetch ALL data route-by-route (patrón SupervisorDashboard) ─────────────── */
async function fetchAllRoutesData({ from, to, onProgress }) {
    // 1. Obtener todas las rutas disponibles de Supabase
    //    (supervisor_allowed_sales_routes contiene TODAS las rutas del sistema)
    let routes = [];
    try {
        const { data: rRows } = await supabase
            .from('supervisor_allowed_sales_routes')
            .select('sales_route')
            .not('sales_route', 'is', null);
        const fromTable = (rRows || [])
            .map(r => strip(r.sales_route))
            .filter(Boolean);
        routes = [...new Set(fromTable)].sort();
    } catch (e) {
        console.warn('[PromotionsAnalysis] No se pudo leer rutas de supervisor_allowed_sales_routes:', e);
    }

    // 2. Fallback: obtener zonas de metas_zona si no hay rutas
    if (routes.length === 0) {
        onProgress?.('Sin rutas configuradas — cargando sin filtro...', 30);
        try {
            const rows = await fetchVentasPorSku({ from, nextFrom: to });
            return rows || [];
        } catch {
            return [];
        }
    }

    // 3. Iterar ruta por ruta — igual que syncSalesForRoutes
    const allRows = [];
    for (let i = 0; i < routes.length; i++) {
        const salesRoute = routes[i];
        onProgress?.(
            `Ruta ${i + 1}/${routes.length}: ${salesRoute}`,
            Math.round(((i + 1) / routes.length) * 100)
        );
        try {
            const rows = await fetchVentasPorSku({ from, nextFrom: to, ruta: salesRoute });
            if (rows?.length) allRows.push(...rows);
        } catch (e) {
            console.warn(`[PromotionsAnalysis] Error ruta "${salesRoute}":`, e);
        }
        if (i < routes.length - 1) await new Promise(r => setTimeout(r, 120));
    }

    // 4. Deduplicar por clave robusta (misma lógica que SupervisorDashboard)
    const seen = new Set();
    return allRows.filter(r => {
        const rutaKey = strip(r.ruta_resuelta || String(r.ruta || ''));
        const zonaKey = strip(r.zona_u || r.zona || '');
        const key = `${r.cve_cliente}_${r.cve_marca}_${r.fecha_alta || r.period_date}_${zonaKey}_${rutaKey}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/* ─────────────── KPI Card ─────────────── */
function KpiCard({ icon: Icon, title, value, sub, color = 'from-slate-700 to-slate-800' }) {
    return (
        <Card className={`bg-gradient-to-br ${color} border-0 text-white shadow-lg overflow-hidden`}>
            <CardContent className="p-3 sm:p-4 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] sm:text-[11px] font-medium opacity-80 mb-0.5 sm:mb-1 truncate">{title}</p>
                    <p className="text-lg sm:text-xl font-bold truncate tracking-tight">{value}</p>
                    {sub && <p className="text-[9px] sm:text-[10px] opacity-70 mt-0.5 truncate">{sub}</p>}
                </div>
                <Icon className="h-6 w-6 sm:h-8 sm:w-8 opacity-20 shrink-0" />
            </CardContent>
        </Card>
    );
}

/* ─────────────── Sortable Table ─────────────── */
function SortableTable({ rows, columns, title, maxRows = 200 }) {
    const [sortCol, setSortCol] = useState(columns[0]?.key);
    const [sortDir, setSortDir] = useState('desc');
    const [search, setSearch] = useState('');

    const sorted = useMemo(() => {
        let data = rows.filter(r => {
            if (!search) return true;
            return Object.values(r).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase()));
        });
        return [...data].sort((a, b) => {
            const va = a[sortCol], vb = b[sortCol];
            if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'desc' ? vb - va : va - vb;
            return sortDir === 'desc'
                ? String(vb ?? '').localeCompare(String(va ?? ''), 'es')
                : String(va ?? '').localeCompare(String(vb ?? ''), 'es');
        }).slice(0, maxRows);
    }, [rows, sortCol, sortDir, search]);

    const handleSort = (col) => {
        if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        else { setSortCol(col); setSortDir('desc'); }
    };

    const exportCsv = () => {
        const allSorted = [...rows].sort((a, b) => {
            const va = a[sortCol], vb = b[sortCol];
            if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'desc' ? vb - va : va - vb;
            return sortDir === 'desc'
                ? String(vb ?? '').localeCompare(String(va ?? ''), 'es')
                : String(va ?? '').localeCompare(String(vb ?? ''), 'es');
        });
        const csv = Papa.unparse(allSorted.map(r => {
            const out = {};
            columns.forEach(c => { out[c.label] = r[c.key]; });
            return out;
        }));
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${title.toLowerCase().replace(/\s+/g, '_')}.csv`; a.click();
    };

    return (
        <Card className="bg-slate-800/50 border-slate-700/50 w-full overflow-hidden">
            <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3 border-b border-slate-700/50 sm:border-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-2">
                    <CardTitle className="text-white text-sm flex items-center flex-wrap gap-1">
                        {title}
                        <span className="text-slate-400 font-normal text-xs">({rows.length.toLocaleString()} registros)</span>
                    </CardTitle>
                    <div className="flex gap-2 items-center w-full sm:w-auto">
                        <div className="relative flex-1 sm:flex-none">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Buscar..."
                                className="pl-8 pr-3 py-1.5 text-xs bg-slate-700/50 border border-slate-600 text-white rounded-lg w-full sm:w-40 focus:outline-none focus:border-emerald-500/50 shadow-inner"
                            />
                        </div>
                        <button onClick={exportCsv} title="Exportar CSV"
                            className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700/30 hover:bg-emerald-700/50 border border-emerald-600/30 text-emerald-300 transition-colors text-xs shrink-0 min-h-[28px]">
                            <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">CSV</span>
                        </button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0 overflow-hidden">
                <div className="overflow-x-auto w-full" style={{ maxHeight: 'min(520px, 65vh)', overflowY: 'auto' }}>
                    <table className="text-xs text-left" style={{ minWidth: 'max-content', width: '100%' }}>
                        <thead className="bg-slate-900/70 border-b border-slate-700 sticky top-0 z-10">
                            <tr>
                                {columns.map(c => (
                                    <th key={c.key} onClick={() => handleSort(c.key)}
                                        className="px-3 py-2.5 text-slate-400 font-medium cursor-pointer hover:text-white transition-colors whitespace-nowrap select-none">
                                        {c.label} {sortCol === c.key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/30">
                            {sorted.length === 0 ? (
                                <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-slate-500">Sin datos</td></tr>
                            ) : sorted.map((row, i) => (
                                <tr key={i} className="hover:bg-slate-700/20 transition-colors">
                                    {columns.map(c => (
                                        <td key={c.key} className={`px-3 py-2 whitespace-nowrap ${c.highlight ? 'font-bold text-amber-300' : c.accent ? 'font-semibold text-emerald-300' : 'text-slate-300'}`}>
                                            {c.fmt ? c.fmt(row[c.key], row) : (row[c.key] ?? '—')}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {sorted.length === maxRows && rows.length > maxRows && (
                        <p className="text-center text-xs text-slate-500 py-2 border-t border-slate-700/30">
                            Mostrando {maxRows.toLocaleString()} de {rows.length.toLocaleString()} — exporta CSV para ver todos
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

/* ─────────────── Main Page ─────────────── */
export default function PromotionsAnalysisPage() {
    const [from, setFrom] = useState(defaultFrom);
    const [to, setTo] = useState(defaultTo);
    const [maxPrice, setMaxPrice] = useState('');
    const [minPrice, setMinPrice] = useState('');
    const [skuFilter, setSkuFilter] = useState('');
    const [clienteFilter, setClienteFilter] = useState('');
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState('');
    const [progressPct, setProgressPct] = useState(0);
    const [rawRows, setRawRows] = useState(null);
    const [skuDescMap, setSkuDescMap] = useState({});
    const [clientMap, setClientMap] = useState({});
    const [activeTab, setActiveTab] = useState('sku');
    const abortRef = useRef(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setProgress('Iniciando...');
        setProgressPct(0);
        abortRef.current = false;

        try {
            setProgress('Cargando catálogo de SKUs...');
            // 1. Solo catálogo de SKUs (rápido, Supabase)
            const skuRows = await supabase
                .from('sku_descripcion')
                .select('cve_marca, descripcion, marca')
                .then(r => r.data || []);

            const descMap = {};
            for (const r of skuRows) {
                const k = strip(r.cve_marca);
                if (k) descMap[k] = strip(r.descripcion || r.marca) || k;
            }
            setSkuDescMap(descMap);

            // 2. Fetch de ventas ruta por ruta
            const rows = await fetchAllRoutesData({
                from, to,
                onProgress: (msg, pct) => {
                    setProgress(msg);
                    setProgressPct(pct);
                }
            });

            // 3. Cargar nombres de clientes desde MySQL — solo las rutas que aparecen en los datos
            //    (mucho más rápido que descargar los 14,799 clientes completos)
            const uniqueRoutes = [...new Set(
                (rows || []).map(r => strip(r.ruta_resuelta || String(r.ruta || ''))).filter(Boolean)
            )];
            const cMap = {};
            if (uniqueRoutes.length > 0) {
                setProgress(`Cargando clientes de ${uniqueRoutes.length} ruta(s)...`);
                try {
                    // fetchAllClientsOnline(routeArray) descarga solo las rutas indicadas
                    const clientList = await fetchAllClientsOnline(uniqueRoutes);
                    for (const c of (clientList || [])) {
                        const k = strip(c.client_code || c.cve_cliente || c.code);
                        if (k) cMap[k] = strip(c.business_name || c.name || c.nombre) || k;
                    }
                    console.log(`[PromotionsAnalysis] ${Object.keys(cMap).length} nombres de clientes cargados.`);
                } catch (e) {
                    console.warn('[PromotionsAnalysis] No se pudieron cargar nombres de clientes:', e);
                }
            }
            setClientMap(cMap);
            setRawRows(rows);
            setProgress('');
        } catch (e) {
            console.error('[PromotionsAnalysis] Error:', e);
            setProgress('Error al cargar datos.');
        } finally {
            setLoading(false);
        }
    }, [from, to]);

    // Procesado: enriquecer filas con precio/caja
    // Construir mapa de clientes para routeFromRow (igual que SupervisorDashboard.clientsByKey)
    const clientsByCode = useMemo(() => {
        const m = new Map();
        for (const [code, data] of Object.entries(clientMap)) {
            const k = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
            m.set(k, data);
        }
        return m;
    }, [clientMap]);

    const processedRows = useMemo(() => {
        if (!rawRows) return [];

        return rawRows.map(r => {
            const venta = Number(r.venta) || 0;
            // vta_cajas es el campo real de unidades (confirmado en API)
            const unidades = Number(r.vta_cajas || r.unidades) || 0;
            const htls = Number(r.htls_total || r.htls) || 0;
            const descuento = Number(r.descuento) || 0;
            // sobreprecio_ahorro es $/caja (tasa por caja)
            const sobreAhorroCaja = Number(r.sobreprecio_ahorro) || 0;
            const sobreAhorroTotal = sobreAhorroCaja * unidades; // impacto total en $
            const precioCaja = unidades > 0 ? venta / unidades : null;
            // Precio final = venta neta (después de descuento) dividida entre cajas
            const precioFinalCaja = unidades > 0 ? (venta - descuento) / unidades : null;
            // Usar routeFromRow exactamente igual que SupervisorDashboard
            const rutaRaw = routeFromRow(r, clientsByCode) || String(r.ruta || '—');
            // zona_u = zona unificada
            const zonaRaw = strip(r.zona_u || r.zona || '');
            return {
                ...r,
                venta, unidades, htls, descuento,
                sobreAhorroCaja, sobreAhorroTotal,
                precioCaja, precioFinalCaja,
                skuDesc: skuDescMap[strip(r.cve_marca)] || strip(r.producto || r.cve_marca) || '—',
                // Nombre del cliente: primero del mapa MySQL, luego campos en la fila, luego código
                clientName: clientMap[strip(r.cve_cliente)] || strip(r.cliente || r.client_name || r.nombre_cliente || r.cve_cliente) || '—',
                ruta_final: rutaRaw || '—',
                zona_final: zonaRaw || '—',
                fecha_final: strip(r.fecha_alta || r.period_date || r.fecha),
            };
        });
    }, [rawRows, skuDescMap, clientMap, clientsByCode]);

    // Filtros aplicados — promoRows es la fuente de verdad para KPIs, tablas y agrupaciones
    const promoRows = useMemo(() => {
        const maxP = maxPrice !== '' ? Number(maxPrice) : null;
        const minP = minPrice !== '' ? Number(minPrice) : null;
        const skuF = skuFilter.trim().toUpperCase();
        const cliF = clienteFilter.trim().toUpperCase();
        return processedRows.filter(r => {
            // Filtro por SKU o descripción de producto
            if (skuF && !strip(r.cve_marca).toUpperCase().includes(skuF) && !r.skuDesc.toUpperCase().includes(skuF)) return false;
            // Filtro por cliente (nombre o código)
            if (cliF && !r.clientName.toUpperCase().includes(cliF) && !strip(r.cve_cliente).toUpperCase().includes(cliF)) return false;
            // Filtro por precio/caja
            if (r.precioCaja === null) {
                if (maxP !== null || minP !== null) return false;
            } else {
                if (maxP !== null && r.precioCaja > maxP) return false;
                if (minP !== null && r.precioCaja < minP) return false;
            }
            return true;
        });
    }, [processedRows, maxPrice, minPrice, skuFilter, clienteFilter]);

    // KPIs
    const kpis = useMemo(() => {
        if (!promoRows.length) return null;
        const totalVenta = promoRows.reduce((s, r) => s + r.venta, 0);
        const totalHL = promoRows.reduce((s, r) => s + r.htls, 0);
        const totalDesc = promoRows.reduce((s, r) => s + r.descuento, 0);
        const totalCajas = promoRows.reduce((s, r) => s + r.unidades, 0);
        // sobreprecio_ahorro es $/caja → multiplicar por cajas de cada fila
        const totalSobreAhorro = promoRows.reduce((s, r) => s + r.sobreAhorroTotal, 0);
        const uniqueClients = new Set(promoRows.map(r => r.cve_cliente).filter(Boolean)).size;
        const uniqueSkus = new Set(promoRows.map(r => r.cve_marca).filter(Boolean)).size;
        const uniqueRoutes = new Set(promoRows.map(r => r.ruta_final).filter(Boolean)).size;
        const uniqueZones = new Set(promoRows.map(r => r.zona_final).filter(Boolean)).size;
        const avgPriceCaja = totalCajas > 0 ? totalVenta / totalCajas : 0;
        const totalBruto = totalVenta + totalDesc;
        const descPct = totalBruto > 0 ? (totalDesc / totalBruto) * 100 : 0;
        return { totalVenta, totalHL, totalDesc, totalCajas, totalSobreAhorro, uniqueClients, uniqueSkus, uniqueRoutes, uniqueZones, avgPriceCaja, descPct };
    }, [promoRows]);

    // ─── Agrupaciones ───
    const bySkuRows = useMemo(() => {
        const map = new Map();
        for (const r of promoRows) {
            const k = strip(r.cve_marca) || '?';
            const cur = map.get(k) || { sku: k, desc: r.skuDesc, venta: 0, htls: 0, descuento: 0, sobreAhorroTotal: 0, cajas: 0, clientes: new Set(), rutas: new Set(), zonas: new Set(), precios: [] };
            cur.venta += r.venta; cur.htls += r.htls; cur.descuento += r.descuento; cur.sobreAhorroTotal += r.sobreAhorroTotal; cur.cajas += r.unidades;
            if (r.cve_cliente) cur.clientes.add(r.cve_cliente);
            if (r.ruta_final && r.ruta_final !== '—') cur.rutas.add(r.ruta_final);
            if (r.zona_final && r.zona_final !== '—') cur.zonas.add(r.zona_final);
            if (r.precioCaja != null) cur.precios.push(r.precioCaja);
            map.set(k, cur);
        }
        return [...map.values()].map(r => ({
            ...r,
            clientes: r.clientes.size, rutas: r.rutas.size, zonas: r.zonas.size,
            precioCaja: r.precios.length ? r.precios.reduce((a, b) => a + b, 0) / r.precios.length : 0,
            precioMin: r.precios.length ? Math.min(...r.precios) : 0,
            precioMax: r.precios.length ? Math.max(...r.precios) : 0,
            precioFinalCaja: r.cajas > 0 ? (r.venta - r.descuento) / r.cajas : 0,
        }));
    }, [promoRows]);

    // SKU × Zona — tabla cruzada
    const bySkuZonaRows = useMemo(() => {
        const map = new Map();
        for (const r of promoRows) {
            const sku = strip(r.cve_marca) || '?';
            const zona = r.zona_final;
            const key = `${sku}__${zona}`;
            const cur = map.get(key) || { sku, desc: r.skuDesc, zona, venta: 0, htls: 0, descuento: 0, sobreAhorroTotal: 0, cajas: 0, clientes: new Set(), rutas: new Set() };
            cur.venta += r.venta; cur.htls += r.htls; cur.descuento += r.descuento; cur.sobreAhorroTotal += r.sobreAhorroTotal; cur.cajas += r.unidades;
            if (r.cve_cliente) cur.clientes.add(r.cve_cliente);
            if (r.ruta_final !== '—') cur.rutas.add(r.ruta_final);
            map.set(key, cur);
        }
        return Array.from(map.values()).map(r => ({
            sku: r.sku, desc: r.desc, zona: r.zona,
            cajas: r.cajas, htls: r.htls, venta: r.venta, descuento: r.descuento, sobreAhorroTotal: r.sobreAhorroTotal,
            precioCaja: r.cajas > 0 ? r.venta / r.cajas : 0,
            precioFinalCaja: r.cajas > 0 ? (r.venta - r.descuento) / r.cajas : 0,
            clientes: r.clientes.size, rutas: r.rutas.size,
        }));
    }, [promoRows]);

    // SKU × Ruta
    const bySkuRutaRows = useMemo(() => {
        const map = new Map();
        for (const r of promoRows) {
            const sku = strip(r.cve_marca) || '?';
            const ruta = r.ruta_final;
            const key = `${sku}__${ruta}`;
            const cur = map.get(key) || { sku, desc: r.skuDesc, ruta, zona: r.zona_final, venta: 0, htls: 0, descuento: 0, sobreAhorroTotal: 0, cajas: 0, clientes: new Set() };
            cur.venta += r.venta; cur.htls += r.htls; cur.descuento += r.descuento; cur.sobreAhorroTotal += r.sobreAhorroTotal; cur.cajas += r.unidades;
            if (r.cve_cliente) cur.clientes.add(r.cve_cliente);
            map.set(key, cur);
        }
        return Array.from(map.values()).map(r => ({
            sku: r.sku, desc: r.desc, ruta: r.ruta, zona: r.zona,
            cajas: r.cajas, htls: r.htls, venta: r.venta, descuento: r.descuento, sobreAhorroTotal: r.sobreAhorroTotal,
            precioCaja: r.cajas > 0 ? r.venta / r.cajas : 0,
            precioFinalCaja: r.cajas > 0 ? (r.venta - r.descuento) / r.cajas : 0,
            clientes: r.clientes.size,
        }));
    }, [promoRows]);

    // SKU × Cliente
    const bySkuClienteRows = useMemo(() => {
        const map = new Map();
        for (const r of promoRows) {
            const sku = strip(r.cve_marca) || '?';
            const cli = strip(r.cve_cliente) || '?';
            const key = `${sku}__${cli}`;
            const cur = map.get(key) || { sku, desc: r.skuDesc, cve: cli, nombre: r.clientName, zona: r.zona_final, ruta: r.ruta_final, venta: 0, htls: 0, descuento: 0, sobreAhorroTotal: 0, cajas: 0 };
            cur.venta += r.venta; cur.htls += r.htls; cur.descuento += r.descuento; cur.sobreAhorroTotal += r.sobreAhorroTotal; cur.cajas += r.unidades;
            map.set(key, cur);
        }
        return Array.from(map.values()).map(r => ({
            sku: r.sku, desc: r.desc, cve: r.cve, nombre: r.nombre,
            zona: r.zona, ruta: r.ruta,
            cajas: r.cajas, htls: r.htls, venta: r.venta, descuento: r.descuento, sobreAhorroTotal: r.sobreAhorroTotal,
            precioCaja: r.cajas > 0 ? r.venta / r.cajas : 0,
            precioFinalCaja: r.cajas > 0 ? (r.venta - r.descuento) / r.cajas : 0,
        }));
    }, [promoRows]);

    // Detalle
    const detailRows = useMemo(() => promoRows.map(r => ({
        fecha: r.fecha_final, sku: r.cve_marca, desc: r.skuDesc,
        cve: strip(r.cve_cliente), nombre: r.clientName,
        zona: r.zona_final, ruta: r.ruta_final,
        cajas: r.unidades, htls: r.htls, venta: r.venta,
        descuento: r.descuento,
        sobreAhorroCaja: r.sobreAhorroCaja,  // tasa $/caja
        precioCaja: r.precioCaja,
        precioFinalCaja: r.precioFinalCaja,
    })), [promoRows]);

    const TABS = [
        { key: 'sku', label: 'Por SKU' },
        { key: 'sku_zona', label: 'SKU × Zona' },
        { key: 'sku_ruta', label: 'SKU × Ruta' },
        { key: 'sku_cliente', label: 'SKU × Cliente' },
        { key: 'detalle', label: 'Detalle' },
    ];

    const P = (label, key, extra = {}) => ({ label, key, fmt: extra.cur ? fmtCur : extra.dec != null ? v => fmt(v, extra.dec) : undefined, highlight: extra.highlight, accent: extra.accent, ...extra });
    const PF = (label, key) => P(label, key, { cur: true, accent: true });
    // pivot tables: sobreAhorroTotal = rate * cajas acumulado
    // detail table: sobreAhorroCaja = rate $/caja del registro
    const skuCols = [P('SKU', 'sku'), P('Descripción', 'desc'), P('Cajas', 'cajas', { dec: 0 }), P('HL', 'htls', { dec: 2 }), P('$/Caja Bruto', 'precioCaja', { cur: true, highlight: true }), PF('$/Caja Final', 'precioFinalCaja'), P('$/Caja Min', 'precioMin', { cur: true }), P('$/Caja Max', 'precioMax', { cur: true }), P('Venta $', 'venta', { cur: true }), P('Descuento $', 'descuento', { cur: true }), P('Sobreprecio/Ahorro $', 'sobreAhorroTotal', { cur: true }), P('Clientes', 'clientes', { dec: 0 }), P('Rutas', 'rutas', { dec: 0 }), P('Zonas', 'zonas', { dec: 0 })];
    const zonasCols = [P('SKU', 'sku'), P('Descripción', 'desc'), P('Zona', 'zona', { accent: true }), P('Cajas', 'cajas', { dec: 0 }), P('HL', 'htls', { dec: 2 }), P('$/Caja Bruto', 'precioCaja', { cur: true, highlight: true }), PF('$/Caja Final', 'precioFinalCaja'), P('Venta $', 'venta', { cur: true }), P('Descuento $', 'descuento', { cur: true }), P('Sobreprecio/Ahorro $', 'sobreAhorroTotal', { cur: true }), P('Clientes', 'clientes', { dec: 0 }), P('Rutas', 'rutas', { dec: 0 })];
    const rutasCols = [P('SKU', 'sku'), P('Descripción', 'desc'), P('Ruta', 'ruta', { accent: true }), P('Zona', 'zona'), P('Cajas', 'cajas', { dec: 0 }), P('HL', 'htls', { dec: 2 }), P('$/Caja Bruto', 'precioCaja', { cur: true, highlight: true }), PF('$/Caja Final', 'precioFinalCaja'), P('Venta $', 'venta', { cur: true }), P('Descuento $', 'descuento', { cur: true }), P('Sobreprecio/Ahorro $', 'sobreAhorroTotal', { cur: true }), P('Clientes', 'clientes', { dec: 0 })];
    const cliCols = [P('SKU', 'sku'), P('Descripción', 'desc'), P('Código', 'cve'), P('Cliente', 'nombre', { accent: true }), P('Zona', 'zona'), P('Ruta', 'ruta'), P('Cajas', 'cajas', { dec: 0 }), P('HL', 'htls', { dec: 2 }), P('$/Caja Bruto', 'precioCaja', { cur: true, highlight: true }), PF('$/Caja Final', 'precioFinalCaja'), P('Venta $', 'venta', { cur: true }), P('Descuento $', 'descuento', { cur: true }), P('Sobreprecio/Ahorro $', 'sobreAhorroTotal', { cur: true })];
    const detCols = [P('Fecha', 'fecha'), P('SKU', 'sku'), P('Producto', 'desc'), P('Cliente', 'nombre'), P('Zona', 'zona'), P('Ruta', 'ruta'), P('Cajas', 'cajas', { dec: 0 }), P('HL', 'htls', { dec: 2 }), P('$/Caja Bruto', 'precioCaja', { cur: true, highlight: true }), PF('$/Caja Final', 'precioFinalCaja'), P('Venta $', 'venta', { cur: true }), P('Descuento $', 'descuento', { cur: true }), P('Sobreprecio/Ahorro $/caja', 'sobreAhorroCaja', { cur: true })];

    const tableMap = { sku: [bySkuRows, skuCols, 'Resumen por SKU'], sku_zona: [bySkuZonaRows, zonasCols, 'SKU por Zona'], sku_ruta: [bySkuRutaRows, rutasCols, 'SKU por Ruta'], sku_cliente: [bySkuClienteRows, cliCols, 'SKU por Cliente'], detalle: [detailRows, detCols, 'Detalle de Transacciones'] };

    return (
        <div className="w-full min-w-0 max-w-full overflow-x-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl p-4 sm:p-6">
            <Helmet><title>Análisis de Promociones | Admin</title></Helmet>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5 min-w-0">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 min-w-0">
                        <Tag className="h-5 w-5 sm:h-6 sm:w-6 text-amber-400 shrink-0" />
                        <h1 className="text-xl sm:text-2xl font-bold text-white truncate">Análisis de Promociones</h1>
                    </div>
                    <p className="text-slate-400 text-xs sm:text-sm text-balance">Carga datos ruta por ruta. Filtra por SKU y rango de precio/caja.</p>
                </div>
            </div>

            {/* Filtros */}
            <Card className="bg-white/5 border-white/10 mb-4">
                <CardContent className="pt-4">
                    {/* Fila 1 y 2 combinadas bajo la misma cuadrícula */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3 items-end">
                        <div className="w-full min-w-0">
                            <Label className="text-slate-300 text-xs mb-1 block">Desde</Label>
                            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="bg-white/5 border-white/10 text-white text-sm w-full" />
                        </div>
                        <div className="w-full min-w-0">
                            <Label className="text-slate-300 text-xs mb-1 block">Hasta</Label>
                            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="bg-white/5 border-white/10 text-white text-sm w-full" />
                        </div>
                        <div className="w-full min-w-0">
                            <Label className="text-slate-300 text-xs mb-1 block flex items-center gap-1">
                                <Box className="h-3 w-3 shrink-0" /> <span className="truncate">SKU o Producto</span>
                            </Label>
                            <Input placeholder="Ej: XX LAGER, 4015..." value={skuFilter} onChange={e => setSkuFilter(e.target.value)} className="bg-white/5 border-white/10 text-white text-sm w-full" />
                        </div>
                        <div className="w-full min-w-0">
                            <Label className="text-slate-300 text-xs mb-1 block flex items-center gap-1">
                                <Users className="h-3 w-3 shrink-0" /> <span className="truncate">Cliente</span>
                            </Label>
                            <Input placeholder="Nombre o código..." value={clienteFilter} onChange={e => setClienteFilter(e.target.value)} className="bg-white/5 border-white/10 text-white text-sm w-full" />
                        </div>

                        {/* Fila 2 (continuación del grid) */}
                        <div className="w-full min-w-0">
                            <Label className="text-amber-300 text-xs mb-1 flex items-center gap-1">
                                <TrendingDown className="h-3 w-3 shrink-0" /> <span className="truncate">Precio mín ($/caja)</span>
                            </Label>
                            <Input type="number" min="0" placeholder="Ej: 100" value={minPrice} onChange={e => setMinPrice(e.target.value)} className="bg-white/5 border-white/10 text-white text-sm w-full" />
                        </div>
                        <div className="w-full min-w-0">
                            <Label className="text-amber-300 text-xs mb-1 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 shrink-0" /> <span className="truncate">Precio máx ($/caja)</span>
                            </Label>
                            <Input type="number" min="0" placeholder="Ej: 250" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="bg-amber-500/10 border-amber-500/30 text-white text-sm w-full" />
                        </div>
                        <div className="w-full min-w-0 sm:col-span-2 lg:col-span-2 flex items-end">
                            <Button onClick={fetchData} disabled={loading} className="bg-amber-600 hover:bg-amber-700 w-full xl:w-1/2 shrink-0">
                                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2 shrink-0" /> : <RefreshCw className="h-4 w-4 mr-2 shrink-0" />}
                                <span className="truncate">{loading ? 'Cargando...' : 'Cargar Datos'}</span>
                            </Button>
                        </div>
                    </div>

                    {/* Barra de progreso */}
                    {loading && (
                        <div className="mt-4">
                            <div className="flex items-center justify-between mb-1 gap-2">
                                <p className="text-xs text-slate-400 truncate flex-1">{progress}</p>
                                <p className="text-xs text-amber-400 font-medium shrink-0">{progressPct}%</p>
                            </div>
                            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-500 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
                            </div>
                        </div>
                    )}

                    {rawRows && !loading && (
                        <div className="text-emerald-400 text-xs mt-3 flex items-start sm:items-center gap-1.5 bg-emerald-500/10 p-2 sm:p-1.5 rounded-lg border border-emerald-500/20 w-full min-w-0">
                            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 sm:mt-0" />
                            <span className="flex-1 min-w-0 break-words">
                                <strong className="font-semibold">{rawRows.length.toLocaleString()}</strong> registros cargados en total — <strong className="font-semibold">{promoRows.length.toLocaleString()}</strong> coinciden con los filtros.
                            </span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {rawRows === null ? (
                <div className="text-center py-24 text-slate-500">
                    <Tag className="h-14 w-14 mx-auto mb-4 opacity-20" />
                    <p className="text-lg mb-2">Los datos se cargan <strong>zona por zona</strong> para obtener cobertura completa.</p>
                    <p className="text-sm opacity-60">Puedes buscar por SKU para ver exactamente qué precio se aplicó en cada zona, ruta y cliente.</p>
                </div>
            ) : promoRows.length === 0 ? (
                <div className="text-center py-20 text-slate-500">
                    <Search className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p>No se encontraron registros con los filtros actuales.</p>
                </div>
            ) : (
                <>
                    {/* Indicadores de filtros activos */}
                    {(skuFilter || clienteFilter || minPrice || maxPrice) && (
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                            {skuFilter && (
                                <span className="flex items-center gap-1.5 px-3 py-1 bg-violet-500/20 border border-violet-500/30 rounded-full text-xs text-violet-300 max-w-full">
                                    <Box className="h-3 w-3 shrink-0" />
                                    <span className="truncate">SKU: <strong className="font-semibold">{skuFilter}</strong></span>
                                    <button onClick={() => setSkuFilter('')} className="ml-1 hover:text-white transition-colors shrink-0">×</button>
                                </span>
                            )}
                            {clienteFilter && (
                                <span className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/20 border border-blue-500/30 rounded-full text-xs text-blue-300 max-w-full">
                                    <Users className="h-3 w-3 shrink-0" />
                                    <span className="truncate">Cliente: <strong className="font-semibold">{clienteFilter}</strong></span>
                                    <button onClick={() => setClienteFilter('')} className="ml-1 hover:text-white transition-colors shrink-0">×</button>
                                </span>
                            )}
                            {(minPrice || maxPrice) && (
                                <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/20 border border-amber-500/30 rounded-full text-xs text-amber-300 max-w-full">
                                    <Tag className="h-3 w-3 shrink-0" />
                                    <span className="truncate">
                                        Precio: {minPrice ? `≥$${Number(minPrice).toLocaleString()}` : ''} {minPrice && maxPrice ? '—' : ''} {maxPrice ? `≤$${Number(maxPrice).toLocaleString()}` : ''}
                                    </span>
                                    <button onClick={() => { setMinPrice(''); setMaxPrice(''); }} className="ml-1 hover:text-white transition-colors shrink-0">×</button>
                                </span>
                            )}
                        </div>
                    )}

                    {/* KPIs — se recalculan con cada filtro aplicado (promoRows filtrado) */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-4 sm:mb-5 min-w-0">
                        <KpiCard icon={Box} title="SKUs filtrados" value={fmt(kpis.uniqueSkus, 0)} color="from-violet-600 to-violet-700" />
                        <KpiCard icon={Users} title="Clientes" value={fmt(kpis.uniqueClients, 0)} color="from-blue-600 to-blue-700" />
                        <KpiCard icon={MapPin} title="Rutas" value={fmt(kpis.uniqueRoutes, 0)} color="from-cyan-600 to-cyan-700" />
                        <KpiCard icon={BarChart2} title="Zonas" value={fmt(kpis.uniqueZones, 0)} color="from-emerald-600 to-emerald-700" />
                        <KpiCard icon={Box} title="Cajas" value={fmt(kpis.totalCajas, 0)} color="from-slate-600 to-slate-700" />
                        <KpiCard icon={BarChart2} title="HL" value={fmt(kpis.totalHL, 2)} color="from-teal-600 to-teal-700" />
                        <KpiCard icon={DollarSign} title="Venta $" value={fmtCur(kpis.totalVenta)} color="from-orange-600 to-orange-700" />
                        <KpiCard icon={TrendingDown} title="Descuento $" value={fmtCur(kpis.totalDesc)} sub={`${fmt(kpis.descPct, 1)}% del bruto`} color="from-red-600 to-red-700" />
                        <KpiCard icon={Tag} title="Sobreprecio/Ahorro $" value={fmtCur(kpis.totalSobreAhorro)} sub={kpis.totalCajas > 0 ? `${fmtCur(kpis.totalSobreAhorro / kpis.totalCajas)}/caja` : ''} color="from-yellow-600 to-amber-600" />
                    </div>

                    {/* Precio promedio banner */}
                    {kpis && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 sm:px-5 py-3 sm:py-2.5 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 shadow-sm">
                            <div className="flex items-start sm:items-center gap-2 flex-1 min-w-0">
                                <Tag className="h-4 w-4 sm:h-5 sm:w-5 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
                                <span className="text-sm sm:text-base text-amber-300 font-semibold text-balance">
                                    Precio promedio filtrado: {fmtCur(kpis.avgPriceCaja)}/caja
                                </span>
                            </div>
                            {(minPrice || maxPrice) && (
                                <div className="text-amber-500/70 text-[11px] sm:text-xs bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1 shrink-0 ml-6 sm:ml-0 font-medium">
                                    Rango: {minPrice ? `≥ $${Number(minPrice).toLocaleString()}` : ''}{minPrice && maxPrice ? ' — ' : ''}{maxPrice ? `≤ $${Number(maxPrice).toLocaleString()}` : ''}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tabs */}
                    <div className="flex gap-1 mb-4 bg-white/5 p-1.5 rounded-xl border border-white/10 overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {TABS.map(tab => (
                            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                className={`snap-start shrink-0 px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.key ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col flex-1 w-full min-w-0">
                        {(() => {
                            const [rows, cols, title] = tableMap[activeTab] || [];
                            return rows ? <SortableTable rows={rows} columns={cols} title={title} maxRows={500} /> : null;
                        })()}
                    </div>
                </>
            )}
        </div>
    );
}