import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table-component";
import { Search, Calendar, Filter, Download, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const WarehouseHistoryPage = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('ALL');
    const [sourceFilter, setSourceFilter] = useState('ALL'); // 'ALL' | 'CAMION' | 'BODEGA'
    const [dateFilter, setDateFilter] = useState('');

    useEffect(() => {
        fetchHistory();
    }, [dateFilter]); // Refetch when date changes

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const dateParams = {};
            if (dateFilter) {
                const start = new Date(dateFilter);
                start.setHours(0, 0, 0, 0);
                const end = new Date(dateFilter);
                end.setHours(23, 59, 59, 999);
                dateParams.start = start.toISOString();
                dateParams.end = end.toISOString();
            }

            // --- FUENTE 1: truck_loads (movimientos del camión) ---
            let truckQuery = supabase.from('truck_loads').select('*').order('created_at', { ascending: false }).limit(200);
            if (dateParams.start) truckQuery = truckQuery.gte('created_at', dateParams.start).lte('created_at', dateParams.end);
            const { data: truckLogs, error: truckErr } = await truckQuery;
            if (truckErr) throw truckErr;

            // --- FUENTE 2: warehouse_transactions (kárdex de bodega) ---
            let wmsQuery = supabase.from('warehouse_transactions').select('*').order('created_at', { ascending: false }).limit(200);
            if (dateParams.start) wmsQuery = wmsQuery.gte('created_at', dateParams.start).lte('created_at', dateParams.end);
            const { data: wmsLogs, error: wmsErr } = await wmsQuery;
            // Don't throw if wmsLogs fails (table might be empty or not exist yet)
            if (wmsErr) console.warn('[History] warehouse_transactions error:', wmsErr.message);

            // --- Normalizar truck_loads ---
            const normalizedTruck = (truckLogs || []).map(l => ({
                id: l.id,
                source: 'CAMION',
                type: l.type,
                sku: l.cve_marca,
                quantity: l.quantity_change,
                driver_id: l.driver_id,
                responsible_id: l.loaded_by,
                branch_id: null,
                created_at: l.created_at,
            }));

            // --- Normalizar warehouse_transactions ---
            const normalizedWms = (wmsLogs || []).map(l => ({
                id: l.id,
                source: 'BODEGA',
                type: l.type,
                sku: l.product_sku,
                quantity: l.quantity,
                driver_id: null,
                responsible_id: l.created_by,
                branch_id: l.branch_id,
                created_at: l.created_at,
            }));

            const allLogs = [...normalizedTruck, ...normalizedWms]
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            // --- Enriquecer con nombres ---
            const allSkus = [...new Set(allLogs.map(l => l.sku).filter(Boolean))];
            const allUserIds = [...new Set([
                ...allLogs.map(l => l.driver_id),
                ...allLogs.map(l => l.responsible_id),
            ].filter(Boolean))];

            const [usersRes, truckProductsRes, wmsProductsRes] = await Promise.all([
                allUserIds.length > 0 ? supabase.from('profiles').select('id, name, email').in('id', allUserIds) : { data: [] },
                allSkus.length > 0 ? supabase.from('precios').select('cve_marca, des_marca').in('cve_marca', allSkus) : { data: [] },
                allSkus.length > 0 ? supabase.from('products').select('sku, name').in('sku', allSkus) : { data: [] },
            ]);

            const userMap = {};
            (usersRes.data || []).forEach(u => userMap[u.id] = u);
            const productMap = {};
            (truckProductsRes.data || []).forEach(p => productMap[p.cve_marca] = p.des_marca);
            (wmsProductsRes.data || []).forEach(p => { if (!productMap[p.sku]) productMap[p.sku] = p.name; });

            const enriched = allLogs.map(l => ({
                ...l,
                skuName: productMap[l.sku] || l.sku || 'Desconocido',
                driverName: l.driver_id ? (userMap[l.driver_id]?.name || 'Desconocido') : null,
                responsibleEmail: l.responsible_id ? (userMap[l.responsible_id]?.email || 'Sistema') : 'Sistema',
            }));

            setLogs(enriched);
            setErrorMsg(null);
        } catch (error) {
            console.error('Error fetching history:', error);
            setErrorMsg('Error al cargar historial: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const TYPE_CONFIG = {
        LOAD:                  { label: 'CARGA CAMIÓN',      color: 'bg-green-900/30 text-green-400 border-green-900' },
        UNLOAD:                { label: 'DESCARGA',          color: 'bg-yellow-900/30 text-yellow-400 border-yellow-900' },
        ADJUSTMENT:            { label: 'AJUSTE AUDIT.',    color: 'bg-red-900/30 text-red-400 border-red-900' },
        EGRESO_CARGA_CAMION:   { label: 'EGRESO BODEGA',    color: 'bg-orange-900/30 text-orange-400 border-orange-900' },
        RETORNO_LIQUIDACION:   { label: 'RETORNO RUTA',     color: 'bg-teal-900/30 text-teal-400 border-teal-900' },
        INGRESO_FABRICA:       { label: 'INGRESO FÁBRICA',   color: 'bg-blue-900/30 text-blue-400 border-blue-900' },
        INGRESO_PROVEEDOR:     { label: 'INGRESO PROV.',    color: 'bg-blue-900/30 text-blue-400 border-blue-900' },
        TRASPASO_ENTRADA:      { label: 'TRASPASO ENTR.',   color: 'bg-purple-900/30 text-purple-400 border-purple-900' },
        TRASPASO_SALIDA:       { label: 'TRASPASO SAL.',    color: 'bg-pink-900/30 text-pink-400 border-pink-900' },
        MERMA:                 { label: 'MERMA',             color: 'bg-red-900/30 text-red-400 border-red-900' },
        AJUSTE_POSITIVO:       { label: 'AJUSTE (+)',       color: 'bg-emerald-900/30 text-emerald-400 border-emerald-900' },
        AJUSTE_NEGATIVO:       { label: 'AJUSTE (-)',       color: 'bg-red-900/30 text-red-400 border-red-900' },
    };

    const filteredLogs = logs.filter(log => {
        const matchesSearch =
            (log.driverName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (log.skuName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (log.sku || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = typeFilter === 'ALL' || log.type === typeFilter;
        const matchesSource = sourceFilter === 'ALL' || log.source === sourceFilter;
        return matchesSearch && matchesType && matchesSource;
    });

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans selection:bg-green-500/30">
            {/* Background Gradients */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[100px]" />
            </div>

            <header className="relative z-10 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-500">
                        Historial de Movimientos
                    </h1>
                    <p className="text-slate-400 mt-1">Registro de cargas, descargas y auditorías.</p>
                </div>

                <div className="flex items-center gap-4 bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <Calendar className="text-slate-400" size={20} />
                    <input
                        type="date"
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        className="bg-transparent border-none text-slate-200 text-sm focus:ring-0"
                    />
                </div>
            </header>

            {errorMsg && (
                <div className="mb-6 bg-red-900/20 border border-red-900 p-4 rounded-lg flex items-start gap-4">
                    <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                    <div>
                        <h4 className="font-bold text-red-500 mb-1">Atención requerida</h4>
                        <p className="text-red-400 text-sm">{errorMsg}</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 relative z-10">
                {/* Filters */}
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg text-slate-200 flex items-center gap-2">
                            <Filter size={18} /> Filtros
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-2.5 text-slate-500 h-4 w-4" />
                            <Input
                                placeholder="Buscar por chofer, producto o SKU..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="pl-9 bg-slate-950 border-slate-700 text-slate-100"
                            />
                        </div>
                        <div className="w-full md:w-44">
                            <Select value={sourceFilter} onValueChange={setSourceFilter}>
                                <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100">
                                    <SelectValue placeholder="Fuente" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                                    <SelectItem value="ALL">Todas las Fuentes</SelectItem>
                                    <SelectItem value="CAMION">🚛 Camión</SelectItem>
                                    <SelectItem value="BODEGA">🏭 Bodega (WMS)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-full md:w-52">
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100">
                                    <SelectValue placeholder="Tipo de Movimiento" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                                    <SelectItem value="ALL">Todos los Tipos</SelectItem>
                                    <SelectItem value="LOAD">Carga Camión</SelectItem>
                                    <SelectItem value="EGRESO_CARGA_CAMION">Egreso Bodega→Camión</SelectItem>
                                    <SelectItem value="RETORNO_LIQUIDACION">Retorno de Ruta</SelectItem>
                                    <SelectItem value="INGRESO_FABRICA">Ingreso Fábrica</SelectItem>
                                    <SelectItem value="INGRESO_PROVEEDOR">Ingreso Proveedor</SelectItem>
                                    <SelectItem value="TRASPASO_ENTRADA">Traspaso Entrada</SelectItem>
                                    <SelectItem value="TRASPASO_SALIDA">Traspaso Salida</SelectItem>
                                    <SelectItem value="ADJUSTMENT">Ajuste Auditoría</SelectItem>
                                    <SelectItem value="MERMA">Merma</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {/* Table */}
                <Card className="bg-slate-900 border-slate-800 overflow-hidden">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-slate-950">
                                <TableRow className="border-slate-800 hover:bg-slate-950">
                                    <TableHead className="text-slate-400">Hora</TableHead>
                                    <TableHead className="text-slate-400">Tipo</TableHead>
                                    <TableHead className="text-slate-400">Chofer / Ruta</TableHead>
                                    <TableHead className="text-slate-400">Producto</TableHead>
                                    <TableHead className="text-center text-slate-400">Cantidad</TableHead>
                                    <TableHead className="text-right text-slate-400">Responsable</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-slate-500">Cargando historial...</TableCell>
                                    </TableRow>
                                ) : filteredLogs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-slate-500">No hay movimientos registrados.</TableCell>
                                    </TableRow>
                                ) : (
                                    filteredLogs.map((log, idx) => {
                                        const cfg = TYPE_CONFIG[log.type] || { label: log.type, color: 'bg-slate-800 text-slate-400 border-slate-700' };
                                        return (
                                        <TableRow key={`${log.source}-${log.id}-${idx}`} className="border-slate-800 hover:bg-slate-800/50 transition-colors">
                                            <TableCell className="font-mono text-xs text-slate-400">
                                                {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${cfg.color}`}>{cfg.label}</span>
                                                    <span className={`text-xs ${log.source === 'BODEGA' ? 'text-purple-400' : 'text-blue-400'}`}>{log.source === 'BODEGA' ? '🏭 Bodega' : '🚛 Camión'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-slate-200">
                                                <div className="font-medium">{log.driverName || <span className="text-slate-500 italic">N/A</span>}</div>
                                            </TableCell>
                                            <TableCell className="text-slate-300">
                                                <div>{log.skuName}</div>
                                                <div className="text-xs text-slate-500 font-mono">{log.sku}</div>
                                            </TableCell>
                                            <TableCell className={`text-center font-bold text-lg ${(log.quantity || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                {(log.quantity || 0) > 0 ? `+${log.quantity}` : log.quantity}
                                            </TableCell>
                                            <TableCell className="text-right text-slate-500 text-xs">
                                                {log.responsibleEmail}
                                            </TableCell>
                                        </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default WarehouseHistoryPage;
