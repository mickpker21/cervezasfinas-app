import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { api, API_URL, getShopAuthHeaders } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import {
    Award, Gift, TrendingUp, AlertTriangle, CheckCircle2, Search, RefreshCw,
    Download, ChevronLeft, ChevronRight, Filter, ShoppingBag, DollarSign,
    Users, FileCheck, Layers, Eye, X, ArrowUpDown, Clock, Box, ShieldCheck,
    CheckCircle, XCircle, Clock4, Info, Trash2, MinusCircle, AlertCircle, Calendar
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const getMexicoDateParts = () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    const [year, month] = today.split('-');
    return { today, month: `${year}-${month}`, year };
};

export default function LoyaltyAuditDashboard({ isEmbedded = false }) {
    const { toast } = useToast();
    const initialDates = useMemo(() => getMexicoDateParts(), []);

    // Estado principal de navegación
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'reconciliation' | 'redemptions' | 'clients'

    // Filtro global de periodo (predeterminado: Mes actual)
    const [periodMode, setPeriodMode] = useState('month'); // 'day' | 'month' | 'year' | 'all'
    const [filterDay, setFilterDay] = useState(initialDates.today);
    const [filterMonth, setFilterMonth] = useState(initialDates.month);
    const [filterYear, setFilterYear] = useState(initialDates.year);

    const effectiveDateRange = useMemo(() => {
        if (periodMode === 'day' && filterDay) {
            return { start: filterDay, end: filterDay };
        }
        if (periodMode === 'month' && filterMonth) {
            const [y, m] = filterMonth.split('-').map(Number);
            if (y && m) {
                const lastDay = new Date(y, m, 0).getDate();
                return {
                    start: `${y}-${String(m).padStart(2, '0')}-01`,
                    end: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
                };
            }
        }
        if (periodMode === 'year' && filterYear) {
            return { start: `${filterYear}-01-01`, end: `${filterYear}-12-31` };
        }
        return { start: '', end: '' };
    }, [periodMode, filterDay, filterMonth, filterYear]);

    // Estados de datos
    const [loadingOverview, setLoadingOverview] = useState(false);
    const [overviewData, setOverviewData] = useState(null);

    // Tab 2: Conciliación vs ventas_por_sku
    const [loadingRecon, setLoadingRecon] = useState(false);
    const [reconData, setReconData] = useState({ records: [], kpis: {}, pagination: {} });
    const [reconSearch, setReconSearch] = useState('');
    const [reconStatusFilter, setReconStatusFilter] = useState('discrepancy'); // 'all', 'discrepancy', 'missing', 'excess', 'exact'
    const [reconStartDate, setReconStartDate] = useState('');
    const [reconEndDate, setReconEndDate] = useState('');
    const [reconZona, setReconZona] = useState('');
    const [reconPage, setReconPage] = useState(1);
    const [reconLimit, setReconLimit] = useState(50);

    // Tab 3: Canjes de Premios
    const [loadingRedemptions, setLoadingRedemptions] = useState(false);
    const [redemptionsData, setRedemptionsData] = useState({ redemptions: [], pagination: {} });
    const [redemptionsStatus, setRedemptionsStatus] = useState('all');
    const [redemptionsSearch, setRedemptionsSearch] = useState('');
    const [redemptionsPage, setRedemptionsPage] = useState(1);

    // Tab 4: Clientes y Puntos
    const [loadingClients, setLoadingClients] = useState(false);
    const [clientsData, setClientsData] = useState({ clients: [], pagination: {} });
    const [clientsSearch, setClientsSearch] = useState('');
    const [clientsPage, setClientsPage] = useState(1);

    // Modal de Detalle por Cliente
    const [selectedClientCode, setSelectedClientCode] = useState(null);
    const [loadingClientModal, setLoadingClientModal] = useState(false);
    const [clientModalData, setClientModalData] = useState(null);
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);

    // Modal para Quitar Puntos (Ajuste Silencioso / Administrativo)
    const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
    const [adjustClientCode, setAdjustClientCode] = useState('');
    const [adjustClientName, setAdjustClientName] = useState('');
    const [adjustCurrentBalance, setAdjustCurrentBalance] = useState(0);
    const [adjustPoints, setAdjustPoints] = useState('');
    const [adjustReason, setAdjustReason] = useState('Ajuste administrativo');
    const [adjustIsHidden, setAdjustIsHidden] = useState(true);
    const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);

    // Fetch Overview
    const fetchOverview = useCallback(async () => {
        setLoadingOverview(true);
        try {
            const headers = await getShopAuthHeaders();
            const query = new URLSearchParams({ action: 'overview' });
            if (effectiveDateRange.start) query.set('start_date', effectiveDateRange.start);
            if (effectiveDateRange.end) query.set('end_date', effectiveDateRange.end);
            const res = await fetch(`${API_URL}/admin/loyalty-audit.php?${query.toString()}`, { headers });
            const data = await res.json();
            if (data.success) {
                setOverviewData(data);
            } else {
                toast({
                    title: 'Error al cargar resumen',
                    description: data.error || 'No se pudo obtener el resumen de auditoría.',
                    variant: 'destructive',
                });
            }
        } catch (err) {
            console.error('Error fetching overview:', err);
            toast({
                title: 'Error de conexión',
                description: 'Verifica la conexión con el servidor.',
                variant: 'destructive',
            });
        } finally {
            setLoadingOverview(false);
        }
    }, [effectiveDateRange, toast]);

    // Fetch Reconciliation
    const fetchReconciliation = useCallback(async (page = 1) => {
        setLoadingRecon(true);
        try {
            const headers = await getShopAuthHeaders();
            const query = new URLSearchParams({
                action: 'reconciliation',
                page: String(page),
                limit: String(reconLimit),
                search: reconSearch.trim(),
                status_filter: reconStatusFilter,
                start_date: reconStartDate || effectiveDateRange.start,
                end_date: reconEndDate || effectiveDateRange.end,
                zona: reconZona.trim()
            });

            const res = await fetch(`${API_URL}/admin/loyalty-audit.php?${query.toString()}`, { headers });
            const data = await res.json();
            if (data.success) {
                setReconData(data);
                setReconPage(page);
            } else {
                toast({
                    title: 'Error en conciliación',
                    description: data.error || 'No se pudieron calcular las diferencias.',
                    variant: 'destructive',
                });
            }
        } catch (err) {
            console.error('Error fetching reconciliation:', err);
            toast({
                title: 'Error de conexión',
                description: 'No se pudo obtener la comparativa con ventas_por_sku.',
                variant: 'destructive',
            });
        } finally {
            setLoadingRecon(false);
        }
    }, [reconLimit, reconSearch, reconStatusFilter, reconStartDate, reconEndDate, effectiveDateRange, reconZona, toast]);

    // Fetch Redemptions
    const fetchRedemptions = useCallback(async (page = 1) => {
        setLoadingRedemptions(true);
        try {
            const headers = await getShopAuthHeaders();
            const query = new URLSearchParams({
                action: 'redemptions_list',
                page: String(page),
                limit: '50',
                status: redemptionsStatus,
                search: redemptionsSearch.trim(),
                start_date: effectiveDateRange.start,
                end_date: effectiveDateRange.end
            });

            const res = await fetch(`${API_URL}/admin/loyalty-audit.php?${query.toString()}`, { headers });
            const data = await res.json();
            if (data.success) {
                setRedemptionsData(data);
                setRedemptionsPage(page);
            } else {
                toast({
                    title: 'Error en canjes',
                    description: data.error || 'No se pudieron cargar los canjes.',
                    variant: 'destructive',
                });
            }
        } catch (err) {
            console.error('Error fetching redemptions:', err);
        } finally {
            setLoadingRedemptions(false);
        }
    }, [redemptionsStatus, redemptionsSearch, effectiveDateRange, toast]);

    // Fetch Clients List
    const fetchClients = useCallback(async (page = 1) => {
        setLoadingClients(true);
        try {
            const headers = await getShopAuthHeaders();
            const query = new URLSearchParams({
                action: 'clients_points_list',
                page: String(page),
                limit: '50',
                search: clientsSearch.trim(),
                start_date: effectiveDateRange.start,
                end_date: effectiveDateRange.end
            });

            const res = await fetch(`${API_URL}/admin/loyalty-audit.php?${query.toString()}`, { headers });
            const data = await res.json();
            if (data.success) {
                setClientsData(data);
                setClientsPage(page);
            } else {
                toast({
                    title: 'Error al consultar clientes',
                    description: data.error || 'No se pudo obtener la lista de clientes.',
                    variant: 'destructive',
                });
            }
        } catch (err) {
            console.error('Error fetching clients:', err);
        } finally {
            setLoadingClients(false);
        }
    }, [clientsSearch, effectiveDateRange, toast]);

    // Drill-down por cliente
    const openClientDetail = async (clientCode) => {
        if (!clientCode) return;
        setSelectedClientCode(clientCode);
        setIsClientModalOpen(true);
        setLoadingClientModal(true);
        setClientModalData(null);

        try {
            const headers = await getShopAuthHeaders();
            const res = await fetch(`${API_URL}/admin/loyalty-audit.php?action=client_transactions&client_code=${encodeURIComponent(clientCode)}`, { headers });
            const data = await res.json();
            if (data.success) {
                setClientModalData(data);
            } else {
                toast({
                    title: 'Error de cliente',
                    description: data.error || 'No se pudo cargar el historial del cliente.',
                    variant: 'destructive',
                });
            }
        } catch (err) {
            console.error('Error fetching client details:', err);
        } finally {
            setLoadingClientModal(false);
        }
    };

    // Abrir modal para quitar puntos
    const openAdjustPointsModal = (clientCode, clientName, currentBalance) => {
        setAdjustClientCode(clientCode);
        setAdjustClientName(clientName || 'Cliente ' + clientCode);
        setAdjustCurrentBalance(Number(currentBalance || 0));
        setAdjustPoints('');
        setAdjustReason('Ajuste de auditoría');
        setAdjustIsHidden(true);
        setIsAdjustModalOpen(true);
    };

    // Confirmar y aplicar descuento de puntos
    const handleConfirmAdjustPoints = async (e) => {
        e?.preventDefault();
        const pts = parseInt(adjustPoints, 10);
        if (!pts || pts <= 0) {
            toast({ title: 'Cantidad inválida', description: 'Ingresa un número de puntos mayor a 0.', variant: 'destructive' });
            return;
        }
        if (pts > adjustCurrentBalance) {
            toast({
                title: 'Excede saldo disponible',
                description: `El cliente solo tiene ${adjustCurrentBalance} puntos disponibles.`,
                variant: 'destructive'
            });
            return;
        }

        setIsSubmittingAdjust(true);
        try {
            const headers = await getShopAuthHeaders({ 'Content-Type': 'application/json' });
            const res = await fetch(`${API_URL}/admin/loyalty-audit.php?action=adjust_points`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    client_code: adjustClientCode,
                    points: pts,
                    reason: adjustReason.trim() || 'Ajuste administrativo',
                    is_hidden: adjustIsHidden ? 1 : 0
                })
            });
            const data = await res.json();
            if (data.success) {
                toast({
                    title: '¡Puntos descontados!',
                    description: `Se quitaron ${pts} puntos a ${adjustClientCode}. Nuevo saldo: ${data.new_balance} pts.` + (adjustIsHidden ? ' (Movimiento oculto para el usuario)' : ''),
                    className: 'bg-emerald-600 text-white'
                });
                setIsAdjustModalOpen(false);

                // Refrescar vistas activas
                fetchOverview();
                if (activeTab === 'reconciliation') fetchReconciliation(reconPage);
                if (activeTab === 'clients') fetchClients(clientsPage);
                if (isClientModalOpen && selectedClientCode === adjustClientCode) {
                    openClientDetail(adjustClientCode);
                }
            } else {
                toast({
                    title: 'Error al ajustar puntos',
                    description: data.error || 'No se pudo aplicar el descuento.',
                    variant: 'destructive'
                });
            }
        } catch (err) {
            console.error('Error in handleConfirmAdjustPoints:', err);
            toast({ title: 'Error de servidor', description: 'No se pudo conectar con el servidor.', variant: 'destructive' });
        } finally {
            setIsSubmittingAdjust(false);
        }
    };
    const exportReconciliationToCSV = () => {
        const records = reconData?.records || reconData?.data || [];
        if (!records || records.length === 0) {
            toast({ title: 'Sin datos', description: 'No hay registros para exportar.', variant: 'destructive' });
            return;
        }

        const headers = [
            'Código Cliente',
            'Nombre Cliente',
            'Ruta',
            'Zona',
            'Ventas Totales ($)',
            'Cajas Vendidas',
            'Puntos Teóricos (ventas_por_sku)',
            'Puntos Reales Otorgados',
            'Diferencia (Real - Teórico)',
            'Estado Conciliación',
            'Saldo Actual Shop',
            'Última Venta'
        ];

        const rows = records.map(r => [
            `"${r.cve_cliente || r.client_code || ''}"`,
            `"${(r.client_name || '').replace(/"/g, '""')}"`,
            `"${r.ruta || r.sales_route || ''}"`,
            `"${r.zona || ''}"`,
            Number(r.total_sales || r.total_sales_pesos || 0).toFixed(2),
            Number(r.total_boxes || 0).toFixed(2),
            Number(r.theoretical_points || 0),
            Number(r.real_earned_points || 0),
            Number(r.difference || 0),
            `"${r.status || ''}"`,
            Number(r.current_balance || 0),
            `"${r.last_sale_date || ''}"`
        ]);

        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `auditoria_lealtad_vs_ventas_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast({
            title: 'Archivo exportado',
            description: `Se exportaron ${records.length} registros de la página actual.`,
        });
    };

    // Efectos de carga inicial
    useEffect(() => {
        fetchOverview();
    }, [fetchOverview]);

    useEffect(() => {
        if (activeTab === 'reconciliation') {
            fetchReconciliation(1);
        } else if (activeTab === 'redemptions') {
            fetchRedemptions(1);
        } else if (activeTab === 'clients') {
            fetchClients(1);
        }
    }, [activeTab, fetchReconciliation, fetchRedemptions, fetchClients]);

    // Formateadores
    const formatNumber = (num) => Number(num || 0).toLocaleString('es-MX');
    const formatCurrency = (num) => `$${Number(num || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <div className={`space-y-6 ${isEmbedded ? 'p-0' : 'max-w-7xl mx-auto pb-20'}`}>
            {!isEmbedded && (
                <Helmet>
                    <title>Auditoría de Puntos y Ventas | Control Interno & Admin</title>
                </Helmet>
            )}

            {/* HEADER PRINCIPAL */}
            <div className="bg-[#0b1329] border border-white/10 rounded-2xl p-6 shadow-xl relative overflow-hidden backdrop-blur-md">
                <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400">
                                <Award className="w-6 h-6" />
                            </span>
                            <div>
                                <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                                    Auditoría de Lealtad & Conciliación vs Ventas
                                </h1>
                                <p className="text-sm text-gray-400">
                                    Control Interno & Administración · Base de Ventas Maestra: <code className="text-emerald-300 font-mono text-xs bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800">ventas_por_sku</code>
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                if (activeTab === 'overview') fetchOverview();
                                else if (activeTab === 'reconciliation') fetchReconciliation(reconPage);
                                else if (activeTab === 'redemptions') fetchRedemptions(redemptionsPage);
                                else if (activeTab === 'clients') fetchClients(clientsPage);
                            }}
                            className="bg-white/5 border-white/10 hover:bg-white/10 text-white text-xs gap-1.5"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${(loadingOverview || loadingRecon || loadingRedemptions || loadingClients) ? 'animate-spin' : ''}`} />
                            Actualizar
                        </Button>
                    </div>
                </div>

                {/* Banner de regla informativa */}
                <div className="mt-4 p-3 bg-blue-950/40 border border-blue-500/30 rounded-xl flex items-start gap-3 text-xs text-blue-200">
                    <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <div>
                        <span className="font-semibold text-blue-300">Nota de auditoría: </span>
                        Esta herramienta es de carácter estrictamente <strong>comparativo y de supervisión</strong>. 
                        Permite auditar a qué clientes se les han otorgado puntos, el estado y productos más canjeados, 
                        y comparar con la venta registrada en <code className="text-blue-200 bg-blue-900/50 px-1 rounded">ventas_por_sku</code> para detectar omisiones o discrepancias.
                    </div>
                </div>

                {/* FILTRO GLOBAL DE PERIODO (DÍA / MES / AÑO / GENERAL) */}
                <div className="mt-4 p-3.5 bg-gray-900/70 border border-white/10 rounded-xl flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5 mr-1">
                            <Calendar className="w-4 h-4 text-emerald-400" />
                            Periodo:
                        </span>
                        {[
                            { id: 'day', label: 'Día' },
                            { id: 'month', label: 'Mes' },
                            { id: 'year', label: 'Año' },
                            { id: 'all', label: 'General (Todo)' },
                        ].map((mode) => (
                            <button
                                key={mode.id}
                                type="button"
                                onClick={() => setPeriodMode(mode.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                                    periodMode === mode.id
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                                        : 'bg-white/5 text-gray-400 border-white/10 hover:text-white hover:bg-white/10'
                                }`}
                            >
                                {mode.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {periodMode === 'day' && (
                            <input
                                type="date"
                                value={filterDay}
                                onChange={(e) => setFilterDay(e.target.value)}
                                className="bg-gray-950 border border-white/15 text-white px-3 py-1.5 rounded-lg text-xs focus:border-emerald-500 outline-none"
                            />
                        )}
                        {periodMode === 'month' && (
                            <input
                                type="month"
                                value={filterMonth}
                                onChange={(e) => setFilterMonth(e.target.value)}
                                className="bg-gray-950 border border-white/15 text-white px-3 py-1.5 rounded-lg text-xs focus:border-emerald-500 outline-none"
                            />
                        )}
                        {periodMode === 'year' && (
                            <select
                                value={filterYear}
                                onChange={(e) => setFilterYear(e.target.value)}
                                className="bg-gray-950 border border-white/15 text-white px-3 py-1.5 rounded-lg text-xs focus:border-emerald-500 outline-none"
                            >
                                {Array.from({ length: 5 }, (_, idx) => String(Number(initialDates.year) - idx)).map((yr) => (
                                    <option key={yr} value={yr}>{yr}</option>
                                ))}
                            </select>
                        )}
                        {periodMode !== 'month' || filterMonth !== initialDates.month ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setPeriodMode('month');
                                    setFilterMonth(initialDates.month);
                                }}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-white/10 text-emerald-300 border border-emerald-500/30"
                            >
                                Mes actual
                            </button>
                        ) : null}
                        <span className="text-[11px] text-gray-400 px-2 py-1 rounded bg-black/30 border border-white/5">
                            {effectiveDateRange.start && effectiveDateRange.end
                                ? `${effectiveDateRange.start} al ${effectiveDateRange.end}`
                                : 'Historial completo'}
                        </span>
                    </div>
                </div>

                {/* TABS DE NAVEGACIÓN */}
                <div className="mt-6 flex flex-wrap gap-2 border-b border-white/10 pb-2">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                            activeTab === 'overview'
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 font-semibold'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        <TrendingUp className="w-4 h-4" />
                        Resumen Ejecutivo & Top Canjes
                    </button>
                    <button
                        onClick={() => setActiveTab('reconciliation')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                            activeTab === 'reconciliation'
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 font-semibold'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        <FileCheck className="w-4 h-4" />
                        Comparativa vs ventas_por_sku
                    </button>
                    <button
                        onClick={() => setActiveTab('redemptions')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                            activeTab === 'redemptions'
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 font-semibold'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        <Gift className="w-4 h-4" />
                        Historial de Canjes ({overviewData?.kpis?.total_redemptions_count || 0})
                    </button>
                    <button
                        onClick={() => setActiveTab('clients')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                            activeTab === 'clients'
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 font-semibold'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        <Users className="w-4 h-4" />
                        Puntos por Cliente ({overviewData?.kpis?.clients_with_balance || 0})
                    </button>
                </div>
            </div>

            {/* TAB 1: RESUMEN EJECUTIVO */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* METRIC CARDS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Puntos Otorgados Reales */}
                        <div className="bg-[#0b1329] border border-white/10 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Puntos Otorgados</span>
                                <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                                    <Award className="w-5 h-5" />
                                </span>
                            </div>
                            <div className="mt-3">
                                <span className="text-3xl font-extrabold text-white">
                                    {formatNumber(overviewData?.kpis?.total_points_earned)}
                                </span>
                                <span className="text-xs text-emerald-300 ml-1.5 font-medium">pts</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                                <span>{formatNumber(overviewData?.kpis?.earned_tx_count)} transacciones</span>
                                <span>{overviewData?.kpis?.clients_with_tx || 0} clientes</span>
                            </div>
                        </div>

                        {/* Puntos Canjeados */}
                        <div className="bg-[#0b1329] border border-white/10 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wider text-rose-400">Puntos Canjeados</span>
                                <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
                                    <Gift className="w-5 h-5" />
                                </span>
                            </div>
                            <div className="mt-3">
                                <span className="text-3xl font-extrabold text-white">
                                    {formatNumber(overviewData?.kpis?.total_points_redeemed)}
                                </span>
                                <span className="text-xs text-rose-300 ml-1.5 font-medium">pts</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                                <span>{formatNumber(overviewData?.kpis?.total_redemptions_count)} solicitudes</span>
                                <span className="text-emerald-400 font-semibold">{overviewData?.kpis?.redemption_fulfillment_rate}% surtido</span>
                            </div>
                        </div>

                        {/* Pasivo de Puntos en Circulación */}
                        <div className="bg-[#0b1329] border border-white/10 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wider text-purple-400">Pasivo Vivo (Saldo)</span>
                                <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                                    <ShoppingBag className="w-5 h-5" />
                                </span>
                            </div>
                            <div className="mt-3">
                                <span className="text-3xl font-extrabold text-white">
                                    {formatNumber(overviewData?.kpis?.active_liability_points)}
                                </span>
                                <span className="text-xs text-purple-300 ml-1.5 font-medium">pts</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                                <span>Puntos en manos de clientes</span>
                                <span>{overviewData?.kpis?.clients_with_balance || 0} cuentas</span>
                            </div>
                        </div>

                        {/* Conciliación Teórica vs Real */}
                        <div className="bg-[#0b1329] border border-white/10 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Puntos Teóricos Ventas</span>
                                <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                                    <FileCheck className="w-5 h-5" />
                                </span>
                            </div>
                            <div className="mt-3">
                                <span className="text-3xl font-extrabold text-white">
                                    {formatNumber(overviewData?.global_reconciliation?.total_theoretical_points)}
                                </span>
                                <span className="text-xs text-amber-300 ml-1.5 font-medium">pts</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                                <span>Brecha global:</span>
                                <span className={`font-semibold ${
                                    (overviewData?.global_reconciliation?.global_discrepancy || 0) >= 0 ? 'text-amber-400' : 'text-rose-400'
                                }`}>
                                    {overviewData?.global_reconciliation?.global_discrepancy >= 0 ? '+' : ''}
                                    {formatNumber(overviewData?.global_reconciliation?.global_discrepancy)} pts
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* SECCIÓN 2: ESTATUS DE CANJES & TOP PRODUCTOS MÁS CANJEADOS */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Estado de Canjes */}
                        <div className="bg-[#0b1329] border border-white/10 rounded-2xl p-6 shadow-xl space-y-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Gift className="w-5 h-5 text-rose-400" />
                                Estatus de Canjes
                            </h3>
                            <p className="text-xs text-gray-400">
                                Desglose de las {formatNumber(overviewData?.kpis?.total_redemptions_count)} solicitudes de premios registradas.
                            </p>

                            <div className="space-y-3 pt-2">
                                <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                                        <div>
                                            <div className="text-sm font-semibold text-white">Entregados / Surtidos</div>
                                            <div className="text-xs text-gray-400">Premio entregado al cliente</div>
                                        </div>
                                    </div>
                                    <span className="text-lg font-bold text-emerald-400">
                                        {formatNumber(overviewData?.kpis?.delivered_redemptions_count)}
                                    </span>
                                </div>

                                <div className="p-3.5 bg-amber-950/30 border border-amber-500/30 rounded-xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Clock4 className="w-5 h-5 text-amber-400" />
                                        <div>
                                            <div className="text-sm font-semibold text-white">Pendientes de Entrega</div>
                                            <div className="text-xs text-gray-400">En proceso de entrega</div>
                                        </div>
                                    </div>
                                    <span className="text-lg font-bold text-amber-400">
                                        {formatNumber(overviewData?.kpis?.pending_redemptions_count)}
                                    </span>
                                </div>

                                <div className="p-3.5 bg-rose-950/30 border border-rose-500/30 rounded-xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <XCircle className="w-5 h-5 text-rose-400" />
                                        <div>
                                            <div className="text-sm font-semibold text-white">Rechazados / Cancelados</div>
                                            <div className="text-xs text-gray-400">Puntos reintegrados o anulados</div>
                                        </div>
                                    </div>
                                    <span className="text-lg font-bold text-rose-400">
                                        {formatNumber(overviewData?.kpis?.rejected_redemptions_count)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Top Productos Más Canjeados */}
                        <div className="lg:col-span-2 bg-[#0b1329] border border-white/10 rounded-2xl p-6 shadow-xl">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <Award className="w-5 h-5 text-amber-400" />
                                        Productos Más Canjeados (Ranking)
                                    </h3>
                                    <p className="text-xs text-gray-400">
                                        Artículos de mayor demanda en el catálogo de premios y puntos absorbidos.
                                    </p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setActiveTab('redemptions')}
                                    className="text-xs text-emerald-400 hover:text-emerald-300"
                                >
                                    Ver todos los canjes →
                                </Button>
                            </div>

                            {(!overviewData?.top_redeemed_products || overviewData.top_redeemed_products.length === 0) ? (
                                <div className="p-8 text-center text-gray-500 text-sm">
                                    No hay canjes registrados aún en el catálogo.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="border-b border-white/10 text-gray-400 font-semibold uppercase">
                                            <tr>
                                                <th className="py-2.5 px-3">#</th>
                                                <th className="py-2.5 px-3">Producto / Premio</th>
                                                <th className="py-2.5 px-3 text-center">Canjes</th>
                                                <th className="py-2.5 px-3 text-center">Clientes</th>
                                                <th className="py-2.5 px-3 text-right">Puntos Quemados</th>
                                                <th className="py-2.5 px-3 text-right">Stock</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5 text-gray-300">
                                            {overviewData.top_redeemed_products.map((p, idx) => (
                                                <tr key={p.product_sku || idx} className="hover:bg-white/[0.02] transition-colors">
                                                    <td className="py-2.5 px-3 font-bold text-amber-400">
                                                        #{idx + 1}
                                                    </td>
                                                    <td className="py-2.5 px-3">
                                                        <div className="flex items-center gap-2.5">
                                                            {p.image_url ? (
                                                                <img
                                                                    src={p.image_url}
                                                                    alt={p.product_name || p.name}
                                                                    className="w-8 h-8 rounded-lg object-cover border border-white/10 shrink-0"
                                                                    onError={(e) => { e.target.style.display = 'none'; }}
                                                                />
                                                            ) : (
                                                                <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
                                                                    <Box className="w-4 h-4 text-gray-500" />
                                                                </div>
                                                            )}
                                                            <div>
                                                                <div className="font-semibold text-white truncate max-w-[200px] sm:max-w-xs">{p.product_name || p.name}</div>
                                                                <div className="text-[10px] text-gray-500 font-mono">SKU: {p.product_sku}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-center font-bold text-emerald-400">
                                                        {formatNumber(p.total_redeemed_times ?? p.total_redemptions)}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-center text-gray-400">
                                                        {p.distinct_clients ?? p.delivered_times ?? 0}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right font-semibold text-rose-300">
                                                        {formatNumber(p.total_points_used ?? p.total_points_burned)} pts
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right">
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800">
                                                            {formatNumber(p.points_cost)} pts c/u
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: COMPARATIVA VS VENTAS_POR_SKU */}
            {activeTab === 'reconciliation' && (
                <div className="space-y-6">
                    {/* KPI BANNER DE RECONCILIACIÓN */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-[#0b1329] border border-white/10 rounded-2xl p-4 shadow-lg">
                            <span className="text-xs text-gray-400 block font-medium">Clientes Auditados</span>
                            <span className="text-2xl font-bold text-white mt-1 block">
                                {formatNumber(reconData?.kpis?.total_clients_audited)}
                            </span>
                            <span className="text-[11px] text-gray-500">Con ventas en ventas_por_sku</span>
                        </div>

                        <div className="bg-[#0b1329] border border-emerald-500/20 rounded-2xl p-4 shadow-lg">
                            <span className="text-xs text-emerald-400 block font-medium flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5" /> Clientes Cuadrados
                            </span>
                            <span className="text-2xl font-bold text-emerald-400 mt-1 block">
                                {formatNumber(reconData?.kpis?.exact_count)}
                            </span>
                            <span className="text-[11px] text-emerald-300/70">Puntos exactos vs venta</span>
                        </div>

                        <div className="bg-[#0b1329] border border-rose-500/20 rounded-2xl p-4 shadow-lg">
                            <span className="text-xs text-rose-400 block font-medium flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" /> Faltan Puntos
                            </span>
                            <span className="text-2xl font-bold text-rose-400 mt-1 block">
                                {formatNumber(reconData?.kpis?.missing_count)}
                            </span>
                            <span className="text-[11px] text-rose-300/70">Venta sin puntos acreditados</span>
                        </div>

                        <div className="bg-[#0b1329] border border-amber-500/20 rounded-2xl p-4 shadow-lg">
                            <span className="text-xs text-amber-400 block font-medium flex items-center gap-1">
                                <Award className="w-3.5 h-3.5" /> Puntos Excedentes / Bono
                            </span>
                            <span className="text-2xl font-bold text-amber-400 mt-1 block">
                                {formatNumber(reconData?.kpis?.excess_count)}
                            </span>
                            <span className="text-[11px] text-amber-300/70">Bonos enfriador / manual</span>
                        </div>
                    </div>

                    {/* FILTROS DE CONCILIACIÓN */}
                    <div className="bg-[#0b1329] border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <Filter className="w-4 h-4 text-emerald-400" />
                                Filtros de Comparativa
                            </h3>

                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={exportReconciliationToCSV}
                                    className="bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/50 text-xs gap-1.5"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Exportar a Excel / CSV
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                            {/* Buscar cliente */}
                            <div className="relative md:col-span-2">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input
                                    type="text"
                                    value={reconSearch}
                                    onChange={(e) => setReconSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && fetchReconciliation(1)}
                                    placeholder="Buscar por código de cliente o nombre..."
                                    className="w-full bg-gray-900/80 border border-white/10 text-white pl-9 pr-4 py-2 rounded-xl text-xs focus:border-emerald-500 outline-none"
                                />
                            </div>

                            {/* Filtro por Estado */}
                            <div>
                                <select
                                    value={reconStatusFilter}
                                    onChange={(e) => setReconStatusFilter(e.target.value)}
                                    className="w-full bg-gray-900/80 border border-white/10 text-white px-3 py-2 rounded-xl text-xs focus:border-emerald-500 outline-none"
                                >
                                    <option value="discrepancy">Solo Discrepancias (Faltantes o Excedentes)</option>
                                    <option value="missing">Solo Faltan Puntos (Venta {'>'} Puntos)</option>
                                    <option value="excess">Solo Excedentes (Puntos {'>'} Venta)</option>
                                    <option value="exact">Solo Cuadrados (Exactos)</option>
                                    <option value="all">Todos los clientes</option>
                                </select>
                            </div>

                            {/* Zona */}
                            <div>
                                <input
                                    type="text"
                                    value={reconZona}
                                    onChange={(e) => setReconZona(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && fetchReconciliation(1)}
                                    placeholder="Zona (ej. FORANEO, CENTRO)..."
                                    className="w-full bg-gray-900/80 border border-white/10 text-white px-3 py-2 rounded-xl text-xs focus:border-emerald-500 outline-none"
                                />
                            </div>

                            {/* Botón Aplicar */}
                            <div>
                                <Button
                                    size="sm"
                                    onClick={() => fetchReconciliation(1)}
                                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-[34px]"
                                >
                                    Aplicar Filtros
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* TABLA DE CONCILIACIÓN */}
                    <div className="bg-[#0b1329] border border-white/10 rounded-2xl shadow-xl overflow-hidden">
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                            <span className="text-xs text-gray-400 font-medium">
                                Mostrando página {reconPage} de {reconData?.pagination?.total_pages || 1} ({formatNumber(reconData?.pagination?.total_records)} registros)
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={reconPage <= 1 || loadingRecon}
                                    onClick={() => fetchReconciliation(reconPage - 1)}
                                    className="bg-white/5 border-white/10 text-white h-7 px-2 text-xs"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                </Button>
                                <span className="text-xs text-gray-300 font-semibold px-2">{reconPage}</span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={reconPage >= (reconData?.pagination?.total_pages || 1) || loadingRecon}
                                    onClick={() => fetchReconciliation(reconPage + 1)}
                                    className="bg-white/5 border-white/10 text-white h-7 px-2 text-xs"
                                >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>

                        {loadingRecon ? (
                            <div className="p-16 text-center text-gray-400 space-y-3">
                                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-400" />
                                <div className="text-sm">Cruzando ventas_por_sku con transacciones de lealtad...</div>
                            </div>
                        ) : (reconData?.records || reconData?.data || []).length === 0 ? (
                            <div className="p-16 text-center text-gray-500 text-sm">
                                No se encontraron registros con los filtros seleccionados.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="border-b border-white/10 bg-white/[0.02] text-gray-400 font-semibold uppercase">
                                        <tr>
                                            <th className="py-3 px-3">Cliente</th>
                                            <th className="py-3 px-3">Zona / Ruta</th>
                                            <th className="py-3 px-3 text-right">Venta Maestra ($)</th>
                                            <th className="py-3 px-3 text-right">Cajas</th>
                                            <th className="py-3 px-3 text-right">Pts Teóricos</th>
                                            <th className="py-3 px-3 text-right">Pts Reales Otorgados</th>
                                            <th className="py-3 px-3 text-center">Diferencia (Δ)</th>
                                            <th className="py-3 px-3 text-center">Estatus</th>
                                            <th className="py-3 px-3 text-right">Saldo Shop</th>
                                            <th className="py-3 px-3 text-center">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 text-gray-300">
                                        {(reconData?.records || reconData?.data || []).map((r) => {
                                            const diff = Number(r.difference || 0);
                                            const isMissing = r.status === 'MISSING_POINTS';
                                            const isExcess = r.status === 'EXCESS_POINTS';
                                            const isExact = r.status === 'EXACT';
                                            const cCode = r.cve_cliente || r.client_code;

                                            return (
                                                <tr key={cCode} className="hover:bg-white/[0.02] transition-colors">
                                                    <td className="py-2.5 px-3">
                                                        <div className="font-semibold text-white">{r.client_name || 'Sin nombre registrado'}</div>
                                                        <div className="text-[10px] text-gray-500 font-mono">Cód: {cCode}</div>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-gray-400">
                                                        <div>{r.zona || 'N/A'}</div>
                                                        <div className="text-[10px] text-gray-500">Ruta: {r.ruta || r.sales_route || 'N/A'}</div>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right font-medium text-gray-200">
                                                        {formatCurrency(r.total_sales || r.total_sales_pesos)}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right text-gray-400">
                                                        {Number(r.total_boxes || 0).toFixed(1)}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right font-semibold text-amber-300">
                                                        {formatNumber(r.theoretical_points)}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right font-bold text-white">
                                                        {formatNumber(r.real_earned_points)}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-center">
                                                        <span className={`font-bold font-mono ${
                                                            isMissing ? 'text-rose-400' : isExcess ? 'text-blue-400' : 'text-emerald-400'
                                                        }`}>
                                                            {diff > 0 ? `+${formatNumber(diff)}` : formatNumber(diff)}
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-center">
                                                        {isExact && (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800">
                                                                Cuadrado
                                                            </span>
                                                        )}
                                                        {isMissing && (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/60 text-rose-400 border border-rose-800">
                                                                Faltan Pts
                                                            </span>
                                                        )}
                                                        {isExcess && (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-950/60 text-blue-400 border border-blue-800">
                                                                Excedente
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right font-bold text-purple-300">
                                                        {formatNumber(r.current_balance)} pts
                                                    </td>
                                                    <td className="py-2.5 px-3 text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => openClientDetail(cCode)}
                                                                className="h-7 w-7 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40"
                                                                title="Ver desglose y movimientos del cliente"
                                                            >
                                                                <Eye className="w-3.5 h-3.5" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => openAdjustPointsModal(cCode, r.client_name, r.current_balance)}
                                                                className="h-7 w-7 p-0 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40"
                                                                title="Quitar puntos a este cliente"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 3: CANJES DE PREMIOS */}
            {activeTab === 'redemptions' && (
                <div className="space-y-6">
                    {/* Filtros de Canjes */}
                    <div className="bg-[#0b1329] border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="relative sm:col-span-2">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input
                                    type="text"
                                    value={redemptionsSearch}
                                    onChange={(e) => setRedemptionsSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && fetchRedemptions(1)}
                                    placeholder="Buscar por cliente, SKU o nombre de premio..."
                                    className="w-full bg-gray-900/80 border border-white/10 text-white pl-9 pr-4 py-2 rounded-xl text-xs focus:border-emerald-500 outline-none"
                                />
                            </div>

                            <div className="flex gap-2">
                                <select
                                    value={redemptionsStatus}
                                    onChange={(e) => setRedemptionsStatus(e.target.value)}
                                    className="flex-1 bg-gray-900/80 border border-white/10 text-white px-3 py-2 rounded-xl text-xs focus:border-emerald-500 outline-none"
                                >
                                    <option value="all">Todos los estatus</option>
                                    <option value="delivered">Entregados</option>
                                    <option value="pending">Pendientes de Entrega</option>
                                    <option value="rejected">Rechazados</option>
                                </select>
                                <Button
                                    size="sm"
                                    onClick={() => fetchRedemptions(1)}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
                                >
                                    Buscar
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Tabla de Canjes */}
                    <div className="bg-[#0b1329] border border-white/10 rounded-2xl shadow-xl overflow-hidden">
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                            <span className="text-xs text-gray-400 font-medium">
                                Página {redemptionsPage} de {redemptionsData?.pagination?.total_pages || 1} ({formatNumber(redemptionsData?.pagination?.total_records)} solicitudes)
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={redemptionsPage <= 1 || loadingRedemptions}
                                    onClick={() => fetchRedemptions(redemptionsPage - 1)}
                                    className="bg-white/5 border-white/10 text-white h-7 px-2 text-xs"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                </Button>
                                <span className="text-xs text-gray-300 font-semibold px-2">{redemptionsPage}</span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={redemptionsPage >= (redemptionsData?.pagination?.total_pages || 1) || loadingRedemptions}
                                    onClick={() => fetchRedemptions(redemptionsPage + 1)}
                                    className="bg-white/5 border-white/10 text-white h-7 px-2 text-xs"
                                >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>

                        {loadingRedemptions ? (
                            <div className="p-16 text-center text-gray-400 space-y-3">
                                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-400" />
                                <div className="text-sm">Cargando solicitudes de canjes...</div>
                            </div>
                        ) : (redemptionsData?.redemptions || redemptionsData?.data || []).length === 0 ? (
                            <div className="p-16 text-center text-gray-500 text-sm">
                                No se encontraron canjes registrados.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="border-b border-white/10 bg-white/[0.02] text-gray-400 font-semibold uppercase">
                                        <tr>
                                            <th className="py-3 px-3">ID / Fecha</th>
                                            <th className="py-3 px-3">Cliente</th>
                                            <th className="py-3 px-3">Premio Canjeado</th>
                                            <th className="py-3 px-3 text-right">Puntos Usados</th>
                                            <th className="py-3 px-3 text-center">Estatus</th>
                                            <th className="py-3 px-3">Notas / Entrega</th>
                                            <th className="py-3 px-3 text-center">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 text-gray-300">
                                        {(redemptionsData?.redemptions || redemptionsData?.data || []).map((rd) => (
                                            <tr key={rd.id} className="hover:bg-white/[0.02] transition-colors">
                                                <td className="py-2.5 px-3">
                                                    <div className="font-mono text-gray-400">#{rd.id}</div>
                                                    <div className="text-[10px] text-gray-500">
                                                        {rd.created_at ? new Date(rd.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}
                                                    </div>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <div className="font-semibold text-white">{rd.client_name || 'Sin nombre'}</div>
                                                    <div className="text-[10px] text-gray-500 font-mono">Cód: {rd.client_code}</div>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <div className="flex items-center gap-2">
                                                        {rd.image_url && (
                                                            <img
                                                                src={rd.image_url}
                                                                alt={rd.product_name}
                                                                className="w-7 h-7 rounded object-cover border border-white/10"
                                                                onError={(e) => { e.target.style.display = 'none'; }}
                                                            />
                                                        )}
                                                        <div>
                                                            <div className="font-semibold text-white">{rd.product_name}</div>
                                                            <div className="text-[10px] text-gray-500 font-mono">SKU: {rd.product_sku}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-2.5 px-3 text-right font-bold text-rose-300">
                                                    {formatNumber(rd.points_used)} pts
                                                </td>
                                                <td className="py-2.5 px-3 text-center">
                                                    {rd.status === 'delivered' && (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800">
                                                            Entregado
                                                        </span>
                                                    )}
                                                    {rd.status === 'pending' && (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/60 text-amber-400 border border-amber-800">
                                                            Pendiente
                                                        </span>
                                                    )}
                                                    {rd.status === 'rejected' && (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/60 text-rose-400 border border-rose-800">
                                                            Rechazado
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-3 text-gray-400 text-[11px] max-w-xs truncate">
                                                    {rd.delivery_notes || (rd.delivered_at ? `Entregado el ${new Date(rd.delivered_at).toLocaleDateString('es-MX')}` : 'Sin notas')}
                                                </td>
                                                <td className="py-2.5 px-3 text-center">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openClientDetail(rd.client_code)}
                                                        className="h-7 w-7 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40"
                                                        title="Ver cliente"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 4: CLIENTES Y PUNTOS */}
            {activeTab === 'clients' && (
                <div className="space-y-6">
                    {/* Filtros */}
                    <div className="bg-[#0b1329] border border-white/10 rounded-2xl p-5 shadow-xl">
                        <div className="flex gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input
                                    type="text"
                                    value={clientsSearch}
                                    onChange={(e) => setClientsSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && fetchClients(1)}
                                    placeholder="Buscar por código de cliente o nombre..."
                                    className="w-full bg-gray-900/80 border border-white/10 text-white pl-9 pr-4 py-2 rounded-xl text-xs focus:border-emerald-500 outline-none"
                                />
                            </div>
                            <Button
                                size="sm"
                                onClick={() => fetchClients(1)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
                            >
                                Buscar
                            </Button>
                        </div>
                    </div>

                    {/* Tabla de Clientes */}
                    <div className="bg-[#0b1329] border border-white/10 rounded-2xl shadow-xl overflow-hidden">
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                            <span className="text-xs text-gray-400 font-medium">
                                Página {clientsPage} de {clientsData?.pagination?.total_pages || 1} ({formatNumber(clientsData?.pagination?.total_records)} clientes con actividad)
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={clientsPage <= 1 || loadingClients}
                                    onClick={() => fetchClients(clientsPage - 1)}
                                    className="bg-white/5 border-white/10 text-white h-7 px-2 text-xs"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                </Button>
                                <span className="text-xs text-gray-300 font-semibold px-2">{clientsPage}</span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={clientsPage >= (clientsData?.pagination?.total_pages || 1) || loadingClients}
                                    onClick={() => fetchClients(clientsPage + 1)}
                                    className="bg-white/5 border-white/10 text-white h-7 px-2 text-xs"
                                >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>

                        {loadingClients ? (
                            <div className="p-16 text-center text-gray-400 space-y-3">
                                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-400" />
                                <div className="text-sm">Cargando directorio de clientes...</div>
                            </div>
                        ) : (clientsData?.clients || clientsData?.data || []).length === 0 ? (
                            <div className="p-16 text-center text-gray-500 text-sm">
                                No se encontraron clientes con puntos o actividad.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="border-b border-white/10 bg-white/[0.02] text-gray-400 font-semibold uppercase">
                                        <tr>
                                            <th className="py-3 px-3">Código</th>
                                            <th className="py-3 px-3">Cliente</th>
                                            <th className="py-3 px-3 text-right">Puntos Ganados</th>
                                            <th className="py-3 px-3 text-right">Puntos Canjeados</th>
                                            <th className="py-3 px-3 text-right">Saldo Actual</th>
                                            <th className="py-3 px-3 text-center">Última Transacción</th>
                                            <th className="py-3 px-3 text-center">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 text-gray-300">
                                        {(clientsData?.clients || clientsData?.data || []).map((c) => (
                                            <tr key={c.client_code} className="hover:bg-white/[0.02] transition-colors">
                                                <td className="py-2.5 px-3 font-mono font-bold text-white">
                                                    {c.client_code}
                                                </td>
                                                <td className="py-2.5 px-3 font-semibold text-gray-200">
                                                    {c.client_name || 'Sin nombre registrado'}
                                                </td>
                                                <td className="py-2.5 px-3 text-right font-semibold text-emerald-400">
                                                    {formatNumber(c.total_earned)} pts
                                                </td>
                                                <td className="py-2.5 px-3 text-right font-semibold text-rose-300">
                                                    {formatNumber(c.total_redeemed)} pts
                                                </td>
                                                <td className="py-2.5 px-3 text-right font-extrabold text-purple-300">
                                                    {formatNumber(c.current_balance)} pts
                                                </td>
                                                <td className="py-2.5 px-3 text-center text-gray-400 text-[10px]">
                                                    {c.last_transaction_date ? new Date(c.last_transaction_date).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin registro'}
                                                </td>
                                                <td className="py-2.5 px-3 text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => openClientDetail(c.client_code)}
                                                            className="h-7 w-7 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40"
                                                            title="Ver estado de cuenta completo"
                                                        >
                                                            <Eye className="w-3.5 h-3.5" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => openAdjustPointsModal(c.client_code, c.client_name, c.current_balance)}
                                                            className="h-7 w-7 p-0 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40"
                                                            title="Quitar puntos a este cliente"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* MODAL DE DETALLE Y DRILL-DOWN POR CLIENTE */}
            <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
                <DialogContent className="max-w-4xl bg-[#090f1e] border border-white/10 text-white shadow-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-bold text-white">
                            <ShieldCheck className="w-5 h-5 text-emerald-400" />
                            Auditoría de Cliente: {selectedClientCode}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-gray-400">
                            {clientModalData?.client_name || 'Consultando datos del cliente...'}
                        </DialogDescription>
                    </DialogHeader>

                    {loadingClientModal ? (
                        <div className="p-12 text-center text-gray-400 space-y-3">
                            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-400" />
                            <div className="text-sm">Cargando expediente de auditoría y movimientos...</div>
                        </div>
                    ) : !clientModalData ? (
                        <div className="p-8 text-center text-gray-500 text-sm">
                            No se pudo cargar la información del cliente.
                        </div>
                    ) : (
                        <div className="space-y-6 pt-2">
                            {/* Tarjeta de Resumen */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                                    <span className="text-xs text-gray-400 block">Saldo Actual Shop</span>
                                    <div className="flex items-center justify-between mt-1">
                                        <span className="text-2xl font-extrabold text-purple-400">
                                            {formatNumber(clientModalData.current_balance)} pts
                                        </span>
                                        {Number(clientModalData.current_balance) > 0 && (
                                            <Button
                                                size="sm"
                                                onClick={() => openAdjustPointsModal(selectedClientCode, clientModalData?.client_name, clientModalData?.current_balance)}
                                                className="bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-700/60 text-xs h-7 px-2.5 gap-1"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                                Quitar Puntos
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                                    <span className="text-xs text-gray-400 block">Venta en ventas_por_sku</span>
                                    <span className="text-2xl font-extrabold text-emerald-400 mt-1 block">
                                        {formatCurrency(clientModalData.master_sales_summary?.total_sales)}
                                    </span>
                                    <span className="text-[10px] text-gray-500">
                                        {Number(clientModalData.master_sales_summary?.total_boxes || 0).toFixed(1)} cajas vendidas
                                    </span>
                                </div>
                                <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                                    <span className="text-xs text-gray-400 block">Periodo de Ventas</span>
                                    <span className="text-xs font-semibold text-gray-200 mt-1 block">
                                        {clientModalData.master_sales_summary?.first_sale || 'N/A'} al {clientModalData.master_sales_summary?.last_sale || 'N/A'}
                                    </span>
                                    <span className="text-[10px] text-gray-500">
                                        {clientModalData.master_sales_summary?.brands_count || 0} marcas compradas
                                    </span>
                                </div>
                            </div>

                            {/* Pestañas o Secciones del Modal */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                    <Award className="w-4 h-4 text-emerald-400" />
                                    Libro de Transacciones de Puntos ({clientModalData.transactions?.length || 0})
                                </h4>

                                {(!clientModalData.transactions || clientModalData.transactions.length === 0) ? (
                                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl text-center text-xs text-gray-500">
                                        Sin transacciones registradas en shop_points_transactions.
                                    </div>
                                ) : (
                                    <div className="max-h-60 overflow-y-auto rounded-xl border border-white/10">
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-white/5 text-gray-400 border-b border-white/10">
                                                <tr>
                                                    <th className="py-2 px-3">Fecha</th>
                                                    <th className="py-2 px-3">Tipo</th>
                                                    <th className="py-2 px-3 text-right">Puntos</th>
                                                    <th className="py-2 px-3">Descripción / Referencia</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5 text-gray-300">
                                                {clientModalData.transactions.map((tx) => (
                                                    <tr key={tx.id} className="hover:bg-white/[0.02]">
                                                        <td className="py-2 px-3 text-[11px] text-gray-400">
                                                            {new Date(tx.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                                                        </td>
                                                        <td className="py-2 px-3">
                                                            {tx.type === 'earned' && (
                                                                <span className="text-emerald-400 font-semibold">Ganado (+)</span>
                                                            )}
                                                            {tx.type === 'redeemed' && (
                                                                <span className="text-rose-400 font-semibold">Canje (-)</span>
                                                            )}
                                                            {tx.type === 'expired' && (
                                                                <span className="text-gray-400 font-semibold">Expirado</span>
                                                            )}
                                                        </td>
                                                        <td className={`py-2 px-3 text-right font-bold ${
                                                            tx.type === 'earned' ? 'text-emerald-400' : 'text-rose-400'
                                                        }`}>
                                                            {tx.type === 'earned' ? `+${formatNumber(tx.points)}` : `-${formatNumber(tx.points)}`}
                                                        </td>
                                                        <td className="py-2 px-3 text-gray-400 text-[11px] max-w-sm truncate">
                                                            {tx.description || 'Sin descripción'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Canjes del Cliente */}
                                <h4 className="text-sm font-bold text-white flex items-center gap-2 pt-2">
                                    <Gift className="w-4 h-4 text-rose-400" />
                                    Canjes de Premios Solicitados ({clientModalData.redemptions?.length || 0})
                                </h4>

                                {(!clientModalData.redemptions || clientModalData.redemptions.length === 0) ? (
                                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl text-center text-xs text-gray-500">
                                        El cliente no ha solicitado canjes de premios.
                                    </div>
                                ) : (
                                    <div className="max-h-52 overflow-y-auto rounded-xl border border-white/10">
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-white/5 text-gray-400 border-b border-white/10">
                                                <tr>
                                                    <th className="py-2 px-3">Fecha</th>
                                                    <th className="py-2 px-3">Premio</th>
                                                    <th className="py-2 px-3 text-right">Puntos Usados</th>
                                                    <th className="py-2 px-3 text-center">Estatus</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5 text-gray-300">
                                                {clientModalData.redemptions.map((rd) => (
                                                    <tr key={rd.id} className="hover:bg-white/[0.02]">
                                                        <td className="py-2 px-3 text-[11px] text-gray-400">
                                                            {new Date(rd.created_at).toLocaleDateString('es-MX')}
                                                        </td>
                                                        <td className="py-2 px-3 font-semibold text-white">
                                                            {rd.product_name}
                                                            <span className="text-[10px] text-gray-500 font-mono ml-1">({rd.product_sku})</span>
                                                        </td>
                                                        <td className="py-2 px-3 text-right font-bold text-rose-300">
                                                            {formatNumber(rd.points_used)} pts
                                                        </td>
                                                        <td className="py-2 px-3 text-center">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                                                rd.status === 'delivered' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800' :
                                                                rd.status === 'pending' ? 'bg-amber-950/60 text-amber-400 border border-amber-800' :
                                                                'bg-rose-950/60 text-rose-400 border border-rose-800'
                                                            }`}>
                                                                {rd.status === 'delivered' ? 'Entregado' : rd.status === 'pending' ? 'Pendiente' : 'Rechazado'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* MODAL PARA QUITAR PUNTOS (AJUSTE SILENCIOSO / ADMINISTRATIVO) */}
            <Dialog open={isAdjustModalOpen} onOpenChange={setIsAdjustModalOpen}>
                <DialogContent className="max-w-md bg-[#090f1e] border border-white/10 text-white shadow-2xl rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-lg font-bold text-rose-400">
                            <MinusCircle className="w-5 h-5 text-rose-400" />
                            Descontar / Quitar Puntos
                        </DialogTitle>
                        <DialogDescription className="text-xs text-gray-400">
                            Ajuste administrativo de puntos para el cliente <span className="text-white font-bold">{adjustClientCode}</span> ({adjustClientName}).
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleConfirmAdjustPoints} className="space-y-4 pt-2">
                        <div className="p-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between text-xs">
                            <span className="text-gray-400">Saldo actual disponible:</span>
                            <span className="text-base font-extrabold text-purple-400">{formatNumber(adjustCurrentBalance)} pts</span>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                                Puntos a Descontar <span className="text-rose-400">*</span>
                            </label>
                            <input
                                type="number"
                                min="1"
                                max={adjustCurrentBalance}
                                value={adjustPoints}
                                onChange={(e) => setAdjustPoints(e.target.value)}
                                placeholder="Ej. 50"
                                required
                                className="w-full bg-gray-900 border border-white/10 text-white px-3 py-2 rounded-xl text-sm focus:border-rose-500 outline-none font-mono"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                                Motivo / Referencia del Ajuste
                            </label>
                            <input
                                type="text"
                                value={adjustReason}
                                onChange={(e) => setAdjustReason(e.target.value)}
                                placeholder="Ej. Ajuste de auditoría de lealtad"
                                className="w-full bg-gray-900 border border-white/10 text-white px-3 py-2 rounded-xl text-xs focus:border-rose-500 outline-none"
                            />
                        </div>

                        {/* Switch / Checkbox para ocultar movimiento */}
                        <div className="p-3.5 bg-rose-950/20 border border-rose-500/20 rounded-xl space-y-2">
                            <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-white">
                                <input
                                    type="checkbox"
                                    checked={adjustIsHidden}
                                    onChange={(e) => setAdjustIsHidden(e.target.checked)}
                                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 bg-gray-900 border-white/20"
                                />
                                <span className="font-semibold text-rose-300">
                                    Ocultar movimiento para el usuario (Silencioso)
                                </span>
                            </label>
                            <p className="text-[11px] text-gray-400 pl-6 leading-relaxed">
                                {adjustIsHidden
                                    ? 'El saldo del usuario se reducirá inmediatamente, pero este movimiento NO aparecerá en su historial de transacciones de la App.'
                                    : 'El movimiento aparecerá en el historial de transacciones de la App como un canje o ajuste.'}
                            </p>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setIsAdjustModalOpen(false)}
                                disabled={isSubmittingAdjust}
                                className="bg-white/5 border-white/10 text-white text-xs"
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                size="sm"
                                disabled={isSubmittingAdjust || !adjustPoints || parseInt(adjustPoints, 10) <= 0 || parseInt(adjustPoints, 10) > adjustCurrentBalance}
                                className="bg-rose-600 hover:bg-rose-500 text-white text-xs gap-1.5 font-bold"
                            >
                                {isSubmittingAdjust ? (
                                    <>
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                        Descontando...
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Confirmar Descuento
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
