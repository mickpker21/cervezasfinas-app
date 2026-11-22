import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Gift, Calendar, Clock, RefreshCw, Users, CheckCircle2, AlertTriangle, Search } from 'lucide-react';

import { api } from '@/lib/api';

export default function AdminPointsConfig() {
    const [pointsConfig, setPointsConfig] = useState({
        points_per_peso: '1',
        min_purchase_for_points: '0',
        expiration_days: '180',
        fixed_expiration_date: '',
    });
    const [stats, setStats] = useState(null);
    const [savingConfig, setSavingConfig] = useState(false);

    // Modificar caducidad de puntos actuales
    const [bulkExp, setBulkExp] = useState({
        scope: 'all', // 'all' | 'client'
        client_code: '',
        mode: 'date', // 'date' | 'days_from_today' | 'days_from_created'
        new_expires_date: '',
        days: '180',
        include_expired: false,
    });
    const [applyingBulk, setApplyingBulk] = useState(false);

    // Lista de clientes con puntos y su caducidad
    const [clientExpirations, setClientExpirations] = useState([]);
    const [clientSearch, setClientSearch] = useState('');
    const [loadingClients, setLoadingClients] = useState(false);

    // Productos con puntos extra
    const [products, setProducts] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [message, setMessage] = useState({ type: '', text: '' });

    const examplePoints = 100 >= Number(pointsConfig.min_purchase_for_points)
        ? Math.floor((Number(pointsConfig.points_per_peso) || 0) * 100)
        : 0;

    useEffect(() => {
        loadPointsConfig();
        loadClientExpirations();
        loadProductsWithPoints();
    }, []);

    function showMessage(type, text) {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    }

    async function loadPointsConfig() {
        try {
            const res = await api.get('/points-config.php?action=get-config');
            if (res.success && res.data) {
                setPointsConfig({
                    points_per_peso: String(res.data.points_per_peso ?? 1),
                    min_purchase_for_points: String(res.data.min_purchase_for_points ?? 0),
                    expiration_days: String(res.data.expiration_days ?? 180),
                    fixed_expiration_date: res.data.fixed_expiration_date || '',
                });
                if (res.data.stats) {
                    setStats(res.data.stats);
                }
            } else if (res.error) {
                showMessage('error', `No se pudo cargar la regla de puntos: ${res.error}`);
            }
        } catch (error) {
            console.error('Error loading points config', error);
            showMessage('error', 'No se pudo cargar la regla de puntos.');
        }
    }

    async function savePointsConfig() {
        const pointsPerPeso = Number(pointsConfig.points_per_peso);
        const minPurchase = Number(pointsConfig.min_purchase_for_points);
        const expDays = parseInt(pointsConfig.expiration_days, 10) || 180;

        if (!Number.isFinite(pointsPerPeso) || pointsPerPeso < 0 || !Number.isFinite(minPurchase) || minPurchase < 0) {
            showMessage('error', 'Ingresa valores válidos para la regla de puntos.');
            return;
        }
        if (expDays < 1 || expDays > 3650) {
            showMessage('error', 'Los días de vigencia deben estar entre 1 y 3650 días.');
            return;
        }

        setSavingConfig(true);
        try {
            const res = await api.post('/points-config.php?action=update-config', {
                points_per_peso: pointsPerPeso,
                min_purchase_for_points: minPurchase,
                expiration_days: expDays,
                fixed_expiration_date: pointsConfig.fixed_expiration_date || null,
            });
            if (res.success) {
                showMessage('success', res.message || 'Regla y vigencia de puntos guardadas correctamente.');
                loadPointsConfig();
            } else {
                showMessage('error', res.error || 'No se pudo guardar la regla.');
            }
        } catch (error) {
            console.error('Error saving points config', error);
            showMessage('error', 'No se pudo guardar la regla de puntos.');
        } finally {
            setSavingConfig(false);
        }
    }

    async function loadClientExpirations(search = clientSearch) {
        setLoadingClients(true);
        try {
            const res = await api.get(`/points-config.php?action=list-client-expirations&search=${encodeURIComponent(search || '')}`);
            if (res.success && Array.isArray(res.data)) {
                setClientExpirations(res.data);
            }
        } catch (error) {
            console.error('Error loading client expirations', error);
        } finally {
            setLoadingClients(false);
        }
    }

    async function handleApplyExpiration() {
        if (bulkExp.scope === 'client' && !bulkExp.client_code.trim()) {
            showMessage('error', 'Ingresa el código del cliente al que deseas modificar la fecha de caducidad.');
            return;
        }
        if (bulkExp.mode === 'date' && !bulkExp.new_expires_date) {
            showMessage('error', 'Selecciona la nueva fecha de caducidad.');
            return;
        }

        const targetDesc = bulkExp.scope === 'client'
            ? `el cliente #${bulkExp.client_code.trim()}`
            : 'TODOS los clientes con puntos';
        const dateDesc = bulkExp.mode === 'date'
            ? `la fecha ${bulkExp.new_expires_date}`
            : `${bulkExp.days} días (${bulkExp.mode === 'days_from_created' ? 'desde que se ganaron' : 'desde hoy'})`;

        if (!window.confirm(`¿Confirmas actualizar la fecha de caducidad de los puntos de ${targetDesc} a ${dateDesc}?`)) {
            return;
        }

        setApplyingBulk(true);
        try {
            const res = await api.post('/points-config.php?action=apply-expiration-to-active', {
                scope: bulkExp.scope,
                client_code: bulkExp.client_code.trim(),
                mode: bulkExp.mode,
                new_expires_date: bulkExp.new_expires_date,
                days: parseInt(bulkExp.days, 10) || 180,
                include_expired: bulkExp.include_expired,
            });
            if (res.success) {
                showMessage('success', res.message || 'Fechas de caducidad actualizadas.');
                loadPointsConfig();
                loadClientExpirations(clientSearch);
            } else {
                showMessage('error', res.error || 'No se pudo actualizar la fecha de caducidad.');
            }
        } catch (error) {
            console.error('Error applying expiration', error);
            showMessage('error', 'Error al actualizar fechas de caducidad.');
        } finally {
            setApplyingBulk(false);
        }
    }

    async function loadProductsWithPoints(search = '') {
        try {
            const res = await api.get(`/points-config.php?action=list-products&search=${encodeURIComponent(search)}`);
            if (res.success) {
                setProducts(res.data || []);
            } else if (res.error) {
                showMessage('error', 'Error: ' + res.error);
            }
        } catch (error) {
            console.error('Error loading products', error);
            showMessage('error', 'Error al cargar productos');
        }
    }

    async function updateProductPoints(sku, points) {
        try {
            const res = await api.post(`/points-config.php?action=update-product-points`, { sku, points });
            if (res.success) {
                showMessage('success', `Puntos actualizados para ${sku}`);
                loadProductsWithPoints(searchTerm);
            } else {
                showMessage('error', 'Error actualizando puntos');
            }
        } catch (error) {
            showMessage('error', 'Error de conexión');
        }
    }

    const formatDateShort = (dateStr) => {
        if (!dateStr) return 'Sin vencimiento';
        const d = new Date(String(dateStr).replace(' ', 'T'));
        if (Number.isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    return (
        <div className="container mx-auto p-4 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold">Configuración y Caducidad de Puntos</h1>
                    <p className="text-sm text-muted-foreground">
                        Administra cuántos puntos se otorgan por compra, cuándo caducan los puntos nuevos y modifica la fecha de vencimiento de los puntos actuales.
                    </p>
                </div>
            </div>

            {/* Mensajes */}
            {message.text && (
                <div className={`p-4 rounded-xl border font-medium flex items-center gap-2 ${
                    message.type === 'success'
                        ? 'bg-emerald-950/60 border-emerald-600/50 text-emerald-200'
                        : 'bg-red-950/60 border-red-600/50 text-red-200'
                }`}>
                    {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />}
                    <span>{message.text}</span>
                </div>
            )}

            {/* 1. Regla de Puntos y Caducidad para Puntos Nuevos */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Gift className="w-5 h-5 text-emerald-500" />
                        1. Regla de Acumulación y Vigencia para Puntos Nuevos
                    </CardTitle>
                    <CardDescription>
                        Configura cuántos puntos gana el cliente en cada compra entregada y cuánto tiempo duran vigentes antes de expirar.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="space-y-2 text-sm font-medium">
                            <span>Puntos por cada $1 comprado</span>
                            <Input
                                type="number"
                                min="0"
                                step="0.1"
                                value={pointsConfig.points_per_peso}
                                onChange={(e) => setPointsConfig((c) => ({ ...c, points_per_peso: e.target.value }))}
                            />
                        </label>
                        <label className="space-y-2 text-sm font-medium">
                            <span>Compra mínima ($) para dar puntos</span>
                            <Input
                                type="number"
                                min="0"
                                step="1"
                                value={pointsConfig.min_purchase_for_points}
                                onChange={(e) => setPointsConfig((c) => ({ ...c, min_purchase_for_points: e.target.value }))}
                            />
                        </label>
                        <div className="space-y-2 text-sm font-medium">
                            <span>Vigencia de puntos nuevos (días)</span>
                            <Input
                                type="number"
                                min="1"
                                max="3650"
                                step="1"
                                value={pointsConfig.expiration_days}
                                onChange={(e) => setPointsConfig((c) => ({ ...c, expiration_days: e.target.value }))}
                            />
                            <div className="flex flex-wrap gap-1 pt-1">
                                {[
                                    { label: '30 días', val: '30' },
                                    { label: '90 días', val: '90' },
                                    { label: '6 meses (180d)', val: '180' },
                                    { label: '1 año (365d)', val: '365' },
                                ].map((preset) => (
                                    <button
                                        key={preset.val}
                                        type="button"
                                        onClick={() => setPointsConfig((c) => ({ ...c, expiration_days: preset.val, fixed_expiration_date: '' }))}
                                        className={`px-2 py-0.5 rounded text-xs font-semibold border transition-colors ${
                                            pointsConfig.expiration_days === preset.val && !pointsConfig.fixed_expiration_date
                                                ? 'bg-emerald-600 text-white border-emerald-500'
                                                : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
                                        }`}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2 text-sm font-medium">
                            <span>Fecha fija de corte (Opcional)</span>
                            <div className="flex gap-1.5">
                                <Input
                                    type="date"
                                    value={pointsConfig.fixed_expiration_date}
                                    onChange={(e) => setPointsConfig((c) => ({ ...c, fixed_expiration_date: e.target.value }))}
                                />
                                {pointsConfig.fixed_expiration_date && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPointsConfig((c) => ({ ...c, fixed_expiration_date: '' }))}
                                        title="Usar días de vigencia en vez de fecha fija"
                                    >
                                        Limpiar
                                    </Button>
                                )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                Si eliges una fecha fija (ej. fin de año), todos los puntos nuevos vencerán ese día. Si la dejas vacía, vencerán a los <strong>{pointsConfig.expiration_days || 180} días</strong>.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-gray-800">
                        <div className="text-xs sm:text-sm text-muted-foreground space-y-0.5">
                            <p>
                                • Ejemplo: una compra de $100 genera <strong>{examplePoints} puntos</strong> (equivalentes a ${(examplePoints * 0.2).toFixed(2)}).
                            </p>
                            <p>
                                • Caducidad activa para nuevos pedidos entregados:{' '}
                                <strong className="text-emerald-400">
                                    {pointsConfig.fixed_expiration_date
                                        ? `Fecha fija: ${pointsConfig.fixed_expiration_date}`
                                        : `${pointsConfig.expiration_days || 180} días después de la entrega`}
                                </strong>
                            </p>
                        </div>
                        <Button onClick={savePointsConfig} disabled={savingConfig} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                            {savingConfig ? 'Guardando...' : 'Guardar Regla y Vigencia'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* 2. Modificar Fecha de Caducidad de Puntos Ya Existentes */}
            <Card className="border-amber-500/30">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-amber-400" />
                        2. Modificar Fecha de Caducidad de Puntos Actuales
                    </CardTitle>
                    <CardDescription>
                        Cambia la fecha de vencimiento de los puntos que los clientes ya tienen acumulados actualmente (para todos los clientes o para un cliente en específico).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {stats && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-900/70 p-3.5 rounded-xl border border-gray-800 text-xs">
                            <div>
                                <span className="text-gray-400 block">Lotes de puntos vigentes</span>
                                <span className="text-lg font-black text-emerald-400">{stats.active_lots_count}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">Lotes expirados</span>
                                <span className="text-lg font-black text-amber-400">{stats.expired_lots_count}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">Próximo vencimiento</span>
                                <span className="text-sm font-bold text-white">{formatDateShort(stats.earliest_active_expiration)}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">Último vencimiento</span>
                                <span className="text-sm font-bold text-white">{formatDateShort(stats.latest_active_expiration)}</span>
                            </div>
                        </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {/* Alcance: Todos o un cliente */}
                        <div className="space-y-2 text-sm font-medium">
                            <span>¿A quién deseas cambiarle la caducidad?</span>
                            <select
                                value={bulkExp.scope}
                                onChange={(e) => setBulkExp((b) => ({ ...b, scope: e.target.value }))}
                                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                <option value="all">A TODOS los clientes con puntos</option>
                                <option value="client">A un cliente específico (por código)</option>
                            </select>
                            {bulkExp.scope === 'client' && (
                                <Input
                                    placeholder="Código de cliente (ej. 16201)"
                                    value={bulkExp.client_code}
                                    onChange={(e) => setBulkExp((b) => ({ ...b, client_code: e.target.value }))}
                                    className="mt-2"
                                />
                            )}
                        </div>

                        {/* Modo de cálculo */}
                        <div className="space-y-2 text-sm font-medium">
                            <span>¿Cómo definir la nueva fecha de caducidad?</span>
                            <select
                                value={bulkExp.mode}
                                onChange={(e) => setBulkExp((b) => ({ ...b, mode: e.target.value }))}
                                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                <option value="date">Elegir una fecha exacta en el calendario</option>
                                <option value="days_from_today">Extender +N días a partir de HOY</option>
                                <option value="days_from_created">Recalcular +N días desde que se ganaron</option>
                            </select>
                        </div>

                        {/* Valor de fecha o días */}
                        <div className="space-y-2 text-sm font-medium">
                            {bulkExp.mode === 'date' ? (
                                <>
                                    <span>Nueva fecha de caducidad</span>
                                    <Input
                                        type="date"
                                        value={bulkExp.new_expires_date}
                                        onChange={(e) => setBulkExp((b) => ({ ...b, new_expires_date: e.target.value }))}
                                    />
                                </>
                            ) : (
                                <>
                                    <span>Cantidad de días de vigencia</span>
                                    <Input
                                        type="number"
                                        min="1"
                                        max="3650"
                                        value={bulkExp.days}
                                        onChange={(e) => setBulkExp((b) => ({ ...b, days: e.target.value }))}
                                    />
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-gray-800">
                        <label className="flex items-center gap-2 text-xs sm:text-sm cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={bulkExp.include_expired}
                                onChange={(e) => setBulkExp((b) => ({ ...b, include_expired: e.target.checked }))}
                                className="rounded border-gray-600"
                            />
                            <span>Incluir también puntos que ya habían expirado (reactivarlos con esta nueva fecha)</span>
                        </label>

                        <Button
                            onClick={handleApplyExpiration}
                            disabled={applyingBulk}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
                        >
                            <Clock className="w-4 h-4 mr-2" />
                            {applyingBulk ? 'Actualizando caducidad...' : 'Aplicar Nueva Fecha de Caducidad'}
                        </Button>
                    </div>

                    {/* Tabla rápida de clientes con puntos y su vencimiento */}
                    <div className="pt-4 border-t border-gray-800 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <h3 className="text-sm font-bold flex items-center gap-2">
                                <Users className="w-4 h-4 text-emerald-400" />
                                Clientes con Puntos y Próxima Fecha de Caducidad
                            </h3>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Buscar cliente o código..."
                                    value={clientSearch}
                                    onChange={(e) => setClientSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && loadClientExpirations(clientSearch)}
                                    className="h-8 text-xs w-52"
                                />
                                <Button size="sm" variant="outline" onClick={() => loadClientExpirations(clientSearch)} disabled={loadingClients}>
                                    <Search className="w-3.5 h-3.5 mr-1" />
                                    Buscar
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => loadClientExpirations('')} disabled={loadingClients}>
                                    <RefreshCw className={`w-3.5 h-3.5 ${loadingClients ? 'animate-spin' : ''}`} />
                                </Button>
                            </div>
                        </div>

                        <div className="border border-gray-800 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-gray-900 text-gray-400 uppercase sticky top-0">
                                    <tr>
                                        <th className="p-2.5">Código</th>
                                        <th className="p-2.5">Cliente</th>
                                        <th className="p-2.5 text-right">Saldo Vigente</th>
                                        <th className="p-2.5 text-right">Por Vencer (30d)</th>
                                        <th className="p-2.5">Próxima Caducidad</th>
                                        <th className="p-2.5 text-right">Acción Rápida</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {clientExpirations.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="p-4 text-center text-gray-500">
                                                {loadingClients ? 'Cargando clientes...' : 'No se encontraron clientes con puntos registrados.'}
                                            </td>
                                        </tr>
                                    ) : (
                                        clientExpirations.map((cl) => (
                                            <tr key={cl.client_code} className="hover:bg-gray-900/50">
                                                <td className="p-2.5 font-mono font-bold text-emerald-400">#{cl.client_code}</td>
                                                <td className="p-2.5 font-medium">{cl.client_name}</td>
                                                <td className="p-2.5 text-right font-bold">{Number(cl.balance || 0).toLocaleString()} pts</td>
                                                <td className="p-2.5 text-right">
                                                    {cl.expiring_soon > 0 ? (
                                                        <span className="text-amber-400 font-bold">{Number(cl.expiring_soon).toLocaleString()} pts</span>
                                                    ) : (
                                                        <span className="text-gray-500">0</span>
                                                    )}
                                                </td>
                                                <td className="p-2.5">
                                                    {cl.next_expires_at ? (
                                                        <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-semibold">
                                                            {formatDateShort(cl.next_expires_at)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-500">—</span>
                                                    )}
                                                </td>
                                                <td className="p-2.5 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setBulkExp((b) => ({
                                                                ...b,
                                                                scope: 'client',
                                                                client_code: cl.client_code,
                                                                mode: 'date',
                                                                new_expires_date: cl.next_expires_at
                                                                    ? String(cl.next_expires_at).slice(0, 10)
                                                                    : new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
                                                            }));
                                                        }}
                                                        className="px-2.5 py-1 rounded bg-gray-800 hover:bg-amber-600 text-gray-200 hover:text-white font-semibold transition-colors"
                                                    >
                                                        Cambiar fecha
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* 3. Puntos por SKU */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Gift className="w-5 h-5" />
                        3. Puntos Extra por Producto (SKU)
                    </CardTitle>
                    <CardDescription>
                        Estos puntos se agregan a los puntos base calculados a partir del total de la compra.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder="Buscar producto por SKU o Nombre..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && loadProductsWithPoints(searchTerm)}
                        />
                        <Button onClick={() => loadProductsWithPoints(searchTerm)}>Buscar</Button>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 dark:bg-gray-800">
                                <tr>
                                    <th className="p-3">SKU</th>
                                    <th className="p-3">Nombre</th>
                                    <th className="p-3 text-right">Puntos a Otorgar</th>
                                    <th className="p-3">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map((product) => (
                                    <tr key={product.sku} className="border-t dark:border-gray-700">
                                        <td className="p-3 font-mono">{product.sku}</td>
                                        <td className="p-3">{product.name}</td>
                                        <td className="p-3 text-right">
                                            <Input
                                                type="number"
                                                className="w-24 ml-auto text-right"
                                                defaultValue={product.points_awarded}
                                                onBlur={(e) => updateProductPoints(product.sku, e.target.value)}
                                            />
                                        </td>
                                        <td className="p-3">
                                            <span className="text-xs text-gray-500">Guardado Automático</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
