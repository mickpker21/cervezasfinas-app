import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    Loader2, Gift, CheckCircle, Truck, AlertCircle, RefreshCw, 
    Search, Calendar, User, Clock, Package, Sparkles
} from 'lucide-react';
import { API_URL, getShopAuthHeaders } from '@/lib/api';
import { getTodayMexico } from '@/lib/dateUtils';

function normalizeStatus(status) {
    const s = String(status || '').toLowerCase().trim();
    if (s === 'pendiente') return 'pending';
    if (s === 'aprobado') return 'approved';
    if (s === 'entregado') return 'delivered';
    if (s === 'cancelado') return 'cancelled';
    return s || 'pending';
}

const getCurrentMonthMexico = () => {
    const today = getTodayMexico();
    return today ? today.slice(0, 7) : new Date().toISOString().slice(0, 7);
};

const getPreviousMonthMexico = () => {
    const cur = getCurrentMonthMexico();
    const [year, month] = cur.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const py = prevDate.getFullYear();
    const pm = String(prevDate.getMonth() + 1).padStart(2, '0');
    return `${py}-${pm}`;
};

export default function TeleventaRedemptions() {
    const [redemptions, setRedemptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(null);
    
    // Filters: Por defecto PENDIENTES y MES ACTUAL
    const [statusFilter, setStatusFilter] = useState('pending');
    const [monthFilter, setMonthFilter] = useState(getCurrentMonthMexico());
    const [exactDateFilter, setExactDateFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        loadRedemptions();
    }, []);

    async function loadRedemptions() {
        setLoading(true);
        setErrorMessage('');
        try {
            const headers = await getShopAuthHeaders();
            const response = await fetch(`${API_URL}/televenta/redemptions-list.php`, { headers });
            
            if (response.status === 401) {
                throw new Error('Sesión no autorizada o expirada. Por favor vuelve a iniciar sesión con tu cuenta de Televenta.');
            }
            if (response.status === 403) {
                throw new Error('Tu usuario no cuenta con el rol requerido (admin, televenta o supervisor) para ver o aprobar canjes.');
            }
            
            const data = await response.json();
            if (data.success && Array.isArray(data.data)) {
                setRedemptions(data.data);
            } else {
                throw new Error(data.error || 'Error al obtener las solicitudes de canje.');
            }
        } catch (error) {
            console.error('Error loading redemptions:', error);
            setErrorMessage(error.message || 'Error al cargar las solicitudes de canje.');
        } finally {
            setLoading(false);
        }
    }

    async function handleApprove(redemption) {
        const rawId = redemption?.id ?? redemption?.redemption_id ?? redemption?.ID ?? 0;
        const id = Number(rawId) || 0;
        
        if (!confirm(`¿Aprobar solicitud de canje para el cliente ${redemption.client_code} (${redemption.product_name || redemption.product_sku})?`)) return;

        const procKey = id > 0 ? id : `${redemption.client_code}-${redemption.created_at}`;
        setProcessing(procKey);
        setErrorMessage('');
        try {
            const response = await fetch(`${API_URL}/televenta/approve-redemption.php`, {
                method: 'POST',
                headers: await getShopAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ 
                    redemption_id: id,
                    client_code: redemption.client_code,
                    created_at: redemption.created_at
                })
            });

            const data = await response.json().catch(() => ({}));
            if (response.ok && data.success) {
                alert('¡Solicitud de canje aprobada exitosamente!');
                loadRedemptions();
            } else {
                throw new Error(data.error || `No se pudo aprobar el canje (HTTP ${response.status}).`);
            }
        } catch (error) {
            console.error('Error aprobando solicitud:', error);
            setErrorMessage(error.message || 'Error aprobando solicitud');
            alert(error.message || 'Error aprobando solicitud');
        } finally {
            setProcessing(null);
        }
    }

    async function handleDeliver(redemption) {
        const rawId = redemption?.id ?? redemption?.redemption_id ?? redemption?.ID ?? 0;
        const id = Number(rawId) || 0;
        
        if (!confirm(`¿Marcar este canje como entregado al cliente ${redemption.client_code}?`)) return;

        const procKey = id > 0 ? id : `${redemption.client_code}-${redemption.created_at}`;
        setProcessing(procKey);
        setErrorMessage('');
        try {
            const response = await fetch(`${API_URL}/televenta/deliver-redemption.php`, {
                method: 'POST',
                headers: await getShopAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ 
                    redemption_id: id,
                    client_code: redemption.client_code,
                    created_at: redemption.created_at
                })
            });

            const data = await response.json().catch(() => ({}));
            if (response.ok && data.success) {
                alert('Canje marcado como entregado.');
                loadRedemptions();
            } else {
                throw new Error(data.error || `No se pudo marcar como entregado (HTTP ${response.status}).`);
            }
        } catch (error) {
            console.error('Error entregando canje:', error);
            alert(error.message || 'Error al marcar como entregado');
        } finally {
            setProcessing(null);
        }
    }

    const mexicoRedemptionDay = value => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(date);
    };

    const mexicoRedemptionMonth = value => {
        const day = mexicoRedemptionDay(value);
        return day ? day.slice(0, 7) : '';
    };

    // Filter redemptions by Status, Month, Exact Date, and Client/Product Search
    const filteredRedemptions = useMemo(() => {
        return redemptions.filter((r) => {
            // Status filter
            const statusNorm = normalizeStatus(r.status);
            if (statusFilter !== 'all' && statusNorm !== statusFilter) return false;

            // Month filter
            const rMonth = mexicoRedemptionMonth(r.created_at);
            if (monthFilter && monthFilter !== 'all' && rMonth !== monthFilter) return false;

            // Exact Day filter
            const rDay = mexicoRedemptionDay(r.created_at);
            if (exactDateFilter && rDay !== exactDateFilter) return false;

            // Search by Client Code or Product Name / SKU
            if (searchTerm.trim()) {
                const query = searchTerm.trim().toLowerCase();
                const clientMatch = String(r.client_code || '').toLowerCase().includes(query);
                const productMatch = String(r.product_name || '').toLowerCase().includes(query) ||
                                     String(r.product_sku || '').toLowerCase().includes(query);
                if (!clientMatch && !productMatch) return false;
            }

            return true;
        });
    }, [redemptions, statusFilter, monthFilter, exactDateFilter, searchTerm]);

    // Scoped counts for the active month selection
    const scopedMonthRedemptions = useMemo(() => {
        return redemptions.filter(r => {
            const rMonth = mexicoRedemptionMonth(r.created_at);
            return !monthFilter || monthFilter === 'all' || rMonth === monthFilter;
        });
    }, [redemptions, monthFilter]);

    const pendingCount = scopedMonthRedemptions.filter(r => normalizeStatus(r.status) === 'pending').length;
    const approvedCount = scopedMonthRedemptions.filter(r => normalizeStatus(r.status) === 'approved').length;
    const deliveredCount = scopedMonthRedemptions.filter(r => normalizeStatus(r.status) === 'delivered').length;
    const totalMonthCount = scopedMonthRedemptions.length;
    const totalPointsMonth = scopedMonthRedemptions.reduce((acc, curr) => acc + (Number(curr.points_used) || 0), 0);

    const getStatusBadge = (status) => {
        const norm = normalizeStatus(status);
        const badges = {
            pending: { color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', text: 'Pendiente' },
            approved: { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', text: 'Aprobado' },
            delivered: { color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', text: 'Entregado' },
            cancelled: { color: 'bg-rose-500/15 text-rose-400 border-rose-500/30', text: 'Cancelado' },
        };

        const badge = badges[norm] || badges.pending;
        return <Badge className={`${badge.color} border font-medium px-2.5 py-0.5 text-xs`}>{badge.text}</Badge>;
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-muted-foreground text-sm">Cargando solicitudes de canje...</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 md:p-6 max-w-7xl space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Canjes de Puntos</h1>
                    <p className="text-muted-foreground text-sm mt-1">Gestión y aprobación de solicitudes de canje de puntos de clientes</p>
                </div>
                <Button onClick={loadRedemptions} variant="outline" className="flex items-center gap-2 self-start sm:self-auto border-border">
                    <RefreshCw className="w-4 h-4" />
                    Actualizar
                </Button>
            </div>

            {errorMessage && (
                <div className="p-4 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="font-semibold text-sm">Atención</p>
                        <p className="text-xs mt-0.5">{errorMessage}</p>
                    </div>
                </div>
            )}

            {/* KPI Cards for Redemptions */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
                <Card className="shadow-md border border-border border-l-4 border-l-amber-500 bg-card">
                    <CardContent className="p-4">
                        <p className="text-xs text-amber-500 dark:text-amber-400 font-bold uppercase tracking-wider">Pendientes</p>
                        <p className="text-2xl font-black text-amber-500 dark:text-amber-400 mt-1">{pendingCount}</p>
                    </CardContent>
                </Card>
                <Card className="shadow-md border border-border border-l-4 border-l-emerald-500 bg-card">
                    <CardContent className="p-4">
                        <p className="text-xs text-emerald-500 dark:text-emerald-400 font-bold uppercase tracking-wider">Aprobados</p>
                        <p className="text-2xl font-black text-emerald-500 dark:text-emerald-400 mt-1">{approvedCount}</p>
                    </CardContent>
                </Card>
                <Card className="shadow-md border border-border border-l-4 border-l-blue-500 bg-card">
                    <CardContent className="p-4">
                        <p className="text-xs text-blue-500 dark:text-blue-400 font-bold uppercase tracking-wider">Entregados</p>
                        <p className="text-2xl font-black text-blue-500 dark:text-blue-400 mt-1">{deliveredCount}</p>
                    </CardContent>
                </Card>
                <Card className="shadow-md border border-border border-l-4 border-l-primary bg-card">
                    <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Total Canjes</p>
                        <p className="text-2xl font-black mt-1 text-foreground">{totalMonthCount}</p>
                    </CardContent>
                </Card>
                <Card className="shadow-md border border-border border-l-4 border-l-purple-500 bg-card col-span-2 lg:col-span-1">
                    <CardContent className="p-4">
                        <p className="text-xs text-purple-400 font-bold uppercase tracking-wider">Puntos Canjeados</p>
                        <p className="text-xl md:text-2xl font-black text-purple-400 dark:text-purple-300 mt-1 truncate">
                            {totalPointsMonth.toLocaleString('es-MX')} pts
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Filter Card: Búsqueda por cliente + Filtros de Fecha y Mes */}
            <Card className="shadow-md border-border bg-card">
                <CardContent className="p-4 space-y-4">
                    {/* Row 1: Search by client code or product */}
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Buscar por código de cliente (ej: 999) o nombre de producto..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="h-10 w-full pl-9 pr-4 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Row 2: Month Filter + Quick Buttons + Status Tabs */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
                        {/* Month Selector */}
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1.5 bg-muted/40 px-3 py-1.5 rounded-md border border-border">
                                <Calendar className="w-4 h-4 text-primary" />
                                <span className="text-xs font-bold text-foreground">Mes:</span>
                                <input
                                    type="month"
                                    value={monthFilter === 'all' ? '' : monthFilter}
                                    onChange={e => {
                                        setMonthFilter(e.target.value || 'all');
                                        setExactDateFilter('');
                                    }}
                                    className="h-8 rounded border border-input bg-background px-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>

                            <Button
                                size="sm"
                                variant={monthFilter === getCurrentMonthMexico() ? 'default' : 'outline'}
                                onClick={() => { setMonthFilter(getCurrentMonthMexico()); setExactDateFilter(''); }}
                                className="h-8 text-xs font-medium"
                            >
                                Mes actual
                            </Button>

                            <Button
                                size="sm"
                                variant={monthFilter === getPreviousMonthMexico() ? 'default' : 'outline'}
                                onClick={() => { setMonthFilter(getPreviousMonthMexico()); setExactDateFilter(''); }}
                                className="h-8 text-xs font-medium"
                            >
                                Mes anterior
                            </Button>

                            <Button
                                size="sm"
                                variant={monthFilter === 'all' ? 'default' : 'outline'}
                                onClick={() => { setMonthFilter('all'); }}
                                className="h-8 text-xs font-medium"
                            >
                                Todos los meses
                            </Button>
                        </div>

                        {/* Status Tabs - PENDIENTES ES EL PREDETERMINADO */}
                        <div className="flex flex-wrap gap-1.5">
                            <Button
                                size="sm"
                                variant={statusFilter === 'pending' ? 'default' : 'outline'}
                                onClick={() => setStatusFilter('pending')}
                                className={`h-8 text-xs font-medium ${statusFilter === 'pending' ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'border-amber-500/40 text-amber-400'}`}
                            >
                                Pendientes ({pendingCount})
                            </Button>
                            <Button
                                size="sm"
                                variant={statusFilter === 'approved' ? 'default' : 'outline'}
                                onClick={() => setStatusFilter('approved')}
                                className="h-8 text-xs font-medium"
                            >
                                Aprobados ({approvedCount})
                            </Button>
                            <Button
                                size="sm"
                                variant={statusFilter === 'delivered' ? 'default' : 'outline'}
                                onClick={() => setStatusFilter('delivered')}
                                className="h-8 text-xs font-medium"
                            >
                                Entregados ({deliveredCount})
                            </Button>
                            <Button
                                size="sm"
                                variant={statusFilter === 'all' ? 'default' : 'outline'}
                                onClick={() => setStatusFilter('all')}
                                className="h-8 text-xs font-medium"
                            >
                                Todos ({totalMonthCount})
                            </Button>
                        </div>
                    </div>

                    {/* Row 3: Exact Day Filter + Reset */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-border">
                        <label className="space-y-1 text-xs">
                            <span className="font-semibold text-muted-foreground">Filtrar por día exacto:</span>
                            <input
                                type="date"
                                value={exactDateFilter}
                                onChange={event => setExactDateFilter(event.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground"
                            />
                        </label>

                        <div className="flex items-end">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => { 
                                    setMonthFilter(getCurrentMonthMexico());
                                    setExactDateFilter(''); 
                                    setSearchTerm(''); 
                                    setStatusFilter('pending'); 
                                }}
                                className="text-xs text-muted-foreground hover:text-foreground h-9"
                            >
                                Restablecer a Pendientes del Mes Actual
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Redemptions Grid Content */}
            {filteredRedemptions.length === 0 ? (
                <Card className="border-border bg-card">
                    <CardContent className="py-16 text-center">
                        <Gift className="w-16 h-16 mx-auto text-muted-foreground mb-4 opacity-40" />
                        <p className="text-lg font-semibold text-foreground">No hay solicitudes de canje para los filtros actuales</p>
                        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                            {statusFilter === 'pending' ? 'No hay canjes pendientes en el mes seleccionado.' : `No hay canjes con estado "${statusFilter}".`}
                        </p>
                        <div className="flex justify-center gap-2 mt-4">
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => { setMonthFilter('all'); setExactDateFilter(''); }}
                            >
                                Ver todos los meses
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => { setStatusFilter('all'); }}
                            >
                                Ver todos los estados
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground px-1">
                        <span>Mostrando {filteredRedemptions.length} {filteredRedemptions.length === 1 ? 'solicitud' : 'solicitudes'}</span>
                        {monthFilter !== 'all' && (
                            <span className="text-primary font-bold">Mes: {monthFilter}</span>
                        )}
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {filteredRedemptions.map((redemption, rIdx) => {
                            const rawId = redemption.id ?? redemption.redemption_id ?? redemption.ID ?? 0;
                            const id = Number(rawId) || 0;
                            const statusNorm = normalizeStatus(redemption.status);
                            const isPending = statusNorm === 'pending';
                            const isApproved = statusNorm === 'approved';
                            const isDelivered = statusNorm === 'delivered';
                            const procKey = id > 0 ? id : `${redemption.client_code}-${redemption.created_at}`;
                            const isThisProcessing = processing === procKey;

                            return (
                                <Card key={procKey || `${redemption.client_code}-${redemption.created_at}`} className="shadow-md border-border bg-card hover:border-primary/50 transition-colors">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <CardTitle className="text-base font-semibold leading-snug text-foreground">
                                                {redemption.product_name || redemption.product_sku}
                                            </CardTitle>
                                            {getStatusBadge(redemption.status)}
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            {/* Product Image */}
                                            {(redemption.product_image || redemption.product_sku) && (
                                                <div className="w-full h-36 bg-muted/30 rounded-lg overflow-hidden flex items-center justify-center border border-border">
                                                    <img
                                                        src={(() => {
                                                            const raw = String(redemption.product_image || '').trim();
                                                            if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
                                                                return raw;
                                                            }
                                                            if (raw) {
                                                                const clean = raw.replace(/^\/+/, '');
                                                                if (clean.startsWith('assets/products/')) {
                                                                    return `https://cervezasfinas.com/api/shop/${clean}`;
                                                                }
                                                                return `https://cervezasfinas.com/${clean}`;
                                                            }
                                                            return `https://cervezasfinas.com/portafolio/${encodeURIComponent(String(redemption.product_sku || '').trim())}.png`;
                                                        })()}
                                                        alt={redemption.product_name || 'Producto'}
                                                        loading="lazy"
                                                        decoding="async"
                                                        className="w-full h-full object-contain p-2"
                                                        onError={(e) => {
                                                            const img = e.currentTarget;
                                                            const sku = String(redemption.product_sku || '').trim();
                                                            if (!img.dataset.triedPortafolio && sku) {
                                                                img.dataset.triedPortafolio = '1';
                                                                img.src = `https://cervezasfinas.com/portafolio/${encodeURIComponent(sku)}.png`;
                                                                return;
                                                            }
                                                            if (!img.dataset.triedPhp && sku) {
                                                                img.dataset.triedPhp = '1';
                                                                img.src = `https://cervezasfinas.com/api/shop/products/image.php?sku=${encodeURIComponent(sku)}&_v=2`;
                                                                return;
                                                            }
                                                            img.onerror = null;
                                                            img.style.display = 'none';
                                                        }}
                                                    />
                                                </div>
                                            )}

                                            {/* Info Box */}
                                            <div className="space-y-2 text-xs bg-muted/20 p-3 rounded-lg border border-border">
                                                <div className="flex justify-between items-center py-1 border-b border-border">
                                                    <span className="text-muted-foreground flex items-center gap-1 font-semibold">
                                                        <User className="w-3.5 h-3.5 text-primary" /> Cliente:
                                                    </span>
                                                    <span className="font-extrabold text-foreground text-sm">{redemption.client_code}</span>
                                                </div>

                                                <div className="flex justify-between items-center py-1 border-b border-border">
                                                    <span className="text-muted-foreground font-semibold">Puntos Canjeados:</span>
                                                    <span className="font-extrabold text-sm text-blue-400">
                                                        {redemption.points_used} pts
                                                    </span>
                                                </div>

                                                <div className="flex justify-between items-center py-1 border-b border-border">
                                                    <span className="text-muted-foreground font-semibold">Fecha Solicitud:</span>
                                                    <span className="font-medium text-foreground">
                                                        {redemption.created_at ? new Date(redemption.created_at).toLocaleDateString('es-MX', {
                                                            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                                        }) : '—'}
                                                    </span>
                                                </div>

                                                {redemption.approved_at && (
                                                    <div className="flex justify-between items-center py-1">
                                                        <span className="text-muted-foreground font-semibold">Fecha Aprobación:</span>
                                                        <span className="font-medium text-emerald-400">
                                                            {new Date(redemption.approved_at).toLocaleDateString('es-MX', {
                                                                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                                            })}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="pt-1">
                                                {isPending && (
                                                    <Button
                                                        type="button"
                                                        onClick={() => handleApprove(redemption)}
                                                        disabled={isThisProcessing}
                                                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm transition-all"
                                                    >
                                                        {isThisProcessing ? (
                                                            <>
                                                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                                Aprobando...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <CheckCircle className="w-4 h-4 mr-2" />
                                                                Aprobar Canje
                                                            </>
                                                        )}
                                                    </Button>
                                                )}

                                                {isApproved && (
                                                    <Button
                                                        type="button"
                                                        onClick={() => handleDeliver(redemption)}
                                                        disabled={isThisProcessing}
                                                        variant="outline"
                                                        className="w-full border-blue-500/50 text-blue-400 hover:bg-blue-500/10 font-medium"
                                                    >
                                                        {isThisProcessing ? (
                                                            <>
                                                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                                Procesando...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Truck className="w-4 h-4 mr-2" />
                                                                Marcar como Entregado
                                                            </>
                                                        )}
                                                    </Button>
                                                )}

                                                {isDelivered && (
                                                    <div className="text-center py-2 text-xs font-semibold text-blue-400 bg-blue-500/10 rounded-md border border-blue-500/20">
                                                        ✓ Canje Entregado al Cliente
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
