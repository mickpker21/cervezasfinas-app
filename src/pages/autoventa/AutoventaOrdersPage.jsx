import React, { useEffect, useState } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { getDailySales } from '@/repositories/directSalesRepository';
import { Card } from '@/components/ui/card';
import { ShoppingBag, Clock, DollarSign, ArrowRight, User, AlertCircle, Printer, Bluetooth } from 'lucide-react';
import ReceiptModal from '@/components/ReceiptModal';
import { Button } from '@/components/ui/button';
import { supabase } from '@/supabaseClient';
import { BluetoothPrinterService } from '@/services/BluetoothPrinterService';
import { fetchShopProducts } from '@/repositories/shopRepository';
import { kvStorage } from '@/services/kvStorage';

const AutoventaOrdersPage = () => {
    const { user } = useSupabaseAuth();
    const [sales, setSales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dateFilter] = useState(() => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });

    // Receipt State
    const [selectedSale, setSelectedSale] = useState(null);
    const [showReceipt, setShowReceipt] = useState(false);

    // Cache for product names
    const [productMap, setProductMap] = useState({});

    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;
            setLoading(true);
            try {
                // Fetch daily sales
                const data = await getDailySales(user.id, dateFilter);
                setSales(data || []);

                // Fetch product names for reprint mapping (OFFLINE READY)
                const { getLocalProducts, syncProducts } = await import('@/repositories/productsRepository');

                // 1. Load Local First (Fast)
                let productsData = await getLocalProducts();

                // 2. Trigger Background Sync (Update if online)
                syncProducts().then(async () => {
                    // Optional: Refresh if needed, or just let next reload pick it up.
                    // For now, we trust local first. If we want dynamic update, we could re-call getLocalProducts() here.
                    const updated = await getLocalProducts();
                    if (updated && updated.length > productsData.length) {
                        // Update state if new items found (simple approach)
                        // For now we just log
                        console.log('[AutoventaOrders] Background sync updated products:', updated.length);
                        updateProductMap(updated);
                    }
                }).catch(e => console.warn('Background product sync failed', e));

                const updateProductMap = (list) => {
                    const map = {};
                    list.forEach(p => {
                        const key = String(p.cve_marca || p.sku).trim();
                        if (key) {
                            const entry = {
                                name: p.des_marca || p.name || 'Sin Nombre',
                                price: Number(p.price || p.current_price || 0)
                            };
                            map[key] = entry;
                            map[String(p.cve_marca)] = entry; // Ensure loose matching
                        }
                    });
                    // MERGE SHOP CACHE (Critical for Discounts & Names)
                    // Keeping the existing logic for Shop KV as it might contain specialized pricing
                    kvStorage.getItemsByPrefix('shop_pricing_').then(cachedItems => {
                        cachedItems.forEach(({ value: parsed }) => {
                            if (parsed && Array.isArray(parsed.data)) {
                                parsed.data.forEach(p => {
                                    const code = p.cve_marca || p.sku;
                                    if (code) {
                                        const entry = {
                                            name: p.des_marca,
                                            price: p.originalPrice || p.price
                                        };
                                        const keyStr = String(code).trim();
                                        map[keyStr] = entry;
                                        map[String(code)] = entry;
                                    }
                                });
                            }
                        });
                        console.log("Product Map loaded (Combined Local + Shop):", Object.keys(map).length);
                        setProductMap(map);
                    }).catch(e => {
                        console.warn("KV Storage access error", e);
                        setProductMap(map); // Set at least what we have
                    });
                };

                updateProductMap(productsData);

                // 2. FETCH SHOP DATA FOR CLIENTS IN LIST (Active Update) - Keeping legacy logic just in case
                if (data && data.length > 0) {
                    const uniqueClients = [...new Set(data.filter(s => s.clients?.client_code).map(s => s.clients.client_code))];
                    if (uniqueClients.length > 0) {
                        try {
                            const shopPromises = uniqueClients.map(code => fetchShopProducts(code));
                            // We don't await this to block UI, let it flow
                            Promise.all(shopPromises).then(shopResults => {
                                setProductMap(prevMap => {
                                    const newMap = { ...prevMap };
                                    shopResults.flat().forEach(p => {
                                        const entry = { name: p.des_marca, price: Number(p.originalPrice || p.price) };
                                        if (p.cve_marca) newMap[String(p.cve_marca).trim()] = entry;
                                        if (p.sku) newMap[String(p.sku).trim()] = entry;
                                        if (p.id) newMap[String(p.id).trim()] = entry;
                                    });
                                    return newMap;
                                });
                            });
                        } catch (e) { console.warn("Error fetching shop data for history", e); }
                    }
                }

            } catch (error) {
                console.error('Error fetching data', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [user, dateFilter]);

    const totalAmount = sales.reduce((acc, sale) => acc + Number(sale.total_amount), 0);

    const connectPrinter = async () => {
        try {
            await BluetoothPrinterService.connect();
            alert("¡Impresora Conectada Correctamente!");
        } catch (e) {
            console.error(e);
            alert("Error al conectar: " + e.message);
        }
    };

    const handleReprint = async (sale) => {
        console.log("Reprinting sale object ID:", sale.id);

        let calculatedListSubtotal = 0;
        const items = sale.direct_sales_items?.map(item => {
            const codeKey = String(item.cve_marca).trim();
            const productInfo = productMap[codeKey] || productMap[item.cve_marca];

            if (!productInfo) {
                console.warn(`Product Info NOT FOUND for code: "${item.cve_marca}" (Key used: "${codeKey}"). Available keys sample:`, Object.keys(productMap).slice(0, 5));
            }

            const name = productInfo?.name || item.cve_marca;
            // Use catalog price if available and higher, otherwise sold price
            const listPrice = productInfo?.price || 0;
            const soldPrice = Number(item.unit_price);

            // Logic: If listPrice > soldPrice, we have a discount.
            // If listPrice is 0 (not found), we assume listPrice = soldPrice (no discount).
            const originalPrice = (listPrice > soldPrice) ? listPrice : soldPrice;

            calculatedListSubtotal += (originalPrice * item.quantity);

            return {
                quantity: item.quantity,
                des_marca: name,
                price: originalPrice, // Pass Original Price to printer so it sums up to "Subtotal" (List Total)
                // Note: The printer script calculates "Subtotal" by summing these. 
                // Then it subtracts "Discount" (calculated below) to reach "Total".
                total: originalPrice * item.quantity
            };
        }) || [];

        // If items used Original Price, the Sum is "List Total".
        // Sale Total is "Paid Total".
        // impliedDiscount = List Total - Paid Total
        const impliedDiscount = calculatedListSubtotal - Number(sale.total_amount);

        const saleData = {
            preventaId: sale.id,
            items: items,
            totalAmount: sale.total_amount,
            client: sale.clients,
            created_at: sale.created_at,
            discount: impliedDiscount > 0.01 ? impliedDiscount : 0,
            gecDiscount: sale.gec_discount || 0,
            promoDiscount: sale.promo_discount || 0,
            cargo: sale.cargo || 0
        };

        // Try Bluetooth Print first
        if (BluetoothPrinterService.isConnected) {
            try {
                await BluetoothPrinterService.printTicket(saleData, sale.clients);
                return; // Success, no need to open modal
            } catch (e) {
                console.error("Bluetooth Print Error", e);
                alert("Error imprimiendo por Bluetooth. Verifique conexión.");
                // Fallthrough to modal
            }
        }

        setSelectedSale(saleData);
        setShowReceipt(true);
    };

    return (

        <div className="min-h-screen bg-[#1a1c2e] pb-20 font-sans text-white">
            {/* Minimal Header */}
            <div className="bg-[#1a1c2e]/90 border-b border-white/5 p-6 sticky top-0 z-20 backdrop-blur-md">
                <div className="flex flex-col gap-4 max-w-2xl mx-auto">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold text-white tracking-tight">Pedidos de Hoy</h1>
                            <p className="text-white/40 text-xs font-medium uppercase tracking-wide">{dateFilter}</p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={connectPrinter}
                            className="gap-2 text-white border-white/20 hover:bg-white/5 hover:text-blue-400 transition-colors"
                        >
                            <Bluetooth size={16} />
                            <span className="hidden sm:inline">Conectar</span> Impresora
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.location.reload()}
                            className="text-white/50 hover:text-white"
                        >
                            <Clock size={14} className="mr-1" /> Recargar
                        </Button>
                    </div>

                    <div className="flex justify-between items-end border-t border-white/5 pt-4">
                        <span className="text-sm text-white/40">Total Acumulado</span>
                        <span className="text-xl font-black text-green-400">
                            ${totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>
            </div>

            {/* Timeline Feed */}
            <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-4 text-white/30">
                        <div className="h-8 w-8 rounded-full border-2 border-current border-t-transparent animate-spin"></div>
                        <p className="text-sm">Cargando pedidos...</p>
                    </div>
                ) : sales.length === 0 ? (
                    <div className="text-center py-16 bg-[#2a2c44] rounded-3xl border border-white/5 shadow-lg px-6">
                        <div className="bg-white/5 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <ShoppingBag className="h-8 w-8 text-white/20" />
                        </div>
                        <h3 className="text-lg font-bold text-white">Sin Pedidos Aún</h3>
                        <p className="text-white/40 text-sm mt-1 max-w-xs mx-auto">
                            Comienza tu ruta para generar ventas. Tus tickets aparecerán aquí automáticamente.
                        </p>
                    </div>
                ) : (
                    sales.map((sale, index) => (
                        <div key={sale.id} className="relative pl-6 pb-6 last:pb-0">
                            {/* Timeline Line */}
                            {index !== sales.length - 1 && (
                                <div className="absolute left-[11px] top-8 bottom-0 w-0.5 bg-white/10"></div>
                            )}

                            {/* Timeline Dot */}
                            <div className="absolute left-0 top-1 h-6 w-6 rounded-full bg-green-500/20 border-2 border-[#1a1c2e] shadow-sm flex items-center justify-center z-10">
                                <DollarSign className="h-3 w-3 text-green-400" />
                            </div>

                            <Card className="bg-[#2a2c44] border border-white/5 shadow-lg hover:shadow-xl transition-shadow duration-200 overflow-hidden group">
                                <div className="p-4 flex flex-col sm:flex-row gap-4 sm:items-center">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-mono text-white/50 bg-white/5 px-1.5 py-0.5 rounded">
                                                {new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <span className="text-xs font-bold text-white/30 uppercase tracking-wider">
                                                Ticket
                                            </span>
                                        </div>
                                        <h3 className="font-bold text-white text-lg flex items-center gap-2">
                                            {sale.clients?.name}
                                        </h3>
                                        <div className="flex items-center gap-2 mt-1 text-sm text-white/50">
                                            <User size={14} />
                                            <span>{sale.clients?.client_code}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between sm:justify-end gap-6 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                                        <div className="text-center sm:text-right">
                                            <span className="text-[10px] uppercase text-white/40 font-bold">Items</span>
                                            <div className="font-bold text-white">{sale.direct_sales_items?.length || 0}</div>
                                        </div>
                                        <div className="text-center sm:text-right">
                                            <span className="text-[10px] uppercase text-white/40 font-bold">Total</span>
                                            <div className="font-black text-green-400 text-lg">
                                                ${Number(sale.total_amount).toLocaleString('es-MX')}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white/5 px-4 py-2 flex justify-between items-center text-xs text-white/60 group-hover:bg-white/10 transition-colors">
                                    <span className="cursor-pointer hover:text-white transition-colors">Ver detalle</span>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs hover:bg-white/10 hover:text-white gap-1"
                                            onClick={() => handleReprint(sale)}
                                        >
                                            <Printer size={12} />
                                            <span className="hidden sm:inline">Reimprimir</span>
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 gap-1"
                                            onClick={() => handleReprint(sale)}
                                        >
                                            <Bluetooth size={12} />
                                            Ticket BT
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    ))
                )}
            </div>

            <ReceiptModal
                open={showReceipt}
                onOpenChange={setShowReceipt}
                saleData={selectedSale}
                client={selectedSale?.client}
            />
        </div>
    );
};

export default AutoventaOrdersPage;
