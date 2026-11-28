import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { getTodayMexico, toMexicoDateString } from '@/lib/dateUtils';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, UserCheck, ClipboardCheck, BarChart3, Wrench, MapPin, TrendingUp, AlertCircle, Calendar, Gift, LayoutDashboard, Settings, ShoppingCart, Briefcase, Target, Image as ImageIcon, Archive, Package, Warehouse, ShieldCheck, Zap, Truck, ClipboardList, LayoutList, Upload, Bell } from 'lucide-react';
import { motion } from 'framer-motion';
import InteractiveMap from '@/components/common/InteractiveMap';
import DailyRoutesSummary from '@/components/admin/routes/DailyRoutesSummary';
import InventoryStats from '@/components/admin/InventoryStats';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import SyncButton from '@/components/SyncButton';
import { fetchVentasPorSku } from '../lib/mysqlVentasPorSku';
import { getClients } from '@/repositories/clientsRepository';
import { getAllVisits } from '@/repositories/visitsRepository';

const AdminDashboard = () => {
    const { user } = useSupabaseAuth();
    const [stats, setStats] = useState({
        totalUsers: 0,
        activeUsersToday: 0,
        totalClients: 0,
        visitsToday: 0,
        activeRoutes: 0,
        totalSales: 0,
        newClientsToday: 0,
        totalVisits: 0,
        clientLevels: {},
        clientsByRoute: {},
        clients: []
    });
    const [recentVisits, setRecentVisits] = useState([]);
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    // ✅ Fix: Agregar estados faltantes
    const [loadingSales, setLoadingSales] = useState(false);
    const [totalSales, setTotalSales] = useState(0);
    const [salesList, setSalesList] = useState([]);

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true);
            try {
                // 1. Usuarios (obtener perfiles con last_sign_in_at / updated_at para usuarios activos hoy)
                const { data: profilesData, count: usersCount } = await supabase
                    .from('profiles')
                    .select('id, updated_at', { count: 'exact' });

                const today = getTodayMexico(); // Mexico timezone
                const activeUsersToday = (profilesData || []).filter(u => {
                    const loginTs = u.updated_at;
                    if (!loginTs) return false;
                    return loginTs.startsWith(today) || toMexicoDateString(loginTs) === today;
                }).length;

                // 2. Clientes (offline repo)
                const allClients = await getClients();

                // 3. Visitas (offline repo)
                const allVisits = await getAllVisits();

                const newClientsToday = allClients.filter(c => c.created_at && c.created_at.startsWith(today)).length;
                const visitsTodayList = allVisits.filter(v => (v.fecha || v.created_at || '').startsWith(today));

                const clientLevels = allClients.reduce((acc, client) => {
                    const level = client.gec || 'Sin nivel';
                    acc[level] = (acc[level] || 0) + 1;
                    return acc;
                }, {});

                const clientsByRoute = allClients.reduce((acc, client) => {
                    const route = client.sales_route || 'Sin ruta';
                    acc[route] = (acc[route] || 0) + 1;
                    return acc;
                }, {});

                // 4. Rutas Activas (estimado)
                const uniqueRoutes = new Set(allClients.map(c => c.sales_route).filter(Boolean));

                setStats({
                    totalUsers: usersCount || 0,
                    activeUsersToday,
                    newClientsToday,
                    visitsToday: visitsTodayList.length,
                    totalClients: allClients.length,
                    totalVisits: allVisits.length,
                    clientLevels,
                    clientsByRoute,
                    clients: allClients,
                    activeRoutes: uniqueRoutes.size
                });
                setClients(allClients);
            } catch (error) {
                console.error('Error loading admin dashboard:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, [user]);

    useEffect(() => {
        const loadSales = async () => {
            setLoadingSales(true);
            let allSales = [];
            try {
                allSales = await fetchVentasPorSku() || [];
            } catch (err) {
                console.error("Error cargando ventas desde MySQL en AdminDashboard:", err);
            }
            let total = 0;
            if (Array.isArray(allSales)) {
                total = allSales.reduce((sum, r) => {
                    const v = r.venta;
                    if (v === null || v === undefined || v === '') return sum;
                    return sum + Number(v);
                }, 0);
            }
            setTotalSales(total);
            setSalesList(allSales);
            setLoadingSales(false);
        };
        loadSales();
    }, []);

    const computedKpis = useMemo(() => {
        const today = getTodayMexico();
        const totalClientsCount = stats.totalClients || clients.length || 0;
        const clientsWithSalesSet = new Set();
        const routesWithSalesToday = new Set();

        if (Array.isArray(salesList)) {
            salesList.forEach(s => {
                const clientId = s.cve_cliente || s.client_id;
                if (clientId) {
                    clientsWithSalesSet.add(String(clientId).trim());
                }

                const dateVal = s.fecha || s.period_date || s.fecha_alta || s.created_at || '';
                if (dateVal) {
                    const isToday = dateVal.startsWith(today) || toMexicoDateString(dateVal) === today;
                    if (isToday) {
                        const r = String(s.ruta || s.sales_route || '').trim();
                        if (r) {
                            routesWithSalesToday.add(r);
                        }
                    }
                }
            });
        }

        const clientsWithSalesCount = clientsWithSalesSet.size;
        const coberturaGlobal = totalClientsCount > 0
            ? ((clientsWithSalesCount / totalClientsCount) * 100).toFixed(1)
            : '0.0';

        const allRoutes = Array.from(new Set((clients || []).map(c => String(c.sales_route || '').trim()).filter(Boolean)));
        const routesWithoutSalesTodayCount = allRoutes.filter(r => !routesWithSalesToday.has(r)).length;

        return {
            coberturaGlobal,
            clientsWithSalesCount,
            totalClientsCount,
            routesWithoutSalesTodayCount,
            totalRoutesCount: allRoutes.length,
        };
    }, [salesList, clients, stats.totalClients]);

    // --- HELPERS PARA RRENDERIZAR TARJETAS ---
    const DashboardSection = ({ title, icon: Icon, children }) => (
        <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-green-500/20 rounded-lg">
                    <Icon className="w-5 h-5 text-green-400" />
                </div>
                <h2 className="text-xl font-bold text-white">{title}</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {children}
            </div>
        </div>
    );

    const NavCard = ({ to, title, desc, icon: Icon, color = "text-green-400" }) => (
        <Link to={to} className="block h-full">
            <Card className="heineken-card h-full hover:bg-white/5 transition-all cursor-pointer border-white/5 hover:border-green-500/50 group">
                <CardHeader className="pb-2">
                    <CardTitle className={`text-sm font-medium flex items-center justify-between ${color}`}>
                        {title}
                        <Icon className="w-4 h-4 opacity-70 group-hover:scale-110 transition-transform" />
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <CardDescription className="text-xs text-slate-400 group-hover:text-slate-200">
                        {desc}
                    </CardDescription>
                </CardContent>
            </Card>
        </Link>
    );

    return (
        <>
            <Helmet>
                <title>Control Central - Cervezas Finas</title>
                <meta name="description" content="Centro de comando administrativo." />
            </Helmet>

            <div className="max-w-[1600px] mx-auto pb-20">
                {/* HEADER */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                            <LayoutDashboard className="w-8 h-8 text-green-500" />
                            Control Central
                        </h1>
                        <p className="text-slate-400 mt-1">
                            Vista global del sistema • <span className="text-green-400 font-medium">Acceso Total</span>
                        </p>
                    </motion.div>
                    <SyncButton variant="default" size="sm" showLabel={true} />
                </div>

                {/* 1. KPIs PRINCIPALES (MONITOREO) */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-10">
                    <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-green-900/50">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-green-400">Venta Actual de Ruta</CardTitle>
                            <BarChart3 className="h-4 w-4 text-green-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-white">
                                {loadingSales ? <span className="text-sm animate-pulse">Calculando...</span> : `${totalSales?.toLocaleString('es-MX')} HL`}
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Volumen total registrado en hojas de venta</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/50 border-white/10">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-blue-400">Visitas Hoy</CardTitle>
                            <MapPin className="h-4 w-4 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-white">{stats.visitsToday}</div>
                            <p className="text-xs text-slate-500 mt-1">Registros de visita generados hoy</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/50 border-white/10">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-amber-400">Clientes Nuevos</CardTitle>
                            <Gift className="h-4 w-4 text-amber-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-white">{stats.newClientsToday}</div>
                            <p className="text-xs text-slate-500 mt-1">Clientes dados de alta hoy</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/50 border-white/10">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-purple-400">Total Usuarios</CardTitle>
                            <Users className="h-4 w-4 text-purple-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-white">{stats.totalUsers}</div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] bg-green-900/40 text-green-400 px-1.5 py-0.5 rounded border border-green-500/20">
                                    {stats.activeRoutes} Rutas Activas
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* NUEVOS KPIS (COBERTURA, USUARIOS ACTIVOS, RUTAS SIN DATOS) */}
                <div className="grid gap-4 md:grid-cols-3 mb-10">
                    <div className="rounded-xl p-4 bg-white/5 border border-white/10 relative overflow-hidden">
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Cobertura Global (%)</div>
                            <Target className="w-4 h-4 text-emerald-400 opacity-80" />
                        </div>
                        <div className="text-3xl font-bold text-white">
                            {loadingSales ? <span className="text-sm text-slate-400 animate-pulse">Calculando...</span> : `${computedKpis.coberturaGlobal}%`}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                            {loadingSales ? 'Procesando ventas' : `${computedKpis.clientsWithSalesCount} de ${computedKpis.totalClientsCount} clientes con compra`}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
                            <div 
                                className="h-full bg-emerald-500 transition-all duration-500" 
                                style={{ width: `${Math.min(Number(computedKpis.coberturaGlobal) || 0, 100)}%` }} 
                            />
                        </div>
                    </div>

                    <div className="rounded-xl p-4 bg-white/5 border border-white/10 relative overflow-hidden">
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Usuarios Activos Hoy</div>
                            <UserCheck className="w-4 h-4 text-cyan-400 opacity-80" />
                        </div>
                        <div className="text-3xl font-bold text-white">
                            {loading ? <span className="text-sm text-slate-400 animate-pulse">Cargando...</span> : stats.activeUsersToday}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                            {loading ? 'Consultando logins' : `${stats.activeUsersToday} de ${stats.totalUsers} usuarios conectados hoy`}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
                            <div 
                                className="h-full bg-cyan-500 transition-all duration-500" 
                                style={{ width: `${stats.totalUsers > 0 ? Math.min((stats.activeUsersToday / stats.totalUsers) * 100, 100) : 0}%` }} 
                            />
                        </div>
                    </div>

                    <div className="rounded-xl p-4 bg-white/5 border border-white/10 relative overflow-hidden">
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-xs font-semibold text-rose-400 uppercase tracking-wider">Rutas sin Datos Hoy</div>
                            <AlertCircle className="w-4 h-4 text-rose-400 opacity-80" />
                        </div>
                        <div className="text-3xl font-bold text-white">
                            {loadingSales ? <span className="text-sm text-slate-400 animate-pulse">Calculando...</span> : computedKpis.routesWithoutSalesTodayCount}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                            {loadingSales ? 'Analizando rutas' : `Sin ventas registradas hoy (${computedKpis.totalRoutesCount} rutas en total)`}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
                            <div 
                                className="h-full bg-rose-500 transition-all duration-500" 
                                style={{ width: `${computedKpis.totalRoutesCount > 0 ? Math.min((computedKpis.routesWithoutSalesTodayCount / computedKpis.totalRoutesCount) * 100, 100) : 0}%` }} 
                            />
                        </div>
                    </div>
                </div>

                {/* 2. GESTIÓN COMERCIAL */}
                <DashboardSection title="Gestión Comercial" icon={Briefcase}>
                    <NavCard to="/admin/clients" title="Directorio de Clientes" desc="Base de datos completa, edición y consulta." icon={Users} color="text-amber-300" />
                    <NavCard to="/admin/mapa-clientes" title="Mapa de Cobertura" desc="Visualización geoespacial de toda la cartera." icon={MapPin} color="text-blue-300" />
                    <NavCard to="/admin/gps-tracking" title="Mapa GPS y Movimientos" desc="Recorridos, trazo por calle y posición en vivo por usuario o ruta." icon={MapPin} color="text-emerald-300" />
                    <NavCard to="/admin/visits" title="Bitácora de Visitas" desc="Auditoría de visitas geolocalizadas." icon={ClipboardCheck} color="text-green-300" />
                    <NavCard to="/admin/sales-import" title="Importar Ventas" desc="Carga masiva de historial de ventas." icon={Upload} color="text-teal-300" />
                    <NavCard to="/admin/metas" title="Metas y Objetivos" desc="Configuración de metas mensuales por ruta." icon={Target} color="text-red-300" />
                    <NavCard to="/admin/conquest-reports" title="Reportes Conquista" desc="Análisis de prospección y nuevos clientes." icon={TrendingUp} color="text-purple-300" />
                    <NavCard to="/admin/comparative-sales" title="Comparativo 2024-25" desc="Análisis de tendencias de venta vs año anterior." icon={BarChart3} color="text-cyan-300" />
                </DashboardSection>

                {/* 3. TIENDA Y E-COMMERCE */}
                <DashboardSection title="Tienda & Marketing" icon={ShoppingCart}>
                    <NavCard to="/admin/shop" title="Administrar Tienda" desc="Productos, precios, promos y banners." icon={Settings} color="text-pink-300" />
                    <NavCard to="/admin/points-config" title="Configuración Puntos" desc="Reglas de lealtad y valor en puntos por SKU." icon={Gift} color="text-amber-300" />
                    <NavCard to="/admin/sku-images" title="Imágenes de Producto" desc="Gestor de carga de imágenes para catálogo." icon={ImageIcon} color="text-indigo-300" />
                    <NavCard to="/utilidades" title="Utilidades" desc="APK de la App, comunicados y herramientas para la fuerza de venta." icon={Archive} color="text-white" />
                </DashboardSection>

                {/* 4. LOGÍSTICA Y ACTIVOS */}
                <DashboardSection title="Logística & Activos" icon={Truck}>
                    <NavCard to="/admin/inventory" title="Inventario Global" desc="Stock en tiempo real de todos los almacenes." icon={Package} color="text-orange-300" />
                    <NavCard to="/admin/warehouses" title="Gestión Almacenes" desc="Alta y baja de almacenes y ubicaciones." icon={Warehouse} color="text-slate-300" />
                    <NavCard to="/admin/work-orders" title="Órdenes de Trabajo" desc="Solicitudes de instalación y mantenimiento." icon={Wrench} color="text-blue-300" />
                    <NavCard to="/admin/asset-status" title="Estado de Activos" desc="Monitoreo de enfriadores y equipos en campo." icon={ShieldCheck} color="text-emerald-300" />
                </DashboardSection>

                {/* 5. ACCESOS A PLATAFORMAS (SUPER ADMIN) */}
                <DashboardSection title="Acceso a Plataformas" icon={Zap}>
                    <Link to="/autoventa/dashboard" className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-900 to-indigo-900 p-6 border border-blue-500/30 hover:border-blue-400 transition-all">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Truck className="w-24 h-24 text-white" />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                            <Truck className="w-5 h-5 text-blue-300" /> App Autoventa
                        </h3>
                        <p className="text-blue-200 text-sm">Interfaz de venta en ruta</p>
                    </Link>

                    <Link to="/warehouse/dashboard" className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-orange-900 to-red-900 p-6 border border-orange-500/30 hover:border-orange-400 transition-all">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Warehouse className="w-24 h-24 text-white" />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                            <ClipboardList className="w-5 h-5 text-orange-300" /> App Almacén
                        </h3>
                        <p className="text-orange-200 text-sm">Control de cargas e inventario</p>
                    </Link>

                    <Link to="/um6/dashboard" className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-purple-900 to-fuchsia-900 p-6 border border-purple-500/30 hover:border-purple-400 transition-all">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Zap className="w-24 h-24 text-white" />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                            <Zap className="w-5 h-5 text-purple-300" /> App UM6
                        </h3>
                        <p className="text-purple-200 text-sm">Punto de venta Unitec</p>
                    </Link>

                    <Link to="/conquista/dashboard" className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-emerald-900 to-teal-900 p-6 border border-emerald-500/30 hover:border-emerald-400 transition-all">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <MapPin className="w-24 h-24 text-white" />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-emerald-300" /> App Conquista
                        </h3>
                        <p className="text-emerald-200 text-sm">Dashboard Hunter</p>
                    </Link>
                </DashboardSection>

                {/* 6. CONFIGURACIÓN */}
                <div className="mt-10 border-t border-white/10 pt-8">
                    <h3 className="text-lg font-bold text-white mb-4">Configuración del Sistema</h3>
                    <div className="grid gap-4 md:grid-cols-3">
                        <Link to="/admin/users" className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-lg border border-white/5 hover:bg-slate-800 transition-colors">
                            <div className="p-2 bg-slate-700 rounded text-slate-300"><Users className="w-5 h-5" /></div>
                            <div>
                                <div className="font-medium text-white">Usuarios y Roles</div>
                                <div className="text-xs text-slate-400">Gestionar accesos y perfiles</div>
                            </div>
                        </Link>
                        <Link to="/admin/settings" className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-lg border border-white/5 hover:bg-slate-800 transition-colors">
                            <div className="p-2 bg-slate-700 rounded text-slate-300"><Settings className="w-5 h-5" /></div>
                            <div>
                                <div className="font-medium text-white">Configuración General</div>
                                <div className="text-xs text-slate-400">Variables globales de la App</div>
                            </div>
                        </Link>
                        <Link to="/admin/push-broadcast" className="flex items-center gap-3 p-4 bg-amber-500/10 rounded-lg border border-amber-500/20 hover:bg-amber-500/20 transition-colors group">
                            <div className="p-2 bg-amber-500/20 rounded text-amber-400 group-hover:scale-110 transition-transform"><Bell className="w-5 h-5" /></div>
                            <div>
                                <div className="font-medium text-white">Notificaciones Globales</div>
                                <div className="text-xs text-slate-400 text-amber-200/50">Enviar aviso Push a todos</div>
                            </div>
                        </Link>
                        <Link to="/admin/evaluation-config" className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-lg border border-white/5 hover:bg-slate-800 transition-colors">
                            <div className="p-2 bg-slate-700 rounded text-slate-300"><LayoutList className="w-5 h-5" /></div>
                            <div>
                                <div className="font-medium text-white">Criterios Evaluación</div>
                                <div className="text-xs text-slate-400">Ajustar encuestas de calidad</div>
                            </div>
                        </Link>
                    </div>
                </div>

            </div>
        </>
    );
};


export default AdminDashboard;
