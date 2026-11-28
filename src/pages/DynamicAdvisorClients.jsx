import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/supabaseClient";
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { kvStorage } from "@/services/kvStorage";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from '@/components/ui/use-toast';
import ClientVisitsList from "@/components/ClientVisitsList";
import VisitForm from "@/components/VisitForm";
import AddExistingAssetModal from '@/components/clients/AddExistingAssetModal';
import SalesDialog from '@/components/SalesDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PackagePlus,
  MoreVertical,
  MapPin,
  DollarSign,
  Edit,
  ClipboardCheck,
  Search,
  Phone,
  Mail,
  Calendar,
  Layers,
  Store,
  RefreshCw,
  AlertCircle,
  ChevronRight,
  ShieldCheck,
  Building2,
  Navigation,
  Clock
} from 'lucide-react';
import { useNavigate } from "react-router-dom";
import { getOptionalPositionFast, parseClientCoords, distanceMeters } from '@/lib/geolocation';
import CensoSupervisorForm from '@/components/CensoSupervisorForm';

const ROUTE_CANDIDATE_FIELDS = ['sales_route', 'internal_route', 'route', 'ruta'];

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
    } catch (e) { }
  }
  return text.split(/[,;|]/).map((entry) => entry.trim()).filter(Boolean);
};

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

const DAYS_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const parseVisitDays = (client) => {
  if (!client) return [];
  const raw = client.visit_days || client.visit_day;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(d => String(d).trim());
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(d => String(d).trim());
    } catch (e) { }
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
};

const PAGE_SIZE = 30;

export default function DynamicAdvisorClients() {
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Estados de Rutas
  const [userRoute, setUserRoute] = useState("");
  const [allowedRoutes, setAllowedRoutes] = useState([]);
  const [loadingRoute, setLoadingRoute] = useState(true);

  // Estados de Clientes
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  // Filtros y Búsqueda
  const [search, setSearch] = useState("");
  const [selectedDay, setSelectedDay] = useState("all");
  const [selectedExclusivity, setSelectedExclusivity] = useState("all");
  const [page, setPage] = useState(1);

  // Modales
  const [visitClient, setVisitClient] = useState(null);
  const [salesClient, setSalesClient] = useState(null);
  const [assetClient, setAssetClient] = useState(null);
  const [detailClient, setDetailClient] = useState(null);
  const [censusClient, setCensusClient] = useState(null);
  const [editClient, setEditClient] = useState(null);
  const [editForm, setEditForm] = useState({});

  const fold = useCallback((s) => {
    if (s == null) return "";
    return String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');
  }, []);

  // Helper para resolver el nombre comercial o nombre más claro del cliente
  const getClientDisplayName = useCallback((c) => {
    if (!c) return 'Cliente';
    const code = String(c.client_code || c.cve_cliente || c.code || '').trim();
    const bName = String(
      c.business_name ||
      c.nombre_comercial ||
      c.razon_social ||
      c.nombre_negocio ||
      c.negocio ||
      ''
    ).trim();
    const name = String(c.name || '').trim();

    // 1. Preferir nombre comercial si es descriptivo
    if (bName && bName.toLowerCase() !== code.toLowerCase() && !/^cliente\s+\d+$/i.test(bName) && isNaN(Number(bName))) {
      return bName;
    }
    // 2. Preferir nombre de contacto o razón social
    if (name && name.toLowerCase() !== code.toLowerCase() && !/^cliente\s+\d+$/i.test(name) && isNaN(Number(name))) {
      return name;
    }
    if (bName) return bName;
    if (name) return name;
    return code ? `Cliente #${code}` : 'Cliente';
  }, []);

  // 1. Inicializar y detectar rutas de forma INSTANTÁNEA (0ms desde caché/metadata/SQLite)
  //    En /admin/users las rutas de asesores y supervisores se guardan en:
  //    - supervisor_allowed_sales_routes / supervisor_allowed_routes (por supervisor_id = user.id)
  //    - profiles.route / user_metadata.route
  useEffect(() => {
    let active = true;
    const initRoutes = async () => {
      try {
        let userObj = user;
        if (!userObj) {
          try {
            userObj = await kvStorage.getItem('last_known_user');
          } catch (e) { }
          if (!userObj) {
            const { data } = await supabase.auth.getSession();
            userObj = data?.session?.user;
          }
        }

        const meta = userObj?.user_metadata || {};
        const prof = userObj?.profile || {};
        let initialRoute = String(
          prof.route || prof.sales_route || prof.ruta || prof.route_number ||
          meta.route_number || meta.route || meta.sales_route || meta.ruta || ''
        ).trim();

        // Leer caché local rápida (kvStorage + SQLite/IndexedDB de rutas asignadas en /admin/users)
        const [cachedUserRoute, cachedGlobalRoute, localAllowed] = await Promise.all([
          userObj?.id ? kvStorage.getItem(`advisor_user_route_${userObj.id}`).catch(() => null) : Promise.resolve(null),
          kvStorage.getItem('last_known_route').catch(() => null),
          userObj?.id
            ? import('@/repositories/metadataRepository').then(({ getAllowedRoutes }) => getAllowedRoutes(userObj.id)).catch(() => ({ internal: [], sales: [] }))
            : Promise.resolve({ internal: [], sales: [] }),
        ]);

        if (cachedUserRoute) {
          initialRoute = String(cachedUserRoute).trim();
        } else if (!initialRoute && cachedGlobalRoute) {
          initialRoute = String(cachedGlobalRoute).trim();
        }

        let routesList = Array.from(
          new Set([
            ...(localAllowed?.sales || []),
            ...(localAllowed?.internal || []),
          ].map((r) => String(r || '').trim()).filter(Boolean))
        );

        if (!initialRoute && routesList.length > 0) {
          initialRoute = routesList[0];
        }

        if (initialRoute && !routesList.includes(initialRoute)) {
          routesList.unshift(initialRoute);
        }

        // ⚡ DESBLOQUEO INSTANTÁNEO (< 20ms): si ya tenemos ruta local/asignada, mostrar de inmediato sin esperar red
        if (active && (initialRoute || routesList.length > 0)) {
          const fastRoute = initialRoute || routesList[0] || '';
          setAllowedRoutes(routesList);
          setUserRoute(fastRoute);
          setLoadingRoute(false);
        }

        // Refresco en segundo plano (o fallback si era primera vez sin caché local)
        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (!isOffline && userObj?.id) {
          try {
            const { getAllowedRoutes } = await import('@/repositories/metadataRepository');
            const freshAllowed = await getAllowedRoutes(userObj.id, routesList.length === 0);
            const freshList = Array.from(
              new Set([
                ...(freshAllowed?.sales || []),
                ...(freshAllowed?.internal || []),
              ].map((r) => String(r || '').trim()).filter(Boolean))
            );
            if (freshList.length > 0) {
              routesList = freshList;
            }
          } catch (e) { }

          if (!initialRoute && routesList.length === 0) {
            try {
              const { data: profile } = await supabase.from('profiles').select('route').eq('id', userObj.id).maybeSingle();
              if (profile?.route) {
                initialRoute = String(profile.route).trim();
              }
            } catch (e) { }
          }
        }

        if (!initialRoute && routesList.length === 0) {
          try {
            const { detectUserRoute } = await import('@/repositories/routeRepository');
            const r = await detectUserRoute(userObj);
            if (r) initialRoute = String(r).trim();
          } catch (e) { }
        }

        if (initialRoute && !routesList.includes(initialRoute)) {
          routesList.unshift(initialRoute);
        }

        // Solo cargar el catálogo completo si el usuario sigue sin rutas (ej. Administrador)
        if (routesList.length === 0) {
          try {
            const { getAvailableRoutes } = await import('@/repositories/routeRepository');
            const av = await getAvailableRoutes();
            if (av?.sales?.length > 0) {
              routesList = av.sales;
            }
          } catch (e) { }
        }

        if (active) {
          setAllowedRoutes(routesList);
          const finalRoute = initialRoute || (routesList.length > 0 ? routesList[0] : '');
          setUserRoute((prev) => prev || finalRoute);
          if (finalRoute) {
            if (userObj?.id) {
              kvStorage.setItem(`advisor_user_route_${userObj.id}`, finalRoute).catch(() => {});
            }
            kvStorage.setItem('last_known_route', finalRoute).catch(() => {});
          }
        }
      } catch (err) {
        console.error('[DynamicAdvisorClients] Error initializing routes:', err);
      } finally {
        if (active) setLoadingRoute(false);
      }
    };

    initRoutes();
    return () => { active = false; };
  }, [user]);

  // Manejar cambio manual de ruta
  const handleRouteChange = (newRoute) => {
    setUserRoute(newRoute);
    setPage(1);
    if (user?.id) kvStorage.setItem(`advisor_user_route_${user.id}`, newRoute).catch(() => {});
    kvStorage.setItem('last_known_route', newRoute).catch(() => {});
  };

  // 2. Cargar clientes estrictamente filtrados por la ruta asignada
  useEffect(() => {
    if (loadingRoute) return;

    let cancelled = false;
    const run = async () => {
      let activeRoute = userRoute;

      // 🛡️ OFFLINE SAFEGUARD: Si no hay ruta detectada, intentar recuperar rápidamente desde SQLite
      if (!activeRoute) {
        try {
          const { getDb, isMockDb } = await import('@/lib/localDb');
          const db = await getDb();
          let inferred = '';
          if (db && !isMockDb()) {
            const res = await db.query("SELECT sales_route FROM clients WHERE sales_route IS NOT NULL AND TRIM(sales_route) != '' LIMIT 1");
            if (res?.values?.[0]?.sales_route) {
              inferred = res.values[0].sales_route;
            }
          }
          if (inferred) {
            console.log(`[DynamicAdvisorClients] 🛡️ Ruta inferida desde SQLite: "${inferred}"`);
            activeRoute = inferred;
            setUserRoute(inferred);
            kvStorage.setItem('last_known_route', inferred).catch(() => {});
          }
        } catch (e) {
          console.warn('[DynamicAdvisorClients] Error al intentar inferir clientes locales:', e);
        }
      }

      if (!activeRoute) {
        setClients([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { getClients } = await import('@/repositories/clientsRepository');
        const clientsData = await getClients(activeRoute);

        if (cancelled) return;

        const target = normalizeRouteValue(activeRoute);
        console.log(`[DynamicAdvisorClients] Cargando clientes para ruta "${activeRoute}"`);

        // Filtro estricto por ruta
        const filtered = (clientsData || []).filter(c => {
          const candidates = collectClientRouteCandidates(c);
          if (candidates.length === 0) {
            const r = c?.sales_route ?? c?.internal_route ?? c?.ruta ?? c?.route;
            const val = normalizeRouteValue(r);
            return val === target || val.includes(target) || target.includes(val);
          }
          return candidates.some(val =>
            val === target || val.includes(target) || target.includes(val)
          );
        });

        if (!cancelled) {
          setClients(filtered);
          setPage(1);
        }
      } catch (err) {
        console.error('[DynamicAdvisorClients] Error al cargar clientes:', err);
        if (!cancelled) setClients([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [userRoute, loadingRoute]);

  // Helper para normalizar números de serie de enfriadores
  const getSerials = useCallback((c) => {
    if (!c || !c.cooler_serials) return [];
    if (Array.isArray(c.cooler_serials)) return c.cooler_serials;
    if (typeof c.cooler_serials === 'string') {
      try { return JSON.parse(c.cooler_serials); } catch (e) { return []; }
    }
    return [];
  }, []);

  // Dia de hoy para filtros rápidos
  const todayDayName = useMemo(() => {
    const todayIndex = new Date().getDay();
    return DAYS_NAMES[todayIndex];
  }, []);

  // Filtrado reactivo en memoria
  const filteredClients = useMemo(() => {
    const q = fold(search.trim());
    const isLikelyId = /^(\d+|[0-9a-f]{8}-?[0-9a-f]{4}-?[1-5][0-9a-f]{3}-?[89ab][0-9a-f]{3}-?[0-9a-f]{12})$/i.test(search.trim());

    return clients.filter((c) => {
      // 1. Filtro de búsqueda por texto
      if (q) {
        const idStr = fold(c.id);
        const name = fold(c.name);
        const business = fold(c.business_name || c.nombre_comercial || c.razon_social);
        const code = fold(c.client_code || c.cve_cliente);
        const address = fold(c.address || c.direccion);
        const phone = fold(c.phone || c.telefono);

        const matchesSearch = isLikelyId
          ? idStr.includes(q) || code.includes(q)
          : (
            idStr.includes(q) ||
            name.includes(q) ||
            business.includes(q) ||
            code.includes(q) ||
            address.includes(q) ||
            phone.includes(q)
          );

        if (!matchesSearch) return false;
      }

      // 2. Filtro por exclusividad
      if (selectedExclusivity !== "all") {
        const ex = String(c.exclusivity || "mixto").toLowerCase().trim();
        if (selectedExclusivity === "exclusivo" && ex !== "exclusivo") return false;
        if (selectedExclusivity === "competencia" && ex !== "competencia") return false;
        if (selectedExclusivity === "mixto" && ex !== "mixto" && ex !== "") return false;
      }

      // 3. Filtro por día de visita
      if (selectedDay !== "all") {
        const days = parseVisitDays(c).map(d => fold(d));
        if (selectedDay === "today") {
          const todayFold = fold(todayDayName);
          const todayNum = String(new Date().getDay());
          const matchesToday = days.length === 0 || days.includes(todayFold) || days.includes(todayNum);
          if (!matchesToday) return false;
        } else {
          const dayFold = fold(selectedDay);
          const matchesDay = days.includes(dayFold);
          if (!matchesDay) return false;
        }
      }

      return true;
    });
  }, [clients, search, selectedExclusivity, selectedDay, fold, todayDayName]);

  // Clientes paginados para máxima velocidad de renderizado
  const totalPages = Math.ceil(filteredClients.length / PAGE_SIZE) || 1;
  const paginatedClients = useMemo(() => {
    const end = page * PAGE_SIZE;
    return filteredClients.slice(0, end);
  }, [filteredClients, page]);

  // Conteo de métricas
  const metrics = useMemo(() => {
    let exclusivos = 0;
    let mixtos = 0;
    let competencia = 0;

    clients.forEach(c => {
      const ex = String(c.exclusivity || "").toLowerCase().trim();
      if (ex === 'exclusivo') exclusivos++;
      else if (ex === 'competencia') competencia++;
      else mixtos++;
    });

    return {
      total: clients.length,
      exclusivos,
      mixtos,
      competencia
    };
  }, [clients]);

  const tryRegisterVisit = async (client) => {
    const freshest = clients.find((c) => String(c.id) === String(client?.id)) || client;
    setVisitClient(freshest);
  };

  const updateClientGeolocation = async (client) => {
    setUpdatingId(client.id);
    try {
      const pos = await getOptionalPositionFast(6000);
      if (!pos) {
        toast({
          title: 'GPS no disponible',
          description: 'No se detectó ubicación en 6s. Se omitió la actualización de coordenadas.',
        });
        return;
      }
      const { latitude, longitude } = pos.coords;
      const { updateClient } = await import('@/repositories/clientsRepository');
      const newCoords = { lat: latitude, lng: longitude };
      await updateClient(client.id, { 
        lat: latitude, 
        lng: longitude, 
        latitude,
        longitude,
        coords: newCoords 
      });

      toast({ title: '¡Ubicación actualizada correctamente!' });
      const updatedFields = {
        lat: latitude,
        lng: longitude,
        latitude,
        longitude,
        coords: newCoords
      };
      setClients(prev => prev.map(c => c.id === client.id ? { ...c, ...updatedFields } : c));
      if (detailClient?.id === client.id) {
        setDetailClient(prev => ({ ...prev, ...updatedFields }));
      }
      if (visitClient?.id === client.id) {
        setVisitClient(prev => ({ ...prev, ...updatedFields }));
      }
    } catch (error) {
      toast({ title: 'GPS omitido', description: 'No se pudieron guardar coordenadas en este momento.' });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleAssetSuccess = () => {
    setAssetClient(null);
    toast({ title: "Éxito", description: "El activo ha sido registrado y asignado al cliente." });
  };

  const handleUpdateClient = async () => {
    if (!editClient) return;
    try {
      const { updateClient } = await import('@/repositories/clientsRepository');
      await updateClient(editClient.id, editForm);
      setClients(prev => prev.map(c => c.id === editClient.id ? { ...c, ...editForm } : c));
      toast({ title: 'Datos del cliente actualizados' });
      setEditClient(null);
    } catch (e) {
      toast({ title: 'Error actualizando', description: e.message, variant: 'destructive' });
    }
  };

  const openEditVisitDays = (client) => {
    setEditClient(client);
    setEditForm({
      phone: client.phone || '',
      address: client.address || '',
      contact: client.contact || '',
      visit_days: client.visit_days || client.visit_day || ''
    });
  };

  return (
    <>
      <div className="container mx-auto py-6 px-4 md:px-6 max-w-7xl">
        <Helmet><title>Clientes Asesor Dinámico</title></Helmet>

        {/* HEADER & ROUTE SELECTOR */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 border-b border-zinc-800 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Building2 className="w-5 h-5" />
              </span>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Cartera de Clientes
              </h1>
            </div>
            <p className="text-xs text-zinc-400">
              Gestión comercial, visitas y consulta de clientes en ruta activa
            </p>
          </div>

          {/* Selector de Ruta */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 shadow-sm">
              <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-400" />
                Ruta:
              </span>
              {allowedRoutes.length > 1 ? (
                <Select value={userRoute} onValueChange={handleRouteChange}>
                  <SelectTrigger className="h-8 min-w-[130px] bg-zinc-950 border-zinc-700 text-xs font-bold text-white focus:ring-1 focus:ring-emerald-500">
                    <SelectValue placeholder="Seleccionar ruta" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    {allowedRoutes.map(r => (
                      <SelectItem key={r} value={r} className="text-xs font-semibold focus:bg-zinc-800 focus:text-white">
                        Ruta {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="px-2.5 py-1 bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 rounded-md text-xs font-bold tracking-wide">
                  {userRoute ? `Ruta ${userRoute}` : 'Sin Ruta'}
                </span>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (userRoute) {
                  setUserRoute(prev => prev); // trigger reload
                  setLoading(true);
                  import('@/repositories/clientsRepository').then(({ getClients }) => {
                    getClients(userRoute).then(data => {
                      const target = normalizeRouteValue(userRoute);
                      const filtered = (data || []).filter(c => {
                        const candidates = collectClientRouteCandidates(c);
                        if (candidates.length === 0) {
                          const r = c?.sales_route ?? c?.internal_route ?? c?.ruta ?? c?.route;
                          const val = normalizeRouteValue(r);
                          return val === target || val.includes(target) || target.includes(val);
                        }
                        return candidates.some(val => val === target || val.includes(target) || target.includes(val));
                      });
                      setClients(filtered);
                      setLoading(false);
                      toast({ title: "Datos actualizados" });
                    });
                  });
                }
              }}
              disabled={loading}
              className="h-9 px-3 bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-xs gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="hidden sm:inline">Recargar</span>
            </Button>
          </div>
        </div>

        {/* METRICS SUMMARY CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-zinc-900/80 border border-zinc-800/80 p-3.5 rounded-xl flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Total Clientes</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-black text-white">{metrics.total}</span>
              <span className="text-xs text-zinc-500">en ruta</span>
            </div>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800/80 p-3.5 rounded-xl flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Exclusivos
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-black text-emerald-300">{metrics.exclusivos}</span>
              <span className="text-xs text-emerald-500/60 font-medium">
                {metrics.total ? `${Math.round((metrics.exclusivos / metrics.total) * 100)}%` : '0%'}
              </span>
            </div>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800/80 p-3.5 rounded-xl flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-yellow-400 uppercase tracking-wider flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
              Mixtos
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-black text-yellow-300">{metrics.mixtos}</span>
              <span className="text-xs text-yellow-500/60 font-medium">
                {metrics.total ? `${Math.round((metrics.mixtos / metrics.total) * 100)}%` : '0%'}
              </span>
            </div>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800/80 p-3.5 rounded-xl flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Competencia
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-black text-blue-300">{metrics.competencia}</span>
              <span className="text-xs text-blue-500/60 font-medium">
                {metrics.total ? `${Math.round((metrics.competencia / metrics.total) * 100)}%` : '0%'}
              </span>
            </div>
          </div>
        </div>

        {/* SEARCH & FILTERS BAR */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 mb-6 space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Input de Búsqueda */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                aria-label="Buscar clientes"
                placeholder="Buscar por negocio, código, nombre, dirección o teléfono..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all shadow-inner"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded-md transition-colors"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Filtro por Día */}
            <div className="flex items-center gap-2">
              <Select value={selectedDay} onValueChange={(val) => { setSelectedDay(val); setPage(1); }}>
                <SelectTrigger className="h-10 min-w-[140px] bg-zinc-950 border-zinc-800 text-xs text-zinc-300">
                  <Calendar className="w-3.5 h-3.5 mr-2 text-zinc-400" />
                  <SelectValue placeholder="Día de Visita" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                  <SelectItem value="all" className="text-xs focus:bg-zinc-800">Todos los días</SelectItem>
                  <SelectItem value="today" className="text-xs font-semibold text-emerald-400 focus:bg-zinc-800">Hoy ({todayDayName})</SelectItem>
                  {DAYS_NAMES.map(d => (
                    <SelectItem key={d} value={d} className="text-xs focus:bg-zinc-800">{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Filtro por Exclusividad */}
              <Select value={selectedExclusivity} onValueChange={(val) => { setSelectedExclusivity(val); setPage(1); }}>
                <SelectTrigger className="h-10 min-w-[130px] bg-zinc-950 border-zinc-800 text-xs text-zinc-300">
                  <ShieldCheck className="w-3.5 h-3.5 mr-2 text-zinc-400" />
                  <SelectValue placeholder="Exclusividad" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                  <SelectItem value="all" className="text-xs focus:bg-zinc-800">Todos</SelectItem>
                  <SelectItem value="exclusivo" className="text-xs text-emerald-400 focus:bg-zinc-800">Exclusivos</SelectItem>
                  <SelectItem value="mixto" className="text-xs text-yellow-400 focus:bg-zinc-800">Mixtos</SelectItem>
                  <SelectItem value="competencia" className="text-xs text-blue-400 focus:bg-zinc-800">Competencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Resumen de Resultados */}
          <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
            <span>
              Mostrando <strong className="text-white">{Math.min(paginatedClients.length, filteredClients.length)}</strong> de <strong className="text-white">{filteredClients.length}</strong> clientes encontrados
              {search ? ` para "${search}"` : ''}
            </span>
            {(search || selectedDay !== 'all' || selectedExclusivity !== 'all') && (
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedDay('all');
                  setSelectedExclusivity('all');
                  setPage(1);
                }}
                className="text-xs text-emerald-400 hover:text-emerald-300 hover:underline"
              >
                Restablecer filtros
              </button>
            )}
          </div>
        </div>

        {/* CLIENTS GRID / LIST */}
        {loading || loadingRoute ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin" />
            <p className="text-sm font-medium text-zinc-400">
              {loadingRoute ? 'Identificando ruta del asesor...' : `Cargando clientes de la ruta ${userRoute}...`}
            </p>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl text-center px-4 space-y-3">
            <div className="p-3 bg-zinc-800/80 rounded-full text-zinc-400">
              <Store className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-white">No se encontraron clientes</h3>
            <p className="text-xs text-zinc-400 max-w-md">
              {!userRoute
                ? 'No se ha detectado una ruta asignada para este usuario. Selecciona una ruta del catálogo superior.'
                : search || selectedDay !== 'all' || selectedExclusivity !== 'all'
                  ? 'No hay clientes que coincidan con los filtros aplicados en esta ruta.'
                  : `La ruta "${userRoute}" no cuenta con clientes activos registrados.`
              }
            </p>
            {(search || selectedDay !== 'all' || selectedExclusivity !== 'all') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setSelectedDay('all');
                  setSelectedExclusivity('all');
                  setPage(1);
                }}
                className="mt-2 text-xs bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700"
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedClients.map(client => {
                const exclusivity = String(client.exclusivity || "").toLowerCase();
                const accentColor = exclusivity === 'exclusivo' ? 'bg-emerald-500' :
                  exclusivity === 'competencia' ? 'bg-blue-500' :
                    'bg-yellow-500';

                const visitDays = parseVisitDays(client);
                const hasToday = visitDays.some(d => fold(d) === fold(todayDayName));
                const displayName = getClientDisplayName(client);
                const code = client.client_code || client.cve_cliente || client.code;

                return (
                  <div
                    key={client.id}
                    className="relative bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-sm hover:shadow-xl hover:border-zinc-700 transition-all duration-300 group overflow-hidden flex flex-col justify-between"
                  >
                    {/* Left Accent Strip */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${accentColor} transition-colors`} />

                    <div className="p-4 pl-5 flex-1 flex flex-col gap-3">
                      {/* Top Badges */}
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-bold font-mono text-zinc-300 bg-zinc-950 px-2 py-0.5 rounded-md border border-zinc-800 shadow-inner">
                            #{code || 'N/A'}
                          </span>
                          {client.level && (
                            <span className="text-[10px] font-extrabold text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded-md border border-purple-800/40 uppercase tracking-wider">
                              Nivel {client.level}
                            </span>
                          )}
                          {hasToday && (
                            <span className="text-[10px] font-extrabold text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/40 uppercase tracking-wider">
                              Visita Hoy
                            </span>
                          )}
                        </div>

                        {/* Exclusivity Tag */}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider
                          ${exclusivity === 'exclusivo' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                            exclusivity === 'competencia' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                              'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'}`}>
                          {client.exclusivity || 'Mixto'}
                        </span>
                      </div>

                      {/* Client Names */}
                      <div className="cursor-pointer" onClick={() => setDetailClient(client)}>
                        <h3 className="font-bold text-base text-zinc-100 leading-snug group-hover:text-emerald-400 transition-colors line-clamp-1" title={displayName}>
                          {displayName}
                        </h3>
                        {(client.business_name && client.name && client.business_name !== client.name) && (
                          <p className="text-xs text-zinc-400 truncate mt-0.5 font-medium">{client.name}</p>
                        )}
                      </div>

                      {/* Address & Phone */}
                      <div className="space-y-1.5 text-xs text-zinc-400 mt-auto pt-2 border-t border-zinc-800/60">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-zinc-500" />
                          <p className="line-clamp-2 leading-relaxed text-zinc-300">{client.address || 'Sin dirección registrada'}</p>
                        </div>
                        {client.phone && (
                          <div className="flex items-center gap-2 text-zinc-400">
                            <Phone className="w-3.5 h-3.5 flex-shrink-0 text-zinc-500" />
                            <a
                              href={`tel:${client.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-400 hover:underline font-mono"
                            >
                              {client.phone}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions Footer */}
                    <div className="bg-zinc-950/60 border-t border-zinc-800/80 p-3 pl-5 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-zinc-800/90 text-zinc-200 border border-zinc-700/80 hover:bg-zinc-700 hover:text-white h-8 text-xs font-semibold flex-1 rounded-lg"
                        onClick={() => setDetailClient(client)}
                      >
                        Ver Detalles
                      </Button>

                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs font-semibold flex-1 shadow-md shadow-emerald-950/40 rounded-lg"
                        onClick={() => tryRegisterVisit(client)}
                      >
                        Visita
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="h-8 w-8 px-0 bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-zinc-200 min-w-[180px]">
                          <DropdownMenuItem className="focus:bg-zinc-800 focus:text-white cursor-pointer" onSelect={() => navigate(`/asesor-dinamico/clientes/${client.id}/simulator`)}>
                            <DollarSign className="w-4 h-4 mr-2 text-emerald-400" />
                            Simulador
                          </DropdownMenuItem>
                          <DropdownMenuItem className="focus:bg-zinc-800 focus:text-white cursor-pointer" onSelect={() => setSalesClient(client)}>
                            <DollarSign className="w-4 h-4 mr-2 text-yellow-400" />
                            Ventas Históricas
                          </DropdownMenuItem>
                          <DropdownMenuItem className="focus:bg-zinc-800 focus:text-white cursor-pointer" onSelect={() => updateClientGeolocation(client)} disabled={updatingId === client.id}>
                            <Navigation className="w-4 h-4 mr-2 text-purple-400" />
                            {updatingId === client.id ? 'Actualizando...' : 'Actualizar Geo'}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="focus:bg-zinc-800 focus:text-white cursor-pointer" onSelect={() => setAssetClient(client)}>
                            <PackagePlus className="w-4 h-4 mr-2 text-emerald-500" />
                            Registrar Activo
                          </DropdownMenuItem>
                          <DropdownMenuItem className="focus:bg-zinc-800 focus:text-white cursor-pointer" onSelect={() => setCensusClient(client)}>
                            <ClipboardCheck className="w-4 h-4 mr-2 text-blue-400" />
                            Censo Integrado
                          </DropdownMenuItem>

                          {/* Abrir en Google Maps */}
                          {(() => {
                            const c = parseClientCoords(client);
                            return c ? (
                              <DropdownMenuItem className="focus:bg-zinc-800 focus:text-white cursor-pointer"
                                onSelect={() => window.open(`https://www.google.com/maps?q=${c.lat},${c.lng}`, '_blank')}>
                                <MapPin className="w-4 h-4 mr-2 text-cyan-400" />
                                Ver en Google Maps
                              </DropdownMenuItem>
                            ) : null;
                          })()}

                          {user && (user.user_metadata?.type === 'admin' || user.user_metadata?.type === 'Administrador' || user.user_metadata?.role === 'admin') && (
                            <DropdownMenuItem className="focus:bg-zinc-800 focus:text-white cursor-pointer" onSelect={() => openEditVisitDays(client)}>
                              <Edit className="w-4 h-4 mr-2 text-amber-400" />
                              Editar datos / días
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* BOTÓN CARGAR MÁS / PAGINACIÓN */}
            {paginatedClients.length < filteredClients.length && (
              <div className="flex justify-center pt-4 pb-8">
                <Button
                  onClick={() => setPage(p => p + 1)}
                  className="bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 px-6 py-2 rounded-xl text-xs font-bold gap-2 shadow-lg"
                >
                  <span>Cargar más clientes ({filteredClients.length - paginatedClients.length} restantes)</span>
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DETALLES CLIENTE MODAL (OPTIMIZADO CON VISITAS ON-DEMAND) */}
      <Dialog open={!!detailClient} onOpenChange={open => { if (!open) setDetailClient(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl rounded-2xl">
          {detailClient && (
            <>
              {/* Header */}
              <div className="relative p-6 bg-gradient-to-br from-zinc-900 to-zinc-950 border-b border-zinc-800">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 pr-6">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="bg-zinc-800/80 px-2.5 py-0.5 rounded-md text-xs font-mono font-bold text-zinc-300 border border-zinc-700">
                        ID: {detailClient.client_code || detailClient.cve_cliente || 'N/A'}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                        Ruta {detailClient.sales_route || userRoute || '?'}
                      </span>
                      {detailClient.level && (
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                          Nivel {detailClient.level}
                        </span>
                      )}
                    </div>

                    <h2 className="text-2xl font-black tracking-tight text-white leading-tight">
                      {getClientDisplayName(detailClient)}
                    </h2>
                    {(detailClient.business_name && detailClient.name && detailClient.business_name !== detailClient.name) && (
                      <p className="text-sm text-zinc-400 mt-1 font-medium">{detailClient.name}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm
                    ${String(detailClient.exclusivity).toLowerCase() === 'exclusivo' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                      String(detailClient.exclusivity).toLowerCase() === 'competencia' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                        'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'}`}>
                    {detailClient.exclusivity || 'Mixto'}
                  </span>
                </div>
              </div>

              {/* Contenido Principal */}
              <div className="p-6 space-y-6">
                {/* Sección de Contacto y Ubicación */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3.5 bg-zinc-900/60 rounded-xl border border-zinc-800/80 space-y-1.5">
                    <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-zinc-400" /> Dirección
                    </span>
                    <p className="text-xs text-zinc-200 font-medium leading-relaxed">
                      {detailClient.address || 'No registrada'}
                    </p>
                  </div>

                  <div className="p-3.5 bg-zinc-900/60 rounded-xl border border-zinc-800/80 space-y-1.5">
                    <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-zinc-400" /> Teléfono / Contacto
                    </span>
                    <p className="text-xs text-zinc-200 font-medium">
                      {detailClient.phone ? (
                        <a href={`tel:${detailClient.phone}`} className="text-blue-400 hover:underline">
                          {detailClient.phone}
                        </a>
                      ) : 'Sin teléfono'}
                    </p>
                    {detailClient.contact && (
                      <p className="text-[11px] text-zinc-400">{detailClient.contact}</p>
                    )}
                  </div>
                </div>

                {/* Activos en Tienda */}
                <div>
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2.5 flex items-center gap-2">
                    <PackagePlus className="w-4 h-4 text-emerald-400" />
                    Activos en Tienda
                  </h3>
                  <div className="bg-zinc-900/40 rounded-xl p-4 border border-zinc-800">
                    {getSerials(detailClient).length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {getSerials(detailClient).map((serial, i) => (
                          <span key={i} className="px-2.5 py-1 bg-zinc-950 rounded-lg text-xs font-mono text-emerald-400 border border-zinc-800 shadow-sm font-bold">
                            {serial}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500 italic">No hay enfriadores o activos registrados para este cliente.</p>
                    )}
                  </div>
                </div>

                {/* Historial de Visitas Recientes (ON-DEMAND) */}
                <div>
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2.5 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-400" />
                    Últimas Visitas
                  </h3>
                  <div className="bg-zinc-900/40 rounded-xl p-4 border border-zinc-800">
                    <ClientVisitsList
                      clientId={detailClient.id}
                      clientCode={detailClient.client_code || detailClient.cve_cliente}
                      className="text-zinc-300"
                    />
                  </div>
                </div>

                {/* Notas */}
                {detailClient.notes && (
                  <div className="bg-yellow-900/10 border border-yellow-700/20 p-4 rounded-xl">
                    <h4 className="text-xs font-bold text-yellow-500 mb-1 uppercase">Notas del Cliente</h4>
                    <p className="text-xs text-yellow-200/90 leading-relaxed italic">
                      "{detailClient.notes}"
                    </p>
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="p-4 bg-zinc-900/60 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold h-9"
                    onClick={() => {
                      const c = detailClient;
                      setDetailClient(null);
                      tryRegisterVisit(c);
                    }}
                  >
                    Registrar Visita
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700 text-xs font-medium h-9"
                    onClick={() => {
                      const c = detailClient;
                      setDetailClient(null);
                      setSalesClient(c);
                    }}
                  >
                    Ventas Históricas
                  </Button>
                </div>
                <Button variant="ghost" onClick={() => setDetailClient(null)} className="text-zinc-400 hover:text-white hover:bg-zinc-800 text-xs h-9">
                  Cerrar
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* REGISTRO DE VISITA */}
      <Dialog open={!!visitClient} onOpenChange={open => { if (!open) setVisitClient(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar visita: {visitClient ? getClientDisplayName(visitClient) : ''}</DialogTitle>
          </DialogHeader>
          {visitClient && (
            <VisitForm
              client={visitClient}
              onSave={() => setVisitClient(null)}
              onClientCoordsUpdated={(newCoords) => {
                const updatedFields = {
                  lat: newCoords.lat,
                  lng: newCoords.lng,
                  latitude: newCoords.lat,
                  longitude: newCoords.lng,
                  coords: newCoords,
                };
                setClients((prev) =>
                  prev.map((c) => (String(c.id) === String(visitClient.id) ? { ...c, ...updatedFields } : c))
                );
                setVisitClient((prev) => (prev ? { ...prev, ...updatedFields } : prev));
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* VENTAS HISTÓRICAS */}
      {salesClient && (
        <SalesDialog client={salesClient} onClose={() => setSalesClient(null)} />
      )}

      {/* REGISTRAR ACTIVO */}
      {assetClient && (
        <AddExistingAssetModal
          client={assetClient}
          onClose={() => setAssetClient(null)}
          onSuccess={handleAssetSuccess}
        />
      )}

      {/* CENSO INTEGRADO */}
      <Dialog open={!!censusClient} onOpenChange={(val) => !val && setCensusClient(null)}>
        <DialogContent className="bg-slate-900 border border-slate-800 text-white sm:max-w-md w-full max-h-[90vh] flex flex-col p-6">
          <DialogHeader className="flex flex-row items-center justify-between border-b border-white/10 pb-4 mb-2 shrink-0 space-y-0">
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2 m-0 p-0 leading-none">
              <span className="text-2xl pt-1">📋</span>
              Censo Integrado — {censusClient ? getClientDisplayName(censusClient) : ''}
            </DialogTitle>
          </DialogHeader>
          {censusClient && (
            <div className="flex-1 overflow-y-auto px-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              <CensoSupervisorForm
                client={censusClient}
                user={user}
                onClose={() => setCensusClient(null)}
                onSaved={() => setCensusClient(null)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* EDITAR CLIENTE Y DÍAS */}
      <Dialog open={!!editClient} onOpenChange={(val) => !val && setEditClient(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Editar Cliente: {editClient ? getClientDisplayName(editClient) : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-400">Teléfono</label>
              <input className="w-full border border-zinc-700 bg-zinc-950 p-2 rounded-lg text-white text-sm focus:ring-1 focus:ring-emerald-500 outline-none" value={editForm.phone || ''} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-400">Dirección</label>
              <input className="w-full border border-zinc-700 bg-zinc-950 p-2 rounded-lg text-white text-sm focus:ring-1 focus:ring-emerald-500 outline-none" value={editForm.address || ''} onChange={e => setEditForm({ ...editForm, address: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-400">Contacto</label>
              <input className="w-full border border-zinc-700 bg-zinc-950 p-2 rounded-lg text-white text-sm focus:ring-1 focus:ring-emerald-500 outline-none" value={editForm.contact || ''} onChange={e => setEditForm({ ...editForm, contact: e.target.value })} />
            </div>

            {/* Selector de Días de Visita */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-zinc-400">Días de Visita</label>
              <div className="grid grid-cols-2 gap-3 bg-zinc-950/50 p-3 rounded-xl border border-zinc-800">
                {['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'].map(day => {
                  const currentDays = editForm.visit_days ? editForm.visit_days.split(',').map(d => d.trim()) : [];
                  const isChecked = currentDays.includes(day);

                  return (
                    <div key={day} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`day-${day}`}
                        checked={isChecked}
                        onChange={(e) => {
                          let newDays = [...currentDays];
                          if (e.target.checked) {
                            newDays.push(day);
                          } else {
                            newDays = newDays.filter(d => d !== day);
                          }
                          setEditForm({ ...editForm, visit_days: newDays.join(',') });
                        }}
                        className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <label
                        htmlFor={`day-${day}`}
                        className="text-xs cursor-pointer select-none text-zinc-300"
                      >
                        {day}
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditClient(null)} className="hover:bg-zinc-800 text-zinc-300 text-xs">Cancelar</Button>
              <Button onClick={handleUpdateClient} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">Guardar Cambios</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
