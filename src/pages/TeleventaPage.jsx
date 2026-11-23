import React, { useEffect, useMemo, useState, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import TeleventaClientDashboard from '@/components/TeleventaClientDashboard';
import SalesDialog from '@/components/SalesDialog';
import SalesSimulator from '@/components/SalesSimulator';
import ReceiptModal from '@/components/ReceiptModal';
import { fetchVentasPorSku } from '@/lib/mysqlVentasPorSku'; // Keep for safety if used elsewhere? No, replacing usage.
import { getSalesBySku } from '@/repositories/salesRepository';
import { getClientsPaged, getClientsByIds } from '@/repositories/clientsRepository';
import DonutProgress from '@/components/DonutProgress';
import { Phone, PhoneCall, ShoppingBag, TrendingUp, Users, Calendar, Search, CheckCircle2, Clock, BarChart3, MapPin } from 'lucide-react';
import { telephonyCallService } from '@/services/telephonyCallService';
import { Capacitor } from '@capacitor/core';
import { getDb } from '@/lib/localDb';

const ROUTE_FIELDS = ['route', 'sale_route', 'sales_route', 'internal_route', 'salesroute', 'ruta'];
const TIMEZONE = 'America/Mexico_City';

// HelperCopied from TelesalesDashboard for strict parity
const normalizeRouteStrict = (r) => (r || "").toString().trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
const isRouteMatchStrict = (dataRoute, targetRoute) => {
  const r = normalizeRouteStrict(dataRoute);
  const t = normalizeRouteStrict(targetRoute);
  if (r === t) return true;
  // Numeric match (ignore leading zeros e.g. "06" == "6")
  const nR = parseInt(r, 10);
  const nT = parseInt(t, 10);
  if (!isNaN(nR) && !isNaN(nT) && nR === nT) return true;
  return false;
}

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
      return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
    } catch (e) {
      // ignore JSON parse errors and fall back to split
    }
  }
  return text.split(/[,;|]/).map((entry) => entry.trim()).filter(Boolean);
};

const collectClientRouteCandidates = (client) => {
  const set = new Set();
  if (!client) return [];
  ROUTE_FIELDS.forEach((field) => {
    const entries = splitMultiValue(client[field]);
    entries.forEach((entry) => {
      const normalized = normalizeRouteValue(entry);
      if (normalized) set.add(normalized);
    });
  });
  return Array.from(set);
};

const collectProfileRouteCandidates = (routeValue) => {
  return splitMultiValue(routeValue)
    .map((entry) => normalizeRouteValue(entry))
    .filter(Boolean);
};

const monthRangeFromYMD = (ymd) => {
  if (!ymd || ymd.length < 7) return { from: null, to: null };
  const ym = ymd.slice(0, 7);
  const [year, month] = ym.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return { from: null, to: null };
  const from = `${ym}-01`;
  const next = new Date(year, month, 1);
  const to = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  return { from, to };
};

const toLocalYMD = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
};

const dayNameToNumber = (input) => {
  if (input === null || input === undefined) return null;
  const dictionary = {
    domingo: 0, dom: 0,
    lunes: 1, lun: 1,
    martes: 2, mar: 2,
    miercoles: 3, mie: 3, mi: 3,
    jueves: 4, jue: 4,
    viernes: 5, vie: 5,
    sabado: 6, sab: 6
  };
  const key = String(input).trim().toLowerCase();
  if (dictionary.hasOwnProperty(key)) return dictionary[key];
  const numeric = Number(key);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 6) return numeric;
  return null;
};

const parseVisitDays = (client) => {
  if (!client) return [];
  const raw = client.visit_days || client.visitDays || client.visitDaysText || '';
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((value) => dayNameToNumber(value)).filter((value) => value !== null);
  }
  const text = String(raw).trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value));
      }
    } catch (e) {
      // ignore parse errors
    }
  }
  return text
    .split(/[,;|\s]+/)
    .map((part) => dayNameToNumber(part))
    .filter((value) => value !== null);
};

const pickVentasDate = (row) => row?.fecha_alta || row?.period_date || row?.periodDate || null;

function endOfMonthISO(y, m) {
  const dt = new Date(y, m, 0);
  return dt.toISOString().slice(0, 10);
}

function countBusinessDays(fromISO, toISO) {
  if (!fromISO || !toISO) return 0;
  const from = new Date(fromISO);
  const to = new Date(toISO);
  if (to < from) return 0;
  let c = 0;
  const d = new Date(from);
  while (d <= to) {
    const dow = d.getDay();
    if (dow !== 0) c += 1; // L-S como días hábiles
    d.setDate(d.getDate() + 1);
  }
  return c;
}

export default function TeleventaPage() {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);

  const [selectedClient, setSelectedClient] = useState(null);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [callSaving, setCallSaving] = useState(false);
  const [visitSaving, setVisitSaving] = useState(false);

  const [calls, setCalls] = useState([]);
  const [salesDialogConfig, setSalesDialogConfig] = useState(null);
  const [orderModalClient, setOrderModalClient] = useState(null);
  const [receiptSale, setReceiptSale] = useState(null);
  const [receiptClient, setReceiptClient] = useState(null);

  const routeFromContext = user?.user_metadata?.route || user?.user_metadata?.ruta || null;
  const [effectiveRoute, setEffectiveRoute] = useState(routeFromContext || null);
  const [allowedRoutesList, setAllowedRoutesList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDayFilter, setSelectedDayFilter] = useState(new Date().getDay());
  const [selectedRouteFilter, setSelectedRouteFilter] = useState('');
  const [assetSerials, setAssetSerials] = useState({});
  const [monthlySalesMap, setMonthlySalesMap] = useState({});
  const [routeMeta, setRouteMeta] = useState(0);
  const [monthHl, setMonthHl] = useState(0);
  const [todayRouteHl, setTodayRouteHl] = useState(0);
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [finalizeTotals, setFinalizeTotals] = useState(null);

  const todayStr = useMemo(() => toLocalYMD(new Date()), []);
  const currentMonthRange = useMemo(() => monthRangeFromYMD(todayStr), [todayStr]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    const fetchRouteAndClients = async () => {
      setLoadingClients(true);
      try {
        // Recolectar TODAS las rutas permitidas desde:
        // 1) supervisor_allowed_sales_routes
        // 2) supervisor_allowed_routes
        // 3) profiles.route
        // 4) user_metadata.route / ruta
        // 5) caché local para modo offline
        const collectedDisplay = new Map(); // normalizedStrict -> displayLabel
        const addRouteEntry = (raw) => {
          splitMultiValue(raw).forEach((entry) => {
            const clean = String(entry || '').trim();
            if (!clean) return;
            const strictKey = normalizeRouteStrict(clean);
            if (!strictKey) return;
            if (!collectedDisplay.has(strictKey)) {
              collectedDisplay.set(strictKey, clean.toUpperCase());
            }
          });
        };

        // Cargar primero desde caché local + metadata para respuesta rápida / offline
        if (routeFromContext) addRouteEntry(routeFromContext);
        try {
          const cachedAllowed = localStorage.getItem(`televenta_allowed_routes_${user.id}`);
          if (cachedAllowed) addRouteEntry(JSON.parse(cachedAllowed));
        } catch {}
        try {
          const cachedSingle = localStorage.getItem(`televenta_user_route_${user.id}`);
          if (cachedSingle) addRouteEntry(cachedSingle);
        } catch {}

        // Consultar Supabase si hay red para obtener TODAS las rutas permitidas actualizadas
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
          try {
            const [salesRoutesRes, internalRoutesRes, profileRes] = await Promise.allSettled([
              supabase
                .from('supervisor_allowed_sales_routes')
                .select('sales_route')
                .eq('supervisor_id', user.id),
              supabase
                .from('supervisor_allowed_routes')
                .select('route')
                .eq('supervisor_id', user.id),
              supabase
                .from('profiles')
                .select('route')
                .eq('id', user.id)
                .limit(1)
            ]);

            const remoteRoutes = [];
            if (salesRoutesRes.status === 'fulfilled' && Array.isArray(salesRoutesRes.value?.data)) {
              salesRoutesRes.value.data.forEach((r) => {
                if (r?.sales_route) remoteRoutes.push(r.sales_route);
              });
            }
            if (internalRoutesRes.status === 'fulfilled' && Array.isArray(internalRoutesRes.value?.data)) {
              internalRoutesRes.value.data.forEach((r) => {
                if (r?.route) remoteRoutes.push(r.route);
              });
            }
            if (profileRes.status === 'fulfilled' && Array.isArray(profileRes.value?.data) && profileRes.value.data[0]?.route) {
              remoteRoutes.push(profileRes.value.data[0].route);
            }

            if (remoteRoutes.length > 0) {
              // Priorizar las rutas remotas + metadata actual
              collectedDisplay.clear();
              remoteRoutes.forEach(addRouteEntry);
              if (routeFromContext) addRouteEntry(routeFromContext);
              const listToCache = Array.from(collectedDisplay.values());
              try {
                localStorage.setItem(`televenta_allowed_routes_${user.id}`, JSON.stringify(listToCache));
                localStorage.setItem(`televenta_user_route_${user.id}`, listToCache.join(', '));
              } catch {}
            }
          } catch (err) {
            console.warn('televenta: no fue posible consultar rutas permitidas en Supabase (usando caché local)', err);
          }
        }

        const resolvedRoutesDisplay = Array.from(collectedDisplay.values()).sort((a, b) =>
          a.localeCompare(b, 'es', { numeric: true })
        );
        const resolvedRoute = resolvedRoutesDisplay.length > 0 ? resolvedRoutesDisplay.join(', ') : null;

        if (active) {
          setEffectiveRoute(resolvedRoute);
          setAllowedRoutesList(resolvedRoutesDisplay);
        }

        // ------------------------------------------------------------------
        // REFACTOR: Use MySQL Repository (getClientsPaged)
        // ------------------------------------------------------------------

        const targetRoutes = resolvedRoutesDisplay
          .map((entry) => normalizeRouteValue(entry))
          .filter(Boolean);

        let fetchedClients = [];
        try {
          const filters = {};
          if (targetRoutes.length === 1) {
            // 'sales_route' singular en clients-read.php busca (sales_route = ? OR internal_route = ?)
            filters.sales_route = targetRoutes[0];
          }
          // Si hay múltiples rutas (o ninguna), traemos hasta 3500 clientes y filtramos en cliente por sales_route O internal_route
          const res = await getClientsPaged({ page: 1, pageSize: 3500, filters });
          fetchedClients = res.data || [];

        } catch (err) {
          console.error('televenta: error al cargar clientes (MySQL)', err);
          fetchedClients = [];
        }

        let filteredClients = fetchedClients;
        if (resolvedRoutesDisplay.length > 0) {
          filteredClients = fetchedClients.filter((client) => {
            const candidates = [
              client.sales_route,
              client.internal_route,
              client.route,
              client.sale_route,
              client.salesroute,
              client.ruta
            ].filter(Boolean);
            return candidates.some((cRoute) =>
              resolvedRoutesDisplay.some((tRoute) => isRouteMatchStrict(cRoute, tRoute))
            );
          });
        }

        const localTableKey = `televenta_route_clients_${user.id}`;
        if (filteredClients.length > 0) {
          try {
            const db = await getDb();
            db?._storage?.set(localTableKey, filteredClients);
          } catch {}
          try {
            localStorage.setItem(localTableKey, JSON.stringify(filteredClients));
          } catch {}
        } else {
          try {
            const db = await getDb();
            const fromDb = db?._storage?.get(localTableKey);
            if (Array.isArray(fromDb) && fromDb.length > 0) {
              filteredClients = fromDb;
            } else {
              const allDbClients = db?._storage?.get('clients');
              if (Array.isArray(allDbClients) && allDbClients.length > 0) {
                if (targetRoutes.length > 0) {
                  const routeSet = new Set(targetRoutes);
                  filteredClients = allDbClients.filter((client) => {
                    const s = normalizeRouteValue(client.sales_route);
                    const i = normalizeRouteValue(client.internal_route);
                    return routeSet.has(s) || routeSet.has(i);
                  });
                } else {
                  filteredClients = allDbClients;
                }
              }
            }
          } catch {}
          if (filteredClients.length === 0) {
            try {
              const cachedRaw = localStorage.getItem(localTableKey);
              if (cachedRaw) {
                const cachedList = JSON.parse(cachedRaw);
                if (Array.isArray(cachedList) && cachedList.length > 0) {
                  filteredClients = cachedList;
                }
              }
            } catch {}
          }
        }

        if (active) setClients(filteredClients);
      } catch (err) {
        console.error('televenta: error inesperado al cargar clientes', err);
        let fallbackClients = [];
        try {
          const db = await getDb();
          const fromDb = db?._storage?.get(`televenta_route_clients_${user.id}`);
          if (Array.isArray(fromDb) && fromDb.length > 0) fallbackClients = fromDb;
        } catch {}
        if (fallbackClients.length === 0) {
          try {
            const cachedRaw = localStorage.getItem(`televenta_route_clients_${user.id}`);
            if (cachedRaw) fallbackClients = JSON.parse(cachedRaw) || [];
          } catch {}
        }
        if (active) setClients(fallbackClients);
      } finally {
        if (active) setLoadingClients(false);
      }
    };

    fetchRouteAndClients();
    return () => { active = false; };
  }, [user?.id, routeFromContext]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    const loadCalls = async () => {
      try {
        const { data } = await supabase
          .from('telesales_calls')
          .select('*')
          .eq('user_id', user.id)
          .order('call_time', { ascending: false })
          .limit(200);
        const rows = Array.isArray(data) ? data : [];

        // Leer también llamadas locales persistidas
        let localCalls = [];
        try {
          const raw = localStorage.getItem('televenta_saved_calls');
          if (raw) localCalls = JSON.parse(raw);
        } catch (e) {}

        const userLocalCalls = localCalls.filter(c => c.user_id === user.id);

        const mergedMap = new Map();
        [...rows, ...userLocalCalls].forEach(row => {
          const key = row.id || `${row.client_id}_${row.call_time}`;
          if (!mergedMap.has(key)) {
            mergedMap.set(key, row);
          }
        });

        const mergedRows = Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.call_time).getTime() - new Date(a.call_time).getTime()
        );

        const clientIds = Array.from(new Set(mergedRows.map((row) => row.client_id).filter(Boolean)));
        const clientMap = {};

        for (let index = 0; index < clientIds.length; index += 100) {
          const slice = clientIds.slice(index, index + 100);
          try {
            const chunk = await getClientsByIds(slice);
            (chunk || []).forEach((client) => { clientMap[client.id] = client; });
          } catch (err) {
            console.error('televenta: error al cargar clientes relacionados con llamadas', err);
          }
        }

        const enriched = mergedRows.map((row) => ({
          ...row,
          _client_name: row._client_name
            || clientMap[row.client_id]?.business_name
            || clientMap[row.client_id]?.name
            || null
        }));

        if (active) setCalls(enriched);
      } catch (err) {
        console.error('televenta: error al cargar llamadas', err);
        if (active) setCalls([]);
      }
    };

    loadCalls();
    const syncPendingLocalCalls = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      try {
        const raw = localStorage.getItem('televenta_saved_calls');
        if (!raw) return;
        const list = JSON.parse(raw);
        if (!Array.isArray(list) || list.length === 0) return;
        let changed = false;
        const updatedList = [];
        for (const item of list) {
          if (item && item.user_id === user.id && item._needs_sync) {
            const cleanPayload = {
              user_id: item.user_id,
              client_id: item.client_id,
              client_code: item.client_code || null,
              route: item.route || null,
              call_time: item.call_time,
              answered: !!item.answered,
              boxes_sold: Number(item.boxes_sold || 0),
              comments: item.comments || '',
              audio_url: item.audio_url || null,
              duration_seconds: item.duration_seconds || 0,
              verified_by_apk: !!item.verified_by_apk,
            };
            const { data, error } = await supabase.from('telesales_calls').insert([cleanPayload]).select();
            if (!error && Array.isArray(data) && data.length > 0) {
              updatedList.push({ ...data[0], _client_name: item._client_name || null });
              changed = true;
              continue;
            }
          }
          updatedList.push(item);
        }
        if (changed) {
          localStorage.setItem('televenta_saved_calls', JSON.stringify(updatedList));
          if (active) loadCalls();
        }
      } catch (e) {
        console.warn('[Televenta] Error sincronizando llamadas pendientes:', e);
      }
    };
    syncPendingLocalCalls();
    window.addEventListener('online', syncPendingLocalCalls);
    return () => {
      active = false;
      window.removeEventListener('online', syncPendingLocalCalls);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!clients.length) {
      setAssetSerials({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ids = clients.map((c) => c.id).filter(Boolean);
        if (!ids.length) {
          if (!cancelled) setAssetSerials({});
          return;
        }
        const { data, error } = await supabase
          .from("current_asset_locations")
          .select("client_id, asset_serial")
          .in("client_id", ids);
        if (error) throw error;
        const map = {};
        (data || []).forEach((row) => {
          if (!row?.client_id) return;
          const list = map[row.client_id] || [];
          if (row.asset_serial) list.push(row.asset_serial);
          map[row.client_id] = list;
        });
        if (!cancelled) setAssetSerials(map);
      } catch (err) {
        console.warn("televenta: error cargando activos", err);
        if (!cancelled) setAssetSerials({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clients]);

  useEffect(() => {
    if (!clients.length || !currentMonthRange.from || !currentMonthRange.to) {
      setMonthlySalesMap({});
      setMonthHl(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const codeToClientId = {};
        clients.forEach((client) => {
          const code = (client.client_code || client.cve_cliente || '').toString().trim();
          if (code && client.id) codeToClientId[code] = client.id;
        });
        const codeKeys = Object.keys(codeToClientId);
        if (!codeKeys.length) {
          if (!cancelled) {
            setMonthlySalesMap({});
            setMonthHl(0);
          }
          return;
        }

        // Updated Logic: Use Repository with Strict Filtering (Parity with Dashboard)
        const rowsRaw = await getSalesBySku({
          from: currentMonthRange.from,
          nextFrom: currentMonthRange.to,
          salesRoute: effectiveRoute // Pass the route to API/Repo
        });

        // Strict Client-Side Filter (Matches "06" == "6" logic)
        const rows = rowsRaw.filter(r => isRouteMatchStrict(r.sales_route || r.ruta, effectiveRoute));

        const map = {};
        let totalHl = 0;
        (rows || []).forEach((row) => {
          const code = (row.cve_cliente ?? '').toString().trim();
          // We must map sales back to clients by Matching Codes
          // The codeToClientId map uses normalized keys? No, currently raw from client.
          // Let's rely on exact match or basic trim.
          const clientId = codeToClientId[code];

          // If strict map fails, try finding by normalized code?
          // Re-using original logic: codeToClientId[code]
          if (!clientId) return;

          const hl = Number(row.htls_total || row.hlts_total || 0) || 0;
          if (!hl) return;

          totalHl += hl;
          map[clientId] = (map[clientId] || 0) + hl;
        });

        if (!cancelled) {
          if (totalHl > 0 || Object.keys(map).length > 0) {
            setMonthlySalesMap(map);
            setMonthHl(totalHl);
            try {
              localStorage.setItem(`televenta_month_sales_${user?.id || 'default'}`, JSON.stringify({ map, totalHl }));
            } catch {}
          } else {
            try {
              const rawCached = localStorage.getItem(`televenta_month_sales_${user?.id || 'default'}`);
              if (rawCached) {
                const parsed = JSON.parse(rawCached);
                setMonthlySalesMap(parsed.map || {});
                setMonthHl(Number(parsed.totalHl) || 0);
              }
            } catch {}
          }
        }
      } catch (err) {
        console.warn("televenta: error cargando ventas mensuales", err);
        if (!cancelled) {
          try {
            const rawCached = localStorage.getItem(`televenta_month_sales_${user?.id || 'default'}`);
            if (rawCached) {
              const parsed = JSON.parse(rawCached);
              setMonthlySalesMap(parsed.map || {});
              setMonthHl(Number(parsed.totalHl) || 0);
              return;
            }
          } catch {}
          setMonthlySalesMap({});
          setMonthHl(0);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clients, currentMonthRange]);

  useEffect(() => {
    if (!user?.id) {
      setTodayRouteHl(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const todayYmd = todayStr;
        const dayStart = `${todayYmd} 00:00:00`;
        const dayEnd = `${todayYmd} 23:59:59`;

        const { data: preventas, error: preventaError } = await supabase
          .from('preventa')
          .select('id')
          .eq('user_id', user.id)
          .gte('created_at', dayStart)
          .lte('created_at', dayEnd);

        if (preventaError || !Array.isArray(preventas) || !preventas.length) {
          if (!cancelled) setTodayRouteHl(0);
          return;
        }

        const preventaIds = preventas.map((p) => p.id);

        const { data: items, error: itemsError } = await supabase
          .from('preventa_items')
          .select('cve_marca, quantity')
          .in('preventa_id', preventaIds);

        if (itemsError || !Array.isArray(items) || !items.length) {
          if (!cancelled) setTodayRouteHl(0);
          return;
        }

        const norm = (s) => (s || "").toString().trim().toUpperCase().replace(/^0+/, "");

        const skuSet = new Set(
          items.map((it) => norm(it.cve_marca)).filter(Boolean)
        );

        const { data: skus, error: skusError } = await supabase
          .from('skus')
          .select('cve_marca, hlts')
          // We can't use .in with normalized set against raw DB col if DB has zeros.
          // But usually DB skus are standard. Let's fetch by standard list.
          // Better: fetch all relevant? Or fetch using IN?
          // If DB has "0783", norm("0783") is "783".
          // If we query "783", and DB is "0783", we fail.
          // Recommendation: Fetch `sku_descripcion` which we verified works better, or query flexible.
          // Let's stick to `skus` but assuming `cve_marca` in `skus` table is cleaned or we fetch larger set?
          // Actually, let's just fetch by `skuSet` array. Ideally `preventa` writes clean SKUs.
          .in('cve_marca', Array.from(skuSet));

        // Note: If this fails, we might need to fetch `sku_descripcion` instead.

        if (skusError || !Array.isArray(skus) || !skus.length) {
          // Fallback: Try fetching from sku_descripcion if skus table is empty/missing
          // (Just in case 'skus' is deprecated)
          /* 
          const {data: sd} = await supabase.from('sku_descripcion').select('cve_marca, hectolitros').in('cve_marca', Array.from(skuSet));
          */
          if (!cancelled) setTodayRouteHl(0);
          return;
        }

        const hltsMap = {};
        skus.forEach((row) => {
          if (!row?.cve_marca) return;
          const key = norm(row.cve_marca);
          const hlts = Number(row.hlts || 0) || 0;
          hltsMap[key] = hlts;
        });

        let totalHlToday = 0;
        items.forEach((item) => {
          const key = norm(item.cve_marca);
          const qty = Number(item.quantity || 0) || 0;
          const factor = hltsMap[key] || 0;
          totalHlToday += (qty * factor);
        });


        if (!cancelled) setTodayRouteHl(totalHlToday);
      } catch (err) {
        console.warn('televenta: error calculando HL del día desde preventas', err);
        if (!cancelled) setTodayRouteHl(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, todayStr]);

  useEffect(() => {
    if (!effectiveRoute || !currentMonthRange.from || !currentMonthRange.to) {
      setRouteMeta(0);
      return;
    }
    let active = true;
    (async () => {
      try {
        let q = supabase
          .from('metas_venta')
          .select('meta, period_date')
          .eq('sales_route', effectiveRoute)
          .gte('period_date', currentMonthRange.from)
          .lt('period_date', currentMonthRange.to);
        const { data, error } = await q;
        if (error) throw error;
        let meta = 0;
        if (Array.isArray(data) && data.length) {
          const latest = data.reduce((a, b) =>
            new Date(a.period_date) > new Date(b.period_date) ? a : b
          );
          meta = Number(latest.meta) || 0;
        }
        if (active) setRouteMeta(meta);
      } catch (err) {
        console.warn('televenta: error cargando meta de ventas', err);
        if (active) setRouteMeta(0);
      }
    })();
    return () => {
      active = false;
    };
  }, [effectiveRoute, currentMonthRange]);

  const {
    statusByClientId,
    boughtTodaySet,
    todayBoxes,
    todayOrders,
  } = useMemo(() => {
    const statusMap = new Map();
    const boughtSet = new Set();
    let boxesSum = 0;
    let ordersCount = 0;

    calls.forEach((call) => {
      const day = toLocalYMD(call.call_time);
      if (day !== todayStr) return;
      const boxes = Number(call.boxes_sold || 0);

      if (call.answered && boxes >= 1) {
        statusMap.set(call.client_id, 'bought');
        boughtSet.add(call.client_id);
        boxesSum += boxes;
        ordersCount += 1;
      } else if (!statusMap.has(call.client_id)) {
        statusMap.set(call.client_id, 'notBought');
      }
    });

    return {
      statusByClientId: statusMap,
      boughtTodaySet: boughtSet,
      todayBoxes: boxesSum,
      todayOrders: ordersCount,
    };
  }, [calls, todayStr]);

  const businessDaysInfo = useMemo(() => {
    if (!currentMonthRange.from || !currentMonthRange.to) {
      return { total: 0, elapsed: 0, remaining: 0 };
    }
    const [y, m] = currentMonthRange.from.split('-').map(Number);
    const monthEnd = endOfMonthISO(y, m);
    const total = countBusinessDays(currentMonthRange.from, monthEnd);
    const elapsed = countBusinessDays(currentMonthRange.from, todayStr);
    const remaining = Math.max(total - elapsed, 0);
    return { total, elapsed, remaining };
  }, [currentMonthRange, todayStr]);

  const monthHlRemaining = useMemo(
    () => Math.max(routeMeta - monthHl, 0),
    [routeMeta, monthHl]
  );

  const dailyHlTarget = useMemo(() => {
    if (businessDaysInfo.remaining <= 0) return 0;
    return monthHlRemaining / businessDaysInfo.remaining;
  }, [businessDaysInfo.remaining, monthHlRemaining]);

  const dailyHlProgressPct = useMemo(() => {
    if (dailyHlTarget <= 0) return 0;
    const ratio = todayRouteHl / dailyHlTarget;
    if (!Number.isFinite(ratio) || ratio < 0) return 0;
    return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  }, [todayRouteHl, dailyHlTarget]);

  const availableRoutes = useMemo(() => {
    const routesMap = new Map();
    const addRoute = (raw) => {
      const clean = String(raw || '').trim().toUpperCase();
      if (!clean) return;
      const key = normalizeRouteStrict(clean);
      if (!key) return;
      if (!routesMap.has(key)) routesMap.set(key, clean);
    };
    if (Array.isArray(allowedRoutesList) && allowedRoutesList.length > 0) {
      allowedRoutesList.forEach(addRoute);
    }
    if (effectiveRoute) {
      splitMultiValue(effectiveRoute).forEach(addRoute);
    }
    if (routesMap.size === 0) {
      clients.forEach((client) => {
        if (client?.sales_route) addRoute(client.sales_route);
        else if (client?.internal_route) addRoute(client.internal_route);
      });
    }
    return Array.from(routesMap.values()).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  }, [allowedRoutesList, effectiveRoute, clients]);

  const filteredClients = useMemo(() => {
    const search = (searchTerm || '').toString().toLowerCase();
    return clients
      .filter((client) => {
        if (!selectedRouteFilter) return true;
        const candidates = [
          client.sales_route,
          client.internal_route,
          client.route,
          client.sale_route,
          client.salesroute,
          client.ruta
        ].filter(Boolean);
        return candidates.some((r) => isRouteMatchStrict(r, selectedRouteFilter));
      })
      .filter((client) => {
        if (!search) return true;
        const matchesId = String(client.id || '').toLowerCase().includes(search);
        const matchesCode = String(client.client_code || '').toLowerCase().includes(search);
        const matchesName = String(client.business_name || client.name || '').toLowerCase().includes(search);
        return matchesId || matchesCode || matchesName;
      })
      .filter((client) => {
        if (selectedDayFilter === null || selectedDayFilter === '') return true;
        const visitDays = parseVisitDays(client);
        return visitDays.includes(Number(selectedDayFilter));
      })
      .filter((client) => statusByClientId.get(client.id) !== 'bought');
  }, [clients, selectedRouteFilter, searchTerm, selectedDayFilter, statusByClientId]);

  const answeredCount = useMemo(() => calls.filter((call) => call.answered).length, [calls]);
  const notAnsweredCount = useMemo(() => calls.filter((call) => !call.answered).length, [calls]);
  const boughtClients = useMemo(
    () => Array.from(new Set(calls.filter((call) => call.answered && Number(call.boxes_sold) > 0).map((call) => call.client_id))),
    [calls]
  );

  const effectiveDayForFreq = useMemo(() => {
    if (selectedDayFilter === null || selectedDayFilter === '') {
      return new Date().getDay();
    }
    return Number(selectedDayFilter);
  }, [selectedDayFilter]);

  const clientsWithFrequencyToday = useMemo(
    () =>
      clients.filter((client) => {
        const visitDays = parseVisitDays(client);
        return visitDays.includes(Number(effectiveDayForFreq));
      }).length,
    [clients, effectiveDayForFreq]
  );

  const buyersWithFrequencyToday = useMemo(
    () =>
      clients.filter((client) => {
        const visitDays = parseVisitDays(client);
        if (!visitDays.includes(Number(effectiveDayForFreq))) return false;
        return boughtTodaySet.has(client.id);
      }).length,
    [clients, effectiveDayForFreq, boughtTodaySet]
  );

  const effectivenessPct = useMemo(
    () =>
      clientsWithFrequencyToday > 0
        ? Math.round((buyersWithFrequencyToday / clientsWithFrequencyToday) * 100)
        : 0,
    [clientsWithFrequencyToday, buyersWithFrequencyToday]
  );

  const handleFinalizeDay = async () => {
    if (!user?.id) {
      toast({
        title: 'Sin usuario',
        description: 'No se pudo identificar al usuario de televenta.',
        variant: 'destructive',
      });
      return;
    }

    setFinalizeLoading(true);
    try {
      const todayCalls = calls.filter((call) => toLocalYMD(call.call_time) === todayStr);
      const totalCalls = todayCalls.length;
      const answered = todayCalls.filter((call) => call.answered).length;
      const unanswered = totalCalls - answered;
      const orders = todayCalls.filter((call) => call.answered && Number(call.boxes_sold) > 0);
      const ordersCount = orders.length;
      const boxes = orders.reduce((sum, call) => sum + (Number(call.boxes_sold) || 0), 0);
      const clientsContacted = new Set(todayCalls.map((call) => call.client_id).filter(Boolean)).size;
      const clientsWithPurchaseToday = new Set(orders.map((call) => call.client_id).filter(Boolean)).size;

      setFinalizeTotals({
        date: todayStr,
        totalCalls,
        answered,
        unanswered,
        ordersCount,
        boxes,
        hlToday: todayRouteHl,
        clientsContacted,
        clientsWithPurchaseToday,
        effectivenessPct,
      });
      setFinalizeDialogOpen(true);
    } finally {
      setFinalizeLoading(false);
    }
  };

  const handleSendWhatsappSummary = () => {
    if (!finalizeTotals) return;
    const phone = '522221427848';
    const lines = [
      `Cierre de dia Televenta ${finalizeTotals.date}`,
      `Llamadas totales: ${finalizeTotals.totalCalls}`,
      `Llamadas contestadas: ${finalizeTotals.answered}`,
      `Llamadas no contestadas: ${finalizeTotals.unanswered}`,
      `Pedidos con compra: ${finalizeTotals.ordersCount}`,
      `Cajas vendidas hoy: ${finalizeTotals.boxes}`,
      `HL vendidos hoy (simulador): ${finalizeTotals.hlToday.toLocaleString('es-MX', { maximumFractionDigits: 1 })}`,
      `Clientes contactados hoy: ${finalizeTotals.clientsContacted}`,
      `Clientes con frecuencia que compraron: ${finalizeTotals.clientsWithPurchaseToday}`,
      `Efectividad (frecuencia): ${finalizeTotals.effectivenessPct}%`,
    ];
    const message = encodeURIComponent(lines.join('\n'));
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    if (user?.id) {
      telephonyCallService.listenToRemoteCallTriggers(user.id);
    }
  }, [user?.id]);

  // Restaurar cliente pendiente si la app vuelve del marcador telefónico
  useEffect(() => {
    const restorePendingCall = () => {
      try {
        const raw = localStorage.getItem('televenta_pending_call_client');
        if (!raw) return;
        const pending = JSON.parse(raw);
        if (!pending?.client || !pending?.callStartTime) return;
        // Solo restaurar si pasaron menos de 30 minutos
        if (Date.now() - pending.callStartTime > 30 * 60 * 1000) {
          localStorage.removeItem('televenta_pending_call_client');
          return;
        }
        setSelectedClient(pending.client);
        setDashboardOpen(true);
        // Guardar el tiempo de inicio en el servicio para calcular duración
        telephonyCallService.recordingStartTime = new Date(pending.callStartTime);
        telephonyCallService.currentRecordingCallId = pending.callId;
      } catch (e) {
        console.warn('[TeleventaPage] Error restaurando llamada pendiente:', e);
      }
    };

    if (Capacitor.isNativePlatform()) {
      // Escuchar cuando la app regresa al primer plano
      const listenerPromise = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) restorePendingCall();
      });
      // También intentar restaurar al montar (por si ya regresó)
      restorePendingCall();
      return () => { listenerPromise.then(l => l.remove()).catch(() => {}); };
    }
  }, []);

  const openDashboardForClient = (client) => {
    setSelectedClient(client);
    setDashboardOpen(true);

    if (client?.phone) {
      const cleanPhone = String(client.phone).replace(/[^0-9+]/g, '');
      if (cleanPhone) {
        if (Capacitor.isNativePlatform()) {
          // Persistir cliente y timestamp antes de salir a la app de teléfono
          const callId = 'call_' + Date.now();
          const callStartTime = Date.now();
          try {
            localStorage.setItem('televenta_pending_call_client', JSON.stringify({
              client,
              callId,
              callStartTime
            }));
          } catch (e) {}
          telephonyCallService.startRecording(callId);
          telephonyCallService.executeDirectPhoneCall(cleanPhone);
        } else if (user?.id) {
          // Si estamos en el navegador Web PC, emitir señal en tiempo real al celular del televenta
          telephonyCallService.triggerRemoteCallFromWeb(user.id, cleanPhone, client.id);
          toast({
            title: 'Llamada emitida',
            description: `Se envió la señal al teléfono celular para marcar a ${client.business_name || client.name || cleanPhone}.`
          });
        }
      }
    }
  };

  const closeDashboard = () => {
    setDashboardOpen(false);
    setSelectedClient(null);
  };

  const normalizeClientForSales = (client) => {
    if (!client) return null;
    const name = client.name || client.business_name || '';
    return { ...client, name };
  };

  const openSalesDialogForClient = (client) => {
    const normalized = normalizeClientForSales(client);
    if (!normalized) return;
    setSalesDialogConfig({ client: normalized });
  };

  const handleOpenSalesDialog = () => {
    if (!selectedClient) return;
    openSalesDialogForClient(selectedClient);
  };

  const handleClientPhoneUpdated = (newPhone, targetClientObj = selectedClient) => {
    if (!newPhone) return;
    const targetId = targetClientObj?.id;
    const targetCode = targetClientObj?.client_code;
    setSelectedClient((prev) => (prev ? { ...prev, phone: newPhone } : prev));
    setClients((prev) =>
      (prev || []).map((c) =>
        (targetId && c.id === targetId) || (targetCode && String(c.client_code) === String(targetCode))
          ? { ...c, phone: newPhone }
          : c
      )
    );
  };

  const handleClientVisitDaysUpdated = (newVisitDays, targetClientObj = selectedClient) => {
    if (!newVisitDays) return;
    const targetId = targetClientObj?.id;
    const targetCode = targetClientObj?.client_code;
    setSelectedClient((prev) => (prev ? { ...prev, visit_days: newVisitDays } : prev));
    setClients((prev) =>
      (prev || []).map((c) =>
        (targetId && c.id === targetId) || (targetCode && String(c.client_code) === String(targetCode))
          ? { ...c, visit_days: newVisitDays }
          : c
      )
    );
  };

  const handleAnsweredYes = (updatedPhone) => {
    if (!selectedClient) return;
    const clientToOrder = {
      ...selectedClient,
      ...(updatedPhone ? { phone: updatedPhone } : {}),
    };
    if (updatedPhone) {
      handleClientPhoneUpdated(updatedPhone, selectedClient);
    }
    closeDashboard();
    setOrderModalClient(clientToOrder);
  };

  const handleCallSubmit = async ({ answered, boxes_sold, comments, via_whatsapp, clientOverride = null }) => {
    const targetClient = clientOverride || selectedClient;
    if (!targetClient || !user) {
      return { success: false, error: 'Selecciona un cliente antes de registrar la llamada.' };
    }

    setCallSaving(true);
    try {
      // Calcular duración desde timestamp guardado antes de marcar
      let durationSeconds = 0;
      let audioBlob = null;
      try {
        const pendingRaw = localStorage.getItem('televenta_pending_call_client');
        if (pendingRaw) {
          const pending = JSON.parse(pendingRaw);
          if (pending?.callStartTime) {
            durationSeconds = Math.round((Date.now() - pending.callStartTime) / 1000);
          }
        }
        // Intentar detener grabación si estaba activa
        const recording = await telephonyCallService.stopRecording(targetClient);
        if (recording?.durationSeconds > 0) durationSeconds = recording.durationSeconds;
        audioBlob = recording?.audioBlob || null;
      } catch (e) {
        console.warn('[TeleventaPage] Error al detener grabación:', e);
      }

      // Limpiar llamada pendiente del almacenamiento local
      localStorage.removeItem('televenta_pending_call_client');

      const callId = 'call_' + Math.random().toString(36).slice(2, 10);

      // Intentar subir audio a Hostinger
      let audioUrl = null;
      if (audioBlob) {
        audioUrl = await telephonyCallService.uploadAudioToHostinger(audioBlob, callId, targetClient.id);
      }

      // Prefijo en comentarios si es pedido por WhatsApp
      const finalComments = via_whatsapp
        ? `[WhatsApp] ${comments || ''}`.trim()
        : (comments || null);

      const payload = {
        user_id: user.id,
        client_id: targetClient.id,
        client_code: targetClient.client_code || null,
        route: targetClient.route
          || targetClient.sale_route
          || targetClient.sales_routes
          || targetClient.internal_route
          || effectiveRoute
          || null,
        call_time: new Date().toISOString(),
        answered: !!answered,
        boxes_sold: (answered || via_whatsapp) ? Number(boxes_sold || 0) : 0,
        comments: finalComments,
        audio_url: audioUrl || null,
        duration_seconds: durationSeconds || 0,
        verified_by_apk: Capacitor.isNativePlatform()
      };

      // Wrap Supabase call with 4s timeout to avoid hanging UI indefinitely
      const dbPromise = supabase.from('telesales_calls').insert([payload]).select();
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 4000));

      let inserted = null;
      try {
        const result = await Promise.race([dbPromise, timeoutPromise]);
        if (result?.error) console.warn('Supabase call insert error:', result.error);
        if (Array.isArray(result?.data) && result.data.length) {
          inserted = result.data[0];
        }
      } catch (e) {
        console.warn('Supabase call insert failed, using fallback:', e);
      }

      if (!inserted) {
        inserted = { ...payload, id: 'call_' + Math.random().toString(36).slice(2, 10), _needs_sync: true };
      }

      const enriched = {
        ...inserted,
        _client_name: targetClient?.business_name || targetClient?.name || null
      };

      // Guardar de forma persistente en localStorage
      try {
        const raw = localStorage.getItem('televenta_saved_calls');
        const existing = raw ? JSON.parse(raw) : [];
        const filtered = existing.filter(c => c.id !== enriched.id);
        localStorage.setItem('televenta_saved_calls', JSON.stringify([enriched, ...filtered].slice(0, 300)));
      } catch (e) {
        console.warn('Error al guardar llamada localmente:', e);
      }

      setCalls((prev) => [enriched, ...prev.filter(c => c.id !== enriched.id)].slice(0, 200));
      toast({ title: 'Llamada registrada', description: 'Se guardo la llamada correctamente.' });
      closeDashboard();
      return { success: true };
    } catch (err) {
      console.error('televenta: error al registrar llamada', err);
      const message = err?.message || 'No se pudo registrar la llamada.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      return { success: false, error: message };
    } finally {
      setCallSaving(false);
    }
  };

  const handleVisitRequest = async (client, reason) => {
    if (!client?.id || !user) {
      return { success: false, error: 'No es posible solicitar visita sin cliente o usuario valido.' };
    }
    if (visitSaving) {
      return { success: false, error: 'Ya se esta solicitando una visita para este cliente.' };
    }
    const trimmedReason = (reason || '').trim();
    if (!trimmedReason) {
      return { success: false, error: 'Agrega un comentario para el asesor.' };
    }

    setVisitSaving(true);
    try {
      let routeCandidates = collectClientRouteCandidates(client);
      if (routeCandidates.length === 0 && effectiveRoute) {
        routeCandidates = splitMultiValue(effectiveRoute);
      }
      const normalizedRouteCandidates = routeCandidates
        .map((value) => normalizeRouteValue(value))
        .filter(Boolean);

      if (normalizedRouteCandidates.length === 0) {
        const message = 'El cliente no tiene definida una ruta para asignar.';
        toast({ title: 'Ruta no disponible', description: message, variant: 'destructive' });
        return { success: false, error: message };
      }

      const { data: advisorRows, error: advisorError } = await supabase
        .from('profiles')
        .select('id, route, role')
        .eq('role', 'asesor-dinamico')
        .not('route', 'is', null)
        .limit(2000);

      if (advisorError) throw advisorError;

      const advisors = Array.isArray(advisorRows) ? advisorRows : [];
      const advisorMatch = advisors.find((profile) => {
        const advisorRoutes = collectProfileRouteCandidates(profile?.route);
        if (advisorRoutes.length === 0) return false;
        return advisorRoutes.some((route) => normalizedRouteCandidates.includes(route));
      });

      if (!advisorMatch) {
        const message = `No se encontro un asesor dinamico con las rutas: ${routeCandidates.join(', ')}.`;
        toast({ title: 'Sin asesor asignado', description: message, variant: 'destructive' });
        return { success: false, error: message };
      }

      const { data: existing, error: existingError } = await supabase
        .from('client_visits')
        .select('id, status')
        .eq('client_id', client.id)
        .eq('advisor_id', advisorMatch.id)
        .order('requested_at', { ascending: false })
        .limit(1);

      if (existingError) throw existingError;
      if (Array.isArray(existing) && existing.length) {
        const status = (existing[0].status || '').toString().toLowerCase();
        if (status && status !== 'completed' && status !== 'cancelled') {
          const message = 'Ya existe una visita pendiente para este cliente.';
          toast({ title: 'Visita pendiente', description: message });
          return { success: false, error: message };
        }
      }

      const { error: insertError } = await supabase
        .from('client_visits')
        .insert([{
          client_id: client.id,
          advisor_id: advisorMatch.id,
          status: 'pending',
          reason: trimmedReason
        }]);

      if (insertError) throw insertError;

      toast({
        title: 'Visita solicitada',
        description: 'Se envio la solicitud al asesor dinamico correspondiente.'
      });
      return { success: true };
    } catch (err) {
      console.error('televenta: error al solicitar visita', err);
      const message = err?.message || 'No se pudo solicitar la visita.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      return { success: false, error: message };
    } finally {
      setVisitSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-slate-800/40 backdrop-blur-xl border border-slate-700/60 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400">
            <PhoneCall className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Televenta &mdash; Llamadas</h1>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Ruta asignada: <span className="font-semibold text-slate-200">{effectiveRoute || 'Sin ruta definida'}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleFinalizeDay}
            disabled={finalizeLoading}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium shadow-lg shadow-emerald-900/30 rounded-xl px-5 py-2.5 transition-all disabled:opacity-60 flex items-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            {finalizeLoading ? 'Preparando cierre...' : 'Cerrar día'}
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/60 shadow-xl rounded-2xl hover:border-slate-600/80 transition-all">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" />
              Venta del día vs meta (HL)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4 pt-1">
            <div style={{ width: 90, height: 90 }} className="shrink-0">
              <DonutProgress
                value={dailyHlProgressPct}
                text={`${dailyHlProgressPct || 0}%`}
                color="#22c55e"
              />
            </div>
            <div className="text-xs text-slate-300 space-y-1.5 flex-1">
              <div className="flex justify-between border-b border-slate-700/50 pb-1">
                <span className="text-slate-400">HL hoy:</span>
                <span className="font-bold text-emerald-400">
                  {todayRouteHl.toLocaleString('es-MX', { maximumFractionDigits: 1 })}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-700/50 pb-1">
                <span className="text-slate-400">Meta diaria:</span>
                <span className="font-semibold text-slate-200">
                  {dailyHlTarget > 0
                    ? dailyHlTarget.toLocaleString('es-MX', { maximumFractionDigits: 1 })
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-700/50 pb-1">
                <span className="text-slate-400">Meta mes HL:</span>
                <span className="font-semibold text-slate-200">
                  {routeMeta.toLocaleString('es-MX')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">HL acumulado:</span>
                <span className="font-semibold text-slate-200">
                  {monthHl.toLocaleString('es-MX', { maximumFractionDigits: 1 })}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/60 shadow-xl rounded-2xl hover:border-slate-600/80 transition-all">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4" />
              Efectividad del día (frecuencia)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4 pt-1">
            <div style={{ width: 90, height: 90 }} className="shrink-0">
              <DonutProgress
                value={effectivenessPct}
                text={`${effectivenessPct || 0}%`}
                color="#3b82f6"
              />
            </div>
            <div className="text-xs text-slate-300 space-y-2 flex-1">
              <div className="p-2.5 rounded-xl bg-slate-900/40 border border-slate-700/50">
                <span className="text-slate-400 block text-[11px]">Con frecuencia hoy:</span>
                <span className="font-bold text-white text-base">
                  {clientsWithFrequencyToday}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/40 border border-slate-700/50">
                <span className="text-slate-400 block text-[11px]">Compraron hoy:</span>
                <span className="font-bold text-blue-400 text-base">
                  {buyersWithFrequencyToday}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/60 shadow-xl rounded-2xl hover:border-slate-600/80 transition-all">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
              <ShoppingBag className="h-4 w-4" />
              Pedidos y cajas del día
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-700/50 text-center">
              <p className="text-2xl font-black text-purple-400">
                {todayOrders || 0}
              </p>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Pedidos hoy</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-700/50 text-center">
              <p className="text-2xl font-black text-amber-400">
                {todayBoxes?.toLocaleString('es-MX', { maximumFractionDigits: 0 }) || 0}
              </p>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Cajas vendidas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Clients Column */}
        <Card className="lg:col-span-2 bg-slate-800/50 backdrop-blur-xl border border-slate-700/60 shadow-xl rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-slate-700/50 pb-4">
            <CardTitle className="text-lg font-bold text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-400" />
                Clientes
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-700/70 border border-slate-600 text-slate-300">
                {selectedRouteFilter ? `${filteredClients.length} / ${clients.length}` : clients.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6">
            {loadingClients ? (
              <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                Cargando clientes...
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Buscar por ID, código o nombre..."
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      className="pl-10 bg-slate-900/60 border-slate-700/80 text-slate-100 placeholder:text-slate-500 rounded-xl focus:border-emerald-500/80 focus:ring-emerald-500/20"
                    />
                  </div>
                  {availableRoutes.length > 0 && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-emerald-400 shrink-0" />
                      <select
                        value={selectedRouteFilter}
                        onChange={(event) => setSelectedRouteFilter(event.target.value)}
                        className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">Todas mis rutas ({availableRoutes.length})</option>
                        {availableRoutes.map((route) => (
                          <option key={route} value={route}>
                            Ruta {route}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                    <select
                      value={selectedDayFilter ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSelectedDayFilter(value === '' ? null : Number(value));
                      }}
                      className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">Todos los días</option>
                      <option value={0}>Domingo</option>
                      <option value={1}>Lunes</option>
                      <option value={2}>Martes</option>
                      <option value={3}>Miércoles</option>
                      <option value={4}>Jueves</option>
                      <option value={5}>Viernes</option>
                      <option value={6}>Sábado</option>
                    </select>
                  </div>
                </div>

                <ul className="max-h-[520px] space-y-2.5 overflow-auto pr-1">
                  {filteredClients.map((client, idx) => {
                    const status = statusByClientId.get(client.id) ?? 'noRecord';
                    const serials = assetSerials[client.id] || [];
                    const fallbackSerials = serials.length ? [] : splitMultiValue(client.cooler_serials || client.cooler || '');
                    const displayAssets = serials.length ? serials : fallbackSerials;
                    const hasCooler = displayAssets.length > 0;
                    const salesHL = Number(monthlySalesMap[client.id] || 0);
                    const hasSalesThisMonth = salesHL > 0;
                    const indicator = !hasSalesThisMonth ? (
                      <span
                        className={`inline-flex h-3 w-3 items-center justify-center rounded-full border border-white/80 shadow ${hasCooler ? 'bg-red-500' : 'bg-amber-400'
                          }`}
                        title={
                          hasCooler
                            ? 'Tiene enfriador pero no compra en el mes'
                            : 'Sin compras registradas en el mes'
                        }
                      />
                    ) : null;
                    const salesLabel = hasSalesThisMonth
                      ? `Compra mes: ${salesHL.toLocaleString('es-MX', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2
                      })} HL`
                      : hasCooler
                        ? 'Enfriador activo sin compra en el mes'
                        : 'Sin compra registrada en el mes';
                    
                    let bgStatusClass = 'bg-slate-800/70 border-slate-700/80 hover:bg-slate-750';
                    if (status === 'bought') bgStatusClass = 'bg-emerald-950/30 border-emerald-800/50 hover:bg-emerald-950/40';
                    if (status === 'notBought') bgStatusClass = 'bg-red-950/20 border-red-900/40 hover:bg-red-950/30';

                    return (
                      <li
                        key={client.id ? `${client.id}-${idx}` : `cli-${idx}`}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border p-4 gap-3 transition-all duration-200 ${bgStatusClass}`}
                      >
                        <div className="w-full sm:w-auto space-y-1">
                          <div className="font-semibold text-white text-sm flex items-center gap-2">
                            <span className={boughtTodaySet.has(client.id) ? 'underline decoration-emerald-400 decoration-2 underline-offset-4' : ''}>
                              {client.business_name || client.name || 'Sin nombre'}
                            </span>
                            {indicator}
                            {status === 'bought' && (
                              <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                Compró
                              </span>
                            )}
                            {status === 'notBought' && (
                              <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-red-500/20 text-red-400 border border-red-500/30">
                                Sin compra
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
                            <span>Código: <strong className="text-slate-200 font-mono">{client.client_code || '—'}</strong></span>
                            <span>Teléfono: <strong className="text-slate-300">{client.phone || 'No disponible'}</strong></span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-medium">{salesLabel}</div>
                        </div>
                        <div className="flex flex-row sm:flex-nowrap gap-2 w-full sm:w-auto mt-1 sm:mt-0 shrink-0">
                          <Button 
                            size="sm" 
                            className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-md shadow-emerald-900/20 rounded-xl px-4 py-2 flex items-center justify-center gap-1.5 text-xs" 
                            onClick={() => openDashboardForClient(client)}
                          >
                            <Phone className="h-3.5 w-3.5" />
                            Llamar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 sm:flex-none border-slate-600 bg-slate-700/60 text-slate-200 hover:bg-slate-600 hover:text-white rounded-xl px-4 py-2 flex items-center justify-center gap-1.5 text-xs"
                            onClick={() => openSalesDialogForClient(client)}
                          >
                            <ShoppingBag className="h-3.5 w-3.5" />
                            Ventas
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                  {filteredClients.length === 0 ? (
                    <li className="rounded-xl border border-dashed border-slate-700/80 p-8 text-center text-sm text-slate-400 bg-slate-900/30">
                      No hay clientes que coincidan con los filtros seleccionados.
                    </li>
                  ) : null}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Call Log & Quick Actions Right Column */}
        <div className="space-y-6">
          <Card className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/60 shadow-xl rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-slate-700/50 pb-3">
              <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                <Clock className="h-4 w-4 text-emerald-400" />
                Registro de llamadas
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:p-5">
              {calls.length === 0 ? (
                <div className="text-xs text-slate-400 py-6 text-center">Aún no hay llamadas registradas hoy.</div>
              ) : (
                <ul className="max-h-[320px] space-y-2.5 overflow-auto pr-1">
                  {calls.map((call, idx) => (
                    <li key={call.id ? `${call.id}-${idx}` : `call-${idx}`} className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3 text-xs space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-200">
                            <span className="font-mono text-emerald-400">{call.client_code || '—'}</span> &mdash; {call._client_name || call.client_id}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(call.call_time).toLocaleString('es-MX')}
                          </div>
                        </div>
                        <div>
                          {call.answered ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              ✓ {Number(call.boxes_sold || 0)} cajas
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                              ✗ No contestó
                            </span>
                          )}
                        </div>
                      </div>
                      {call.comments ? (
                        <div className="text-[11px] text-slate-300 bg-slate-800/80 p-2 rounded-lg border border-slate-750 italic">
                          "{call.comments}"
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/60 shadow-xl rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-slate-700/50 pb-3">
              <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-400" />
                Acciones rápidas
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/40 border border-slate-700/40">
                <span className="text-slate-300 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Llamadas contestadas:
                </span>
                <strong className="text-emerald-400 text-sm">{answeredCount}</strong>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/40 border border-slate-700/40">
                <span className="text-slate-300 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-400" />
                  Llamadas no contestadas:
                </span>
                <strong className="text-red-400 text-sm">{notAnsweredCount}</strong>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/40 border border-slate-700/40">
                <span className="text-slate-300 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-purple-400" />
                  Clientes que compraron:
                </span>
                <strong className="text-purple-400 text-sm">{boughtClients.length}</strong>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={dashboardOpen}
        onOpenChange={(open) => {
          setDashboardOpen(open);
          if (!open) setSelectedClient(null);
        }}
      >
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-hidden border-none bg-transparent p-0">
          {selectedClient ? (
            <TeleventaClientDashboard
              client={selectedClient}
              onCallSubmit={handleCallSubmit}
              onVisitRequest={handleVisitRequest}
              onClose={closeDashboard}
              onOpenSalesDialog={handleOpenSalesDialog}
              onAnsweredYes={handleAnsweredYes}
              onPhoneUpdated={(newPhone) => handleClientPhoneUpdated(newPhone, selectedClient)}
              onVisitDaysUpdated={(newDays) => handleClientVisitDaysUpdated(newDays, selectedClient)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {salesDialogConfig && (
        <SalesDialog
          client={salesDialogConfig.client}
          onClose={() => setSalesDialogConfig(null)}
        />
      )}

      {/* Modal de Captura de Pedido (Televenta con Precios Editables y Persistidos) */}
      {orderModalClient && (
        <Dialog open={!!orderModalClient} onOpenChange={(open) => !open && setOrderModalClient(null)}>
          <DialogContent className="max-w-6xl w-[98vw] max-h-[94vh] overflow-y-auto bg-slate-950 border border-slate-700/80 text-slate-100 p-2 sm:p-5 rounded-2xl shadow-2xl">
            <SalesSimulator
              client={orderModalClient}
              isTeleventa={true}
              allowPriceEdit={true}
              user={user}
              onCancel={() => setOrderModalClient(null)}
              onOrderSaved={async ({ preventaId, totalAmount, totalBoxes, items, saleDetails }) => {
                const clientRef = orderModalClient;
                await handleCallSubmit({
                  answered: true,
                  boxes_sold: Number(totalBoxes) || 0,
                  comments: `Preventa capturada en llamada (${totalBoxes} cajas - $${Number(totalAmount).toFixed(2)})`,
                  clientOverride: clientRef
                });
                setOrderModalClient(null);

                // Activar modal de ticket con auto-envío por WhatsApp
                const finalSale = saleDetails || {
                  id: preventaId,
                  preventaId,
                  totalAmount,
                  totalBoxes,
                  items: items || [],
                  client: clientRef,
                  created_at: new Date().toISOString()
                };
                setReceiptClient(clientRef);
                setReceiptSale(finalSale);

                toast({
                  title: '¡Pedido registrado y ticket listo!',
                  description: `Preventa guardada (${totalBoxes} cajas - $${Number(totalAmount).toFixed(2)}). Puedes descargar el ticket o enviarlo por WhatsApp.`,
                  className: 'bg-emerald-600 text-white'
                });
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de Ticket */}
      {receiptSale && (
        <ReceiptModal
          open={!!receiptSale}
          onOpenChange={(open) => {
            if (!open) {
              setReceiptSale(null);
              setReceiptClient(null);
            }
          }}
          saleData={receiptSale}
          client={receiptClient}
          autoSendWhatsApp={false}
        />
      )}

      <Dialog open={finalizeDialogOpen} onOpenChange={setFinalizeDialogOpen}>
        <DialogContent className="w-[92vw] max-w-md border border-slate-700/80 bg-slate-900/95 backdrop-blur-2xl text-slate-100 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              Cierre de día - Televenta
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Resumen operativo de llamadas y ventas del día.
            </DialogDescription>
          </DialogHeader>
          {finalizeTotals ? (
            <div className="space-y-2.5 text-xs pt-2">
              <div className="flex justify-between border-b border-slate-800 pb-1.5">
                <span className="text-slate-400">Fecha:</span>
                <span className="font-semibold text-white">{finalizeTotals.date}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-1.5">
                <span className="text-slate-400">Llamadas totales:</span>
                <span className="font-semibold text-white">{finalizeTotals.totalCalls}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-1.5">
                <span className="text-slate-400">Contestadas / No contestadas:</span>
                <span className="font-semibold text-white">
                  <span className="text-emerald-400">{finalizeTotals.answered}</span> / <span className="text-red-400">{finalizeTotals.unanswered}</span>
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-1.5">
                <span className="text-slate-400">Pedidos con compra:</span>
                <span className="font-semibold text-white">{finalizeTotals.ordersCount}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-1.5">
                <span className="text-slate-400">Cajas vendidas hoy:</span>
                <span className="font-bold text-amber-400">
                  {finalizeTotals.boxes.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-1.5">
                <span className="text-slate-400">HL vendidos hoy (simulador):</span>
                <span className="font-bold text-emerald-400">
                  {finalizeTotals.hlToday.toLocaleString('es-MX', { maximumFractionDigits: 1 })}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-1.5">
                <span className="text-slate-400">Clientes contactados:</span>
                <span className="font-semibold text-white">{finalizeTotals.clientsContacted}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-1.5">
                <span className="text-slate-400">Clientes con frecuencia que compraron:</span>
                <span className="font-semibold text-white">
                  {finalizeTotals.clientsWithPurchaseToday}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-1.5">
                <span className="text-slate-400">Efectividad (frecuencia):</span>
                <span className="font-bold text-blue-400">
                  {finalizeTotals.effectivenessPct}%
                </span>
              </div>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end pt-2">
                <Button
                  onClick={handleSendWhatsappSummary}
                  className="bg-emerald-600 text-white hover:bg-emerald-500 rounded-xl font-medium shadow-lg shadow-emerald-900/20"
                >
                  Enviar reporte por WhatsApp
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setFinalizeDialogOpen(false)}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 rounded-xl"
                >
                  Cerrar
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400 py-4 text-center">
              No se pudo obtener el resumen del día.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
