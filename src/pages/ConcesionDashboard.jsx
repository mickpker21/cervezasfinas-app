import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DollarSign, MapPin, Users, Target, Briefcase, TrendingUp, Loader2, Beer, BarChart3, Activity } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { getSalesBySku } from '@/repositories/salesRepository';
import { getClients } from '@/repositories/clientsRepository';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

export default function ConcesionDashboard() {
    const navigate = useNavigate();
    const { user } = useSupabaseAuth();
    const [salesData, setSalesData] = useState([]);
    const [totalHL, setTotalHL] = useState(0);
    const [totalClients, setTotalClients] = useState(0);
    const [clientsWithPurchase, setClientsWithPurchase] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState({ year: String(new Date().getFullYear()), month: String(new Date().getMonth() + 1) });

    useEffect(() => {
        let active = true;
        (async () => {
            setIsLoading(true);
            try {
                const year = Number(dateFilter.year);
                const month = dateFilter.month.padStart(2, '0');
                const from = `${year}-${month}-01`;
                const lastDay = new Date(year, Number(dateFilter.month), 0).getDate();
                const to = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
                
                const rows = await getSalesBySku({ from, to });
                if (!active) return;
                
                const hl = (rows || []).reduce((a, r) => a + (Number(r.htls_total) || 0), 0);
                const uniqueClients = new Set((rows || []).map(r => r.cve_cliente).filter(Boolean));
                
                setSalesData(rows || []);
                setTotalHL(hl);
                setClientsWithPurchase(uniqueClients.size);
            } catch (e) {
                console.error('ConcesionDashboard error:', e);
            } finally {
                if (active) setIsLoading(false);
            }
        })();
        return () => { active = false; };
    }, [dateFilter]);

    const chartData = useMemo(() => {
        const grouped = salesData.reduce((acc, sale) => {
            const date = sale.fecha_venta || 'Sin fecha'; 
            if (!acc[date]) acc[date] = 0;
            acc[date] += (Number(sale.htls_total) || 0);
            return acc;
        }, {});
        
        return Object.entries(grouped)
            .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
            .map(([date, hl]) => ({
                name: date.includes('-') ? date.split('-').slice(1).join('-') : date,
                venta: Number(hl.toFixed(2)),
                meta: 0
            }));
    }, [salesData]);

    const avgHLPerClient = clientsWithPurchase > 0 ? (totalHL / clientsWithPurchase) : 0;
    const lastDayOfMonth = new Date(Number(dateFilter.year), Number(dateFilter.month), 0).getDate();
    const isCurrentMonth = (new Date().getFullYear() === Number(dateFilter.year)) && (new Date().getMonth() + 1 === Number(dateFilter.month));
    const elapsedDays = isCurrentMonth ? new Date().getDate() : lastDayOfMonth;
    const avgClientsPerDay = clientsWithPurchase / (elapsedDays || 1);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 space-y-6">
            <Helmet>
                <title>Panel Concesionario - Cervezas Finas</title>
            </Helmet>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-2">
                        <Briefcase className="text-amber-500 w-8 h-8" /> Panel de Concesionario
                    </h1>
                    <p className="text-slate-400">Resumen operativo: Ventas, Metas, Clientes y Comisiones.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="bg-slate-900 border-slate-700 hover:bg-slate-800" onClick={() => navigate('/clients')}>
                        <Users className="w-4 h-4 mr-2 text-blue-400" /> Mis Clientes
                    </Button>
                    <Button variant="outline" className="bg-slate-900 border-slate-700 hover:bg-slate-800" onClick={() => navigate('/conquista/mapa')}>
                        <MapPin className="w-4 h-4 mr-2 text-emerald-400" /> Mapa de Rutas
                    </Button>
                </div>
            </div>

            {/* KPIs */}
            {isLoading ? (
                <div className="flex justify-center items-center h-32">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Card className="bg-slate-900 border-slate-800">
                            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                <CardTitle className="text-sm font-medium text-slate-400">HL Total del Periodo</CardTitle>
                                <Beer className="w-4 h-4 text-amber-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-white">{totalHL.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                                <p className="text-xs text-slate-400 mt-1">Hectolitros facturados</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-slate-900 border-slate-800">
                            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                <CardTitle className="text-sm font-medium text-slate-400">Clientes con Compra</CardTitle>
                                <Users className="w-4 h-4 text-blue-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-white">{clientsWithPurchase}</div>
                                <p className="text-xs text-slate-400 mt-1">En el periodo seleccionado</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-slate-900 border-slate-800">
                            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                <CardTitle className="text-sm font-medium text-slate-400">Promedio HL / Cliente</CardTitle>
                                <BarChart3 className="w-4 h-4 text-emerald-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-white">{avgHLPerClient.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                                <p className="text-xs text-slate-400 mt-1">Volumen promedio</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-slate-900 border-slate-800">
                            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                <CardTitle className="text-sm font-medium text-slate-400">Prom. Clientes al Día</CardTitle>
                                <Activity className="w-4 h-4 text-purple-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-white">{avgClientsPerDay.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1})}</div>
                                <p className="text-xs text-slate-400 mt-1">Con base en {elapsedDays} días transcurridos</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                        <Card className="bg-slate-900 border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-lg text-white">Ventas por Día (HL)</CardTitle>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                        <RechartsTooltip 
                                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                                            cursor={{fill: '#334155', opacity: 0.4}}
                                        />
                                        <Legend />
                                        <Bar dataKey="venta" fill="#10b981" name="Ventas (HL)" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card className="bg-slate-900 border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-lg text-white">Tendencia de Ventas (HL)</CardTitle>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorComision" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                        <RechartsTooltip 
                                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                                        />
                                        <Area type="monotone" dataKey="venta" stroke="#f59e0b" fillOpacity={1} fill="url(#colorComision)" name="Tendencia (HL)" strokeWidth={3} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}
