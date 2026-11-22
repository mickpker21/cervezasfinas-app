import { useRef } from 'react'; // Consolidated in next line actually
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Minus, Plus, ShoppingCart, Printer, CheckCircle, AlertTriangle } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useAutoventaCart } from '@/hooks/useAutoventaCart';
import { getLocalProducts } from '@/repositories/productsRepository';
import { BluetoothPrinterService } from '@/services/BluetoothPrinterService';
import { calculateProductPrice } from '@/lib/pricingEngine';
import { fetchShopProducts } from '@/repositories/shopRepository';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';

export default function AutoventaSalesSession() {
    const { state } = useLocation();
    const navigate = useNavigate();
    const { user } = useSupabaseAuth();
    const { toast } = useToast();

    // Client passed from previous screen
    const client = state?.client;

    // Hook Logic
    const {
        cart,
        inventory,
        addToCart,
        updateQuantity,
        cartTotals,
        checkout,
        isSaving,
        pricingRules
    } = useAutoventaCart(user, client);

    // UI State
    const [searchTerm, setSearchTerm] = useState('');
    const [allProducts, setAllProducts] = useState([]);
    const [view, setView] = useState('browse'); // 'browse' | 'cart'
    const [printerConnected, setPrinterConnected] = useState(false);
    const searchInputRef = useRef(null);

    // 1. Validate Client
    useEffect(() => {
        if (!client) {
            navigate('/autoventa/sales');
        }
    }, [client, navigate]);

    // 2. Load Products for Display (Hydrated with Prices)

    // 2. Load Products for Display (Hydrated with Prices)
    useEffect(() => {
        if (!client) return;

        const loadData = async () => {
            // A. Get Base Local Products (Catalog)
            const localProducts = await getLocalProducts();

            // B. Try to get Client-Specific Prices from MySQL (Shop API)
            // This is the "Source of Truth" for base_price as per user.
            let shopProducts = [];
            try {
                shopProducts = await fetchShopProducts(client.client_code);
            } catch (err) {
                console.warn("Could not fetch shop products, using local only", err);
            }

            // Create a Map for fast lookup of Shop Data
            const shopMap = new Map();
            if (shopProducts && Array.isArray(shopProducts)) {
                shopProducts.forEach(sp => shopMap.set(sp.cve_marca, sp));
            }

            // C. Merge & Calculate
            const hydrated = (localProducts || []).map(p => {
                // 1. Check if we have Shop/MySQL data for this product
                const shopItem = shopMap.get(p.cve_marca || p.sku);

                if (shopItem) {
                    // Use Shop Data (Preferred)
                    return {
                        ...p,
                        price: shopItem.price, // Already calculated/base from API
                        originalPrice: shopItem.originalPrice || shopItem.price,
                        hasPromo: shopItem.hasPromo,
                        _pricingBreakdown: shopItem._pricingBreakdown
                    };
                }

                // 2. Fallback: Local Calculation (Offline or Product not in Shop List)
                // Ensure valid base
                const base = Number(p.price || p.current_price || p.precio || 0);
                const pNormal = { ...p, price: base, current_price: base };

                const calc = calculateProductPrice(pNormal, client, pricingRules);

                return {
                    ...p,
                    price: calc.finalPrice,
                    originalPrice: calc.basePrice,
                    hasPromo: calc.hasPromo || (calc.finalPrice < calc.basePrice),
                    _pricingBreakdown: calc.breakdown
                };
            });

            setAllProducts(hydrated);
        };

        loadData();
    }, [client, pricingRules]); // Re-run if rules load later

    // 3. Printer Check
    useEffect(() => {
        const checkPrinter = async () => {
            const isConnected = BluetoothPrinterService.isConnected;
            setPrinterConnected(isConnected);
            if (!isConnected) {
                // Try auto-connect to last
                const lastId = localStorage.getItem('last_printer_id');
                if (lastId) {
                    BluetoothPrinterService.connect(lastId).then(() => setPrinterConnected(true)).catch(() => { });
                }
            }
        };
        checkPrinter();
    }, []);


    // Filter Logic
    const filteredProducts = allProducts.filter(p => {
        const q = searchTerm.toLowerCase();
        return (
            (p.name || p.des_marca || '').toLowerCase().includes(q) ||
            (p.sku || p.cve_marca || '').toLowerCase().includes(q)
        );
    });

    const handleCheckout = async () => {
        if (cart.length === 0) return;

        const result = await checkout(); // Default Cash/Contado for now
        if (result && result.id) {
            toast({ title: 'Venta Guardada', className: "bg-green-600 text-white" });

            // Print Ticket
            try {
                // Construct Sale Data for Printer
                const saleDataForPrint = {
                    preventaId: result.id,
                    items: cartTotals.items,
                    totalAmount: cartTotals.total,
                    created_at: new Date().toISOString(),
                    // Discounts & Cargo
                    discount: 0, // Generic discount placeholder
                    gecDiscount: cartTotals.totalGec || 0,
                    promoDiscount: cartTotals.totalPromo || 0,
                    cargo: cartTotals.totalSurcharges || 0
                };

                await BluetoothPrinterService.printTicket(saleDataForPrint, client);
            } catch (e) {
                console.error("Print error", e);
                // Continue to navigate even if print fails
            }

            // Navigate back to Route (Client List)
            navigate('/autoventa/sales');
        }
    };

    if (!client) return null;

    return (
        <div className="flex flex-col h-screen bg-gray-950 text-white">
            {/* Header */}
            <div className="bg-gray-900 p-4 shadow-lg border-b border-gray-800 flex justify-between items-center z-10">
                <div className="flex items-center gap-3 overflow-hidden">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-gray-800">
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h1 className="font-bold text-lg truncate leading-tight w-48 sm:w-auto">{client.business_name || client.name}</h1>
                        <p className="text-xs text-blue-400 font-mono">{client.client_code}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${printerConnected ? 'bg-green-500' : 'bg-red-500'} shadow-[0_0_8px_rgba(0,0,0,0.5)]`} />
                    <button
                        onClick={() => setView(view === 'cart' ? 'browse' : 'cart')}
                        className={`relative p-3 rounded-xl transition-all ${view === 'cart' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400'}`}
                    >
                        <ShoppingCart size={24} />
                        {cart.length > 0 && (
                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold border-2 border-gray-900">
                                {cart.length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative">

                {/* BROWSE MODE */}
                {view === 'browse' && (
                    <div className="h-full flex flex-col">
                        {/* Search */}
                        <div className="p-3 bg-gray-900/50 backdrop-blur-sm">
                            <div className="relative">
                                <Search className="absolute left-3 top-3 text-gray-500" size={20} />
                                <input
                                    ref={searchInputRef}
                                    className="w-full bg-gray-800 text-white py-3 pl-10 pr-4 rounded-xl border border-gray-700 focus:border-green-500 outline-none placeholder-gray-500 text-base"
                                    placeholder="Buscar producto..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Inventory List */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-24">
                            {filteredProducts.map(product => {
                                const stock = inventory[product.cve_marca] || 0;
                                const inCart = cart.find(c => c.cve_marca === product.cve_marca);
                                const qty = inCart ? inCart.quantity : 0;
                                const isOOS = stock <= 0;

                                return (
                                    <div key={product.cve_marca} className={`bg-gray-900 rounded-xl p-4 border ${inCart ? 'border-green-500/50 bg-green-900/5' : 'border-gray-800'} shadow-sm flex justify-between items-center`}>
                                        <div className="flex-1 mr-4">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="font-bold text-white text-base">{product.des_marca || product.name}</h3>
                                                {product.hasPromo && <span className="bg-pink-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">OFERTA</span>}
                                            </div>
                                            <div className="flex items-center gap-4 text-sm mb-1">
                                                <span className="text-gray-400 font-mono">{product.cve_marca}</span>
                                                <span className={`font-bold ${isOOS ? 'text-red-500' : 'text-green-400'}`}>
                                                    Stock: {stock}
                                                </span>
                                            </div>
                                            <div className="text-lg font-bold text-white">
                                                ${(product.price || 0).toFixed(2)}
                                                {product.price < product.originalPrice && (
                                                    <span className="text-xs text-gray-500 line-through ml-2">
                                                        ${(product.originalPrice || 0).toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Controls */}
                                        <div className="flex items-center gap-3">
                                            {qty > 0 && (
                                                <>
                                                    <button onClick={() => updateQuantity(product.cve_marca, qty - 1)} className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center active:scale-95 text-red-400">
                                                        <Minus size={20} />
                                                    </button>
                                                    <span className="text-xl font-bold w-6 text-center">{qty}</span>
                                                </>
                                            )}
                                            <button
                                                onClick={() => addToCart(product)}
                                                disabled={isOOS || qty >= stock}
                                                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg ${isOOS ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-500'}`}
                                            >
                                                <Plus size={24} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Empty State */}
                            {filteredProducts.length === 0 && (
                                <div className="text-center py-12 text-gray-500">
                                    No se encontraron productos
                                </div>
                            )}
                        </div>
                    </div>
                )}


                {/* CART MODE (Overlay or Separate View? Let's do full view swap for simplicity) */}
                {view === 'cart' && (
                    <div className="h-full flex flex-col bg-gray-950">
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-40">
                            {cart.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-64 opacity-50">
                                    <ShoppingCart size={64} className="mb-4 text-gray-600" />
                                    <p>Carrito vacío</p>
                                    <button onClick={() => setView('browse')} className="mt-4 text-green-500 underline">Agregar productos</button>
                                </div>
                            ) : (
                                cartTotals.items.map(item => (
                                    <div key={item.cve_marca} className="bg-gray-900 p-4 rounded-xl border border-gray-800">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <h4 className="font-bold text-lg">{item.des_marca}</h4>
                                                {/* Price Breakdown display */}
                                                <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                                                    {item._pricingBreakdown && item._pricingBreakdown.map((b, i) => (
                                                        <div key={i} className="flex gap-1 text-green-300">
                                                            <span>• {b.label}:</span>
                                                            <span>${b.amount.toFixed(2)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="text-green-400 font-bold mt-2 text-lg">
                                                    ${item.price.toFixed(2)} x {item.quantity} = ${(item.price * item.quantity).toFixed(2)}
                                                </div>
                                            </div>
                                            <button onClick={() => updateQuantity(item.cve_marca, 0)} className="p-2 text-red-500 bg-red-500/10 rounded-lg">
                                                <span className="text-xs font-bold">Eliminar</span>
                                            </button>
                                        </div>

                                        {/* Stepper */}
                                        <div className="flex items-center justify-between bg-black/20 p-2 rounded-lg">
                                            <button onClick={() => updateQuantity(item.cve_marca, item.quantity - 1)} className="w-10 h-10 bg-gray-700 text-white rounded flex items-center justify-center"><Minus size={20} /></button>
                                            <span className="text-xl font-bold">{item.quantity}</span>
                                            <button onClick={() => addToCart(item)} className="w-10 h-10 bg-gray-700 text-white rounded flex items-center justify-center"><Plus size={20} /></button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* BOTTOM FLOATING BAR */}
                {/* Always visible logic summary */}
                <div className="absolute bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 p-4 shadow-2xl safe-area-bottom">
                    <div className="flex justify-between items-end mb-4 px-2">
                        <div>
                            <p className="text-gray-400 text-sm">Total ({cartTotals.totalBoxes} Cajas)</p>
                            <p className="text-3xl font-black text-white">${cartTotals.total.toFixed(2)}</p>
                        </div>
                        {view === 'browse' && cart.length > 0 && (
                            <button onClick={() => setView('cart')} className="bg-gray-800 text-gray-300 px-4 py-2 rounded-lg font-bold">Ver Detalles</button>
                        )}
                    </div>

                    <Button
                        onClick={handleCheckout}
                        disabled={isSaving || cart.length === 0}
                        className={`w-full h-14 text-xl font-bold rounded-xl shadow-lg flex items-center justify-center gap-3 ${cart.length === 0 ? 'bg-gray-800 text-gray-500' : 'bg-green-600 hover:bg-green-500 text-white shimmer'}`}
                    >
                        {isSaving ? (
                            <span className="animate-pulse">Guardando...</span>
                        ) : (
                            <>
                                <Printer size={24} />
                                COBRAR E IMPRIMIR
                            </>
                        )}
                    </Button>
                </div>
            </div>

            <style>{`
              .shimmer {
                position: relative;
                overflow: hidden;
              }
              .shimmer::after {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 50%;
                height: 100%;
                background: linear-gradient(to right, transparent, rgba(255,255,255,0.2), transparent);
                animation: shimmer 2s infinite;
              }
              @keyframes shimmer {
                100% { left: 150%; }
              }
            `}</style>
        </div>
    );
}
