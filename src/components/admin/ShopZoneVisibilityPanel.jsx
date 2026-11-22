import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api';
import { MapPin, ShieldCheck, Search, Check, X, Trash2, RefreshCw, Tag, Package, UserCheck } from 'lucide-react';

export default function ShopZoneVisibilityPanel() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [products, setProducts] = useState([]);
    const [brands, setBrands] = useState([]);
    const [zones, setZones] = useState([]);
    const [clients, setClients] = useState([]);
    const [exceptions, setExceptions] = useState([]);

    // Panel 1: Zonas por Marca o Producto
    const [zoneTargetMode, setZoneTargetMode] = useState('brand'); // 'brand' | 'sku'
    const [selectedBrandForZones, setSelectedBrandForZones] = useState('');
    const [selectedSkuForZones, setSelectedSkuForZones] = useState('');
    const [skuSearchZones, setSkuSearchZones] = useState('');
    const [pickedZones, setPickedZones] = useState([]);

    // Panel 2: Excepciones por Cliente
    const [clientSearch, setClientSearch] = useState('');
    const [remoteClients, setRemoteClients] = useState(null);
    const [searchingClients, setSearchingClients] = useState(false);
    const [selectedClientCode, setSelectedClientCode] = useState('');
    const [exScope, setExScope] = useState('sku'); // 'sku' | 'brand'
    const [exSku, setExSku] = useState('');
    const [exBrand, setExBrand] = useState('');
    const [exAllow, setExAllow] = useState(1); // 1 = permitir, 0 = bloquear
    const [exSkuSearch, setExSkuSearch] = useState('');

    const loadVisibilityData = async () => {
        setLoading(true);
        try {
            const res = await api.get('/admin/product-visibility.php');
            if (res.success && res.data) {
                setProducts(res.data.products || []);
                setBrands(res.data.brands || []);
                setZones(res.data.zones || []);
                setClients(res.data.clients || []);
                setExceptions(res.data.exceptions || []);
            }
        } catch (err) {
            console.error('Error loading visibility data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadVisibilityData();
    }, []);

    // Cuando selecciona un SKU individual, precargar sus zonas actuales
    useEffect(() => {
        if (zoneTargetMode === 'sku' && selectedSkuForZones) {
            const prod = products.find(p => p.sku === selectedSkuForZones);
            if (prod) {
                const raw = prod.allowed_zones
                    ? prod.allowed_zones.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
                    : [];
                setPickedZones(raw.includes('TODAS') || raw.includes('ALL') ? [] : raw);
            }
        }
    }, [zoneTargetMode, selectedSkuForZones, products]);

    const filteredZoneProducts = useMemo(() => {
        const q = skuSearchZones.trim().toLowerCase();
        if (!q) return products.slice(0, 100);
        return products.filter(p =>
            p.name?.toLowerCase().includes(q) ||
            p.sku?.toLowerCase().includes(q) ||
            p.brand?.toLowerCase().includes(q)
        ).slice(0, 100);
    }, [products, skuSearchZones]);

    const filteredExProducts = useMemo(() => {
        const q = exSkuSearch.trim().toLowerCase();
        if (!q) return products.slice(0, 100);
        return products.filter(p =>
            p.name?.toLowerCase().includes(q) ||
            p.sku?.toLowerCase().includes(q) ||
            p.brand?.toLowerCase().includes(q)
        ).slice(0, 100);
    }, [products, exSkuSearch]);

    useEffect(() => {
        const q = clientSearch.trim();
        if (!q) {
            setRemoteClients(null);
            setSearchingClients(false);
            return;
        }
        let cancelled = false;
        setSearchingClients(true);
        const timer = setTimeout(async () => {
            try {
                const res = await api.get(`/admin/product-visibility.php?action=search_clients&q=${encodeURIComponent(q)}`);
                if (!cancelled && res?.success && Array.isArray(res.clients)) {
                    setRemoteClients(res.clients);
                }
            } catch (err) {
                console.error('Error searching clients:', err);
            } finally {
                if (!cancelled) setSearchingClients(false);
            }
        }, 220);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [clientSearch]);

    const filteredClients = useMemo(() => {
        const q = clientSearch.trim().toLowerCase();
        if (!q) return clients.slice(0, 80);
        const source = Array.isArray(remoteClients)
            ? remoteClients
            : clients.filter(c =>
                String(c.client_code || '').toLowerCase().includes(q) ||
                String(c.business_name || '').toLowerCase().includes(q)
            );
        return source.slice(0, 80);
    }, [clients, remoteClients, clientSearch]);

    const toggleZone = (z) => {
        setPickedZones(prev =>
            prev.includes(z) ? prev.filter(item => item !== z) : [...prev, z]
        );
    };

    const handleApplyZones = async () => {
        if (zoneTargetMode === 'brand' && !selectedBrandForZones) {
            alert('Selecciona una marca primero.');
            return;
        }
        if (zoneTargetMode === 'sku' && !selectedSkuForZones) {
            alert('Selecciona un producto primero.');
            return;
        }
        setSaving(true);
        try {
            const payload = zoneTargetMode === 'brand'
                ? { action: 'apply_zones_by_brand', brand: selectedBrandForZones, zones: pickedZones }
                : { action: 'apply_zones_by_product', sku: selectedSkuForZones, zones: pickedZones };
            const res = await api.post('/admin/product-visibility.php', payload);
            if (res.success) {
                alert(`Zonas actualizadas correctamente (${res.updated_count || 1} producto(s)).`);
                await loadVisibilityData();
            } else {
                alert(res.error || 'Error guardando zonas');
            }
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleSaveException = async () => {
        if (!selectedClientCode) {
            alert('Selecciona un cliente.');
            return;
        }
        if (exScope === 'sku' && !exSku) {
            alert('Selecciona un producto.');
            return;
        }
        if (exScope === 'brand' && !exBrand) {
            alert('Selecciona una marca.');
            return;
        }
        setSaving(true);
        try {
            const res = await api.post('/admin/product-visibility.php', {
                action: 'save_client_exception',
                client_code: selectedClientCode,
                scope: exScope,
                sku: exSku,
                brand: exBrand,
                is_allowed: exAllow,
            });
            if (res.success) {
                alert(`Excepción guardada para ${res.affected_count || 1} producto(s).`);
                await loadVisibilityData();
            } else {
                alert(res.error || 'Error guardando excepción');
            }
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteException = async (id) => {
        try {
            const res = await api.post('/admin/product-visibility.php', {
                action: 'delete_client_exception',
                id
            });
            if (res.success) {
                setExceptions(prev => prev.filter(e => e.id !== id));
            }
        } catch (err) {
            alert('Error eliminando excepción: ' + err.message);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-emerald-400" />
                        Control de Venta por Zona, Marca y Excepciones por Cliente
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                        Define en qué zonas se puede vender cada marca o producto, y otorga permisos especiales a clientes puntuales aunque su zona esté restringida.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={loadVisibilityData}
                    disabled={loading}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-gray-700"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    Actualizar
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* BLOQUE 1: ZONAS POR MARCA O PRODUCTO */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2 border-b border-gray-800 pb-3">
                        <h3 className="font-bold text-white text-sm flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-emerald-400" />
                            1. Zonas Permitidas (por Marca o Producto)
                        </h3>
                        <div className="flex bg-gray-800 p-0.5 rounded-lg border border-gray-700">
                            <button
                                type="button"
                                onClick={() => setZoneTargetMode('brand')}
                                className={`px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1 ${
                                    zoneTargetMode === 'brand' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                <Tag className="w-3 h-3" /> Por Marca
                            </button>
                            <button
                                type="button"
                                onClick={() => setZoneTargetMode('sku')}
                                className={`px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1 ${
                                    zoneTargetMode === 'sku' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                <Package className="w-3 h-3" /> Por Producto
                            </button>
                        </div>
                    </div>

                    {zoneTargetMode === 'brand' ? (
                        <div>
                            <label className="block text-xs font-semibold text-gray-300 mb-1.5">Selecciona la Marca</label>
                            <select
                                value={selectedBrandForZones}
                                onChange={e => setSelectedBrandForZones(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg text-sm outline-none focus:border-emerald-500"
                            >
                                <option value="">-- Elegir marca --</option>
                                {brands.map(b => (
                                    <option key={b} value={b}>{b}</option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-gray-300">Busca y selecciona el Producto</label>
                            <div className="relative">
                                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Buscar SKU o nombre..."
                                    value={skuSearchZones}
                                    onChange={e => setSkuSearchZones(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-700 text-white pl-9 pr-3 py-2 rounded-lg text-xs outline-none focus:border-emerald-500"
                                />
                            </div>
                            <select
                                value={selectedSkuForZones}
                                onChange={e => setSelectedSkuForZones(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg text-xs outline-none focus:border-emerald-500"
                            >
                                <option value="">-- Elegir producto --</option>
                                {filteredZoneProducts.map(p => (
                                    <option key={p.sku} value={p.sku}>
                                        [{p.sku}] {p.name} ({p.allowed_zones ? p.allowed_zones : 'TODAS'})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-gray-300">Zonas donde SÍ se puede vender:</span>
                            <button
                                type="button"
                                onClick={() => setPickedZones([])}
                                className="text-[11px] text-emerald-400 hover:underline font-bold"
                            >
                                Marcar todas (Global)
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            <button
                                type="button"
                                onClick={() => setPickedZones([])}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                    pickedZones.length === 0
                                        ? 'bg-emerald-600 text-white border-emerald-500'
                                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'
                                }`}
                            >
                                TODAS LAS ZONAS
                            </button>
                            {zones.map(z => {
                                const active = pickedZones.includes(z);
                                return (
                                    <button
                                        key={z}
                                        type="button"
                                        onClick={() => toggleZone(z)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 ${
                                            active
                                                ? 'bg-blue-600 text-white border-blue-500'
                                                : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'
                                        }`}
                                    >
                                        {active && <Check className="w-3 h-3" />}
                                        {z}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleApplyZones}
                        disabled={saving}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all"
                    >
                        {saving ? 'Guardando...' : 'Aplicar Zonas'}
                    </button>
                </div>

                {/* BLOQUE 2: EXCEPCIONES POR CLIENTE */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                    <div className="border-b border-gray-800 pb-3">
                        <h3 className="font-bold text-white text-sm flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-amber-400" />
                            2. Excepción por Cliente (Permitir aunque su zona esté bloqueada)
                        </h3>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="block text-xs font-semibold text-gray-300">Busca y selecciona el Cliente</label>
                            {clientSearch.trim() && (
                                <span className="text-[11px] text-amber-400">
                                    {searchingClients ? 'Buscando...' : `${filteredClients.length} coincidencia(s)`}
                                </span>
                            )}
                        </div>
                        <div className="relative">
                            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Código de cliente o nombre del negocio..."
                                value={clientSearch}
                                onChange={e => setClientSearch(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 text-white pl-9 pr-3 py-2 rounded-lg text-xs outline-none focus:border-amber-500"
                            />
                        </div>
                        <select
                            value={selectedClientCode}
                            onChange={e => setSelectedClientCode(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg text-xs outline-none focus:border-amber-500"
                        >
                            <option value="">
                                {filteredClients.length === 0
                                    ? '-- Sin clientes coincidentes --'
                                    : `-- Elegir cliente (${filteredClients.length}) --`}
                            </option>
                            {filteredClients.map(c => (
                                <option key={c.client_code} value={c.client_code}>
                                    [{c.client_code}] {c.business_name} — Zona: {c.zona_comercial || 'N/A'}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setExScope('sku')}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold border ${
                                exScope === 'sku' ? 'bg-amber-600 text-white border-amber-500' : 'bg-gray-800 text-gray-400 border-gray-700'
                            }`}
                        >
                            Un Producto (SKU)
                        </button>
                        <button
                            type="button"
                            onClick={() => setExScope('brand')}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold border ${
                                exScope === 'brand' ? 'bg-amber-600 text-white border-amber-500' : 'bg-gray-800 text-gray-400 border-gray-700'
                            }`}
                        >
                            Toda una Marca
                        </button>
                    </div>

                    {exScope === 'sku' ? (
                        <div className="space-y-2">
                            <input
                                type="text"
                                placeholder="Filtrar producto por nombre o SKU..."
                                value={exSkuSearch}
                                onChange={e => setExSkuSearch(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-1.5 rounded-lg text-xs outline-none focus:border-amber-500"
                            />
                            <select
                                value={exSku}
                                onChange={e => setExSku(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg text-xs outline-none focus:border-amber-500"
                            >
                                <option value="">-- Elegir producto --</option>
                                {filteredExProducts.map(p => (
                                    <option key={p.sku} value={p.sku}>
                                        [{p.sku}] {p.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <select
                            value={exBrand}
                            onChange={e => setExBrand(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg text-xs outline-none focus:border-amber-500"
                        >
                            <option value="">-- Elegir marca --</option>
                            {brands.map(b => (
                                <option key={b} value={b}>{b}</option>
                            ))}
                        </select>
                    )}

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setExAllow(1)}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold border flex items-center justify-center gap-1 ${
                                exAllow === 1 ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500' : 'bg-gray-800 text-gray-400 border-gray-700'
                            }`}
                        >
                            <Check className="w-3.5 h-3.5" /> Permitir venta
                        </button>
                        <button
                            type="button"
                            onClick={() => setExAllow(0)}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold border flex items-center justify-center gap-1 ${
                                exAllow === 0 ? 'bg-red-600/20 text-red-300 border-red-500' : 'bg-gray-800 text-gray-400 border-gray-700'
                            }`}
                        >
                            <X className="w-3.5 h-3.5" /> Bloquear venta
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={handleSaveException}
                        disabled={saving}
                        className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all"
                    >
                        {saving ? 'Guardando...' : 'Guardar Excepción de Cliente'}
                    </button>
                </div>
            </div>

            {/* LISTADO DE EXCEPCIONES ACTIVAS */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <h3 className="font-bold text-white text-sm mb-3">
                    Excepciones Activas por Cliente ({exceptions.length})
                </h3>
                {exceptions.length === 0 ? (
                    <p className="text-xs text-gray-500 py-4 text-center">
                        Aún no hay excepciones registradas por cliente.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-gray-800 text-gray-400">
                                    <th className="py-2 px-2">Cliente</th>
                                    <th className="py-2 px-2">Zona del Cliente</th>
                                    <th className="py-2 px-2">Producto (SKU)</th>
                                    <th className="py-2 px-2">Regla</th>
                                    <th className="py-2 px-2 text-right">Quitar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800/70">
                                {exceptions.map(ex => (
                                    <tr key={ex.id} className="hover:bg-gray-800/40">
                                        <td className="py-2 px-2 font-semibold text-white">
                                            [{ex.client_code}] {ex.client_name || ''}
                                        </td>
                                        <td className="py-2 px-2 text-gray-300">{ex.client_zone || 'N/A'}</td>
                                        <td className="py-2 px-2 text-gray-300">
                                            <span className="font-mono text-emerald-400">{ex.sku}</span> {ex.product_name || ''}
                                        </td>
                                        <td className="py-2 px-2">
                                            {Number(ex.is_allowed) === 1 ? (
                                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                                                    ✅ Permitido
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-bold">
                                                    🚫 Bloqueado
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2 px-2 text-right">
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteException(ex.id)}
                                                className="text-red-400 hover:text-red-300 p-1"
                                                title="Eliminar excepción"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
