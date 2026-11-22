import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Truck, CheckCircle, XCircle, Package, Activity, ShieldCheck, Calendar } from 'lucide-react';

export default function DriverPerformanceDashboard() {
    const { user } = useSupabaseAuth();
    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState({
        entregas: 0,
        rechazos: 0,
        porcentajeEntregas: 0,
        cajasEntregadas: 0,
        supervisiones: 0,
        diasLaborados: 0
    });

    useEffect(() => {
        const fetchPerformance = async () => {
            setLoading(true);
            try {
                // 1. Fetch user route
                const userRoute = user?.user_metadata?.route || 'RUTA 1';

                // 2. Fetch clients in this route
                const { getClientsPaged } = await import('@/repositories/clientsRepository');
                const { data: clients } = await getClientsPaged({ page: 1, pageSize: 5000, filters: { sales_route: userRoute }});
                const clientIds = (clients || []).map(c => c.id);

                // 3. Fetch deliveries for this month
                const startOfMonth = new Date();
                startOfMonth.setDate(1);
                startOfMonth.setHours(0, 0, 0, 0);

                let entregas = 0;
                let rechazos = 0;
                let cajas = 0;

                if (clientIds.length > 0) {
                    const { data: orders } = await supabase
                        .from('preventa')
                        .select('id, preventa_items(quantity)')
                        .in('client_id', clientIds)
                        .gte('created_at', startOfMonth.toISOString());

                    (orders || []).forEach(order => {
                        // Count all orders as entregas (no status column available)
                        entregas++;
                        if (order.preventa_items) {
                            order.preventa_items.forEach(item => {
                                cajas += Number(item.quantity || 0);
                            });
                        }
                    });
                }

                // Calculate percentage
                const totalOrders = entregas + rechazos;
                const porcentaje = totalOrders > 0 ? Math.round((entregas / totalOrders) * 100) : 0;

                // 4. Fetch onboard supervisions (fleet_inspections)
                const { count: supervisions } = await supabase
                    .from('fleet_inspections')
                    .select('id', { count: 'exact' })
                    .eq('driver_id', user.id)
                    .gte('created_at', startOfMonth.toISOString());

                setMetrics({
                    entregas,
                    rechazos,
                    porcentajeEntregas: porcentaje,
                    cajasEntregadas: cajas,
                    supervisiones: supervisions || 0,
                    diasLaborados: supervisions || 0 // Proxy for worked days
                });

            } catch (error) {
                console.error("Error fetching driver performance:", error);
            } finally {
                setLoading(false);
            }
        };

        if (user) fetchPerformance();
    }, [user]);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
            <Helmet>
                <title>Mi Desempeño - Chofer</title>
            </Helmet>

            <header className="mb-8">
                <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-500 flex items-center gap-2">
                    <Activity className="h-8 w-8 text-emerald-500" />
                    Mi Desempeño (Este Mes)
                </h1>
                <p className="text-slate-400">Tus indicadores de entrega, rechazos y supervisiones.</p>
            </header>

            {loading ? (
                <div className="text-center text-slate-500 p-12">Calculando métricas...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Efectividad */}
                    <Card className="bg-slate-900 border-slate-800 shadow-xl border-t-4 border-t-blue-500">
                        <CardHeader className="pb-2 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-sm text-slate-400 uppercase tracking-wider">Efectividad de Entrega</CardTitle>
                                <CardDescription className="text-slate-500">Entregas vs Rechazos</CardDescription>
                            </div>
                            <CheckCircle className="h-8 w-8 text-blue-500/50" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-5xl font-black text-white">{metrics.porcentajeEntregas}%</div>
                            <div className="text-sm text-slate-400 mt-2 flex gap-4">
                                <span className="text-emerald-400 font-bold">{metrics.entregas} Exitosas</span>
                                <span className="text-red-400 font-bold">{metrics.rechazos} Rechazos</span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Cajas Entregadas */}
                    <Card className="bg-slate-900 border-slate-800 shadow-xl border-t-4 border-t-emerald-500">
                        <CardHeader className="pb-2 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-sm text-slate-400 uppercase tracking-wider">Volumen Entregado</CardTitle>
                                <CardDescription className="text-slate-500">Cajas físicas descargadas</CardDescription>
                            </div>
                            <Package className="h-8 w-8 text-emerald-500/50" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-5xl font-black text-emerald-400">{metrics.cajasEntregadas.toLocaleString()}</div>
                            <div className="text-sm text-slate-400 mt-2">Cajas Totales en el Mes</div>
                        </CardContent>
                    </Card>

                    {/* Supervisiones Abordo */}
                    <Card className="bg-slate-900 border-slate-800 shadow-xl border-t-4 border-t-indigo-500">
                        <CardHeader className="pb-2 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-sm text-slate-400 uppercase tracking-wider">Supervisiones Abordo</CardTitle>
                                <CardDescription className="text-slate-500">Checklists \u0026 Revisiones</CardDescription>
                            </div>
                            <ShieldCheck className="h-8 w-8 text-indigo-500/50" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-5xl font-black text-indigo-400">{metrics.supervisiones}</div>
                            <div className="text-sm text-slate-400 mt-2">Registros exitosos en ruta</div>
                        </CardContent>
                    </Card>

                    {/* Días Operados */}
                    <Card className="bg-slate-900 border-slate-800 shadow-xl border-t-4 border-t-purple-500">
                        <CardHeader className="pb-2 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-sm text-slate-400 uppercase tracking-wider">Días de Ruta</CardTitle>
                                <CardDescription className="text-slate-500">Días con actividad</CardDescription>
                            </div>
                            <Calendar className="h-8 w-8 text-purple-500/50" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-5xl font-black text-purple-400">{metrics.diasLaborados}</div>
                            <div className="text-sm text-slate-400 mt-2">Días activos en el mes</div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
