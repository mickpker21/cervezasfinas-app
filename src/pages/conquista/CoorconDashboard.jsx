import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { getClients } from '@/repositories/clientsRepository';
import { getSalesBySku } from '@/repositories/salesRepository';
import { getAllRouteProfiles } from '@/repositories/routeRepository';
import { getAllGoals } from '@/repositories/goalsRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, Trophy, TrendingUp, Users, Target, Activity, BarChart2, Star, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import Spinner from '@/components/Spinner';
import DonutProgress from '@/components/DonutProgress';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import PredictiveSalesWidget from '@/components/analytics/PredictiveSalesWidget';

export default function CoorconDashboard() {
    const { user } = useSupabaseAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState(new Date());

    // Data State
    const [globalStats, setGlobalStats] = useState({
        totalVol: 0,
        totalMeta: 0,
        progress: 0,
        newClients: 0,
        newHighVol: 0,
        retainedCount: 0,
        retentionRate: 0,
        activeAgents: 0
    });
    const [agentsList, setAgentsList] = useState([]);
    const [allSales, setAllSales] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
                const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
                const monthStartStr = monthStart.toISOString().slice(0, 10);
                const monthEndStr = monthEnd.toISOString().slice(0, 10);

                const retentionStart = new Date(monthStart);
                retentionStart.setMonth(retentionStart.getMonth() - 2);
                retentionStart.setDate(1);

                const [profiles, allClients, fetchedSales, goals] = await Promise.all([
                    getAllRouteProfiles(),
                    getClients(),
                    getSalesBySku({ from: monthStartStr, to: monthEndStr }),
                    getAllGoals({ from: monthStartStr, to: monthEndStr })
                ]);
                setAllSales(fetchedSales);
                const allSalesLocal = fetchedSales;

                // 1. Process Metadata & Filter by Role
                const routeToAgentName = {};
                const allowedRoutes = new Set();

                profiles.forEach(p => {
                    // FILTER: Only allow 'conquista' role
                    if (p.role !== 'conquista') return;

                    const r = (p.route || p.ruta || '').trim().toUpperCase();
                    if (r) {
                        routeToAgentName[r] = p.name;
                        allowedRoutes.add(r);
                    }
                });

                // 2. Initialize Agent Data
                // Only create entries for allowed routes to avoid pollution
                const agentsData = {};
                // We will use agentsDataPrecise later, skipping the intermediate agentsData step for clarity if possible,
                // but let's keep the structure close to original to minimize diff risk, just adding filters.

                // RE-CALCULATION WITH SETS FOR PRECISION
                const agentsDataPrecise = {};
                const getAgentP = (route) => {
                    const key = route.trim().toUpperCase();

                    // STRICT FILTER: If route is not assigned to a conquest user, ignore it.
                    if (!allowedRoutes.has(key)) return null;

                    if (!agentsDataPrecise[key]) {
                        agentsDataPrecise[key] = {
                            route: key,
                            name: routeToAgentName[key],
                            hl: 0,
                            meta: 0,
                            newClientsSet: new Set(),
                            newHighVolSet: new Set(),
                            retainedSet: new Set(),
                            retentionPoolSet: new Set()
                        };
                    }
                    return agentsDataPrecise[key];
                };

                // Goals
                goals.forEach(g => {
                    if (g.sales_route) {
                        const agent = getAgentP(g.sales_route);
                        if (agent) agent.meta = Number(g.meta || 0);
                    }
                });

                // Clients
                allClients.forEach(c => {
                    const route = c.internal_route;
                    if (!route || route === 'Sin Ruta Interna' || route === 'Unassigned') return;

                    const agent = getAgentP(route);
                    if (!agent) return;

                    const created = new Date(c.created_at);

                    if (created >= monthStart && created <= monthEnd) agent.newClientsSet.add(c.client_code);
                    if (created >= retentionStart && created <= monthEnd) agent.retentionPoolSet.add(c.client_code);
                });

                // Sales
                const clientMap = {};
                allClients.forEach(c => { if (c.client_code) clientMap[c.client_code] = c; });

                const clientVolMap = {};
                allSalesLocal.forEach(s => {
                    if (!s.cve_cliente) return;
                    const hl = Number(s.htls_total || 0);
                    if (!clientVolMap[s.cve_cliente]) clientVolMap[s.cve_cliente] = 0;
                    clientVolMap[s.cve_cliente] += hl;

                    const client = clientMap[s.cve_cliente];
                    if (client) {
                        const agent = getAgentP(client.internal_route);
                        if (agent) agent.hl += hl;
                    }
                });

                // Finalize Sets
                Object.values(agentsDataPrecise).forEach(a => {
                    // New High Vol check
                    a.newClientsSet.forEach(code => {
                        if ((clientVolMap[code] || 0) >= 1) a.newHighVolSet.add(code);
                    });
                    // Retained check
                    a.retentionPoolSet.forEach(code => {
                        if ((clientVolMap[code] || 0) > 0) a.retainedSet.add(code);
                    });
                });


                // Aggregates
                let gVol = 0;
                let gMeta = 0;
                let gNew = 0;
                let gNewHigh = 0;
                let gRetainedPool = 0;
                let gRetained = 0;
                let activeAgentsCount = 0;

                const list = Object.values(agentsDataPrecise)
                    .map(a => {
                        gVol += a.hl;
                        gMeta += a.meta;
                        gNew += a.newClientsSet.size;
                        gNewHigh += a.newHighVolSet.size;
                        gRetainedPool += a.retentionPoolSet.size;
                        gRetained += a.retainedSet.size;
                        if (a.hl > 0) activeAgentsCount++;

                        return {
                            ...a,
                            newClients: a.newClientsSet.size,
                            newHighVol: a.newHighVolSet.size,
                            retained: a.retainedSet.size,
                            retentionPool: a.retentionPoolSet.size,
                            progress: a.meta > 0 ? (a.hl / a.meta) * 100 : 0,
                            retentionRate: a.retentionPoolSet.size > 0 ? (a.retainedSet.size / a.retentionPoolSet.size) * 100 : 0
                        };
                    })
                    .sort((a, b) => b.hl - a.hl); // Sort by volume descending

                setAgentsList(list);
                setGlobalStats({
                    totalVol: gVol,
                    totalMeta: gMeta,
                    progress: gMeta > 0 ? (gVol / gMeta) * 100 : 0,
                    newClients: gNew,
                    newHighVol: gNewHigh,
                    retainedCount: gRetained,
                    retentionRate: gRetainedPool > 0 ? (gRetained / gRetainedPool) * 100 : 0,
                    activeAgents: activeAgentsCount
                });

            } catch (err) {
                console.error("Error generating coordinator dashboard", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [date]);

    if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

    return (
        <div className="min-h-screen pb-10">
            <Helmet>
                <title>Centro de Comando Conquista</title>
            </Helmet>

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold text-white tracking-tight">Centro de Comando</h1>
                        <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 text-xs font-bold rounded-full border border-indigo-500/30">
                            COORDINADOR
                        </span>
                    </div>
                    <p className="text-white/60 mt-1">Supervisión estratégica de fuerza de conquista.</p>
                </div>

                <div className="flex gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="w-[200px] justify-start text-left font-normal bg-white/5 border-white/10 text-white hover:bg-white/10">
                                <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
                                {date ? format(date, "MMMM yyyy", { locale: es }) : <span>Mes</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus />
                        </PopoverContent>
                    </Popover>
                    <Button variant="default" className="heineken-button" onClick={() => navigate('/conquista/ranking')}>
                        <Trophy className="mr-2 h-4 w-4" /> Ver Ranking
                    </Button>
                </div>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">

                // Card 1: Predictive Volume
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    {(() => {
                        // SMART PREDICTION LOGIC (Matches SupervisorDashboard)
                        const todayMexico = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
                        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
                        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
                        const fromISO = monthStart.toISOString().slice(0, 10);
                        const toISO = monthEnd.toISOString().slice(0, 10);

                        // 1. Find max sale date to avoid diluting average with empty days
                        let maxSalesDate = null; // ISO string
                        if (allSales && allSales.length > 0) {
                            // Basic sort or reduce to find max
                            // Optimizing: just scan once
                            let maxTs = 0;
                            allSales.forEach(s => {
                                const d = new Date(s.fecha_alta || s.fecha || s.period_date);
                                if (d.getTime() > maxTs) maxTs = d.getTime();
                            });
                            if (maxTs > 0) maxSalesDate = new Date(maxTs).toISOString().slice(0, 10);
                        }

                        // 2. Define Effective Cutoff
                        // If we have sales up to day X, use X. If not, use today or yesterday logic.
                        // But simplify: If maxSalesDate exists and is <= today, use it.
                        let effectiveCutoffDate = todayMexico; // Default to today

                        if (maxSalesDate && maxSalesDate <= todayMexico) {
                            effectiveCutoffDate = maxSalesDate;
                        } else if (todayMexico > fromISO) {
                            // Fallback to yesterday if no sales found yet but month started? 
                            // Or just keep today. Supervisor uses yesterday as fallback.
                            const y = new Date();
                            y.setDate(y.getDate() - 1);
                            const yISO = y.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
                            effectiveCutoffDate = yISO < fromISO ? fromISO : yISO;
                        }

                        // 3. Calculate Business Days
                        // Helper locally defined or imported? We added it to dateUtils.
                        // Need to import it or redefine it here if import fails/is annoying to add to top.
                        // Let's rely on adding the import at the top in a separate edit or just define it here to be safe and fast.
                        const businessDays = (start, end) => {
                            const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
                            const s = parse(start), e = parse(end);
                            if (e < s) return 0;
                            let c = 0, cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
                            while (cur <= e) { if (cur.getDay() !== 0) c++; cur.setDate(cur.getDate() + 1); }
                            return c;
                        };

                        const totalBusiness = businessDays(fromISO, toISO);
                        const effectiveElapsedBusiness = businessDays(fromISO, Math.min(effectiveCutoffDate < toISO ? effectiveCutoffDate : toISO, toISO)); // Simplify min logic

                        // If today is past month end (viewing history), elapsed should be total.
                        const viewingPastMonth = new Date() > monthEnd;
                        const finalElapsed = viewingPastMonth ? totalBusiness : (effectiveElapsedBusiness || 1);

                        return (
                            <PredictiveSalesWidget
                                currentVolume={globalStats.totalVol}
                                meta={globalStats.totalMeta}
                                daysElapsed={finalElapsed}
                                totalDays={totalBusiness}
                            />
                        );
                    })()}
                </motion.div>

                {/* Card 2: New Clients */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    <Card className="heineken-card h-full relative overflow-hidden">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-blue-300 flex items-center justify-between">
                                <span>Clientes Nuevos</span>
                                <Users className="h-4 w-4 opacity-70" />
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-bold text-white">{globalStats.newClients}</span>
                                <span className="text-sm text-white/50">Altas</span>
                            </div>
                            <div className="mt-3 flex items-center justify-between text-xs">
                                <span className="text-amber-400 font-medium flex items-center gap-1">
                                    <Star className="w-3 h-3" /> {globalStats.newHighVol} Calificados
                                </span>
                                <span className="text-white/30">{'>'} 1 HL</span>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Card 3: Retention */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <Card className="heineken-card h-full relative overflow-hidden">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-indigo-300 flex items-center justify-between">
                                <span>Retención (3 Meses)</span>
                                <Activity className="h-4 w-4 opacity-70" />
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-bold text-white">{globalStats.retentionRate.toFixed(0)}%</span>
                                <span className="text-sm text-white/50">Tasa</span>
                            </div>
                            <p className="text-xs text-white/40 mt-2">
                                {globalStats.retainedCount} activos de los últimos 3 meses
                            </p>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Card 4: Active Force */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                    <Card className="heineken-card h-full relative overflow-hidden">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-amber-300 flex items-center justify-between">
                                <span>Fuerza Activa</span>
                                <BarChart2 className="h-4 w-4 opacity-70" />
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-bold text-white">{globalStats.activeAgents}</span>
                                <span className="text-sm text-white/50">/ {agentsList.length}</span>
                            </div>
                            <p className="text-xs text-white/40 mt-2">
                                Agentes con venta este mes
                            </p>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            {/* MAIN TABLE: AGENT PERFORMANCE */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
                    <CardHeader className="border-b border-white/5 bg-white/5">
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-lg text-white font-bold">Desempeño por Conquistador</CardTitle>
                            <Button variant="ghost" size="sm" className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10" onClick={() => navigate('/conquista/ranking')}>
                                Ver Detalle Completo
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-400 uppercase bg-slate-950/30">
                                    <tr>
                                        <th className="px-6 py-4">Agente</th>
                                        <th className="px-6 py-4 text-emerald-400">Volumen</th>
                                        <th className="px-6 py-4">Meta</th>
                                        <th className="px-6 py-4">Avance</th>
                                        <th className="px-6 py-4">Nuevos</th>
                                        <th className="px-6 py-4 text-blue-400">Retención</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {agentsList.map((agent) => (
                                        <tr key={agent.route} className="hover:bg-white/5 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-white">{agent.name}</div>
                                                <div className="text-xs text-slate-500">{agent.route}</div>
                                            </td>
                                            <td className="px-6 py-4 font-mono text-emerald-300 font-bold">
                                                {agent.hl.toFixed(2)}
                                            </td>
                                            <td className="px-6 py-4 text-slate-400">
                                                {agent.meta > 0 ? agent.meta.toFixed(1) : '-'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-1.5 w-16 bg-slate-700 rounded-full overflow-hidden">
                                                        <div className={cn("h-full rounded-full", agent.progress >= 100 ? "bg-emerald-500" : agent.progress >= 80 ? "bg-yellow-500" : "bg-red-500")} style={{ width: `${Math.min(100, agent.progress)}%` }} />
                                                    </div>
                                                    <span className="text-xs font-bold text-white">{agent.progress.toFixed(0)}%</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-white font-bold">{agent.newClients}</span>
                                                    {agent.newHighVol > 0 && (
                                                        <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 rounded border border-amber-500/30">
                                                            {agent.newHighVol} Calificados
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-blue-300">{agent.retentionRate.toFixed(0)}%</span>
                                                    <span className="text-[10px] text-slate-500">{agent.retained} / {agent.retentionPool}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {agentsList.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-10 text-center text-slate-500">
                                                No se encontraron datos para este periodo.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* QUICK ACTIONS FOOTER */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                <Button variant="outline" className="h-auto py-4 bg-slate-800/50 border-slate-700 hover:bg-slate-700 hover:text-white flex flex-col gap-1 items-center justify-center text-slate-300" onClick={() => navigate('/admin/conquest-reports')}>
                    <BarChart2 className="w-6 h-6 mb-1 text-emerald-400" />
                    <span className="text-sm font-bold">Reportes Detallados</span>
                    <span className="text-[10px] opacity-70 font-normal">Análisis profundo de KPIs</span>
                </Button>

                <Button variant="outline" className="h-auto py-4 bg-slate-800/50 border-slate-700 hover:bg-slate-700 hover:text-white flex flex-col gap-1 items-center justify-center text-slate-300" onClick={() => navigate('/conquista/mapa')}>
                    <MapPin className="w-6 h-6 mb-1 text-amber-400" />
                    <span className="text-sm font-bold">Mapa de Operaciones</span>
                    <span className="text-[10px] opacity-70 font-normal">Geolocalización de toda la fuerza</span>
                </Button>

                <Button variant="outline" className="h-auto py-4 bg-slate-800/50 border-slate-700 hover:bg-slate-700 hover:text-white flex flex-col gap-1 items-center justify-center text-slate-300" onClick={() => navigate('/hr/commissions')}>
                    <Activity className="w-6 h-6 mb-1 text-purple-400" />
                    <span className="text-sm font-bold">Comisiones y Pagos</span>
                    <span className="text-[10px] opacity-70 font-normal">Revisión de incentivos</span>
                </Button>
            </div>

        </div>
    );
}
