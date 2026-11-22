import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, API_URL } from '../lib/api';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ShoppingCart, User, Package2, TrendingUp, Star, ChevronRight, ChevronLeft, Gift, LogOut, Minus, Plus, Ghost, Menu, X, MessageSquare } from 'lucide-react';
import CartDrawer from '../components/cart/CartDrawer';
import PromoBanner from '../components/PromoBanner';
import RecentOrders from '../components/RecentOrders';
import ChatWidget from '../components/ChatWidget';

export default function Catalog() {
    const [products, setProducts] = useState([]);
    const [brands, setBrands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedBrand, setSelectedBrand] = useState(null);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [quantities, setQuantities] = useState({});
    const { addItem, items, refreshCart } = useCart();
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    useEffect(() => {
        loadData();
        refreshCart(); // Ensure cart prices are up to date on catalog load
    }, []);

    const loadData = async () => {
        try {
            const [productsRes, brandsRes] = await Promise.all([
                api.get(`/products/list.php?_t=${Date.now()}`),
                api.get('/brands/list.php')
            ]);

            if (productsRes.success) {
                setProducts(productsRes.data || []);
            }
            if (brandsRes.success) {
                setBrands(brandsRes.data || []);
            }
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddToCart = async (product, qty = 1) => {
        try {
            // Delegamos el cálculo de precio al Context
            await addItem(product, qty);

            // Reset quantity
            setQuantities(prev => ({ ...prev, [product.sku]: 1 }));
        } catch (error) {
            console.error('Error adding to cart:', error);
        }
    };

    const updateQuantity = (sku, delta) => {
        setQuantities(prev => ({
            ...prev,
            [sku]: Math.max(1, (prev[sku] || 1) + delta)
        }));
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.sku.toLowerCase().includes(search.toLowerCase());
        const matchesBrand = !selectedBrand || p.name.toLowerCase().includes(selectedBrand.toLowerCase());
        return matchesSearch && matchesBrand;
    });

    const cartItemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const cartTotal = items.reduce((sum, item) => {
        const price = item.priceData?.unit_price || item.base_price;
        return sum + (price * item.quantity);
    }, 0);

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header Premium - Fixed Top Bar */}
            {/* Header Premium - Fixed Top Bar */}
            <header className="bg-gradient-to-r from-green-800 via-green-700 to-green-800 shadow-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-2 sm:px-4">
                    <div className="flex items-center gap-4 py-2">
                        {/* Logo */}
                        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                            <div className="h-16 w-auto flex items-center justify-center rounded-xl overflow-hidden shrink-0">
                                <img src="/logo.png" alt="Logo" className="h-full w-auto object-contain" />
                            </div>
                            <h1 className="hidden md:block text-lg sm:text-xl font-black text-white leading-tight">
                                Cervezas <span className="inline">Finas</span> Shop
                            </h1>
                        </div>

                        {/* Search Bar - Moved to Header */}
                        <div className="flex-1 max-w-xl mx-auto">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-700 pointer-events-none" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Buscar..."
                                    className="w-full bg-white/90 focus:bg-white rounded-full pl-9 pr-4 py-2 text-sm text-gray-800 placeholder-green-700/50 focus:outline-none focus:ring-2 focus:ring-green-400 shadow-inner transition-all"
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                            <div className="hidden md:flex items-center gap-2 text-white">
                                <User className="w-5 h-5" />
                                <div className="flex flex-col items-start leading-none">
                                    <span className="font-bold text-sm tracking-wide">{user?.client_code}</span>
                                    {(user?.business_name || user?.contact_name) && (
                                        <span className="text-[10px] opacity-90 font-medium truncate max-w-[150px]">
                                            {user.business_name || user.contact_name}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={() => setIsCartOpen(true)}
                                className="relative bg-white/20 hover:bg-white/30 backdrop-blur-sm px-3 py-1.5 rounded-full transition-all flex items-center gap-2 text-white border border-white/30"
                            >
                                <ShoppingCart className="w-5 h-5" />
                                <div className="hidden sm:block text-xs font-bold">
                                    ${cartTotal.toFixed(2)}
                                </div>
                                {cartItemCount > 0 && (
                                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-bounce">
                                        {cartItemCount}
                                    </span>
                                )}
                            </button>

                            <button
                                onClick={handleLogout}
                                className="bg-red-500/20 hover:bg-red-500/30 p-2 rounded-full transition-all text-white border border-red-400/30"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Brands/Filter Bar - Custom Carousel */}
                <div className="bg-green-800/80 backdrop-blur-md border-t border-white/10 shadow-lg py-4">
                    <div className="max-w-7xl mx-auto px-4 relative">
                        <div className="flex items-center gap-4">
                            {/* Scroll Left */}
                            <button
                                onClick={() => document.getElementById('brands-scroll').scrollBy({ left: -200, behavior: 'smooth' })}
                                className="hidden sm:flex bg-white/10 hover:bg-white/20 p-2 rounded-full text-white transition-all shrink-0"
                            >
                                <ChevronLeft className="w-6 h-6" />
                            </button>

                            {/* Scrollable Area */}
                            <div
                                id="brands-scroll"
                                className="flex-1 flex items-center gap-3 overflow-x-auto scrollbar-hide pb-2 px-1 snap-x snap-mandatory"
                                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                            >
                                <button
                                    onClick={() => setSelectedBrand(null)}
                                    className={`shrink-0 snap-start flex items-center justify-center px-6 h-20 rounded-xl bg-white transition-all border-2 ${!selectedBrand
                                        ? 'border-orange-500 shadow-md ring-2 ring-orange-500/20'
                                        : 'border-transparent hover:border-gray-200'
                                        }`}
                                >
                                    <span className={`font-bold uppercase tracking-wider ${!selectedBrand ? 'text-orange-600' : 'text-gray-600'}`}>
                                        Todas
                                    </span>
                                </button>

                                {brands.map((brand) => (
                                    <button
                                        key={brand.id}
                                        onClick={() => setSelectedBrand(brand.name)}
                                        className={`shrink-0 snap-start flex items-center justify-center w-32 h-20 bg-white rounded-xl transition-all border-2 relative overflow-hidden group ${selectedBrand === brand.name
                                            ? 'border-orange-500 shadow-md ring-2 ring-orange-500/20 z-10 scale-105'
                                            : 'border-transparent hover:border-gray-200 opacity-90 hover:opacity-100 hover:scale-105'
                                            }`}
                                    >
                                        <div className="w-24 h-16 flex items-center justify-center p-2">
                                            <img
                                                src={`${API_URL}/brands/image.php?name=${encodeURIComponent(brand.name)}`}
                                                alt={brand.name}
                                                className="max-w-full max-h-full object-contain transition-transform group-hover:scale-110"
                                                onError={(e) => {
                                                    e.target.style.display = 'none';
                                                    e.target.parentElement.innerText = brand.name;
                                                    e.target.parentElement.className = "text-xs font-bold text-gray-400 text-center";
                                                }}
                                            />
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {/* Scroll Right */}
                            <button
                                onClick={() => document.getElementById('brands-scroll').scrollBy({ left: 200, behavior: 'smooth' })}
                                className="hidden sm:flex bg-white/10 hover:bg-white/20 p-2 rounded-full text-white transition-all shrink-0"
                            >
                                <ChevronRight className="w-6 h-6" />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-4 mt-6 mb-8">
                <PromoBanner />
            </div>

            {/* Main Content with Gradient Overlay */}
            <div className="relative min-h-[calc(100vh-200px)]">
                {/* Background Pattern */}
                <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
                    }}
                />

                <main className="relative max-w-7xl mx-auto px-2 sm:px-4 py-6 sm:py-8 z-10">
                    <div className="flex gap-4 sm:gap-8 flex-col lg:flex-row">
                        {/* Sidebar / Top Bar for Mobile */}
                        <aside className="w-full lg:w-64 shrink-0 space-y-4 lg:space-y-8">

                            {/* Recent Orders - Visible on both, stacked on mobile */}
                            <RecentOrders onRepeatOrder={(item) => handleAddToCart(item, item.quantity)} />

                            {/* Client Information Card */}
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                                <h3 className="flex items-center gap-2 font-bold text-gray-800 mb-3 px-1 border-b border-gray-100 pb-2">
                                    <User className="w-5 h-5 text-green-600" />
                                    <span>Mi Información</span>
                                </h3>

                                <div className="space-y-3 text-sm">
                                    {/* Code & Name */}
                                    <div>
                                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Cliente</p>
                                        <p className="font-bold text-gray-800 text-base">{user?.business_name || user?.name || 'Cliente'}</p>
                                        <p className="text-xs text-green-600 font-medium">{user?.client_code}</p>
                                    </div>

                                    {/* Address */}
                                    <div>
                                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Dirección</p>
                                        <p className="text-gray-600 leading-snug">
                                            {user?.address || 'Sin dirección registrada'}
                                            {user?.colonia ? `, Col. ${user.colonia}` : ''}
                                            {user?.city ? `, ${user.city}` : ''}
                                        </p>
                                    </div>

                                    {/* Phone */}
                                    <div>
                                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Teléfono</p>
                                        <p className="text-gray-600 font-mono">
                                            {user?.phone || 'Sin télefono'}
                                        </p>
                                    </div>

                                    {/* Support Legend */}
                                    <div className="mt-4 pt-3 border-t border-gray-100 bg-orange-50 -mx-4 -mb-4 p-4 rounded-b-2xl">
                                        <div className="flex gap-2">
                                            <div className="shrink-0 pt-0.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5"></div>
                                            </div>
                                            <p className="text-xs text-orange-700/80 leading-relaxed">
                                                <span className="font-bold block text-orange-800 mb-0.5">¿Información incorrecta?</span>
                                                Si detectas algún error en tus datos, por favor contacta a soporte técnico para actualizar tu ficha.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </aside>

                        {/* Product Grid */}
                        <div className="flex-1">
                            {loading ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                                    {[...Array(8)].map((_, i) => (
                                        <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-3 animate-pulse">
                                            <div className="aspect-square bg-gray-200 rounded-xl" />
                                            <div className="h-4 bg-gray-200 rounded w-3/4" />
                                            <div className="h-4 bg-gray-200 rounded w-1/2" />
                                            <div className="mt-auto flex justify-between gap-2">
                                                <div className="h-8 bg-gray-200 rounded w-full" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <AnimatePresence mode="wait">
                                    {filteredProducts.length > 0 ? (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6"
                                        >
                                            {filteredProducts.map((product, index) => {
                                                const qty = quantities[product.sku] || 1;
                                                const price = product.priceData?.unit_price || product.base_price;
                                                // Only show PROMOCION if it comes from the 'promos' rule (dollar discount), NOT just GEC
                                                const isRealPromo = product.priceData?.breakdown?.promos && product.priceData.breakdown.promos.length > 0;
                                                const isSpecialPrice = product.priceData?.breakdown?.special_price;
                                                const hasGecOnly = product.priceData?.breakdown?.gec_level && !isRealPromo && !isSpecialPrice;

                                                return (
                                                    <motion.div
                                                        key={product.id}
                                                        initial={{ opacity: 0, y: 20 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: index * 0.05 }}
                                                        className="group bg-white rounded-2xl shadow-sm hover:shadow-xl hover:shadow-green-900/5 border border-gray-100/50 hover:border-green-500/30 overflow-hidden transition-all duration-300 flex flex-col relative"
                                                    >
                                                        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1 items-start">
                                                            {isSpecialPrice && (
                                                                <div className="bg-purple-600 text-white text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1 animate-pulse">
                                                                    <Star className="w-3 h-3" />
                                                                    PRECIO ESPECIAL
                                                                </div>
                                                            )}
                                                            {isRealPromo && !isSpecialPrice && (
                                                                <div className="bg-red-500 text-white text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1 animate-pulse">
                                                                    <Gift className="w-3 h-3" />
                                                                    PROMOCION
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="relative p-4 sm:p-6 bg-gradient-to-br from-gray-50 to-white group-hover:from-green-50/30 group-hover:to-white transition-colors">
                                                            <div className="aspect-[4/5] flex items-center justify-center relative">
                                                                <img
                                                                    src={`${API_URL}/products/image.php?sku=${product.sku}`}
                                                                    alt={product.name}
                                                                    className="w-full h-full object-contain mix-blend-multiply group-hover:scale-110 transition-transform duration-500 ease-out"
                                                                    onError={(e) => {
                                                                        e.target.onerror = null;
                                                                        e.target.src = "/placeholder.svg";
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="p-3 sm:p-5 flex-1 flex flex-col">
                                                            <div className="mb-2">
                                                                <h3 className="font-bold text-gray-800 text-sm sm:text-base leading-tight group-hover:text-green-700 transition-colors line-clamp-2">
                                                                    {product.name}
                                                                </h3>
                                                                <p className="text-xs text-gray-400 mt-1 font-medium">{product.sku}</p>
                                                            </div>

                                                            <div className="mt-auto space-y-3">
                                                                <div className="flex items-end gap-2">
                                                                    <div className="text-lg sm:text-xl font-black text-gray-900">
                                                                        ${parseFloat(price).toFixed(2)}
                                                                    </div>
                                                                    {isRealPromo && (
                                                                        <div className="text-xs text-gray-400 line-through mb-1 font-medium">
                                                                            ${parseFloat(product.base_price).toFixed(2)}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Controls */}
                                                                <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-1 border border-gray-100">
                                                                    <div className="flex items-center flex-1 justify-between bg-white rounded-lg shadow-sm border border-gray-100 px-1 h-8 sm:h-9">
                                                                        <button
                                                                            onClick={() => updateQuantity(product.sku, -1)}
                                                                            className="w-6 h-full flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                                                                        >
                                                                            <Minus className="w-3 h-3 sm:w-4 sm:h-4" />
                                                                        </button>
                                                                        <span className="font-bold text-gray-700 text-sm w-6 text-center">{qty}</span>
                                                                        <button
                                                                            onClick={() => updateQuantity(product.sku, 1)}
                                                                            className="w-6 h-full flex items-center justify-center text-gray-400 hover:text-green-600 transition-colors"
                                                                        >
                                                                            <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                                                                        </button>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => handleAddToCart(product, qty)}
                                                                        className="bg-green-600 hover:bg-green-700 text-white w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shadow-lg shadow-green-600/20 active:scale-95 transition-all"
                                                                    >
                                                                        <ShoppingCart className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="flex flex-col items-center justify-center py-20 text-center"
                                        >
                                            <div className="bg-gray-100 p-6 rounded-full mb-4">
                                                <Ghost className="w-12 h-12 text-gray-300" />
                                            </div>
                                            <h3 className="text-xl font-bold text-gray-400">No se encontraron productos</h3>
                                            <p className="text-gray-400 mt-2">Intenta con otra búsqueda o filtro.</p>
                                            <button
                                                onClick={() => { setSearch(''); setSelectedBrand(null); }}
                                                className="mt-6 text-green-600 font-medium hover:underline"
                                            >
                                                Limpiar filtros
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            )}
                        </div>
                    </div>
                </main>

                {/* Floating Speed Dial */}
                <div className="fixed bottom-6 right-6 z-[60] flex flex-col items-end gap-3">
                    <AnimatePresence>
                        {isMenuOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: 20, scale: 0.8 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 20, scale: 0.8 }}
                                className="flex flex-col gap-3 mb-2"
                            >
                                <button
                                    onClick={() => {
                                        navigate('/points');
                                        setIsMenuOpen(false);
                                    }}
                                    className="flex items-center gap-3 bg-white text-gray-800 pr-5 pl-2 py-2 rounded-full shadow-xl border border-gray-100 group hover:bg-gray-50 transition-colors"
                                >
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-600 flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
                                        <Gift className="w-5 h-5" />
                                    </div>
                                    <span className="font-bold text-sm">Mis Puntos</span>
                                </button>

                                <button
                                    onClick={() => {
                                        navigate('/orders');
                                        setIsMenuOpen(false);
                                    }}
                                    className="flex items-center gap-3 bg-white text-gray-800 pr-5 pl-2 py-2 rounded-full shadow-xl border border-gray-100 group hover:bg-gray-50 transition-colors"
                                >
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
                                        <Package2 className="w-5 h-5" />
                                    </div>
                                    <span className="font-bold text-sm">Mis Pedidos</span>
                                </button>

                                <button
                                    onClick={() => {
                                        setIsChatOpen(true);
                                        setIsMenuOpen(false);
                                    }}
                                    className="flex items-center gap-3 bg-white text-gray-800 pr-5 pl-2 py-2 rounded-full shadow-xl border border-gray-100 group hover:bg-gray-50 transition-colors"
                                >
                                    <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
                                        <MessageSquare className="w-5 h-5" />
                                    </div>
                                    <span className="font-bold text-sm">Soporte</span>
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Main Toggle Button */}
                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className={`p-4 rounded-full shadow-2xl transition-all transform hover:scale-105 active:scale-95 z-[70] ${isMenuOpen ? 'bg-gray-800 text-white rotate-90' : 'bg-green-600 text-white'
                            }`}
                    >
                        {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>

                    {/* Chat Widget (Controlled) */}
                    <ChatWidget
                        isOpen={isChatOpen}
                        onClose={() => setIsChatOpen(false)}
                        showButton={false}
                    />
                </div>
            </div>




            {/* Cart Drawer */}
            <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />


        </div>
    );
}
