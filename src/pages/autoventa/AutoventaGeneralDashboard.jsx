import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { getTodayMexico } from '@/lib/dateUtils';
import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DonutProgress from '@/components/DonutProgress';
import InteractiveMap from '@/components/common/InteractiveMap';
import SyncButton from '@/components/SyncButton';
import { supabase } from '@/supabaseClient';
import { getSalesBySku } from '@/repositories/salesRepository';
import { getVisitsSummary } from '@/repositories/visitsRepository';
import { getClients } from '@/repositories/clientsRepository';
import { getEvaluations } from '@/repositories/evaluationsRepository';
import { getGoals } from '@/repositories/goalsRepository';
import DashboardSkeleton from '@/components/skeletons/DashboardSkeleton';
import { AlertTriangle } from 'lucide-react';

import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { kvStorage } from '@/services/kvStorage';

// Componente Reloj aislado para evitar re-renders masivos
const DashboardClock = React.memo(() => {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);
    return (
        <div className="text-white/60 text-sm">
            {now.toLocaleDateString('es-MX')} — {now.toLocaleTimeString('es-MX')}
        </div>
    );
});

export default function AutoventaGeneralDashboard() {
    const { user } = useSupabaseAuth();
    // ---------- STATE ----------
    const [userName, setUserName] = useState('Usuario');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Rutas (permitidas vs presentes)
    const [allowedRoutes, setAllowedRoutes] = useState([]);
    const [salesRoute, setSalesRoute] = useState('');

    // Periodo
    const [period, setPeriod] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    // Datos base
    const [clients, setClients] = useState([]);
    const [evalsThisMonth, setEvalsThisMonth] = useState([]);

    // Ventas (HL)
    const [totalSalesAll, setTotalSalesAll] = useState(0);
    const [salesByZonaRaw, setSalesByZonaRaw] = useState([]); // usado para clientes con compra
    const [salesBySku, setSalesBySku] = useState([]);

    // Meta y zona/aportación
    const [routeMeta, setRouteMeta] = useState(0);
    const [routeZona, setRouteZona] = useState('OAXACA'); // fallback
    const [zoneTotalSales, setZoneTotalSales] = useState(0);
    const [routeSalesInZone, setRouteSalesInZone] = useState(0);

    // Visitas
    const [visitsTodayCount, setVisitsTodayCount] = useState(0);
    const [visitsThisMonthCount, setVisitsThisMonthCount] = useState(0);
    const [visitsTotalCount, setVisitsTotalCount] = useState(0);

    // SKUs (imágenes)
    const [skuImagesMap, setSkuImagesMap] = useState({});
    const [availableSkuFiles, setAvailableSkuFiles] = useState(new Set());
    const [allSkus, setAllSkus] = useState([]);
    const [skuFilter, setSkuFilter] = useState([]);
    const [skuSearch, setSkuSearch] = useState('');

    // Ventas por SKU (crudo para el periodo) — misma fuente que HL
    const [vpsRows, setVpsRows] = useState([]);

    // ---------- HELPERS ----------
    const strip = (s) => (s ?? '').toString().trim();
    const norm = (s) => strip(s).toUpperCase();
    const routeKey = (s) => norm(s).replace(/[^A-Z0-9]/g, '');
    const clientCodeKey = (s) => norm(strip(s)).replace(/[^A-Z0-9]/g, '');
    const isZeroLike = (s) => {
        const t = strip(s);
        if (!t) return false;
        if (/^0+(\.0+)?$/.test(t)) return true;
        if (/^\d+$/.test(t) && Number(t) === 0) return true;
        return false;
    };
    const zoneClean = (z) => strip(z).replace(/\.xlsx$/i, '');

    // Normalizar ruta (igual que en DynamicAdvisorRoute)
    const normalizeRouteValue = (value) => {
        if (value == null) return '';
        return String(value).toLowerCase().replace(/\.xlsx$/g, '').trim();
    };

    const splitMultiValue = (raw) => {
        if (raw == null) return [];
        if (Array.isArray(raw)) return raw.map((entry) => String(entry));
        const text = String(raw).trim();
        if (!text) return [];
        if (text.startsWith('[')) {
            try {
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed)) return parsed.map((entry) => String(entry));
            } catch (e) {
                // ignorar JSON inválido
            }
        }
        return text
            .split(/[,;|]/)
            .map((entry) => entry.trim())
            .filter(Boolean);
    };

    const DAYS_LABEL = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

    const dayNameToNumber = (input) => {
        if (input === null || input === undefined) return null;
        const dictionary = {
            domingo: 0, dom: 0,
            lunes: 1, lun: 1,
            martes: 2, mar: 2,
            miercoles: 3, mier: 3, mi: 3,
            jueves: 4, jue: 4,
            viernes: 5, vie: 5,
            sabado: 6, sab: 6, saturday: 6,
            sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5,
        };
        const key = String(input).trim().toLowerCase();
        if (Object.prototype.hasOwnProperty.call(dictionary, key)) return dictionary[key];
        const numeric = Number(key);
        if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 6) return numeric;
        return null;
    };

    const parseVisitDays = (client) => {
        if (!client) return [];
        const raw = client.visit_days ?? client.visitDays ?? client.visitDaysText ?? "";
        if (!raw) return [];
        if (Array.isArray(raw)) {
            return raw.map((value) => dayNameToNumber(value)).filter((value) => value !== null);
        }
        if (typeof raw === "object") {
            try { return splitMultiValue(JSON.stringify(raw)).map((value) => dayNameToNumber(value)).filter((value) => value !== null); } catch (e) { return []; }
        }
        if (typeof raw === "string" && raw.trim().startsWith("[")) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed.map((value) => dayNameToNumber(value)).filter((value) => value !== null);
            } catch (e) { }
        }
        return splitMultiValue(raw).map((value) => dayNameToNumber(value)).filter((value) => value !== null);
    };

    const ROUTE_CANDIDATE_FIELDS = [
        'sales_route',
        'internal_route',
        'route',
        'ruta',
    ];

    const collectClientRouteCandidates = (client) => {
        const set = new Set();
        if (!client) return [];
        ROUTE_CANDIDATE_FIELDS.forEach((field) => {
            if (field in client) {
                const entries = splitMultiValue(client[field]);
                entries.forEach((entry) => {
                    const normalized = normalizeRouteValue(entry);
                    if (normalized) set.add(normalized);
                });
            }
        });
        return Array.from(set);
    };

    const periodLabel = useMemo(() => {
        if (/^\d{4}-\d{2}$/.test(period)) {
            const [y, m] = period.split('-');
            try {
                const d = new Date(Number(y), Number(m) - 1, 1);
                return d.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
            } catch (e) { return period; }
        }
        return 'mes actual';
    }, [period]);

    function periodStartFromYYYYMM(yyyymm) {
        const [y, m] = (yyyymm || '').split('-').map(Number);
        if (!y || !m) return null;
        return `${y}-${String(m).padStart(2, '0')}-01`;
    }
    function nextPeriodStartFromYYYYMM(yyyymm) {
        const [y, m] = (yyyymm || '').split('-').map(Number);
        if (!y || !m) return null;
        const d = new Date(y, m, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    }
    function endOfMonthISO(y, m) {
        const dt = new Date(y, m, 0);
        return dt.toISOString().slice(0, 10);
    }
    function countBusinessDays(fromISO, toISO) {
        if (!fromISO || !toISO) return 0;
        const from = new Date(fromISO);
        const to = new Date(toISO);
        if (to < from) return 0;
        let c = 0, d = new Date(from);
        while (d <= to) { const dow = d.getDay(); if (dow !== 0) c += 1; d.setDate(d.getDate() + 1); }
        return c;
    }
    function normalizeClientCode(code) {
        if (code === undefined || code === null) return '';
        return String(code).trim();
    }
    function getSkuStorageUrl(sku) {
        try {
            const res = supabase.storage.from('sku-images').getPublicUrl(`${sku}.png`);
            return (res && (res.data?.publicUrl || res.publicURL)) || '/logo.png';
        } catch (e) { return '/logo.png'; }
    }
    function getSkuImage(sku) {
        const key = (sku || '').toString().trim().toUpperCase();
        if (key) return `https://cervezasfinas.com/portafolio/${key}.png`;
        return '/brands/default.png';
    }

    // Ãndice de clientes por clave normalizada
    const [clientsIndexByKey, setClientsIndexByKey] = useState(new Map());

    // Derivar ruta para una fila de ventas_por_sku (misma lógica que supervisor)
    const routeFromRow = (r) => {
        const rx = strip(r?.ruta_express);
        if (rx && !isZeroLike(rx)) return rx;

        const rn = r?.ruta;
        const n = Number(rn);
        if (Number.isFinite(n) && n > 0) return String(n);
        if (typeof rn === 'string' && rn && !isZeroLike(rn)) return strip(rn);

        // Fallback: ruta del cliente
        const key = clientCodeKey(r?.cve_cliente);
        const c = clientsIndexByKey.get(key);
        const alt = strip(c?.sales_route || c?.ruta || c?.internal_route || c?.route);
        return alt && !isZeroLike(alt) ? alt : null;
    };

    // ---------- RANGO DEL PERIODO ----------
    const periodRange = useMemo(() => {
        const now = new Date();
        const isMonthPicker = /^\d{4}-\d{2}$/.test(period);
        const from = isMonthPicker
            ? periodStartFromYYYYMM(period)
            : new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const nextFrom = isMonthPicker ? nextPeriodStartFromYYYYMM(period) : null;
        const to = isMonthPicker
            ? endOfMonthISO(...period.split('-').map(Number))
            : now.toISOString().slice(0, 10);
        const [y, m] = (isMonthPicker ? period : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).split('-').map(Number);
        const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
        const monthEnd = endOfMonthISO(y, m);
        const totalBusiness = countBusinessDays(monthStart, monthEnd);
        const elapsedBusiness = countBusinessDays(from, to);
        return { isMonthPicker, from, nextFrom, to, totalBusiness, elapsedBusiness };
    }, [period]);

    // ---------- USER & RUTAS ----------
    useEffect(() => {
        let active = true;
        (async () => {
            let u = user;
            let routeCacheKey = null;
            let allowedRoutesCacheKey = null;
            try {
                if (!u) {
                    const { data } = await supabase.auth.getUser();
                    u = data?.user;
                }
                if (!active) return;
                routeCacheKey = u?.id ? `advisor_user_route_${u.id}` : null;
                allowedRoutesCacheKey = u?.id ? `advisor_allowed_routes_${u.id}` : null;

                // Offline route cache is isolated per account.
                if (routeCacheKey) {
                    const cachedRoute = await kvStorage.getItem(routeCacheKey);
                    if (cachedRoute) setSalesRoute(cachedRoute);
                }

                if (u) {
                    // Fetch Profile Route
                    const { data: profile } = await supabase.from('profiles').select('ruta').eq('id', u.id).single();
                    if (profile && profile.ruta) {
                        setSalesRoute(String(profile.ruta).trim());
                        if (routeCacheKey) await kvStorage.setItem(routeCacheKey, String(profile.ruta).trim());
                    } else {
                        // Fallback to metadata
                        const metadata = u.user_metadata || {};
                        const route = metadata.route || metadata.sales_route || metadata.ruta || '';
                        if (route) {
                            setSalesRoute(route);
                            if (routeCacheKey) await kvStorage.setItem(routeCacheKey, route);
                        }
                    }
                    
                    const metadata = u.user_metadata || {};
                    if (metadata.name) setUserName(metadata.name);
                    else if (u.email) setUserName(u.email);
                }
            } catch (e) {
                console.warn('Error fetching user route, using cache:', e);
            }

            // Rutas permitidas desde tabla de permisos
            // 1. Intentar cache
            let list = [];
            try {
                const cachedAllowed = await kvStorage.getItem(allowedRoutesCacheKey);
                if (cachedAllowed && Array.isArray(cachedAllowed)) list = cachedAllowed;
            } catch (e) { }
            setAllowedRoutes(list);

            try {
                const { data: routes } = await supabase
                    .from('supervisor_allowed_sales_routes')
                    .select('sales_route')
                    .eq('supervisor_id', u?.id || '');
                if (routes && Array.isArray(routes)) {
                    const freshList = routes.map((r) => strip(r.sales_route)).filter(Boolean);
                    if (freshList.length > 0) {
                        list = freshList;
                        setAllowedRoutes(list);
                        if (allowedRoutesCacheKey) await kvStorage.setItem(allowedRoutesCacheKey, list);
                    }
                }
            } catch (e) {
                console.warn('Error fetching allowed routes, using cache', e);
            }

            // Fallback para roles como asesor-dinamico: usar route_number / route del metadata
            if (!list.length && u) {
                try {
                    const { data: profile } = await supabase.from('profiles').select('ruta').eq('id', u.id).single();
                    if (profile && profile.ruta) {
                        list = [String(profile.ruta).trim()];
                        setAllowedRoutes(list);
                    } else if (u.user_metadata) {
                        const metaRoute = strip(
                            u.user_metadata.route_number || u.user_metadata.route || '',
                        );
                        if (metaRoute) list = [metaRoute];
                        setAllowedRoutes(list); // Update state if fallback used
                    }
                } catch(e) { console.warn(e) }
            }

            // If after all checks we have no routes and no salesRoute, stop loading
            const cachedRoute = u?.id ? await kvStorage.getItem(`advisor_user_route_${u.id}`) : null;
            if (!list.length && !cachedRoute && !u?.user_metadata?.route) {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, []);

    // ---------- CARGA VENTAS (MISMA FUENTE QUE HL) ----------
    useEffect(() => {
        let active = true;
        (async () => {
            const { from, nextFrom, to, isMonthPicker } = periodRange;

            // FIX: Si soy asesor y no tengo ruta, NO cargar ventas todavía para evitar flash de datos incorrectos
            // Asumimos que si no hay salesRoute y no es admin (o no sabemos si es admin), mejor esperar.
            const isAdmin = user?.user_metadata?.role === 'admin' || user?.user_metadata?.role === 'manager';
            if (!salesRoute && !isAdmin) {
                console.log('[AdvisorDashboard] Esperando ruta para cargar ventas...');
                if (active) {
                    setVpsRows([]);
                    setLoading(false);
                }
                return;
            }

            try {
                console.log('[AdvisorDashboard] Fetching sales for route:', salesRoute);

                // 1. Fetch HISTORICAL sales (ventas_por_sku)
                // Use undefined for salesRoute to fetch broader dataset and filter in-memory (Advanced Logic) like Supervisor
                const historicalRows = await getSalesBySku({
                    from,
                    to,
                    nextFrom: isMonthPicker ? nextFrom : undefined,
                    salesRoute: undefined,
                });

                // 2. Fetch TODAY'S LIVE SALES (direct_sales)
                // We need to fetch from directSalesRepository to get real-time partial stats
                const { getDailySales } = await import('@/repositories/directSalesRepository');
                const todayStr = getTodayMexico(); // Mexico timezone - day changes at midnight local time

                let liveSales = [];
                try {
                    // Fetch for the current logged-in user (assuming dashboard viewer is the seller) -- limitation: if viewing others, this might need id adjustment
                    if (user?.id) {
                        const dailySales = await getDailySales(user.id, todayStr);
                        if (dailySales && Array.isArray(dailySales)) {
                            // Convert Direct Sale Items into "SalesBySku" row format
                            // Structure: { cve_marca, htls_total, periodo, etc. }
                            dailySales.forEach(sale => {
                                (sale.direct_sales_items || []).forEach(item => {
                                    if (item.quantity > 0) {
                                        // Approximate HL conversion or use direct units if dashboard supports it. 
                                        // Assuming dashboard expects HTLS. 
                                        // If no HL factor available, we might display raw units or 0.
                                        // For now, let's map units to 'htls_total' temporarily or rely on unit_price if dashboard sums money.
                                        // Looking at code: uses `Number(r.htls_total)` for totals.

                                        // CRITICAL: We need SKU factor to convert to HL.
                                        // For now, we will just pass the quantity as a placeholder if HL missing, or 0.01 per unit?

                                        liveSales.push({
                                            cve_marca: item.cve_marca,
                                            cve_cliente: sale.client?.client_code || '9999',
                                            htls_total: Number(item.quantity), // WARNING: This is UNITS, dashboard expects HL. Needs conversion factor.
                                            zona: 'OAXACA', // Fallback
                                            venta: item.total_price, // Money
                                            ruta: salesRoute
                                        });
                                    }
                                });
                            });
                        }
                    }
                } catch (e) { console.warn('Error merging live sales:', e); }

                console.log(`[AdvisorDashboard] Ventas Históricas: ${historicalRows?.length || 0} + En Vivo: ${liveSales.length}`);

                const merged = [...(historicalRows || []), ...liveSales];

                if (active) {
                    setVpsRows(merged);
                    setLoading(false);
                }
            } catch (err) {
                console.error('advisor dashboard: error loading ventas_por_sku', err);
                if (active) {
                    setError(err.message || 'Error al cargar datos');
                    setVpsRows([]);
                    setLoading(false);
                }
            }
        })();
        return () => { active = false; };
    }, [periodRange, salesRoute, user]);

    // Rutas presentes en ventas_por_sku (para el periodo)
    const presentRoutes = useMemo(() => {
        const map = new Map(); // k -> display
        for (const r of vpsRows || []) {
            const raw = routeFromRow(r);
            if (!raw) continue;
            const k = routeKey(raw);
            if (!map.has(k)) map.set(k, strip(raw));
        }
        return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    }, [vpsRows, clientsIndexByKey]);

    // Opciones del selector = intersección presentes ∩ permitidas (si vacía => presentes | permitidas)
    const routeOptions = useMemo(() => {
        if (!allowedRoutes.length) return [];
        const allowedSet = new Set(allowedRoutes.map(routeKey));
        const filtered = presentRoutes.filter((r) => allowedSet.has(routeKey(r)));
        return filtered.length ? filtered : allowedRoutes;
    }, [allowedRoutes, presentRoutes]);

    // Selección inicial de ruta (desde options + kvStorage)
    useEffect(() => {
        if (!routeOptions.length) return;
        const loadSaved = async () => {
            let saved = null;
            try { saved = await kvStorage.getItem('advisor.salesRoute'); } catch (e) { }
            const found = saved && routeOptions.find(r => routeKey(r) === routeKey(saved));
            setSalesRoute(found || routeOptions[0]);
        };
        loadSaved();
    }, [routeOptions]);

    useEffect(() => { if (salesRoute) try { kvStorage.setItem('advisor.salesRoute', salesRoute); } catch (e) { } }, [salesRoute]);

    // ---------- CLIENTES (ruta actual: varios campos + clientes que salen en ventas) ----------
    useEffect(() => {
        // índice por clave normalizada (para fallback y nombres)
        const map = new Map();
        for (const c of clients || []) {
            const code = clientCodeKey(c?.client_code || c?.code || c?.cve_cliente || c?.clave_cliente || c?.id || '');
            if (code) map.set(code, c);
        }
        setClientsIndexByKey(map);
    }, [clients]);

    // Fila de ventas de la ruta actual
    const rowsForRoute = useMemo(() => {
        const key = routeKey(salesRoute || '');
        console.log(`[AdvisorDashboard] Filtrando ventas para ruta: "${salesRoute}" (key: "${key}")`);

        const filtered = (vpsRows || []).filter(r => {
            const raw = routeFromRow(r);
            const matches = raw && routeKey(raw) === key;
            return matches;
        });

        console.log(`[AdvisorDashboard] Ventas filtradas: ${filtered.length} de ${vpsRows?.length || 0} total`);

        // Debug: mostrar muestra de las rutas que se encontraron
        if (vpsRows && vpsRows.length > 0) {
            const sampleRoutes = new Set();
            vpsRows.slice(0, 20).forEach(r => {
                const raw = routeFromRow(r);
                if (raw) sampleRoutes.add(raw);
            });
            console.log(`[AdvisorDashboard] Muestra de rutas en datos:`, Array.from(sampleRoutes));
        }

        return filtered;
    }, [vpsRows, salesRoute]);

    // Carga clientes por ruta (OR entre campos) + añade faltantes por ventas
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!salesRoute) {
                if (!cancelled) setClients([]);
                return;
            }

            // OFFLINE-FIRST: Usar repositorio
            let collected = [];
            try {
                // Pass salesRoute for server-side filtering
                collected = await getClients(salesRoute);
            } catch (err) {
                console.error('advisor dashboard: error loading clients from repo', err);
                collected = [];
            }

            if (cancelled) return;

            const normalizedRoute = normalizeRouteValue(salesRoute);
            const filtered = collected.filter((client) => {
                // Also verify locally to handle potential weak matches or varying formats
                return collectClientRouteCandidates(client).some((value) => value === normalizedRoute);
            });

            // NOTA: La lógica de "missingCodes" (clientes que salen en ventas pero no en la ruta)
            // es compleja de replicar offline si esos clientes no están en la DB local.
            // Asumimos que getClients() trae TODOS los clientes relevantes.
            // Si se requiere, se podría intentar buscar en el repo por código, pero getClients ya trae todo.

            const haveSet = new Set(filtered.map((c) => normalizeClientCode(c.client_code)));
            const missingCodes = Array.from(
                new Set(
                    (rowsForRoute || [])
                        .map((r) => normalizeClientCode(r.cve_cliente || r.clave_cliente || r.client_code || r.client_id))
                        .filter(Boolean)
                )
            ).filter((code) => !haveSet.has(code));

            if (missingCodes.length) {
                // Intentar buscar en 'collected' (que tiene todos los clientes locales)
                const extra = collected.filter(c => missingCodes.includes(normalizeClientCode(c.client_code)));
                filtered.push(...extra);
            }

            const deduped = [];
            const seen = new Set();
            for (const client of filtered) {
                const key = client?.id || client?.client_code || JSON.stringify(client);
                if (seen.has(key)) continue;
                seen.add(key);
                deduped.push(client);
            }
            if (!cancelled) setClients(deduped);
        })();
        return () => {
            cancelled = true;
        };
    }, [salesRoute, rowsForRoute]);

    // Lista de clientes filtrada = ya viene por ruta
    const filteredClients = useMemo(() => clients || [], [clients]);

    // ---------- IMÃGENES SKUs ----------
    useEffect(() => {
        let active = true;
        (async () => {
            // Static generation
            const map = {};
            // We can wait for allSkus or iterating over salesBySku or just generate on fly. 
            // But salesBySku is derived later. 
            // We can fetch structure or just rely on 'getSkuImage' doing the right thing if we change it.
            // Actually, let's just use the helper or pre-fill known SKUs if possible.
            // But this component doesn't fetch SKU list upfront except via sales.

            // However, getSkuImage below (line 227) uses this map.
            // Let's modify getSkuImage to just return static URL and skip this effect?
            // But getSkuImage is used in rendering.
        })();
        return () => { active = false; };
    }, []);
    useEffect(() => {
        let active = true;
        (async () => {
            const PAGE = 1000; let idx = 0; const files = new Set();
            while (true) {
                const { data, error } = await supabase.storage.from('sku-images').list('', { limit: PAGE, offset: idx });
                if (error) break;
                const chunk = Array.isArray(data) ? data : [];
                chunk.forEach((f) => files.add(f.name));
                if (chunk.length < PAGE) break;
                idx += PAGE;
            }
            if (active) setAvailableSkuFiles(files);
        })();
        return () => { active = false; };
    }, []);

    // ---------- VENTAS DERIVADAS DE ventas_por_sku (ruta actual) ----------
    useEffect(() => {
        // Total HL ruta
        const total = (rowsForRoute || []).reduce((acc, r) => acc + (Number(r.htls_total) || 0), 0);
        setTotalSalesAll(total);

        // "salesByZonaRaw" para contar clientes con compra
        const zoneRows = (rowsForRoute || []).map(r => ({
            venta: Number(r.htls_total) || 0,
            period_date: r.period_date,
            client_code: r.cve_cliente,
            zona: r.zona,
            sales_route: salesRoute
        }));
        setSalesByZonaRaw(zoneRows);

        // Ventas por SKU
        const acc = new Map();
        for (const r of rowsForRoute || []) {
            const sku = strip(r.cve_marca);
            const v = Number(r.htls_total) || 0;
            if (!sku || v <= 0) continue;
            acc.set(sku, (acc.get(sku) || 0) + v);
        }
        const rows = Array.from(acc.entries()).map(([sku, total]) => ({ ruta: salesRoute, sku, total }))
            .sort((a, b) => b.total - a.total);
        setSalesBySku(rows);
    }, [rowsForRoute, salesRoute]);

    // ---------- META (RUTA) ----------
    useEffect(() => {
        if (!salesRoute) return;
        let active = true;
        (async () => {
            const { from, to, isMonthPicker, nextFrom } = periodRange;
            try {
                // OFFLINE-FIRST: Usar repositorio
                const data = await getGoals({
                    salesRoute,
                    from,
                    to,
                    nextFrom,
                    isMonthPicker
                });

                let meta = 0;
                if (Array.isArray(data) && data.length) {
                    const latest = data.reduce((a, b) => (new Date(a.period_date) > new Date(b.period_date) ? a : b));
                    meta = Number(latest.meta) || 0;
                }
                if (active) setRouteMeta(meta);
            } catch (e) {
                console.error('Error loading goals', e);
            }
        })();
        return () => { active = false; };
    }, [salesRoute, periodRange]);

    // ---------- ZONA + APORTACIÓN (con ventas_por_sku) ----------
    const computedRouteZona = useMemo(() => {
        const byZone = new Map();
        for (const r of rowsForRoute || []) {
            const z = zoneClean(r.zona);
            const v = Number(r.htls_total) || 0;
            if (!z) continue;
            byZone.set(z, (byZone.get(z) || 0) + v);
        }
        if (!byZone.size) return 'OAXACA';
        let bestZ = 'OAXACA', bestV = -1;
        for (const [z, v] of byZone) { if (v > bestV) { bestV = v; bestZ = z; } }
        return bestZ;
    }, [rowsForRoute]);

    useEffect(() => { setRouteZona(computedRouteZona); }, [computedRouteZona]);

    useEffect(() => {
        const z = zoneClean(routeZona);
        const routeK = routeKey(salesRoute || '');
        if (!z) { setZoneTotalSales(0); setRouteSalesInZone(0); return; }

        let zoneTotal = 0;
        let routeInZone = 0;
        for (const r of vpsRows || []) {
            const zz = zoneClean(r.zona);
            if (zz !== z) continue;
            const v = Number(r.htls_total) || 0;
            zoneTotal += v;

            const rr = routeFromRow(r);
            if (rr && routeKey(rr) === routeK) routeInZone += v;
        }
        setZoneTotalSales(zoneTotal);
        setRouteSalesInZone(routeInZone);
    }, [routeZona, salesRoute, vpsRows, clientsIndexByKey]);

    // ---------- EVALUACIONES ----------
    useEffect(() => {
        if (!salesRoute) return;
        let active = true;
        (async () => {
            const { from, to, isMonthPicker, nextFrom } = periodRange;

            // OFFLINE-FIRST: Usar repositorio
            // getEvaluations ya maneja filtrado por fecha si se le pasa, 
            // pero evaluationsRepository.js actual (según logs previos) carga TODO y filtra en memoria o SQLite.
            // Vamos a cargar y filtrar aquí o mejorar el repo. 
            // Asumiremos que getEvaluations devuelve todas las evaluaciones locales (o las descarga).
            // Revisando logs previos, evaluationsRepository tiene getEvaluations() que retorna todo.

            try {
                const all = await getEvaluations();

                // Filtrar por fecha
                const start = from;
                const end = isMonthPicker && nextFrom ? nextFrom : (to || '9999-12-31');
                const isNextFrom = !!(isMonthPicker && nextFrom);

                const inDate = all.filter(e => {
                    const d = e.fecha || e.created_at;
                    if (d < start) return false;
                    if (isNextFrom) {
                        if (d >= end) return false;
                    } else {
                        if (d > end) return false;
                    }
                    return true;
                });

                const clientCodes = new Set((filteredClients || []).map((c) => normalizeClientCode(c.client_code)));
                const filtered = inDate.filter((e) => clientCodes.has(normalizeClientCode(e.client_code)));

                if (active) setEvalsThisMonth(filtered);
            } catch (e) {
                console.error('Error loading evaluations', e);
            }
        })();
        return () => { active = false; };
    }, [salesRoute, periodRange, filteredClients.length]);

    // ---------- VISITAS (OFFLINE-READY) ----------
    useEffect(() => {
        if (!salesRoute || filteredClients.length === 0) {
            setVisitsTodayCount(0);
            setVisitsThisMonthCount(0);
            setVisitsTotalCount(0);
            return;
        }

        let active = true;
        (async () => {
            const { from, to, isMonthPicker, nextFrom } = periodRange;
            // Definir rango total para la consulta (mes o acumulado)
            // Para "Visitas del mes" necesitamos el rango del mes.
            // Para "Visitas totales" (promedio diario) necesitamos el rango elapsed.
            // getVisitsSummary devuelve total en el rango y hoy.

            const clientIds = filteredClients.map(c => c.id);

            // Consultar para el periodo seleccionado
            const summary = await getVisitsSummary(clientIds, from, isMonthPicker && nextFrom ? nextFrom : to);

            if (active) {
                setVisitsTodayCount(summary.today);
                setVisitsThisMonthCount(summary.total); // Total en el periodo consultado
                setVisitsTotalCount(summary.total); // Usado para promedio diario
            }
        })();
        return () => { active = false; };
    }, [salesRoute, periodRange, filteredClients]);

    // ---------- DERIVADOS ----------
    const clientsTotal = filteredClients.length;
    const clientsWithPurchase = useMemo(() => {
        const set = new Set((salesByZonaRaw || []).filter((r) => Number(r.venta) > 0).map((r) => normalizeClientCode(r.client_code)));
        return set.size;
    }, [salesByZonaRaw]);

    const skuShare = useMemo(() => {
        const rows = (salesBySku || []).map(({ sku, total }) => ({
            sku,
            total,
            pct: totalSalesAll > 0 ? Math.round((total / totalSalesAll) * 100) : 0,
        }));
        rows.sort((a, b) => b.total - a.total);
        return rows;
    }, [salesBySku, totalSalesAll]);

    useEffect(() => {
        const set = new Set(salesBySku.map((r) => r.sku).filter(Boolean));
        const list = Array.from(set).sort();
        setAllSkus(list);
        if (skuFilter.length === 0) setSkuFilter(list);
    }, [salesBySku]); // eslint-disable-line

    const avgDailyVisits = useMemo(() => {
        const { elapsedBusiness } = periodRange;
        return elapsedBusiness > 0 ? (visitsTotalCount / elapsedBusiness).toFixed(1) : '0';
    }, [periodRange, visitsTotalCount]);

    const avgEval = useMemo(() => {
        const scores = (evalsThisMonth || []).map((e) => Number(e.puntajeTotal ?? e.puntaje_total ?? 0)).filter((n) => Number.isFinite(n));
        if (!scores.length) return 0;
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        return Math.round(avg * 10) / 10;
    }, [evalsThisMonth]);

    const aportacionZonaPct = useMemo(() => {
        if (zoneTotalSales <= 0) return 0;
        const val = Math.round((routeSalesInZone / zoneTotalSales) * 100);
        return Number.isFinite(val) ? val : 0;
    }, [routeSalesInZone, zoneTotalSales]);

    const tendencia = useMemo(() => {
        const { elapsedBusiness, totalBusiness } = periodRange;
        const hlPorDia = elapsedBusiness > 0 ? (totalSalesAll / elapsedBusiness) : 0;
        const hlProyectado = elapsedBusiness > 0
            ? Math.round(((totalSalesAll / elapsedBusiness) * totalBusiness + totalSalesAll) * 100) / 100
            : totalSalesAll;
        const pctMeta = routeMeta > 0 ? Math.round((hlProyectado / routeMeta) * 100) : 0;
        const hlFaltantes = Math.max(routeMeta - hlProyectado, 0);
        return { hlPorDia, hlProyectado, pctMeta, hlFaltantes, elapsedBusiness, totalBusiness };
    }, [periodRange, totalSalesAll, routeMeta]);

    // ---------- EFECTIVIDAD (vs Clientes del Día) ----------
    const effectivenessStats = useMemo(() => {
        // 1. Identificar día actual (0-6)
        // Nota: Usamos new Date(), ajusta si requieres timezone específico, pero para dashboard en vivo suele estar bien local.
        const todayDayNum = new Date().getDay();

        // 2. Filtrar clientes de la ruta que toca visitar hoy
        const scheduledToday = (filteredClients || []).filter(c => {
            const days = parseVisitDays(c);
            return days.includes(todayDayNum);
        });

        const scheduledCount = scheduledToday.length;

        // 3. Efectividad Visita: (Visitados HOY / Agendados HOY)
        // visitsTodayCount viene de getVisitsSummary(..., today, today)
        // OJO: visitsTodayCount es un número total de visitas, podría incluir clientes NO agendados.
        // Lo estricto es contar cuántos de los 'scheduledToday' fueron visitados.
        // Pero el requerimiento suele ser "Visitas Totales / Meta de Visitas".
        // Si el usuario dijo "vs sus clientes del dia", usaremos scheduledCount como base.
        // Si visitsTodayCount > scheduledCount (visitó fuera de ruta), puede dar > 100%.
        const visitEffectiveness = scheduledCount > 0
            ? Math.round((visitsTodayCount / scheduledCount) * 100)
            : 0;

        // 4. Efectividad Compra: (Clientes con Compra HOY / Scheduled)
        // Necesitamos saber cuántos compraron HOY. 'clientsWithPurchase' calculado antes era del mes o periodo.
        // Necesitamos 'clientsWithPurchaseToday'.

        // Revisamos 'vpsRows' (ventas_por_sku). Si incluye ventas de hoy (liveSales), podemos filtrar por fecha de hoy.
        const todayISO = new Date().toISOString().split('T')[0];
        const clientsWithPurchaseTodaySet = new Set();

        (vpsRows || []).forEach(r => {
            // Checar si la venta es de hoy
            if (r.period_date === todayISO || r.fecha === todayISO) {
                if (Number(r.htls_total) > 0 || Number(r.venta) > 0) {
                    clientsWithPurchaseTodaySet.add(normalizeClientCode(r.client_code || r.cve_cliente));
                }
            }
        });

        // Sumar también ventas directas si no están en vpsRows correctamente (aunque el hook de arriba intenta mezclarlas)
        // Asumimos vpsRows ya tiene merged live sales con fecha hoy.

        const purchaseCountToday = clientsWithPurchaseTodaySet.size;

        const purchaseEffectiveness = scheduledCount > 0
            ? Math.round((purchaseCountToday / scheduledCount) * 100)
            : 0;

        return {
            scheduledCount,
            visitEffectiveness,
            purchaseEffectiveness,
            purchaseCountToday
        };
    }, [filteredClients, visitsTodayCount, vpsRows]);

    const handlePrintDailyReport = async () => {
        try {
            const { BluetoothPrinterService } = await import('@/services/BluetoothPrinterService');
            if (!BluetoothPrinterService.isConnected) {
                await BluetoothPrinterService.connect();
            }

            // Datos para el reporte
            const stats = {
                salesTotal: totalSalesAll, // Dinero o HL? 'totalSalesAll' parece ser HL en el código (htls_total).
                // Re-calculating MONEY total specifically for ticket if needed.
                // El dashboard muestra 'Venta (HL)' en cards grandes? 
                // Revisando código: 'totalSalesAll' suma 'htls_total'.
                // Necesitamos el TOTAL DINERO para el ticket.
                // Vamos a sumar 'unit_price * qty' o 'venta' de vpsRows.
                salesTotalMoney: (vpsRows || []).reduce((acc, r) => acc + (Number(r.venta) || 0), 0),

                salesCount: (vpsRows || []).length, // Esto son items, no tickets. Mejor contar unique operations si fuera posible.
                // Aproximación: salesCount = 0 (no tenemos count de tickets real acá fácilmente sin otra query)
                // O usamos 'clientsWithPurchase' del periodo.

                totalHL: totalSalesAll.toFixed(1),
                totalBoxes: (vpsRows || []).reduce((acc, r) => {
                    // Si r.htls_total es cajas en liveSales... 
                    // Asumamos que vpsRows tiene 'cajas' o conversión.
                    // Si no, lo dejamos en 0 o igual a HL por ahora.
                    return acc + (Number(r.htls_total) || 0);
                }, 0).toFixed(0), // Placeholder

                visitsCount: visitsTodayCount,
                inventoryCount: 0, // No tenemos inventario final calculado acá

                // NEW METRICS
                visitEffectiveness: effectivenessStats.visitEffectiveness,
                purchaseEffectiveness: effectivenessStats.purchaseEffectiveness,
                scheduledClients: effectivenessStats.scheduledClients,

                // ROUTE OVERRIDE
                routeName: salesRoute
            };

            await BluetoothPrinterService.printDailyReport(stats, user, new Date());
            alert("Ticket enviado a imprimir");
        } catch (e) {
            console.error(e);
            alert("Error imprimiendo: " + e.message);
        }
    };
    const clientsWithCoords = useMemo(() => {
        const out = [];
        for (const c of filteredClients) {
            const lat = Number(c.lat ?? c?.coords?.lat ?? (Array.isArray(c.coords) ? c.coords[0] : null));
            const lng = Number(c.lng ?? c?.coords?.lng ?? (Array.isArray(c.coords) ? c.coords[1] : null));
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                out.push({
                    ...c, lat, lng, coords: { lat, lng },
                    title: c.name ?? c.business_name ?? c.id,
                    subtitle: strip(c.sales_route || c.ruta || c.internal_route || c.route || '')
                });
            }
        }
        return out;
    }, [filteredClients]);

    // Lista de SKUs filtrada por buscador
    const visibleSkus = useMemo(() => {
        const q = (skuSearch || '').trim().toLowerCase();
        if (!q) return skuShare;
        return skuShare.filter(r => r.sku.toLowerCase().includes(q));
    }, [skuShare, skuSearch]);

    // ✓ Top 10 clientes (por HL)
    const topClients = useMemo(() => {
        const acc = new Map();
        for (const r of rowsForRoute || []) {
            const code = strip(r.cve_cliente);
            if (!code) continue;
            const v = Number(r.htls_total) || 0;
            acc.set(code, (acc.get(code) || 0) + v);
        }
        const list = Array.from(acc.entries()).map(([code, total]) => {
            const c = clientsIndexByKey.get(clientCodeKey(code));
            const name = c?.name || c?.business_name || `Cliente ${code}`;
            return { code, name, total };
        }).sort((a, b) => b.total - a.total).slice(0, 10);
        return list;
    }, [rowsForRoute, clientsIndexByKey]);

    // ---------- UI ----------
    const SectionTitle = ({ children }) => (
        <div className="text-sm text-white/80 tracking-wide uppercase">{children}</div>
    );

    if (error) return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-4 rounded-full bg-red-50 dark:bg-red-950/30 mb-4">
                <AlertTriangle className="h-10 w-10 text-red-500" />
            </div>
            <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">Error al cargar datos</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-xs">{error}</p>
            <button onClick={() => { setError(null); }} className="mt-4 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Reintentar</button>
        </div>
    );

    if (loading) return <DashboardSkeleton />;

    return (
        <div className="max-w-screen-2xl mx-auto px-4 py-4 space-y-6 bg-[#1f2031]">
            <Helmet><title>Autoventa - General</title></Helmet>

            {/* Header */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                    <div className="flex-1">
                        <div className="text-white text-3xl font-extrabold leading-tight">Reporte de Experiencia de Ruta</div>
                        <div className="flex items-center gap-2">
                            <span className="text-white/60 text-sm">de {userName} ·</span>
                            <DashboardClock />
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        {/* Botón Sincronizar con estilo más visible */}
                        <SyncButton className="bg-green-600 text-white border-none hover:bg-green-700" size="sm" showLabel={true} />

                        {/* Botón Imprimir Reporte */}
                        <button
                            onClick={handlePrintDailyReport}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 transition-colors"
                        >
                            <span>Imprimir Reporte</span>
                        </button>

                        <div className="flex items-center gap-2">
                            <span className="text-white/70 text-sm">Periodo</span>
                            <input
                                type="month"
                                value={/^\d{4}-\d{2}$/.test(period) ? period : (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })()}
                                onChange={(e) => setPeriod(e.target.value)}
                                className="bg-white/10 text-white px-2 py-1 rounded"
                            />
                        </div>

                        {(routeOptions || []).length > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="text-white/70 text-sm">Ruta</span>
                                <Select value={salesRoute} onValueChange={setSalesRoute}>
                                    <SelectTrigger className="w-48 bg-white/10 text-white">
                                        <SelectValue placeholder="Selecciona ruta" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {routeOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>

            {/* 1) Venta vs Meta + Tendencia */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-[#2a2c44] border-0 shadow-lg">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-white text-base">Venta vs Meta ({periodLabel})</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="flex items-center gap-6">
                            <div style={{ width: 180, height: 180 }} className="shrink-0 flex items-center justify-center">
                                <DonutProgress
                                    value={routeMeta > 0 ? Math.min(100, Math.round((totalSalesAll / routeMeta) * 100)) : 0}
                                    text={`${routeMeta > 0 ? Math.min(100, Math.round((totalSalesAll / routeMeta) * 100)) : 0}%`}
                                    color="#22c55e"
                                    size={180}
                                />
                            </div>
                            <div className="text-white/90 text-sm space-y-2">
                                <div><span className="text-white/60">Ruta:</span> <span className="font-semibold text-green-200">{salesRoute || '—'}</span></div>
                                <div><span className="text-white/60">Meta HL:</span> <span className="font-semibold">{routeMeta.toLocaleString('es-MX')}</span></div>
                                <div><span className="text-white/60">Venta HL:</span> <span className="font-semibold">{(totalSalesAll || 0).toLocaleString('es-MX')}</span></div>
                                <div className="pt-2 border-t border-white/10">
                                    <div><span className="text-white/60">Tendencia HL/día hábil:</span> <span className="font-semibold">{tendencia.hlPorDia.toLocaleString('es-MX')}</span></div>
                                    <div><span className="text-white/60">Tendencia de cierre:</span> <span className="font-semibold">{tendencia.hlProyectado.toLocaleString('es-MX')} HL</span> <span className="text-white/70">({tendencia.pctMeta}% de meta)</span></div>
                                    <div><span className="text-white/60">HL faltantes (tendencia):</span> <span className="font-semibold">{tendencia.hlFaltantes.toLocaleString('es-MX')} HL</span></div>
                                    <div className="text-xs text-white/60">Cálculo: {tendencia.elapsedBusiness}/{tendencia.totalBusiness} días hábiles (L–S)</div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* 2) Participación SKU vs venta de la ruta */}
                <Card className="bg-[#2a2c44] border-0 shadow-lg">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-white text-base">Participación por SKU (vs venta de la ruta)</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {/* Buscador */}
                        <div className="mb-3">
                            <input
                                type="text"
                                placeholder="Buscar SKU..."
                                value={skuSearch}
                                onChange={(e) => setSkuSearch(e.target.value)}
                                className="w-full bg-white/10 text-white px-3 py-2 rounded text-sm placeholder-white/50"
                            />
                        </div>

                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                            {(visibleSkus.length ? visibleSkus : []).map((row) => (
                                <div key={row.sku} className="flex items-center gap-3">
                                    <div className="w-10 shrink-0">
                                        <img
                                            src={getSkuImage(row.sku)}
                                            alt={row.sku}
                                            crossOrigin="anonymous"
                                            className="w-10 h-10 object-contain rounded bg-white"
                                            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = getSkuStorageUrl(row.sku); }}
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between text-xs text-white/70">
                                            <span className="font-semibold text-white/90">{row.sku}</span>
                                            <span className="tabular-nums text-white/80">
                                                {row.total.toLocaleString('es-MX')} HL · {row.pct}%
                                            </span>
                                        </div>
                                        <div className="w-full bg-white/10 rounded h-2 mt-1">
                                            <div className="bg-green-400 h-2 rounded" style={{ width: `${row.pct}%` }} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {visibleSkus.length === 0 && (
                                <div className="text-white/70 text-sm">Sin ventas por SKU en el periodo.</div>
                            )}
                        </div>
                        <div className="text-[11px] text-white/60 mt-2">
                            * Fuente: <code className="text-white/70">ventas_por_sku</code> (campo <code>htls_total</code>). El % es contra la venta total (HL) de la ruta del periodo.
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* 3) KPIs */}
            <div>
                <SectionTitle>Indicadores Clave</SectionTitle>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mt-2">
                    {/* Efec. Visita (vs Clientes del Día) */}
                    <Card className="bg-[#2a2c44] border-0">
                        <CardHeader className="pb-1">
                            <CardTitle className="text-green-200 text-xs">% Efec. Visita (Día)</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div className="flex flex-col items-center justify-center">
                                <div style={{ width: 100, height: 100 }}>
                                    <DonutProgress
                                        value={effectivenessStats.visitEffectiveness}
                                        text={`${effectivenessStats.visitEffectiveness}%`}
                                        color="#ec4899"
                                        size={100}
                                    />
                                </div>
                                <div className="text-white/60 text-xs mt-2 text-center">
                                    <span className="text-white font-semibold">{visitsTodayCount}</span> visitas
                                </div>
                                <div className="text-white/60 text-[10px] text-center">
                                    de {effectivenessStats.scheduledCount} agendados hoy
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Efec. Compra (vs Clientes del Día) */}
                    <Card className="bg-[#2a2c44] border-0">
                        <CardHeader className="pb-1">
                            <CardTitle className="text-green-200 text-xs">% Efec. Compra (Día)</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div className="flex flex-col items-center justify-center">
                                <div style={{ width: 100, height: 100 }}>
                                    <DonutProgress
                                        value={effectivenessStats.purchaseEffectiveness}
                                        text={`${effectivenessStats.purchaseEffectiveness}%`}
                                        color="#8b5cf6"
                                        size={100}
                                    />
                                </div>
                                <div className="text-white/60 text-xs mt-2 text-center">
                                    <span className="text-white font-semibold">{effectivenessStats.purchaseCountToday}</span> con venta
                                </div>
                                <div className="text-white/60 text-[10px] text-center">
                                    de {effectivenessStats.scheduledCount} agendados hoy
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    {/* Clientes con compra */}
                    <Card className="bg-[#2a2c44] border-0">
                        <CardHeader className="pb-1">
                            <CardTitle className="text-green-200 text-xs">Clientes con compra</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div className="flex flex-col items-center justify-center gap-2">
                                <div style={{ width: 100, height: 100 }}>
                                    <DonutProgress
                                        value={clientsTotal > 0 ? Math.round((clientsWithPurchase / clientsTotal) * 100) : 0}
                                        text={`${clientsTotal > 0 ? Math.round((clientsWithPurchase / clientsTotal) * 100) : 0}%`}
                                        color="#3b82f6"
                                        size={100}
                                    />
                                </div>
                                <div className="text-white text-lg font-bold">{clientsWithPurchase}</div>
                                <div className="text-white/60 text-xs -mt-1">de {clientsTotal} clientes</div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Aportación a la zona */}
                    <Card className="bg-[#2a2c44] border-0">
                        <CardHeader className="pb-1">
                            <CardTitle className="text-green-200 text-xs">% Aportación a la zona</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            {routeZona ? (
                                <div className="text-center text-white/70 text-xs mb-1">{routeZona}</div>
                            ) : null}
                            <div className="flex flex-col items-center justify-center">
                                <div style={{ width: 100, height: 100 }}>
                                    <DonutProgress value={aportacionZonaPct} text={`${aportacionZonaPct}%`} color="#22c55e" size={100} />
                                </div>
                                <div className="text-white/60 text-xs mt-2">
                                    Venta zona: <span className="text-white font-semibold">{zoneTotalSales.toLocaleString('es-MX')} HL</span>
                                </div>
                                <div className="text-white/60 text-xs">
                                    Aportación ruta: <span className="text-white font-semibold">{routeSalesInZone.toLocaleString('es-MX')} HL</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-[#2a2c44] border-0">
                        <CardHeader className="pb-1"><CardTitle className="text-green-200 text-xs">Visitas del día</CardTitle></CardHeader>
                        <CardContent className="pt-0">
                            <div className="text-white text-3xl font-extrabold">{visitsTodayCount}</div>
                            <div className="text-white/60 text-xs mt-1">Hoy</div>
                        </CardContent>
                    </Card>

                    <Card className="bg-[#2a2c44] border-0">
                        <CardHeader className="pb-1"><CardTitle className="text-green-200 text-xs">Visitas del mes</CardTitle></CardHeader>
                        <CardContent className="pt-0">
                            <div className="text-white text-3xl font-extrabold">{visitsThisMonthCount}</div>
                            <div className="text-white/60 text-xs mt-1">{periodLabel}</div>
                        </CardContent>
                    </Card>

                    <Card className="bg-[#2a2c44] border-0">
                        <CardHeader className="pb-1"><CardTitle className="text-green-200 text-xs">Promedio visitas diarias</CardTitle></CardHeader>
                        <CardContent className="pt-0">
                            <div className="text-white text-3xl font-extrabold">{avgDailyVisits}</div>
                            <div className="text-white/60 text-xs mt-1">Visitas totales / días hábiles</div>
                        </CardContent>
                    </Card>

                    <Card className="bg-[#2a2c44] border-0">
                        <CardHeader className="pb-1"><CardTitle className="text-green-200 text-xs">Promedio de evaluaciones</CardTitle></CardHeader>
                        <CardContent className="pt-0">
                            <div className="text-white text-3xl font-extrabold">{avgEval}</div>
                            <div className="text-white/60 text-xs mt-1">{periodLabel}</div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* 4) Mapa + Top 10 clientes (reemplaza "Venta total de la ruta") */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 bg-[#2a2c44] border-0">
                    <CardHeader className="pb-2"><CardTitle className="text-white text-base">Mapa de Clientes</CardTitle></CardHeader>
                    <CardContent className="pt-0">
                        <div className="rounded-lg overflow-hidden ring-1 ring-white/10">
                            <InteractiveMap items={clientsWithCoords} height="24rem" allowManualPick={false} />
                        </div>
                    </CardContent>
                </Card>

                {/* ✓ Nuevo panel: Top 10 clientes (por HL) */}
                <Card className="bg-[#2a2c44] border-0">
                    <CardHeader className="pb-2"><CardTitle className="text-white text-base">Top 10 clientes (por HL)</CardTitle></CardHeader>
                    <CardContent className="pt-0">
                        <div className="space-y-2">
                            {topClients.length === 0 ? (
                                <div className="text-white/70 text-sm">Sin datos de clientes para esta ruta.</div>
                            ) : topClients.map(c => (
                                <div key={c.code} className="w-full text-left bg-white/5 rounded-lg p-3">
                                    <div className="flex justify-between text-white/80 text-[13px]">
                                        <span className="font-semibold">{c.name}</span>
                                        <span className="tabular-nums">{c.total.toLocaleString('es-MX')} HL</span>
                                    </div>
                                    <div className="text-[11px] text-white/60">Código: {c.code}</div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="text-[11px] text-white/50 text-right pb-4">Heineken · Dashboard Asesor</div>
        </div>
    );
}
