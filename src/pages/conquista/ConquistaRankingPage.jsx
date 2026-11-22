import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { fetchClientsApi } from '@/lib/mysqlClients';
import { fetchVisitsApi } from '@/lib/mysqlVisits';
import { getSalesBySku } from '@/repositories/salesRepository';
import { getAllRouteProfiles } from '@/repositories/routeRepository';
import { getAllGoals } from '@/repositories/goalsRepository';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    CalendarIcon, Trophy, TrendingUp, Users, UserCheck,
    Activity, Target, ZoomIn, X, ChevronDown, ChevronUp,
    BarChart3, Star, Footprints, RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Spinner from '@/components/Spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion, AnimatePresence } from 'framer-motion';

// ────────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────────

// Roles que pueden ver el ranking completo (todas las rutas de conquista)
const ADMIN_ROLES = ['admin', 'administrador', 'sistemas', 'coordcon', 'gerente', 'supervisor'];

/**
 * Descarga clientes con filtro opcional por ruta interna.
 * - Admin/coordcon: descarga todos los clientes de conquista.
 * - Agente conquista: solo su ruta interna.
 */
async function fetchAllClientsPaginated(internalRoute = null) {
    const LIMIT = 1000;
    let offset = 0;
    let all = [];
    while (true) {
        const params = { limit: LIMIT, offset };
        if (internalRoute) params.internal_route = internalRoute;
        const res = await fetchClientsApi(params);
        const rows = res.rows || [];
        all.push(...rows);
        if (rows.length < LIMIT) break;
        offset += LIMIT;
        if (offset > 200000) break;
    }
    return all;
}

const getMedalIcon = (index) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return null;
};

// Circular progress ring
function RingProgress({ pct, size = 56, stroke = 5, color = '#10b981', label, value }) {
    const r = (size - stroke * 2) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - Math.min(pct / 100, 1) * circ;
    return (
        <div className="flex flex-col items-center gap-0.5">
            <svg width={size} height={size} className="rotate-[-90deg]">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke} />
                <circle
                    cx={size / 2} cy={size / 2} r={r} fill="none"
                    stroke={color} strokeWidth={stroke}
                    strokeDasharray={circ}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 1s ease' }}
                />
            </svg>
            <span className="text-[10px] font-bold text-white/80 -mt-1">{pct >= 100 ? '100%' : `${Math.round(pct)}%`}</span>
            {label && <span className="text-[9px] text-white/40 text-center leading-tight w-12">{label}</span>}
        </div>
    );
}

// Thin progress bar
function ProgressBar({ pct, color }) {
    const clamped = Math.min(pct, 100);
    const bg = pct >= 100 ? 'bg-emerald-500' : pct >= 75 ? 'bg-yellow-500' : pct >= 50 ? 'bg-orange-500' : 'bg-red-500';
    return (
        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full transition-all duration-1000', bg)} style={{ width: `${clamped}%` }} />
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────────
// Global KPI card
// ────────────────────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color = 'text-emerald-400', delay = 0 }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.4 }}
            className="relative overflow-hidden rounded-2xl border border-white/8 bg-slate-900/70 backdrop-blur-md p-4"
        >
            <div className="absolute -top-6 -right-6 opacity-5">
                <Icon className="w-24 h-24" />
            </div>
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-3', 'bg-white/5')}>
                <Icon className={cn('w-4 h-4', color)} />
            </div>
            <div className={cn('text-2xl font-black', color)}>{value}</div>
            <div className="text-xs text-white/50 mt-0.5">{label}</div>
            {sub && <div className="text-[10px] text-white/30 mt-1">{sub}</div>}
        </motion.div>
    );
}

// ────────────────────────────────────────────────────────────────────────────────
// Agent card
// ────────────────────────────────────────────────────────────────────────────────
function AgentCard({ row, index, onClick }) {
    const medal = getMedalIcon(index);
    const volPct = row.meta > 0 ? (row.hl / row.meta) * 100 : 0;
    const newPct = row.metaNew > 0 ? (row.newClientsWithPurchase / row.metaNew) * 100 : 0;
    const highPct = row.metaHighVol > 0 ? (row.newHighVol / row.metaHighVol) * 100 : 0;

    const statusColor =
        volPct >= 100 ? 'from-emerald-500/10 to-transparent border-emerald-500/20'
            : volPct >= 75 ? 'from-yellow-500/10 to-transparent border-yellow-500/20'
                : volPct >= 50 ? 'from-orange-500/10 to-transparent border-orange-500/20'
                    : 'from-red-500/10 to-transparent border-red-500/20';

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.4 }}
            onClick={onClick}
            className={cn(
                'relative cursor-pointer rounded-2xl border bg-gradient-to-br p-4 group',
                'hover:scale-[1.01] hover:shadow-xl transition-all duration-300',
                statusColor
            )}
        >
            {/* Rank badge */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5">
                {medal
                    ? <span className="text-xl">{medal}</span>
                    : <span className="text-slate-500 font-bold text-sm">#{index + 1}</span>
                }
            </div>

            {/* Header */}
            <div className="mb-4 pr-8">
                <div className="font-bold text-white text-base leading-tight">{row.agentName}</div>
                <div className="text-[11px] text-white/40 mt-0.5">{row.route}</div>
            </div>

            {/* 3 rings = 3 metas */}
            <div className="flex justify-around mb-4">
                <RingProgress pct={volPct} color="#10b981" label="Volumen" value={`${row.hl.toFixed(1)} HL`} />
                <RingProgress pct={newPct} color="#3b82f6" label="Ntvos c/compra" value={row.newClientsWithPurchase} />
                <RingProgress pct={highPct} color="#f59e0b" label="≥1.5 HL" value={row.newHighVol} />
            </div>

            {/* Volume bar */}
            <div className="mb-3">
                <div className="flex justify-between text-[10px] text-white/40 mb-1">
                    <span>Volumen {row.hl.toFixed(1)} HL</span>
                    <span>Meta {row.meta > 0 ? row.meta.toFixed(1) : '—'}</span>
                </div>
                <ProgressBar pct={volPct} />
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/5">
                <div className="text-center">
                    <div className="text-xs font-bold text-indigo-300">{row.retained}</div>
                    <div className="text-[9px] text-white/30">Retenidos</div>
                </div>
                <div className="text-center">
                    <div className="text-xs font-bold text-purple-300">{row.visits}</div>
                    <div className="text-[9px] text-white/30">Visitas</div>
                </div>
                <div className="text-center">
                    <div className={cn('text-xs font-bold', volPct >= 100 ? 'text-emerald-400' : volPct >= 75 ? 'text-yellow-400' : 'text-red-400')}>
                        {Math.round(volPct)}%
                    </div>
                    <div className="text-[9px] text-white/30">Avance</div>
                </div>
            </div>

            {/* Hover detail hint */}
            <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <ZoomIn className="w-3.5 h-3.5 text-white/40" />
            </div>
        </motion.div>
    );
}

// ────────────────────────────────────────────────────────────────────────────────
// Client list in dialog
// ────────────────────────────────────────────────────────────────────────────────
function ClientTable({ data, emptyMsg }) {
    return (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-400 uppercase bg-slate-950/50">
                    <tr>
                        <th className="px-4 py-3">Cliente</th>
                        <th className="px-4 py-3">Alta</th>
                        <th className="px-4 py-3 text-right">Volumen Mes</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                    {data.map((c, i) => (
                        <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-3">
                                <div className="font-medium text-white">{c.name}</div>
                                <div className="text-xs text-slate-500">{c.code}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-400 text-xs">
                                {c.created ? format(new Date(c.created), 'dd/MM/yy') : '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-emerald-400 font-bold">
                                {(c.vol || 0).toFixed(2)} HL
                            </td>
                        </tr>
                    ))}
                    {data.length === 0 && (
                        <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">{emptyMsg}</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────────────────────────
export default function ConquistaRankingPage() {
    const { user } = useSupabaseAuth();
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState(new Date());
    const [rankingData, setRankingData] = useState([]);
    const [globalStats, setGlobalStats] = useState({
        totalVol: 0, totalMeta: 0, newClients: 0, newHighVol: 0, retained: 0, visits: 0
    });
    const [selectedRow, setSelectedRow] = useState(null);
    const [sortBy, setSortBy] = useState('ranking');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
            const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
            const monthStartStr = monthStart.toISOString().slice(0, 10);
            const monthEndStr = monthEnd.toISOString().slice(0, 10);

            // Retention window: 3 months back from start of selected month
            const retentionStart = new Date(monthStart);
            retentionStart.setMonth(retentionStart.getMonth() - 2);
            retentionStart.setDate(1);

            // ── Determinar si el usuario puede ver todos los agentes o solo el suyo ──
            const userRole = (user?.user_metadata?.role || user?.user_metadata?.type || '').toLowerCase().trim();
            const isAdminView = ADMIN_ROLES.some(r => userRole.includes(r));
            const userRoute = isAdminView ? null
                : (user?.user_metadata?.route || user?.user_metadata?.ruta || user?.profile?.route || null);

            // Fetch en paralelo — clientes filtrados por ruta si no es admin
            const [allClients, allSales, profiles, goals, allVisits] = await Promise.all([
                fetchAllClientsPaginated(userRoute),  // <-- filtrado por ruta interna del agente
                getSalesBySku({ from: monthStartStr, to: monthEndStr }),
                getAllRouteProfiles(),
                getAllGoals({ from: monthStartStr, to: monthEndStr }),
                fetchVisitsApi({ start_date: monthStartStr, end_date: monthEndStr, limit: 50000 }).catch(() => []),
            ]);

            // ── Route metadata ─────────────────────────────────────────────────────
            const routeToName = {};
            profiles.forEach(p => {
                if (p.role !== 'conquista') return;
                const r = (p.route || p.ruta || '').trim().toUpperCase();
                if (r) routeToName[r] = p.name;
            });
            const allowedRoutes = new Set(Object.keys(routeToName));

            // ── Goal maps ──────────────────────────────────────────────────────────
            const goalVolMap = {}; // route → meta HL
            const goalNewMap = {}; // route → meta clientes nuevos c/compra
            const goalHighMap = {}; // route → meta clientes nuevos ≥1.5HL
            goals.forEach(g => {
                const r = (g.sales_route || '').trim().toUpperCase();
                if (!r) return;
                goalVolMap[r] = Number(g.meta || 0);
                goalNewMap[r] = Number(g.meta_new_clients || 10);   // default 10
                goalHighMap[r] = Number(g.meta_new_high_vol || 5);   // default 5
            });

            // ── Client maps ────────────────────────────────────────────────────────
            const clientMap = {}; // client_code → client
            const agentData = {}; // route → aggregated stats

            const getAgent = (route) => {
                const key = route.trim().toUpperCase();
                if (!allowedRoutes.has(key)) return null;
                if (!agentData[key]) {
                    agentData[key] = {
                        route: key,
                        agentName: routeToName[key] || 'Sin Asignar',
                        hl: 0,
                        meta: goalVolMap[key] || 0,
                        metaNew: goalNewMap[key] || 10,
                        metaHighVol: goalHighMap[key] || 5,
                        // Sets for precision
                        newInMonthSet: new Set(),       // alta en mes seleccionado
                        retentionPoolSet: new Set(),    // alta en últimos 3 meses
                        // Computed after sales pass
                        newClientsWithPurchaseSet: new Set(),
                        newHighVolSet: new Set(),
                        retainedSet: new Set(),
                        // Lists for drill-down
                        details: { newWithPurchase: [], newHighVol: [], retained: [], allActive: [] },
                        visits: 0,
                    };
                }
                return agentData[key];
            };

            // Process clients
            allClients.forEach(c => {
                const route = c.internal_route;
                if (!route || route === 'Sin Ruta Interna' || route === 'Unassigned' || !route.trim()) return;
                const agent = getAgent(route);
                if (!agent) return;
                if (c.client_code) clientMap[c.client_code] = c;

                const created = new Date(c.created_at);
                if (created >= monthStart && created <= monthEnd) agent.newInMonthSet.add(c.client_code);
                if (created >= retentionStart && created <= monthEnd) agent.retentionPoolSet.add(c.client_code);
            });

            // Process sales
            const clientVolMap = {};
            allSales.forEach(s => {
                if (!s.cve_cliente) return;
                const hl = Number(s.htls_total || 0);
                clientVolMap[s.cve_cliente] = (clientVolMap[s.cve_cliente] || 0) + hl;

                const client = clientMap[s.cve_cliente];
                if (!client) return;
                const agent = getAgent(client.internal_route);
                if (agent) agent.hl += hl;
            });

            // Finalize sets per agent
            Object.values(agentData).forEach(agent => {
                // Nuevos del mes CON compra (cualquier volumen > 0)
                agent.newInMonthSet.forEach(code => {
                    const vol = clientVolMap[code] || 0;
                    if (vol > 0) {
                        agent.newClientsWithPurchaseSet.add(code);
                        const c = clientMap[code];
                        if (c) agent.details.newWithPurchase.push({ code, name: c.name || c.business_name, vol, created: c.created_at });
                    }
                });

                // Nuevos del mes ≥ 1.5 HL
                agent.newClientsWithPurchaseSet.forEach(code => {
                    const vol = clientVolMap[code] || 0;
                    if (vol >= 1.5) {
                        agent.newHighVolSet.add(code);
                        const c = clientMap[code];
                        if (c) agent.details.newHighVol.push({ code, name: c.name || c.business_name, vol, created: c.created_at });
                    }
                });

                // Retenidos: dados de alta en ventana 3m y compraron este mes
                agent.retentionPoolSet.forEach(code => {
                    const vol = clientVolMap[code] || 0;
                    if (vol > 0) {
                        agent.retainedSet.add(code);
                        const c = clientMap[code];
                        if (c) agent.details.retained.push({ code, name: c.name || c.business_name, vol, created: c.created_at });
                    }
                });

                // All active (any purchase this month)
                Object.keys(clientVolMap).forEach(code => {
                    const c = clientMap[code];
                    if (!c) return;
                    const r = (c.internal_route || '').trim().toUpperCase();
                    if (r !== agent.route) return;
                    const vol = clientVolMap[code] || 0;
                    if (vol > 0) agent.details.allActive.push({ code, name: c.name || c.business_name, vol, created: c.created_at });
                });

                // Scalar metrics
                agent.newClientsWithPurchase = agent.newClientsWithPurchaseSet.size;
                agent.newHighVol = agent.newHighVolSet.size;
                agent.retained = agent.retainedSet.size;
                agent.retentionPool = agent.retentionPoolSet.size;
                agent.retentionRate = agent.retentionPool > 0 ? (agent.retained / agent.retentionPool) * 100 : 0;
            });

            // Process visits — map by internal_route using client data
            const clientToRoute = {};
            allClients.forEach(c => { if (c.client_code) clientToRoute[c.client_code] = (c.internal_route || '').trim().toUpperCase(); });

            (allVisits || []).forEach(v => {
                // Try to map visit to agent via ruta field or client_code
                const routeFromField = (v.ruta || v.route || v.internal_route || '').trim().toUpperCase();
                const routeFromClient = v.client_code ? clientToRoute[String(v.client_code)] : null;
                const routeKey = routeFromField || routeFromClient;
                if (routeKey && agentData[routeKey]) {
                    agentData[routeKey].visits += 1;
                }
            });

            // Build final ranking array
            const ranking = Object.values(agentData)
                .filter(a => a.agentName !== 'Sin Asignar');

            // Global stats
            const gVol = ranking.reduce((s, a) => s + a.hl, 0);
            const gMeta = ranking.reduce((s, a) => s + a.meta, 0);
            const gNew = ranking.reduce((s, a) => s + a.newClientsWithPurchase, 0);
            const gHigh = ranking.reduce((s, a) => s + a.newHighVol, 0);
            const gRet = ranking.reduce((s, a) => s + a.retained, 0);
            const gVisits = ranking.reduce((s, a) => s + a.visits, 0);

            setGlobalStats({ totalVol: gVol, totalMeta: gMeta, newClients: gNew, newHighVol: gHigh, retained: gRet, visits: gVisits });
            setRankingData(ranking);

        } catch (err) {
            console.error('[ConquistaRanking] Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const sorted = [...rankingData].sort((a, b) => {
        if (sortBy === 'ranking') {
            const score = (ag) => {
                const volPct = ag.meta > 0 ? (ag.hl / ag.meta) * 100 : 0;
                const newPct = ag.metaNew > 0 ? (ag.newClientsWithPurchase / ag.metaNew) * 100 : 0;
                const highPct = ag.metaHighVol > 0 ? (ag.newHighVol / ag.metaHighVol) * 100 : 0;
                const retPct = ag.retentionPool > 0 ? (ag.retained / ag.retentionPool) * 100 : 0;
                return (volPct + newPct + highPct + retPct) / 4;
            };
            return score(b) - score(a);
        }
        if (sortBy === 'hl') return b.hl - a.hl;
        if (sortBy === 'new') return b.newClientsWithPurchase - a.newClientsWithPurchase;
        if (sortBy === 'retained') return b.retained - a.retained;
        if (sortBy === 'visits') return b.visits - a.visits;
        return b.hl - a.hl;
    });

    const volGlobalPct = globalStats.totalMeta > 0 ? (globalStats.totalVol / globalStats.totalMeta) * 100 : 0;

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
            <Helmet>
                <title>Ranking Conquista — Cervezas Finas</title>
            </Helmet>

            <div className="max-w-7xl mx-auto space-y-8">

                {/* ── Header ── */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                                <Trophy className="w-5 h-5 text-yellow-400" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-black text-white tracking-tight">Ranking Conquista</h1>
                                <p className="text-xs text-white/40">Desempeño mensual de rutas · Metas y avances</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-[190px] justify-start bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800">
                                    <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
                                    {format(date, 'MMMM yyyy', { locale: es })}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-slate-900 border-slate-700" align="end">
                                <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus />
                            </PopoverContent>
                        </Popover>
                        <Button variant="ghost" size="icon" onClick={fetchData} className="text-slate-400 hover:text-white hover:bg-slate-800">
                            <RefreshCw className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-32 gap-4">
                        <Spinner />
                        <p className="text-slate-500 text-sm">Calculando métricas del mes…</p>
                    </div>
                ) : (
                    <>
                        {/* ── Global KPIs ── */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            <KpiCard
                                icon={TrendingUp}
                                label="Volumen Total"
                                value={`${globalStats.totalVol.toFixed(0)} HL`}
                                sub={globalStats.totalMeta > 0 ? `Meta: ${globalStats.totalMeta.toFixed(0)} HL` : undefined}
                                color="text-emerald-400"
                                delay={0}
                            />
                            <KpiCard
                                icon={BarChart3}
                                label="Avance Global"
                                value={`${Math.round(volGlobalPct)}%`}
                                sub="vs meta de volumen"
                                color={volGlobalPct >= 100 ? 'text-emerald-400' : volGlobalPct >= 75 ? 'text-yellow-400' : 'text-red-400'}
                                delay={0.05}
                            />
                            <KpiCard
                                icon={Users}
                                label="Nuevos c/Compra"
                                value={globalStats.newClients}
                                sub="dados de alta en el mes"
                                color="text-blue-400"
                                delay={0.1}
                            />
                            <KpiCard
                                icon={Star}
                                label="Nuevos ≥1.5 HL"
                                value={globalStats.newHighVol}
                                sub="calificados del mes"
                                color="text-amber-400"
                                delay={0.15}
                            />
                            <KpiCard
                                icon={UserCheck}
                                label="Retenidos"
                                value={globalStats.retained}
                                sub="alta ≤3 meses con compra"
                                color="text-indigo-400"
                                delay={0.2}
                            />
                            <KpiCard
                                icon={Footprints}
                                label="Visitas del Mes"
                                value={globalStats.visits}
                                color="text-purple-400"
                                delay={0.25}
                            />
                        </div>

                        {/* ── Global volume bar ── */}
                        <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-4">
                            <div className="flex justify-between text-xs text-white/40 mb-2">
                                <span>Avance consolidado de volumen</span>
                                <span>{globalStats.totalVol.toFixed(1)} / {globalStats.totalMeta.toFixed(1)} HL · {Math.round(volGlobalPct)}%</span>
                            </div>
                            <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(volGlobalPct, 100)}%` }}
                                    transition={{ duration: 1.2, ease: 'easeOut' }}
                                    className={cn(
                                        'h-full rounded-full',
                                        volGlobalPct >= 100 ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                                            : volGlobalPct >= 75 ? 'bg-gradient-to-r from-yellow-600 to-yellow-400'
                                                : 'bg-gradient-to-r from-red-700 to-red-500'
                                    )}
                                />
                            </div>
                        </div>

                        {/* ── Sort controls ── */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-white/40 mr-1">Ordenar por:</span>
                            {[
                                { key: 'ranking', label: '🏆 Ranking' },
                                { key: 'hl', label: 'Volumen' },
                                { key: 'new', label: 'Clientes Nuevos' },
                                { key: 'retained', label: 'Retenidos' },
                                { key: 'visits', label: 'Visitas' },
                            ].map(opt => (
                                <button
                                    key={opt.key}
                                    onClick={() => setSortBy(opt.key)}
                                    className={cn(
                                        'px-3 py-1 rounded-full text-xs font-medium transition-all duration-200',
                                        sortBy === opt.key
                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                            : 'text-white/40 hover:text-white/70 border border-transparent'
                                    )}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        {/* ── Agent cards grid ── */}
                        {sorted.length === 0 ? (
                            <div className="text-center py-20 text-slate-500">
                                No hay datos para el periodo seleccionado.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                <AnimatePresence>
                                    {sorted.map((row, index) => (
                                        <AgentCard
                                            key={row.route}
                                            row={row}
                                            index={rankingData.indexOf(row)} // keep original rank even after sort change
                                            onClick={() => setSelectedRow(row)}
                                        />
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ── Drill-down dialog ── */}
            <Dialog open={!!selectedRow} onOpenChange={(open) => !open && setSelectedRow(null)}>
                <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-3xl max-h-[85vh] overflow-y-auto">
                    {selectedRow && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-lg">
                                    <span>{selectedRow.agentName}</span>
                                    <Badge variant="outline" className="text-slate-400 border-slate-700 text-xs">{selectedRow.route}</Badge>
                                </DialogTitle>
                            </DialogHeader>

                            {/* Metric summary inside dialog */}
                            <div className="grid grid-cols-3 gap-3 my-4">
                                {[
                                    { label: 'Volumen', value: `${selectedRow.hl.toFixed(2)} HL`, sub: `Meta ${selectedRow.meta.toFixed(1)}`, pct: selectedRow.meta > 0 ? (selectedRow.hl / selectedRow.meta) * 100 : 0, color: 'text-emerald-400' },
                                    { label: 'Nuevos c/Compra', value: selectedRow.newClientsWithPurchase, sub: `Meta ${selectedRow.metaNew}`, pct: selectedRow.metaNew > 0 ? (selectedRow.newClientsWithPurchase / selectedRow.metaNew) * 100 : 0, color: 'text-blue-400' },
                                    { label: 'Nuevos ≥1.5 HL', value: selectedRow.newHighVol, sub: `Meta ${selectedRow.metaHighVol}`, pct: selectedRow.metaHighVol > 0 ? (selectedRow.newHighVol / selectedRow.metaHighVol) * 100 : 0, color: 'text-amber-400' },
                                ].map((m) => (
                                    <div key={m.label} className="rounded-xl bg-slate-950/60 border border-white/5 p-3 text-center">
                                        <div className={cn('text-xl font-black', m.color)}>{m.value}</div>
                                        <div className="text-[10px] text-white/40">{m.label}</div>
                                        <div className="mt-2">
                                            <ProgressBar pct={m.pct} />
                                        </div>
                                        <div className="text-[10px] text-white/30 mt-1">{Math.round(m.pct)}% · {m.sub}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="rounded-xl bg-slate-950/60 border border-white/5 p-3 text-center">
                                    <div className="text-lg font-bold text-indigo-300">{selectedRow.retained}</div>
                                    <div className="text-[10px] text-white/40">Retenidos (3 meses)</div>
                                    <div className="text-[10px] text-white/25 mt-0.5">de {selectedRow.retentionPool} en ventana</div>
                                </div>
                                <div className="rounded-xl bg-slate-950/60 border border-white/5 p-3 text-center">
                                    <div className="text-lg font-bold text-purple-300">{selectedRow.visits}</div>
                                    <div className="text-[10px] text-white/40">Visitas del mes</div>
                                </div>
                            </div>

                            <Tabs defaultValue="newWithPurchase">
                                <TabsList className="bg-slate-950 w-full grid grid-cols-4">
                                    <TabsTrigger value="newWithPurchase" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300 text-xs">
                                        Nuevos ({selectedRow.newClientsWithPurchase})
                                    </TabsTrigger>
                                    <TabsTrigger value="newHighVol" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300 text-xs">
                                        ≥1.5HL ({selectedRow.newHighVol})
                                    </TabsTrigger>
                                    <TabsTrigger value="retained" className="data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-300 text-xs">
                                        Retenidos ({selectedRow.retained})
                                    </TabsTrigger>
                                    <TabsTrigger value="allActive" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300 text-xs">
                                        Activos ({selectedRow.details.allActive.length})
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent value="newWithPurchase" className="mt-3">
                                    <ClientTable data={selectedRow.details.newWithPurchase} emptyMsg="No hay clientes nuevos con compra en el mes." />
                                </TabsContent>
                                <TabsContent value="newHighVol" className="mt-3">
                                    <ClientTable data={selectedRow.details.newHighVol} emptyMsg="No hay clientes nuevos ≥ 1.5 HL." />
                                </TabsContent>
                                <TabsContent value="retained" className="mt-3">
                                    <ClientTable data={selectedRow.details.retained} emptyMsg="No hay clientes retenidos." />
                                </TabsContent>
                                <TabsContent value="allActive" className="mt-3">
                                    <ClientTable data={selectedRow.details.allActive} emptyMsg="No hay clientes activos este mes." />
                                </TabsContent>
                            </Tabs>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
