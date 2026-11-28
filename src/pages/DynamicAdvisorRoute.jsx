import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { kvStorage } from "@/services/kvStorage";
import { Helmet } from "react-helmet-async";
import { getTodayMexico, getNowMexico } from '@/lib/dateUtils';
import { supabase } from "@/supabaseClient";
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import VisitForm from "@/components/VisitForm";
import { getOptionalPositionFast, parseClientCoords, distanceMeters } from '@/lib/geolocation';
import { useToast } from "@/components/ui/use-toast";
import ClientVisitsList from "@/components/ClientVisitsList";
import SalesDialog from "@/components/SalesDialog";
import AddExistingAssetModal from "@/components/clients/AddExistingAssetModal";
import { getSalesBySku } from "@/repositories/salesRepository";
import { getClients } from "@/repositories/clientsRepository";
import { getVisitsSummary } from "@/repositories/visitsRepository";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.jsx";
import {
  DollarSign,
  MapPin,
  MoreVertical,
  PackagePlus,
  CheckCircle2,
  UserPlus,
  Map as MapIcon,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const ROUTE_FIELDS = ["route", "ruta", "sales_route", "internal_route", "salesRoute"];
const ROUTE_CANDIDATE_FIELDS = ["sales_route", "internal_route", "route", "ruta"];
const TIMEZONE = "America/Mexico_City";

const normalize = (value) => (value ?? "").toString().trim();

const normalizeRouteValue = (value) => {
  if (value == null) return "";
  return String(value).toLowerCase().replace(/\.xlsx$/g, "").trim();
};

const splitMultiValue = (raw) => {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry));
  }
  const text = String(raw).trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry));
      }
    } catch (e) {
      // ignore invalid JSON and continue with fallback split
    }
  }
  return text
    .split(/[,;|]/)
    .map((entry) => entry.trim())
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

const DAYS_LABEL = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

const dayNameToNumber = (input) => {
  if (input === null || input === undefined) return null;
  const dictionary = {
    domingo: 0,
    dom: 0,
    lunes: 1,
    lun: 1,
    martes: 2,
    mar: 2,
    miercoles: 3,
    mier: 3,
    mi: 3,
    jueves: 4,
    jue: 4,
    viernes: 5,
    vie: 5,
    sabado: 6,
    sab: 6,
    saturday: 6,
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
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
    return raw
      .map((value) => dayNameToNumber(value))
      .filter((value) => value !== null);
  }
  if (typeof raw === "object") {
    try {
      const str = JSON.stringify(raw);
      return splitMultiValue(str)
        .map((value) => dayNameToNumber(value))
        .filter((value) => value !== null);
    } catch (e) {
      return [];
    }
  }
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((value) => dayNameToNumber(value))
          .filter((value) => value !== null);
      }
    } catch (e) {
      // ignore parse errors
    }
  }
  return splitMultiValue(raw)
    .map((value) => dayNameToNumber(value))
    .filter((value) => value !== null);
};

const formatVisitDays = (client) => {
  const days = parseVisitDays(client);
  if (!days.length) return "Sin frecuencia";
  const ordered = Array.from(new Set(days)).sort((a, b) => a - b);
  return ordered.map((day) => DAYS_LABEL[day] ?? day).join(", ");
};

const toLocalYMD = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
};

const foldString = (value) => {
  if (value == null) return "";
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
};

const parseCoords = parseClientCoords;

export default function DynamicAdvisorRoute() {
  const { user } = useSupabaseAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [todayInfo] = useState(() => {
    const now = new Date();
    return { number: now.getDay(), ymd: toLocalYMD(now) };
  });

  const [userRoute, setUserRoute] = useState("");
  const [advisorId, setAdvisorId] = useState(null);

  const [scheduledClients, setScheduledClients] = useState([]);
  const [loadingScheduledClients, setLoadingScheduledClients] = useState(false);

  const [requestedVisits, setRequestedVisits] = useState([]);
  const [loadingRequestedVisits, setLoadingRequestedVisits] = useState(false);

  const [visitedTodayIds, setVisitedTodayIds] = useState([]);

  const [assetSerials, setAssetSerials] = useState({});
  const [updatingId, setUpdatingId] = useState(null);

  const [search, setSearch] = useState("");
  const [monthlySalesMap, setMonthlySalesMap] = useState({});

  const [visitDialogOpen, setVisitDialogOpen] = useState(false);
  const [visitDialogClient, setVisitDialogClient] = useState(null);
  const [forceMotivo, setForceMotivo] = useState(null);
  const [activeRequest, setActiveRequest] = useState(null);

  const [salesClient, setSalesClient] = useState(null);
  const [assetClient, setAssetClient] = useState(null);
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [finalizeTotals, setFinalizeTotals] = useState(null);
  const [visitDetails, setVisitDetails] = useState([]);
  const [routeMapOpen, setRouteMapOpen] = useState(false);

  const normalizedRoute = useMemo(() => normalizeRouteValue(userRoute), [userRoute]);
  const currentMonthRange = useMemo(() => monthRangeFromYMD(todayInfo.ymd), [todayInfo.ymd]);

  useEffect(() => {
    const fetchRoute = async () => {
      try {
        let u = user;
        if (!u) {
          try {
            u = await kvStorage.getItem('last_known_user');
          } catch (e) { }
          if (!u) {
            const { data } = await supabase.auth.getSession();
            u = data?.session?.user;
          }
        }
        const id = u?.id;
        if (id) setAdvisorId(id);

        // 1. Lectura instantánea (0ms) de metadata, profile o caché local
        const meta = u?.user_metadata || {};
        const prof = u?.profile || {};
        let immediateRoute = String(
          prof.route || prof.sales_route || prof.ruta ||
          meta.route || meta.sales_route || meta.ruta || ''
        ).trim();

        let cachedRoute = null;
        if (id) {
          cachedRoute = await kvStorage.getItem(`advisor_user_route_${id}`).catch(() => null);
        }
        if (!cachedRoute) {
          cachedRoute = await kvStorage.getItem('last_known_route').catch(() => null);
        }
        const fastRoute = cachedRoute || immediateRoute;
        if (fastRoute) {
          setUserRoute(normalize(fastRoute));
        }

        // 2. Verificar también rutas asignadas en /admin/users (supervisor_allowed_sales_routes / supervisor_allowed_routes)
        let finalRoute = fastRoute || "";
        if (!finalRoute && id) {
          try {
            const { getAllowedRoutes } = await import('@/repositories/metadataRepository');
            const allowed = await getAllowedRoutes(id);
            if (allowed?.sales?.length > 0) finalRoute = allowed.sales[0];
            else if (allowed?.internal?.length > 0) finalRoute = allowed.internal[0];
          } catch (e) { }
        }

        // 3. Fallback detector si sigue vacío
        if (!finalRoute) {
          try {
            const { detectUserRoute } = await import('@/repositories/routeRepository');
            const r = await detectUserRoute(u);
            if (r) finalRoute = String(r).trim();
          } catch (e) { }
        }

        if (finalRoute) {
          finalRoute = normalize(finalRoute);
          setUserRoute(finalRoute);
          if (id) await kvStorage.setItem(`advisor_user_route_${id}`, finalRoute);
          await kvStorage.setItem('last_known_route', finalRoute);
        }
      } catch (e) {
        console.warn('Error fetching route online, relying on cache', e);
      }
    };
    fetchRoute();
  }, [user]);

  const loadRouteClients = useCallback(async () => {
    let activeRoute = normalizedRoute;

    // 🛡️ OFFLINE SAFEGUARD: Si no hay ruta detectada, intentar recuperar desde SQLite o last_known_route
    if (!activeRoute) {
      try {
        const lkr = await kvStorage.getItem('last_known_route');
        if (lkr) {
          activeRoute = normalize(lkr);
          setUserRoute(activeRoute);
        } else {
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
            activeRoute = normalize(inferred);
            setUserRoute(activeRoute);
            kvStorage.setItem('last_known_route', inferred).catch(() => {});
          }
        }
      } catch (e) {
        console.warn('[DynamicAdvisorRoute] Error inferiendo ruta offline:', e);
      }
    }

    if (!activeRoute) {
      setScheduledClients([]);
      return;
    }
    setLoadingScheduledClients(true);
    try {
      // OFFLINE-FIRST: Usar repositorio con la ruta activa
      const allClients = await getClients(activeRoute);

      const filtered = (allClients || []).filter((client) => {
        const candidates = collectClientRouteCandidates(client);
        const matchesRoute = candidates.some((value) => value === activeRoute);
        if (!matchesRoute) return false;
        const days = parseVisitDays(client);
        return days.includes(todayInfo.number);
      });

      setScheduledClients(filtered);
    } catch (err) {
      console.error("dynamic advisor route: error loading clients", err);
      setScheduledClients([]);
    } finally {
      setLoadingScheduledClients(false);
    }
  }, [normalizedRoute, todayInfo.number]);

  useEffect(() => {
    loadRouteClients();
  }, [loadRouteClients]);

  const loadRequestedVisits = useCallback(async () => {
    // If we don't have a route or advisor, we might miss context, but let's try to load logic
    if (!advisorId && !normalizedRoute) {
      setRequestedVisits([]);
      return;
    }
    setLoadingRequestedVisits(true);
    try {
      // Step 1: Fetch pending requests and keep a durable SQLite cache so this
      // section remains visible after the device loses connectivity.
      const cacheKey = `advisor_requested_visits_${advisorId || normalizedRoute}`;
      let visits;
      try {
        const { data: rawVisits, error: visitsError } = await supabase
          .from("client_visits")
          .select("id, client_id, requested_at, visited_at, status, reason, advisor_id")
          .eq("status", "pending")
          .order("requested_at", { ascending: false })
          .limit(500);

        if (visitsError) throw visitsError;
        visits = rawVisits || [];
        await kvStorage.setItem(cacheKey, visits);
      } catch (fetchError) {
        visits = await kvStorage.getItem(cacheKey);
        if (!Array.isArray(visits)) throw fetchError;
        console.info("[DynamicAdvisorRoute] Usando solicitudes de visita guardadas localmente.");
      }

      if (visits.length === 0) {
        setRequestedVisits([]);
        setLoadingRequestedVisits(false);
        return;
      }

      // Step 2: Fetch Clients for these visits using Local Repository (MySQL/Local Source)
      // Supabase 'clients' table does not exist, so we use the robust getClients()
      let allClients = [];
      try {
        // Optimization: Filter by route at API level to avoid heavy payload (14k+ clients)
        allClients = await getClients(normalizedRoute);
      } catch (e) {
        console.warn("Error resolving clients for requests", e);
      }

      const clientsMap = new Map((allClients || []).map(c => [c.id, c]));

      // Step 3: Join and Filter Locally
      let rows = visits.map(v => ({
        ...v,
        client: clientsMap.get(v.client_id) || null
      })).filter(row => row.client); // Must have a client to display

      // Local Filter: Match Advisor ID OR Route (using mapped client data)
      rows = rows.filter(row => {
        // Direct assignment
        if (advisorId && row.advisor_id === advisorId) return true;
        // Route Match
        if (normalizedRoute && row.client) {
          const candidates = collectClientRouteCandidates(row.client);
          // Fuzzy check: is normalizedRoute in candidates?
          if (candidates.includes(normalizedRoute)) return true;
        }
        return false;
      });

      // Step 4: Check if actually completed in 'visitas' (MySQL mirror)
      // Reuse existing logic for checking completion
      if (rows.length) {
        // ... reuse existing complexity or simplify?
        // For safety, let's keep the existing logic layout but adapted to 'rows'
        const pending = rows; // All are status=pending from query
        if (pending.length) {
          const auditIds = new Set(pending.map(r => r.client_id));
          const minDate = "2000-01-01"; // Simplify Date check for now

          const { data: performed } = await supabase
            .from("visitas")
            .select("id, client_id, fecha")
            .in("client_id", Array.from(auditIds))
            .gte("fecha", minDate)
            .limit(2000);

          if (performed?.length) {
            const visitsByClient = performed.reduce((map, v) => {
              if (!v.client_id) return map;
              const l = map.get(v.client_id) || [];
              l.push(v);
              map.set(v.client_id, l);
              return map;
            }, new Map());

            const needsUpdate = [];
            rows = rows.map(row => {
              const list = visitsByClient.get(row.client_id) || [];
              if (!list.length) return row;

              const reqAt = row.requested_at ? new Date(row.requested_at) : null;
              const isCompleted = list.some(v => {
                if (!v.fecha) return false;
                const vDate = new Date(v.fecha);
                if (!reqAt) return true;
                // Check if visit is AFTER request
                return vDate.getTime() >= reqAt.getTime();
              });

              if (isCompleted) {
                needsUpdate.push(row.id);
                return { ...row, status: 'completed', visited_at: list[0]?.fecha || new Date().toISOString() };
              }
              return row;
            });

            if (needsUpdate.length) {
              supabase.from("client_visits").update({ status: "completed" }).in("id", needsUpdate).then(() => { });
            }
          }
        }
      }

      setRequestedVisits(rows);
    } catch (err) {
      console.error("dynamic advisor route: error fetching client_visits", err);
      setRequestedVisits([]);
    } finally {
      setLoadingRequestedVisits(false);
    }
  }, [advisorId, normalizedRoute]);

  useEffect(() => {
    if (!advisorId) return;
    loadRequestedVisits();
  }, [advisorId, loadRequestedVisits]);

  const combinedClientIds = useMemo(() => {
    const ids = new Set();
    scheduledClients.forEach((client) => {
      if (client?.id) ids.add(client.id);
    });
    requestedVisits.forEach((request) => {
      if (request?.client_id) ids.add(request.client_id);
    });
    return Array.from(ids);
  }, [scheduledClients, requestedVisits]);

  const refreshTodayVisits = useCallback(
    async (clientIds) => {
      if (!clientIds || clientIds.length === 0) {
        setVisitedTodayIds([]);
        return;
      }
      try {
        // Collect Codes and IDs
        const codes = [];

        // Helper to find client across both lists to retrieve code
        const findClient = (id) => {
          const inSched = scheduledClients.find(c => c.id === id);
          if (inSched) return inSched;
          const inReq = requestedVisits.find(r => r.client_id === id);
          return inReq?.client;
        };

        clientIds.forEach(id => {
          const client = findClient(id);
          if (client?.client_code) codes.push(client.client_code);
        });

        const searchKeys = [...new Set([...clientIds, ...codes])];

        const summary = await getVisitsSummary(searchKeys, todayInfo.ymd, todayInfo.ymd);

        const foundSet = new Set();
        (summary.visits || []).forEach(row => {
          if (row.client_id) foundSet.add(row.client_id);
          if (row.client_code) foundSet.add(String(row.client_code));
        });
        const foundKeys = Array.from(foundSet);
        setVisitedTodayIds(foundKeys);
      } catch (err) {
        console.warn("dynamic advisor route: unable to fetch today visits", err);
      }
    },
    [todayInfo.ymd, scheduledClients, requestedVisits]
  );

  useEffect(() => {
    if (!combinedClientIds.length) {
      setVisitedTodayIds([]);
      return;
    }
    refreshTodayVisits(combinedClientIds);
  }, [combinedClientIds, refreshTodayVisits]);

  // ... (Removed asset effect) ...

  useEffect(() => {
    if (!combinedClientIds.length || !currentMonthRange.from || !currentMonthRange.to) {
      setMonthlySalesMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await getSalesBySku({
          from: currentMonthRange.from,
          nextFrom: currentMonthRange.to,
        });
        const idSet = new Set(combinedClientIds);
        const map = {};
        (rows || []).forEach((row) => {
          const clientId = row.client_id;
          if (!clientId || !idSet.has(clientId)) return;
          const hl = Number(row.htls_total) || 0;
          map[clientId] = (map[clientId] || 0) + hl;
        });
        if (!cancelled) setMonthlySalesMap(map);
      } catch (err) {
        console.warn("dynamic advisor route: error loading monthly sales", err);
        if (!cancelled) setMonthlySalesMap({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [combinedClientIds, currentMonthRange.from, currentMonthRange.to]);

  const visitedSet = useMemo(() => new Set(visitedTodayIds), [visitedTodayIds]);

  const combinedEntries = useMemo(() => {
    const entries = [];
    const requestsByClient = new Map();
    requestedVisits.forEach((request) => {
      if (!request?.client_id) return;
      requestsByClient.set(request.client_id, request);
    });

    scheduledClients.forEach((client) => {
      if (!client?.id) return;
      const request = requestsByClient.get(client.id) || null;
      const status = (request?.status || "").toLowerCase();
      const visitedByStatus = status === "completed" || status === "done";

      // Dual Check: ID or Code
      const code = client.client_code ? String(client.client_code) : null;
      const visitedToday = visitedSet.has(client.id) || (code && visitedSet.has(code)) || visitedByStatus;

      entries.push({
        client,
        pendingRequest: request,
        source: request ? "both" : "frequency",
        visitedToday,
      });
      if (request) requestsByClient.delete(client.id);
    });

    requestsByClient.forEach((request) => {
      const client = request.client || null;
      if (!client) return;
      const status = (request.status || "").toLowerCase();
      const visitedByStatus = status === "completed" || status === "done";

      const code = client.client_code ? String(client.client_code) : null;
      const visitedToday = visitedSet.has(request.client_id) || (code && visitedSet.has(code)) || visitedByStatus;

      entries.push({
        client,
        pendingRequest: request,
        source: "televenta",
        visitedToday,
      });
    });

    return entries;
  }, [requestedVisits, scheduledClients, visitedSet]);

  const clientById = useMemo(() => {
    const map = new Map();
    combinedEntries.forEach((entry) => {
      const client = entry?.client;
      if (client?.id) {
        map.set(client.id, client);
      }
    });
    return map;
  }, [combinedEntries]);

  const fold = useCallback((value) => foldString(value), []);

  const filteredEntries = useMemo(() => {
    const query = fold(search);
    const base = !query
      ? combinedEntries
      : combinedEntries.filter((entry) => {
        const values = [
          entry.client?.business_name,
          entry.client?.name,
          entry.client?.client_code,
          entry.client?.address,
        ];
        return values.some((value) => fold(value).includes(query));
      });
    const sorted = [...base].sort((a, b) => {
      if (a.visitedToday !== b.visitedToday) {
        return a.visitedToday ? 1 : -1;
      }
      const aPending =
        a.pendingRequest && (a.pendingRequest.status || "pending").toLowerCase() === "pending";
      const bPending =
        b.pendingRequest && (b.pendingRequest.status || "pending").toLowerCase() === "pending";
      if (aPending !== bPending) return aPending ? -1 : 1;
      const aName = fold(a.client?.business_name || a.client?.name);
      const bName = fold(b.client?.business_name || b.client?.name);
      return aName.localeCompare(bName);
    });
    return sorted;
  }, [combinedEntries, fold, search]);

  const summary = useMemo(() => {
    const total = combinedEntries.length;
    const visitados = combinedEntries.filter((entry) => entry.visitedToday).length;
    const porVisitar = total - visitados;
    const televentaPendientes = combinedEntries.filter((entry) => {
      const status = (entry.pendingRequest?.status || "").toLowerCase();
      return status === "pending";
    }).length;
    return { total, visitados, porVisitar, televentaPendientes };
  }, [combinedEntries]);

  const handleOpenClient = useCallback(
    (clientId) => {
      if (!clientId) return;
      navigate(`/clients/${clientId}`);
    },
    [navigate]
  );

  const handleMarkRequest = useCallback(
    async (request, status) => {
      if (!request) return;
      try {
        const payload =
          status === "completed"
            ? { status, visited_at: new Date().toISOString() }
            : { status, visited_at: null };
        const { error } = await supabase.from("client_visits").update(payload).eq("id", request.id);
        if (error) throw error;
        toast({
          title: "Solicitud actualizada",
          description: "Se actualizo el estatus de la visita.",
        });
        if (status === "completed" && request.client_id) {
          setVisitedTodayIds((prev) =>
            prev.includes(request.client_id) ? prev : [...prev, request.client_id]
          );
        }
        loadRequestedVisits();
      } catch (err) {
        console.error("dynamic advisor route: error updating client_visits", err);
        toast({
          title: "Error",
          description: err?.message || "No se pudo actualizar la solicitud.",
          variant: "destructive",
        });
      }
    },
    [loadRequestedVisits, toast]
  );

  const tryRegisterVisit = useCallback(
    async (entry) => {
      const rawClient = entry?.client;
      if (!rawClient) {
        toast({
          title: "Cliente no disponible",
          description: "No se encontro la informacion del cliente.",
          variant: "destructive",
        });
        return;
      }
      const freshestClient =
        scheduledClients.find((c) => String(c.id) === String(rawClient.id)) || rawClient;
      setForceMotivo(entry.pendingRequest ? "RUTA" : null);
      setActiveRequest(entry.pendingRequest || null);
      setVisitDialogClient(freshestClient);
      setVisitDialogOpen(true);
    },
    [scheduledClients, toast]
  );

  const updateClientGeolocation = useCallback(
    async (client) => {
      if (!client?.id) return;
      setUpdatingId(client.id);
      try {
        const pos = await getOptionalPositionFast(6000);
        if (!pos) {
          toast({
            title: "GPS no disponible",
            description: "No se detectó ubicación en 6s. Se omitió la actualización de coordenadas.",
          });
          return;
        }
        const { latitude, longitude } = pos.coords;
        const { updateClient } = await import('@/repositories/clientsRepository');
        const newCoords = { lat: latitude, lng: longitude };
        await updateClient(client.id, { 
          lat: latitude, 
          lng: longitude, 
          coords: newCoords 
        });

        toast({
          title: "Coordenadas actualizadas",
          description: "Se guardo la nueva ubicacion del cliente.",
        });

        // Actualizar en el estado local de clientes programados de inmediato (sin re-fetchear ni pisar con cache vieja)
        const updatedFields = {
          lat: latitude,
          lng: longitude,
          latitude,
          longitude,
          coords: newCoords
        };
        setScheduledClients(prev => prev.map(c => String(c.id) === String(client.id) ? { ...c, ...updatedFields } : c));
        setRequestedVisits(prev => prev.map(req => String(req.client_id) === String(client.id) && req.client ? { ...req, client: { ...req.client, ...updatedFields } } : req));
        if (String(visitDialogClient?.id) === String(client.id)) {
          setVisitDialogClient(prev => ({ ...prev, ...updatedFields }));
        }
      } catch (error) {
        toast({
          title: "GPS omitido",
          description: "No se pudieron guardar coordenadas en este momento.",
        });
      } finally {
        setUpdatingId(null);
      }
    },
    [toast, visitDialogClient]
  );

  const handleAssetSuccess = useCallback(() => {
    setAssetClient(null);
    toast({
      title: "Activo registrado",
      description: "El activo se registro correctamente.",
    });
  }, [toast]);

  const handleFinalizeRoute = useCallback(async () => {
    if (!advisorId) {
      toast({
        title: "Sin usuario",
        description: "No se pudo identificar al asesor dinamico.",
        variant: "destructive",
      });
      return;
    }
    const assigned = combinedEntries.length;
    if (!assigned) {
      toast({
        title: "Ruta sin clientes",
        description: "No hay clientes asignados para hoy.",
        variant: "destructive",
      });
      return;
    }

    const visitedClients = combinedEntries.filter(
      (entry) => entry.visitedToday && entry.client?.id
    );
    const visitedCount = visitedClients.length;
    const pending = Math.max(assigned - visitedCount, 0);
    const completion = assigned ? Math.round((visitedCount / assigned) * 100) : 0;

    setFinalizeLoading(true);
    try {
      let details = [];
      if (visitedCount) {
        // Fix: Collect both UUIDs and Client Codes to ensure we match MySQL visits
        // MySQL returns client_code (e.g. "999") or numeric ID (e.g. 94), but not UUID.
        const searchKeysSet = new Set();
        visitedClients.forEach((entry) => {
          if (entry.client?.id) searchKeysSet.add(entry.client.id);
          if (entry.client?.client_code) searchKeysSet.add(String(entry.client.client_code));
        });
        const searchKeys = Array.from(searchKeysSet);

        let visitRows = [];
        if (searchKeys.length) {
          // Switch to MySQL/Local Source instead of Supabase to ensure data consistency
          // Reuse getVisitsSummary which now supports online/offline correctly
          const summary = await getVisitsSummary(searchKeys, todayInfo.ymd, todayInfo.ymd);
          visitRows = summary.visits || [];
        }

        const toNumber = (value) => {
          if (value === null || value === undefined || value === "") return null;
          const num = Number(value);
          return Number.isFinite(num) ? num : null;
        };

        // Create a lookup map for MySQL visits
        // Key: client_code (preferred) or client_id (fallback)
        const visitsLookup = new Map();

        visitRows.forEach(row => {
          // If row has client_code, use it as key. 
          // Note: MySQL row might not have client_code if not joined. 
          // But getVisitsSummary usually joins or we can rely on matching by ID if code is missing?
          // Actually, getVisitsSummary returns `client_code` in the row if we are lucky (we saw it in logs).
          if (row.client_code) {
            visitsLookup.set(String(row.client_code), row);
          } else {
            visitsLookup.set(String(row.client_id), row);
          }
        });

        // Build details from the assigned clients list (visitedClients)
        details = visitedClients.map(entry => {
          const client = entry.client;
          if (!client) return null;

          // Try to find matching visit data
          let match = null;
          if (client.client_code && visitsLookup.has(String(client.client_code))) {
            match = visitsLookup.get(String(client.client_code));
          } else if (client.id && visitsLookup.has(String(client.id))) {
            match = visitsLookup.get(String(client.id));
          }

          const fallbackCoords = parseCoords(client);
          const lat = match ? toNumber(match.lat) : fallbackCoords?.lat;
          const lng = match ? toNumber(match.lng) : fallbackCoords?.lng;

          return {
            id: match?.id || null, // Visit ID
            client_id: client.id,
            client: client,
            cliente_nombre: client.business_name || client.name || match?.cliente_nombre || "Cliente",
            fecha: match?.fecha || todayInfo.ymd,
            hora: match?.hora || null, // If match found, we get the time!
            lat: lat ?? null,
            lng: lng ?? null,
            motivo: match?.motivo || entry.pendingRequest?.reason || null,
            notes: match?.notes || null
          };
        }).filter(Boolean);

        // Sort by time
        details.sort((a, b) => {
          const timeA = a.hora || "";
          const timeB = b.hora || "";
          if (!timeA && !timeB) return 0;
          if (!timeA) return 1;
          if (!timeB) return -1;
          return timeA.localeCompare(timeB);
        });
      }

      setFinalizeTotals({ assigned, visited: visitedCount, pending, completion });
      setVisitDetails(details);
      setFinalizeDialogOpen(true);
    } catch (err) {
      console.error("dynamic advisor route: finalize report error", err);
      toast({
        title: "Error al generar reporte",
        description: err?.message || "No fue posible preparar el reporte de la ruta.",
        variant: "destructive",
      });
    } finally {
      setFinalizeLoading(false);
    }
  }, [advisorId, clientById, combinedEntries, todayInfo.ymd, toast]);

  const handleSendWhatsApp = useCallback(() => {
    if (!finalizeTotals) return;
    const phone = "522221427848";
    const lines = [
      `Reporte de ruta ${todayInfo.ymd}`,
      `Clientes asignados: ${finalizeTotals.assigned}`,
      `Visitados: ${finalizeTotals.visited}`,
      `Pendientes: ${finalizeTotals.pending}`,
      `Cumplimiento: ${finalizeTotals.assigned ? finalizeTotals.completion : 0}%`,
    ];

    if (visitDetails.length) {
      lines.push("", "Visitas registradas:");
      visitDetails.forEach((visit, index) => {
        const client = visit.client;
        const name =
          client?.business_name ||
          client?.name ||
          visit.cliente_nombre ||
          `Cliente ${index + 1}`;
        const hora = visit.hora ? ` a las ${visit.hora}` : "";
        let line = `${index + 1}. ${name}${hora}`;
        if (visit.lat !== null && visit.lng !== null) {
          line += ` (${visit.lat.toFixed(5)}, ${visit.lng.toFixed(5)})`;
        }
        lines.push(line);
        if (visit.lat !== null && visit.lng !== null) {
          lines.push(`   https://maps.google.com/?q=${visit.lat},${visit.lng}`);
        }
      });
    } else {
      lines.push("", "No se registraron visitas con geolocalizacion.");
    }

    const message = encodeURIComponent(lines.join("\n"));
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank", "noopener,noreferrer");
  }, [finalizeTotals, todayInfo.ymd, visitDetails]);

  const handleVisitFormSaved = useCallback(async () => {
    const clientId = visitDialogClient?.id || null;
    if (activeRequest) {
      try {
        const { error } = await supabase
          .from("client_visits")
          .update({ status: "completed", visited_at: new Date().toISOString() })
          .eq("id", activeRequest.id);
        if (error) throw error;
      } catch (err) {
        console.error("dynamic advisor route: error updating visit request", err);
        toast({
          title: "Advertencia",
          description:
            err?.message || "La visita se guardo pero no se actualizo la solicitud. Revisa manualmente.",
        });
      }
    }
    if (clientId) {
      setVisitedTodayIds((prev) => (prev.includes(clientId) ? prev : [...prev, clientId]));
    }
    toast({
      title: "Visita registrada",
      description: "Se guardo la visita correctamente.",
    });
    setVisitDialogOpen(false);
    setVisitDialogClient(null);
    setForceMotivo(null);
    setActiveRequest(null);
    loadRequestedVisits();
  }, [activeRequest, loadRequestedVisits, toast, visitDialogClient]);

  const closeVisitDialog = useCallback((open) => {
    if (open) return;
    setVisitDialogOpen(false);
    setVisitDialogClient(null);
    setForceMotivo(null);
    setActiveRequest(null);
  }, []);

  const totalLoading = loadingScheduledClients || loadingRequestedVisits;

  return (
    <div className="container mx-auto py-8">
      <Helmet>
        <title>Ruta del dia</title>
      </Helmet>

      <h1 className="text-2xl font-bold mb-4 text-white">Ruta y asignaciones del dia</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg border border-white/20 bg-emerald-900/40 p-4 text-white">
          <div className="text-xs uppercase text-emerald-200 tracking-wide">Por visitar</div>
          <div className="mt-2 text-3xl font-bold">{summary.porVisitar}</div>
          <div className="text-xs text-white/70 mt-1">Clientes pendientes hoy</div>
        </div>
        <div className="rounded-lg border border-emerald-400 bg-emerald-800/60 p-4 text-white">
          <div className="text-xs uppercase text-emerald-200 tracking-wide">Visitados</div>
          <div className="mt-2 flex items-center gap-2 text-3xl font-bold">
            <CheckCircle2 className="h-7 w-7 text-emerald-200" />
            {summary.visitados}
          </div>
          <div className="text-xs text-white/70 mt-1">Marcar como verde al registrar</div>
        </div>
        <div className="rounded-lg border border-white/20 bg-emerald-900/40 p-4 text-white">
          <div className="text-xs uppercase text-emerald-200 tracking-wide">Solicitudes televenta</div>
          <div className="mt-2 flex items-center gap-2 text-3xl font-bold">
            <UserPlus className="h-7 w-7 text-emerald-200" />
            {summary.televentaPendientes}
          </div>
          <div className="text-xs text-white/70 mt-1">Visitas solicitadas sin cerrar</div>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={() => setRouteMapOpen(true)}
          className="w-full border-emerald-500 text-emerald-200 hover:bg-emerald-500/10 sm:w-auto"
        >
          <MapIcon className="mr-2 h-4 w-4" />
          Ver mapa
        </Button>
        <Button
          onClick={handleFinalizeRoute}
          disabled={finalizeLoading}
          className="w-full sm:w-auto bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {finalizeLoading ? "Generando reporte..." : "Finalizar ruta"}
        </Button>
      </div>

      <div className="mb-6 flex flex-col gap-4 rounded-lg border border-white/10 bg-slate-900/50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Clientes programados y asignados</h2>
            <p className="text-sm text-white/70">
              Incluye frecuencia del dia y las solicitudes generadas por televenta.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Buscar por nombre o codigo"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-400 sm:w-64"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearch("");
                loadRouteClients();
                loadRequestedVisits();
              }}
              className="border border-white/20 text-white hover:bg-white/10"
            >
              Refrescar
            </Button>
          </div>
        </div>

        {totalLoading ? (
          <div className="text-sm text-white/60">Cargando informacion...</div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-sm text-white/60">
            No hay clientes asignados para la frecuencia de hoy o coincidentes con la busqueda.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredEntries.map((entry) => {
              const { client, pendingRequest, visitedToday } = entry;
              if (!client) return null;
              const cardClasses = visitedToday
                ? "rounded-lg border border-emerald-400 bg-emerald-50 p-4 shadow-sm text-black"
                : "rounded-lg border border-gray-200 bg-white p-4 shadow-sm text-black";
              const serials = assetSerials[client.id] || [];
              const fallbackCoolers = serials.length
                ? []
                : splitMultiValue(client.cooler_serials || client.cooler || "");
              const displayAssets = serials.length ? serials : fallbackCoolers;
              const hasCooler = displayAssets.length > 0;
              const salesHL = Number(monthlySalesMap[client.id] || 0);
              const hasSalesThisMonth = salesHL > 0;
              const statusMessage = hasSalesThisMonth
                ? null
                : hasCooler
                  ? "Tiene enfriador pero no compra en el mes"
                  : "Sin compras registradas en el mes";
              const statusDot = statusMessage ? (
                <span
                  className={`inline-flex shrink-0 items-center justify-center rounded-full border border-white/80 shadow ${hasCooler ? "h-4 w-4 bg-red-500" : "h-3.5 w-3.5 bg-orange-400"
                    }`}
                  title={statusMessage}
                  aria-label={statusMessage}
                  role="img"
                />
              ) : null;
              const status = (pendingRequest?.status || "pending").toLowerCase();
              return (
                <div key={client.id} className={cardClasses}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-gray-500">
                        Código: {client.client_code || "Sin código"}
                      </div>
                      <div className="text-lg font-semibold flex items-center gap-2">
                        {client.business_name || client.name || "Cliente sin nombre"}
                        {statusDot}
                      </div>
                      <div className="text-sm text-gray-600">
                        {client.address || "Sin direccion registrada"}
                      </div>
                      <div className="text-sm text-gray-600">
                        Teléfono: {client.phone || "Sin teléfono"}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        Frecuencia: {formatVisitDays(client)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {hasSalesThisMonth
                          ? `Compra del mes: ${salesHL.toLocaleString("es-MX", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          })} HL`
                          : hasCooler
                            ? "Enfriador activo sin compra en el mes"
                            : "Sin compra registrada en el mes"}
                      </div>
                      {pendingRequest ? (
                        <div className="mt-2 rounded border border-emerald-300 bg-emerald-100 px-2 py-1 text-xs text-emerald-900">
                          Solicitud televenta - {status === "pending" ? "Pendiente" : "Cerrada"}
                          {pendingRequest.reason ? ` - ${pendingRequest.reason}` : ""}
                          {pendingRequest.requested_at
                            ? ` - ${new Date(pendingRequest.requested_at).toLocaleString("es-MX")}`
                            : ""}
                        </div>
                      ) : (
                        <div className="mt-2 inline-flex rounded border border-gray-200 bg-gray-100 px-2 py-1 text-xs text-gray-700">
                          Planificado por frecuencia
                        </div>
                      )}
                      {visitedToday ? (
                        <div className="mt-2 inline-flex items-center gap-1 rounded bg-emerald-200 px-2 py-1 text-xs font-medium text-emerald-900">
                          <CheckCircle2 className="h-4 w-4" /> Visitado hoy
                        </div>
                      ) : null}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-gray-500 hover:bg-gray-100">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setSalesClient(client)}>
                          <DollarSign className="mr-2 h-4 w-4" />
                          Ventas
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => updateClientGeolocation(client)}
                          disabled={updatingId === client.id}
                        >
                          <MapPin className="mr-2 h-4 w-4" />
                          {updatingId === client.id ? "Actualizando..." : "Actualizar geo"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setAssetClient(client)}>
                          <PackagePlus className="mr-2 h-4 w-4" />
                          Registrar activo
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleOpenClient(client.id)}>
                          <MapPin className="mr-2 h-4 w-4" />
                          Ver detalle
                        </DropdownMenuItem>
                        {pendingRequest ? (
                          <>
                            <DropdownMenuItem
                              onSelect={() => handleMarkRequest(pendingRequest, "completed")}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Marcar completada
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => handleMarkRequest(pendingRequest, "cancelled")}
                            >
                              Cancelar solicitud
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
                      onClick={() => navigate(`/asesor-dinamico/clientes/${client.id}/simulator`)}
                    >
                      Simulador
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() => tryRegisterVisit(entry)}
                    >
                      Registrar visita
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-100"
                      onClick={() => setSalesClient(client)}
                    >
                      Historico de ventas
                    </Button>
                  </div>

                  <div className="mt-3 text-xs text-gray-600">
                    Activos: {displayAssets.length ? displayAssets.join(", ") : "Sin activos registrados"}
                  </div>

                  <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-2">
                    <div className="text-xs font-semibold text-gray-700">Ultimas visitas</div>
                    <ClientVisitsList clientId={client.id} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={visitDialogOpen} onOpenChange={closeVisitDialog}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-hidden p-0 sm:p-6">
          <DialogHeader className="border-b border-slate-200 px-4 py-3 sm:px-0 sm:py-0 sm:border-none">
            <DialogTitle className="text-lg font-semibold">
              Registrar visita{" "}
              {visitDialogClient?.business_name || visitDialogClient?.name || ""}
            </DialogTitle>
          </DialogHeader>
          <div className="px-0 py-4 sm:pt-6">
            {visitDialogClient ? (
              <VisitForm
                client={visitDialogClient}
                onSave={handleVisitFormSaved}
                forceMotivo={forceMotivo}
                onClientCoordsUpdated={(newCoords) => {
                  const updatedFields = {
                    lat: newCoords.lat,
                    lng: newCoords.lng,
                    latitude: newCoords.lat,
                    longitude: newCoords.lng,
                    coords: newCoords,
                  };
                  setScheduledClients((prev) =>
                    prev.map((c) => (String(c.id) === String(visitDialogClient.id) ? { ...c, ...updatedFields } : c))
                  );
                  setVisitDialogClient((prev) => (prev ? { ...prev, ...updatedFields } : prev));
                }}
              />
            ) : (
              <div className="p-4 text-sm text-muted-foreground">
                No se pudo cargar la informacion del cliente.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={finalizeDialogOpen} onOpenChange={setFinalizeDialogOpen}>
        <DialogContent
          className="w-[92vw] max-h-[90vh] overflow-y-auto border border-slate-700 bg-slate-900 p-0 text-slate-100 sm:p-6 sm:w-full sm:max-w-[min(100vw-96px,840px)]"
          aria-describedby="finalize-route-description"
        >
          <DialogHeader className="border-b border-slate-700 px-4 py-3 sm:px-0 sm:py-0 sm:border-none">
            <DialogTitle className="text-lg font-semibold">
              Resumen de ruta
            </DialogTitle>
            <DialogDescription id="finalize-route-description" className="sr-only">
              Detalle de visitas realizadas en la ruta del asesor dinamico.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-0 sm:pt-6">
            {finalizeTotals ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <SummaryCard label="Asignados" value={finalizeTotals.assigned} />
                  <SummaryCard label="Visitados" value={finalizeTotals.visited} />
                  <SummaryCard label="Pendientes" value={finalizeTotals.pending} />
                  <SummaryCard
                    label="Cumplimiento"
                    value={`${finalizeTotals.completion}%`}
                  />
                </div>

                <div>
                  <h4 className="mb-2 text-base font-semibold text-slate-100">
                    Mapa de visitas
                  </h4>
                  <RouteVisitsMap visits={visitDetails} />
                </div>

                <div>
                  <h4 className="mb-2 text-base font-semibold text-slate-100">
                    Detalle de visitas
                  </h4>
                  {visitDetails.length ? (
                    <ul className="space-y-2 text-sm text-slate-200">
                      {visitDetails.map((visit, index) => {
                        const client =
                          visit.client ||
                          clientById.get(visit.client_id) ||
                          null;
                        const name =
                          client?.business_name ||
                          client?.name ||
                          visit.cliente_nombre ||
                          `Cliente ${index + 1}`;
                        return (
                          <li
                            key={`${visit.client_id || index}-${visit.hora || index}`}
                            className="rounded border border-slate-700 bg-slate-800 px-4 py-3"
                          >
                            <div className="font-semibold text-slate-100">
                              {index + 1}. {name}
                            </div>
                            <div className="text-xs text-slate-400">
                              {visit.hora ? `Hora: ${visit.hora}` : "Hora: --"}
                              {visit.motivo ? ` · Motivo: ${visit.motivo}` : ""}
                            </div>
                            {visit.lat !== null && visit.lng !== null ? (
                              <div className="text-xs text-emerald-400">
                                <a
                                  href={`https://maps.google.com/?q=${visit.lat},${visit.lng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline"
                                >
                                  Ver en Google Maps
                                </a>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500">
                                Sin coordenadas registradas
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="rounded border border-slate-700 bg-slate-800/60 px-4 py-3 text-sm text-slate-300">
                      No hay visitas registradas para el dia de hoy.
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    onClick={handleSendWhatsApp}
                    className="w-full sm:w-auto bg-emerald-600 text-white hover:bg-emerald-500"
                  >
                    Enviar reporte por WhatsApp
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setFinalizeDialogOpen(false)}
                    className="w-full border-slate-700 text-slate-200 hover:bg-slate-800 sm:w-auto"
                  >
                    Cerrar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded border border-slate-700 bg-slate-800/60 px-4 py-6 text-center text-sm text-slate-300">
                No hay informacion disponible para mostrar.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {salesClient && (
        <SalesDialog client={salesClient} onClose={() => setSalesClient(null)} />
      )}

      {assetClient && (
        <AddExistingAssetModal
          client={assetClient}
          onClose={() => setAssetClient(null)}
          onSuccess={handleAssetSuccess}
        />
      )}

      <Dialog open={routeMapOpen} onOpenChange={setRouteMapOpen}>
        <DialogContent className="w-[92vw] max-h-[90vh] overflow-hidden border border-slate-700 bg-slate-900 p-0 text-slate-100 sm:w-full sm:max-w-[min(100vw-96px,900px)]">
          <DialogHeader className="border-b border-slate-700 px-4 py-3">
            <DialogTitle className="text-lg font-semibold">Mapa de clientes de hoy</DialogTitle>
            <DialogDescription className="sr-only">
              Visor de clientes visitados y pendientes en la ruta actual.
            </DialogDescription>
          </DialogHeader>
          <div className="flex h-full flex-col gap-4 overflow-y-auto px-4 py-4">
            <RouteStatusMap entries={combinedEntries} />
            <div className="flex flex-wrap gap-4 text-sm text-slate-200">
              <LegendItem color="#22c55e" label="Visitado" />
              <LegendItem color="#f97316" label="Pendiente" />
              <LegendItem color="#9ca3af" label="Sin coordenadas (no se muestra)" />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4 text-white">
      <div className="text-xs uppercase tracking-wide text-slate-300">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function RouteVisitsMap({ visits }) {
  const points = visits
    .map((visit, index) => {
      if (visit.lat === null || visit.lng === null) return null;
      const client = visit.client || null;
      const name =
        client?.business_name ||
        client?.name ||
        visit.cliente_nombre ||
        `Cliente ${index + 1}`;
      return {
        id: visit.client_id || index,
        lat: Number(visit.lat),
        lng: Number(visit.lng),
        name,
        hora: visit.hora || null,
        motivo: visit.motivo || null,
      };
    })
    .filter(Boolean);

  if (!points.length) {
    return (
      <div className="rounded border border-slate-700 bg-slate-800/60 px-4 py-6 text-center text-sm text-slate-300">
        No hay coordenadas registradas para las visitas de hoy.
      </div>
    );
  }

  const first = points[0];

  return (
    <div className="h-[min(320px,40vh)] w-full overflow-hidden rounded-lg border border-slate-700">
      <MapContainer
        center={[first.lat, first.lng]}
        zoom={13}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        {points.map((point) => (
          <Marker key={point.id} position={[point.lat, point.lng]}>
            <Popup>
              <div className="space-y-1 text-sm">
                <div className="font-semibold">{point.name}</div>
                {point.hora ? <div>Hora: {point.hora}</div> : null}
                {point.motivo ? <div>Motivo: {point.motivo}</div> : null}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng]));
    map.fitBounds(bounds, { padding: [32, 32] });
  }, [points, map]);
  return null;
}

const statusIconCache = new Map();
function getStatusIcon(color) {
  if (statusIconCache.has(color)) return statusIconCache.get(color);
  const icon = L.divIcon({
    className: "status-marker",
    html: `<span style="
      display:block;width:18px;height:18px;border-radius:50%;
      background:${color};
      border:2px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,.35);
    "></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
  statusIconCache.set(color, icon);
  return icon;
}

function RouteStatusMap({ entries }) {
  const points = entries
    .map((entry, index) => {
      const client = entry.client;
      if (!client) return null;
      const coords = parseCoords(client);
      if (!coords) return null;
      return {
        id: client.id || index,
        lat: coords.lat,
        lng: coords.lng,
        visited: entry.visitedToday,
        name: client.business_name || client.name || `Cliente ${index + 1}`,
      };
    })
    .filter(Boolean);

  if (!points.length) {
    return (
      <div className="rounded border border-slate-700 bg-slate-800/60 px-4 py-6 text-center text-sm text-slate-300">
        No hay clientes con coordenadas disponibles para mostrar.
      </div>
    );
  }

  const first = points[0];
  return (
    <div className="h-[min(420px,55vh)] w-full overflow-hidden rounded-lg border border-slate-700">
      <MapContainer
        center={[first.lat, first.lng]}
        zoom={13}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        {points.map((point) => (
          <Marker
            key={point.id}
            position={[point.lat, point.lng]}
            icon={getStatusIcon(point.visited ? "#22c55e" : "#f97316")}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{point.name}</div>
                <div>{point.visited ? "Visitado" : "Pendiente"}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-3 w-3 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </div>
  );
}

