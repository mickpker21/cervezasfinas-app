import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/supabaseClient';
import Layout from '@/components/Layout';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Search, Package, ShoppingCart, Plus, Minus, Send, Truck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createStockRequest, getTruckInventory, getStockRequestHistory } from '@/repositories/inventoryRepository';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, Clock, XCircle } from 'lucide-react';

const AutoventaStockRequestPage = () => {
    const { user } = useSupabaseAuth();
    const { toast } = useToast();
    const navigate = useNavigate();

    // Data State
    const [products, setProducts] = useState([]);
    const [skuImages, setSkuImages] = useState({});
    const [currentStock, setCurrentStock] = useState({});

    // UI State
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('ALL'); // 'ALL' | 'MULTIMARCA'
    const [manualQuantities, setManualQuantities] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Request Cart State
    const [requestItems, setRequestItems] = useState([]); // { sku, des_marca, qty, image }
    const [history, setHistory] = useState([]);
    const [activeTab, setActiveTab] = useState("request");

    useEffect(() => {
        const fetchInitialData = async () => {
            if (!user) return;
            // 2. Products (fetch with category from shop_products if available)
            const { data: prices } = await supabase.from('precios').select('cve_marca, des_marca');
            if (prices) setProducts(prices);

            // 3. Images (Static)
            if (prices) {
                const imgMap = {};
                prices.forEach(p => {
                    const safe = (p.cve_marca || '').trim();
                    if (safe) imgMap[safe] = `https://cervezasfinas.com/portafolio/${safe}.png`;
                });
                setSkuImages(imgMap);
            }

            // 4. Current Stock (Reference)
            const stock = await getTruckInventory(user.id);
            setCurrentStock(stock);

            // 5. History
            const hist = await getStockRequestHistory(user.id);
            setHistory(hist);
        };
        fetchInitialData();
    }, [user]);

    // Derived Logic
    const filteredProducts = useMemo(() => {
        let filtered = products;

        // Apply category filter
        if (categoryFilter === 'MULTIMARCA') {
            filtered = filtered.filter(p => (p.category || '').toUpperCase() === 'MULTIMARCA');
        }

        // Apply search filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filtered = filtered.filter(p =>
                p.des_marca.toLowerCase().includes(lower) ||
                p.cve_marca.toLowerCase().includes(lower)
            );
        }

        // Sort by image availability
        filtered = [...filtered].sort((a, b) => {
            const hasImgA = skuImages[a.cve_marca] ? 1 : 0;
            const hasImgB = skuImages[b.cve_marca] ? 1 : 0;
            return hasImgB - hasImgA;
        });

        return searchTerm ? filtered.slice(0, 50) : filtered.slice(0, 24);
    }, [products, searchTerm, categoryFilter, skuImages]);

    // Handlers
    const handleAdd = (product, qty) => {
        if (qty <= 0) return;
        setRequestItems(prev => {
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
        setManualQuantities(prev => ({ ...prev, [product.cve_marca]: '' }));
        toast({
            title: "Agregado a solicitud",
            description: `${qty} x ${product.des_marca}`,
            className: "bg-blue-600 text-white border-none"
        });
    };

    const handleRemove = (sku) => {
        setRequestItems(prev => prev.filter(p => p.sku !== sku));
    };

    const handleSubmit = async () => {
        if (requestItems.length === 0) return;
        setIsSubmitting(true);
        try {
            const itemsPayload = requestItems.map(i => ({ sku: i.sku, qty: i.qty }));
            await createStockRequest(user.id, itemsPayload);
            toast({
                title: "Solicitud Enviada",
                description: "El almacén ha recibido tu pedido de carga.",
                className: "bg-green-600 text-white"
            });
            setRequestItems([]);
            // Could navigate away or just clear
        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: "No se pudo enviar la solicitud.", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderCartContent = () => (
        <>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {requestItems.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">Agrega productos para solicitar carga.</div>
                ) : requestItems.map(item => (
                    <div key={item.sku} className="flex gap-3 items-center p-2 border-b border-gray-50 last:border-0 relative group bg-white rounded-lg shadow-sm">
                        <div className="w-10 h-10 bg-gray-50 rounded flex items-center justify-center p-1 border border-gray-100">
                            <img src={item.image || "/brands/default.png"} alt="" className="w-full h-full object-contain" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{item.des_marca}</div>
                            <div className="text-xs text-gray-500">{item.qty} cajas</div>
                        </div>
                        <button onClick={() => handleRemove(item.sku)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors">
                            <Minus size={16} />
                        </button>
                    </div>
                ))}
            </div>
            <div className="p-4 bg-white border-t border-gray-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <div className="flex justify-between items-center mb-4 font-bold text-gray-800">
                    <span>Total Cajas:</span>
                    <span className="text-xl text-blue-600 font-mono">{requestItems.reduce((a, b) => a + b.qty, 0)}</span>
                </div>
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 h-auto text-lg shadow-lg shadow-blue-200" onClick={handleSubmit} disabled={isSubmitting || requestItems.length === 0}>
                    {isSubmitting ? "Enviando..." : "Enviar Solicitud"}
                    <Send className="ml-2 w-5 h-5" />
                </Button>
            </div>
        </>
    );

    return (
        <div className="min-h-screen bg-[#F8F9FA] pb-24 font-sans">
            <Helmet><title>Solicitar Carga - Autoventa</title></Helmet>

            {/* Header */}
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-6 text-white shadow-lg sticky top-0 z-30">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Truck className="w-6 h-6" />
                            Previsión de Carga
                        </h1>
                        <p className="opacity-80 text-sm">Solicita inventario al almacén</p>
                    </div>

                    {/* Cart Trigger (Mobile) */}
                    <div className="md:hidden relative">
                        <Dialog>
                            <DialogTrigger asChild>
                                <button className="bg-white/20 p-2 rounded-full active:scale-95 transition-transform">
                                    <ShoppingCart size={24} />
                                    {requestItems.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{requestItems.length}</span>}
                                </button>
                            </DialogTrigger>
                            <DialogContent className="w-full max-w-md h-[80vh] flex flex-col p-0 gap-0">
                                <DialogHeader className="p-4 border-b border-gray-100">
                                    <DialogTitle>Tu Solicitud</DialogTitle>
                                </DialogHeader>
                                <div className="flex-1 overflow-y-auto bg-gray-50/50">
                                    {renderCartContent()}
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Category Filter */}
                <div className="flex gap-2 mb-3">
                    <button
                        onClick={() => setCategoryFilter('ALL')}
                        className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-all ${categoryFilter === 'ALL'
                            ? 'bg-white text-blue-700 shadow-md'
                            : 'bg-white/10 text-white/70 hover:bg-white/20'
                            }`}
                    >
                        Todos los Productos
                    </button>
                    <button
                        onClick={() => setCategoryFilter('MULTIMARCA')}
                        className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-all ${categoryFilter === 'MULTIMARCA'
                            ? 'bg-white text-blue-700 shadow-md'
                            : 'bg-white/10 text-white/70 hover:bg-white/20'
                            }`}
                    >
                        Solo MULTIMARCA
                    </button>
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-3 text-white/50" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar producto..."
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/50 focus:ring-2 focus:ring-white/50 outline-none"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>



            <div className="max-w-7xl mx-auto p-4">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-6 max-w-md mx-auto">
                        <TabsTrigger value="request">Solicitar Carga</TabsTrigger>
                        <TabsTrigger value="history">Historial</TabsTrigger>
                    </TabsList>

                    <TabsContent value="request" className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* Product Grid */}
                        <div className="lg:col-span-2 space-y-4">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {filteredProducts.map(product => {
                                    const qtyInput = manualQuantities[product.cve_marca] || '';

                                    // Calculate quantity already in cart
                                    const inCartItem = requestItems.find(i => i.sku === product.cve_marca);
                                    const inCartQty = inCartItem ? inCartItem.qty : 0;

                                    return (
                                        <div key={product.cve_marca} className={`bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col transition-all ${inCartQty > 0 ? 'border-blue-500 ring-1 ring-blue-500 shadow-md' : 'border-gray-100'}`}>
                                            <div className="aspect-square p-4 flex items-center justify-center bg-gray-50 relative group">
                                                {skuImages[product.cve_marca] ? (
                                                    <img src={skuImages[product.cve_marca]} alt="" className="w-full h-full object-contain" />
                                                ) : (
                                                    <Package size={32} className="text-gray-300" />
                                                )}
                                                <div className="absolute top-2 right-2 px-2 py-0.5 bg-gray-200/80 backdrop-blur-sm rounded text-[10px] font-mono text-gray-600">{product.cve_marca}</div>

                                                {/* In Cart Indicator */}
                                                {inCartQty > 0 && (
                                                    <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1">
                                                        <ShoppingCart size={12} />
                                                        {inCartQty}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="p-3 flex-1 flex flex-col">
                                                <div className="text-sm font-bold text-gray-800 line-clamp-2 leading-tight mb-2 min-h-[2.5rem]">
                                                    {product.des_marca}
                                                </div>

                                                <div className="mt-auto pt-2 space-y-2">
                                                    {/* Primary Input Control */}
                                                    <div className="flex gap-2">
                                                        <Input
                                                            type="number"
                                                            inputMode="numeric"
                                                            className="h-10 text-center font-mono text-lg bg-gray-50 border-gray-200 focus:bg-white transition-colors"
                                                            placeholder="0"
                                                            value={qtyInput}
                                                            onChange={e => setManualQuantities(prev => ({ ...prev, [product.cve_marca]: e.target.value }))}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    handleAdd(product, parseInt(qtyInput) || 0);
                                                                }
                                                            }}
                                                        />
                                                        <Button
                                                            className="h-10 w-12 bg-blue-600 hover:bg-blue-700 shadow-sm shrink-0"
                                                            onClick={() => handleAdd(product, parseInt(qtyInput) || 0)}
                                                            disabled={!qtyInput || parseInt(qtyInput) <= 0}
                                                        >
                                                            <Plus size={20} />
                                                        </Button>
                                                    </div>

                                                    {/* Quick Add Pills */}
                                                    <div className="flex gap-2 justify-center">
                                                        <button
                                                            onClick={() => handleAdd(product, 1)}
                                                            className="flex-1 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors border border-blue-100"
                                                        >
                                                            +1 Caja
                                                        </button>
                                                        <button
                                                            onClick={() => handleAdd(product, 5)}
                                                            className="flex-1 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors border border-blue-100"
                                                        >
                                                            +5 Cajas
                                                        </button>
                                                        <button
                                                            onClick={() => handleAdd(product, 10)}
                                                            className="flex-1 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors border border-blue-100"
                                                        >
                                                            +10
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Cart Sidebar */}
                        <div className="hidden lg:block lg:col-span-1">
                            <div className="sticky top-24 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden flex flex-col max-h-[calc(100vh-8rem)]">
                                <div className="p-4 bg-gray-50 border-b border-gray-100 font-bold text-gray-700 flex justify-between items-center">
                                    <span>Solicitud Actual</span>
                                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">{requestItems.length} items</span>
                                </div>
                                {renderCartContent()}
                            </div>
                        </div>

                    </TabsContent>

                    <TabsContent value="history">
                        <div className="space-y-4 max-w-3xl mx-auto">
                            {history.length === 0 ? (
                                <div className="text-center py-12 text-gray-400 bg-white rounded-xl shadow-sm border border-gray-100">
                                    <Clock className="mx-auto mb-3 opacity-20" size={48} />
                                    <p>No tienes solicitudes pasadas.</p>
                                </div>
                            ) : (
                                history.map(req => (
                                    <div key={req.id} className="bg-white border boundary-gray-100 rounded-xl shadow-sm overflow-hidden">
                                        <div className="p-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                                            <div>
                                                <div className="text-xs text-gray-500 font-mono mb-1">
                                                    {new Date(req.updated_at || req.created_at).toLocaleString()}
                                                </div>
                                                <div className="font-bold text-gray-900 flex items-center gap-2">
                                                    Solicitud #{req.id.slice(0, 8)}
                                                    {req.status === 'COMPLETED' ? (
                                                        <span className="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                                                            <Check size={10} /> COMPLETADA
                                                        </span>
                                                    ) : (
                                                        <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                                                            <XCircle size={10} /> {req.status}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-4 bg-white">
                                            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Productos Cargados</div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {req.items && Array.isArray(req.items) && req.items.map((item, idx) => (
                                                    <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 border border-gray-100">
                                                        <div className="w-10 h-10 bg-white rounded flex items-center justify-center border border-gray-100 shrink-0">
                                                            {skuImages[item.sku] ? (
                                                                <img src={skuImages[item.sku]} alt="" className="w-full h-full object-contain p-1" />
                                                            ) : (
                                                                <Package size={16} className="text-gray-300" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-bold text-gray-700 truncate">{item.des_marca || item.sku}</div>
                                                            <div className="text-xs text-gray-500">{item.qty} cajas</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
};

export default AutoventaStockRequestPage;
