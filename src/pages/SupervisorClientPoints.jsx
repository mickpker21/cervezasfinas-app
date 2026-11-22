import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { getClientsPaged } from '@/repositories/clientsRepository';
import { getAllowedRoutes as getRoutesMeta, getAllowedZonas } from '@/repositories/metadataRepository';
import {
    getCachedClientPointsSummary,
    syncClientPointsSummary,
    saveSupervisorClientsSnapshot,
    getSupervisorClientsSnapshot,
} from '@/repositories/clientPointsRepository';
import { isOnline } from '@/lib/network';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import {
    Award,
    Gift,
    Search,
    RefreshCw,
    Download,
    Wifi,
    WifiOff,
    AlertTriangle,
    TrendingUp,
    Users,
    MapPin,
    Phone,
    Clock,
    ChevronLeft,
    ChevronRight,
    Sparkles,
    CheckCircle2,
    ArrowUpDown,
    History,
    ExternalLink,
} from 'lucide-react';

const PREFERRED_ZONE_COLUMNS = ['zona_comercial', 'zona', 'region', 'branch_id'];

const getZoneValue = (client) => {
    if (!client) return null;
    for (const col of PREFERRED_ZONE_COLUMNS) {
        if (client[col] !== undefined && client[col] !== null && String(client[col]).trim() !== '') {
            return String(client[col]).trim();
        }
    }
    return null;
};

const normalizeRouteList = (items) => {
    const map = new Map();
    (items || []).forEach(item => {
        if (item === null || item === undefined) return;
        const str = String(item).trim();
        if (!str) return;
        const key = str.toUpperCase();
        if (!map.has(key)) map.set(key, str);
    });
    return Array.from(map.values()).sort((a, b) =>
        String(a).localeCompare(String(b), undefined, { numeric: true })
    );
};

export default function SupervisorClientPoints({ cadenaFilter = null }) {
    const { user } = useSupabaseAuth();
    const { toast } = useToast();

    const [allClients, setAllClients] = useState([]);
    const [pointsMap, setPointsMap] = useState({});
    const [redemptionCatalog, setRedemptionCatalog] = useState([]);
    const [syncedAt, setSyncedAt] = useState(null);
    const [onlineStatus, setOnlineStatus] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [loadingClients, setLoadingClients] = useState(true);
    const [syncingPoints, setSyncingPoints] = useState(false);

    // Permisos de rutas y zonas del supervisor (idéntico a SupervisorClients)
    const [allowedRoutes, setAllowedRoutes] = useState({ internal: [], sales: [], zones: [] });
    const [routesLoaded, setRoutesLoaded] = useState(false);

    // Filtros
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [zoneFilter, setZoneFilter] = useState('all');
    const [internalRouteFilter, setInternalRouteFilter] = useState('all');
    const [salesRouteFilter, setSalesRouteFilter] = useState('all');
    const [segmentFilter, setSegmentFilter] = useState('all'); // 'all' | 'with_points' | 'redeemable' | 'expiring' | 'zero'
    const [sortBy, setSortBy] = useState('balance_desc'); // 'balance_desc' | 'expiring_desc' | 'earned_desc' | 'recent' | 'name_asc'

    const [page, setPage] = useState(1);
    const PAGE_SIZE = 40;

    // Modal de detalle por cliente
    const [selectedClient, setSelectedClient] = useState(null);

    const clientsFetchedRef = useRef(false);
    const lastRoutesKeyRef = useRef('');

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, zoneFilter, internalRouteFilter, salesRouteFilter, segmentFilter, sortBy]);

    // 1. Cargar cache local de puntos de inmediato (0ms latencia en modo offline) y luego sincronizar
    const loadPointsData = useCallback(async (showNotification = false) => {
        setSyncingPoints(true);
        try {
            const cached = await getCachedClientPointsSummary();
            if (cached) {
                setPointsMap(cached.points_by_client || {});
                setRedemptionCatalog(cached.redemption_catalog || []);
                if (cached.synced_at) setSyncedAt(cached.synced_at);
            }

            const online = await isOnline().catch(() => navigator.onLine);
            setOnlineStatus(online);

            if (online) {
                const fresh = await syncClientPointsSummary();
                setPointsMap(fresh.points_by_client || {});
                setRedemptionCatalog(fresh.redemption_catalog || []);
                if (fresh.synced_at) setSyncedAt(fresh.synced_at);

                if (showNotification && !fresh.fromCache) {
                    toast({
                        title: 'Puntos actualizados',
                        description: 'Los saldos de puntos se sincronizaron y guardaron para uso offline.',
                    });
                }
            } else if (showNotification) {
                toast({
                    title: 'Modo Offline activo',
                    description: 'Mostrando los últimos saldos de puntos guardados en el dispositivo.',
                });
            }
        } catch (err) {
            console.error('[SupervisorClientPoints] Error cargando puntos:', err);
        } finally {
            setSyncingPoints(false);
        }
    }, [toast]);

    useEffect(() => {
        loadPointsData(false);

        const handleOnline = () => {
            setOnlineStatus(true);
            loadPointsData(false);
        };
        const handleOffline = () => setOnlineStatus(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [loadPointsData]);

    // 2. Obtener rutas y zonas permitidas del supervisor (offline-ready)
    const fetchAllowedRoutes = useCallback(async () => {
        if (!user?.id) return;
        try {
            const [routesMeta, zones] = await Promise.all([
                getRoutesMeta(user.id),
                getAllowedZonas(user.id),
            ]);
            const internal = (routesMeta?.internal || []).filter(Boolean);
            const sales = (routesMeta?.sales || []).filter(Boolean);
            const profileZones = user?.profile?.assigned_zones || [];
            const mergedZones = Array.from(new Set([...(zones || []), ...profileZones])).filter(Boolean);

            setAllowedRoutes({ internal, sales, zones: mergedZones });
        } catch (e) {
            console.error('[SupervisorClientPoints] Error obteniendo rutas permitidas:', e);
        } finally {
            setRoutesLoaded(true);
        }
    }, [user?.id, user?.profile?.assigned_zones]);

    useEffect(() => {
        fetchAllowedRoutes();
    }, [fetchAllowedRoutes]);

    // 3. Cargar cartera de clientes permitidos (con respaldo offline en SQLite + kvStorage snapshot)
    const fetchPermittedClients = useCallback(async () => {
        if (!user?.id) {
            setAllClients([]);
            setLoadingClients(false);
            return;
        }
        if (!cadenaFilter && !routesLoaded) return;

        const routesKey = JSON.stringify({
            internal: [...(allowedRoutes.internal || [])].sort(),
            sales: [...(allowedRoutes.sales || [])].sort(),
            zones: [...(allowedRoutes.zones || [])].sort(),
        });

        if (clientsFetchedRef.current && lastRoutesKeyRef.current === routesKey) {
            return;
        }

        setLoadingClients(true);
        try {
            const routeFilters = {};
            if (allowedRoutes.internal?.length > 0) {
                routeFilters.internal_routes = allowedRoutes.internal;
            }
            if (allowedRoutes.sales?.length > 0) {
                routeFilters.sales_routes = allowedRoutes.sales;
            }
            if (!routeFilters.sales_routes && !routeFilters.internal_routes && allowedRoutes.zones?.length > 0) {
                routeFilters.zonas = allowedRoutes.zones;
            }

            let fetchedClients = [];
            try {
                const res = await getClientsPaged({
                    page: 1,
                    pageSize: 50000,
                    userId: user.id,
                    filters: cadenaFilter ? {} : routeFilters,
                });
                fetchedClients = res?.data || [];
            } catch (repoErr) {
                console.warn('[SupervisorClientPoints] Fallo getClientsPaged, usando snapshot local:', repoErr);
            }

            if ((!fetchedClients || fetchedClients.length === 0)) {
                const snapshot = await getSupervisorClientsSnapshot(user.id);
                if (snapshot.length > 0) {
                    fetchedClients = snapshot;
                }
            } else {
                // Guardar snapshot para garantizar disponibilidad futura sin conexión
                saveSupervisorClientsSnapshot(user.id, fetchedClients);
            }

            const filtered = cadenaFilter
                ? fetchedClients.filter(c => {
                      const cad = (c.cadena || c.chain || '').toString().toUpperCase();
                      return cad.includes(cadenaFilter.toUpperCase());
                  })
                : fetchedClients;

            setAllClients(filtered);
            clientsFetchedRef.current = true;
            lastRoutesKeyRef.current = routesKey;
        } catch (err) {
            console.error('[SupervisorClientPoints] Error cargando clientes:', err);
        } finally {
            setLoadingClients(false);
        }
    }, [user?.id, cadenaFilter, routesLoaded, allowedRoutes]);

    useEffect(() => {
        fetchPermittedClients();
    }, [fetchPermittedClients]);

    // Opciones únicas para selectores de filtro
    const { uniqueZones, uniqueInternalRoutes, uniqueSalesRoutes } = useMemo(() => {
        const rawZones = [...(allowedRoutes?.zones || [])];
        const rawInternal = [...(allowedRoutes?.internal || [])];
        const rawSales = [...(allowedRoutes?.sales || [])];

        allClients.forEach(c => {
            const z = getZoneValue(c);
            if (z) rawZones.push(z);
            const ir = c.internal_route || c.ruta_interna || c.ruta_conquista;
            if (ir) rawInternal.push(ir);
            const sr = c.sales_route || c.ruta_venta || c.ruta;
            if (sr) rawSales.push(sr);
        });

        return {
            uniqueZones: normalizeRouteList(rawZones),
            uniqueInternalRoutes: normalizeRouteList(rawInternal),
            uniqueSalesRoutes: normalizeRouteList(rawSales),
        };
    }, [allClients, allowedRoutes]);

    // Costo mínimo de canje activo
    const minRedemptionCost = useMemo(() => {
        if (!redemptionCatalog || redemptionCatalog.length === 0) return null;
        const costs = redemptionCatalog
            .map(p => Number(p.points_required) || 0)
            .filter(n => n > 0);
        return costs.length > 0 ? Math.min(...costs) : null;
    }, [redemptionCatalog]);

    // Enriquecer clientes permitidos con su información de puntos
    const enrichedClients = useMemo(() => {
        return allClients.map(client => {
            const code = String(client.client_code || client.code || '').trim();
            const pt = (code && pointsMap[code]) || null;
            const balance = pt ? Number(pt.balance) || 0 : 0;
            const expiringSoon = pt ? Number(pt.expiring_soon) || 0 : 0;
            const totalEarned = pt ? Number(pt.total_earned) || 0 : 0;
            const totalRedeemed = pt ? Number(pt.total_redeemed) || 0 : 0;
            const pendingRedemptions = pt ? Number(pt.pending_redemptions) || 0 : 0;
            const lastActivity = pt?.last_activity || null;
            const recentTransactions = pt?.recent_transactions || [];
            const canRedeem = minRedemptionCost !== null ? balance >= minRedemptionCost : balance > 0;

            return {
                ...client,
                cleanCode: code,
                zoneVal: getZoneValue(client) || 'Sin zona',
                salesRouteVal: client.sales_route || client.ruta_venta || client.ruta || 'Sin ruta',
                internalRouteVal: client.internal_route || client.ruta_interna || client.ruta_conquista || '',
                balance,
                expiringSoon,
                totalEarned,
                totalRedeemed,
                pendingRedemptions,
                lastActivity,
                recentTransactions,
                canRedeem,
            };
        });
    }, [allClients, pointsMap, minRedemptionCost]);

    // Filtrar por zona / ruta / búsqueda (antes de segmentar para que los KPIs reflejen la ruta seleccionada)
    const territoryFilteredClients = useMemo(() => {
        let list = enrichedClients;

        if (debouncedSearch) {
            const term = debouncedSearch.toLowerCase();
            list = list.filter(c => {
                const name = (c.name || '').toLowerCase();
                const biz = (c.business_name || '').toLowerCase();
                const addr = (c.address || '').toLowerCase();
                const code = (c.cleanCode || '').toLowerCase();
                return name.includes(term) || biz.includes(term) || addr.includes(term) || code.includes(term);
            });
        }

        if (zoneFilter && zoneFilter !== 'all') {
            const target = zoneFilter.trim().toUpperCase();
            list = list.filter(c => c.zoneVal.trim().toUpperCase() === target);
        }

        if (internalRouteFilter && internalRouteFilter !== 'all') {
            const target = internalRouteFilter.trim().toUpperCase();
            list = list.filter(c => c.internalRouteVal.trim().toUpperCase() === target);
        }

        if (salesRouteFilter && salesRouteFilter !== 'all') {
            const target = salesRouteFilter.trim().toUpperCase();
            list = list.filter(c => c.salesRouteVal.trim().toUpperCase() === target);
        }

        return list;
    }, [enrichedClients, debouncedSearch, zoneFilter, internalRouteFilter, salesRouteFilter]);

    // KPIs de la cartera filtrada
    const kpis = useMemo(() => {
        let totalBalance = 0;
        let clientsWithPoints = 0;
        let totalExpiringSoon = 0;
        let clientsExpiringSoon = 0;
        let clientsCanRedeem = 0;
        let totalRedeemedPoints = 0;
        let totalPendingRedemptions = 0;

        territoryFilteredClients.forEach(c => {
            totalBalance += c.balance;
            totalRedeemedPoints += c.totalRedeemed;
            totalPendingRedemptions += c.pendingRedemptions;
            if (c.balance > 0) clientsWithPoints++;
            if (c.expiringSoon > 0) {
                totalExpiringSoon += c.expiringSoon;
                clientsExpiringSoon++;
            }
            if (c.canRedeem && c.balance > 0) clientsCanRedeem++;
        });

        return {
            totalClients: territoryFilteredClients.length,
            totalBalance,
            clientsWithPoints,
            totalExpiringSoon,
            clientsExpiringSoon,
            clientsCanRedeem,
            totalRedeemedPoints,
            totalPendingRedemptions,
        };
    }, [territoryFilteredClients]);

    // Aplicar filtro de segmento + ordenamiento
    const finalClients = useMemo(() => {
        let list = [...territoryFilteredClients];

        if (segmentFilter === 'with_points') {
            list = list.filter(c => c.balance > 0);
        } else if (segmentFilter === 'redeemable') {
            list = list.filter(c => c.canRedeem && c.balance > 0);
        } else if (segmentFilter === 'expiring') {
            list = list.filter(c => c.expiringSoon > 0);
        } else if (segmentFilter === 'zero') {
            list = list.filter(c => c.balance === 0);
        }

        list.sort((a, b) => {
            if (sortBy === 'balance_desc') {
                return (b.balance - a.balance) || (b.totalEarned - a.totalEarned);
            }
            if (sortBy === 'expiring_desc') {
                return (b.expiringSoon - a.expiringSoon) || (b.balance - a.balance);
            }
            if (sortBy === 'earned_desc') {
                return (b.totalEarned - a.totalEarned) || (b.balance - a.balance);
            }
            if (sortBy === 'recent') {
                const da = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
                const db = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
                return db - da;
            }
            const nameA = (a.business_name || a.name || '').toLowerCase();
            const nameB = (b.business_name || b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });

        return list;
    }, [territoryFilteredClients, segmentFilter, sortBy]);

    const totalPages = Math.max(1, Math.ceil(finalClients.length / PAGE_SIZE));
    const paginatedClients = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return finalClients.slice(start, start + PAGE_SIZE);
    }, [finalClients, page]);

    const handleExportCSV = () => {
        if (finalClients.length === 0) return;
        const headers = [
            'Código Cliente',
            'Negocio / Nombre',
            'Ruta de Venta',
            'Ruta Interna',
            'Zona',
            'Puntos Disponibles',
            'Puntos Por Vencer (30d)',
            'Puntos Acumulados Históricos',
            'Puntos Canjeados',
            'Canjes en Proceso',
            'Teléfono',
            'Último Movimiento',
        ];
        const rows = finalClients.map(c => [
            c.cleanCode,
            c.business_name || c.name || '',
            c.salesRouteVal,
            c.internalRouteVal,
            c.zoneVal,
            c.balance,
            c.expiringSoon,
            c.totalEarned,
            c.totalRedeemed,
            c.pendingRedemptions,
            c.phone || '',
            c.lastActivity || '',
        ]);
        const csvContent = [headers, ...rows]
            .map(row => row.map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `puntos_clientes_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleWhatsAppClient = (client) => {
        const rawPhone = String(client.phone || '').replace(/\D/g, '');
        if (!rawPhone) {
            toast({
                title: 'Sin teléfono registrado',
                description: 'Este cliente no tiene un número telefónico asignado.',
                variant: 'destructive',
            });
            return;
        }
        const phone = rawPhone.length === 10 ? `52${rawPhone}` : rawPhone;
        const clientName = client.business_name || client.name || 'Cliente';
        let msg = `Hola *${clientName}*, te saludamos de Cervezas Finas.\n\n`;
        msg += `🏆 Actualmente cuentas con *${client.balance.toLocaleString('es-MX')} puntos disponibles* en tu cuenta (${client.cleanCode}).`;
        if (client.expiringSoon > 0) {
            msg += `\n⚠️ Tienes *${client.expiringSoon.toLocaleString('es-MX')} puntos próximos a vencer* en los siguientes 30 días. ¡Aprovecha para canjearlos!`;
        }
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-3 sm:p-6 space-y-6">
            <Helmet>
                <title>Puntos de Clientes | Supervisión</title>
            </Helmet>

            {/* Encabezado Moderno con Indicador Offline/Online */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 border border-emerald-500/20 p-5 sm:p-6 shadow-xl">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                                <Award className="w-6 h-6" />
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                                Puntos de Lealtad por Cliente
                            </h1>
                            {onlineStatus ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                    <Wifi className="w-3.5 h-3.5" />
                                    Online • Offline Ready
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                                    <WifiOff className="w-3.5 h-3.5" />
                                    Modo Offline (Datos Locales)
                                </span>
                            )}
                        </div>
                        <p className="text-xs sm:text-sm text-slate-400">
                            Consulta el saldo de puntos, vencimientos y premios alcanzables de tu cartera permitida, con soporte completo sin internet.
                            {syncedAt && (
                                <span className="ml-2 text-slate-500">
                                    • Última sincronización: {new Date(syncedAt).toLocaleString('es-MX')}
                                </span>
                            )}
                        </p>
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap">
                        <Button
                            variant="outline"
                            onClick={handleExportCSV}
                            disabled={finalClients.length === 0}
                            className="border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm"
                        >
                            <Download className="w-4 h-4 mr-1.5 text-emerald-400" />
                            Exportar CSV
                        </Button>
                        <Button
                            onClick={() => loadPointsData(true)}
                            disabled={syncingPoints}
                            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-emerald-900/40"
                        >
                            <RefreshCw className={`w-4 h-4 mr-1.5 ${syncingPoints ? 'animate-spin' : ''}`} />
                            {syncingPoints ? 'Sincronizando...' : 'Actualizar Puntos'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Tarjetas KPI Ejecutivas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 sm:p-5 shadow-lg flex items-start justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                            Puntos Activos en Cartera
                        </p>
                        <p className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1 font-mono">
                            {kpis.totalBalance.toLocaleString('es-MX')}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                            En <span className="text-white font-semibold">{kpis.clientsWithPoints}</span> de {kpis.totalClients} clientes permitidos
                        </p>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        <Sparkles className="w-6 h-6" />
                    </div>
                </div>

                <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 sm:p-5 shadow-lg flex items-start justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                            Alcanzan Premio Ahora
                        </p>
                        <p className="text-2xl sm:text-3xl font-black text-cyan-400 mt-1 font-mono">
                            {kpis.clientsCanRedeem.toLocaleString('es-MX')}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                            {minRedemptionCost
                                ? `Desde ${minRedemptionCost.toLocaleString('es-MX')} pts requeridos`
                                : 'Clientes con saldo disponible'}
                        </p>
                    </div>
                    <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                        <Gift className="w-6 h-6" />
                    </div>
                </div>

                <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 sm:p-5 shadow-lg flex items-start justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                            Puntos por Vencer (30 días)
                        </p>
                        <p className="text-2xl sm:text-3xl font-black text-amber-400 mt-1 font-mono">
                            {kpis.totalExpiringSoon.toLocaleString('es-MX')}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                            <span className="text-amber-300 font-semibold">{kpis.clientsExpiringSoon}</span> clientes con puntos por expirar
                        </p>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                </div>

                <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 sm:p-5 shadow-lg flex items-start justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                            Puntos Canjeados
                        </p>
                        <p className="text-2xl sm:text-3xl font-black text-purple-400 mt-1 font-mono">
                            {kpis.totalRedeemedPoints.toLocaleString('es-MX')}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                            <span className="text-purple-300 font-semibold">{kpis.totalPendingRedemptions}</span> canjes activos por entregar
                        </p>
                    </div>
                    <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                        <TrendingUp className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Panel de Filtros y Segmentación */}
            <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-4 shadow-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                    {/* Buscador */}
                    <div className="relative lg:col-span-2">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <Input
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Buscar por código, negocio, cliente o dirección..."
                            className="pl-10 bg-slate-950 border-slate-800 text-white placeholder:text-slate-500"
                        />
                    </div>

                    {/* Filtro Zona */}
                    <select
                        value={zoneFilter}
                        onChange={e => setZoneFilter(e.target.value)}
                        className="h-10 rounded-lg bg-slate-950 border border-slate-800 px-3 text-sm text-slate-200 focus:border-emerald-500 outline-none"
                    >
                        <option value="all">Todas las Zonas ({uniqueZones.length})</option>
                        {uniqueZones.map(z => (
                            <option key={z} value={z}>{z}</option>
                        ))}
                    </select>

                    {/* Filtro Ruta de Venta */}
                    <select
                        value={salesRouteFilter}
                        onChange={e => setSalesRouteFilter(e.target.value)}
                        className="h-10 rounded-lg bg-slate-950 border border-slate-800 px-3 text-sm text-slate-200 focus:border-emerald-500 outline-none"
                    >
                        <option value="all">Todas las Rutas de Venta ({uniqueSalesRoutes.length})</option>
                        {uniqueSalesRoutes.map(r => (
                            <option key={r} value={r}>Ruta {r}</option>
                        ))}
                    </select>

                    {/* Ordenamiento */}
                    <div className="relative">
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value)}
                            className="w-full h-10 rounded-lg bg-slate-950 border border-slate-800 px-3 text-sm text-slate-200 focus:border-emerald-500 outline-none"
                        >
                            <option value="balance_desc">Ordenar: Mayor Saldo de Puntos</option>
                            <option value="expiring_desc">Ordenar: Puntos Próximos a Vencer</option>
                            <option value="earned_desc">Ordenar: Más Puntos Históricos</option>
                            <option value="recent">Ordenar: Actividad Reciente</option>
                            <option value="name_asc">Ordenar: Nombre (A - Z)</option>
                        </select>
                    </div>
                </div>

                {/* Píldoras rápidas de segmentación */}
                <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-800/80">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                            { id: 'all', label: `Todos (${territoryFilteredClients.length})` },
                            { id: 'with_points', label: `Con Puntos (${kpis.clientsWithPoints})` },
                            { id: 'redeemable', label: `🎁 Alcanzan Premio (${kpis.clientsCanRedeem})` },
                            { id: 'expiring', label: `⚠️ Por Vencer (${kpis.clientsExpiringSoon})` },
                            { id: 'zero', label: `Sin Puntos (${territoryFilteredClients.length - kpis.clientsWithPoints})` },
                        ].map(seg => (
                            <button
                                key={seg.id}
                                type="button"
                                onClick={() => setSegmentFilter(seg.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    segmentFilter === seg.id
                                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/50'
                                        : 'bg-slate-800/70 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                }`}
                            >
                                {seg.label}
                            </button>
                        ))}
                    </div>

                    {uniqueInternalRoutes.length > 0 && (
                        <select
                            value={internalRouteFilter}
                            onChange={e => setInternalRouteFilter(e.target.value)}
                            className="h-8 rounded-lg bg-slate-950 border border-slate-800 px-2.5 text-xs text-slate-300"
                        >
                            <option value="all">Todas las Rutas Internas ({uniqueInternalRoutes.length})</option>
                            {uniqueInternalRoutes.map(ir => (
                                <option key={ir} value={ir}>R. Interna: {ir}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {/* Listado de Clientes */}
            {loadingClients ? (
                <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-12 text-center space-y-3">
                    <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
                    <p className="text-slate-300 font-medium">Cargando cartera de clientes permitidos...</p>
                </div>
            ) : paginatedClients.length === 0 ? (
                <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-12 text-center space-y-2">
                    <Users className="w-10 h-10 text-slate-600 mx-auto" />
                    <p className="text-slate-300 font-semibold text-lg">No se encontraron clientes con estos filtros</p>
                    <p className="text-slate-500 text-sm">Prueba cambiando el segmento o limpiando la búsqueda.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {paginatedClients.map(client => {
                        const displayName = client.business_name || client.name || 'Cliente sin nombre';
                        const affordableCount = redemptionCatalog.filter(
                            p => (Number(p.points_required) || 0) > 0 && client.balance >= Number(p.points_required)
                        ).length;

                        return (
                            <div
                                key={client.id || client.cleanCode}
                                onClick={() => setSelectedClient(client)}
                                className="group cursor-pointer rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-emerald-500/40 p-4 sm:p-5 transition-all shadow-md hover:shadow-xl flex flex-col justify-between gap-4"
                            >
                                <div className="space-y-2.5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-emerald-400 font-mono text-xs font-bold border border-slate-700">
                                                    #{client.cleanCode || 'S/C'}
                                                </span>
                                                <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300 text-[11px] font-semibold border border-blue-500/20">
                                                    Ruta {client.salesRouteVal}
                                                </span>
                                                {client.zoneVal && client.zoneVal !== 'Sin zona' && (
                                                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[11px]">
                                                        {client.zoneVal}
                                                    </span>
                                                )}
                                            </div>
                                            <h3 className="font-bold text-white text-base mt-2 line-clamp-1 group-hover:text-emerald-300 transition-colors">
                                                {displayName}
                                            </h3>
                                            {client.name && client.business_name && client.name !== client.business_name && (
                                                <p className="text-xs text-slate-400 line-clamp-1">{client.name}</p>
                                            )}
                                        </div>

                                        {/* Saldo destacado */}
                                        <div className="text-right flex-shrink-0 bg-slate-950/90 border border-slate-800 px-3 py-2 rounded-xl">
                                            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                                                Disponibles
                                            </div>
                                            <div className={`text-xl font-black font-mono ${client.balance > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                {client.balance.toLocaleString('es-MX')}
                                            </div>
                                            <div className="text-[10px] text-slate-500">pts</div>
                                        </div>
                                    </div>

                                    {client.address && (
                                        <p className="text-xs text-slate-400 flex items-center gap-1.5 line-clamp-1">
                                            <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                                            {client.address}
                                        </p>
                                    )}
                                </div>

                                <div className="pt-3 border-t border-slate-800/80 space-y-2">
                                    <div className="grid grid-cols-3 gap-2 text-center bg-slate-950/60 rounded-xl p-2 border border-slate-800/60">
                                        <div>
                                            <div className="text-[10px] text-slate-500">Acumulados</div>
                                            <div className="text-xs font-bold font-mono text-slate-200">
                                                {client.totalEarned.toLocaleString('es-MX')}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-slate-500">Canjeados</div>
                                            <div className="text-xs font-bold font-mono text-purple-300">
                                                {client.totalRedeemed.toLocaleString('es-MX')}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-slate-500">Por Vencer</div>
                                            <div className={`text-xs font-bold font-mono ${client.expiringSoon > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                                                {client.expiringSoon.toLocaleString('es-MX')}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between gap-2 pt-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {affordableCount > 0 ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                                    <Gift className="w-3 h-3" />
                                                    Alcanza {affordableCount} {affordableCount === 1 ? 'premio' : 'premios'}
                                                </span>
                                            ) : (
                                                <span className="text-[11px] text-slate-500">
                                                    {client.balance > 0 ? 'Acumulando para premio' : 'Sin puntos activos'}
                                                </span>
                                            )}

                                            {client.pendingRedemptions > 0 && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                                    {client.pendingRedemptions} canje activo
                                                </span>
                                            )}
                                        </div>

                                        <span className="text-xs text-emerald-400 font-semibold group-hover:underline">
                                            Ver detalle →
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Paginación */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 px-4 py-3 rounded-xl">
                    <span className="text-xs sm:text-sm text-slate-400">
                        Página <strong className="text-white">{page}</strong> de <strong className="text-white">{totalPages}</strong> ({finalClients.length} clientes)
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            className="border-slate-700 bg-slate-800 text-white"
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            Anterior
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= totalPages}
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            className="border-slate-700 bg-slate-800 text-white"
                        >
                            Siguiente
                            <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Modal de Detalle de Puntos del Cliente (100% funcional Offline) */}
            <Dialog open={!!selectedClient} onOpenChange={(open) => !open && setSelectedClient(null)}>
                <DialogContent className="max-w-2xl bg-slate-900 border border-slate-800 text-white max-h-[90vh] overflow-y-auto">
                    {selectedClient && (
                        <>
                            <DialogHeader>
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-mono text-xs font-bold border border-emerald-500/30">
                                                #{selectedClient.cleanCode}
                                            </span>
                                            <span className="px-2.5 py-0.5 rounded-md bg-blue-500/15 text-blue-300 text-xs font-semibold">
                                                Ruta {selectedClient.salesRouteVal}
                                            </span>
                                        </div>
                                        <DialogTitle className="text-xl font-bold text-white">
                                            {selectedClient.business_name || selectedClient.name}
                                        </DialogTitle>
                                        {selectedClient.address && (
                                            <p className="text-xs text-slate-400 mt-1">{selectedClient.address}</p>
                                        )}
                                    </div>
                                </div>
                            </DialogHeader>

                            <div className="space-y-5 mt-2">
                                {/* Resumen de Saldo */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="rounded-xl bg-slate-950 border border-emerald-500/30 p-3 text-center">
                                        <div className="text-[11px] text-slate-400">Saldo Disponible</div>
                                        <div className="text-xl font-black font-mono text-emerald-400 mt-0.5">
                                            {selectedClient.balance.toLocaleString('es-MX')}
                                        </div>
                                    </div>
                                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-center">
                                        <div className="text-[11px] text-slate-400">Por Vencer (30d)</div>
                                        <div className={`text-xl font-black font-mono mt-0.5 ${selectedClient.expiringSoon > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                                            {selectedClient.expiringSoon.toLocaleString('es-MX')}
                                        </div>
                                    </div>
                                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-center">
                                        <div className="text-[11px] text-slate-400">Total Ganados</div>
                                        <div className="text-xl font-black font-mono text-slate-200 mt-0.5">
                                            {selectedClient.totalEarned.toLocaleString('es-MX')}
                                        </div>
                                    </div>
                                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-center">
                                        <div className="text-[11px] text-slate-400">Total Canjeados</div>
                                        <div className="text-xl font-black font-mono text-purple-400 mt-0.5">
                                            {selectedClient.totalRedeemed.toLocaleString('es-MX')}
                                        </div>
                                    </div>
                                </div>

                                {/* Premios del Catálogo Alcanzables */}
                                {redemptionCatalog.length > 0 && (
                                    <div className="space-y-2.5">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                            <Gift className="w-4 h-4 text-cyan-400" />
                                            Catálogo de Canje vs Saldo del Cliente
                                        </h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
                                            {redemptionCatalog.map(prize => {
                                                const cost = Number(prize.points_required) || 0;
                                                const unlocked = selectedClient.balance >= cost;
                                                const missing = Math.max(0, cost - selectedClient.balance);
                                                return (
                                                    <div
                                                        key={prize.id || prize.sku}
                                                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                                                            unlocked
                                                                ? 'bg-emerald-950/30 border-emerald-500/40'
                                                                : 'bg-slate-950/60 border-slate-800 opacity-75'
                                                        }`}
                                                    >
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-bold text-white truncate">{prize.name}</p>
                                                            <p className="text-[11px] font-mono text-slate-400">
                                                                {cost.toLocaleString('es-MX')} pts
                                                            </p>
                                                        </div>
                                                        {unlocked ? (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
                                                                ¡Canjeable!
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                                                Faltan {missing.toLocaleString('es-MX')}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Últimos Movimientos (Offline Ready) */}
                                <div className="space-y-2.5">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                        <History className="w-4 h-4 text-emerald-400" />
                                        Últimos Movimientos de Puntos
                                    </h4>
                                    {selectedClient.recentTransactions && selectedClient.recentTransactions.length > 0 ? (
                                        <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
                                            {selectedClient.recentTransactions.map((tx, i) => {
                                                const isEarned = tx.type === 'earned';
                                                return (
                                                    <div key={tx.id || i} className="p-3 flex items-center justify-between gap-3 text-xs">
                                                        <div>
                                                            <p className="font-semibold text-slate-200">
                                                                {tx.reason || (isEarned ? 'Puntos ganados' : 'Canje de puntos')}
                                                            </p>
                                                            <p className="text-[11px] text-slate-500">
                                                                {tx.created_at ? new Date(tx.created_at).toLocaleString('es-MX') : ''}
                                                                {tx.expires_at && isEarned ? ` • Vence: ${new Date(tx.expires_at).toLocaleDateString('es-MX')}` : ''}
                                                            </p>
                                                        </div>
                                                        <span className={`font-mono font-bold text-sm ${isEarned ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                            {isEarned ? '+' : '-'}{Number(tx.points || 0).toLocaleString('es-MX')}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border border-slate-800 bg-slate-950 p-6 text-center text-xs text-slate-500">
                                            Este cliente aún no registra movimientos en el historial de puntos.
                                        </div>
                                    )}
                                </div>

                                {/* Acciones rápidas */}
                                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                                    {selectedClient.phone && (
                                        <Button
                                            onClick={() => handleWhatsAppClient(selectedClient)}
                                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                                        >
                                            <Phone className="w-3.5 h-3.5 mr-1.5" />
                                            Notificar Puntos por WhatsApp
                                        </Button>
                                    )}
                                    <Button
                                        variant="outline"
                                        onClick={() => setSelectedClient(null)}
                                        className="border-slate-700 bg-slate-800 text-slate-200 text-xs"
                                    >
                                        Cerrar
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
