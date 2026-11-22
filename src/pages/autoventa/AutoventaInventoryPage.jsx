import React, { useEffect, useState } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { getTruckInventory } from '@/repositories/inventoryRepository';
import { getSalesBySku } from '@/repositories/salesRepository'; // Reusing for outflows
import { supabase } from '@/supabaseClient';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Helmet } from 'react-helmet-async';
import { getTodayMexico } from '@/lib/dateUtils';
import { Input } from '@/components/ui/input';
import { Search, Box, ArrowUpRight, ArrowDownLeft, Printer, Truck, Package, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { BluetoothPrinterService } from '@/services/BluetoothPrinterService';
import { useToast } from '@/components/ui/use-toast';
import { Capacitor } from '@capacitor/core';

const AutoventaInventoryPage = () => {
    const { user } = useSupabaseAuth();
    const { toast } = useToast();
    const [inventory, setInventory] = useState([]);
    const [outflows, setOutflows] = useState([]); // Today's sales
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('stock'); // 'stock' | 'outflows'
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const load = async () => {
            if (!user) return;
            setLoading(true);
            try {
                // 1. Stock (Inventory Repository handles offline + pending deductions)
                const stockData = await getTruckInventory(user.id);

                // Get Product Names from Local Repo (Offline/Online definition)
                const { getLocalProducts } = await import('@/repositories/productsRepository');
                const prods = await getLocalProducts();

                const nameMap = {};
                prods?.forEach(p => {
                    // Normalize keys if needed
                    const sku = p.cve_marca || p.sku;
                    const name = p.des_marca || p.name;
                    if (sku) nameMap[sku] = name;
                });

                const items = Object.entries(stockData).map(([sku, qty]) => ({
                    sku,
                    name: nameMap[sku] || sku,
                    qty
                })).sort((a, b) => b.qty - a.qty);
                setInventory(items);

                // 2. Outflows (Sales Today) - Use Repository for Offline Support
                const { getDailySales } = await import('@/repositories/directSalesRepository');
                const today = getTodayMexico(); // Mexico timezone

                const sales = await getDailySales(user.id, today);

                const outMap = {};
                sales?.forEach(s => {
                    const sItems = s.direct_sales_items || (typeof s.items === 'string' ? JSON.parse(s.items) : s.items) || [];

                    sItems.forEach(i => {
                        const sku = i.cve_marca || i.sku;
                        if (!sku) return;

                        if (!outMap[sku]) {
                            // Try to get name from item snapshot, then fall back to catalog
                            const itemName = i.des_marca || i.name || nameMap[sku] || 'Desconocido';
                            outMap[sku] = { sku: sku, name: itemName, qty: 0 };
                        }
                        outMap[sku].qty += Number(i.quantity || 0);
                    });
                });
                setOutflows(Object.values(outMap).sort((a, b) => b.qty - a.qty));

            } catch (e) { console.error(e); } finally { setLoading(false); }
        };
        load();
    }, [user, view]); // Reload when view changes? No, load all at once is better. Kept for simplicity.

    const filtered = (view === 'stock' ? inventory : outflows).filter(i =>
        i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.sku.includes(searchTerm)
    );

    const handlePrint = async () => {
        const title = view === 'stock' ? 'INVENTARIO A BORDO' : 'SALIDAS DEL DÍA';
        try {
            if (!BluetoothPrinterService.isConnected) {
                await BluetoothPrinterService.connect();
            }
            await BluetoothPrinterService.printInventory(filtered, user, title);
            toast({ title: "Imprimiendo...", description: "Enviado a impresora Bluetooth." });
        } catch (e) {
            console.error(e);
            if (!Capacitor.isNativePlatform()) {
                window.print();
            } else {
                toast({ title: "Error", description: "No se pudo conectar a impresora.", variant: "destructive" });
            }
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-20">
            {/* Header */}
            <div className="bg-slate-900 text-white p-6 pb-12 rounded-b-[3rem] shadow-xl mb-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h1 className="text-3xl font-black tracking-tight">{view === 'stock' ? 'Inventario a Bordo' : 'Salidas del Día'}</h1>
                            <p className="text-slate-400 font-medium">{view === 'stock' ? 'Stock disponible en camión' : 'Mercancía vendida hoy'}</p>
                        </div>
                        <Button onClick={handlePrint} variant="ghost" className="text-white hover:bg-white/10">
                            <Printer size={20} />
                        </Button>
                    </div>

                    <div className="flex gap-2 bg-white/10 p-1.5 rounded-2xl backdrop-blur-md border border-white/5 w-full md:w-auto self-start">
                        <button onClick={() => setView('stock')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-6 rounded-xl text-sm font-bold transition-all ${view === 'stock' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-300 hover:bg-white/5'}`}>
                            <Package size={18} /> Stock
                        </button>
                        <button onClick={() => setView('outflows')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-6 rounded-xl text-sm font-bold transition-all ${view === 'outflows' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'text-slate-300 hover:bg-white/5'}`}>
                            <ArrowDownLeft size={18} /> Salidas
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 -mt-16 relative z-20">
                {/* Search */}
                <div className="mb-6 relative">
                    <Search className="absolute left-4 top-4 h-5 w-5 text-slate-400" />
                    <Input
                        className="pl-12 h-14 bg-white border-none shadow-xl shadow-slate-200/50 rounded-2xl text-lg font-medium"
                        placeholder="Buscar producto..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                {loading ? (
                    <div className="space-y-4 animate-pulse">
                        {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-white rounded-2xl shadow-sm"></div>)}
                    </div>
                ) : (
                    <div className="space-y-3">
                        <AnimatePresence mode="popLayout">
                            {filtered.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    <Box size={48} className="mx-auto mb-2 opacity-20" />
                                    <p>No se encontraron productos.</p>
                                </div>
                            ) : (
                                filtered.map((item, idx) => (
                                    <motion.div
                                        key={item.sku}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ delay: idx * 0.03 }}
                                    >
                                        <Card className="border-none shadow-sm hover:shadow-md transition-shadow bg-white rounded-2xl overflow-hidden">
                                            <div className="p-4 flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className={`h-12 w-12 rounded-xl flex items-center justify-center font-bold text-lg ${view === 'stock' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                                                        {view === 'stock' ? <Box size={20} /> : <ArrowDownLeft size={20} />}
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-slate-900 leading-tight">{item.name}</h3>
                                                        <p className="text-xs text-slate-400 font-mono">SKU: {item.sku}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <span className={`text-2xl font-black ${view === 'stock' ? (item.qty < 5 ? 'text-red-500' : 'text-slate-900') : 'text-orange-600'}`}>
                                                        {item.qty}
                                                    </span>
                                                    <p className="text-xs font-bold text-slate-400 uppercase">Cajas</p>
                                                </div>
                                            </div>
                                        </Card>
                                    </motion.div>
                                ))
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* Print Only Template (Receipt Format) */}
            <div className="hidden print:block font-mono text-black p-2 max-w-[80mm] mx-auto text-xs leading-tight">
                <div className="text-center font-bold mb-1 text-base">CERVEZAS FINAS</div>
                <div className="text-center font-bold mb-1">REPORTE DE {view === 'stock' ? 'INVENTARIO' : 'SALIDAS'}</div>
                <div className="text-center mb-2 uppercase text-[10px]">{view === 'stock' ? 'A BORDO' : 'DEL DÍA'}</div>

                <div className="space-y-0.5 mb-2 border-b border-black border-dashed pb-2">
                    <div className="flex justify-between"><span>Fecha:</span> <span>{new Date().toLocaleString('es-MX')}</span></div>
                    <div className="flex justify-between"><span>Chofer:</span> <span>{user?.profile?.name || user?.user_metadata?.nombre || user?.user_metadata?.name || 'Chofer'}</span></div>
                </div>

                <div className="space-y-1">
                    <div className="flex justify-between font-bold border-b border-black pb-1 mb-1">
                        <span>CANT</span>
                        <span>PRODUCTO</span>
                    </div>
                    {filtered.map(i => (
                        <div key={i.sku} className="flex justify-between items-baseline mb-1">
                            <span className="font-bold w-10 text-right mr-2">{i.qty}</span>
                            <span className="flex-1 text-left">{i.name.substring(0, 25)}</span>
                        </div>
                    ))}
                    {filtered.length === 0 && <div className="text-center italic mt-2">Sin registros.</div>}
                </div>

                <div className="mt-6 pt-4 border-t border-black border-dashed">
                    <div className="flex justify-between font-bold text-sm">
                        <span>TOTAL CAJAS:</span>
                        <span>{filtered.reduce((sum, i) => sum + Number(i.qty), 0)}</span>
                    </div>
                </div>

                <div className="mt-8 pt-8 border-t border-black border-dashed">
                    <div className="text-center mb-8">Firma Responsable</div>
                    <div className="h-8 border-b border-black mx-8"></div>
                </div>
            </div>
        </div>
    );
};

export default AutoventaInventoryPage;
