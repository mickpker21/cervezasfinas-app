import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/supabaseClient';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { registerLoad, getTruckInventory, getPendingStockRequests, updateStockRequestStatus } from '@/repositories/inventoryRepository';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Search, Package, Check, Truck, X, ShoppingCart, Plus, Minus, Image as ImageIcon, FileText, RefreshCw, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const TruckLoadPage = () => {
    const { user } = useSupabaseAuth();
    const { toast } = useToast();

    // Data State
    const [drivers, setDrivers] = useState([]);
    const [selectedDriver, setSelectedDriver] = useState(null);
    const [products, setProducts] = useState([]);
    const [skuImages, setSkuImages] = useState({});
    const [skuNames, setSkuNames] = useState({}); // sku -> name
    const [currentStock, setCurrentStock] = useState({});
    const [pendingRequests, setPendingRequests] = useState([]);
    const [warehouseStock, setWarehouseStock] = useState({}); // Bodega local del almacenista
    const [branchId, setBranchId] = useState(null);

    // UI State
    const [searchTerm, setSearchTerm] = useState('');
    const [driverSearch, setDriverSearch] = useState('');
    const [isDriverOpen, setIsDriverOpen] = useState(false);
    const [manualQuantities, setManualQuantities] = useState({}); // sku -> qty string
    const [activeTab, setActiveTab] = useState("manual"); // 'manual' | 'requests'

    // Load Cart State
    const [loadItems, setLoadItems] = useState([]); // { sku, des_marca, qty, image }
    const [activeRequest, setActiveRequest] = useState(null); // If loading from a specific request

    useEffect(() => {
        const fetchInitialData = async () => {
            // 0. Get almacenista's branch_id from profile
            let currentBranchId = user?.profile?.branch_id || null;
            if (!currentBranchId && user?.id) {
                const { data: profile } = await supabase.from('profiles').select('branch_id').eq('id', user.id).single();
                currentBranchId = profile?.branch_id || null;
            }
            setBranchId(currentBranchId);

            // 1. Drivers (Filtered by Branch)
            const { data: profiles } = await supabase.from('profiles').select('id, name, role, email, branch_id');
            if (profiles) {
                let filtered = profiles.filter(p => p.role === 'autoventa' || p.role === 'chofer' || p.email === 'chofer@demo.com');
                if (currentBranchId) {
                    filtered = filtered.filter(p => p.branch_id === currentBranchId);
                }
                setDrivers(filtered);
            }

            // 2. Products
            const { data: prices } = await supabase.from('precios').select('cve_marca, des_marca');
            if (prices) {
                setProducts(prices);
                const names = {};
                prices.forEach(p => names[p.cve_marca] = p.des_marca);
                setSkuNames(names);
            }

            // 3. Images (Static Generation)
            if (prices) {
                const imgMap = {};
                prices.forEach(p => {
                    const safeSku = (p.cve_marca || '').trim();
                    if (safeSku) {
                        imgMap[safeSku] = `https://cervezasfinas.com/portafolio/${safeSku}.png`;
                    }
                });
                setSkuImages(imgMap);
            }

            // 4. Load Warehouse Inventory for this branch (para validar stock)
            if (currentBranchId) {
                const { data: invData } = await supabase.from('warehouse_inventory').select('product_sku, quantity').eq('branch_id', currentBranchId);
                const invMap = {};
                (invData || []).forEach(i => { invMap[i.product_sku] = i.quantity; });
                setWarehouseStock(invMap);
            }
        };
        fetchInitialData();
    }, [user]);

    useEffect(() => {
        if (!selectedDriver) {
            setCurrentStock({});
            setPendingRequests([]);
            return;
        }
        const fetchStock = async () => {
            const stock = await getTruckInventory(selectedDriver.id);
            setCurrentStock(stock);

            // Fetch requests for this driver
            const reqs = await getPendingStockRequests(selectedDriver.id);
            setPendingRequests(reqs || []);
        };
        fetchStock();
    }, [selectedDriver]);

    // NEW PHASE 2 STATE: Route Selection & Compilation
    const [availableRoutes, setAvailableRoutes] = useState([]);
    const [selectedRoute, setSelectedRoute] = useState('');
    const [isCompiling, setIsCompiling] = useState(false);
    const [compiledPreventaIds, setCompiledPreventaIds] = useState([]);

    useEffect(() => {
        const fetchRoutes = async () => {
            const { getClients } = await import('@/repositories/clientsRepository');
            try {
                const clients = await getClients();
                if (clients && clients.length > 0) {
                    let filteredData = clients.filter(c => !!c.delivery_route);
                    // Enforce branch isolation for routes
                    if (user?.profile?.branch_id) {
                        filteredData = filteredData.filter(c => c.branch_id === user.profile.branch_id);
                    }
                    const unique = [...new Set(filteredData.map(c => c.delivery_route))].sort();
                    setAvailableRoutes(unique);
                }
            } catch (e) {
                console.error('[TruckLoadPage] Error fetching routes:', e);
            }
        };
        fetchRoutes();
    }, [user?.profile?.branch_id]);

    const handleCompileRoute = async () => {
        if (!selectedRoute) {
            toast({ title: 'Ruta no seleccionada', description: 'Por favor, selecciona una ruta de reparto para compilar.', variant: 'destructive' });
            return;
        }
        setIsCompiling(true);
        try {
            // 1. Get clients in this delivery_route
            const { getClients } = await import('@/repositories/clientsRepository');
            const clientsData = await getClients();
            const routeClients = clientsData.filter(c => c.delivery_route === selectedRoute);
            const clientIds = routeClients.map(c => c.id || c.client_id).filter(Boolean);
            
            if (clientIds.length === 0) {
                toast({ title: 'Ruta Vacía', description: 'No hay clientes asignados a esta ruta de reparto.' });
                return;
            }

            // 2. Fetch Pending Preventas (not delivered or rejected) for these clients
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 3);
            const { data: preventas } = await supabase
                .from('preventa')
                .select('id, status')
                .in('client_id', clientIds)
                .gte('created_at', yesterday.toISOString())
                .or('status.eq.pendiente,status.is.null,status.eq.cargado');
            
            const preventaIds = (preventas || []).map(p => p.id);
            
            if (preventaIds.length === 0) {
                toast({ title: 'Sin pedidos pendientes', description: 'No se encontraron pedidos pendientes para esta ruta.' });
                return;
            }

            // 3. Fetch Items and Sum
            const { data: items } = await supabase.from('preventa_items').select('cve_marca, quantity').in('preventa_id', preventaIds);
            
            const aggregated = {};
            (items || []).forEach(item => {
                const qty = Number(item.quantity) || 0;
                aggregated[item.cve_marca] = (aggregated[item.cve_marca] || 0) + qty;
            });

            // 4. Transform to loadItems
            const compiledLoad = Object.keys(aggregated).map(sku => ({
                sku,
                des_marca: skuNames[sku] || sku,
                qty: aggregated[sku],
                image: skuImages[sku]
            }));

            setCompiledPreventaIds(preventaIds);
            setLoadItems(compiledLoad);
            setActiveTab('manual');
            toast({
                title: '🚚 Carga Compilada',
                description: `Se agruparon ${compiledLoad.length} SKUs de ${preventaIds.length} pedidos pendientes de la ruta ${selectedRoute}.`,
                className: 'bg-emerald-600 text-white border-none'
            });
        } catch (error) {
            console.error(error);
            toast({ title: 'Error', description: 'Fallo al compilar la carga de la ruta.', variant: 'destructive' });
        } finally {
            setIsCompiling(false);
        }
    };

    // Derived Logic
    const filteredProducts = useMemo(() => {
        if (!searchTerm) {
            // If no search, show only items with images first or just first 20
            // Sort by having image first for better "wow" factor
            return [...products].sort((a, b) => {
                const hasImgA = skuImages[a.cve_marca] ? 1 : 0;
                const hasImgB = skuImages[b.cve_marca] ? 1 : 0;
                return hasImgB - hasImgA;
            }).slice(0, 24);
        }
        const lower = searchTerm.toLowerCase();
        return products.filter(p =>
            p.des_marca.toLowerCase().includes(lower) ||
            p.cve_marca.toLowerCase().includes(lower)
        ).slice(0, 50);
    }, [products, searchTerm, skuImages]);

    const filteredDrivers = useMemo(() => {
        const lower = driverSearch.toLowerCase();
        return drivers.filter(d =>
            (d.name || '').toLowerCase().includes(lower) ||
            (d.email || '').toLowerCase().includes(lower)
        );
    }, [drivers, driverSearch]);

    // Handlers
    const handleAdd = (product, qty) => {
        if (qty <= 0) return;
        setLoadItems(prev => {
            const existing = prev.find(p => p.sku === product.cve_marca);
            if (existing) {
                return prev.map(p => p.sku === product.cve_marca ? { ...p, qty: p.qty + qty } : p);
            }
            return [...prev, {
                sku: product.cve_marca,
                des_marca: product.des_marca,
                qty,
                image: skuImages[product.cve_marca]
            }];
        });

        // Reset manual input for this product
        setManualQuantities(prev => ({ ...prev, [product.cve_marca]: '' }));

        toast({
            title: "Producto agregado",
            description: `${qty} x ${product.des_marca}`,
            className: "bg-green-600 text-white border-none"
        });
    };

    const handleRemove = (sku) => {
        setLoadItems(prev => prev.filter(p => p.sku !== sku));
    };

    const handleUpdateQty = (sku, delta, isDirect = false) => {
        setLoadItems(prev => prev.map(item => {
            if (item.sku === sku) {
                const newQty = isDirect ? delta : item.qty + delta;
                return newQty > 0 ? { ...item, qty: newQty } : item;
            }
            return item;
        }));
    };

    const loadFromRequest = (req) => {

        // Parse items
        if (!req.items) return;
        const newItems = req.items.map(i => ({
            sku: i.sku,
            des_marca: skuNames[i.sku] || i.sku,
            qty: i.qty,
            image: skuImages[i.sku]
        }));
        setLoadItems(newItems);
        setActiveRequest(req);
        toast({ title: "Solicitud Cargada", description: "Verifique el inventario antes de confirmar." });
    };

    const handleConfirm = async () => {
        if (!selectedDriver) {
            toast({ title: "Falta Conductor", description: "Selecciona un vendedor para cargar.", variant: "destructive" });
            return;
        }
        if (loadItems.length === 0) return;

        // ✅ VALIDACIÓN: Es OBLIGATORIO tener un branchId para despachar
        if (!branchId) {
            toast({
                title: "Acción Denegada",
                description: "Tu usuario no tiene una bodega asignada para descontar el stock.",
                variant: "destructive"
            });
            return;
        }

        // ✅ VALIDACIÓN: Verificar que la bodega tiene suficiente stock de cada SKU
        if (branchId) {
            const stockErrors = [];
            for (const item of loadItems) {
                const available = warehouseStock[item.sku] || 0;
                if (item.qty > available) {
                    stockErrors.push(`${item.des_marca || item.sku}: necesitas ${item.qty} pero hay ${available} en bodega`);
                }
            }
            if (stockErrors.length > 0) {
                toast({
                    title: '❌ Stock Insuficiente en Bodega',
                    description: stockErrors.join(' | '),
                    variant: 'destructive'
                });
                return;
            }
        }

        try {
            // 1. Registrar carga en el inventario del camión
            await registerLoad(selectedDriver.id, loadItems, user.id, 'LOAD');

            // 2. ✅ DESCONTAR de la bodega del almacenista (warehouse_inventory)
            if (branchId) {
                for (const item of loadItems) {
                    const current = warehouseStock[item.sku] || 0;
                    const newQty = Math.max(0, current - item.qty);
                    await supabase.from('warehouse_inventory').upsert({
                        branch_id: branchId,
                        product_sku: item.sku,
                        quantity: newQty,
                        last_updated: new Date().toISOString()
                    }, { onConflict: 'branch_id,product_sku' });

                    // Registrar en kárdex
                    await supabase.from('warehouse_transactions').insert({
                        branch_id: branchId,
                        product_sku: item.sku,
                        type: 'EGRESO_CARGA_CAMION',
                        quantity: -item.qty,
                        reference_id: selectedDriver.id,
                        created_by: user.id
                    });
                }
                // Actualizar el estado local de la bodega
                const updatedWarehouse = { ...warehouseStock };
                loadItems.forEach(item => {
                    updatedWarehouse[item.sku] = Math.max(0, (updatedWarehouse[item.sku] || 0) - item.qty);
                });
                setWarehouseStock(updatedWarehouse);
            }

            // 3. Si viene de solicitud, marcarla como completada
            if (activeRequest) {
                await updateStockRequestStatus(activeRequest.id, 'COMPLETED', loadItems);
                setPendingRequests(prev => prev.filter(r => r.id !== activeRequest.id));
                setActiveRequest(null);
            }

            // 4. Si la carga viene de preventas compiladas, actualizar su estado a 'cargado'
            if (compiledPreventaIds.length > 0) {
                const { error: preventaErr } = await supabase
                    .from('preventa')
                    .update({
                        status: 'cargado',
                        chofer_id: selectedDriver.id,
                        delivery_route: selectedRoute || null
                    })
                    .in('id', compiledPreventaIds);
                
                if (preventaErr) {
                    console.warn('[TruckLoadPage] Error al actualizar estado de preventas:', preventaErr);
                } else {
                    console.log(`[TruckLoadPage] ${compiledPreventaIds.length} preventas actualizadas a estado "cargado"`);
                }
            }

            toast({
                title: "¡Carga Exitosa! 🚛",
                description: compiledPreventaIds.length > 0
                    ? `Camión cargado. ${compiledPreventaIds.length} pedidos de la ruta ${selectedRoute || ''} marcados como "cargado".`
                    : `Camión cargado. Bodega de almacenista actualizada.`,
                className: "bg-gradient-to-r from-green-600 to-green-800 text-white border-none"
            });
            setLoadItems([]);
            setCompiledPreventaIds([]);
            const stock = await getTruckInventory(selectedDriver.id);
            setCurrentStock(stock);
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "Hubo un problema al guardar la carga.", variant: "destructive" });
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans selection:bg-green-500/30 print:bg-white print:text-black">
            {/* Background Gradients - Hide on Print */}
            <div className="fixed inset-0 pointer-events-none print:hidden">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-green-500/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[100px]" />
            </div>

            <header className="relative z-10 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
                <div>
                    <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-emerald-600">
                        Carga de Camión
                    </h1>
                    <p className="text-slate-400 mt-1">Gestión de salida de mercancía a ruta.</p>
                </div>

                <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                    {/* Route Selector (NEW) */}
                    <div className="w-full md:w-64">
                        <select
                            className="w-full bg-slate-900 border border-slate-700 text-slate-300 rounded-md h-10 px-3 focus:ring-green-500 focus:border-green-500 outline-none"
                            value={selectedRoute}
                            onChange={(e) => setSelectedRoute(e.target.value)}
                        >
                            <option value="">-- Seleccionar Ruta --</option>
                            {availableRoutes.map(route => (
                                <option key={route} value={route}>{route}</option>
                            ))}
                        </select>
                        <Button 
                            className="w-full mt-2 bg-emerald-700 hover:bg-emerald-600 text-white" 
                            onClick={handleCompileRoute}
                            disabled={isCompiling || !selectedRoute}
                        >
                            {isCompiling ? 'Compilando...' : 'Compilar Preventa'}
                        </Button>
                    </div>

                    {/* Driver Selector - Modern Autocomplete */}
                    <div className="w-full md:w-80">
                        <Popover open={isDriverOpen} onOpenChange={setIsDriverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    className={`w-full justify-between bg-slate-900 border-slate-700 hover:bg-slate-800 hover:text-green-400 transition-all ${selectedDriver ? 'border-green-500/50 text-green-400' : 'text-slate-400'}`}
                                >
                                    {selectedDriver ? (
                                        <span className="flex items-center gap-2">
                                            <Truck size={16} />
                                            {selectedDriver.name || selectedDriver.email}
                                        </span>
                                    ) : (
                                        "Seleccionar Vendedor..."
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-0 bg-slate-900 border-slate-700">
                                <div className="p-2 border-b border-slate-800">
                                    <div className="relative">
                                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                                        <Input
                                            placeholder="Buscar chofer..."
                                            className="pl-8 bg-slate-950 border-slate-800 focus:ring-green-500/50"
                                            value={driverSearch}
                                            onChange={e => setDriverSearch(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="max-h-60 overflow-y-auto p-1">
                                    {filteredDrivers.length === 0 ? (
                                        <div className="p-2 text-sm text-slate-500 text-center">No se encontraron choferes.</div>
                                    ) : (
                                        filteredDrivers.map(driver => (
                                            <div
                                                key={driver.id}
                                                className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${selectedDriver?.id === driver.id ? 'bg-green-900/20 text-green-400' : 'hover:bg-slate-800 text-slate-300'}`}
                                                onClick={() => {
                                                    setSelectedDriver(driver);
                                                    setIsDriverOpen(false);
                                                    setDriverSearch('');
                                                }}
                                            >
                                                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                                                    {driver.name ? driver.name[0].toUpperCase() : '@'}
                                                </div>
                                                <div className="overflow-hidden">
                                                    <div className="font-medium truncate">{driver.name || 'Sin Nombre'}</div>
                                                    <div className="text-xs text-slate-500 truncate">{driver.email}</div>
                                                </div>
                                                {selectedDriver?.id === driver.id && <Check size={16} className="ml-auto" />}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                        {selectedDriver && (
                            <div className="text-right mt-2 text-xs text-slate-500">
                                Inventario actual: <span className="text-green-400 font-mono">{Object.values(currentStock).reduce((a, b) => a + b, 0)}</span> cajas
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="relative z-10 w-full mb-6 print:hidden">
                <TabsList className="bg-slate-900 border border-slate-800">
                    <TabsTrigger value="manual" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
                        <Package className="w-4 h-4 mr-2" />
                        Carga Manual
                    </TabsTrigger>
                    <TabsTrigger value="requests" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white relative">
                        <FileText className="w-4 h-4 mr-2" />
                        Solicitudes Pendientes
                        {pendingRequests.length > 0 && <span className="ml-2 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5">{pendingRequests.length}</span>}
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10 print:hidden">

                {/* Product Catalog / Request List */}
                <div className="lg:col-span-2 space-y-6">
                    {activeTab === 'manual' ? (
                        <>
                            {/* Search Bar */}
                            <div className="relative group">
                                <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-blue-500 rounded-lg blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                                <div className="relative relative flex items-center bg-slate-900 rounded-lg">
                                    <Search className="ml-4 text-slate-400 h-5 w-5" />
                                    <input
                                        type="text"
                                        placeholder="Buscar producto por nombre o SKU..."
                                        className="w-full bg-transparent border-none focus:ring-0 text-slate-100 p-4 placeholder:text-slate-500"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            </div>

                            {/* Products Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                <AnimatePresence>
                                    {filteredProducts.map(product => {
                                        const qtyInput = manualQuantities[product.cve_marca] || '';
                                        return (
                                            <motion.div
                                                key={product.cve_marca}
                                                layoutId={product.cve_marca}
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                className="group relative bg-slate-900/50 backdrop-blur border border-slate-800 rounded-xl overflow-hidden hover:border-slate-600 transition-all hover:shadow-xl hover:shadow-green-900/10"
                                            >
                                                <div className="aspect-video bg-slate-950/50 relative flex items-center justify-center p-4 overflow-hidden">
                                                    {skuImages[product.cve_marca] ? (
                                                        <img
                                                            src={skuImages[product.cve_marca]}
                                                            alt={product.des_marca}
                                                            className="h-full w-full object-contain drop-shadow-xl group-hover:scale-110 transition-transform duration-500"
                                                        />
                                                    ) : (
                                                        <Package size={48} className="text-slate-800" />
                                                    )}
                                                    <div className="absolute top-2 right-2 bg-slate-950/80 backdrop-blur px-2 py-1 rounded text-xs font-mono text-slate-400 border border-slate-800">
                                                        {product.cve_marca}
                                                    </div>
                                                    {branchId && (
                                                        <div className={`absolute top-2 left-2 backdrop-blur px-2 py-1 rounded text-[10px] font-bold border ${(warehouseStock[product.cve_marca] || 0) > 0 ? 'bg-blue-900/80 text-blue-300 border-blue-800' : 'bg-red-900/80 text-red-300 border-red-800'}`}>
                                                            BODEGA: {warehouseStock[product.cve_marca] || 0}
                                                        </div>
                                                    )}
                                                    {currentStock[product.cve_marca] > 0 && (
                                                        <div className="absolute bottom-2 left-2 bg-green-900/80 backdrop-blur px-2 py-1 rounded text-xs font-bold text-green-300 border border-green-800">
                                                            Stock: {currentStock[product.cve_marca]}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="p-4">
                                                    <h3 className="font-bold text-slate-200 line-clamp-2 h-10 mb-4 text-sm leading-tight group-hover:text-green-400 transition-colors">
                                                        {product.des_marca}
                                                    </h3>

                                                    <div className="flex flex-col gap-3">
                                                        {/* Manual Input Row */}
                                                        <div className="flex items-center gap-2">
                                                            <Input
                                                                type="number"
                                                                placeholder="Cant."
                                                                className="h-9 bg-slate-950 border-slate-700 text-center font-mono focus:border-green-500"
                                                                value={qtyInput}
                                                                onChange={e => setManualQuantities(prev => ({ ...prev, [product.cve_marca]: e.target.value }))}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'Enter') handleAdd(product, parseInt(qtyInput) || 0);
                                                                }}
                                                            />
                                                            <Button
                                                                size="sm"
                                                                className="h-9 w-9 p-0 bg-green-600 hover:bg-green-500"
                                                                onClick={() => handleAdd(product, parseInt(qtyInput) || 0)}
                                                                disabled={!qtyInput || parseInt(qtyInput) <= 0}
                                                            >
                                                                <Plus size={18} />
                                                            </Button>
                                                        </div>

                                                        {/* Quick Add Buttons */}
                                                        <div className="grid grid-cols-3 gap-2">
                                                            {[1, 10, 50].map(val => (
                                                                <Button
                                                                    key={val}
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="h-7 text-xs border-slate-700 hover:bg-slate-800 hover:text-green-400 hover:border-green-800 transition-colors"
                                                                    onClick={() => handleAdd(product, val)}
                                                                >
                                                                    +{val}
                                                                </Button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                            </div>
                        </>
                    ) : (
                        // Requests Tab
                        <div className="space-y-4">
                            {pendingRequests.length === 0 ? (
                                <div className="text-center py-20 bg-slate-900/50 rounded-xl border border-dashed border-slate-800">
                                    <FileText className="mx-auto text-slate-600 mb-4" size={48} />
                                    <h3 className="text-xl font-bold text-slate-300">No hay solicitudes pendientes</h3>
                                    <p className="text-slate-500">Selecciona otro chofer o usa carga manual.</p>
                                </div>
                            ) : (
                                pendingRequests.map(req => (
                                    <div key={req.id} className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex justify-between items-center hover:bg-slate-800 transition-colors group cursor-pointer" onClick={() => loadFromRequest(req)}>
                                        <div>
                                            <div className="text-slate-400 text-xs mb-1 font-mono">{new Date(req.created_at).toLocaleString()}</div>
                                            <div className="text-white font-bold text-lg flex items-center gap-2">
                                                Solicitud #{req.id.slice(0, 8)}
                                                {activeRequest?.id === req.id && <span className="bg-blue-600 text-xs px-2 py-0.5 rounded-full">Activa</span>}
                                            </div>
                                            <div className="text-slate-400 text-sm mt-1">{req.items?.length || 0} productos solicitados</div>
                                        </div>
                                        <Button variant="outline" className="border-blue-500 text-blue-400 hover:bg-blue-500 hover:text-white">
                                            Cargar esta solicitud
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* Loading Cart / Manifest */}
                <div className="lg:col-span-1">
                    <div className="sticky top-6">
                        <motion.div
                            layout
                            className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-4rem)]"
                        >
                            <div className="p-4 bg-slate-800/50 border-b border-slate-800 flex justify-between items-center bg-gradient-to-r from-slate-900 to-slate-800">
                                <h2 className="font-bold flex items-center gap-2 text-slate-100">
                                    <ShoppingCart className="text-green-500" size={20} />
                                    Manifiesto
                                </h2>
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="sm" onClick={handlePrint} className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-white/10" title="Imprimir Manifiesto">
                                        <Printer size={16} />
                                    </Button>
                                    <span className="bg-green-500 text-slate-900 text-xs font-bold px-2 py-1 rounded-full">{loadItems.length} items</span>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                {loadItems.length === 0 ? (
                                    <div className="text-center py-10 text-slate-500 border-2 border-dashed border-slate-800 rounded-lg">
                                        <Package className="mx-auto mb-2 opacity-20" size={40} />
                                        <p className="text-sm">Camión vacío</p>
                                        <p className="text-xs">Selecciona productos para cargar</p>
                                    </div>
                                ) : (
                                    <AnimatePresence initial={false}>
                                        {loadItems.map((item, idx) => (
                                            <motion.div
                                                key={item.sku}
                                                initial={{ opacity: 0, x: 20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -20 }}
                                                className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex gap-3 relative group"
                                            >
                                                <div className="w-12 h-12 bg-white rounded flex items-center justify-center shrink-0 overflow-hidden">
                                                    {item.image ? (
                                                        <img src={item.image} alt="" className="w-full h-full object-contain" />
                                                    ) : (
                                                        <Package size={20} className="text-slate-400" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-sm text-slate-200 truncate">{item.des_marca}</div>
                                                    <div className="text-xs text-slate-500 font-mono">{item.sku}</div>
                                                    <div className="text-green-400 font-bold mt-1 text-lg flex items-center gap-3">
                                                        <Input
                                                            type="number"
                                                            className="w-16 h-8 text-center bg-slate-900 border-slate-700 text-green-400 font-bold p-1"
                                                            value={item.qty}
                                                            onChange={(e) => handleUpdateQty(item.sku, parseInt(e.target.value) || 0, true)}
                                                        />
                                                        <span className="text-xs text-slate-600 font-normal">cajas</span>
                                                        <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-0.5 border border-slate-700">
                                                            <button
                                                                onClick={() => handleUpdateQty(item.sku, -1)}
                                                                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                                                            >
                                                                <Minus size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleUpdateQty(item.sku, 1)}
                                                                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                                                            >
                                                                <Plus size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleRemove(item.sku)}
                                                    className="absolute top-2 right-2 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                )}
                            </div>

                            <div className="p-4 bg-slate-800/50 border-t border-slate-800">
                                <div className="flex justify-between items-end mb-4">
                                    <span className="text-slate-400 text-sm">Total Cajas</span>
                                    <span className="text-3xl font-bold text-white tracking-tight">
                                        {loadItems.reduce((acc, i) => acc + i.qty, 0)}
                                    </span>
                                </div>
                                <Button
                                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold h-12 shadow-lg shadow-green-900/50 transition-all active:scale-[0.98]"
                                    onClick={handleConfirm}
                                    disabled={loadItems.length === 0 || !selectedDriver}
                                >
                                    CONFIRMAR CARGA A BORDO
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </div>
            {/* Print Only Template (Receipt Format) */}
            <div className="hidden print:block font-mono text-black p-2 max-w-[80mm] mx-auto text-xs leading-tight">
                <div className="text-center font-bold mb-1 text-base">CERVEZAS FINAS</div>
                <div className="text-center mb-2 uppercase">MANIFIESTO DE CARGA</div>

                <div className="space-y-0.5 mb-2 border-b border-black border-dashed pb-2">
                    <div className="flex justify-between"><span>Fecha:</span> <span>{new Date().toLocaleString('es-MX')}</span></div>
                    <div className="flex justify-between"><span>Resp:</span> <span>{user?.email?.split('@')[0]}</span></div>
                    <div className="flex justify-between"><span>Chofer:</span> <span>{selectedDriver?.name || '---'}</span></div>
                </div>

                <div className="space-y-1">
                    <div className="flex justify-between font-bold border-b border-black pb-1 mb-1">
                        <span>CANT</span>
                        <span>PRODUCTO</span>
                    </div>
                    {loadItems.map(i => (
                        <div key={i.sku} className="flex justify-between items-baseline mb-1">
                            <span className="font-bold w-8 text-right mr-2">{i.qty}</span>
                            <span className="flex-1 text-left">{i.des_marca}</span>
                        </div>
                    ))}
                    {loadItems.length === 0 && <div className="text-center italic mt-2">Manifiesto vacío.</div>}
                </div>

                <div className="mt-6 pt-4 border-t border-black border-dashed">
                    <div className="flex justify-between font-bold text-sm">
                        <span>TOTAL CAJAS:</span>
                        <span>{loadItems.reduce((sum, i) => sum + i.qty, 0)}</span>
                    </div>
                </div>

                <div className="mt-8 pt-8 border-t border-black border-dashed">
                    <div className="text-center mb-8">Firma Almacén</div>
                    <div className="h-8 border-b border-black mx-8"></div>
                </div>
                <div className="mt-8 pt-8 border-t border-black border-dashed">
                    <div className="text-center mb-8">Firma Chofer</div>
                    <div className="h-8 border-b border-black mx-8"></div>
                </div>
            </div>
        </div>
    );
};

export default TruckLoadPage;
