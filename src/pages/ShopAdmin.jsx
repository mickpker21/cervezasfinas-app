import React, { useState, useEffect, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, API_URL, getShopAuthHeaders } from '../lib/api';
import { supabase } from '@/supabaseClient';
import {
    Package, Tag, DollarSign, Gift, Check, X, Edit, Trash2, Plus, Save, RefreshCw,
    Users, Award, ShoppingCart, Sparkles, Image, TrendingUp, Search, User, Map as MapIcon, MapPin, Globe,
    FileText, FileCheck, Download,
    Upload, Phone, Eye, EyeOff, LayoutGrid, Layers, Bell, Coins, Camera, MessageSquare, ExternalLink, ShieldCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { kvStorage } from '@/services/kvStorage';
import { getProductImageUrl, PRODUCT_IMAGES } from '@/lib/imageCatalog';
import ZonasRutasCatalogDialog from '@/components/admin/users/ZonasRutasCatalogDialog';

const TeleventaShopOrders = lazy(() => import('./TeleventaShopOrders'));
const TeleventaCoolerExecutions = lazy(() => import('./TeleventaCoolerExecutions'));
const TeleventaRedemptions = lazy(() => import('./TeleventaRedemptions'));
const AdminPointsConfig = lazy(() => import('./AdminPointsConfig'));
const SupervisorClientPoints = lazy(() => import('./SupervisorClientPoints'));
const AdminSkuImagesPage = lazy(() => import('./AdminSkuImagesPage'));
const AdminBrandsPage = lazy(() => import('./AdminBrandsPage'));
const AdminPushBroadcastPage = lazy(() => import('./AdminPushBroadcastPage'));
const PriceUploadPage = lazy(() => import('./admin/PriceUploadPage'));
const LoyaltyAuditDashboard = lazy(() => import('./LoyaltyAuditDashboard'));
const ShopZoneVisibilityPanel = lazy(() => import('../components/admin/ShopZoneVisibilityPanel'));


// ============================================================================
// COMPONENTES AUXILIARES OPTIMIZADOS
// ============================================================================

const SearchBar = ({ value, onChange, placeholder }) => (
    <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
            type="text"
            placeholder={placeholder || "Buscar..."}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-white pl-10 pr-4 py-1.5 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all text-sm"
        />
    </div>
);

const normalizeShopImageUrl = (raw) => {
    if (!raw || typeof raw !== 'string') return '';
    let url = raw.trim();
    if (!url || url === '/placeholder.svg') return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
        return url;
    }
    url = url.startsWith('/') ? url : '/' + url;
    if (url.startsWith('/assets/cooler_refs/')) {
        return 'https://cervezasfinas.com/api' + url;
    }
    if (url.startsWith('/assets/products/')) {
        return 'https://cervezasfinas.com/api/shop' + url;
    }
    if (url.startsWith('/banners/') || url.startsWith('/uploads/') || url.startsWith('/api/') || url.startsWith('/portafolio/')) {
        return 'https://cervezasfinas.com' + url;
    }
    return url;
};

const SmartImage = ({ src, alt, fit = 'cover', fallbackIcon: FallbackIcon = Package, className = '', sku = null }) => {
    const candidates = React.useMemo(() => {
        const list = [];
        const add = (u) => {
            const norm = normalizeShopImageUrl(u);
            if (norm && !list.includes(norm)) list.push(norm);
        };
        if (src) add(src);
        if (sku) {
            const cleanSku = String(sku).trim();
            add(`https://cervezasfinas.com/portafolio/${encodeURIComponent(cleanSku)}.png`);
            add(`${API_URL}/products/image.php?sku=${encodeURIComponent(cleanSku)}&_v=2`);
            const staticUrl = getProductImageUrl(cleanSku);
            if (staticUrl && staticUrl !== '/placeholder.svg') add(staticUrl);
        }
        return list;
    }, [src, sku]);

    const [attempt, setAttempt] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setAttempt(0);
        setLoading(true);
    }, [src, sku]);

    const imageUrl = candidates[attempt] || '';

    if (!imageUrl) {
        return (
            <div className={`flex items-center justify-center bg-gray-800 ${className}`}>
                <FallbackIcon className="w-1/2 h-1/2 text-gray-600" />
            </div>
        );
    }

    return (
        <img
            src={imageUrl}
            alt={alt}
            loading="lazy"
            decoding="async"
            className={`${fit === 'cover' ? 'object-cover' : 'object-contain'} ${loading ? 'opacity-0' : 'opacity-100'} transition-opacity ${className}`}
            onError={() => {
                if (attempt + 1 < candidates.length) {
                    setAttempt(prev => prev + 1);
                } else {
                    setAttempt(candidates.length);
                }
            }}
            onLoad={() => setLoading(false)}
        />
    );
};

const ModernModal = ({ isOpen, onClose, title, subtitle, size = 'medium', children }) => {
    if (!isOpen) return null;

    const sizeClasses = {
        small: 'sm:max-w-md',
        medium: 'sm:max-w-2xl',
        large: 'sm:max-w-4xl'
    };

    const modalNode = (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm overflow-y-auto"
            onClick={onClose}
        >
            <div
                className={`bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 w-full max-w-[96vw] ${sizeClasses[size] || 'sm:max-w-2xl'} max-h-[90dvh] flex flex-col overflow-hidden my-auto`}
                onClick={e => e.stopPropagation()}
            >
                <div className="shrink-0 bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-800 px-5 py-4 z-10">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="text-lg sm:text-xl font-bold text-white truncate">{title}</h2>
                            {subtitle && <p className="text-gray-400 text-xs sm:text-sm mt-0.5">{subtitle}</p>}
                        </div>
                        <button type="button" onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 shrink-0">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                <div className="overflow-y-auto flex-1">
                    {children}
                </div>
            </div>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
};

const EmptyState = ({ icon: Icon, title, description }) => (
    <div className="col-span-full text-center py-16 bg-gray-800/30 rounded-2xl border border-gray-700 border-dashed">
        <Icon className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400 text-lg">{title}</p>
        {description && <p className="text-gray-600 text-sm mt-1">{description}</p>}
    </div>
);

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function ShopAdmin() {
    const location = useLocation();
    const navigate = useNavigate();

    // Estados
    const [activeTab, setActiveTab] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('tab') || 'overview';
    });
    const [activeCategory, setActiveCategory] = useState('all');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [productsList, setProductsList] = useState([]);
    const [editingItem, setEditingItem] = useState(null);
    const [showBulkUpload, setShowBulkUpload] = useState(false);
    const [uploadStats, setUploadStats] = useState(null);
    const [showPrices, setShowPrices] = useState(false);
    const [togglingPrices, setTogglingPrices] = useState(false);
    const [showClientPassword, setShowClientPassword] = useState(false);
    const [overviewStats, setOverviewStats] = useState({
        products: 0,
        clients: 0,
        promotions: 0,
        pendingRedemptions: 0,
        rewards: 0,
        banners: 0
    });

    const handleBulkUpload = async (file) => {
        try {
            const formData = new FormData();
            formData.append('csv', file);
            
                        const res = await fetch(`${API_URL}/admin/clients-bulk-upload.php`, {
                method: 'POST',
                body: formData,
                headers: await getShopAuthHeaders()
            }).then(r => r.json());

            if (res.success) {
                setUploadStats(res.stats);
                loadData();
            } else {
                alert('Error en carga: ' + (res.error || 'Error desconocido'));
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('Error crítico en la subida');
        }
    };
    const [newItem, setNewItem] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [skuSearchTerm, setSkuSearchTerm] = useState('');
    const [showSelectedSkus, setShowSelectedSkus] = useState(false);

    // Estados para Sincronización, Excel Comparativo y Coherencia de Zonas/Rutas con `zonas_rutas` (Supabase)
    const [syncingMasterSkus, setSyncingMasterSkus] = useState(false);
    const [syncProgressText, setSyncProgressText] = useState('');
    const [downloadingExcel, setDownloadingExcel] = useState(false);
    const [selectedZoneFilter, setSelectedZoneFilter] = useState('all');
    const [quickZoneModalItem, setQuickZoneModalItem] = useState(null);
    const [quickZoneSelected, setQuickZoneSelected] = useState([]);
    const [availableShopZones, setAvailableShopZones] = useState([]);
    const [zonesRoutesMap, setZonesRoutesMap] = useState({});
    const [allOfficialRoutes, setAllOfficialRoutes] = useState([]);
    const [serverPortafolioSkus, setServerPortafolioSkus] = useState({});
    const [isZonasCatalogOpen, setIsZonasCatalogOpen] = useState(false);
    const [televentaRouteZoneFilter, setTeleventaRouteZoneFilter] = useState('all');
    const [shopBrandsList, setShopBrandsList] = useState([]);
    const [selectedBrandFilter, setSelectedBrandFilter] = useState('all');

    // Cargar Marcas Oficiales de la Tienda desde shop_brands
    const loadShopBrands = async () => {
        try {
            const res = await api.get('/brands/list.php?all=true').catch(() => null);
            if (res && res.success && Array.isArray(res.data)) {
                setShopBrandsList(res.data);
                return;
            }
            const fallback = await fetch('/api/shop/brands/list.php?all=true').then(r => r.json()).catch(() => null);
            if (fallback && fallback.success && Array.isArray(fallback.data)) {
                setShopBrandsList(fallback.data);
            }
        } catch (e) {
            console.error('Error loading shop brands:', e);
        }
    };

    // Cargar Zonas y Rutas Oficiales desde `zonas_rutas` de Supabase (misma fuente que la aplicación principal)
    const loadOfficialZonesAndRoutes = async () => {
        try {
            let zrRows = [];
            const { data: zrData, error: zrErr } = await supabase
                .from('zonas_rutas')
                .select('id, zona, ruta, tipo_ruta')
                .order('zona', { ascending: true });

            if (!zrErr && Array.isArray(zrData)) {
                zrRows = zrData;
            } else {
                const { data: fbData } = await supabase
                    .from('zonas_rutas')
                    .select('id, zona, ruta')
                    .order('zona', { ascending: true });
                if (Array.isArray(fbData)) zrRows = fbData;
            }

            const zSet = new Set();
            const mapByZone = {};
            const routesArr = [];
            const seenRouteKey = new Set();

            zrRows.forEach(r => {
                const zName = String(r.zona || '').trim().toUpperCase();
                const rName = String(r.ruta || '').trim().toUpperCase();
                const rType = String(r.tipo_ruta || 'VENTAS').trim().toUpperCase();
                if (zName) {
                    zSet.add(zName);
                    if (!mapByZone[zName]) {
                        mapByZone[zName] = { ventas: [], entrega: [], allRoutes: [] };
                    }
                    if (rName) {
                        if (!mapByZone[zName].allRoutes.includes(rName)) {
                            mapByZone[zName].allRoutes.push(rName);
                        }
                        if (rType === 'ENTREGA') {
                            if (!mapByZone[zName].entrega.includes(rName)) mapByZone[zName].entrega.push(rName);
                        } else {
                            if (!mapByZone[zName].ventas.includes(rName)) mapByZone[zName].ventas.push(rName);
                        }
                    }
                }
                if (rName) {
                    const key = `${zName}::${rName}`;
                    if (!seenRouteKey.has(key)) {
                        seenRouteKey.add(key);
                        routesArr.push({ ruta: rName, zona: zName || 'SIN ZONA', tipo_ruta: rType });
                    }
                }
            });

            // También consultar el backend por si hay zonas adicionales en clients o ventas_por_sku
            try {
                const resZ = await api.get('/admin/products-manage.php?action=zones');
                if (resZ?.success && Array.isArray(resZ.data)) {
                    resZ.data.forEach(z => {
                        const clean = String(z || '').trim().toUpperCase();
                        if (clean) zSet.add(clean);
                    });
                }
            } catch (_) {}


            const sortedZones = Array.from(zSet).sort((a, b) => a.localeCompare(b, 'es'));
            Object.keys(mapByZone).forEach(z => {
                mapByZone[z].allRoutes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                mapByZone[z].ventas.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                mapByZone[z].entrega.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            });
            routesArr.sort((a, b) => a.zona.localeCompare(b.zona, 'es') || a.ruta.localeCompare(b.ruta, undefined, { numeric: true }));

            setAvailableShopZones(sortedZones);
            setZonesRoutesMap(mapByZone);
            setAllOfficialRoutes(routesArr);
        } catch (err) {
            console.error('Error cargando zonas_rutas:', err);
        }
    };

    const handleSyncAllFromSkuImages = async () => {
        if (!window.confirm("¿Deseas pasar todos los códigos, nombres, imágenes y descripciones de 'Fotos SKUs' al catálogo de la Shop? Los productos ya existentes mantendrán su precio base.")) {
            return;
        }
        setSyncingMasterSkus(true);
        setSyncProgressText('Consultando SKUs maestros...');
        try {
            const { data: skus, error: sbErr } = await supabase
                .from('sku_descripcion')
                .select('*')
                .order('cve_marca', { ascending: true });

            if (sbErr) throw new Error("Error consultando Fotos SKUs: " + sbErr.message);
            if (!skus || skus.length === 0) throw new Error("No se encontraron registros en la base maestra de Fotos de SKU.");

            const token = (await supabase.auth.getSession()).data.session?.access_token;
            const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};

            // 1. Intentar sincronización masiva directa (sync_skus)
            let bulkDone = false;
            try {
                const res = await fetch(`${API_URL}/admin/products-manage.php`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...authHeaders
                    },
                    body: JSON.stringify({
                        action: 'sync_skus',
                        items: skus
                    })
                });
                const json = await res.json();
                if (res.ok && json && json.success) {
                    bulkDone = true;
                    alert(json.message || `¡Éxito! Se pasaron los productos de Fotos SKU al catálogo de la Shop.`);
                }
            } catch (_) {}

            // 2. Fallback automático por FormData (action='create' / 'update') si el servidor tiene versión anterior de products-manage.php
            if (!bulkDone) {
                setSyncProgressText('Verificando catálogo actual...');
                const currentRes = await api.get('/admin/products-manage.php').catch(() => ({ data: [] }));
                const existingProducts = Array.isArray(currentRes?.data) ? currentRes.data : (Array.isArray(data) ? data : []);
                const existingMap = new Map();
                existingProducts.forEach(p => {
                    if (p.sku) existingMap.set(String(p.sku).trim().toUpperCase(), p);
                });

                const toCreate = [];
                const toUpdate = [];
                skus.forEach(item => {
                    const skuCode = String(item.cve_marca ?? item.sku ?? '').trim();
                    const desc = String(item.descripcion ?? item.name ?? '').trim();
                    if (!skuCode) return;
                    const upper = skuCode.toUpperCase();
                    const found = existingMap.get(upper);
                    if (!found) {
                        toCreate.push({ sku: skuCode, name: desc || `SKU ${skuCode}` });
                    } else if ((!found.name || found.name === found.sku) && desc) {
                        toUpdate.push({ ...found, name: desc, description: desc });
                    }
                });

                let createdCount = 0;
                let updatedCount = 0;
                const batchSize = 8;

                for (let i = 0; i < toCreate.length; i += batchSize) {
                    const batch = toCreate.slice(i, i + batchSize);
                    setSyncProgressText(`Creando ${Math.min(i + batchSize, toCreate.length)} / ${toCreate.length}...`);
                    await Promise.all(batch.map(async (prod) => {
                        const fd = new FormData();
                        fd.append('action', 'create');
                        fd.append('sku', prod.sku);
                        fd.append('name', prod.name);
                        fd.append('description', prod.name);
                        fd.append('base_price', '0');
                        fd.append('category', 'Cerveza');
                        fd.append('current_image_url', `portafolio/${prod.sku}.png`);
                        fd.append('is_active', '1');
                        const r = await fetch(`${API_URL}/admin/products-manage.php`, {
                            method: 'POST',
                            headers: authHeaders,
                            body: fd
                        }).then(resp => resp.json()).catch(() => null);
                        if (r && r.success) createdCount++;
                    }));
                }

                for (let i = 0; i < toUpdate.length; i += batchSize) {
                    const batch = toUpdate.slice(i, i + batchSize);
                    await Promise.all(batch.map(async (prod) => {
                        const fd = new FormData();
                        fd.append('action', 'update');
                        fd.append('id', prod.id);
                        fd.append('sku', prod.sku);
                        fd.append('name', prod.name);
                        fd.append('description', prod.description || prod.name);
                        fd.append('base_price', prod.base_price || '0');
                        fd.append('category', prod.category || 'Cerveza');
                        fd.append('current_image_url', prod.image_url || `portafolio/${prod.sku}.png`);
                        fd.append('is_active', String(prod.is_active ?? 1));
                        const r = await fetch(`${API_URL}/admin/products-manage.php`, {
                            method: 'POST',
                            headers: authHeaders,
                            body: fd
                        }).then(resp => resp.json()).catch(() => null);
                        if (r && r.success) updatedCount++;
                    }));
                }

                alert(`¡Sincronización completada! ${createdCount} nuevos SKUs pasados al Catálogo Shop y ${updatedCount} actualizados (Total en Fotos SKU: ${skus.length}).`);
            }

            await loadData();
            await loadOverviewStats();
        } catch (err) {
            console.error("Error al pasar fotos SKU:", err);
            alert("Error al pasar Fotos SKUs: " + err.message);
        } finally {
            setSyncingMasterSkus(false);
            setSyncProgressText('');
        }
    };

    const handleSaveQuickZones = async () => {
        if (!quickZoneModalItem) return;
        try {
            const allowedStr = quickZoneSelected.length === 0 || quickZoneSelected.includes('TODAS')
                ? ''
                : quickZoneSelected.join(', ');

            const token = (await supabase.auth.getSession()).data.session?.access_token;
            const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};

            let savedOk = false;
            try {
                const res = await fetch(`${API_URL}/admin/products-manage.php`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...authHeaders
                    },
                    body: JSON.stringify({
                        action: 'update_zones',
                        id: quickZoneModalItem.id,
                        sku: quickZoneModalItem.sku,
                        skus: [quickZoneModalItem.sku],
                        name: quickZoneModalItem.name,
                        allowed_zones: allowedStr
                    })
                });
                const json = await res.json();
                if (res.ok && json && json.success) savedOk = true;
            } catch (_) {}

            if (!savedOk) {
                const fd = new FormData();
                fd.append('action', 'update');
                fd.append('id', quickZoneModalItem.id);
                fd.append('sku', quickZoneModalItem.sku || '');
                fd.append('name', quickZoneModalItem.name || '');
                fd.append('description', quickZoneModalItem.description || quickZoneModalItem.name || '');
                fd.append('base_price', quickZoneModalItem.base_price || 0);
                fd.append('category', quickZoneModalItem.category || 'Cerveza');
                fd.append('current_image_url', quickZoneModalItem.image_url || '');
                fd.append('is_active', quickZoneModalItem.is_active ?? 1);
                fd.append('allowed_zones', allowedStr);
                const fbRes = await fetch(`${API_URL}/admin/products-manage.php`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: fd
                }).then(r => r.json());
                if (!fbRes?.success) throw new Error(fbRes?.error || 'Error al guardar zonas');
            }

            setData(prev => prev.map(p => p.id === quickZoneModalItem.id ? { ...p, allowed_zones: allowedStr } : p));
            setQuickZoneModalItem(null);
        } catch (e) {
            alert("Error guardando zonas: " + e.message);
        }
    };

    // Descargar Excel Comparativo: Catálogo Shop vs Fotos SKUs + Verificación de Fotos Faltantes
    const handleDownloadComparisonExcel = async () => {
        setDownloadingExcel(true);
        try {
            // 1. Obtener SKUs de Fotos SKU (Supabase)
            const { data: skuMaster, error: sbErr } = await supabase
                .from('sku_descripcion')
                .select('cve_marca, descripcion')
                .order('cve_marca', { ascending: true });
            if (sbErr) throw new Error(sbErr.message);

            // 2. Obtener productos actuales de Catálogo Shop + portafolio_skus del servidor
            const prodRes = await api.get('/admin/products-manage.php').catch(() => ({ data: [] }));
            const shopProds = Array.isArray(prodRes?.data) ? prodRes.data : (Array.isArray(data) ? data : []);
            const srvPortafolio = (prodRes && prodRes.portafolio_skus && typeof prodRes.portafolio_skus === 'object')
                ? prodRes.portafolio_skus
                : serverPortafolioSkus;

            const masterMap = new window.Map();
            (skuMaster || []).forEach(m => {
                const k = String(m.cve_marca || '').trim().toUpperCase();
                if (k) masterMap.set(k, m);
            });

            const shopMap = new window.Map();
            shopProds.forEach(sp => {
                const k = String(sp.sku || '').trim().toUpperCase();
                if (k) shopMap.set(k, sp);
            });

            const allSkuKeys = Array.from(new Set([...masterMap.keys(), ...shopMap.keys()])).sort((a, b) =>
                a.localeCompare(b, undefined, { numeric: true })
            );

            // Verificar fotos: estático en PRODUCT_IMAGES, o en srvPortafolio, o probe de imagen en vivo
            const checkImageExistsLive = (skuKey) => new Promise((resolve) => {
                if (PRODUCT_IMAGES && (PRODUCT_IMAGES[skuKey] || PRODUCT_IMAGES[skuKey.toLowerCase()])) {
                    return resolve(true);
                }
                if (srvPortafolio && srvPortafolio[skuKey]) {
                    return resolve(true);
                }
                const sp = shopMap.get(skuKey);
                if (sp && sp.image_url && !sp.image_url.includes('portafolio/')) {
                    return resolve(true);
                }
                try {
                    const img = typeof document !== 'undefined' ? document.createElement('img') : new window.Image();
                    const timer = setTimeout(() => resolve(false), 2500);
                    img.onload = () => { clearTimeout(timer); resolve(true); };
                    img.onerror = () => { clearTimeout(timer); resolve(false); };
                    img.src = `https://cervezasfinas.com/portafolio/${encodeURIComponent(skuKey)}.png`;
                } catch (_) {
                    resolve(false);
                }
            });

            const photoStatusMap = new window.Map();
            const probeBatchSize = 15;
            for (let i = 0; i < allSkuKeys.length; i += probeBatchSize) {
                const slice = allSkuKeys.slice(i, i + probeBatchSize);
                const results = await Promise.all(slice.map(k => checkImageExistsLive(k)));
                slice.forEach((k, idx) => photoStatusMap.set(k, results[idx]));
            }

            const fullRows = allSkuKeys.map(skuKey => {
                const mItem = masterMap.get(skuKey);
                const sItem = shopMap.get(skuKey);
                const inMaster = !!mItem;
                const inShop = !!sItem;
                const hasPhoto = !!photoStatusMap.get(skuKey);

                const allowedZones = sItem?.allowed_zones && sItem.allowed_zones.trim() !== '' && sItem.allowed_zones.toUpperCase() !== 'TODAS'
                    ? sItem.allowed_zones
                    : 'TODAS LAS ZONAS (GLOBAL)';

                let diagnostico = 'COMPLETO (En Catálogo Shop y Con Foto)';
                if (!inShop && !hasPhoto) {
                    diagnostico = 'FALTA PASAR AL CATÁLOGO Y FALTA FOTO';
                } else if (!inShop && hasPhoto) {
                    diagnostico = 'FALTA PASAR AL CATÁLOGO SHOP';
                } else if (inShop && !hasPhoto) {
                    diagnostico = 'YA EN CATÁLOGO PERO LE FALTA FOTO';
                }

                return {
                    'Código SKU': mItem?.cve_marca || sItem?.sku || skuKey,
                    'Descripción en Fotos SKU': mItem?.descripcion || 'No registrado en Fotos SKU',
                    'Nombre en Catálogo Shop': sItem?.name || 'NO ESTÁ EN CATÁLOGO SHOP',
                    '¿Ya en Catálogo Shop?': inShop ? 'SÍ' : 'NO',
                    '¿Está en Fotos SKUs?': inMaster ? 'SÍ' : 'NO',
                    '¿Tiene Foto?': hasPhoto ? 'SÍ TIENE FOTO' : 'FALTA FOTO',
                    'Diagnóstico': diagnostico,
                    'Estatus en Tienda': inShop ? (sItem.is_active == 1 ? 'ACTIVO' : 'INACTIVO') : 'NO EN TIENDA',
                    'Precio Base ($)': inShop ? Number(sItem.base_price || 0) : 0,
                    'Categoría': sItem?.category || 'Cerveza',
                    'Zonas Permitidas': inShop ? allowedZones : 'Pendiente vincular',
                    'Ruta / URL Foto': hasPhoto ? (PRODUCT_IMAGES?.[skuKey] || srvPortafolio?.[skuKey] || `/portafolio/${skuKey}.png`) : 'SIN FOTO'
                };
            });

            const missingInShopRows = fullRows.filter(r => r['¿Ya en Catálogo Shop?'] === 'NO');
            const missingPhotoRows = fullRows.filter(r => r['¿Tiene Foto?'] === 'FALTA FOTO');
            const alreadyInShopRows = fullRows.filter(r => r['¿Ya en Catálogo Shop?'] === 'SÍ');

            const wb = XLSX.utils.book_new();

            const wsAll = XLSX.utils.json_to_sheet(fullRows);
            XLSX.utils.book_append_sheet(wb, wsAll, 'Comparativo Completo');

            const wsMissingShop = XLSX.utils.json_to_sheet(
                missingInShopRows.length > 0
                    ? missingInShopRows
                    : [{ 'Mensaje': '¡Todos los SKUs ya están en el Catálogo de la Shop!' }]
            );
            XLSX.utils.book_append_sheet(wb, wsMissingShop, 'Faltan en Catalogo Shop');

            const wsMissingPhoto = XLSX.utils.json_to_sheet(
                missingPhotoRows.length > 0
                    ? missingPhotoRows
                    : [{ 'Mensaje': '¡Todos los SKUs tienen fotografía asignada!' }]
            );
            XLSX.utils.book_append_sheet(wb, wsMissingPhoto, 'Les Falta Foto');

            const wsInShop = XLSX.utils.json_to_sheet(
                alreadyInShopRows.length > 0
                    ? alreadyInShopRows
                    : [{ 'Mensaje': 'No hay productos en el Catálogo Shop' }]
            );
            XLSX.utils.book_append_sheet(wb, wsInShop, 'Ya en Catalogo Shop');

            const dateStr = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `Comparativo_SKUs_Catalogo_y_Fotos_${dateStr}.xlsx`);
        } catch (err) {
            console.error('Error generando Excel comparativo:', err);
            alert('Error al generar Excel comparativo: ' + err.message);
        } finally {
            setDownloadingExcel(false);
        }
    };

    const gecOptions = ['Bronce', 'Plata', 'Oro', 'Platino', 'Titanio', 'Titanio 2'];

    const shopCategories = [
        { id: 'all', label: 'Todo el Control Shop', shortLabel: 'Todos', icon: LayoutGrid, color: 'emerald' },
        { id: 'operacion', label: '1. Operación y Pedidos', shortLabel: '1. Operación', icon: ShoppingCart, color: 'emerald' },
        { id: 'catalogo', label: '2. Catálogo, Marcas e Imagen', shortLabel: '2. Catálogo', icon: Package, color: 'cyan' },
        { id: 'precios', label: '3. Precios, Promos y Descuentos', shortLabel: '3. Precios', icon: DollarSign, color: 'amber' },
        { id: 'lealtad', label: '4. Lealtad, Puntos y Premios', shortLabel: '4. Puntos y Canjes', icon: Gift, color: 'pink' },
        { id: 'clientes', label: '5. Clientes y Notificaciones', shortLabel: '5. Clientes y Push', icon: Users, color: 'blue' }
    ];

    // Tabs clasificados al 100% para control total de la Shop
    const tabs = [
        { id: 'overview', category: 'all', label: 'Centro de Control Maestro', shortLabel: 'Panel 100%', desc: 'Vista clasificada de todos los módulos y estado en vivo de la tienda', icon: LayoutGrid, color: 'emerald', gradient: 'from-emerald-600 to-teal-600', shadow: 'shadow-emerald-900/50' },
        // 1. OPERACIÓN Y PEDIDOS
        { id: 'shop-orders', category: 'operacion', label: 'Pedidos, Preventas y Chat', shortLabel: 'Pedidos y Chat', desc: 'Control de pedidos online, preventas, edición de precios, entrega y chat soporte', icon: MessageSquare, color: 'emerald', gradient: 'from-emerald-600 to-green-600', shadow: 'shadow-emerald-900/50', externalPath: '/televenta/shop-orders' },
        { id: 'cooler-executions', category: 'operacion', label: 'Evaluación Fotos Enfriador', shortLabel: 'Eval. Enfriadores', desc: 'Revisar fotos de enfriador enviadas por clientes y otorgar puntos', icon: Camera, color: 'indigo', gradient: 'from-indigo-600 to-violet-600', shadow: 'shadow-indigo-900/50', externalPath: '/televenta/cooler-executions' },
        { id: 'redemptions', category: 'operacion', label: 'Solicitudes de Canje (Admin)', shortLabel: 'Solicitudes Canje', desc: 'Aprobar o rechazar solicitudes de canje con descuento automático de puntos', icon: ShoppingCart, color: 'orange', gradient: 'from-orange-600 to-red-600', shadow: 'shadow-orange-900/50' },
        { id: 'redemptions-delivery', category: 'operacion', label: 'Entrega de Premios / Canjes', shortLabel: 'Entrega Canjes', desc: 'Seguimiento operativo y confirmación de entrega de premios canjeados', icon: Check, color: 'teal', gradient: 'from-teal-600 to-emerald-600', shadow: 'shadow-teal-900/50', externalPath: '/televenta/redemptions' },
        // 2. CATÁLOGO, MARCAS E IMAGEN
        { id: 'catalog', category: 'catalogo', label: 'Catálogo de Productos Shop', shortLabel: 'Catálogo', desc: 'Alta, edición, precios base, categoría y visibilidad de productos en la tienda', icon: Package, color: 'emerald', gradient: 'from-emerald-600 to-green-600', shadow: 'shadow-emerald-900/50' },
        { id: 'zone-visibility', category: 'catalogo', label: 'Zonas por Marca / Excepciones Cliente', shortLabel: 'Zonas y Excepciones', desc: 'Configurar zonas permitidas por marca o producto y excepciones por cliente', icon: ShieldCheck, color: 'amber', gradient: 'from-amber-600 to-orange-600', shadow: 'shadow-amber-900/50' },
        { id: 'sku-images', category: 'catalogo', label: 'Imágenes de Productos (SKUs)', shortLabel: 'Fotos SKUs', desc: 'Subir y actualizar fotografías oficiales de cada SKU del catálogo', icon: Image, color: 'cyan', gradient: 'from-cyan-600 to-sky-600', shadow: 'shadow-cyan-900/50', externalPath: '/admin/sku-images' },
        { id: 'brands', category: 'catalogo', label: 'Marcas de la Tienda', shortLabel: 'Marcas', desc: 'Administrar marcas, logotipos y filtros visuales del catálogo', icon: Layers, color: 'blue', gradient: 'from-blue-600 to-cyan-600', shadow: 'shadow-blue-900/50', externalPath: '/admin/brands' },
        { id: 'banners', category: 'catalogo', label: 'Banners Promocionales', shortLabel: 'Banners', desc: 'Carrusel de imágenes y enlaces promocionales en el inicio de la Shop', icon: Image, color: 'rose', gradient: 'from-rose-600 to-pink-600', shadow: 'shadow-rose-900/50' },
        { id: 'cooler-refs', category: 'catalogo', label: 'Fotos Guía de Enfriadores', shortLabel: 'Guías Enfriador', desc: 'Imágenes de referencia del acomodo oficial de enfriadores para clientes', icon: Sparkles, color: 'indigo', gradient: 'from-indigo-600 to-purple-600', shadow: 'shadow-indigo-900/50' },
        // 3. PRECIOS, PROMOCIONES Y DESCUENTOS
        { id: 'promotions', category: 'precios', label: 'Promociones y Combos', shortLabel: 'Promos', desc: 'Configurar promociones, descuentos porcentuales y paquetes de SKUs', icon: Tag, color: 'cyan', gradient: 'from-cyan-600 to-blue-600', shadow: 'shadow-cyan-900/50' },
        { id: 'special-prices', category: 'precios', label: 'Precios Especiales por Cliente', shortLabel: 'Precios Esp.', desc: 'Asignar precios personalizados por código de cliente y producto', icon: DollarSign, color: 'amber', gradient: 'from-amber-600 to-yellow-600', shadow: 'shadow-amber-900/50' },
        { id: 'gec-discounts', category: 'precios', label: 'Descuentos por Nivel GEC', shortLabel: 'Descuentos GEC', desc: 'Porcentajes de descuento automático según nivel GEC (Bronce a Titanio)', icon: Award, color: 'purple', gradient: 'from-purple-600 to-pink-600', shadow: 'shadow-purple-900/50' },
        { id: 'surcharges', category: 'precios', label: 'Recargos de Envase', shortLabel: 'Recargos', desc: 'Configurar importe por envase retornable y envase desechable', icon: TrendingUp, color: 'red', gradient: 'from-red-600 to-orange-600', shadow: 'shadow-red-900/50' },
        { id: 'price-upload', category: 'precios', label: 'Carga Masiva de Precios', shortLabel: 'Carga Precios', desc: 'Importador y actualizador masivo de listas de precios', icon: Upload, color: 'amber', gradient: 'from-amber-600 to-orange-600', shadow: 'shadow-amber-900/50', externalPath: '/admin/price-upload' },
        // 4. LEALTAD, PUNTOS Y PREMIOS
        { id: 'loyalty-audit', category: 'lealtad', label: 'Auditoría & Comparativa de Puntos', shortLabel: 'Auditoría Puntos', desc: 'Conciliación real vs ventas_por_sku, canjes y top premios', icon: FileCheck, color: 'emerald', gradient: 'from-emerald-600 to-teal-600', shadow: 'shadow-emerald-900/50' },
        { id: 'points-config', category: 'lealtad', label: 'Reglas de Puntos y SKUs', shortLabel: 'Reglas Puntos', desc: 'Configurar puntos por peso gastado y puntos extra por producto (SKU)', icon: Coins, color: 'amber', gradient: 'from-amber-500 to-yellow-600', shadow: 'shadow-amber-900/50', externalPath: '/admin/points-config' },
        { id: 'redemption-catalog', category: 'lealtad', label: 'Catálogo de Premios de Canje', shortLabel: 'Cat. Premios', desc: 'Artículos, costo en puntos, stock e imágenes para canje de clientes', icon: Gift, color: 'pink', gradient: 'from-pink-600 to-rose-600', shadow: 'shadow-pink-900/50' },
        { id: 'client-points', category: 'lealtad', label: 'Saldo y Auditoría de Puntos', shortLabel: 'Puntos Clientes', desc: 'Consultar puntos acumulados, canjeados e historial por cada cliente', icon: Award, color: 'purple', gradient: 'from-purple-600 to-indigo-600', shadow: 'shadow-purple-900/50', externalPath: '/supervisor/points' },
        // 5. CLIENTES Y COMUNICACIÓN
        { id: 'clients', category: 'clientes', label: 'Clientes Shop y Contraseñas', shortLabel: 'Clientes Shop', desc: 'Alta de clientes, carga CSV, cambio de contraseña, teléfono y nivel GEC', icon: Users, color: 'blue', gradient: 'from-blue-600 to-indigo-600', shadow: 'shadow-blue-900/50' },
        { id: 'televenta-routes', category: 'clientes', label: 'Televentas por Zona y Ruta', shortLabel: 'Televentas WhatsApp', desc: 'Asignar ejecutivos y WhatsApp por zona o ruta de venta para atención directa al cliente', icon: Phone, color: 'emerald', gradient: 'from-emerald-600 to-teal-600', shadow: 'shadow-emerald-900/50' },
        { id: 'push-broadcast', category: 'clientes', label: 'Notificaciones Push', shortLabel: 'Push Clientes', desc: 'Enviar notificaciones push masivas a los dispositivos de los clientes', icon: Bell, color: 'rose', gradient: 'from-rose-600 to-orange-600', shadow: 'shadow-rose-900/50', externalPath: '/admin/push-broadcast' }
    ];

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const tabParam = params.get('tab');
        if (tabParam && tabs.some(t => t.id === tabParam)) {
            setActiveTab(tabParam);
            const found = tabs.find(t => t.id === tabParam);
            if (found && found.category && found.category !== 'all') {
                setActiveCategory(found.category);
            }
        }
    }, [location.search]);

    const selectTab = (tabId) => {
        setActiveTab(tabId);
        setSearchTerm('');
        setNewItem(null);
        setEditingItem(null);
        const found = tabs.find(t => t.id === tabId);
        if (found && found.category && found.category !== 'all' && activeCategory !== 'all') {
            setActiveCategory(found.category);
        }
        navigate(`${location.pathname}?tab=${tabId}`, { replace: true });
    };

    const loadOverviewStats = async () => {
        try {
            const [prodRes, cliRes, promoRes, redRes, rewRes, banRes] = await Promise.all([
                api.get('/admin/products-manage.php').catch(() => ({ data: [] })),
                api.get('/admin/clients-manage.php').catch(() => ({ data: [] })),
                api.get('/admin/promotions-manage.php').catch(() => ({ data: [] })),
                api.get('/admin/redemptions-manage.php?action=list_redemptions').catch(() => ({ data: [] })),
                api.get('/admin/redemption-products-manage.php').catch(() => ({ data: [] })),
                api.get('/admin/banners-manage.php').catch(() => ({ data: [] })),
            ]);
            const redList = Array.isArray(redRes?.data) ? redRes.data : [];
            setOverviewStats({
                products: Array.isArray(prodRes?.data) ? prodRes.data.length : 0,
                clients: Array.isArray(cliRes?.data) ? cliRes.data.length : 0,
                promotions: Array.isArray(promoRes?.data) ? promoRes.data.length : 0,
                pendingRedemptions: redList.filter(r => r.status === 'pending').length,
                rewards: Array.isArray(rewRes?.data) ? rewRes.data.length : 0,
                banners: Array.isArray(banRes?.data) ? banRes.data.length : 0,
            });
        } catch (e) {
            console.error('Error loading overview stats:', e);
        }
    };

    useEffect(() => {
        loadShopSettings();
        loadOverviewStats();
        loadOfficialZonesAndRoutes();
        loadShopBrands();
    }, []);

    const loadShopSettings = async () => {
        try {
            const { data: sbData, error: sbErr } = await supabase
                .from('global_settings')
                .select('value')
                .eq('key', 'shop_show_prices_to_clients')
                .maybeSingle();

            if (!sbErr && sbData && sbData.value !== undefined && sbData.value !== null) {
                const valStr = typeof sbData.value === 'string' ? sbData.value.replace(/"/g, '') : String(sbData.value);
                setShowPrices(valStr === '1' || valStr === 'true');
                return;
            }

            const res = await api.get('/admin/settings-manage.php');
            if (res && res.success && res.data) {
                setShowPrices(res.data.show_prices_to_clients === '1');
            }
        } catch (e) {
            console.error('Error cargando settings:', e);
        }
    };

    const handleTogglePrices = async () => {
        setTogglingPrices(true);
        const nextVal = !showPrices;
        const strVal = nextVal ? '1' : '0';
        try {
            // 1. Guardar en Supabase global_settings (fuente principal en tiempo real)
            const { error: sbError } = await supabase
                .from('global_settings')
                .upsert({ key: 'shop_show_prices_to_clients', value: strVal }, { onConflict: 'key' });

            // 2. Sincronizar también con MySQL PHP endpoint si está disponible
            let phpOk = false;
            try {
                const res = await api.post('/admin/settings-manage.php', {
                    key: 'show_prices_to_clients',
                    value: strVal
                });
                if (res && res.success) phpOk = true;
            } catch (_) {
                // Ignorar si el endpoint PHP aún no está desplegado
            }

            if (!sbError || phpOk) {
                setShowPrices(nextVal);
            } else {
                alert('Error al actualizar la configuración: ' + (sbError?.message || 'Desconocido'));
            }
        } catch (e) {
            console.error('Error toggling prices:', e);
            alert('Error de conexión al actualizar la configuración');
        } finally {
            setTogglingPrices(false);
        }
    };

    useEffect(() => {
        loadData();
        if (['promotions', 'special-prices', 'redemption-catalog'].includes(activeTab)) {
            fetchProductsList();
        }
    }, [activeTab]);

    const fetchProductsList = async () => {
        try {
            const res = await api.get('/admin/products-manage.php');
            if (res.success) setProductsList(res.data || []);
        } catch (e) {
            console.error(e);
        }
    };

    const loadData = async () => {
        setLoading(true);
        try {
            let endpoint = '';
            switch (activeTab) {
                case 'catalog': endpoint = '/admin/products-manage.php'; break;
                case 'promotions': endpoint = '/admin/promotions-manage.php'; break;
                case 'special-prices': endpoint = '/admin/special-prices-manage.php'; break;
                case 'clients': endpoint = '/admin/clients-manage.php'; break;
                case 'gec-discounts': endpoint = '/admin/gec-discounts-manage.php'; break;
                case 'redemptions': endpoint = '/admin/redemptions-manage.php?action=list_redemptions'; break;
                case 'redemption-catalog': endpoint = '/admin/redemption-products-manage.php'; break;
                case 'cooler-refs': endpoint = '/admin/cooler-references-manage.php'; break;
                case 'banners': endpoint = '/admin/banners-manage.php'; break;
                case 'surcharges': endpoint = '/admin/surcharges-manage.php'; break;
                case 'televenta-routes': endpoint = '/admin/televenta-assignments.php'; break;
            }
            if (endpoint) {
                const res = await api.get(endpoint);
                if (res.success) {
                    setData(res.data || []);
                    if (activeTab === 'catalog' && res.portafolio_skus && typeof res.portafolio_skus === 'object') {
                        setServerPortafolioSkus(res.portafolio_skus);
                    }
                }
            }
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (item, isNew = false) => {
        try {
            let endpoint = '';
            let payload = { ...item };
            let isFormData = false;

            switch (activeTab) {
                case 'catalog':
                    endpoint = '/admin/products-manage.php';
                    payload.action = isNew ? 'create' : 'update';
                    if (item.imageFile) {
                        isFormData = true;
                        const fd = new FormData();
                        Object.keys(payload).forEach(key => {
                            if (key === 'presentations' && Array.isArray(payload[key])) {
                                fd.append(key, JSON.stringify(payload[key]));
                            } else {
                                fd.append(key, payload[key]);
                            }
                        });
                        fd.append('image', item.imageFile);
                        payload = fd;
                    }
                    break;
                case 'promotions':
                    endpoint = '/admin/promotions-manage.php';
                    payload.action = isNew ? 'create' : 'update';
                    break;
                case 'special-prices':
                    endpoint = '/admin/special-prices-manage.php';
                    payload.action = isNew ? 'create' : 'update';
                    break;
                case 'clients':
                    endpoint = '/admin/clients-manage.php';
                    payload.action = isNew ? 'create' : 'update';
                    if (item.client_code && item.phone !== undefined) {
                        try {
                            await supabase
                                .from('clients')
                                .update({ phone: item.phone })
                                .eq('client_code', String(item.client_code).trim());
                        } catch (_) {}
                    }
                    break;
                case 'gec-discounts':
                    endpoint = '/admin/gec-discounts-manage.php';
                    payload.action = 'update';
                    break;
                case 'redemption-catalog':
                    endpoint = '/admin/redemption-products-manage.php';
                    payload.action = isNew ? 'create' : 'update';
                    break;
                case 'banners':
                    endpoint = '/admin/banners-manage.php';
                    payload.action = isNew ? 'create' : 'update';
                    if (item.imageFile) {
                        isFormData = true;
                        const fd = new FormData();
                        Object.keys(payload).forEach(key => fd.append(key, payload[key]));
                        fd.append('image', item.imageFile);
                        payload = fd;
                    }
                    break;
                case 'cooler-refs':
                    endpoint = '/admin/cooler-references-manage.php';
                    if (isNew) {
                        isFormData = true;
                        const fd = new FormData();
                        fd.append('action', 'upload');
                        const refTitle = item.title || item.name || 'Referencia';
                        fd.append('title', refTitle);
                        fd.append('name', refTitle);
                        fd.append('description', item.description || '');
                        if (item.imageFile) fd.append('image', item.imageFile);
                        payload = fd;
                    }
                    break;
                case 'surcharges':
                    endpoint = '/admin/surcharges-manage.php';
                    payload.action = 'update';
                    break;
                case 'televenta-routes':
                    if (!String(item.agent_name || '').trim() || !String(item.phone || '').trim()) {
                        alert('Por favor ingresa el nombre del ejecutivo y su número de WhatsApp.');
                        return;
                    }
                    if (item.assignment_type === 'zone' && !item.is_default && !String(item.zone || '').trim()) {
                        alert('Por favor selecciona al menos una Zona Comercial para este ejecutivo.');
                        return;
                    }
                    if (item.assignment_type === 'route' && !item.is_default && !String(item.sales_route || '').trim()) {
                        alert('Por favor selecciona al menos una Ruta de Venta para este ejecutivo.');
                        return;
                    }
                    endpoint = '/admin/televenta-assignments.php';
                    payload.action = isNew ? 'create' : 'update';
                    payload.zones = String(item.zone || '').split(',').map(z => z.trim().toUpperCase()).filter(Boolean);
                    payload.routes = String(item.sales_route || '').split(',').map(r => r.trim().toUpperCase()).filter(Boolean);
                    break;
            }

            let res;
            if (isFormData) {
                                res = await fetch(`${API_URL}${endpoint}`, {
                    method: 'POST',
                    body: payload,
                    headers: await getShopAuthHeaders()
                }).then(r => r.json());
            } else {
                res = await api.post(endpoint, payload);
            }

            if (res.success) {
                setEditingItem(null);
                setNewItem(null);
                loadData();
            } else {
                alert('Error saving: ' + (res.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error saving:', error);
            alert('Error saving item');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Estás seguro?')) return;
        try {
            let endpoint = '';
            switch (activeTab) {
                case 'catalog':
                    await api.post('/admin/products-manage.php', { action: 'delete', id });
                    loadData();
                    return;
                case 'promotions': endpoint = `/admin/promotions-manage.php?id=${id}`; break;
                case 'special-prices': endpoint = `/admin/special-prices-manage.php?id=${id}`; break;
                case 'redemption-catalog': endpoint = `/admin/redemption-products-manage.php?id=${id}`; break;
                case 'banners':
                    await api.post('/admin/banners-manage.php', { action: 'delete', id });
                    loadData();
                    return;
                case 'cooler-refs':
                    await api.post('/admin/cooler-references-manage.php', { action: 'delete', id });
                    loadData();
                    return;
                case 'televenta-routes':
                    await api.post('/admin/televenta-assignments.php', { action: 'delete', id });
                    loadData();
                    return;
            }
            if (endpoint) {
                await api.delete(endpoint);
                loadData();
            }
        } catch (error) {
            console.error('Error deleting:', error);
        }
    };

    const handleRedemptionStatus = async (id, status, clientCode = '') => {
        try {
            await api.post('/admin/redemptions-manage.php', {
                action: 'update_status',
                id,
                client_code: clientCode,
                status
            });
            loadData();
        } catch (error) {
            console.error('Error updating status:', error);
        }
    };

    // ========================================================================
    // FUNCIONES RENDER - CATÁLOGO
    // ========================================================================

    const renderCatalog = () => {
        const filteredData = data.filter(item => {
            const matchesSearch = !searchTerm ||
                item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.brand && item.brand.toLowerCase().includes(searchTerm.toLowerCase()));
            
            if (!matchesSearch) return false;

            // Filtro por Marca seleccionada
            if (selectedBrandFilter !== 'all') {
                const bVal = (item.brand || '').toLowerCase().trim();
                const sel = selectedBrandFilter.toLowerCase().trim();
                const nameVal = (item.name || '').toLowerCase();
                const skuVal = (item.sku || '').toLowerCase();

                const matchesBrand = (bVal && (bVal === sel || bVal.includes(sel) || sel.includes(bVal))) ||
                    nameVal.includes(sel) ||
                    skuVal.includes(sel) ||
                    (sel.includes('xx') && (nameVal.includes('xx') || nameVal.includes('dos equis')));

                if (!matchesBrand) return false;
            }

            if (selectedZoneFilter === 'all') return true;

            const zonesStr = (item.allowed_zones || '').toUpperCase();
            if (!zonesStr || zonesStr === 'TODAS' || zonesStr === 'ALL') return true;
            const zoneList = zonesStr.split(',').map(z => z.trim());
            return zoneList.includes(selectedZoneFilter.toUpperCase());
        });

        return (
            <div className="space-y-5">
                {/* Header con Acciones Maestras de Catálogo */}
                <div className="bg-gray-900/90 border border-gray-800 p-4 rounded-2xl shadow-xl flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => setNewItem({ sku: '', name: '', base_price: '', category: 'Cerveza', is_active: 1, allowed_zones: '', brand: '' })}
                                className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white px-3.5 py-2 rounded-xl shadow-lg shadow-emerald-900/40 transition-all flex items-center justify-center gap-1.5 font-bold text-xs"
                            >
                                <Plus className="w-4 h-4" /> Nuevo Producto
                            </button>

                            {/* BOTÓN PRINCIPAL: PASAR FOTOS SKU AL CATÁLOGO DE LA SHOP */}
                            <button
                                onClick={handleSyncAllFromSkuImages}
                                disabled={syncingMasterSkus}
                                className="bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white px-3.5 py-2 rounded-xl shadow-lg shadow-teal-900/40 transition-all flex items-center justify-center gap-1.5 font-bold text-xs border border-teal-500/40"
                                title="Importa y vincula todos los códigos, nombres y fotos de 'Fotos SKUs' hacia el catálogo de la tienda"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${syncingMasterSkus ? 'animate-spin' : ''}`} />
                                <span>{syncingMasterSkus ? (syncProgressText || 'Pasando Catálogo...') : '📥 Pasar Fotos SKUs al Catálogo Shop'}</span>
                            </button>

                            {/* BOTÓN DESCARGAR EXCEL COMPARATIVO (CATÁLOGO + FOTOS) */}
                            <button
                                onClick={handleDownloadComparisonExcel}
                                disabled={downloadingExcel}
                                className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white px-3.5 py-2 rounded-xl shadow-lg shadow-amber-900/40 transition-all flex items-center justify-center gap-1.5 font-bold text-xs border border-amber-500/40"
                                title="Descarga un archivo Excel comparando cuáles SKUs ya tienes en el catálogo, cuáles faltan y a cuáles les falta foto"
                            >
                                <Download className={`w-3.5 h-3.5 ${downloadingExcel ? 'animate-bounce' : ''}`} />
                                <span>{downloadingExcel ? 'Generando Excel...' : '📊 Descargar Excel Comparativo (SKUs y Fotos)'}</span>
                            </button>

                            {/* BOTÓN CATÁLOGO OFICIAL DE ZONAS Y RUTAS (COHERENCIA CON APP PRINCIPAL) */}
                            <button
                                onClick={() => setIsZonasCatalogOpen(true)}
                                className="bg-gray-800 hover:bg-gray-700 text-emerald-300 border border-emerald-700/50 px-3.5 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 font-bold text-xs"
                                title="Abrir el Catálogo Oficial de Zonas y Rutas de la aplicación principal"
                            >
                                <MapIcon className="w-3.5 h-3.5 text-emerald-400" />
                                <span>🗺️ Catálogo Zonas y Rutas</span>
                            </button>

                            {/* ACCESO DIRECTO: ASIGNAR TELEVENTAS WHATSAPP POR ZONA/RUTA */}
                            <button
                                onClick={() => selectTab('televenta-routes')}
                                className="bg-gradient-to-r from-emerald-800 to-teal-800 hover:from-emerald-700 hover:to-teal-700 text-emerald-200 border border-emerald-600/50 px-3.5 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 font-bold text-xs shadow-md"
                                title="Asignar qué número de WhatsApp atiende cada Zona o Ruta de venta"
                            >
                                <Phone className="w-3.5 h-3.5 text-emerald-300" />
                                <span>📞 Televentas WhatsApp por Zona/Ruta</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('sku-images')}
                                className="bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 px-3.5 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 font-bold text-xs"
                                title="Ir a Imágenes de Productos (SKUs)"
                            >
                                <Image className="w-3.5 h-3.5 text-cyan-400" />
                                <span>Ver Fotos SKUs</span>
                            </button>
                        </div>

                        <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar por SKU o Nombre..." />
                    </div>

                    {/* Barra de Filtro Rápido por Zona Comercial (Sincronizada con zonas_rutas) */}
                    <div className="flex items-center gap-2 overflow-x-auto pt-2 border-t border-gray-800/80 text-xs no-scrollbar">
                        <span className="text-gray-400 font-bold flex items-center gap-1 shrink-0 text-[11px] uppercase tracking-wider">
                            <MapPin className="w-3.5 h-3.5 text-emerald-400" /> Filtrar por Zona Oficial:
                        </span>
                        {['all', ...availableShopZones].map(z => {
                            const routeCount = z !== 'all' ? (zonesRoutesMap[z]?.allRoutes?.length || 0) : 0;
                            return (
                                <button
                                    key={z}
                                    type="button"
                                    onClick={() => setSelectedZoneFilter(z)}
                                    className={`px-3 py-1 rounded-lg font-bold text-xs transition-all shrink-0 flex items-center gap-1 ${
                                        selectedZoneFilter === z
                                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40 border border-emerald-500'
                                            : 'bg-gray-800/80 text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600'
                                    }`}
                                >
                                    <span>{z === 'all' ? '● Todas las Zonas (Catálogo Completo)' : z}</span>
                                    {routeCount > 0 && (
                                        <span className="text-[10px] opacity-80 bg-black/25 px-1.5 py-0.2 rounded-full">
                                            {routeCount} rutas
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Barra de Filtro Rápido por Marca (Sincronizada con shop_brands) */}
                    {shopBrandsList.length > 0 && (
                        <div className="flex items-center gap-2 overflow-x-auto pt-2 border-t border-gray-800/60 text-xs no-scrollbar">
                            <span className="text-gray-400 font-bold flex items-center gap-1 shrink-0 text-[11px] uppercase tracking-wider">
                                <Layers className="w-3.5 h-3.5 text-blue-400" /> Filtrar por Marca:
                            </span>
                            {['all', ...shopBrandsList.map(b => b.name)].map(bName => (
                                <button
                                    key={bName}
                                    type="button"
                                    onClick={() => setSelectedBrandFilter(bName)}
                                    className={`px-3 py-1 rounded-lg font-bold text-xs transition-all shrink-0 flex items-center gap-1 ${
                                        selectedBrandFilter === bName
                                            ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40 border border-blue-500'
                                            : 'bg-gray-800/80 text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600'
                                    }`}
                                >
                                    <span>{bName === 'all' ? '● Todas las Marcas' : bName}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Grid de productos COMPACTO */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5" style={{ maxWidth: '100%' }}>
                    {filteredData.length === 0 ? (
                        <EmptyState
                            icon={Package}
                            title="No hay productos en esta selección"
                            description={selectedZoneFilter !== 'all' ? `No hay productos asignados a la zona ${selectedZoneFilter}` : 'Agrega o sincroniza productos al catálogo'}
                        />
                    ) : (
                        filteredData.map(item => {
                            const isGlobal = !item.allowed_zones || item.allowed_zones === '' || item.allowed_zones.toUpperCase() === 'TODAS' || item.allowed_zones.toUpperCase() === 'ALL';
                            return (
                                <div key={item.id} className="group bg-gray-900 hover:bg-gray-800/90 p-2.5 rounded-xl shadow-lg border border-gray-800 hover:border-emerald-500/50 transition-all flex flex-col justify-between">
                                    <div>
                                        {/* Imagen compacta */}
                                        <div className="relative aspect-square w-full mb-1.5 rounded-lg overflow-hidden bg-gray-800">
                                            <SmartImage
                                                sku={item.sku}
                                                src={item.image_url}
                                                alt={item.name}
                                                fit="contain"
                                                fallbackIcon={Package}
                                                className="w-full h-full p-1"
                                            />
                                            <div className="absolute top-1 right-1">
                                                {item.is_active == 1 ? (
                                                    <div className="bg-emerald-500/90 rounded-full p-0.5"><Check className="w-2.5 h-2.5 text-white" /></div>
                                                ) : (
                                                    <div className="bg-gray-500/90 rounded-full p-0.5"><X className="w-2.5 h-2.5 text-white" /></div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Info compacta */}
                                        <h3 className="font-bold text-white text-[11px] line-clamp-2 mb-1 leading-tight">{item.name}</h3>
                                        
                                        {/* Marca del Producto */}
                                        <div className="flex items-center gap-1 mb-1">
                                            {item.brand ? (
                                                <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-blue-950/80 text-blue-300 border border-blue-800/60 truncate max-w-[120px]" title={`Marca: ${item.brand}`}>
                                                    🏷️ {item.brand}
                                                </span>
                                            ) : (
                                                <span className="text-[8px] text-gray-500 italic">Sin marca</span>
                                            )}
                                        </div>
                                        
                                        {/* SKU y Botón de Zonas Directo */}
                                        <div className="flex items-center justify-between gap-1 mb-1.5">
                                            <span className="text-[9px] text-gray-400 font-mono font-bold">{item.sku}</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const raw = item.allowed_zones ? item.allowed_zones.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : [];
                                                    setQuickZoneSelected(raw);
                                                    setQuickZoneModalItem(item);
                                                }}
                                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors flex items-center gap-0.5 truncate max-w-[95px] ${
                                                    isGlobal
                                                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/70 hover:bg-emerald-900/60'
                                                        : 'bg-blue-950/80 text-blue-300 border-blue-800/70 hover:bg-blue-900/60'
                                                }`}
                                                title={`Clic para editar zonas donde se vende. Actual: ${item.allowed_zones || 'Todas las Zonas'}`}
                                            >
                                                <MapPin className="w-2.5 h-2.5 shrink-0" />
                                                <span className="truncate">{isGlobal ? 'Todas Zonas' : item.allowed_zones}</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="pt-1.5 border-t border-gray-800 mt-1">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-emerald-400 font-bold text-sm">${parseFloat(item.base_price || 0).toFixed(2)}</span>
                                            <span className="text-[8px] text-gray-500">{item.category}</span>
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => { setEditingItem(item); setNewItem({ ...item }); }}
                                                className="flex-1 bg-gray-800 hover:bg-emerald-900/40 text-emerald-400 p-1 rounded-lg transition-colors border border-gray-700 flex items-center justify-center gap-1 text-[10px] font-bold"
                                                title="Editar producto"
                                            >
                                                <Edit className="w-3 h-3" /> Editar
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="bg-gray-800 hover:bg-red-900/40 text-red-400 p-1 px-2 rounded-lg transition-colors border border-gray-700"
                                                title="Eliminar de la tienda"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* MODAL RÁPIDO PARA CONFIGURAR ZONAS DE UN PRODUCTO */}
                {quickZoneModalItem && (
                    <ModernModal
                        isOpen={!!quickZoneModalItem}
                        onClose={() => setQuickZoneModalItem(null)}
                        title={`Restricción de Zonas: SKU ${quickZoneModalItem.sku}`}
                        subtitle={quickZoneModalItem.name}
                        size="small"
                    >
                        <div className="p-6 space-y-4">
                            <p className="text-xs text-gray-300">
                                Selecciona en qué zonas comerciales estará disponible este producto en el catálogo de los clientes:
                            </p>

                            {/* Botón Todas las Zonas */}
                            <button
                                type="button"
                                onClick={() => setQuickZoneSelected([])}
                                className={`w-full p-2.5 rounded-xl border text-xs font-bold transition-all text-left flex items-center justify-between ${
                                    quickZoneSelected.length === 0 || quickZoneSelected.includes('TODAS')
                                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-md'
                                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <Globe className="w-4 h-4 text-emerald-400" />
                                    <span>Venta Global (Disponible en Todas las Zonas)</span>
                                </div>
                                {(quickZoneSelected.length === 0 || quickZoneSelected.includes('TODAS')) && <Check className="w-4 h-4 text-emerald-400" />}
                            </button>

                            <div className="pt-2 border-t border-gray-800">
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">O limitar solo a zonas específicas:</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {availableShopZones.map(zone => {
                                        const isSelected = quickZoneSelected.includes(zone);
                                        return (
                                            <button
                                                key={zone}
                                                type="button"
                                                onClick={() => {
                                                    let next = quickZoneSelected.filter(z => z !== 'TODAS');
                                                    if (isSelected) {
                                                        next = next.filter(z => z !== zone);
                                                    } else {
                                                        next.push(zone);
                                                    }
                                                    setQuickZoneSelected(next);
                                                }}
                                                className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-left flex items-center justify-between ${
                                                    isSelected
                                                        ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-md'
                                                        : 'bg-gray-800/80 border-gray-700 text-gray-400 hover:border-gray-600'
                                                }`}
                                            >
                                                <span>{zone}</span>
                                                {isSelected && <Check className="w-3.5 h-3.5 text-blue-400" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                                <button
                                    type="button"
                                    onClick={() => setQuickZoneModalItem(null)}
                                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-bold transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveQuickZones}
                                    className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-900/40 flex items-center gap-1.5"
                                >
                                    <Save className="w-3.5 h-3.5" />
                                    <span>Guardar Zonas</span>
                                </button>
                            </div>
                        </div>
                    </ModernModal>
                )}

                {/* Modal para Crear / Editar Producto en Catálogo */}
                {newItem && (
                    <ModernModal
                        isOpen={!!newItem}
                        onClose={() => { setNewItem(null); setEditingItem(null); }}
                        title={editingItem ? "Editar Producto" : "Nuevo Producto"}
                        subtitle="Gestión de catálogo de productos"
                        size="medium"
                    >
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="col-span-full">
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Imagen del Producto</label>
                                    <div className="border-2 border-dashed border-gray-700 rounded-lg p-4 text-center hover:border-emerald-500 transition-colors cursor-pointer relative">
                                        <input
                                            type="file"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            onChange={e => {
                                                if (e.target.files && e.target.files[0]) {
                                                    setNewItem({ ...newItem, imageFile: e.target.files[0] });
                                                }
                                            }}
                                            accept="image/*"
                                        />
                                        {newItem.imageFile ? (
                                            <div className="flex items-center justify-center gap-2 text-emerald-400">
                                                <Image className="w-5 h-5" />
                                                <span className="text-sm font-bold">{newItem.imageFile.name}</span>
                                            </div>
                                        ) : (
                                            <div className="text-gray-500">
                                                <Image className="w-6 h-6 mx-auto mb-1 opacity-50" />
                                                <p className="text-xs">Haz clic para subir imagen</p>
                                            </div>
                                        )}
                                    </div>
                                    {newItem.image_url && !newItem.imageFile && (
                                        <div className="mt-2 flex items-center gap-2">
                                            <img src={newItem.image_url} alt="Current" className="h-12 w-12 rounded object-cover border border-gray-700" />
                                            <span className="text-xs text-gray-500">Imagen actual</span>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">SKU</label>
                                    <input
                                        placeholder="Ej: 7214"
                                        disabled={editingItem}
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-emerald-500 outline-none disabled:opacity-50"
                                        value={newItem.sku || ''}
                                        onChange={e => setNewItem({ ...newItem, sku: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Nombre</label>
                                    <input
                                        placeholder="Nombre del producto"
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-emerald-500 outline-none"
                                        value={newItem.name || ''}
                                        onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Precio Base ($)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-emerald-500 outline-none"
                                        value={newItem.base_price || ''}
                                        onChange={e => setNewItem({ ...newItem, base_price: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Categoría</label>
                                    <select
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-emerald-500 outline-none"
                                        value={newItem.category || 'Cerveza'}
                                        onChange={e => setNewItem({ ...newItem, category: e.target.value })}
                                    >
                                        <option value="Cerveza">Cerveza</option>
                                        <option value="Refresco">Refresco</option>
                                        <option value="Agua">Agua</option>
                                        <option value="Otros">Otros</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2 flex items-center justify-between">
                                        <span>Marca del Producto</span>
                                        <span className="text-[10px] text-blue-400 font-normal">Filtro de la Tienda</span>
                                    </label>
                                    <select
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-emerald-500 outline-none"
                                        value={newItem.brand || ''}
                                        onChange={e => setNewItem({ ...newItem, brand: e.target.value })}
                                    >
                                        <option value="">-- Sin Marca / General --</option>
                                        {shopBrandsList.map(b => (
                                            <option key={b.id || b.name} value={b.name}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex items-center">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={newItem.is_active == 1}
                                            onChange={e => setNewItem({ ...newItem, is_active: e.target.checked ? 1 : 0 })}
                                            className="w-4 h-4 rounded border-gray-700 text-emerald-500 focus:ring-emerald-500 bg-gray-900"
                                        />
                                        <span className="text-gray-300 text-sm font-semibold">Producto Activo en Tienda</span>
                                    </label>
                                </div>

                                {/* SELECTOR VISUAL DE RESTRICCIÓN DE ZONAS */}
                                <div className="col-span-full pt-3 border-t border-gray-800 space-y-2">
                                    <label className="block text-sm font-semibold text-gray-200 flex items-center justify-between">
                                        <span className="flex items-center gap-1.5">
                                            <MapPin className="w-4 h-4 text-emerald-400" />
                                            <span>Restricción de Zonas Comerciales</span>
                                        </span>
                                        <span className="text-xs font-normal text-gray-400">
                                            {(!newItem.allowed_zones || newItem.allowed_zones === '' || newItem.allowed_zones.toUpperCase() === 'TODAS')
                                                ? '● Disponible en todas las zonas'
                                                : `Limitado a: ${newItem.allowed_zones}`}
                                        </span>
                                    </label>

                                    {/* Botones de selección rápida de zona */}
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => setNewItem({ ...newItem, allowed_zones: '' })}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                                (!newItem.allowed_zones || newItem.allowed_zones === '' || newItem.allowed_zones.toUpperCase() === 'TODAS')
                                                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                                                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'
                                            }`}
                                        >
                                            Todas las Zonas (Global)
                                        </button>
                                        {availableShopZones.map(zone => {
                                            const currentZones = (newItem.allowed_zones || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
                                            const isSelected = currentZones.includes(zone);
                                            return (
                                                <button
                                                    key={zone}
                                                    type="button"
                                                    onClick={() => {
                                                        let next = [...currentZones];
                                                        if (isSelected) {
                                                            next = next.filter(z => z !== zone);
                                                        } else {
                                                            next.push(zone);
                                                        }
                                                        setNewItem({ ...newItem, allowed_zones: next.join(', ') });
                                                    }}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                                        isSelected
                                                            ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                                                            : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'
                                                    }`}
                                                >
                                                    {zone}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <input
                                        placeholder="O escribe zonas separadas por coma: CENTRO, FORANEO..."
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-emerald-500 outline-none text-xs font-mono"
                                        value={newItem.allowed_zones || ''}
                                        onChange={e => setNewItem({ ...newItem, allowed_zones: e.target.value })}
                                    />
                                    <p className="text-[11px] text-gray-400">
                                        Si se deja vacío o "TODAS", el producto se venderá en todas las zonas. Si seleccionas zonas específicas, solo los clientes de esas zonas podrán verlo y pedirlo en la tienda.
                                    </p>
                                </div>

                                {/* PRESENTACIONES DE VENTA (MEDIAS CAJAS / PAQUETES) */}
                                <div className="col-span-full pt-3 border-t border-gray-800 space-y-2.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-200">
                                                📦 Presentaciones de Venta (sin duplicar SKU)
                                            </label>
                                            <p className="text-[11px] text-gray-400">
                                                Configura si este SKU se vende por Caja, Media Caja o Paquete. En la tienda, si el cliente elige una fracción, la etiqueta roja de la imagen se actualiza automáticamente con las piezas configuradas.
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => setNewItem({
                                                    ...newItem,
                                                    presentations: [
                                                        { code: 'BOX', label: 'Caja completa', divisor: 1, pieces_count: 0, sub_label: 'CAJA', custom_price: '', is_default: 1 },
                                                        { code: 'HALF_BOX', label: 'Media Caja', divisor: 2, pieces_count: 0, sub_label: 'MEDIA CAJA', custom_price: '', is_default: 0 }
                                                    ]
                                                })}
                                                className="px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/40 rounded-lg text-[11px] font-bold"
                                            >
                                                + Media Caja (÷2)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setNewItem({
                                                    ...newItem,
                                                    presentations: [
                                                        { code: 'BOX', label: 'Caja (30 pzas)', divisor: 1, pieces_count: 30, sub_label: '6 PQ DE 5 PZ', custom_price: '', is_default: 1 },
                                                        { code: 'PACK', label: 'Paquete (5 pzas)', divisor: 6, pieces_count: 5, sub_label: '1 PAQUETE', custom_price: '', is_default: 0 }
                                                    ]
                                                })}
                                                className="px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 border border-amber-500/40 rounded-lg text-[11px] font-bold"
                                            >
                                                + 6 Paq × 5 pzas
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setNewItem({
                                                    ...newItem,
                                                    presentations: [
                                                        { code: 'BOX', label: 'Caja (50 pzas)', divisor: 1, pieces_count: 50, sub_label: '5 PQ DE 10 PZ', custom_price: '', is_default: 1 },
                                                        { code: 'PACK', label: 'Paquete (10 pzas)', divisor: 5, pieces_count: 10, sub_label: '1 PAQUETE', custom_price: '', is_default: 0 }
                                                    ]
                                                })}
                                                className="px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 border border-amber-500/40 rounded-lg text-[11px] font-bold"
                                            >
                                                + 5 Paq × 10 pzas
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const curr = Array.isArray(newItem.presentations) ? [...newItem.presentations] : [];
                                                    curr.push({
                                                        code: `PRES_${curr.length + 1}`,
                                                        label: '',
                                                        divisor: 1,
                                                        pieces_count: 0,
                                                        sub_label: '',
                                                        custom_price: '',
                                                        is_default: curr.length === 0 ? 1 : 0
                                                    });
                                                    setNewItem({ ...newItem, presentations: curr });
                                                }}
                                                className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 rounded-lg text-[11px] font-bold"
                                            >
                                                + Fila
                                            </button>
                                        </div>
                                    </div>

                                    {Array.isArray(newItem.presentations) && newItem.presentations.length > 0 && (
                                        <div className="space-y-2 bg-gray-900/70 p-3 rounded-xl border border-gray-800">
                                            {newItem.presentations.map((pres, pIdx) => (
                                                <div key={pIdx} className="grid grid-cols-12 gap-2 items-center bg-gray-800/80 p-2 rounded-lg border border-gray-700/70">
                                                    <div className="col-span-3">
                                                        <label className="text-[10px] text-gray-400 block">Nombre</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Ej: Paquete (5 pzas)"
                                                            value={pres.label || ''}
                                                            onChange={e => {
                                                                const next = [...newItem.presentations];
                                                                next[pIdx] = { ...next[pIdx], label: e.target.value };
                                                                setNewItem({ ...newItem, presentations: next });
                                                            }}
                                                            className="w-full bg-gray-900 border border-gray-700 text-white px-2 py-1 rounded text-xs"
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <label className="text-[10px] text-gray-400 block">Divisor caja</label>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            min="0.01"
                                                            value={pres.divisor ?? 1}
                                                            onChange={e => {
                                                                const next = [...newItem.presentations];
                                                                next[pIdx] = { ...next[pIdx], divisor: e.target.value };
                                                                setNewItem({ ...newItem, presentations: next });
                                                            }}
                                                            className="w-full bg-gray-900 border border-gray-700 text-white px-2 py-1 rounded text-xs"
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <label className="text-[10px] text-gray-400 block">Piezas (foto)</label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={pres.pieces_count ?? 0}
                                                            onChange={e => {
                                                                const next = [...newItem.presentations];
                                                                next[pIdx] = { ...next[pIdx], pieces_count: e.target.value };
                                                                setNewItem({ ...newItem, presentations: next });
                                                            }}
                                                            className="w-full bg-gray-900 border border-gray-700 text-white px-2 py-1 rounded text-xs"
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <label className="text-[10px] text-gray-400 block">Etiqueta foto</label>
                                                        <input
                                                            type="text"
                                                            placeholder="1 PAQUETE"
                                                            value={pres.sub_label || ''}
                                                            onChange={e => {
                                                                const next = [...newItem.presentations];
                                                                next[pIdx] = { ...next[pIdx], sub_label: e.target.value };
                                                                setNewItem({ ...newItem, presentations: next });
                                                            }}
                                                            className="w-full bg-gray-900 border border-gray-700 text-white px-2 py-1 rounded text-xs"
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <label className="text-[10px] text-gray-400 block">Precio fijo (opc)</label>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            placeholder="Auto"
                                                            value={pres.custom_price ?? ''}
                                                            onChange={e => {
                                                                const next = [...newItem.presentations];
                                                                next[pIdx] = { ...next[pIdx], custom_price: e.target.value };
                                                                setNewItem({ ...newItem, presentations: next });
                                                            }}
                                                            className="w-full bg-gray-900 border border-gray-700 text-white px-2 py-1 rounded text-xs"
                                                        />
                                                    </div>
                                                    <div className="col-span-1 flex justify-end pt-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const next = newItem.presentations.filter((_, idx) => idx !== pIdx);
                                                                setNewItem({ ...newItem, presentations: next });
                                                            }}
                                                            className="text-red-400 hover:text-red-300 text-xs font-bold px-1.5 py-1"
                                                            title="Quitar presentación"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                                <button
                                    onClick={() => { setNewItem(null); setEditingItem(null); }}
                                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors font-bold text-xs"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => handleSave(newItem, !editingItem)}
                                    className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-lg transition-all flex items-center gap-2 font-bold text-xs shadow-lg shadow-emerald-900/40"
                                >
                                    <Save className="w-4 h-4" /> Guardar Producto
                                </button>
                            </div>
                        </div>
                    </ModernModal>
                )}
            </div>
        );
    };

    // ========================================================================
    // FUNCIONES RENDER - CLIENTES (SEGÚN CÓDIGO ORIGINAL)
    // ========================================================================

    const renderClients = () => {
        const filteredData = data.filter(item =>
            !searchTerm ||
            item.client_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.gec?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.business_name?.toLowerCase().includes(searchTerm.toLowerCase())
        );

        return (
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                    <div className="flex gap-2 w-full md:w-auto">
                        <button
                            onClick={() => { setShowClientPassword(false); setNewItem({ client_code: '', password: '', phone: '', gec: 'Bronce', is_active: 1 }); }}
                            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-1.5 rounded-lg shadow-lg shadow-blue-900/40 hover:shadow-blue-900/60 transition-all flex items-center justify-center gap-1.5 font-bold text-sm"
                        >
                            <Plus className="w-4 h-4" /> Nuevo Cliente
                        </button>
                        <button
                            onClick={() => { setShowBulkUpload(true); setUploadStats(null); }}
                            className="flex-1 bg-gray-800 text-blue-400 border border-blue-900/50 px-4 py-1.5 rounded-lg hover:bg-blue-900/20 transition-all flex items-center justify-center gap-1.5 font-bold text-sm"
                        >
                            <Upload className="w-4 h-4" /> Carga Masiva (CSV)
                        </button>
                    </div>
                    <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar cliente por código o teléfono..." />
                </div>

                {/* Modal para Carga Masiva */}
                {showBulkUpload && (
                    <ModernModal
                        isOpen={showBulkUpload}
                        onClose={() => setShowBulkUpload(false)}
                        title="Carga Masiva de Clientes"
                        subtitle="Sube un archivo CSV con tus clientes"
                        size="small"
                    >
                        <div className="p-6 space-y-4">
                            {!uploadStats ? (
                                <>
                                    <div className="bg-blue-900/20 border border-blue-900/50 p-4 rounded-lg text-sm text-blue-300">
                                        <p className="font-bold mb-1">Instrucciones:</p>
                                        <p>El archivo CSV debe tener las columnas:</p>
                                        <p className="font-mono mt-1 text-[10px] bg-black/40 p-1.5 rounded">client_code, password, is_active</p>
                                        <p className="mt-2 text-[10px] opacity-70">* El nivel GEC se sincroniza automáticamente de la base de datos maestra.</p>
                                    </div>
                                    <div className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center hover:border-blue-500 transition-colors cursor-pointer relative">
                                        <input
                                            type="file"
                                            accept=".csv"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            onChange={e => e.target.files[0] && handleBulkUpload(e.target.files[0])}
                                        />
                                        <Upload className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                                        <p className="text-gray-300 font-bold text-sm">Haz clic para subir CSV</p>
                                        <p className="text-gray-500 text-xs mt-1">O arrastra el archivo aquí</p>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="bg-gray-800/50 p-3 rounded-lg text-center">
                                            <p className="text-[10px] text-gray-500 uppercase">Creados</p>
                                            <p className="text-xl font-bold text-green-400">{uploadStats.created}</p>
                                        </div>
                                        <div className="bg-gray-800/50 p-3 rounded-lg text-center">
                                            <p className="text-[10px] text-gray-500 uppercase">Actualizados</p>
                                            <p className="text-xl font-bold text-blue-400">{uploadStats.updated}</p>
                                        </div>
                                        <div className="bg-gray-800/50 p-3 rounded-lg text-center">
                                            <p className="text-[10px] text-gray-500 uppercase">Errores</p>
                                            <p className="text-xl font-bold text-red-400">{uploadStats.errors}</p>
                                        </div>
                                    </div>
                                    {uploadStats.details?.length > 0 && (
                                        <div className="max-h-40 overflow-y-auto text-[10px] bg-red-900/10 p-2 rounded border border-red-900/20 text-red-300 font-mono">
                                            {uploadStats.details.map((d, i) => <div key={i}>{d}</div>)}
                                        </div>
                                    )}
                                    <button
                                        onClick={() => setShowBulkUpload(false)}
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition-colors"
                                    >
                                        Cerrar y Ver Resultados
                                    </button>
                                </div>
                            )}
                        </div>
                    </ModernModal>
                )}

                {/* Modal para Clientes */}
                {newItem && (
                    <ModernModal
                        isOpen={!!newItem}
                        onClose={() => setNewItem(null)}
                        title={editingItem ? "Editar Cliente" : "Nuevo Cliente"}
                        subtitle="Gestionar acceso, contraseña y teléfono del cliente"
                        size="medium"
                    >
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Código Cliente</label>
                                    <input
                                        placeholder="12345"
                                        disabled={editingItem}
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all disabled:opacity-50"
                                        value={newItem.client_code || ''}
                                        onChange={e => setNewItem({ ...newItem, client_code: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Nueva Contraseña</label>
                                    <div className="relative">
                                        <input
                                            type={showClientPassword ? "text" : "password"}
                                            placeholder={editingItem ? "Dejar vacío si no cambia" : "Contraseña"}
                                            className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 pr-10 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                                            value={newItem.password || ''}
                                            onChange={e => setNewItem({ ...newItem, password: e.target.value })}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowClientPassword(!showClientPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                        >
                                            {showClientPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Teléfono (WhatsApp / Contacto)</label>
                                    <div className="relative">
                                        <Phone className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <input
                                            type="tel"
                                            placeholder="Ej. 2221234567"
                                            className="w-full bg-gray-800 border border-gray-700 text-white pl-9 p-2.5 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-mono"
                                            value={newItem.phone || ''}
                                            onChange={e => setNewItem({ ...newItem, phone: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Nivel GEC (Auto)</label>
                                    <input
                                        disabled
                                        className="w-full bg-gray-900 border border-gray-800 text-gray-500 p-2.5 rounded-lg outline-none cursor-not-allowed italic"
                                        value={newItem.gec || 'Sincronizando...'}
                                    />
                                    <p className="text-[10px] text-gray-500 mt-1">Se actualiza automáticamente desde la base de datos maestra.</p>
                                </div>

                                <div className="flex items-center md:col-span-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={newItem.is_active == 1}
                                            onChange={e => setNewItem({ ...newItem, is_active: e.target.checked ? 1 : 0 })}
                                            className="w-4 h-4 rounded border-gray-700"
                                        />
                                        <span className="text-gray-300">Cliente Activo en Tienda</span>
                                    </label>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                                <button
                                    onClick={() => { setNewItem(null); setEditingItem(null); }}
                                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => handleSave(newItem, !editingItem)}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <Save className="w-4 h-4" /> Guardar
                                </button>
                            </div>
                        </div>
                    </ModernModal>
                )}

                {/* Tabla de clientes */}
                <div className="overflow-x-auto rounded-xl border border-gray-800 shadow-xl bg-gray-950/60">
                    <table className="w-full min-w-[700px] text-left border-collapse">
                        <thead className="bg-gray-900 border-b border-gray-800">
                            <tr>
                                <th className="p-4 font-bold text-blue-400">Código</th>
                                <th className="p-4 font-bold text-blue-400">Teléfono</th>
                                <th className="p-4 font-bold text-blue-400">GEC</th>
                                <th className="p-4 font-bold text-blue-400">Último Login</th>
                                <th className="p-4 font-bold text-blue-400">Activo</th>
                                <th className="p-4 font-bold text-blue-400">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredData.map(item => (
                                <tr key={item.id ? `cli-${item.id}` : `cli-code-${item.client_code}`} className="border-b border-gray-800 hover:bg-gray-900 transition-colors">
                                    <td className="p-4 font-mono text-white">
                                        <div>{item.client_code}</div>
                                        {(item.business_name || item.contact_name) && (
                                            <div className="text-[11px] text-gray-500 font-sans truncate max-w-[180px]">
                                                {item.business_name || item.contact_name}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-4 font-mono text-sm text-gray-300">
                                        {item.phone || <span className="text-gray-600 italic text-xs">Sin teléfono</span>}
                                    </td>
                                    <td className="p-4">
                                        <span className="bg-blue-900/50 text-blue-300 px-2 py-1 rounded text-xs border border-blue-800">{item.gec || 'N/A'}</span>
                                    </td>
                                    <td className="p-4 text-sm text-gray-300">{item.last_login || '-'}</td>
                                    <td className="p-4">
                                        {item.is_active == 1 ? (
                                            <Check className="text-green-500 w-4 h-4" />
                                        ) : (
                                            <X className="text-red-500 w-4 h-4" />
                                        )}
                                    </td>
                                    <td className="p-4">
                                        <button
                                            onClick={() => { setShowClientPassword(false); setEditingItem(item); setNewItem({ ...item, password: '' }); }}
                                            className="text-blue-400 hover:bg-blue-900/30 p-2 rounded-lg transition-colors"
                                            title="Editar teléfono / contraseña"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // ========================================================================
    // FUNCIONES RENDER - GEC (SEGÚN CÓDIGO ORIGINAL CON CAMPOS EDITABLES)
    // ========================================================================

    const renderGEC = () => {
        return (
            <div className="space-y-6">
                <h3 className="text-white font-bold text-xl">Configuración de Descuentos GEC</h3>
                <p className="text-gray-400 text-sm">* Los cambios se guardan automáticamente al salir del campo.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {gecOptions.map(level => {
                        const item = data.find(d => d.gec_level === level || d.nivel_gec === level);
                        return (
                            <div key={level} className="bg-gray-900 p-5 rounded-xl shadow-lg border border-gray-800 hover:border-purple-500/50 transition-all">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                                            <Award className="w-5 h-5 text-purple-400" />
                                        </div>
                                        <span className="text-xl font-bold text-white">{level}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        step="0.5"
                                        placeholder="5.0"
                                        className="flex-1 bg-gray-800 border border-gray-700 text-white p-2.5 text-lg rounded-lg focus:border-purple-500 outline-none"
                                        value={item?.discount_percentage || ''}
                                        onChange={e => {
                                            const updated = { ...item, gec_level: level, discount_percentage: e.target.value };
                                            handleSave(updated, !item?.id);
                                        }}
                                    />
                                    <span className="text-purple-400 font-bold text-lg">%</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // ========================================================================
    // FUNCIONES RENDER - CATÁLOGO REDENCIÓN (SKU SIMPLE SEGÚN ORIGINAL)
    // ========================================================================

    const renderRedemptionCatalog = () => {
        const filteredData = data.filter(item =>
            !searchTerm ||
            item.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.product_name || item.name)?.toLowerCase().includes(searchTerm.toLowerCase())
        );

        return (
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                    <button
                        onClick={() => setNewItem({ sku: '', points_required: 100, is_active: 1 })}
                        className="bg-gradient-to-r from-pink-600 to-rose-600 text-white px-4 py-1.5 rounded-lg shadow-lg shadow-pink-900/40 hover:shadow-pink-900/60 transition-all flex items-center justify-center gap-1.5 font-bold text-sm w-full md:w-auto"
                    >
                        <Plus className="w-4 h-4" /> Agregar Producto a Canje
                    </button>
                    <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar SKU..." />
                </div>

                {/* Modal para Catálogo de Redención */}
                {newItem && (
                    <ModernModal
                        isOpen={!!newItem}
                        onClose={() => setNewItem(null)}
                        title="Agregar Producto Canjeable"
                        subtitle="Configurar producto del catálogo para canje con puntos"
                        size="small"
                    >
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">SKU del Producto</label>
                                    <input
                                        type="text"
                                        list="products-list-redemption"
                                        placeholder="Escribir SKU o nombre del producto..."
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition-all"
                                        value={newItem.sku || ''}
                                        onChange={e => setNewItem({ ...newItem, sku: e.target.value })}
                                    />
                                    <datalist id="products-list-redemption">
                                        {productsList.map(p => (
                                            <option key={p.sku} value={p.sku}>{p.name}</option>
                                        ))}
                                    </datalist>
                                    <p className="text-xs text-gray-500 mt-1">Escribe para buscar o selecciona de la lista</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Puntos Requeridos</label>
                                    <input
                                        type="number"
                                        placeholder="100"
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition-all"
                                        value={newItem.points_required || ''}
                                        onChange={e => setNewItem({ ...newItem, points_required: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                                <button
                                    onClick={() => setNewItem(null)}
                                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => handleSave(newItem, true)}
                                    className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <Save className="w-4 h-4" /> Guardar
                                </button>
                            </div>
                        </div>
                    </ModernModal>
                )}

                {/* Lista simple de SKUs con puntos */}
                <div className="space-y-2">
                    {filteredData.length === 0 ? (
                        <EmptyState
                            icon={Gift}
                            title="No hay productos canjeables"
                            description="Agrega productos del catálogo para que estén disponibles para canje"
                        />
                    ) : (
                        filteredData.map(item => (
                            <div key={item.id} className="bg-gray-900 p-4 rounded-lg border border-gray-800 hover:border-pink-500/50 transition-all flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div>
                                        <div className="font-mono font-bold text-white text-base">{item.sku}</div>
                                        {(item.product_name || item.name) && (
                                            <div className="text-gray-400 text-xs">{item.product_name || item.name}</div>
                                        )}
                                    </div>
                                    <span className="font-bold text-yellow-500 text-lg">{item.points_required} pts</span>
                                </div>
                                <button
                                    onClick={() => handleDelete(item.id)}
                                    className="text-red-400 hover:bg-red-900/30 p-2 rounded-lg transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    // ========================================================================
    // FUNCIONES RENDER - OTRAS SECCIONES
    // ========================================================================

    const renderPromotions = () => {
        const filteredData = data.filter(item =>
            !searchTerm ||
            item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.promo_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.skus && item.skus.some(sku => sku.toLowerCase().includes(searchTerm.toLowerCase())))
        );

        return (
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                    <button
                        onClick={() => setNewItem({
                            name: '',
                            skus: [],
                            promo_type: 'amount_off',
                            discount_amount: '',
                            zones: '',
                            buy_n: 0,
                            pay_m: 0,
                            start_date: '',
                            end_date: '',
                            is_active: 1
                        })}
                        className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white px-4 py-1.5 rounded-lg shadow-lg shadow-cyan-900/40 hover:shadow-cyan-900/60 transition-all flex items-center justify-center gap-1.5 font-bold text-sm w-full md:w-auto"
                    >
                        <Plus className="w-4 h-4" /> Nueva Promoción
                    </button>
                    <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar promoción..." />
                </div>

                {/* Modal para Promociones */}
                {newItem && (
                    <ModernModal
                        isOpen={!!newItem}
                        onClose={() => setNewItem(null)}
                        title={editingItem ? "Editar Promoción" : "Nueva Promoción"}
                        subtitle="Configurar promoción para producto"
                        size="medium"
                    >
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="col-span-full">
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Nombre de la Promoción</label>
                                    <input
                                        placeholder="Ej: Promo Verano 2026"
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                                        value={newItem.name || ''}
                                        onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                                    />
                                </div>

                                <div className="col-span-full">
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Productos (SKUs)</label>
                                    <input
                                        type="text"
                                        list="products-list-promos"
                                        placeholder="Seleccionar SKUs aplicables..."
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all mb-2"
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && e.target.value) {
                                                const skus = newItem.skus || [];
                                                if (!skus.includes(e.target.value)) {
                                                    setNewItem({ ...newItem, skus: [...skus, e.target.value] });
                                                }
                                                e.target.value = '';
                                            }
                                        }}
                                        onChange={e => {
                                            // Auto-add on select from datalist
                                            const sku = e.target.value;
                                            if (productsList.find(p => p.sku === sku)) {
                                                const skus = newItem.skus || [];
                                                if (!skus.includes(sku)) {
                                                    setNewItem({ ...newItem, skus: [...skus, sku] });
                                                }
                                                e.target.value = '';
                                            }
                                        }}
                                    />
                                    <datalist id="products-list-promos">
                                        {productsList.map(p => (
                                            <option key={p.sku} value={p.sku}>{p.name}</option>
                                        ))}
                                    </datalist>
                                    {/* SKUs seleccionados */}
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {(newItem.skus || []).map(sku => (
                                            <span key={sku} className="bg-cyan-900/40 text-cyan-300 px-2 py-1 rounded text-xs flex items-center gap-1">
                                                {sku}
                                                <X
                                                    className="w-3 h-3 cursor-pointer hover:text-red-400"
                                                    onClick={() => setNewItem({ ...newItem, skus: newItem.skus.filter(s => s !== sku) })}
                                                />
                                            </span>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">Presiona Enter para agregar cada SKU</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Tipo de Promoción</label>
                                    <select
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                                        value={newItem.promo_type || 'amount_off'}
                                        onChange={e => {
                                            const newType = e.target.value;
                                            const updates = { promo_type: newType };

                                            // Auto-configurar valores para 2x1 y 3x2
                                            if (newType === '2x1') {
                                                updates.buy_n = 2;
                                                updates.pay_m = 1;
                                                updates.discount_amount = 0;
                                            } else if (newType === '3x2') {
                                                updates.buy_n = 3;
                                                updates.pay_m = 2;
                                                updates.discount_amount = 0;
                                            } else {
                                                updates.buy_n = 0;
                                                updates.pay_m = 0;
                                            }

                                            setNewItem({ ...newItem, ...updates });
                                        }}
                                    >
                                        <option value="amount_off">Descuento $</option>
                                        <option value="percent_off">Descuento %</option>
                                        <option value="2x1">2x1</option>
                                        <option value="3x2">3x2</option>
                                    </select>
                                </div>

                                {/* Campo de valor - siempre visible, se deshabilita para 2x1/3x2 */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">
                                        {newItem.promo_type === '2x1' || newItem.promo_type === '3x2' ?
                                            'Descuento (automático)' :
                                            `Valor ${newItem.promo_type === 'percent_off' ? '(%)' : '($)'}`
                                        }
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        disabled={newItem.promo_type === '2x1' || newItem.promo_type === '3x2'}
                                        placeholder={
                                            newItem.promo_type === '2x1' ? 'Compra 2, paga 1' :
                                                newItem.promo_type === '3x2' ? 'Compra 3, paga 2' :
                                                    newItem.promo_type === 'percent_off' ? '15' : '10'
                                        }
                                        className={`w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all ${(newItem.promo_type === '2x1' || newItem.promo_type === '3x2') ? 'opacity-50 cursor-not-allowed' : ''
                                            }`}
                                        value={newItem.discount_amount || ''}
                                        onChange={e => setNewItem({ ...newItem, discount_amount: e.target.value })}
                                    />
                                </div>

                                <div className="col-span-full space-y-2">
                                    <label className="block text-sm font-semibold text-gray-300 flex items-center justify-between">
                                        <span>Zonas Comerciales Aplicables (Catálogo Oficial)</span>
                                        <span className="text-xs text-gray-400 font-normal">
                                            {!newItem.zones ? '● Aplica en todas las zonas' : `Zonas: ${newItem.zones}`}
                                        </span>
                                    </label>
                                    <div className="flex flex-wrap gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setNewItem({ ...newItem, zones: '' })}
                                            className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                                                !newItem.zones
                                                    ? 'bg-cyan-600 text-white border-cyan-500'
                                                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'
                                            }`}
                                        >
                                            Todas las Zonas
                                        </button>
                                        {availableShopZones.map(zone => {
                                            const currentPromoZones = (newItem.zones || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
                                            const isSelected = currentPromoZones.includes(zone);
                                            return (
                                                <button
                                                    key={zone}
                                                    type="button"
                                                    onClick={() => {
                                                        let next = [...currentPromoZones];
                                                        if (isSelected) next = next.filter(z => z !== zone);
                                                        else next.push(zone);
                                                        setNewItem({ ...newItem, zones: next.join(',') });
                                                    }}
                                                    className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                                                        isSelected
                                                            ? 'bg-cyan-600 text-white border-cyan-500'
                                                            : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'
                                                    }`}
                                                >
                                                    {zone}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <input
                                        placeholder="Ej: CENTRO,FORANEO (o selecciona de los botones de arriba)"
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all text-xs font-mono"
                                        value={newItem.zones || ''}
                                        onChange={e => setNewItem({ ...newItem, zones: e.target.value })}
                                    />
                                    <p className="text-xs text-gray-500">Dejar vacío para aplicar a todas las zonas</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Fecha Inicio</label>
                                    <input
                                        type="date"
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                                        value={newItem.start_date || ''}
                                        onChange={e => setNewItem({ ...newItem, start_date: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Fecha Fin</label>
                                    <input
                                        type="date"
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                                        value={newItem.end_date || ''}
                                        onChange={e => setNewItem({ ...newItem, end_date: e.target.value })}
                                    />
                                </div>

                                <div className="flex items-center col-span-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={newItem.is_active == 1}
                                            onChange={e => setNewItem({ ...newItem, is_active: e.target.checked ? 1 : 0 })}
                                            className="w-4 h-4 rounded border-gray-700"
                                        />
                                        <span className="text-gray-300">Activo</span>
                                    </label>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                                <button
                                    onClick={() => { setNewItem(null); setEditingItem(null); }}
                                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => handleSave(newItem, !editingItem)}
                                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <Save className="w-4 h-4" /> Guardar
                                </button>
                            </div>
                        </div>
                    </ModernModal>
                )}

                {/* Tabla de promociones */}
                <div className="overflow-x-auto rounded-xl border border-gray-800 shadow-xl bg-gray-950/60">
                    <table className="w-full min-w-[750px] text-left border-collapse">
                        <thead className="bg-gray-900 border-b border-gray-800">
                            <tr>
                                <th className="p-4 font-bold text-cyan-400">Nombre</th>
                                <th className="p-4 font-bold text-cyan-400">Productos</th>
                                <th className="p-4 font-bold text-cyan-400">Descuento</th>
                                <th className="p-4 font-bold text-cyan-400">Zonas</th>
                                <th className="p-4 font-bold text-cyan-400">Vigencia</th>
                                <th className="p-4 font-bold text-cyan-400">Activo</th>
                                <th className="p-4 font-bold text-cyan-400">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredData.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="p-8">
                                        <EmptyState
                                            icon={Tag}
                                            title="No hay promociones"
                                            description="Crea promociones para tus productos"
                                        />
                                    </td>
                                </tr>
                            ) : (
                                filteredData.map(item => (
                                    <tr key={item.id} className="border-b border-gray-800 hover:bg-gray-900 transition-colors">
                                        <td className="p-4 text-white font-semibold">{item.name || '-'}</td>
                                        <td className="p-4">
                                            {item.skus && item.skus.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {item.skus.slice(0, 3).map(sku => (
                                                        <span key={sku} className="bg-gray-800 text-cyan-300 px-2 py-0.5 rounded text-xs font-mono">
                                                            {sku}
                                                        </span>
                                                    ))}
                                                    {item.skus.length > 3 && (
                                                        <span className="text-gray-500 text-xs">+{item.skus.length - 3}</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-gray-500">-</span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            {item.promo_type === '2x1' ? (
                                                <span className="bg-purple-900/50 text-purple-300 px-2 py-1 rounded text-xs font-bold">2x1</span>
                                            ) : item.promo_type === '3x2' ? (
                                                <span className="bg-purple-900/50 text-purple-300 px-2 py-1 rounded text-xs font-bold">3x2</span>
                                            ) : item.promo_type === 'percent_off' ? (
                                                <span className="text-cyan-400 font-bold">{item.discount_amount}%</span>
                                            ) : item.promo_type === 'amount_off' ? (
                                                <span className="text-green-400 font-bold">${parseFloat(item.discount_amount || 0).toFixed(2)}</span>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-gray-300 text-sm">{item.zones || 'Todas'}</td>
                                        <td className="p-4 text-sm text-gray-400">
                                            {item.start_date ? `${item.start_date} → ${item.end_date || '∞'}` : '-'}
                                        </td>
                                        <td className="p-4">
                                            {item.is_active == 1 ? (
                                                <Check className="text-green-500 w-4 h-4" />
                                            ) : (
                                                <X className="text-red-500 w-4 h-4" />
                                            )}
                                        </td>
                                        <td className="p-4 flex gap-2">
                                            <button
                                                onClick={() => { setEditingItem(item); setNewItem({ ...item }); }}
                                                className="text-cyan-400 hover:bg-cyan-900/30 p-2 rounded-lg transition-colors"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="text-red-400 hover:bg-red-900/30 p-2 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };


    const renderSpecialPrices = () => {
        const filteredData = data.filter(item =>
            !searchTerm ||
            item.client_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.zone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.sku?.toLowerCase().includes(searchTerm.toLowerCase())
        );

        return (
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                    <button
                        onClick={() => setNewItem({ client_code: '', zone: '', sales_route: '', sku: '', special_price: '', start_date: '', end_date: '', is_active: 1 })}
                        className="bg-gradient-to-r from-amber-600 to-yellow-600 text-white px-4 py-1.5 rounded-lg shadow-lg shadow-amber-900/40 hover:shadow-amber-900/60 transition-all flex items-center justify-center gap-1.5 font-bold text-sm w-full md:w-auto"
                    >
                        <Plus className="w-4 h-4" /> Nuevo Precio Especial
                    </button>
                    <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar por cliente, zona o SKU..." />
                </div>

                {/* Modal para Precios Especiales */}
                {newItem && (
                    <ModernModal
                        isOpen={!!newItem}
                        onClose={() => setNewItem(null)}
                        title={editingItem ? "Editar Precio Especial" : "Nuevo Precio Especial"}
                        subtitle="Define precios por cliente, ruta o zona"
                        size="medium"
                    >
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="col-span-full">
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Aplicar a:</label>
                                    <select
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all"
                                        value={newItem.client_code ? 'cliente' : newItem.sales_route ? 'ruta' : newItem.zone ? 'zona' : 'cliente'}
                                        onChange={e => {
                                            const type = e.target.value;
                                            setNewItem({
                                                ...newItem,
                                                client_code: type === 'cliente' ? newItem.client_code : '',
                                                sales_route: type === 'ruta' ? newItem.sales_route : '',
                                                zone: type === 'zona' ? newItem.zone : ''
                                            });
                                        }}
                                    >
                                        <option value="cliente">Cliente Específico (Prioridad Alta)</option>
                                        <option value="ruta">Ruta de Ventas (Prioridad Media)</option>
                                        <option value="zona">Zona Comercial (Prioridad Baja)</option>
                                    </select>
                                </div>

                                {/* Campos Condicionales */}
                                {(newItem.client_code !== undefined && newItem.sales_route === '' && newItem.zone === '') || (newItem.client_code && !newItem.sales_route && !newItem.zone) ? (
                                    <div className="col-span-full">
                                        <label className="block text-sm font-semibold text-gray-300 mb-2">Código de Cliente</label>
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-4 h-4" />
                                                <input
                                                    placeholder="Ej: C12345"
                                                    className="w-full bg-gray-800 border border-gray-700 text-white pl-10 p-2.5 rounded-lg focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all"
                                                    value={newItem.client_code || ''}
                                                    onChange={e => setNewItem({ ...newItem, client_code: e.target.value, sales_route: '', zone: '' })}
                                                />
                                            </div>
                                            <button className="bg-gray-700 hover:bg-gray-600 text-white px-3 rounded-lg">
                                                <Search className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ) : null}

                                {newItem.sales_route !== undefined && newItem.sales_route !== '' || (newItem.sales_route === '' && !newItem.client_code && !newItem.zone) ? (
                                    <div className="col-span-full space-y-2">
                                        <label className="block text-sm font-semibold text-gray-300">Ruta de Ventas Oficial (`zonas_rutas`)</label>
                                        {allOfficialRoutes.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-gray-950/70 border border-gray-800 rounded-lg">
                                                {allOfficialRoutes.map(rt => (
                                                    <button
                                                        key={`${rt.zona}-${rt.ruta}`}
                                                        type="button"
                                                        onClick={() => setNewItem({ ...newItem, sales_route: rt.ruta, client_code: '', zone: '' })}
                                                        className={`px-2.5 py-1 rounded text-xs font-mono font-bold border transition-all ${
                                                            String(newItem.sales_route || '').toUpperCase() === rt.ruta
                                                                ? 'bg-amber-600 text-white border-amber-500'
                                                                : 'bg-gray-800 text-gray-300 border-gray-700 hover:border-amber-500/50'
                                                        }`}
                                                    >
                                                        {rt.ruta} <span className="text-[10px] opacity-75">({rt.zona})</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        <div className="relative">
                                            <MapIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-4 h-4" />
                                            <input
                                                placeholder="Ej: 101, RUTA-01"
                                                className="w-full bg-gray-800 border border-gray-700 text-white pl-10 p-2.5 rounded-lg focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all font-mono"
                                                value={newItem.sales_route || ''}
                                                onChange={e => setNewItem({ ...newItem, sales_route: e.target.value, client_code: '', zone: '' })}
                                            />
                                        </div>
                                    </div>
                                ) : null}

                                {newItem.zone !== undefined && newItem.zone !== '' || (newItem.zone === '' && !newItem.client_code && !newItem.sales_route) ? (
                                    <div className="col-span-full space-y-2">
                                        <label className="block text-sm font-semibold text-gray-300">Zona Comercial Oficial (`zonas_rutas`)</label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {availableShopZones.map(z => (
                                                <button
                                                    key={z}
                                                    type="button"
                                                    onClick={() => setNewItem({ ...newItem, zone: z, client_code: '', sales_route: '' })}
                                                    className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                                                        String(newItem.zone || '').toUpperCase() === z
                                                            ? 'bg-amber-600 text-white border-amber-500'
                                                            : 'bg-gray-800 text-gray-300 border-gray-700 hover:border-amber-500/50'
                                                    }`}
                                                >
                                                    {z}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="relative">
                                            <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-4 h-4" />
                                            <input
                                                placeholder="Ej: CENTRO"
                                                className="w-full bg-gray-800 border border-gray-700 text-white pl-10 p-2.5 rounded-lg focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all uppercase font-semibold"
                                                value={newItem.zone || ''}
                                                onChange={e => setNewItem({ ...newItem, zone: e.target.value.toUpperCase(), client_code: '', sales_route: '' })}
                                            />
                                        </div>
                                    </div>
                                ) : null}

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Producto (SKU)</label>
                                    <input
                                        type="text"
                                        list="products-list-special"
                                        placeholder="Escribir SKU o nombre..."
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all"
                                        value={newItem.sku || ''}
                                        onChange={e => setNewItem({ ...newItem, sku: e.target.value })}
                                    />
                                    <datalist id="products-list-special">
                                        {productsList.map(p => (
                                            <option key={p.sku} value={p.sku}>{p.name}</option>
                                        ))}
                                    </datalist>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Precio Especial ($)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="120.00"
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all"
                                        value={newItem.special_price || ''}
                                        onChange={e => setNewItem({ ...newItem, special_price: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Fecha Inicio</label>
                                    <input
                                        type="date"
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all"
                                        value={newItem.start_date || ''}
                                        onChange={e => setNewItem({ ...newItem, start_date: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Fecha Fin</label>
                                    <input
                                        type="date"
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all"
                                        value={newItem.end_date || ''}
                                        onChange={e => setNewItem({ ...newItem, end_date: e.target.value })}
                                    />
                                </div>

                                <div className="flex items-center col-span-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={newItem.is_active == 1}
                                            onChange={e => setNewItem({ ...newItem, is_active: e.target.checked ? 1 : 0 })}
                                            className="w-4 h-4 rounded border-gray-700"
                                        />
                                        <span className="text-gray-300">Activo</span>
                                    </label>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                                <button
                                    onClick={() => { setNewItem(null); setEditingItem(null); }}
                                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => handleSave(newItem, !editingItem)}
                                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <Save className="w-4 h-4" /> Guardar
                                </button>
                            </div>
                        </div>
                    </ModernModal>
                )}

                {/* Tabla de precios especiales */}
                <div className="overflow-x-auto rounded-xl border border-gray-800 shadow-xl bg-gray-950/60">
                    <table className="w-full min-w-[680px] text-left border-collapse">
                        <thead className="bg-gray-900 border-b border-gray-800">
                            <tr>
                                <th className="p-4 font-bold text-amber-400">Aplicado A</th>
                                <th className="p-4 font-bold text-amber-400">SKU</th>
                                <th className="p-4 font-bold text-amber-400">Precio Especial</th>
                                <th className="p-4 font-bold text-amber-400">Vigencia</th>
                                <th className="p-4 font-bold text-amber-400">Activo</th>
                                <th className="p-4 font-bold text-amber-400">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredData.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="p-8">
                                        <EmptyState
                                            icon={DollarSign}
                                            title="No hay precios especiales"
                                            description="Asigna precios especiales por cliente, ruta o zona"
                                        />
                                    </td>
                                </tr>
                            ) : (
                                filteredData.map(item => (
                                    <tr key={item.id} className="border-b border-gray-800 hover:bg-gray-900 transition-colors">
                                        <td className="p-4">
                                            {item.client_code ? (
                                                <div className="flex flex-col">
                                                    <span className="text-xs text-gray-400">Cliente</span>
                                                    <span className="font-mono text-white">{item.client_code}</span>
                                                </div>
                                            ) : item.sales_route ? (
                                                <div className="flex flex-col">
                                                    <span className="text-xs text-gray-400">Ruta</span>
                                                    <span className="font-mono text-cyan-300">{item.sales_route}</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col">
                                                    <span className="text-xs text-gray-400">Zona</span>
                                                    <span className="font-mono text-purple-300">{item.zone || 'Global'}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 font-mono text-cyan-400">{item.sku}</td>
                                        <td className="p-4 text-amber-400 font-bold text-lg">
                                            ${parseFloat(item.special_price).toFixed(2)}
                                        </td>
                                        <td className="p-4 text-gray-300 text-sm">
                                            {item.start_date && item.end_date ? (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-xs text-gray-400">
                                                        {new Date(item.start_date).toLocaleDateString('es-MX')}
                                                    </span>
                                                    <span className="text-xs text-gray-500">→</span>
                                                    <span className="text-xs text-gray-400">
                                                        {new Date(item.end_date).toLocaleDateString('es-MX')}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-gray-500 text-xs">Indefinido</span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            {item.is_active == 1 ? (
                                                <Check className="text-green-500 w-4 h-4" />
                                            ) : (
                                                <X className="text-red-500 w-4 h-4" />
                                            )}
                                        </td>
                                        <td className="p-4 flex gap-2">
                                            <button
                                                onClick={() => { setEditingItem(item); setNewItem({ ...item }); }}
                                                className="text-amber-400 hover:bg-amber-900/30 p-2 rounded-lg transition-colors"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="text-red-400 hover:bg-red-900/30 p-2 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };


    const renderRedemptions = () => {
        const filteredData = data.filter(item =>
            !searchTerm ||
            (item.client_name || item.client_code)?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.product_sku?.toLowerCase().includes(searchTerm.toLowerCase())
        );

        return (
            <div className="space-y-6">
                <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar por cliente, SKU o producto..." />

                <div className="overflow-x-auto rounded-xl border border-gray-800 shadow-xl bg-gray-950/60">
                    <table className="w-full min-w-[650px] text-left border-collapse">
                        <thead className="bg-gray-900 border-b border-gray-800">
                            <tr>
                                <th className="p-4 font-bold text-orange-400">Cliente</th>
                                <th className="p-4 font-bold text-orange-400">Producto</th>
                                <th className="p-4 font-bold text-orange-400">Puntos</th>
                                <th className="p-4 font-bold text-orange-400">Estado</th>
                                <th className="p-4 font-bold text-orange-400">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredData.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="p-8 text-center text-gray-500">
                                        No hay solicitudes de canje registradas
                                    </td>
                                </tr>
                            ) : (
                                filteredData.map(item => (
                                    <tr key={item.id} className="border-b border-gray-800 hover:bg-gray-900 transition-colors">
                                        <td className="p-4 text-white">
                                            <div className="font-semibold">{item.client_name || item.client_code}</div>
                                            {item.client_name && item.client_name !== item.client_code && (
                                                <div className="text-xs text-gray-500 font-mono">{item.client_code}</div>
                                            )}
                                        </td>
                                        <td className="p-4 text-gray-300">
                                            <div className="font-medium text-white">{item.product_name || item.product_sku}</div>
                                            {item.product_name && (
                                                <div className="text-xs text-gray-500 font-mono">SKU: {item.product_sku}</div>
                                            )}
                                        </td>
                                        <td className="p-4 text-yellow-500 font-bold">{item.points_used} pts</td>
                                        <td className="p-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                item.status === 'approved' ? 'bg-green-900/50 text-green-300 border border-green-800' :
                                                item.status === 'delivered' ? 'bg-blue-900/50 text-blue-300 border border-blue-800' :
                                                (item.status === 'cancelled' || item.status === 'rejected') ? 'bg-red-900/50 text-red-300 border border-red-800' :
                                                'bg-yellow-900/50 text-yellow-300 border border-yellow-800'
                                            }`}>
                                                {item.status === 'approved' ? 'Aprobado' :
                                                 item.status === 'delivered' ? 'Entregado' :
                                                 (item.status === 'cancelled' || item.status === 'rejected') ? 'Cancelado' : 'Pendiente'}
                                            </span>
                                        </td>
                                        <td className="p-4 flex gap-2">
                                            <button
                                                onClick={() => handleRedemptionStatus(item.id, 'approved', item.client_code)}
                                                className="text-green-400 hover:bg-green-900/30 p-2 rounded-lg transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                                                disabled={item.status !== 'pending'}
                                                title="Aprobar canje"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleRedemptionStatus(item.id, 'cancelled', item.client_code)}
                                                className="text-red-400 hover:bg-red-900/30 p-2 rounded-lg transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                                                disabled={item.status !== 'pending'}
                                                title="Cancelar canje (reembolsa puntos)"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderCoolerRefs = () => {
        const filteredData = data.filter(item =>
            !searchTerm ||
            (item.name || item.title)?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.description?.toLowerCase().includes(searchTerm.toLowerCase())
        );

        return (
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                    <button
                        onClick={() => setNewItem({ title: '', description: '', imageFile: null })}
                        className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-1.5 rounded-lg shadow-lg shadow-indigo-900/40 hover:shadow-indigo-900/60 transition-all flex items-center justify-center gap-1.5 font-bold text-sm w-full md:w-auto"
                    >
                        <Plus className="w-4 h-4" /> Nueva Referencia
                    </button>
                    <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar referencia..." />
                </div>

                {/* Modal para Nueva Referencia */}
                {newItem && (
                    <ModernModal
                        isOpen={!!newItem}
                        onClose={() => setNewItem(null)}
                        title="Nueva Referencia de Enfriador"
                        subtitle="Sube una foto de referencia para la ejecución de enfriadores"
                        size="medium"
                    >
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Título / Nombre</label>
                                    <input
                                        placeholder="Ej: Enfriador Cervecero Estándar"
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                        value={newItem.title || newItem.name || ''}
                                        onChange={e => setNewItem({ ...newItem, title: e.target.value, name: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Descripción (Opcional)</label>
                                    <textarea
                                        rows={3}
                                        placeholder="Ej: Acomodo correcto de producto, frente de lata visible..."
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all resize-none"
                                        value={newItem.description || ''}
                                        onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Foto de Referencia</label>
                                    <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center hover:border-indigo-500 transition-colors cursor-pointer relative">
                                        <input
                                            type="file"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            onChange={e => {
                                                if (e.target.files && e.target.files[0]) {
                                                    setNewItem({ ...newItem, imageFile: e.target.files[0] });
                                                }
                                            }}
                                            accept="image/*"
                                        />
                                        {newItem.imageFile ? (
                                            <div className="flex items-center justify-center gap-2 text-indigo-400">
                                                <Image className="w-6 h-6" />
                                                <span className="font-bold">{newItem.imageFile.name}</span>
                                            </div>
                                        ) : (
                                            <div className="text-gray-500">
                                                <Image className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                                <p>Haz clic o arrastra una imagen de referencia aquí</p>
                                            </div>
                                        )}
                                    </div>
                                    {(newItem.photo_url || newItem.image_url) && !newItem.imageFile && (
                                        <div className="mt-2">
                                            <p className="text-xs text-gray-400 mb-1">Imagen actual:</p>
                                            <img src={(newItem.photo_url || newItem.image_url)?.startsWith('/') ? (newItem.photo_url || newItem.image_url) : '/' + (newItem.photo_url || newItem.image_url)} alt="Current" className="h-20 rounded border border-gray-700 object-cover" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                                <button
                                    onClick={() => setNewItem(null)}
                                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => {
                                        if (!newItem.imageFile && !newItem.photo_url && !newItem.image_url) {
                                            alert('Debes seleccionar una imagen para la referencia.');
                                            return;
                                        }
                                        handleSave(newItem, true);
                                    }}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <Save className="w-4 h-4" /> Guardar
                                </button>
                            </div>
                        </div>
                    </ModernModal>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredData.length === 0 ? (
                        <EmptyState
                            icon={Sparkles}
                            title="No hay referencias de enfriadores"
                            description="Agrega imágenes de referencia"
                        />
                    ) : (
                        filteredData.map(item => (
                            <div key={item.id} className="group bg-gray-900 rounded-lg shadow-lg border border-gray-800 hover:border-indigo-500/50 transition-all overflow-hidden flex flex-col justify-between">
                                <div>
                                    <div className="aspect-square w-full bg-gray-800 relative">
                                        <SmartImage
                                            src={item.photo_url || item.image_url}
                                            alt={item.title || item.name}
                                            fit="cover"
                                            fallbackIcon={Sparkles}
                                            className="w-full h-full"
                                        />
                                    </div>
                                    <div className="p-3">
                                        <h3 className="font-bold text-white text-sm mb-1">{item.title || item.name || 'Sin título'}</h3>
                                        {item.description && (
                                            <p className="text-xs text-gray-400 mb-2 line-clamp-2">{item.description}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="p-3 pt-0">
                                    <button
                                        onClick={() => handleDelete(item.id)}
                                        className="w-full text-red-400 hover:bg-red-900/30 py-2 rounded-lg transition-colors flex items-center justify-center gap-1 text-xs"
                                    >
                                        <Trash2 className="w-4 h-4" /> Eliminar
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    const renderBanners = () => {
        const filteredData = data.filter(item =>
            !searchTerm ||
            item.title?.toLowerCase().includes(searchTerm.toLowerCase())
        );

        return (
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                    <button
                        onClick={() => setNewItem({ title: '', link: '', is_active: 1 })}
                        className="bg-gradient-to-r from-rose-600 to-pink-600 text-white px-4 py-1.5 rounded-lg shadow-lg shadow-rose-900/40 hover:shadow-rose-900/60 transition-all flex items-center justify-center gap-1.5 font-bold text-sm w-full md:w-auto"
                    >
                        <Plus className="w-4 h-4" /> Nuevo Banner
                    </button>
                    <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar banner..." />
                </div>

                {/* Modal para Banners */}
                {newItem && (
                    <ModernModal
                        isOpen={!!newItem}
                        onClose={() => setNewItem(null)}
                        title="Gestión de Banner"
                        subtitle="Configurar imagen y enlace del banner"
                        size="medium"
                    >
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Título (Opcional)</label>
                                    <input
                                        placeholder="Ej: Promo Verano"
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none transition-all"
                                        value={newItem.title || ''}
                                        onChange={e => setNewItem({ ...newItem, title: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Enlace / Link (Opcional)</label>
                                    <input
                                        placeholder="Ej: /products?category=cervezas"
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-lg focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none transition-all"
                                        value={newItem.link || ''}
                                        onChange={e => setNewItem({ ...newItem, link: e.target.value })}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Si se deja vacío no será clickeable</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-300 mb-2">Imagen del Banner</label>
                                    <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center hover:border-rose-500 transition-colors cursor-pointer relative">
                                        <input
                                            type="file"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            onChange={e => {
                                                if (e.target.files && e.target.files[0]) {
                                                    setNewItem({ ...newItem, imageFile: e.target.files[0] });
                                                }
                                            }}
                                            accept="image/*"
                                        />
                                        {newItem.imageFile ? (
                                            <div className="flex items-center justify-center gap-2 text-rose-400">
                                                <Image className="w-6 h-6" />
                                                <span className="font-bold">{newItem.imageFile.name}</span>
                                            </div>
                                        ) : (
                                            <div className="text-gray-500">
                                                <Image className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                                <p>Haz clic o arrastra una imagen aquí</p>
                                            </div>
                                        )}
                                    </div>
                                    {newItem.image_url && !newItem.imageFile && (
                                        <div className="mt-2">
                                            <p className="text-xs text-gray-400 mb-1">Imagen actual:</p>
                                            <img src={newItem.image_url} alt="Current" className="h-20 rounded border border-gray-700" />
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={newItem.is_active == 1}
                                            onChange={e => setNewItem({ ...newItem, is_active: e.target.checked ? 1 : 0 })}
                                            className="w-4 h-4 rounded border-gray-700"
                                        />
                                        <span className="text-gray-300">Activo</span>
                                    </label>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                                <button
                                    onClick={() => setNewItem(null)}
                                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => handleSave(newItem, !newItem.id)}
                                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <Save className="w-4 h-4" /> Guardar
                                </button>
                            </div>
                        </div>
                    </ModernModal>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {filteredData.length === 0 ? (
                        <EmptyState
                            icon={Image}
                            title="No hay banners"
                            description="Agrega banners para la tienda"
                        />
                    ) : (
                        filteredData.map(item => (
                            <div key={item.id} className="group bg-gray-900 rounded-lg shadow-lg border border-gray-800 hover:border-rose-500/50 transition-all overflow-hidden">
                                <div className="aspect-[16/6] w-full bg-gray-950 relative p-1.5 flex items-center justify-center">
                                    <SmartImage
                                        src={item.image_url}
                                        alt={item.title || 'Banner'}
                                        fit="contain"
                                        fallbackIcon={Image}
                                        className="w-full h-full"
                                    />
                                </div>
                                <div className="p-3">
                                    <div className="flex items-start justify-between mb-1.5">
                                        <h3 className="font-bold text-white text-sm line-clamp-1">{item.title || 'Sin título'}</h3>
                                        <div className="flex items-center gap-0.5 flex-shrink-0 ml-2">
                                            {item.is_active == 1 ? (
                                                <><Check className="w-2.5 h-2.5 text-emerald-500" /><span className="text-[9px] text-emerald-400">Activo</span></>
                                            ) : (
                                                <><X className="w-2.5 h-2.5 text-gray-500" /><span className="text-[9px] text-gray-500">Inactivo</span></>
                                            )}
                                        </div>
                                    </div>
                                    {item.link && <p className="text-[10px] text-gray-400 mb-2 truncate">Link: {item.link}</p>}
                                    <button
                                        onClick={() => handleDelete(item.id)}
                                        className="w-full text-red-400 hover:bg-red-900/30 py-1 rounded text-[10px] transition-colors flex items-center justify-center gap-0.5"
                                    >
                                        <Trash2 className="w-2.5 h-2.5" /> Eliminar
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    const renderSurcharges = () => {
        const surcharges = data[0] || {};
        return (
            <div className="space-y-6 max-w-4xl">
                <h3 className="text-white font-bold text-xl">Configuración de Recargos de Envase</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gray-900 p-6 rounded-xl shadow-lg border border-gray-800 hover:border-red-500/50 transition-all">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                                <TrendingUp className="w-6 h-6 text-red-400" />
                            </div>
                            <span className="text-lg font-bold text-white">Envase Retornable</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400">$</span>
                            <input
                                type="number"
                                step="1"
                                placeholder="15"
                                className="flex-1 bg-gray-800 border border-gray-700 text-white p-3 text-xl rounded-lg focus:border-red-500 outline-none"
                                value={surcharges.returnable_amount || ''}
                                onChange={e => handleSave({ ...surcharges, returnable_amount: e.target.value })}
                            />
                            <span className="text-gray-400">MXN</span>
                        </div>
                    </div>

                    <div className="bg-gray-900 p-6 rounded-xl shadow-lg border border-gray-800 hover:border-red-500/50 transition-all">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center">
                                <TrendingUp className="w-6 h-6 text-orange-400" />
                            </div>
                            <span className="text-lg font-bold text-white">Envase Desechable</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400">$</span>
                            <input
                                type="number"
                                step="1"
                                placeholder="5"
                                className="flex-1 bg-gray-800 border border-gray-700 text-white p-3 text-xl rounded-lg focus:border-orange-500 outline-none"
                                value={surcharges.disposable_amount || ''}
                                onChange={e => handleSave({ ...surcharges, disposable_amount: e.target.value })}
                            />
                            <span className="text-gray-400">MXN</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderTeleventaRoutes = () => {
        const filteredData = (Array.isArray(data) ? data : []).filter(item =>
            !searchTerm ||
            item.agent_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.phone?.includes(searchTerm) ||
            item.zone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.sales_route?.toLowerCase().includes(searchTerm.toLowerCase())
        );

        const defaultInitialZone = availableShopZones[0] || '';
        const defaultInitialZoneRoutes = defaultInitialZone ? (zonesRoutesMap[defaultInitialZone]?.allRoutes || []).join(', ') : '';

        return (
            <div className="space-y-6">
                {/* Header con acciones */}
                <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => {
                                setEditingItem(null);
                                setTeleventaRouteZoneFilter('all');
                                setNewItem({ 
                                    agent_name: '', 
                                    phone: '', 
                                    assignment_type: 'zone', 
                                    zone: defaultInitialZone, 
                                    sales_route: defaultInitialZoneRoutes, 
                                    is_active: 1, 
                                    is_default: 0, 
                                    notes: '' 
                                });
                            }}
                            className="bg-gradient-to-r from-emerald-600 to-green-600 text-white px-4 py-2 rounded-xl shadow-lg shadow-emerald-900/40 hover:shadow-emerald-900/60 transition-all flex items-center justify-center gap-2 font-bold text-sm"
                        >
                            <Plus className="w-4 h-4" /> Nuevo Asesor Televenta
                        </button>

                        <button
                            onClick={() => setIsZonasCatalogOpen(true)}
                            className="bg-gray-800 hover:bg-gray-700 text-emerald-300 border border-emerald-700/60 px-3.5 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 font-bold text-xs shadow"
                            title="Ver o editar el Catálogo Oficial de Zonas y Rutas de la aplicación principal"
                        >
                            <MapIcon className="w-4 h-4 text-emerald-400" />
                            <span>🗺️ Catálogo Oficial Zonas y Rutas ({availableShopZones.length} zonas / {allOfficialRoutes.length} rutas)</span>
                        </button>
                    </div>
                    <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar asesor, teléfono, zona o ruta..." />
                </div>

                {/* Banner Informativo + Resumen de Zonas y Rutas Oficiales */}
                <div className="bg-gradient-to-r from-emerald-950/40 to-slate-900/60 border border-emerald-800/40 p-4 rounded-2xl space-y-3">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400 shrink-0">
                            <Phone className="w-5 h-5" />
                        </div>
                        <div className="text-xs text-slate-300 space-y-1">
                            <p className="font-bold text-white text-sm">Enrutamiento Inteligente de WhatsApp Sincronizado con Zonas y Rutas Oficiales</p>
                            <p>
                                Conectado en tiempo real al catálogo maestro <strong>zonas_rutas</strong> de la aplicación principal. Cuando un cliente pulsa el botón de WhatsApp en la tienda, el sistema detecta su <strong>zona comercial</strong> o <strong>ruta de venta</strong> y abre automáticamente el chat con su ejecutivo asignado.
                            </p>
                            <p className="text-emerald-300 font-semibold">
                                • Si asignas un ejecutivo por <strong>Zona</strong>, incluye automáticamente <strong>todas las rutas de venta</strong> pertenecientes a esa zona comercial.
                            </p>
                        </div>
                    </div>

                    {/* Vista rápida de Zonas Oficiales y sus Rutas */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-emerald-800/30">
                        {availableShopZones.map(zName => {
                            const rList = zonesRoutesMap[zName]?.allRoutes || [];
                            return (
                                <div key={zName} className="bg-gray-950/70 border border-gray-800 rounded-xl p-2.5 text-xs">
                                    <div className="flex items-center justify-between font-bold text-emerald-300 mb-1">
                                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {zName}</span>
                                        <span className="text-[10px] bg-emerald-900/50 text-emerald-200 px-1.5 py-0.5 rounded-full">
                                            {rList.length} rutas
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-gray-400 font-mono truncate" title={rList.join(', ')}>
                                        {rList.length > 0 ? `Rutas: ${rList.join(', ')}` : 'Sin rutas específicas registradas'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Tabla de Asesores */}
                <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="bg-gray-950/80 border-b border-gray-800 text-gray-400 font-bold uppercase tracking-wider">
                                    <th className="p-3.5">Ejecutivo Televenta</th>
                                    <th className="p-3.5">WhatsApp</th>
                                    <th className="p-3.5">Cobertura (Zona / Rutas Incluidas)</th>
                                    <th className="p-3.5 text-center">Estado</th>
                                    <th className="p-3.5 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {filteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="p-8 text-center text-gray-500">
                                            No hay ejecutivos de Televenta asignados. Haz clic en "Nuevo Asesor Televenta" para agregar el primero.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredData.map(item => {
                                        const zonesList = String(item.zone || '')
                                            .split(',')
                                            .map(z => z.trim().toUpperCase())
                                            .filter(Boolean);
                                        const officialZoneRoutes = Array.from(
                                            new Set(zonesList.flatMap(zk => zonesRoutesMap[zk]?.allRoutes || []))
                                        );
                                        const savedRoutesList = item.sales_route
                                            ? String(item.sales_route).split(',').map(r => r.trim()).filter(Boolean)
                                            : officialZoneRoutes;

                                        return (
                                            <tr key={item.id} className="hover:bg-gray-800/50 transition-colors">
                                                <td className="p-3.5">
                                                    <div className="font-bold text-white text-sm">{item.agent_name}</div>
                                                    {item.notes && <div className="text-[11px] text-gray-400">{item.notes}</div>}
                                                </td>
                                                <td className="p-3.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono font-bold text-emerald-400">{item.phone}</span>
                                                        <a
                                                            href={`https://wa.me/${item.phone}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="px-2 py-0.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30 rounded text-[10px] font-bold transition-colors"
                                                            title="Abrir chat de prueba"
                                                        >
                                                            Probar WA
                                                        </a>
                                                    </div>
                                                </td>
                                                <td className="p-3.5">
                                                    {item.is_default == 1 ? (
                                                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                            ★ Predeterminado General (Global)
                                                        </span>
                                                    ) : item.assignment_type === 'route' ? (
                                                        <div className="space-y-1">
                                                            <div className="flex flex-wrap gap-1">
                                                                {savedRoutesList.map(rt => (
                                                                    <span key={rt} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                                                        Ruta {rt}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                            {zonesList.length > 0 && (
                                                                <div className="text-[10px] text-gray-400">
                                                                    Zonas: <strong className="text-gray-300">{zonesList.join(', ')}</strong>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-1.5">
                                                            <div className="flex flex-wrap gap-1.5 items-center">
                                                                {zonesList.length > 0 ? zonesList.map(z => (
                                                                    <span key={z} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                                                        <MapPin className="w-2.5 h-2.5" /> Zona: {z}
                                                                    </span>
                                                                )) : (
                                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-800 text-gray-400 border border-gray-700">
                                                                        Sin zona asignada
                                                                    </span>
                                                                )}
                                                                {zonesList.length > 1 && (
                                                                    <span className="text-[10px] font-bold text-teal-300 bg-teal-950/60 border border-teal-700/50 px-2 py-0.5 rounded-full">
                                                                        {zonesList.length} zonas asignadas
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {savedRoutesList.length > 0 && (
                                                                <div className="text-[10px] text-gray-400 font-mono max-w-md truncate" title={savedRoutesList.join(', ')}>
                                                                    Rutas incluidas ({savedRoutesList.length}): <span className="text-emerald-300">{savedRoutesList.join(', ')}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-3.5 text-center">
                                                    <button
                                                        onClick={async () => {
                                                            const newStatus = item.is_active == 1 ? 0 : 1;
                                                            await api.post('/admin/televenta-assignments.php', { action: 'toggle', id: item.id, is_active: newStatus });
                                                            loadData();
                                                        }}
                                                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                                                            item.is_active == 1 
                                                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                                                : 'bg-gray-800 text-gray-400 border border-gray-700'
                                                        }`}
                                                    >
                                                        {item.is_active == 1 ? 'Activo' : 'Inactivo'}
                                                    </button>
                                                </td>
                                                <td className="p-3.5 text-center">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <button
                                                            onClick={() => {
                                                                setTeleventaRouteZoneFilter('all');
                                                                setEditingItem(item);
                                                                setNewItem({ ...item });
                                                            }}
                                                            className="p-1.5 bg-gray-800 hover:bg-gray-700 text-emerald-400 rounded-lg transition-colors"
                                                            title="Editar"
                                                        >
                                                            <Edit className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(item.id)}
                                                            className="p-1.5 bg-gray-800 hover:bg-red-900/30 text-red-400 rounded-lg transition-colors"
                                                            title="Eliminar"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Modal para Crear / Editar Asesor */}
                {newItem && (
                    <ModernModal
                        isOpen={!!newItem}
                        onClose={() => { setNewItem(null); setEditingItem(null); }}
                        title={editingItem ? "Editar Asesor Televenta" : "Nuevo Asesor Televenta"}
                        subtitle="Puedes asignar 1 o múltiples Zonas Comerciales o Rutas de Venta a cada ejecutivo"
                        size="medium"
                    >
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="col-span-full">
                                    <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">Nombre del Asesor / Ejecutivo</label>
                                    <input
                                        placeholder="Ej: Mariana López o Mesa de Control"
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-xl text-xs focus:border-emerald-500 outline-none"
                                        value={newItem.agent_name || ''}
                                        onChange={e => setNewItem({ ...newItem, agent_name: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="col-span-full">
                                    <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">Número de WhatsApp</label>
                                    <input
                                        placeholder="Ej: 522221427848 o 2221427848"
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-xl text-xs focus:border-emerald-500 outline-none font-mono"
                                        value={newItem.phone || ''}
                                        onChange={e => setNewItem({ ...newItem, phone: e.target.value })}
                                        required
                                    />
                                    <p className="text-[10px] text-gray-500 mt-1">Escribe los 10 dígitos o con código 52 de México.</p>
                                </div>

                                <div className="col-span-full">
                                    <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">Tipo de Cobertura</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const currentZones = String(newItem.zone || '')
                                                    .split(',')
                                                    .map(z => z.trim().toUpperCase())
                                                    .filter(Boolean);
                                                const nextZones = currentZones.length > 0 ? currentZones : (defaultInitialZone ? [defaultInitialZone] : []);
                                                const zRoutes = Array.from(new Set(nextZones.flatMap(z => zonesRoutesMap[z]?.allRoutes || []))).join(', ');
                                                setNewItem({ ...newItem, assignment_type: 'zone', is_default: 0, zone: nextZones.join(', '), sales_route: zRoutes });
                                            }}
                                            className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                                                newItem.assignment_type === 'zone' && !newItem.is_default
                                                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                                                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                                            }`}
                                        >
                                            Por Zona(s) Comercial(es) (1 o más zonas)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setNewItem({ ...newItem, assignment_type: 'route', is_default: 0, sales_route: '' })}
                                            className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                                                newItem.assignment_type === 'route' && !newItem.is_default
                                                    ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                                                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                                            }`}
                                        >
                                            Por Ruta(s) Específica(s)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setNewItem({ ...newItem, assignment_type: 'global', is_default: 1, zone: '', sales_route: '' })}
                                            className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                                                newItem.is_default == 1 || newItem.assignment_type === 'global'
                                                    ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                                                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                                            }`}
                                        >
                                            ★ Predeterminado General
                                        </button>
                                    </div>
                                </div>

                                {newItem.assignment_type === 'zone' && !newItem.is_default && (() => {
                                    const selectedZones = String(newItem.zone || '')
                                        .split(',')
                                        .map(z => z.trim().toUpperCase())
                                        .filter(Boolean);
                                    const combinedRoutes = Array.from(
                                        new Set(selectedZones.flatMap(z => zonesRoutesMap[z]?.allRoutes || []))
                                    );

                                    const toggleZoneSelection = (zName) => {
                                        const upperZ = String(zName || '').trim().toUpperCase();
                                        let nextZones;
                                        if (selectedZones.includes(upperZ)) {
                                            nextZones = selectedZones.filter(z => z !== upperZ);
                                        } else {
                                            nextZones = [...selectedZones, upperZ];
                                        }
                                        const nextRoutes = Array.from(
                                            new Set(nextZones.flatMap(z => zonesRoutesMap[z]?.allRoutes || []))
                                        );
                                        setNewItem({
                                            ...newItem,
                                            zone: nextZones.join(', '),
                                            sales_route: nextRoutes.join(', ')
                                        });
                                    };

                                    return (
                                        <div className="col-span-full space-y-2.5 bg-gray-950/60 border border-gray-800 p-3.5 rounded-xl">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <label className="block text-xs font-bold text-emerald-400 uppercase tracking-wider">
                                                    Selecciona 1 o más Zonas Comerciales (`zonas_rutas`):
                                                </label>
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const allZ = [...availableShopZones];
                                                            const allR = Array.from(new Set(allZ.flatMap(z => zonesRoutesMap[z]?.allRoutes || [])));
                                                            setNewItem({
                                                                ...newItem,
                                                                zone: allZ.join(', '),
                                                                sales_route: allR.join(', ')
                                                            });
                                                        }}
                                                        className="px-2 py-1 rounded-lg bg-emerald-900/40 hover:bg-emerald-800/60 border border-emerald-700/50 text-emerald-200 text-[10px] font-bold transition-colors"
                                                    >
                                                        Seleccionar Todas
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setNewItem({ ...newItem, zone: '', sales_route: '' })}
                                                        className="px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-[10px] font-bold transition-colors"
                                                    >
                                                        Limpiar
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                {availableShopZones.map(zName => {
                                                    const isSelected = selectedZones.includes(zName);
                                                    const rCount = zonesRoutesMap[zName]?.allRoutes?.length || 0;
                                                    return (
                                                        <button
                                                            key={zName}
                                                            type="button"
                                                            onClick={() => toggleZoneSelection(zName)}
                                                            className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-between ${
                                                                isSelected
                                                                    ? 'bg-emerald-600/25 border-emerald-500 text-emerald-200 shadow-md ring-1 ring-emerald-500/50'
                                                                    : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-emerald-500/40'
                                                            }`}
                                                        >
                                                            <span className="flex items-center gap-1.5">
                                                                <span className={`w-4 h-4 rounded flex items-center justify-center border ${isSelected ? 'bg-emerald-500 border-emerald-400 text-black' : 'border-gray-600 bg-gray-800'}`}>
                                                                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                                                </span>
                                                                <span>{zName}</span>
                                                            </span>
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-gray-300">
                                                                {rCount} rutas
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {/* Mostrar automáticamente todas las zonas y rutas seleccionadas */}
                                            {selectedZones.length > 0 ? (
                                                <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-xl p-3 space-y-1.5">
                                                    <div className="text-[11px] font-bold text-emerald-300 flex items-center justify-between">
                                                        <span>✓ Zonas seleccionadas ({selectedZones.length}): {selectedZones.join(', ')}</span>
                                                        <span className="text-[10px] text-emerald-400">
                                                            {combinedRoutes.length} rutas totales
                                                        </span>
                                                    </div>
                                                    {combinedRoutes.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1 pt-1 max-h-28 overflow-y-auto">
                                                            {combinedRoutes.map(rt => (
                                                                <span
                                                                    key={rt}
                                                                    className="px-2 py-0.5 rounded bg-emerald-900/50 border border-emerald-700/50 text-emerald-200 font-mono text-[10px] font-bold"
                                                                >
                                                                    Ruta {rt}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-[11px] text-gray-400">
                                                            Todos los clientes con zona comercial <strong>{selectedZones.join(', ')}</strong> serán atendidos por este ejecutivo.
                                                        </p>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-[11px] text-amber-400">
                                                    Haz clic en una o varias zonas de arriba para asignarlas a este ejecutivo.
                                                </p>
                                            )}
                                        </div>
                                    );
                                })()}

                                {newItem.assignment_type === 'route' && !newItem.is_default && (() => {
                                    const selectedRoutes = String(newItem.sales_route || '')
                                        .split(',')
                                        .map(r => r.trim().toUpperCase())
                                        .filter(Boolean);

                                    const toggleRouteSelection = (rtObj) => {
                                        const rCode = String(rtObj.ruta || '').trim().toUpperCase();
                                        let nextRoutes;
                                        if (selectedRoutes.includes(rCode)) {
                                            nextRoutes = selectedRoutes.filter(r => r !== rCode);
                                        } else {
                                            nextRoutes = [...selectedRoutes, rCode];
                                        }
                                        const matchedZones = Array.from(
                                            new Set(
                                                allOfficialRoutes
                                                    .filter(o => nextRoutes.includes(o.ruta))
                                                    .map(o => o.zona)
                                                    .filter(Boolean)
                                            )
                                        );
                                        setNewItem({
                                            ...newItem,
                                            sales_route: nextRoutes.join(', '),
                                            zone: matchedZones.join(', ')
                                        });
                                    };

                                    return (
                                        <div className="col-span-full space-y-2.5 bg-gray-950/60 border border-gray-800 p-3.5 rounded-xl">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <label className="block text-xs font-bold text-purple-300 uppercase tracking-wider">
                                                    Selecciona 1 o más Rutas de Venta Oficiales (`zonas_rutas`):
                                                </label>
                                                <select
                                                    value={televentaRouteZoneFilter}
                                                    onChange={e => setTeleventaRouteZoneFilter(e.target.value)}
                                                    className="bg-gray-900 border border-gray-700 text-white rounded-lg px-2.5 py-1 text-xs outline-none focus:border-purple-500"
                                                >
                                                    <option value="all">Todas las Zonas ({allOfficialRoutes.length} rutas)</option>
                                                    {availableShopZones.map(z => (
                                                        <option key={z} value={z}>
                                                            Zona {z} ({(zonesRoutesMap[z]?.allRoutes || []).length} rutas)
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {allOfficialRoutes.length > 0 && (
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-h-44 overflow-y-auto p-1">
                                                    {allOfficialRoutes
                                                        .filter(rt => televentaRouteZoneFilter === 'all' || rt.zona === televentaRouteZoneFilter)
                                                        .map(rt => {
                                                            const isSelected = selectedRoutes.includes(rt.ruta);
                                                            return (
                                                                <button
                                                                    key={`${rt.zona}-${rt.ruta}`}
                                                                    type="button"
                                                                    onClick={() => toggleRouteSelection(rt)}
                                                                    className={`p-2 rounded-lg border text-left transition-all flex items-center justify-between ${
                                                                        isSelected
                                                                            ? 'bg-purple-600/30 border-purple-500 text-purple-200 shadow'
                                                                            : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-purple-500/40'
                                                                    }`}
                                                                >
                                                                    <div>
                                                                        <div className="font-mono font-bold text-xs">Ruta {rt.ruta}</div>
                                                                        <div className="text-[10px] text-gray-400 truncate">{rt.zona}</div>
                                                                    </div>
                                                                    {isSelected && <Check className="w-3.5 h-3.5 text-purple-300 shrink-0" />}
                                                                </button>
                                                            );
                                                        })}
                                                </div>
                                            )}

                                            <input
                                                placeholder="Rutas seleccionadas (ej. 101, 102, R01...)"
                                                className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-xl text-xs focus:border-purple-500 outline-none uppercase font-mono"
                                                value={newItem.sales_route || ''}
                                                onChange={e => setNewItem({ ...newItem, sales_route: e.target.value.toUpperCase() })}
                                            />
                                            <p className="text-[10px] text-purple-300">
                                                ✓ Este ejecutivo atenderá a los clientes de las rutas: <strong>{newItem.sales_route || '...'}</strong> {newItem.zone ? `(Zonas: ${newItem.zone})` : ''}.
                                            </p>
                                        </div>
                                    );
                                })()}

                                <div className="col-span-full">
                                    <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">Notas u Horario (Opcional)</label>
                                    <input
                                        placeholder="Ej: Lunes a Sábado 8:00 AM - 6:00 PM"
                                        className="w-full bg-gray-800 border border-gray-700 text-white p-2.5 rounded-xl text-xs focus:border-emerald-500 outline-none"
                                        value={newItem.notes || ''}
                                        onChange={e => setNewItem({ ...newItem, notes: e.target.value })}
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-white">
                                        <input
                                            type="checkbox"
                                            checked={newItem.is_active == 1}
                                            onChange={e => setNewItem({ ...newItem, is_active: e.target.checked ? 1 : 0 })}
                                            className="w-4 h-4 rounded border-gray-700 text-emerald-500 focus:ring-emerald-500 bg-gray-900"
                                        />
                                        <span>Asignación Activa</span>
                                    </label>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                                <button
                                    type="button"
                                    onClick={() => { setNewItem(null); setEditingItem(null); }}
                                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-bold transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSave(newItem, !editingItem)}
                                    className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-900/40 flex items-center gap-1.5"
                                >
                                    <Save className="w-3.5 h-3.5" />
                                    <span>Guardar Asesor</span>
                                </button>
                            </div>
                        </div>
                    </ModernModal>
                )}
            </div>
        );
    };

    const renderOverview = () => {
        const categoriesToShow = shopCategories.filter(c => c.id !== 'all');
        return (
            <div className="space-y-6 pb-8">
                {/* Tarjetas de Estado en Vivo de la Shop */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                    <button
                        onClick={() => selectTab('catalog')}
                        className="text-left bg-gray-900/90 border border-gray-800 hover:border-emerald-500/50 p-3.5 rounded-2xl transition-all group shadow-lg"
                    >
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Productos</span>
                            <Package className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                        </div>
                        <div className="text-2xl font-black text-white">{overviewStats.products}</div>
                        <div className="text-[10px] text-emerald-400 mt-0.5">En catálogo Shop →</div>
                    </button>

                    <button
                        onClick={() => selectTab('televenta-routes')}
                        className="text-left bg-gray-900/90 border border-gray-800 hover:border-emerald-500/50 p-3.5 rounded-2xl transition-all group shadow-lg"
                    >
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Televentas WA</span>
                            <Phone className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                        </div>
                        <div className="text-2xl font-black text-emerald-300">Rutas & Zonas</div>
                        <div className="text-[10px] text-emerald-400 mt-0.5">Asignar teléfonos →</div>
                    </button>

                    <button
                        onClick={() => selectTab('clients')}
                        className="text-left bg-gray-900/90 border border-gray-800 hover:border-blue-500/50 p-3.5 rounded-2xl transition-all group shadow-lg"
                    >
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Clientes Shop</span>
                            <Users className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                        </div>
                        <div className="text-2xl font-black text-white">{overviewStats.clients}</div>
                        <div className="text-[10px] text-blue-400 mt-0.5">Cuentas y accesos →</div>
                    </button>

                    <button
                        onClick={() => selectTab('promotions')}
                        className="text-left bg-gray-900/90 border border-gray-800 hover:border-cyan-500/50 p-3.5 rounded-2xl transition-all group shadow-lg"
                    >
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Promociones</span>
                            <Tag className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                        </div>
                        <div className="text-2xl font-black text-white">{overviewStats.promotions}</div>
                        <div className="text-[10px] text-cyan-400 mt-0.5">Combos y promos →</div>
                    </button>

                    <button
                        onClick={() => selectTab('redemptions')}
                        className="text-left bg-gray-900/90 border border-gray-800 hover:border-orange-500/50 p-3.5 rounded-2xl transition-all group shadow-lg"
                    >
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Canjes Pendientes</span>
                            <ShoppingCart className="w-4 h-4 text-orange-400 group-hover:scale-110 transition-transform" />
                        </div>
                        <div className="text-2xl font-black text-white">{overviewStats.pendingRedemptions}</div>
                        <div className="text-[10px] text-orange-400 mt-0.5">Por autorizar →</div>
                    </button>

                    <button
                        onClick={() => selectTab('redemption-catalog')}
                        className="text-left bg-gray-900/90 border border-gray-800 hover:border-pink-500/50 p-3.5 rounded-2xl transition-all group shadow-lg"
                    >
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Premios Canje</span>
                            <Gift className="w-4 h-4 text-pink-400 group-hover:scale-110 transition-transform" />
                        </div>
                        <div className="text-2xl font-black text-white">{overviewStats.rewards}</div>
                        <div className="text-[10px] text-pink-400 mt-0.5">Catálogo lealtad →</div>
                    </button>

                    <button
                        onClick={() => selectTab('banners')}
                        className="text-left bg-gray-900/90 border border-gray-800 hover:border-rose-500/50 p-3.5 rounded-2xl transition-all group shadow-lg"
                    >
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Banners Shop</span>
                            <Image className="w-4 h-4 text-rose-400 group-hover:scale-110 transition-transform" />
                        </div>
                        <div className="text-2xl font-black text-white">{overviewStats.banners}</div>
                        <div className="text-[10px] text-rose-400 mt-0.5">Carrusel activo →</div>
                    </button>
                </div>

                {/* Clasificación Completa de los 5 Pilares de la Shop */}
                <div className="space-y-5">
                    {categoriesToShow.map(cat => {
                        const CatIcon = cat.icon;
                        const catTabs = tabs.filter(t => t.category === cat.id);
                        return (
                            <div key={cat.id} className="bg-gray-900/70 border border-gray-800/90 rounded-2xl p-4 sm:p-5 shadow-xl">
                                <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-gray-800">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                                            <CatIcon className="w-4 h-4 text-emerald-400" />
                                        </div>
                                        <div>
                                            <h2 className="text-sm sm:text-base font-extrabold text-white tracking-wide">
                                                {cat.label}
                                            </h2>
                                            <p className="text-[11px] text-gray-400">
                                                {catTabs.length} módulos de control directo
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setActiveCategory(cat.id);
                                            if (catTabs[0]) selectTab(catTabs[0].id);
                                        }}
                                        className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 transition-colors"
                                    >
                                        Filtrar categoría
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                    {catTabs.map(mod => {
                                        const ModIcon = mod.icon;
                                        return (
                                            <div
                                                key={mod.id}
                                                onClick={() => selectTab(mod.id)}
                                                className="group cursor-pointer bg-gray-950/80 hover:bg-gray-900 border border-gray-800 hover:border-emerald-500/50 rounded-xl p-3.5 transition-all flex flex-col justify-between shadow-md"
                                            >
                                                <div>
                                                    <div className="flex items-start justify-between gap-2 mb-2">
                                                        <div className={`p-2 rounded-xl bg-gradient-to-br ${mod.gradient} text-white shadow-md`}>
                                                            <ModIcon className="w-4 h-4" />
                                                        </div>
                                                        {mod.externalPath && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    navigate(mod.externalPath);
                                                                }}
                                                                title="Abrir en pantalla completa"
                                                                className="text-[10px] text-gray-400 hover:text-white bg-gray-800/80 hover:bg-gray-700 px-2 py-1 rounded-md flex items-center gap-1 transition-colors"
                                                            >
                                                                <ExternalLink className="w-3 h-3" />
                                                                <span>Pantalla</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                    <h3 className="font-bold text-white text-sm group-hover:text-emerald-400 transition-colors">
                                                        {mod.label}
                                                    </h3>
                                                    <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                                                        {mod.desc}
                                                    </p>
                                                </div>
                                                <div className="mt-3 pt-2 border-t border-gray-800/80 flex items-center justify-between text-[11px] font-semibold text-emerald-400">
                                                    <span>Abrir módulo aquí</span>
                                                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // ========================================================================
    // RENDER PRINCIPAL
    // ========================================================================

    const currentTab = tabs.find(t => t.id === activeTab) || tabs[0];
    const visibleTabs = activeCategory === 'all'
        ? tabs
        : tabs.filter(t => t.id === 'overview' || t.category === activeCategory);

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 w-full min-w-0 max-w-full">
            {/* Header Modernizado — Control 100% Shop */}
            <div className="bg-gradient-to-r from-gray-900 via-gray-900 to-gray-800 border-b border-gray-800">
                <div className="px-3 sm:px-4 lg:px-6 py-3 max-w-full">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-900/40">
                                <ShieldCheck className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl sm:text-2xl font-black bg-gradient-to-r from-emerald-400 via-teal-300 to-green-500 bg-clip-text text-transparent">
                                        Centro de Control Maestro — Shop 100%
                                    </h1>
                                    <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                        Sistema Shop
                                    </span>
                                </div>
                                <p className="text-xs text-gray-400">
                                    {currentTab?.label}: {currentTab?.desc}
                                </p>
                            </div>
                            <button
                                onClick={() => { loadData(); loadOverviewStats(); loadShopSettings(); }}
                                className="p-2 bg-gray-800/70 hover:bg-gray-700/70 border border-gray-700 rounded-xl transition-colors"
                                title="Recargar datos de la tienda"
                            >
                                <RefreshCw className={`w-4 h-4 text-emerald-400 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>

                        <div className="flex items-center gap-2.5 flex-wrap">
                            <button
                                type="button"
                                onClick={() => selectTab('overview')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
                                    activeTab === 'overview'
                                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-900/40'
                                        : 'bg-gray-800/90 text-gray-200 border-gray-700 hover:border-emerald-500/50'
                                }`}
                            >
                                <LayoutGrid className="w-3.5 h-3.5" />
                                <span>Mapa Clasificado 100%</span>
                            </button>

                            {/* Switch Físico de Modo Tienda */}
                            <div className="flex items-center gap-3 bg-gray-800/90 border border-gray-700/80 px-3.5 py-1.5 rounded-xl shadow-inner">
                                <div className="text-right">
                                    <div className="text-xs font-semibold text-gray-200">
                                        Modo de Precios Clientes
                                    </div>
                                    <div className="text-[11px]">
                                        {showPrices ? (
                                            <span className="text-emerald-400 font-medium">● Precios Visibles (Venta Directa)</span>
                                        ) : (
                                            <span className="text-amber-400 font-medium">● Precios Ocultos (Solicitud a Televenta)</span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    disabled={togglingPrices}
                                    onClick={handleTogglePrices}
                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${showPrices ? 'bg-emerald-500' : 'bg-gray-600'} ${togglingPrices ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    role="switch"
                                    aria-checked={showPrices}
                                    title={showPrices ? 'Haga clic para ocultar precios a clientes (Modo Solicitud)' : 'Haga clic para mostrar precios a clientes'}
                                >
                                    <span
                                        aria-hidden="true"
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${showPrices ? 'translate-x-5' : 'translate-x-0'}`}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Barra Clasificadora por Categorías (5 Pilares de la Shop) */}
                    <div className="flex overflow-x-auto gap-1.5 pt-2.5 pb-1 no-scrollbar">
                        {shopCategories.map(cat => {
                            const CatIcon = cat.icon;
                            const isCatActive = activeCategory === cat.id;
                            return (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => {
                                        setActiveCategory(cat.id);
                                        if (cat.id === 'all') {
                                            selectTab('overview');
                                        } else {
                                            const firstInCat = tabs.find(t => t.category === cat.id);
                                            if (firstInCat) selectTab(firstInCat.id);
                                        }
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                                        isCatActive
                                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                                            : 'bg-gray-900/60 text-gray-400 border-gray-800 hover:text-gray-200 hover:bg-gray-800/60'
                                    }`}
                                >
                                    <CatIcon className="w-3.5 h-3.5" />
                                    <span>{cat.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Sub-Tabs Horizontales del Pilar Seleccionado */}
            <div className="sticky top-0 z-30 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 w-full min-w-0">
                <div className="px-2 sm:px-3 lg:px-4 max-w-full flex items-center justify-between gap-2">
                    <div className="flex overflow-x-auto gap-1 py-2 no-scrollbar w-full min-w-0" style={{ scrollbarWidth: 'none' }}>
                        {visibleTabs.map(tab => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => selectTab(tab.id)}
                                    className={`
                                        flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs whitespace-nowrap transition-all flex-shrink-0
                                        ${isActive
                                            ? `bg-gradient-to-r ${tab.gradient} text-white shadow-lg ${tab.shadow}`
                                            : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'
                                        }
                                    `}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    <span>{tab.shortLabel}</span>
                                </button>
                            );
                        })}
                    </div>
                    {currentTab?.externalPath && (
                        <button
                            type="button"
                            onClick={() => navigate(currentTab.externalPath)}
                            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-emerald-400 text-xs font-semibold border border-gray-700 shrink-0"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Vista dedicada</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Content 100% Autoajustable */}
            <div
                className="w-full min-w-0 max-w-full px-2 sm:px-4 lg:px-6 py-4 shop-admin-content overflow-x-auto"
                style={{
                    minHeight: 'calc(100vh - 180px)',
                    boxSizing: 'border-box'
                }}
            >
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
                    </div>
                ) : (
                    <Suspense
                        fallback={
                            <div className="flex items-center justify-center h-64">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
                            </div>
                        }
                    >
                        {activeTab === 'overview' && renderOverview()}
                        {activeTab === 'catalog' && renderCatalog()}
                        {activeTab === 'zone-visibility' && <ShopZoneVisibilityPanel />}
                        {activeTab === 'promotions' && renderPromotions()}
                        {activeTab === 'special-prices' && renderSpecialPrices()}
                        {activeTab === 'clients' && renderClients()}
                        {activeTab === 'televenta-routes' && renderTeleventaRoutes()}
                        {activeTab === 'gec-discounts' && renderGEC()}
                        {activeTab === 'redemption-catalog' && renderRedemptionCatalog()}
                        {activeTab === 'redemptions' && renderRedemptions()}
                        {activeTab === 'cooler-refs' && renderCoolerRefs()}
                        {activeTab === 'banners' && renderBanners()}
                        {activeTab === 'surcharges' && renderSurcharges()}
                        {/* Módulos Integrados para Control 100% de la Shop */}
                        {activeTab === 'shop-orders' && <TeleventaShopOrders />}
                        {activeTab === 'cooler-executions' && <TeleventaCoolerExecutions />}
                        {activeTab === 'redemptions-delivery' && <TeleventaRedemptions />}
                        {activeTab === 'points-config' && <AdminPointsConfig />}
                        {activeTab === 'client-points' && <SupervisorClientPoints />}
                        {activeTab === 'loyalty-audit' && <LoyaltyAuditDashboard isEmbedded={true} />}
                        {activeTab === 'sku-images' && <AdminSkuImagesPage />}
                        {activeTab === 'brands' && <AdminBrandsPage />}
                        {activeTab === 'push-broadcast' && <AdminPushBroadcastPage defaultRole="shop_clients" isEmbedded={true} />}
                        {activeTab === 'price-upload' && <PriceUploadPage />}
                    </Suspense>
                )}
            </div>

            {/* Modal Oficial del Catálogo de Zonas y Rutas (Mismo componente que en Administración de Usuarios) */}
            <ZonasRutasCatalogDialog
                open={isZonasCatalogOpen}
                onOpenChange={(openState) => {
                    setIsZonasCatalogOpen(openState);
                    if (!openState) {
                        loadOfficialZonesAndRoutes();
                    }
                }}
            />

            {/* Global CSS for scrollbar */}
            <style dangerouslySetInnerHTML={{
                __html: `
                .shop-admin-content::-webkit-scrollbar {
                    width: 14px;
                }
                .shop-admin-content::-webkit-scrollbar-track {
                    background: rgba(31, 41, 55, 0.7);
                    border-radius: 10px;
                    margin: 4px;
                }
                .shop-admin-content::-webkit-scrollbar-thumb {
                    background: linear-gradient(180deg, #10b981 0%, #059669 100%);
                    border-radius: 10px;
                    border: 3px solid rgba(31, 41, 55, 0.7);
                }
                .shop-admin-content::-webkit-scrollbar-thumb:hover {
                    background: linear-gradient(180deg, #34d399 0%, #10b981 100%);
                    border: 3px solid rgba(31, 41, 55, 0.5);
                }
                .shop-admin-content {
                    scrollbar-width: thin;
                    scrollbar-color: #10b981 rgba(31, 41, 55, 0.7);
                }
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
            `}} />
        </div>
    );
}
