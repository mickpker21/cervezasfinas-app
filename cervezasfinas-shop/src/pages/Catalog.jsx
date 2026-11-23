import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api, API_URL } from '../lib/api';
import { pointsService } from '../lib/points';
import { useCart, getCartItemKey } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useShopSettings } from '../contexts/ShopSettingsContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, ShoppingCart, User, Package2, TrendingUp, Star,
    ChevronRight, ChevronLeft, Gift, LogOut, Minus, Plus, Ghost,
    MessageSquare, Trophy, Sparkles, Phone, Lock, Edit3, Check, Trash2, ArrowRight, X
} from 'lucide-react';
import CartDrawer from '../components/cart/CartDrawer';
import PromoBanner from '../components/PromoBanner';
import RecentOrders from '../components/RecentOrders';
import ChatWidget from '../components/ChatWidget';
import NotificationsBell from '../components/NotificationsBell';
import AccountModal from '../components/AccountModal';
import ProductCard3D from '../components/ProductCard3D';
import { SHOP_NAV_ITEMS } from '../components/BottomNav';

// Placeholder SVG inline para evitar peticiones adicionales cuando un SKU no tiene foto
const PRODUCT_PLACEHOLDER_SVG = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="360" viewBox="0 0 300 360">' +
    '<rect width="100%" height="100%" rx="20" fill="#f8fafc"/>' +
    '<circle cx="150" cy="145" r="54" fill="#ecfdf5"/>' +
    '<path d="M135 110h30l6 25v45a10 10 0 0 1-10 10h-22a10 10 0 0 1-10-10v-45l6-25zm6 0v-10h18v10" stroke="#059669" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<text x="50%" y="245" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#065f46" text-anchor="middle">UM6 SHOP</text>' +
    '<text x="50%" y="268" font-family="Arial, sans-serif" font-size="11" fill="#94a3b8" text-anchor="middle">Imagen no disponible</text>' +
    '</svg>'
);

function resolveBrandLogoUrl(brand) {
    const rawUrl = String(brand?.logo_url || '').trim();
    if (rawUrl) {
        if (rawUrl.startsWith('http')) {
            return rawUrl.replace(
                'https://cervezasfinas.com/uploads/brands/',
                'https://cervezasfinas.com/api/public/uploads/brands/'
            );
        }
        if (rawUrl.startsWith('/uploads/brands/')) {
            return `https://cervezasfinas.com/api/public${rawUrl}`;
        }
        return `https://cervezasfinas.com${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
    }
    const cleanName = String(brand?.name || '').toUpperCase().trim();
    if (!cleanName) return '';
    return `https://cervezasfinas.com/brands/${encodeURIComponent(cleanName)}.png`;
}

function resolveProductImageUrl(product) {
    if (!product) return PRODUCT_PLACEHOLDER_SVG;
    if (product.has_photo === false) return PRODUCT_PLACEHOLDER_SVG;
    if (product.photo_url) return product.photo_url;
    const cleanSku = String(product.sku || '').trim();
    if (!cleanSku) return PRODUCT_PLACEHOLDER_SVG;
    // Cargar primero la imagen estática directa de /portafolio/ (evita la caché antigua de image.php y no consume procesos PHP)
    return `https://cervezasfinas.com/portafolio/${encodeURIComponent(cleanSku)}.png`;
}

// Helper para identificar a qué marca pertenece un producto
function matchProductToBrand(product, brandsList) {
    if (!product || !Array.isArray(brandsList) || brandsList.length === 0) return null;
    const pBrand = String(product.brand || '').toLowerCase().trim();
    const pName = String(product.name || '').toLowerCase();

    if (pBrand) {
        const direct = brandsList.find(b => {
            const bName = String(b.name || '').toLowerCase().trim();
            return bName && (bName === pBrand || pBrand.includes(bName) || bName.includes(pBrand));
        });
        if (direct) return direct.name;
    }

    const byName = brandsList.find(b => {
        const bName = String(b.name || '').toLowerCase().trim();
        return bName && pName.includes(bName);
    });
    if (byName) return byName.name;

    // Casos especiales comunes (ej. XX -> DOS EQUIS)
    if (pName.includes('xx ') || pName.startsWith('xx')) {
        const xxBrand = brandsList.find(b => /xx|dos equis/i.test(b.name || ''));
        if (xxBrand) return xxBrand.name;
    }

    return null;
}

export default function Catalog() {
    const [products, setProducts] = useState([]);
    const [brands, setBrands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedBrand, setSelectedBrand] = useState(null);
    const [activeScrollBrand, setActiveScrollBrand] = useState(null);
    const [showOnlyFrequents, setShowOnlyFrequents] = useState(false);
    const [frequentSkus, setFrequentSkus] = useState([]);
    const [recentOrder, setRecentOrder] = useState(null);
    const [pointsBalance, setPointsBalance] = useState(null);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [accountModal, setAccountModal] = useState({ open: false, tab: 'phone' });
    const [quantities, setQuantities] = useState({});
    const [visibleCount, setVisibleCount] = useState(36);

    const mobileBrandsScrollRef = useRef(null);
    const desktopBrandsScrollRef = useRef(null);
    const lastCenteredBrandRef = useRef(null);
    const loadMoreRef = useRef(null);

    const { addItem, setItemQuantity, removeItem, items, refreshCart } = useCart();
    const [selectedPresentations, setSelectedPresentations] = useState({});

    const getSelectedPresentation = useCallback((product) => {
        const list = Array.isArray(product?.presentations) ? product.presentations : [];
        if (list.length === 0) return null;
        const chosenCode = selectedPresentations[product.sku];
        if (chosenCode) {
            const found = list.find(p => p.code === chosenCode);
            if (found) return found;
        }
        return list.find(p => Number(p.is_default) === 1) || list[0];
    }, [selectedPresentations]);
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuth();
    const { showPrices } = useShopSettings();

    useEffect(() => {
        loadData();
        refreshCart();
    }, []);

    useEffect(() => {
        if (location.search.includes('openChat=1')) {
            handleOpenTeleventaWhatsApp();
            navigate('/catalog', { replace: true });
        }
    }, [location.search, navigate]);

    const handleOpenTeleventaWhatsApp = async () => {
        try {
            const clientCode = user?.client_code || '';
            const res = await api.get(`/chat/get-televenta-contact.php?client_code=${encodeURIComponent(clientCode)}`);
            if (res && res.whatsapp_url) {
                window.open(res.whatsapp_url, '_blank');
                return;
            }
        } catch (e) {
            console.warn('Fallback to default televenta whatsapp', e);
        }
        const fallbackPhone = '522221427848';
        const msg = `¡Hola! Soy cliente de UM6 SHOP (${user?.client_code || ''}). Solicito apoyo con mi pedido.`;
        window.open(`https://wa.me/${fallbackPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    const loadData = async () => {
        try {
            let storedClientCode = user?.client_code || '';
            if (!storedClientCode) {
                try {
                    const savedUser = JSON.parse(localStorage.getItem('user') || 'null');
                    storedClientCode = savedUser?.client_code || '';
                } catch (_) {}
            }

            const [productsRes, brandsRes, balanceRes, ordersRes] = await Promise.all([
                api.get(`/products/list.php?limit=2000&client_code=${encodeURIComponent(storedClientCode)}&_t=${Date.now()}`).catch(err => {
                    console.error('Error cargando productos:', err);
                    return { success: false, data: [] };
                }),
                api.get('/brands/list.php').catch(err => {
                    console.error('Error cargando marcas:', err);
                    return { success: false, data: [] };
                }),
                pointsService.getBalance('').catch(() => ({ balance: 0 })),
                api.get('/orders/list.php').catch(() => ({ data: [] }))
            ]);

            const loadedProducts = (productsRes?.success && Array.isArray(productsRes.data)) ? productsRes.data : [];
            if (productsRes?.success && Array.isArray(productsRes.data)) {
                setProducts(loadedProducts);
            }
            if (brandsRes?.success && Array.isArray(brandsRes.data)) {
                const visibleBrands = loadedProducts.length > 0
                    ? brandsRes.data.filter(b => loadedProducts.some(p => matchProductToBrand(p, [b]) === b.name))
                    : brandsRes.data;
                setBrands(visibleBrands);
            }
            if (balanceRes && typeof balanceRes.balance !== 'undefined') {
                setPointsBalance(Number(balanceRes.balance) || 0);
            }
            if (ordersRes?.data && Array.isArray(ordersRes.data)) {
                setRecentOrder(ordersRes.data[0] || null);
                const counts = {};
                ordersRes.data.forEach(order => {
                    (order.items || []).forEach(it => {
                        if (it.sku) {
                            counts[it.sku] = (counts[it.sku] || 0) + (Number(it.quantity) || 1);
                        }
                    });
                });
                const sortedSkus = Object.entries(counts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([sku]) => sku);
                setFrequentSkus(sortedSkus);
            }
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Centrar horizontalmente una marca en el carrusel sin afectar el scroll vertical
    const scrollBrandIntoCenter = useCallback((brandName) => {
        const container = mobileBrandsScrollRef.current;
        if (!container || !brandName) return;
        const btn = container.querySelector(`[data-brand-pill="${CSS.escape(brandName)}"]`);
        if (!btn) return;
        const targetLeft = btn.offsetLeft - (container.clientWidth / 2) + (btn.clientWidth / 2);
        container.scrollTo({
            left: Math.max(0, targetLeft),
            behavior: 'smooth'
        });
    }, []);

    // Detectar qué marca se está viendo al bajar por los productos en el teléfono
    useEffect(() => {
        if (selectedBrand || showOnlyFrequents || brands.length === 0) {
            setActiveScrollBrand(null);
            lastCenteredBrandRef.current = null;
            return;
        }

        let ticking = false;
        const handleWindowScroll = () => {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(() => {
                ticking = false;
                const scrollY = window.scrollY || window.pageYOffset;
                if (scrollY < 120) {
                    if (lastCenteredBrandRef.current !== null) {
                        lastCenteredBrandRef.current = null;
                        setActiveScrollBrand(null);
                        if (mobileBrandsScrollRef.current) {
                            mobileBrandsScrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
                        }
                    }
                    return;
                }

                // 1. Buscar tarjeta de producto visible en la franja superior/media de la pantalla
                const cards = document.querySelectorAll('[data-product-brand]');
                let detectedBrand = null;
                const probeY = Math.min(260, window.innerHeight * 0.38);

                for (let i = 0; i < cards.length; i++) {
                    const rect = cards[i].getBoundingClientRect();
                    if (rect.bottom >= probeY && rect.top <= probeY + 180) {
                        const bName = cards[i].getAttribute('data-product-brand');
                        if (bName) {
                            detectedBrand = bName;
                            break;
                        }
                    }
                }

                // 2. Respaldo proporcional al avance del scroll si algún producto no tiene marca explícita
                if (!detectedBrand && brands.length > 0) {
                    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
                    const ratio = Math.min(1, Math.max(0, (scrollY - 120) / Math.max(1, maxScroll - 120)));
                    const idx = Math.min(brands.length - 1, Math.floor(ratio * brands.length));
                    detectedBrand = brands[idx]?.name || null;
                }

                if (detectedBrand && detectedBrand !== lastCenteredBrandRef.current) {
                    lastCenteredBrandRef.current = detectedBrand;
                    setActiveScrollBrand(detectedBrand);
                    scrollBrandIntoCenter(detectedBrand);
                }
            });
        };

        window.addEventListener('scroll', handleWindowScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleWindowScroll);
    }, [selectedBrand, showOnlyFrequents, brands, scrollBrandIntoCenter]);

    const handleAddToCart = async (product, qty = 1, presentation = null) => {
        const pres = presentation || getSelectedPresentation(product);
        const cartKey = getCartItemKey(product.sku, pres?.code || '');
        try {
            const parsed = parseInt(qty, 10);
            if (!isNaN(parsed) && parsed <= 0) {
                removeItem(cartKey);
                setQuantities(prev => {
                    const next = { ...prev };
                    delete next[cartKey];
                    return next;
                });
                return;
            }
            const finalQty = Math.max(1, isNaN(parsed) ? 1 : parsed);
            await setItemQuantity(product, finalQty, pres);
            setQuantities(prev => {
                const next = { ...prev };
                delete next[cartKey];
                return next;
            });
        } catch (error) {
            console.error('Error adding to cart:', error);
        }
    };

    const handleRemoveFromCart = (cartKey) => {
        removeItem(cartKey);
        setQuantities(prev => {
            const next = { ...prev };
            delete next[cartKey];
            return next;
        });
    };

    const updateQuantity = async (product, delta, presentation = null) => {
        const pres = presentation || getSelectedPresentation(product);
        const cartKey = getCartItemKey(product.sku, pres?.code || '');
        const cartItem = items.find(i => getCartItemKey(i) === cartKey);
        const cartQty = cartItem ? cartItem.quantity : 0;
        const currentDisplayed = quantities[cartKey] !== undefined ? (parseInt(quantities[cartKey], 10) || 0) : (cartQty > 0 ? cartQty : 1);
        const nextVal = currentDisplayed + delta;

        if (cartQty > 0) {
            if (nextVal <= 0) {
                removeItem(cartKey);
                setQuantities(prev => {
                    const next = { ...prev };
                    delete next[cartKey];
                    return next;
                });
            } else {
                setQuantities(prev => ({ ...prev, [cartKey]: nextVal }));
                await setItemQuantity(product, nextVal, pres);
                setQuantities(prev => {
                    const next = { ...prev };
                    delete next[cartKey];
                    return next;
                });
            }
        } else {
            setQuantities(prev => ({
                ...prev,
                [cartKey]: Math.max(1, nextVal)
            }));
        }
    };

    const setDirectQuantity = (cartKey, value) => {
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed) && parsed >= 0) {
            setQuantities(prev => ({ ...prev, [cartKey]: parsed }));
        } else if (value === '') {
            setQuantities(prev => ({ ...prev, [cartKey]: '' }));
        }
    };

    const normalizeQuantityOnBlur = async (product, presentation = null) => {
        const pres = presentation || getSelectedPresentation(product);
        const cartKey = getCartItemKey(product.sku, pres?.code || '');
        const raw = quantities[cartKey];
        if (raw === undefined) return;
        const val = parseInt(raw, 10);
        const cartItem = items.find(i => getCartItemKey(i) === cartKey);
        const cartQty = cartItem ? cartItem.quantity : 0;

        if (cartQty > 0) {
            if (!isNaN(val) && val <= 0) {
                removeItem(cartKey);
                setQuantities(prev => {
                    const next = { ...prev };
                    delete next[cartKey];
                    return next;
                });
            } else if (!isNaN(val) && val >= 1 && val !== cartQty) {
                await setItemQuantity(product, val, pres);
                setQuantities(prev => {
                    const next = { ...prev };
                    delete next[cartKey];
                    return next;
                });
            } else {
                setQuantities(prev => {
                    const next = { ...prev };
                    delete next[cartKey];
                    return next;
                });
            }
        } else {
            setQuantities(prev => ({
                ...prev,
                [sku]: (!isNaN(val) && val >= 1) ? val : 1
            }));
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const filteredProducts = products.filter(p => {
        const searchLower = search.toLowerCase().trim();
        const pName = String(p.name || '').toLowerCase();
        const pSku = String(p.sku || '').toLowerCase();
        const pDesc = String(p.description || '').toLowerCase();
        const pBrand = String(p.brand || '').toLowerCase().trim();

        // 1. Coincidencia por Búsqueda (Nombre, SKU, Descripción o Marca)
        const matchesSearch = !searchLower ||
            pName.includes(searchLower) ||
            pSku.includes(searchLower) ||
            pDesc.includes(searchLower) ||
            pBrand.includes(searchLower);

        // 2. Filtro de Frecuentes
        const matchesFrequent = !showOnlyFrequents || frequentSkus.includes(p.sku);
        if (!matchesFrequent) return false;

        // Si el usuario escribe en el buscador, la búsqueda por nombre/código/descripción/marca manda:
        // no tiene que ver que no tenga marca o qué marca esté seleccionada, encuentra todos los que coincidan
        if (searchLower) {
            return matchesSearch;
        }

        // Si NO está buscando por texto, aplicamos el filtro de la marca seleccionada
        if (!selectedBrand) return true;

        const sel = selectedBrand.toLowerCase().trim();
        if (pBrand) {
            if (pBrand === sel || pBrand.includes(sel) || sel.includes(pBrand)) return true;
        }
        const matchedBrand = matchProductToBrand(p, brands);
        if (matchedBrand && matchedBrand.toLowerCase() === sel) return true;
        return pName.includes(sel) || pDesc.includes(sel) || (sel.includes('xx') && (pName.includes('xx') || pName.includes('dos equis')));
    });

    const visibleProducts = filteredProducts.slice(0, visibleCount);

    // Reiniciar paginación progresiva al cambiar filtros
    useEffect(() => {
        setVisibleCount(36);
    }, [search, selectedBrand, showOnlyFrequents]);

    // Cargar más productos automáticamente al hacer scroll cerca del final
    useEffect(() => {
        const node = loadMoreRef.current;
        if (!node || visibleCount >= filteredProducts.length) return;
        if (typeof IntersectionObserver === 'undefined') return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) {
                    setVisibleCount((prev) => Math.min(filteredProducts.length, prev + 36));
                }
            },
            { rootMargin: '400px' }
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [visibleCount, filteredProducts.length]);

    const cartItemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const cartTotal = items.reduce((sum, item) => {
        const price = item.priceData?.unit_price || item.base_price;
        return sum + (price * item.quantity);
    }, 0);

    const renderBrandsCarousel = (scrollRef, isMobile = false) => (
        <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Botón Izquierda (visible también en móvil para que se vea que se puede mover) */}
            <button
                type="button"
                onClick={() => scrollRef.current?.scrollBy({ left: -180, behavior: 'smooth' })}
                aria-label="Marcas anteriores"
                className="flex bg-white/15 hover:bg-white/25 active:scale-95 p-1.5 sm:p-2 rounded-full text-white transition-all shrink-0 shadow-sm border border-white/20"
            >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Área deslizable de marcas */}
            <div
                ref={scrollRef}
                className="flex-1 flex items-center gap-2 sm:gap-2.5 overflow-x-auto scrollbar-hide py-1 px-1 snap-x snap-mandatory"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                <button
                    type="button"
                    onClick={() => { setSelectedBrand(null); setShowOnlyFrequents(false); }}
                    className={`shrink-0 snap-start flex items-center justify-center px-3.5 sm:px-5 h-12 sm:h-16 rounded-xl bg-white transition-all border-2 ${
                        !selectedBrand && !showOnlyFrequents
                            ? 'border-orange-500 shadow-md ring-2 ring-orange-500/20'
                            : 'border-transparent hover:border-gray-200'
                    }`}
                >
                    <span className={`font-bold text-[11px] sm:text-xs uppercase tracking-wider ${!selectedBrand && !showOnlyFrequents ? 'text-orange-600' : 'text-gray-600'}`}>
                        Todas
                    </span>
                </button>

                {frequentSkus.length > 0 && (
                    <button
                        type="button"
                        onClick={() => {
                            setShowOnlyFrequents(!showOnlyFrequents);
                            if (!showOnlyFrequents) setSelectedBrand(null);
                        }}
                        className={`shrink-0 snap-start flex flex-col items-center justify-center px-3 sm:px-4 h-12 sm:h-16 rounded-xl transition-all border-2 ${
                            showOnlyFrequents
                                ? 'bg-amber-50 border-amber-500 shadow-md ring-2 ring-amber-500/20 scale-105'
                                : 'bg-white border-transparent hover:border-amber-200'
                        }`}
                    >
                        <Sparkles className={`w-3.5 sm:w-4 h-3.5 sm:h-4 mb-0.5 ${showOnlyFrequents ? 'text-amber-600' : 'text-amber-500'}`} />
                        <span className={`text-[9px] sm:text-[11px] font-extrabold uppercase tracking-wider ${showOnlyFrequents ? 'text-amber-700' : 'text-gray-700'}`}>
                            Frecuentes
                        </span>
                    </button>
                )}

                {brands.map((brand) => {
                    const isSelected = selectedBrand === brand.name;
                    const isScrollActive = !selectedBrand && !showOnlyFrequents && activeScrollBrand === brand.name;
                    return (
                        <button
                            key={brand.id}
                            type="button"
                            data-brand-pill={brand.name}
                            onClick={() => {
                                setSelectedBrand(isSelected ? null : brand.name);
                                setShowOnlyFrequents(false);
                            }}
                            className={`shrink-0 snap-start flex flex-col items-center justify-center w-20 sm:w-28 h-12 sm:h-16 bg-white rounded-xl transition-all duration-300 border-2 relative overflow-hidden group ${
                                isSelected
                                    ? 'border-orange-500 shadow-md ring-2 ring-orange-500/30 z-10 scale-105'
                                    : isScrollActive
                                    ? 'border-amber-400 shadow-lg ring-2 ring-amber-300/50 z-10 scale-105 bg-amber-50/40'
                                    : 'border-transparent hover:border-gray-200 opacity-90 hover:opacity-100'
                            }`}
                        >
                            {isScrollActive && isMobile && (
                                <span className="absolute top-0 inset-x-0 bg-amber-500 text-white text-[8px] font-extrabold uppercase tracking-wider leading-tight py-0.5 text-center">
                                    Viendo
                                </span>
                            )}
                            <div className="w-16 sm:w-22 h-9 sm:h-12 flex items-center justify-center p-1">
                                <img
                                    src={resolveBrandLogoUrl(brand)}
                                    alt={brand.name}
                                    loading="lazy"
                                    decoding="async"
                                    className="max-w-full max-h-full object-contain transition-transform group-hover:scale-110"
                                    onError={(e) => {
                                        e.target.onerror = null;
                                        e.target.style.display = 'none';
                                        if (e.target.parentElement) {
                                            e.target.parentElement.innerText = brand.name;
                                            e.target.parentElement.className = "text-[10px] font-bold text-gray-600 text-center px-1 truncate";
                                        }
                                    }}
                                />
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Botón Derecha (visible también en móvil) */}
            <button
                type="button"
                onClick={() => scrollRef.current?.scrollBy({ left: 180, behavior: 'smooth' })}
                aria-label="Siguientes marcas"
                className="flex bg-white/15 hover:bg-white/25 active:scale-95 p-1.5 sm:p-2 rounded-full text-white transition-all shrink-0 shadow-sm border border-white/20"
            >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header Principal Sticky */}
            <header className="bg-gradient-to-r from-green-800 via-green-700 to-green-800 shadow-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-2 sm:px-4">
                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 py-2">
                        {/* Fila superior en móvil / Grupo izquierdo en PC */}
                        <div className="flex items-center justify-between md:justify-start gap-2 w-full md:w-auto shrink-0">
                            {/* Logo */}
                            <div className="flex items-center gap-2.5 shrink-0">
                                <div className="h-10 sm:h-11 w-auto flex items-center justify-center rounded-xl overflow-hidden shrink-0">
                                    <img src="/logo.png" alt="UM6" className="h-full w-auto object-contain" />
                                </div>
                                <span className="text-base sm:text-lg font-black text-white leading-tight tracking-wider uppercase">
                                    SHOP
                                </span>
                            </div>

                            {/* Botones de acción en Móvil */}
                            <div className="flex md:hidden items-center gap-1.5 shrink-0">
                                {pointsBalance !== null && (
                                    <button
                                        onClick={() => navigate('/points')}
                                        title="Ver mis puntos y premios"
                                        className="bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/40 text-amber-100 px-2 py-1 rounded-full transition-all flex items-center gap-1 text-[11px] font-extrabold shadow-sm"
                                    >
                                        <Trophy className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                                        <span>{pointsService.formatPoints(pointsBalance)}</span>
                                    </button>
                                )}

                                <button
                                    onClick={() => setAccountModal({ open: true, tab: 'phone' })}
                                    title="Mi Cuenta: Teléfono y Contraseña"
                                    className="bg-white/20 hover:bg-white/30 p-1.5 rounded-full transition-all text-white border border-white/30"
                                >
                                    <User className="w-4 h-4" />
                                </button>

                                <NotificationsBell onOpenChat={() => setIsChatOpen(true)} />

                                <button
                                    onClick={() => setIsCartOpen(true)}
                                    className="relative bg-white/20 hover:bg-white/30 backdrop-blur-sm p-1.5 rounded-full transition-all text-white border border-white/30"
                                >
                                    <ShoppingCart className="w-4 h-4" />
                                    {cartItemCount > 0 && (
                                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-bounce">
                                            {cartItemCount}
                                        </span>
                                    )}
                                </button>

                                <button
                                    onClick={handleLogout}
                                    title="Cerrar sesión"
                                    className="bg-red-500/20 hover:bg-red-500/30 p-1.5 rounded-full transition-all text-white border border-red-400/30"
                                >
                                    <LogOut className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        {/* En PC / Tableta (md+): Botones de Opción de Navegación integrados en la barra superior */}
                        <div className="hidden md:flex items-center gap-1 bg-black/20 p-1 rounded-full border border-white/15 shrink-0">
                            {SHOP_NAV_ITEMS.map(item => {
                                const Icon = item.icon;
                                const active = location.pathname === item.path;
                                return (
                                    <button
                                        key={item.path}
                                        type="button"
                                        onClick={() => navigate(item.path)}
                                        title={item.label}
                                        className={`flex items-center gap-1.5 px-2 lg:px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                                            active
                                                ? 'bg-white text-green-800 shadow-sm'
                                                : 'text-white/90 hover:text-white hover:bg-white/10'
                                        }`}
                                    >
                                        <Icon className="w-3.5 h-3.5 shrink-0" />
                                        <span className="hidden xl:inline">{item.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Buscador */}
                        <div className="w-full md:flex-1 md:max-w-xs lg:max-w-md md:mx-auto min-w-0">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-700 pointer-events-none" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        if (e.target.value.trim()) {
                                            setSelectedBrand(null);
                                        }
                                    }}
                                    placeholder="Buscar cerveza o SKU por nombre o marca..."
                                    className="w-full bg-white/95 focus:bg-white rounded-full pl-9 pr-8 py-1.5 text-xs sm:text-sm text-gray-800 placeholder-green-700/50 focus:outline-none focus:ring-2 focus:ring-green-400 shadow-inner transition-all"
                                />
                                {search && (
                                    <button
                                        type="button"
                                        onClick={() => setSearch('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full p-1 transition-colors"
                                        title="Limpiar búsqueda"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Acciones en PC / Tableta (md+) */}
                        <div className="hidden md:flex items-center gap-1.5 lg:gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setAccountModal({ open: true, tab: 'phone' })}
                                title="Editar mi teléfono o cambiar contraseña"
                                className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white px-2 lg:px-2.5 py-1.5 rounded-full border border-white/25 transition-all"
                            >
                                <User className="w-4 h-4 shrink-0" />
                                <div className="hidden lg:flex flex-col items-start leading-none text-left">
                                    <span className="font-bold text-xs">{user?.client_code}</span>
                                    <span className="text-[9px] text-green-100">Mi Cuenta</span>
                                </div>
                            </button>

                            {pointsBalance !== null && (
                                <button
                                    onClick={() => navigate('/points')}
                                    title="Ver mis puntos y premios"
                                    className="bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/40 text-amber-100 px-2 lg:px-2.5 py-1.5 rounded-full transition-all flex items-center gap-1 text-xs font-extrabold shadow-sm"
                                >
                                    <Trophy className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                                    <span>{pointsService.formatPoints(pointsBalance)}</span>
                                    <span className="hidden xl:inline text-[10px] font-semibold opacity-90">pts</span>
                                </button>
                            )}

                            <NotificationsBell onOpenChat={() => setIsChatOpen(true)} />

                            <button
                                onClick={() => setIsCartOpen(true)}
                                className="relative bg-white/20 hover:bg-white/30 backdrop-blur-sm px-2.5 lg:px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 text-white border border-white/30"
                            >
                                <ShoppingCart className="w-4 h-4" />
                                <span className="hidden lg:inline">
                                    {showPrices ? (
                                        <span className="text-xs font-bold">${cartTotal.toFixed(2)}</span>
                                    ) : (
                                        <span className="text-xs font-bold">
                                            {cartItemCount > 0 ? `${cartItemCount} prod.` : 'Solicitud'}
                                        </span>
                                    )}
                                </span>
                                {cartItemCount > 0 && (
                                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-bounce">
                                        {cartItemCount}
                                    </span>
                                )}
                            </button>

                            {cartItemCount > 0 && (
                                <button
                                    type="button"
                                    onClick={() => navigate('/checkout')}
                                    className="bg-amber-400 hover:bg-amber-300 text-green-950 font-black text-xs px-3.5 py-1.5 rounded-full shadow-md transition-all flex items-center gap-1.5 active:scale-95"
                                >
                                    <span>Continuar Compra</span>
                                    <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                                </button>
                            )}

                            <button
                                onClick={handleLogout}
                                title="Cerrar sesión"
                                className="bg-red-500/20 hover:bg-red-500/30 p-1.5 rounded-full transition-all text-white border border-red-400/30"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* En Teléfono (< md): Barra de Marcas Sticky que va cambiando conforme bajas por los productos */}
                <div className="md:hidden bg-green-900/90 backdrop-blur-md border-t border-white/10 py-1.5 px-2">
                    <div className="flex items-center justify-between text-[10px] text-green-100 px-1 mb-1">
                        <span className="font-semibold flex items-center gap-1">
                            <span>🍺 Filtra por marca:</span>
                            {selectedBrand ? (
                                <span className="bg-orange-500 text-white font-bold px-1.5 py-0.2 rounded-full">
                                    {selectedBrand} ✕
                                </span>
                            ) : activeScrollBrand ? (
                                <span className="text-amber-300 font-bold">
                                    Viendo {activeScrollBrand}
                                </span>
                            ) : (
                                <span className="opacity-80">Toca una marca</span>
                            )}
                        </span>
                        <span className="opacity-80 font-medium">Desliza ↔</span>
                    </div>
                    {renderBrandsCarousel(mobileBrandsScrollRef, true)}
                </div>
            </header>

            {/* En PC (md+): Barra de Marcas debajo del header (no sticky para no quitar espacio de pantalla al bajar) */}
            <div className="hidden md:block bg-gradient-to-r from-green-800 via-green-700 to-green-800 border-t border-white/10 shadow-sm py-2.5">
                <div className="max-w-7xl mx-auto px-4">
                    {renderBrandsCarousel(desktopBrandsScrollRef, false)}
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 mt-4 sm:mt-6 mb-6">
                <PromoBanner />
            </div>

            {/* Contenido Principal */}
            <div className="relative min-h-[calc(100vh-200px)]">
                <div
                    className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
                    }}
                />

                <main className="relative max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-6 z-10">
                    <div className="flex gap-4 sm:gap-8 flex-col lg:flex-row">
                        {/* Sidebar / Información del Cliente */}
                        <aside className="w-full lg:w-64 shrink-0 space-y-4 lg:space-y-6">
                            <RecentOrders
                                initialOrder={recentOrder}
                                externalLoading={loading}
                                onRepeatOrder={(item) => handleAddToCart(item, item.quantity)}
                                onOpenCart={() => setIsCartOpen(true)}
                            />

                            {/* Tarjeta Mi Información con botones para editar teléfono y cambiar contraseña */}
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                                <div className="flex items-center justify-between mb-3 px-1 border-b border-gray-100 pb-2">
                                    <h3 className="flex items-center gap-2 font-bold text-gray-800">
                                        <User className="w-5 h-5 text-green-600" />
                                        <span>Mi Información</span>
                                    </h3>
                                    <button
                                        type="button"
                                        onClick={() => setAccountModal({ open: true, tab: 'phone' })}
                                        className="text-xs font-bold text-green-700 hover:text-green-800 flex items-center gap-1 bg-green-50 hover:bg-green-100 px-2 py-1 rounded-lg transition-colors"
                                    >
                                        <Edit3 className="w-3 h-3" />
                                        <span>Editar</span>
                                    </button>
                                </div>

                                <div className="space-y-3 text-sm">
                                    <div>
                                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Cliente</p>
                                        <p className="font-bold text-gray-800 text-base">{user?.business_name || user?.name || 'Cliente'}</p>
                                        <p className="text-xs text-green-600 font-medium">#{user?.client_code}</p>
                                    </div>

                                    <div>
                                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Dirección</p>
                                        <p className="text-gray-600 leading-snug text-xs sm:text-sm">
                                            {user?.address || 'Sin dirección registrada'}
                                            {user?.colonia ? `, Col. ${user.colonia}` : ''}
                                            {user?.city ? `, ${user.city}` : ''}
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-between gap-2">
                                        <div>
                                            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Teléfono</p>
                                            <p className="text-gray-700 font-mono font-semibold">
                                                {user?.phone || 'Sin teléfono'}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setAccountModal({ open: true, tab: 'phone' })}
                                            className="text-xs text-green-700 hover:underline font-semibold flex items-center gap-1"
                                        >
                                            <Phone className="w-3 h-3" />
                                            <span>Cambiar</span>
                                        </button>
                                    </div>

                                    {/* Botones de Acción Directa para Teléfono y Contraseña */}
                                    <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setAccountModal({ open: true, tab: 'phone' })}
                                            className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-green-50 hover:bg-green-100 text-green-800 font-bold text-xs transition-colors border border-green-200/60"
                                        >
                                            <Phone className="w-3.5 h-3.5 shrink-0" />
                                            <span>Mi Teléfono</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setAccountModal({ open: true, tab: 'password' })}
                                            className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs transition-colors border border-amber-200/60"
                                        >
                                            <Lock className="w-3.5 h-3.5 shrink-0" />
                                            <span>Contraseña</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </aside>

                        {/* Grid de Productos */}
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
                                        <>
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-4"
                                        >
                                            {visibleProducts.map((product, index) => {
                                                const presentations = Array.isArray(product.presentations) ? product.presentations : [];
                                                const selectedPres = getSelectedPresentation(product);
                                                const cartKey = getCartItemKey(product.sku, selectedPres?.code || '');
                                                const cartItem = items.find(i => getCartItemKey(i) === cartKey);
                                                const cartQty = cartItem ? cartItem.quantity : 0;
                                                const rawQty = quantities[cartKey];
                                                const qty = rawQty !== undefined ? rawQty : (cartQty > 0 ? cartQty : 1);
                                                const parsedQty = parseInt(qty, 10);
                                                const numericQty = isNaN(parsedQty) ? (cartQty > 0 ? 0 : 1) : parsedQty;
                                                const isEditingNewPositiveQty = cartQty > 0 && rawQty !== undefined && numericQty > 0 && numericQty !== cartQty;
                                                const price = selectedPres ? selectedPres.unit_price : (product.priceData?.unit_price || product.base_price);
                                                const originalPrice = selectedPres ? selectedPres.original_price : product.base_price;
                                                const isRealPromo = product.priceData?.breakdown?.promos && product.priceData.breakdown.promos.length > 0;
                                                const isSpecialPrice = product.priceData?.breakdown?.special_price;
                                                const isFrequent = frequentSkus.includes(product.sku);
                                                const productBrandName = product.brand || matchProductToBrand(product, brands) || '';
                                                const showSubUnitOverlay = selectedPres && Number(selectedPres.divisor) > 1;

                                                return (
                                                    <ProductCard3D
                                                        key={product.id}
                                                        product={product}
                                                        productBrandName={productBrandName}
                                                        presentations={presentations}
                                                        selectedPres={selectedPres}
                                                        cartKey={cartKey}
                                                        cartQty={cartQty}
                                                        qty={qty}
                                                        numericQty={numericQty}
                                                        isEditingNewPositiveQty={isEditingNewPositiveQty}
                                                        price={price}
                                                        originalPrice={originalPrice}
                                                        isRealPromo={isRealPromo}
                                                        isSpecialPrice={isSpecialPrice}
                                                        isFrequent={isFrequent}
                                                        showPrices={showPrices}
                                                        showSubUnitOverlay={showSubUnitOverlay}
                                                        imageUrl={resolveProductImageUrl(product)}
                                                        placeholderSvg={PRODUCT_PLACEHOLDER_SVG}
                                                        apiUrl={API_URL}
                                                        onSelectPresentation={(sku, code) =>
                                                            setSelectedPresentations(prev => ({ ...prev, [sku]: code }))
                                                        }
                                                        onUpdateQuantity={updateQuantity}
                                                        onSetDirectQuantity={setDirectQuantity}
                                                        onNormalizeQuantityOnBlur={normalizeQuantityOnBlur}
                                                        onAddToCart={handleAddToCart}
                                                        onRemoveFromCart={handleRemoveFromCart}
                                                    />
                                                );
                                            })}
                                        </motion.div>
                                        {visibleCount < filteredProducts.length && (
                                            <div ref={loadMoreRef} className="mt-8 flex flex-col items-center justify-center py-4">
                                                <button
                                                    type="button"
                                                    onClick={() => setVisibleCount((prev) => Math.min(filteredProducts.length, prev + 36))}
                                                    className="px-6 py-2.5 bg-white hover:bg-green-50 text-green-800 font-bold text-xs sm:text-sm rounded-full shadow-sm border border-green-200 transition-all"
                                                >
                                                    Mostrar más productos ({visibleCount} de {filteredProducts.length})
                                                </button>
                                            </div>
                                        )}
                                        </>
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
                                                onClick={() => { setSearch(''); setSelectedBrand(null); setShowOnlyFrequents(false); }}
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

                {/* Barra flotante de "Continuar Compra" cuando hay productos seleccionados */}
                <AnimatePresence>
                    {cartItemCount > 0 && (
                        <motion.div
                            initial={{ y: 80, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 80, opacity: 0 }}
                            transition={{ type: 'spring', damping: 24, stiffness: 260 }}
                            className="fixed bottom-16 md:bottom-4 left-0 right-0 z-[55] px-2.5 sm:px-6 pb-2 md:pb-0 pointer-events-none"
                        >
                            <div className="max-w-3xl mx-auto bg-gradient-to-r from-green-900 via-green-800 to-green-900 text-white rounded-2xl shadow-2xl border border-green-500/40 p-2.5 sm:px-5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4 pointer-events-auto backdrop-blur-md">
                                <button
                                    type="button"
                                    onClick={() => setIsCartOpen(true)}
                                    className="flex items-center gap-2.5 text-left hover:bg-white/10 px-2 py-1 rounded-xl transition-colors min-w-0"
                                    title="Ver detalle del carrito"
                                >
                                    <div className="relative bg-white/15 p-2 rounded-xl shrink-0 border border-white/20">
                                        <ShoppingCart className="w-5 h-5 text-amber-300" />
                                        <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow">
                                            {items.length}
                                        </span>
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[11px] sm:text-xs text-green-200 font-semibold truncate">
                                            {items.length} {items.length === 1 ? 'producto' : 'productos'} ({cartItemCount} pzas)
                                        </div>
                                        {showPrices ? (
                                            <div className="text-sm sm:text-base font-black text-white leading-tight">
                                                Total: ${cartTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                        ) : (
                                            <div className="text-xs sm:text-sm font-extrabold text-amber-300 leading-tight underline decoration-amber-300/50">
                                                Ver resumen
                                            </div>
                                        )}
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => navigate('/checkout')}
                                    className="bg-amber-400 hover:bg-amber-300 active:scale-95 text-green-950 font-black text-xs sm:text-sm px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center gap-1.5 sm:gap-2 shrink-0"
                                >
                                    <span>Continuar Compra</span>
                                    <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Botón flotante de Soporte Televenta (Solo ícono de WhatsApp) */}
                <div className={`fixed ${cartItemCount > 0 ? 'bottom-24 md:bottom-5' : 'bottom-20 md:bottom-5'} right-3 sm:right-5 z-[60] flex flex-col items-end gap-3 transition-all duration-300`}>
                    <button
                        type="button"
                        onClick={handleOpenTeleventaWhatsApp}
                        aria-label="WhatsApp Televenta"
                        title="Contactar a mi asesor de Televenta por WhatsApp"
                        className="w-12 h-12 sm:w-13 sm:h-13 flex items-center justify-center bg-[#25D366] hover:bg-[#1ebe5d] text-white rounded-full shadow-2xl shadow-emerald-900/35 transition-all transform hover:scale-110 active:scale-95 border-2 border-white/80"
                    >
                        <svg viewBox="0 0 32 32" className="w-6 h-6 sm:w-7 sm:h-7 fill-current" aria-hidden="true">
                            <path d="M16.004 3.2c-7.06 0-12.8 5.74-12.8 12.8 0 2.256.59 4.458 1.71 6.396L3.2 28.8l6.58-1.69a12.76 12.76 0 0 0 6.224 1.61h.006c7.058 0 12.796-5.74 12.796-12.8 0-3.42-1.332-6.634-3.75-9.052A12.716 12.716 0 0 0 16.004 3.2zm0 23.36h-.005a10.62 10.62 0 0 1-5.414-1.482l-.388-.23-3.904 1.004 1.042-3.806-.252-.402a10.59 10.59 0 0 1-1.628-5.644c0-5.864 4.772-10.636 10.64-10.636 2.842 0 5.512 1.108 7.52 3.118a10.57 10.57 0 0 1 3.116 7.522c0 5.864-4.772 10.636-10.637 10.636zm5.834-7.968c-.32-.16-1.894-.934-2.186-1.04-.294-.108-.508-.16-.722.16-.214.32-.828 1.04-1.014 1.254-.186.214-.374.24-.694.08-.32-.16-1.352-.498-2.574-1.588-.952-.85-1.594-1.898-1.78-2.218-.186-.32-.02-.494.14-.654.144-.144.32-.374.48-.56.16-.188.214-.32.32-.534.108-.214.054-.4-.026-.56-.08-.16-.722-1.738-.988-2.38-.26-.624-.524-.54-.722-.55l-.614-.01c-.214 0-.56.08-.854.4-.294.32-1.12 1.096-1.12 2.672 0 1.576 1.148 3.1 1.308 3.314.16.214 2.26 3.452 5.474 4.84.764.33 1.36.528 1.826.676.768.244 1.466.21 2.018.128.616-.092 1.894-.774 2.16-1.522.268-.748.268-1.388.188-1.522-.08-.134-.294-.214-.614-.374z" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Cart Drawer */}
            <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />

            {/* Modal de Cuenta (Teléfono y Contraseña) */}
            <AccountModal
                isOpen={accountModal.open}
                initialTab={accountModal.tab}
                onClose={() => setAccountModal(prev => ({ ...prev, open: false }))}
            />
        </div>
    );
}
