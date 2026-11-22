import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SyncButton from '@/components/SyncButton';
import DonutProgress from '@/components/DonutProgress';
import { getDailySales } from '@/repositories/directSalesRepository';
import { getTruckInventory } from '@/repositories/inventoryRepository';
import { getClients } from '@/repositories/clientsRepository';
import DashboardSkeleton from '@/components/skeletons/DashboardSkeleton';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Lock, Printer, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BluetoothPrinterService } from '@/services/BluetoothPrinterService';
import { useToast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { kvStorage } from '@/services/kvStorage';
import { getRouteSession, closeRouteSession, ROUTE_STATUS } from '@/repositories/routeRepository';
import { getTodayMexico } from '@/lib/dateUtils';

import StartOfDayWrapper from '@/components/StartOfDayWrapper';

// Componente Reloj
const DashboardClock = React.memo(() => {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);
    return (
        <div className="text-white/60 text-sm">
            {now.toLocaleDateString('es-MX')} — {now.toLocaleTimeString('es-MX')}
        </div>
    );
});

const DAYS_LABEL = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

// Helpers for KPI Calculation
const splitMultiValue = (raw) => {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw.map((entry) => String(entry));
    const text = String(raw).trim();
    if (!text) return [];
    if (text.startsWith('[')) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) return parsed.map((entry) => String(entry));
        } catch (e) { }
    }
    return text.split(/[,;|]/).map((entry) => entry.trim()).filter(Boolean);
};

// Simple normalization for text comparison
const normalizeText = (t) => String(t || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const dayNameToNumber = (input) => {
    if (input === null || input === undefined) return null;
    const dictionary = {
        domingo: 0, dom: 0,
        lunes: 1, lun: 1,
        martes: 2, mar: 2,
        miercoles: 3, mier: 3, mi: 3,
        jueves: 4, jue: 4,
        viernes: 5, vie: 5,
        sabado: 6, sab: 6, saturday: 6,
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5,
    };
    const key = String(input).trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(dictionary, key)) return dictionary[key];
    const numeric = Number(key);
    if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 6) return numeric;
    return null;
};

const parseVisitDays = (client) => {
    if (!client) return [];
    const raw = client.visit_days ?? client.visitDays ?? client.visitDaysText ?? "";
    if (!raw) return [];
    if (Array.isArray(raw)) {
        return raw.map((value) => dayNameToNumber(value)).filter((value) => value !== null);
    }
    if (typeof raw === "object") {
        try { return splitMultiValue(JSON.stringify(raw)).map((value) => dayNameToNumber(value)).filter((value) => value !== null); } catch (e) { return []; }
    }
    if (typeof raw === "string" && raw.trim().startsWith("[")) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.map((value) => dayNameToNumber(value)).filter((value) => value !== null);
        } catch (e) { }
    }
    return splitMultiValue(raw).map((value) => dayNameToNumber(value)).filter((value) => value !== null);
};

export default function AutoventaDashboard() {
    const { user } = useSupabaseAuth();
    const { toast } = useToast();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState('Chofer');
    const [salesRoute, setSalesRoute] = useState('');
    const [routeClosed, setRouteClosed] = useState(false);

    // Daily Stats
    const [stats, setStats] = useState({
        salesTotal: 0,
        salesCount: 0,
        totalBoxes: 0,
        totalHL: 0,
        visitsCount: 0,
        inventoryCount: 0,
        // Effectiveness
        visitEffectiveness: 0,
        purchaseEffectiveness: 0,
        scheduledClients: 0,
        routeName: '',
    });

    const [currentDate, setCurrentDate] = useState(new Date());

    const dateStr = getTodayMexico(); // Strict Mexico Date

    // Initialize User & Route
    useEffect(() => {
        if (user?.profile?.name || user?.user_metadata?.nombre || user?.user_metadata?.name) {
            setUserName(user.profile?.name || user.user_metadata?.nombre || user.user_metadata?.name);
        }

        const initRoute = async () => {
            // Check Session Status first
            try {
                const session = await getRouteSession(user.id, dateStr);
                if (session && session.status === ROUTE_STATUS.CLOSED) {
                    setRouteClosed(true);
                }
            } catch (e) { console.error('Error fetching session', e); }

            // Priority 1: Profiles table (Single Source of Truth set by Sistemas)
            try {
                const { data: profileData } = await supabase.from('profiles').select('ruta').eq('id', user.id).single();
                if (profileData && profileData.ruta) {
                    setSalesRoute(String(profileData.ruta).trim());
                    return;
                }
            } catch (e) {
                console.error('Error fetching route from profiles', e);
            }

            // Priority 2: Metadata (Fallback)
            const metaRoute = user?.user_metadata?.route || user?.user_metadata?.sales_route || user?.user_metadata?.ruta;
            if (metaRoute) {
                setSalesRoute(String(metaRoute).trim());
                return;
            }

            // Priority 2: KV Storage (from General Dashboard selection)
            try {
                const cachedRoute = await kvStorage.getItem('advisor.salesRoute');
                if (cachedRoute) {
                    setSalesRoute(cachedRoute);
                    return;
                }
            } catch (e) {
                console.warn('Error reading route from KV', e);
            }

            // Priority 3: Detect from Clients (Fallback)
            const all = await getClients();
            if (all && all.length > 0) {
                // Find first valid route
                const firstClient = all.find(c => c.sales_route || c.ruta || c.route);
                if (firstClient) {
                    const detected = firstClient.sales_route || firstClient.ruta || firstClient.route;
                    if (detected) {
                        setSalesRoute(String(detected).trim());
                    }
                }
            }
        };

        initRoute();
    }, [user, dateStr]);


    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;
            setLoading(true);
            try {
                // 1. Daily Sales ($ and Boxes)
                const sales = await getDailySales(user.id, dateStr);

                const salesTotal = sales.reduce((acc, s) => acc + Number(s.total_amount), 0);
                const salesCount = sales.length;

                let totalBoxes = 0;
                sales.forEach(s => {
                    s.direct_sales_items?.forEach(i => {
                        totalBoxes += Number(i.quantity) || 0;
                    });
                });

                const totalHL = (totalBoxes * 0.19).toFixed(2);

                // Set logic for Clients with Purchase
                const clientsWithPurchaseSet = new Set(sales.map(s => s.client_id));
                const uniqueClientsWithSales = clientsWithPurchaseSet.size;

                const visitsCount = uniqueClientsWithSales;

                const stock = await getTruckInventory(user.id);
                const inventoryCount = Object.values(stock).reduce((a, b) => a + b, 0);

                // 2. Scheduled Clients (Effectiveness Base)
                let scheduledCount = 0;
                let visitEffectiveness = 0;
                let purchaseEffectiveness = 0;

                const activeRoute = salesRoute || user.user_metadata?.route || '';

                if (activeRoute) {
                    // Fetch clients optimized by route
                    const normalizedUserRoute = normalizeText(activeRoute);

                    // Pass route to getClients for server-side filtering
                    const routeClients = await getClients(activeRoute);

                    // Filter by Today
                    const todayDayNum = currentDate.getDay();
                    const scheduledToday = routeClients.filter(c => {
                        // Double check route match (partial/exact) in case backend is broad
                        const cRoute = c.sales_route || c.ruta || c.route || '';
                        if (normalizeText(cRoute) !== normalizedUserRoute) return false;

                        const days = parseVisitDays(c);
                        return days.includes(todayDayNum);
                    });

                    scheduledCount = scheduledToday.length;

                    visitEffectiveness = scheduledCount > 0
                        ? Math.round((visitsCount / scheduledCount) * 100)
                        : 0;

                    purchaseEffectiveness = scheduledCount > 0
                        ? Math.round((uniqueClientsWithSales / scheduledCount) * 100)
                        : 0;
                }

                setStats({
                    salesTotal,
                    salesCount,
                    totalBoxes,
                    totalHL,
                    visitsCount,
                    inventoryCount,
                    visitEffectiveness,
                    purchaseEffectiveness,
                    scheduledClients: scheduledCount,
                    routeName: activeRoute,
                });

            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [user, salesRoute, currentDate, dateStr]);

    const handleCloseDay = async () => {
        if (!navigator.onLine) {
            // Allow offline close? Maybe yes given local lock. But let's warn.
            // Requirement said "sincronizando..." imply online.
            // But we can allow local lock. 
            // Let's check user's preference? Default to allowing local lock + warn sync later.
        }

        if (confirm("¿Estás seguro de cerrar el día? \n\nNo podrás registrar más ventas hasta mañana.")) {
            toast({ title: "Cerrando Jornada...", description: "Guardando y finalizando ruta." });

            await closeRouteSession(user.id, stats);

            setRouteClosed(true);
            toast({ title: "¡Día Completado!", description: "La jornada ha sido finalizada.", className: "bg-green-600 text-white" });

            // Optional: Print final report automatically
            handlePrint();
        }
    };

    const handlePrint = async () => {
        // Try Bluetooth First
        try {
            if (!BluetoothPrinterService.isConnected) {
                // Try to connect if not already
                await BluetoothPrinterService.connect();
            }
            await BluetoothPrinterService.printDailyReport(stats, user);
            toast({ title: "Imprimiendo Reporte", description: "Enviado a impresora Bluetooth." });
        } catch (e) {
            console.error("Bluetooth Print Failed", e);
            // Fallback to window print if bluetooth fails or user cancels
            if (!Capacitor.isNativePlatform()) {
                window.print();
            } else {
                toast({ title: "Error de Impresión", description: "No se pudo conectar a la impresora.", variant: "destructive" });
            }
        }
    };

    // Helper for cards
    const InfoCard = ({ title, value, subtext, color = "text-green-200", icon: Icon }) => (
        <Card className="bg-[#2a2c44] border-0 shadow-lg print-card-override">
            <CardHeader className="pb-1">
                <CardTitle className={`text-xs ${color} uppercase flex justify-between`}>
                    {title}
                    {Icon && <Icon className="w-4 h-4 opacity-70" />}
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="text-white text-3xl font-extrabold">{value}</div>
                {subtext && <div className="text-white/60 text-xs mt-1">{subtext}</div>}
            </CardContent>
        </Card>
    );

    if (loading) return <DashboardSkeleton />;

    return (
        <StartOfDayWrapper requiredFor={['autoventa']}>
        <div className="max-w-screen-2xl mx-auto px-4 py-4 space-y-6 bg-[#1f2031] min-h-screen text-white pb-24">
            <Helmet><title>Autoventa - Indicadores Día</title></Helmet>

            {/* Header */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="print:hidden">
                <div className="flex flex-col lg:flex-row lg:items-end gap-3 mb-6">
                    <div className="flex-1">
                        <div className="text-white text-3xl font-extrabold leading-tight">Indicadores del Día</div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white/60 text-sm">Chofer: {userName} ·</span>
                            <span className="text-white/60 text-sm">Ruta: {salesRoute || 'Sin Asignar'} ·</span>
                            <span className="text-white/60 text-sm">Día: {DAYS_LABEL[currentDate.getDay()]} {currentDate.getDate()}</span>
                            <DashboardClock />
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Button variant="outline" onClick={handlePrint} className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                            <Printer size={16} className="mr-2" /> Imprimir Reporte
                        </Button>
                        <SyncButton className="bg-green-600 text-white border-none hover:bg-green-700" showLabel={true} />
                    </div>
                </div>
            </motion.div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:hidden">

                {/* Visual Resumen */}
                <Card className="bg-[#2a2c44] border-0 shadow-lg print-card-override">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-white text-base">Resumen de Venta</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 flex items-center justify-center gap-8 py-4">
                        <div style={{ width: 140, height: 140 }} className="shrink-0 flex items-center justify-center relative">
                            <DonutProgress
                                value={stats.inventoryCount + stats.totalBoxes > 0 ? Math.round((stats.totalBoxes / (stats.inventoryCount + stats.totalBoxes)) * 100) : 0}
                                text={`${stats.inventoryCount + stats.totalBoxes > 0 ? Math.round((stats.totalBoxes / (stats.inventoryCount + stats.totalBoxes)) * 100) : 0}%`}
                                color="#22c55e"
                                size={140}
                            />
                            <div className="absolute inset-0 flex items-center justify-center flex-col mt-20 print:hidden">
                                <span className="text-[10px] text-white/50">Vendido (Est.)</span>
                            </div>
                        </div>
                        <div className="space-y-3 flex-1">
                            <div>
                                <div className="text-white/60 text-xs">Venta Total ($)</div>
                                <div className="text-3xl font-bold text-white">${stats.salesTotal.toLocaleString()}</div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/10">
                                <div>
                                    <div className="text-white/60 text-xs text-emerald-200">Volumen</div>
                                    <div className="text-xl font-bold text-white">{stats.totalHL} HL</div>
                                </div>
                                <div>
                                    <div className="text-white/60 text-xs text-blue-200">Cajas</div>
                                    <div className="text-xl font-bold text-white">{stats.totalBoxes}</div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* KPIs Grid */}
                <div className="grid grid-cols-2 gap-4">
                    {/* Effectiveness Cards */}
                    <Card className="bg-[#2a2c44] border-0 shadow-lg print-card-override flex flex-col items-center justify-center py-2">
                        <div className="text-xs text-pink-200 uppercase mb-1">% Efec. Visita</div>
                        <div style={{ width: 60, height: 60 }}>
                            <DonutProgress
                                value={stats.visitEffectiveness}
                                text={`${stats.visitEffectiveness}%`}
                                color="#ec4899"
                                size={60}
                                strokeWidth={6}
                                fontSize={12}
                            />
                        </div>
                        <div className="text-[10px] text-white/60 mt-1">{stats.scheduledClients} agendados</div>
                    </Card>

                    <Card className="bg-[#2a2c44] border-0 shadow-lg print-card-override flex flex-col items-center justify-center py-2">
                        <div className="text-xs text-violet-200 uppercase mb-1">% Efec. Compra</div>
                        <div style={{ width: 60, height: 60 }}>
                            <DonutProgress
                                value={stats.purchaseEffectiveness}
                                text={`${stats.purchaseEffectiveness}%`}
                                color="#8b5cf6"
                                size={60}
                                strokeWidth={6}
                                fontSize={12}
                            />
                        </div>
                        <div className="text-[10px] text-white/60 mt-1">{stats.scheduledClients} agendados</div>
                    </Card>

                    <InfoCard
                        title="Visitas (Hoy)"
                        value={stats.visitsCount}
                        subtext="Clientes con venta"
                        color="text-amber-200"
                    />
                    <InfoCard
                        title="Stock Restante"
                        value={stats.inventoryCount}
                        subtext="Cajas en camión"
                        color="text-pink-200"
                    />
                    <InfoCard
                        title="Tickets"
                        value={stats.salesCount}
                        subtext="Transacciones"
                        color="text-indigo-200"
                    />
                    <Card className="bg-[#2a2c44] border-0 shadow-lg flex items-center justify-center print-card-override">
                        <div className="text-center">
                            <div className="text-white/50 text-xs uppercase mb-1">Estado de Ruta</div>
                            <div className={`font-bold ${routeClosed ? 'text-red-500' : 'text-green-400'}`}>
                                {routeClosed ? 'CERRADA' : 'ACTIVA'}
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Thermal Print Template */}
            <div className="hidden print:block font-mono text-black p-2 max-w-[80mm] mx-auto text-xs leading-tight">
                <div className="text-center font-bold mb-1 text-base">CERVEZAS FINAS</div>
                <div className="text-center mb-2 uppercase">CIERRE DE JORNADA</div>

                <div className="space-y-0.5 mb-2 border-b border-black border-dashed pb-2">
                    <div className="flex justify-between"><span>Fecha:</span> <span>{new Date().toLocaleString('es-MX')}</span></div>
                    <div className="flex justify-between"><span>Chofer:</span> <span>{userName}</span></div>
                    <div className="flex justify-between"><span>Ruta:</span> <span>{user?.user_metadata?.route || '---'}</span></div>
                </div>

                <div className="space-y-1 mb-2">
                    <div className="flex justify-between font-bold border-b border-black pb-1 mb-1">
                        <span>CONCEPTO</span>
                        <span>VALOR</span>
                    </div>
                    <div className="flex justify-between"><span>Venta Total:</span> <span className="font-bold">${stats.salesTotal.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Tickets:</span> <span>{stats.salesCount}</span></div>
                    <div className="flex justify-between"><span>Volumen (HL):</span> <span>{stats.totalHL}</span></div>
                    <div className="flex justify-between"><span>Cajas Vendidas:</span> <span>{stats.totalBoxes}</span></div>
                    <div className="flex justify-between"><span>Visitas Efectivas:</span> <span>{stats.visitsCount}</span></div>
                    <div className="flex justify-between"><span>Inv. Final:</span> <span>{stats.inventoryCount}</span></div>
                </div>

                <div className="mt-8 pt-8 border-t border-black border-dashed">
                    <div className="text-center mb-8">Firma Chofer</div>
                    <div className="h-8 border-b border-black mx-8"></div>
                </div>
                <div className="mt-8 pt-8 border-t border-black border-dashed">
                    <div className="text-center mb-8">Firma Supervisor</div>
                    <div className="h-8 border-b border-black mx-8"></div>
                </div>
            </div>

            {/* Close Day Action */}
            <div className={`mt-6 p-6 border rounded-lg flex flex-col md:flex-row items-center justify-between gap-4 print:hidden shadow-lg ${routeClosed ? 'bg-red-900/20 border-red-500/30' : 'bg-[#2a2c44] border-indigo-500/30'}`}>
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-full ${routeClosed ? 'bg-red-600/20 text-red-300' : 'bg-indigo-600/20 text-indigo-300'}`}>
                        {routeClosed ? <Archive size={24} /> : <Lock size={24} />}
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">
                            {routeClosed ? 'Jornada Finalizada' : 'Cierre de Jornada'}
                        </h3>
                        <p className="text-white/60 text-sm">
                            {routeClosed
                                ? "La ruta de hoy ha sido cerrada. No se permiten más ventas."
                                : "Sincroniza ventas y finaliza la ruta del día."}
                        </p>
                    </div>
                </div>
                {!routeClosed && (
                    <Button onClick={handleCloseDay} className="bg-indigo-600 text-white hover:bg-indigo-700 font-bold px-6">
                        Cerrar Día
                    </Button>
                )}
                {routeClosed && (
                    <Button variant="outline" className="opacity-50 cursor-not-allowed border-red-500 text-red-400">
                        Cerrado
                    </Button>
                )}
            </div>
        </div>
        </StartOfDayWrapper>
    );
}
