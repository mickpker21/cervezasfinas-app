import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/supabaseClient';
import { getRouteSessionsForDate, ROUTE_STATUS } from '@/repositories/routeRepository';
import { getTodayMexico } from '@/lib/dateUtils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, RefreshCw, Truck, CheckCircle, XCircle, AlertCircle, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';

export default function RouteMonitoringPage() {
    const [date, setDate] = useState(getTodayMexico());
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState([]); // Merged list
    const [searchTerm, setSearchTerm] = useState('');
    const { toast } = useToast();

    const loadData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Sales Agents (Autoventa/Chofer)
            const { data: users, error: userError } = await supabase
                .from('profiles')
                .select('*')
                .or('role.eq.autoventa,role.eq.chofer,role.eq.vendedor'); // Adjust roles as needed

            if (userError) throw userError;

            // 2. Fetch Sessions for Date
            const sessions = await getRouteSessionsForDate(date);
            const sessionMap = new Map();
            sessions.forEach(s => sessionMap.set(s.user_id, s));

            // 3. Merge
            const merged = (users || []).map(u => {
                const session = sessionMap.get(u.id);
                return {
                    user: u,
                    session: session || null,
                    status: session?.status || 'OPEN', // Default to OPEN if no record
                    isClosed: session?.status === ROUTE_STATUS.CLOSED
                };
            });

            setData(merged);
        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: "No se pudo cargar el monitoreo.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        // Auto-refresh every minute
        const interval = setInterval(loadData, 60000);
        return () => clearInterval(interval);
    }, [date]);

    // Filtering
    const filtered = data.filter(item => {
        const q = searchTerm.toLowerCase();
        return (
            item.user?.name?.toLowerCase().includes(q) ||
            item.user?.route?.toLowerCase().includes(q)
        );
    });

    // Stats
    const totalRoutes = filtered.length;
    const closedRoutes = filtered.filter(i => i.isClosed).length;
    const openRoutes = totalRoutes - closedRoutes;
    const totalSales = filtered.reduce((acc, item) => acc + (Number(item.session?.summary_stats?.salesTotal) || 0), 0);
    const totalBoxes = filtered.reduce((acc, item) => acc + (Number(item.session?.summary_stats?.totalBoxes) || 0), 0);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 space-y-8">
            <Helmet><title>Monitoreo de Rutas</title></Helmet>

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Truck className="text-blue-500" /> Monitoreo de Rutas
                    </h1>
                    <p className="text-slate-400 mt-1">Supervisión en tiempo real de cierre de rutas.</p>
                </div>

                <div className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <CalendarIcon className="text-slate-500 w-4 h-4" />
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="bg-transparent border-none text-white focus:ring-0 text-sm"
                    />
                    <Button size="icon" variant="ghost" onClick={loadData} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="pt-6">
                        <div className="text-xs text-slate-400 uppercase font-bold">Rutas Activas</div>
                        <div className="text-2xl font-bold text-white mt-1">{totalRoutes}</div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="pt-6">
                        <div className="text-xs text-green-400 uppercase font-bold">Abiertas</div>
                        <div className="text-2xl font-bold text-green-500 mt-1">{openRoutes}</div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="pt-6">
                        <div className="text-xs text-red-400 uppercase font-bold">Cerradas</div>
                        <div className="text-2xl font-bold text-red-500 mt-1">{closedRoutes}</div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="pt-6">
                        <div className="text-xs text-blue-400 uppercase font-bold">Venta Total (Cerrada)</div>
                        <div className="text-2xl font-bold text-blue-500 mt-1">${totalSales.toLocaleString()}</div>
                        <div className="text-xs text-slate-500">{totalBoxes} cajas</div>
                    </CardContent>
                </Card>
            </div>

            {/* List */}
            <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Listado de Rutas</CardTitle>
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <Input
                            placeholder="Buscar chofer o ruta..."
                            className="bg-slate-950 border-slate-800 pl-9"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="text-slate-400 border-b border-slate-800">
                                <tr>
                                    <th className="pb-3 pl-2">Ruta</th>
                                    <th className="pb-3">Chofer</th>
                                    <th className="pb-3 text-center">Estado</th>
                                    <th className="pb-3 text-center">Hora Cierre</th>
                                    <th className="pb-3 text-right">Venta ($)</th>
                                    <th className="pb-3 text-right">Cajas</th>
                                    <th className="pb-3 text-right pr-2">Efectividad</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="py-8 text-center text-slate-500">
                                            No se encontraron registros.
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map((item) => (
                                        <tr key={item.user.id} className="group hover:bg-slate-800/50 transition-colors">
                                            <td className="py-3 pl-2 font-mono text-slate-300">
                                                {item.user.route || '---'}
                                            </td>
                                            <td className="py-3 font-medium text-white">
                                                {item.user.name || 'Sin Nombre'}
                                                <div className="text-xs text-slate-500">{item.user.email}</div>
                                            </td>
                                            <td className="py-3 text-center">
                                                {item.isClosed ? (
                                                    <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20">
                                                        CERRADA
                                                    </Badge>
                                                ) : (
                                                    <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20">
                                                        ABIERTA
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="py-3 text-center text-slate-400 font-mono text-xs">
                                                {item.session?.closed_at
                                                    ? new Date(item.session.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                    : '--:--'}
                                            </td>
                                            <td className="py-3 text-right font-medium text-white">
                                                ${(Number(item.session?.summary_stats?.salesTotal) || 0).toLocaleString()}
                                            </td>
                                            <td className="py-3 text-right text-slate-300">
                                                {Number(item.session?.summary_stats?.totalBoxes) || 0}
                                            </td>
                                            <td className="py-3 text-right pr-2 text-slate-400 text-xs">
                                                {item.session?.summary_stats ? (
                                                    <>
                                                        <div>Comp: {item.session.summary_stats.purchaseEffectiveness}%</div>
                                                        <div>Vis: {item.session.summary_stats.visitEffectiveness}%</div>
                                                    </>
                                                ) : '-'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
