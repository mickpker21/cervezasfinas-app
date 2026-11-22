import React, { useEffect, useState, useMemo, useCallback } from "react";
import VisitForm from "../components/VisitForm";
import { exportToCSV } from "../utils/exportUtils";
import { canCreateVisita } from "../utils/roleUtils";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAllVisits, getVisitsByRoute } from "@/repositories/visitsRepository";
import { getClientsByIds, getClientsByCodes } from "@/repositories/clientsRepository";
import { fetchClientsApi } from "@/lib/mysqlClients";
import { getProfileById } from "@/repositories/workPlanRepository";
import { getTodayMexico } from "@/lib/dateUtils";

// Helper para fechas seguras en zona horaria de México
const getMexicoDateWithOffset = (daysOffset = 0) => {
  const todayStr = getTodayMexico();
  if (daysOffset === 0) return todayStr;
  const [y, m, d] = todayStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + daysOffset);
  return dt.toLocaleDateString("en-CA");
};

import {
  Calendar,
  Clock,
  MapPin,
  Store,
  User,
  Camera,
  MessageSquare,
  Download,
  Search,
  Filter,
  RefreshCw,
  LayoutGrid,
  Table as TableIcon,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Plus,
  Eye,
  X,
  ChevronRight,
  Sparkles,
  Building2,
  Phone,
  FileText,
  TrendingUp,
  Image as ImageIcon
} from "lucide-react";

// Cache en memoria para agilizar cambios de pestaña
let globalVisitsCache = {
  data: null,
  timestamp: 0,
  params: null
};

// Colores e iconos según motivo de visita
const MOTIVO_CONFIG = {
  "Prospeccion": { bg: "bg-blue-500/15 text-blue-400 border-blue-500/30", label: "Prospección" },
  "Negociacion": { bg: "bg-purple-500/15 text-purple-400 border-purple-500/30", label: "Negociación" },
  "Cierre": { bg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", label: "Cierre" },
  "Seguimiento": { bg: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30", label: "Seguimiento" },
  "Reposición": { bg: "bg-amber-500/15 text-amber-400 border-amber-500/30", label: "Reposición" },
  "Cobranza": { bg: "bg-rose-500/15 text-rose-400 border-rose-500/30", label: "Cobranza" },
  "Visita Express": { bg: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30", label: "Visita Express" },
  "Default": { bg: "bg-slate-700/40 text-slate-300 border-slate-600/40", label: "Visita de Campo" }
};

const getMotivoStyle = (motivo) => {
  if (!motivo) return MOTIVO_CONFIG.Default;
  const match = Object.keys(MOTIVO_CONFIG).find(
    k => k.toLowerCase() === String(motivo).toLowerCase().trim()
  );
  return match ? MOTIVO_CONFIG[match] : MOTIVO_CONFIG.Default;
};

export default function VisitsPage() {
  const { user: usuario } = useSupabaseAuth();
  const [visitas, setVisitas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [selectedMotivo, setSelectedMotivo] = useState("ALL");
  const [evidenceFilter, setEvidenceFilter] = useState("ALL"); // ALL, WITH_PHOTOS, WITH_NOTES
  const [routeFilter, setRouteFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState("cards"); // 'cards' | 'table'
  const [selectedVisita, setSelectedVisita] = useState(null);
  const [fullPhotoUrl, setFullPhotoUrl] = useState(null);

  // Modal para nueva visita
  const [isNewVisitOpen, setIsNewVisitOpen] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [clientSearchResults, setClientSearchResults] = useState([]);
  const [searchingClients, setSearchingClients] = useState(false);
  const [selectedClientForNewVisit, setSelectedClientForNewVisit] = useState(null);

  // Rango de fechas por defecto: últimos 7 días en zona horaria de México
  const [fromDate, setFromDate] = useState(() => getMexicoDateWithOffset(-6));
  const [toDate, setToDate] = useState(() => getTodayMexico());

  const setPreset = (type) => {
    const todayStr = getTodayMexico();
    if (type === "hoy") {
      setFromDate(todayStr);
      setToDate(todayStr);
      return;
    }
    if (type === "ayer") {
      const yesterday = getMexicoDateWithOffset(-1);
      setFromDate(yesterday);
      setToDate(yesterday);
      return;
    }
    if (type === "7") {
      setFromDate(getMexicoDateWithOffset(-6));
      setToDate(todayStr);
      return;
    }
    if (type === "mes") {
      const [y, m] = todayStr.split("-");
      setFromDate(`${y}-${m}-01`);
      setToDate(todayStr);
      return;
    }
    if (type === "todo") {
      setFromDate("");
      setToDate("");
    }
  };

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!usuario) return;
    if (isRefresh) {
      globalVisitsCache = { data: null, timestamp: 0, params: null };
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const uid = usuario.id;
      const role = (
        usuario.user_metadata?.type ||
        usuario.user_metadata?.role ||
        usuario.user_metadata?.rol ||
        usuario.app_metadata?.roles?.[0] ||
        ""
      ).toLowerCase();
      const route = usuario.user_metadata?.sales_route || usuario.user_metadata?.route;
      const isAdmin = role.includes("supervisor") || role.includes("admin") || role.includes("gerente") || role.includes("control");

      const currentParams = JSON.stringify({ uid, role, route, fromDate, toDate });

      // Verificación de caché rápido si no es refresco forzado (10 segundos)
      if (
        !isRefresh &&
        globalVisitsCache.data &&
        globalVisitsCache.params === currentParams &&
        Date.now() - globalVisitsCache.timestamp < 10000
      ) {
        setVisitas(globalVisitsCache.data);
        setLoading(false);
        return;
      }

      let rawVisits = [];

      // 1. Obtención de visitas desde API MySQL (trae las visitas en el rango de fechas)
      try {
        const { fetchVisitsApi } = await import("@/lib/mysqlVisits");
        const apiParams = { limit: 1000 };

        if (fromDate) apiParams.start_date = fromDate;
        if (toDate) apiParams.end_date = toDate;

        rawVisits = await fetchVisitsApi(apiParams);
      } catch (e) {
        console.warn("[VisitsPage] Falló consulta online MySQL, buscando respaldo local:", e);
        if (!isAdmin && route) {
          rawVisits = await getVisitsByRoute(route, { startDate: fromDate, endDate: toDate });
        } else {
          rawVisits = await getAllVisits();
        }
      }

      // 2. Poblado de información de Clientes (Garantía de nombre de cliente)
      const missingClientIds = [];
      const missingClientCodes = [];

      rawVisits.forEach((v) => {
        const hasValidName =
          (v.cliente_nombre && v.cliente_nombre !== "Sin Nombre" && v.cliente_nombre !== "Cliente no encontrado") ||
          (v.client_business_name && v.client_business_name !== "Sin Nombre") ||
          (v.client_name && v.client_name !== "Sin Nombre") ||
          (v.business_name && v.business_name !== "Sin Nombre");

        if (!hasValidName) {
          if (v.client_id) missingClientIds.push(String(v.client_id));
          if (v.client_code) missingClientCodes.push(String(v.client_code));
        }
      });

      const uniqueClientIds = Array.from(new Set(missingClientIds));
      const uniqueClientCodes = Array.from(new Set(missingClientCodes));
      const clientMap = new Map();

      if (uniqueClientIds.length > 0 || uniqueClientCodes.length > 0) {
        try {
          const [clientsById, clientsByCode] = await Promise.all([
            uniqueClientIds.length > 0 ? getClientsByIds(uniqueClientIds) : Promise.resolve([]),
            uniqueClientCodes.length > 0 ? getClientsByCodes(uniqueClientCodes) : Promise.resolve([])
          ]);

          [...(clientsById || []), ...(clientsByCode || [])].forEach((c) => {
            if (c) {
              if (c.id) clientMap.set(`id:${String(c.id)}`, c);
              if (c.client_code) clientMap.set(`code:${String(c.client_code).trim()}`, c);
              if (c.code) clientMap.set(`code:${String(c.code).trim()}`, c);
            }
          });
        } catch (err) {
          console.warn("[VisitsPage] No se pudieron cargar detalles de clientes ausentes:", err);
        }
      }

      // 3. Poblado de Nombres de Usuarios / Asesores
      const uniqueUserIds = Array.from(new Set(rawVisits.map((v) => v.user_id).filter(Boolean)));
      const profilesMap = new Map();

      try {
        await Promise.all(
          uniqueUserIds.map(async (userId) => {
            const p = await getProfileById(userId);
            if (p) profilesMap.set(userId, p);
          })
        );
      } catch (err) {
        console.warn("[VisitsPage] No se pudieron cargar perfiles de asesores:", err);
      }

      // 4. Mapeo y Normalización final de visitas
      const populatedVisits = rawVisits.map((visit) => {
        const client =
          (visit.client_code && clientMap.get(`code:${String(visit.client_code).trim()}`)) ||
          (visit.client_id && clientMap.get(`id:${String(visit.client_id)}`)) ||
          {};

        // Resolución inteligente del mejor nombre comercial
        const resolvedName =
          (visit.cliente_nombre && visit.cliente_nombre !== "Sin Nombre" && visit.cliente_nombre !== "Cliente no encontrado" && visit.cliente_nombre) ||
          visit.client_business_name ||
          visit.client_name ||
          client.business_name ||
          client.name ||
          visit.business_name ||
          (visit.client_code ? `Cliente #${visit.client_code}` : (visit.client_id ? `Cliente #${visit.client_id}` : "Punto de Venta"));

        const resolvedCode =
          visit.client_code ||
          client.client_code ||
          client.code ||
          (visit.client_id ? String(visit.client_id) : "");

        const resolvedAddress =
          visit.address ||
          visit.client_address ||
          client.address ||
          client.colony ||
          "";

        const resolvedRoute =
          visit.ruta ||
          visit.route ||
          client.sales_route ||
          client.route ||
          "N/A";

        const profile = profilesMap.get(visit.user_id) || {};
        const userName =
          profile.full_name ||
          profile.name ||
          profile.email ||
          (visit.user_id ? `Usuario #${String(visit.user_id).slice(0, 8)}` : "Asesor");

        const photoCount = [visit.photo_fachada, visit.photo_interior, visit.photo_enfriador].filter(Boolean).length;

        return {
          ...visit,
          cliente_nombre: resolvedName,
          client_code: resolvedCode,
          client_address: resolvedAddress,
          ruta: resolvedRoute,
          user_name: userName,
          user_role: profile.role || "",
          photo_count: photoCount
        };
      });

      // 5. Filtrado por Rol / Permisos de Ruta
      let filteredVisits = populatedVisits;
      if (!isAdmin) {
        filteredVisits = populatedVisits.filter((v) => {
          const isMyUser = String(v.user_id) === String(uid) || String(v.created_by) === String(uid);
          const isMyRoute = route && (
            String(v.ruta || "").trim().toLowerCase() === String(route).trim().toLowerCase() ||
            String(v.route || "").trim().toLowerCase() === String(route).trim().toLowerCase()
          );
          return isMyUser || isMyRoute;
        });
      }

      // Filtrado estricto de fecha local por si el endpoint MySQL no acotó
      if (fromDate || toDate) {
        filteredVisits = filteredVisits.filter((v) => {
          const d = (v.fecha || v.visit_date || "").slice(0, 10);
          if (!d) return true;
          if (fromDate && d < fromDate) return false;
          if (toDate && d > toDate) return false;
          return true;
        });
      }

      // 6. Deduplicación por id único para garantizar que no existan registros repetidos
      const seenVisitIds = new Set();
      const uniqueVisits = [];
      for (const v of filteredVisits) {
        const uniqueKey = v.id || `${v.client_id || v.client_code}-${v.fecha}-${v.hora}`;
        if (!seenVisitIds.has(uniqueKey)) {
          seenVisitIds.add(uniqueKey);
          uniqueVisits.push(v);
        }
      }

      setVisitas(uniqueVisits);

      // Guardar en caché
      globalVisitsCache = {
        data: uniqueVisits,
        timestamp: Date.now(),
        params: currentParams
      };
    } catch (error) {
      console.error("Error al cargar visitas:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [usuario, fromDate, toDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Búsqueda de clientes para la creación de visitas
  const handleSearchClients = async (term) => {
    setClientSearchQuery(term);
    if (!term || term.trim().length < 2) {
      setClientSearchResults([]);
      return;
    }
    setSearchingClients(true);
    try {
      const res = await fetchClientsApi({ search: term.trim(), limit: 10 });
      setClientSearchResults(res.rows || []);
    } catch (e) {
      console.error("Error buscando clientes:", e);
    } finally {
      setSearchingClients(false);
    }
  };

  // Rutas únicas disponibles para el filtro
  const availableRoutes = useMemo(() => {
    const routesSet = new Set(visitas.map((v) => v.ruta).filter(Boolean));
    return Array.from(routesSet).sort((a, b) =>
      String(a).localeCompare(String(b), undefined, { numeric: true })
    );
  }, [visitas]);

  // Motivos únicos disponibles para el filtro
  const availableMotivos = useMemo(() => {
    const motivosSet = new Set(visitas.map((v) => v.motivo).filter(Boolean));
    return Array.from(motivosSet);
  }, [visitas]);

  // Filtro reactivo en memoria
  const visitasFiltradas = useMemo(() => {
    return visitas.filter((v) => {
      // 1. Buscador global (nombre, código, ruta, notas, dirección o agente)
      if (filtro.trim()) {
        const query = filtro.toLowerCase().trim();
        const matchesName = (v.cliente_nombre || "").toLowerCase().includes(query);
        const matchesCode = (v.client_code || "").toLowerCase().includes(query);
        const matchesRoute = (v.ruta || "").toLowerCase().includes(query);
        const matchesNotes = (v.notes || "").toLowerCase().includes(query);
        const matchesAddress = (v.client_address || "").toLowerCase().includes(query);
        const matchesUser = (v.user_name || "").toLowerCase().includes(query);
        if (!matchesName && !matchesCode && !matchesRoute && !matchesNotes && !matchesAddress && !matchesUser) {
          return false;
        }
      }

      // 2. Filtro de motivo
      if (selectedMotivo !== "ALL") {
        if (String(v.motivo || "").toLowerCase() !== selectedMotivo.toLowerCase()) {
          return false;
        }
      }

      // 3. Filtro de evidencia
      if (evidenceFilter === "WITH_PHOTOS" && v.photo_count === 0) return false;
      if (evidenceFilter === "WITH_NOTES" && !v.notes?.trim()) return false;

      // 4. Filtro de ruta
      if (routeFilter !== "ALL" && v.ruta !== routeFilter) return false;

      return true;
    });
  }, [visitas, filtro, selectedMotivo, evidenceFilter, routeFilter]);

  // Métricas rápidas calculadas
  const stats = useMemo(() => {
    const total = visitasFiltradas.length;
    const todayStr = new Date().toISOString().slice(0, 10);
    const hoyCount = visitasFiltradas.filter((v) => (v.fecha || "").startsWith(todayStr)).length;

    const uniqueClientsSet = new Set();
    visitasFiltradas.forEach((v) => {
      if (v.client_id) uniqueClientsSet.add(String(v.client_id));
      else if (v.client_code) uniqueClientsSet.add(String(v.client_code));
      else if (v.cliente_nombre) uniqueClientsSet.add(v.cliente_nombre);
    });

    const withPhotos = visitasFiltradas.filter((v) => v.photo_count > 0).length;
    const withNotes = visitasFiltradas.filter((v) => v.notes && v.notes.trim().length > 0).length;

    return {
      total,
      hoy: hoyCount,
      uniqueClients: uniqueClientsSet.size,
      withPhotos,
      withPhotosPct: total > 0 ? Math.round((withPhotos / total) * 100) : 0,
      withNotes
    };
  }, [visitasFiltradas]);

  // Exportar reporte ordenado
  const handleExportCSV = () => {
    if (visitasFiltradas.length === 0) return;
    const exportData = visitasFiltradas.map((v) => ({
      "ID Visita": v.id || "",
      "Cliente": v.cliente_nombre || "",
      "Código Cliente": v.client_code || "",
      "Ruta": v.ruta || "",
      "Fecha": v.fecha || "",
      "Hora": v.hora || "",
      "Motivo": v.motivo || "Visita",
      "Realizada Por": v.user_name || "",
      "Dirección": v.client_address || "",
      "Notas": (v.notes || "").replace(/[\r\n]+/g, " "),
      "Fotos Fachada": v.photo_fachada ? "Sí" : "No",
      "Fotos Interior": v.photo_interior ? "Sí" : "No",
      "Fotos Enfriador": v.photo_enfriador ? "Sí" : "No",
      "Total Fotos": v.photo_count || 0,
      "Latitud": v.lat || "",
      "Longitud": v.lng || "",
      "Fecha Creación": v.created_at || ""
    }));

    const filename = `visitas_${fromDate || "todas"}_${toDate || "todas"}.csv`;
    exportToCSV(exportData, filename);
  };

  const userRole = (usuario?.user_metadata?.rol || usuario?.user_metadata?.role || "").toLowerCase();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 space-y-6">
      {/* ── ENCABEZADO Y ACCIONES PRINCIPALES ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                Historial de Visitas
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-xs py-0.5">
                  Operación en Campo
                </Badge>
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Seguimiento geolocalizado de visitas a clientes, evidencias fotográficas y acuerdos comerciales.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Botón de recarga */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={loading || refreshing}
            className="border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-200"
            title="Actualizar datos"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin text-emerald-400" : ""}`} />
            Actualizar
          </Button>

          {/* Toggle de vistas: Tarjetas / Tabla */}
          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900 p-0.5">
            <button
              onClick={() => setViewMode("cards")}
              className={`p-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                viewMode === "cards" ? "bg-emerald-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
              }`}
              title="Vista en tarjetas"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tarjetas</span>
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                viewMode === "table" ? "bg-emerald-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
              }`}
              title="Vista en tabla"
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tabla</span>
            </button>
          </div>

          {/* Exportar a CSV */}
          {visitasFiltradas.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="border-emerald-600/40 bg-emerald-950/20 hover:bg-emerald-900/40 text-emerald-300"
            >
              <Download className="w-4 h-4 mr-1.5" />
              Exportar CSV ({visitasFiltradas.length})
            </Button>
          )}

          {/* Botón Nueva Visita (Modal elegante) */}
          {canCreateVisita(userRole) && (
            <Button
              size="sm"
              onClick={() => {
                setSelectedClientForNewVisit(null);
                setClientSearchQuery("");
                setIsNewVisitOpen(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Registrar Visita
            </Button>
          )}
        </div>
      </div>

      {/* ── TARJETAS DE INDICADORES (KPIs) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <Card className="bg-slate-900/70 border-slate-800 shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Visitas</p>
              <h3 className="text-2xl font-bold text-white mt-1">{stats.total}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">En el periodo seleccionado</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Calendar className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/70 border-slate-800 shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Visitas Hoy</p>
              <h3 className="text-2xl font-bold text-emerald-400 mt-1">{stats.hoy}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Registros del día actual</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Clock className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/70 border-slate-800 shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Puntos de Venta</p>
              <h3 className="text-2xl font-bold text-purple-400 mt-1">{stats.uniqueClients}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Clientes distintos atendidos</p>
            </div>
            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Store className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/70 border-slate-800 shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Con Fotos</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <h3 className="text-2xl font-bold text-amber-400">{stats.withPhotos}</h3>
                <span className="text-xs text-amber-400/80 font-medium">({stats.withPhotosPct}%)</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">Con evidencia fotográfica</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Camera className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/70 border-slate-800 shadow-md col-span-2 sm:col-span-1">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Con Acuerdos/Notas</p>
              <h3 className="text-2xl font-bold text-cyan-400 mt-1">{stats.withNotes}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Visitas con notas de campo</p>
            </div>
            <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <MessageSquare className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── BARRA DE FILTROS AVANZADOS ── */}
      <Card className="bg-slate-900/90 border-slate-800">
        <CardContent className="p-4 space-y-3.5">
          {/* Fila superior: Presets rápidos de fecha y selectores de fecha */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-slate-400 mr-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Periodo:
              </span>
              <button
                type="button"
                onClick={() => setPreset("hoy")}
                className="px-2.5 py-1 text-xs rounded-full border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => setPreset("ayer")}
                className="px-2.5 py-1 text-xs rounded-full border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                Ayer
              </button>
              <button
                type="button"
                onClick={() => setPreset("7")}
                className="px-2.5 py-1 text-xs rounded-full border border-emerald-500/40 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40 transition-colors"
              >
                Últimos 7 días
              </button>
              <button
                type="button"
                onClick={() => setPreset("mes")}
                className="px-2.5 py-1 text-xs rounded-full border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                Este mes
              </button>
              <button
                type="button"
                onClick={() => setPreset("todo")}
                className="px-2.5 py-1 text-xs rounded-full border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors"
              >
                Todo
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-700 rounded-lg px-2 py-1 text-xs">
                <span className="text-slate-400">Del:</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="bg-transparent text-slate-100 border-none outline-none text-xs"
                />
              </div>
              <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-700 rounded-lg px-2 py-1 text-xs">
                <span className="text-slate-400">Al:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="bg-transparent text-slate-100 border-none outline-none text-xs"
                />
              </div>
            </div>
          </div>

          {/* Fila inferior: Buscador global y filtros específicos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2.5 pt-2 border-t border-slate-800/80">
            {/* Buscador reactivo */}
            <div className="relative sm:col-span-2">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder="Buscar por cliente, código, ruta, asesor o notas..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="pl-9 bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500 h-9 text-xs"
              />
              {filtro && (
                <button
                  onClick={() => setFiltro("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filtro por Motivo */}
            <Select value={selectedMotivo} onValueChange={setSelectedMotivo}>
              <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-200 h-9 text-xs">
                <SelectValue placeholder="Motivo de Visita" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                <SelectItem value="ALL">Todos los motivos</SelectItem>
                {Object.keys(MOTIVO_CONFIG)
                  .filter((m) => m !== "Default")
                  .map((motivo) => (
                    <SelectItem key={motivo} value={motivo}>
                      {motivo}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            {/* Filtro por Evidencia */}
            <Select value={evidenceFilter} onValueChange={setEvidenceFilter}>
              <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-200 h-9 text-xs">
                <SelectValue placeholder="Evidencia" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                <SelectItem value="ALL">Cualquier evidencia</SelectItem>
                <SelectItem value="WITH_PHOTOS">Solo con fotos</SelectItem>
                <SelectItem value="WITH_NOTES">Solo con notas</SelectItem>
              </SelectContent>
            </Select>

            {/* Filtro por Ruta */}
            <Select value={routeFilter} onValueChange={setRouteFilter}>
              <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-200 h-9 text-xs">
                <SelectValue placeholder="Ruta" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                <SelectItem value="ALL">Todas las rutas</SelectItem>
                {availableRoutes.map((r) => (
                  <SelectItem key={r} value={r}>
                    Ruta {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── CUERPO PRINCIPAL: LISTADO DE VISITAS ── */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
          <p className="text-sm text-slate-400">Cargando bitácora de visitas y clientes...</p>
        </div>
      ) : visitasFiltradas.length === 0 ? (
        <Card className="bg-slate-900/60 border-slate-800 p-12 text-center">
          <div className="inline-flex p-4 rounded-full bg-slate-800/80 text-slate-400 mb-3">
            <Store className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold text-white">No se encontraron visitas</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mt-1">
            {filtro || selectedMotivo !== "ALL" || evidenceFilter !== "ALL" || routeFilter !== "ALL"
              ? "Prueba a cambiar o limpiar los filtros seleccionados para ver más resultados."
              : "No hay visitas registradas para el rango de fechas seleccionado."}
          </p>
          {(filtro || selectedMotivo !== "ALL" || evidenceFilter !== "ALL" || routeFilter !== "ALL") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFiltro("");
                setSelectedMotivo("ALL");
                setEvidenceFilter("ALL");
                setRouteFilter("ALL");
              }}
              className="mt-4 border-slate-700 text-slate-300"
            >
              Restablecer filtros
            </Button>
          )}
        </Card>
      ) : viewMode === "cards" ? (
        /* ── MODO TARJETAS (CARDS VIEW) ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visitasFiltradas.map((visita, idx) => {
            const motivoStyle = getMotivoStyle(visita.motivo);
            const dateStr = visita.fecha ? new Date(visita.fecha).toLocaleDateString("es-MX", {
              day: "numeric",
              month: "short",
              year: "numeric"
            }) : "Sin fecha";

            return (
              <div
                key={visita.id ? `${visita.id}-${idx}` : `visita-${idx}`}
                className="group relative flex flex-col justify-between bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 transition-all hover:shadow-xl hover:shadow-emerald-950/20"
              >
                {/* Cabecera de la tarjeta */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2.5 rounded-xl bg-slate-800 text-emerald-400 border border-slate-700/60 shrink-0 mt-0.5">
                        <Store className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-white text-base leading-tight truncate" title={visita.cliente_nombre}>
                          {visita.cliente_nombre}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          {visita.client_code && (
                            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              #{visita.client_code}
                            </span>
                          )}
                          <span className="text-[11px] font-medium text-slate-400">
                            Ruta: <b className="text-slate-200">{visita.ruta || "N/A"}</b>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Badge de motivo */}
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${motivoStyle.bg}`}
                    >
                      {visita.motivo || "Visita"}
                    </span>
                  </div>

                  {/* Dirección del cliente */}
                  {visita.client_address && (
                    <p className="text-xs text-slate-400 flex items-start gap-1.5 line-clamp-1" title={visita.client_address}>
                      <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-500 mt-0.5" />
                      {visita.client_address}
                    </p>
                  )}

                  {/* Extracto de notas de campo */}
                  {visita.notes ? (
                    <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        <MessageSquare className="w-3 h-3 text-emerald-400" />
                        Notas de visita:
                      </div>
                      <p className="line-clamp-2 italic text-slate-300/90 leading-relaxed">
                        "{visita.notes}"
                      </p>
                    </div>
                  ) : (
                    <div className="py-1">
                      <span className="text-[11px] text-slate-500 italic">Sin observaciones registradas</span>
                    </div>
                  )}

                  {/* Tira de fotos preview */}
                  {visita.photo_count > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <p className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1">
                        <Camera className="w-3 h-3 text-amber-400" />
                        Evidencias ({visita.photo_count}):
                      </p>
                      <div className="flex items-center gap-2">
                        {visita.photo_fachada && (
                          <button
                            type="button"
                            onClick={() => setFullPhotoUrl(visita.photo_fachada)}
                            className="relative group/photo overflow-hidden rounded-lg border border-slate-700 w-14 h-14 bg-slate-950"
                            title="Ver foto de fachada"
                          >
                            <img src={visita.photo_fachada} alt="Fachada" className="w-full h-full object-cover group-hover/photo:scale-110 transition-transform" />
                            <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[9px] text-white py-0.5 text-center">Fachada</span>
                          </button>
                        )}
                        {visita.photo_interior && (
                          <button
                            type="button"
                            onClick={() => setFullPhotoUrl(visita.photo_interior)}
                            className="relative group/photo overflow-hidden rounded-lg border border-slate-700 w-14 h-14 bg-slate-950"
                            title="Ver foto interior"
                          >
                            <img src={visita.photo_interior} alt="Interior" className="w-full h-full object-cover group-hover/photo:scale-110 transition-transform" />
                            <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[9px] text-white py-0.5 text-center">Interior</span>
                          </button>
                        )}
                        {visita.photo_enfriador && (
                          <button
                            type="button"
                            onClick={() => setFullPhotoUrl(visita.photo_enfriador)}
                            className="relative group/photo overflow-hidden rounded-lg border border-slate-700 w-14 h-14 bg-slate-950"
                            title="Ver foto enfriador"
                          >
                            <img src={visita.photo_enfriador} alt="Enfriador" className="w-full h-full object-cover group-hover/photo:scale-110 transition-transform" />
                            <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[9px] text-white py-0.5 text-center">Enfriador</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Pie de la tarjeta */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 font-medium text-slate-300">
                      <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                      {dateStr} {visita.hora ? `• ${visita.hora.slice(0, 5)}` : ""}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 truncate max-w-[180px]">
                      <User className="w-3 h-3 text-slate-500" />
                      {visita.user_name}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Botón mapa si tiene coordenadas */}
                    {visita.lat && visita.lng && (
                      <a
                        href={`https://www.google.com/maps?q=${visita.lat},${visita.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                        title="Ver ubicación en Google Maps"
                      >
                        <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                      </a>
                    )}

                    {/* Botón detalle completo */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedVisita(visita)}
                      className="border-slate-700 bg-slate-800/80 hover:bg-emerald-600 hover:border-emerald-600 hover:text-white text-slate-200 h-8 text-xs gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Detalle
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── MODO TABLA COMPACTA (TABLE VIEW) ── */
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/80">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Punto de Venta / Cliente</th>
                <th className="py-3 px-3">Fecha & Hora</th>
                <th className="py-3 px-3">Motivo</th>
                <th className="py-3 px-3">Ruta</th>
                <th className="py-3 px-3">Asesor</th>
                <th className="py-3 px-3">Evidencia</th>
                <th className="py-3 px-3">Notas</th>
                <th className="py-3 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {visitasFiltradas.map((v, idx) => {
                const motivoStyle = getMotivoStyle(v.motivo);
                return (
                  <tr key={v.id ? `${v.id}-${idx}` : `v-${idx}`} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{v.cliente_nombre}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {v.client_code ? `#${v.client_code}` : ""}
                        {v.client_address ? ` • ${v.client_address}` : ""}
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div>{v.fecha || "—"}</div>
                      <div className="text-[11px] text-slate-500">{v.hora?.slice(0, 5) || ""}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${motivoStyle.bg}`}>
                        {v.motivo || "Visita"}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-200">
                      {v.ruta || "—"}
                    </td>
                    <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                      {v.user_name}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        {v.photo_count > 0 && (
                          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 bg-amber-500/10">
                            {v.photo_count} fotos
                          </Badge>
                        )}
                        {v.lat && v.lng && (
                          <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-400 bg-blue-500/10">
                            GPS
                          </Badge>
                        )}
                        {v.photo_count === 0 && !v.lat && (
                          <span className="text-slate-500 text-[11px]">—</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 max-w-[200px] truncate italic text-slate-400" title={v.notes}>
                      {v.notes || "—"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedVisita(v)}
                        className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30 text-xs h-7 px-2"
                      >
                        Ver Detalle
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MODAL DETALLE DE VISITA ── */}
      <Dialog open={!!selectedVisita} onOpenChange={(open) => !open && setSelectedVisita(null)}>
        <DialogContent className="max-w-2xl bg-slate-900 border-slate-800 text-slate-100 max-h-[85vh] overflow-y-auto">
          <DialogHeader className="border-b border-slate-800 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                  <Store className="w-5 h-5 text-emerald-400" />
                  {selectedVisita?.cliente_nombre}
                </DialogTitle>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                  {selectedVisita?.client_code && <span>Código: <b>#{selectedVisita.client_code}</b></span>}
                  <span>•</span>
                  <span>Ruta: <b>{selectedVisita?.ruta || "N/A"}</b></span>
                  <span>•</span>
                  <span>Fecha: <b>{selectedVisita?.fecha} {selectedVisita?.hora ? `(${selectedVisita.hora})` : ""}</b></span>
                </p>
              </div>

              {selectedVisita?.motivo && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${getMotivoStyle(selectedVisita.motivo).bg}`}>
                  {selectedVisita.motivo}
                </span>
              )}
            </div>
          </DialogHeader>

          {selectedVisita && (
            <div className="space-y-4 py-2">
              {/* Bloque de Información del Asesor & Ubicación */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Realizada por:</span>
                  <p className="text-slate-200 font-medium text-sm mt-0.5">{selectedVisita.user_name}</p>
                  {selectedVisita.user_role && <p className="text-slate-400 text-[11px] capitalize">{selectedVisita.user_role}</p>}
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Dirección de Entrega:</span>
                  <p className="text-slate-200 mt-0.5">{selectedVisita.client_address || "Sin dirección registrada"}</p>
                </div>
              </div>

              {/* Geolocalización GPS */}
              {selectedVisita.lat && selectedVisita.lng && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/30 text-xs text-emerald-300">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Ubicación verificada en campo: <b>{Number(selectedVisita.lat).toFixed(5)}, {Number(selectedVisita.lng).toFixed(5)}</b>
                    </span>
                  </div>
                  <a
                    href={`https://www.google.com/maps?q=${selectedVisita.lat},${selectedVisita.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-emerald-400 hover:text-emerald-300 hover:underline"
                  >
                    Abrir en Maps <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              {/* Notas y acuerdos */}
              {selectedVisita.notes && (
                <div className="space-y-1.5">
                  <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                    Notas y Acuerdos de la Visita:
                  </h5>
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm whitespace-pre-line leading-relaxed">
                    {selectedVisita.notes}
                  </div>
                </div>
              )}

              {/* Galería de fotos */}
              {(selectedVisita.photo_fachada || selectedVisita.photo_interior || selectedVisita.photo_enfriador) ? (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-amber-400" />
                    Evidencia Fotográfica Capturada:
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {selectedVisita.photo_fachada && (
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => setFullPhotoUrl(selectedVisita.photo_fachada)}
                          className="w-full h-44 rounded-xl overflow-hidden border border-slate-700 bg-black group relative"
                        >
                          <img src={selectedVisita.photo_fachada} alt="Fachada" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold gap-1">
                            <Eye className="w-4 h-4" /> Ampliar
                          </div>
                        </button>
                        <p className="text-center text-[11px] text-slate-400 font-medium">Fachada del Negocio</p>
                      </div>
                    )}

                    {selectedVisita.photo_interior && (
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => setFullPhotoUrl(selectedVisita.photo_interior)}
                          className="w-full h-44 rounded-xl overflow-hidden border border-slate-700 bg-black group relative"
                        >
                          <img src={selectedVisita.photo_interior} alt="Interior" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold gap-1">
                            <Eye className="w-4 h-4" /> Ampliar
                          </div>
                        </button>
                        <p className="text-center text-[11px] text-slate-400 font-medium">Interior / Exhibición</p>
                      </div>
                    )}

                    {selectedVisita.photo_enfriador && (
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => setFullPhotoUrl(selectedVisita.photo_enfriador)}
                          className="w-full h-44 rounded-xl overflow-hidden border border-slate-700 bg-black group relative"
                        >
                          <img src={selectedVisita.photo_enfriador} alt="Enfriador" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold gap-1">
                            <Eye className="w-4 h-4" /> Ampliar
                          </div>
                        </button>
                        <p className="text-center text-[11px] text-slate-400 font-medium">Enfriador Cervecero</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-dashed border-slate-800 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Camera className="w-4 h-4 text-slate-600" />
                  <span>Esta visita no cuenta con evidencia fotográfica registrada.</span>
                </div>
              )}

              {/* Timestamp de creación */}
              <div className="pt-2 text-right text-[11px] text-slate-500">
                Registrado en sistema: {selectedVisita.created_at ? new Date(selectedVisita.created_at).toLocaleString("es-MX") : "—"}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── MODAL VISOR DE FOTO COMPLETA ── */}
      <Dialog open={!!fullPhotoUrl} onOpenChange={(open) => !open && setFullPhotoUrl(null)}>
        <DialogContent className="max-w-4xl bg-black/95 border-slate-800 p-2">
          <div className="relative flex flex-col items-center">
            {fullPhotoUrl && (
              <img
                src={fullPhotoUrl}
                alt="Evidencia en alta resolución"
                className="max-h-[85vh] w-auto object-contain rounded-lg shadow-2xl"
              />
            )}
            <div className="mt-2 flex items-center justify-between w-full px-2 text-xs text-slate-400">
              <span>Evidencia fotográfica</span>
              <a
                href={fullPhotoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline flex items-center gap-1"
              >
                Abrir en pestaña nueva <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── MODAL REGISTRAR VISITA (NUEVA VISITA) ── */}
      <Dialog open={isNewVisitOpen} onOpenChange={setIsNewVisitOpen}>
        <DialogContent className="max-w-3xl bg-slate-900 border-slate-800 text-slate-100 max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-slate-800 pb-3">
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" />
              Registrar Nueva Visita
            </DialogTitle>
          </DialogHeader>

          {!selectedClientForNewVisit ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Buscar cliente a visitar:
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Escribe el nombre o código del cliente..."
                    value={clientSearchQuery}
                    onChange={(e) => handleSearchClients(e.target.value)}
                    className="pl-9 bg-slate-950 border-slate-700 text-slate-100"
                    autoFocus
                  />
                  {searchingClients && (
                    <RefreshCw className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 animate-spin" />
                  )}
                </div>
              </div>

              {/* Resultados de búsqueda */}
              {clientSearchResults.length > 0 && (
                <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800 max-h-60 overflow-y-auto bg-slate-950">
                  {clientSearchResults.map((c, idx) => (
                    <button
                      key={c.id || c.client_code ? `${c.id || c.client_code}-${idx}` : `client-${idx}`}
                      type="button"
                      onClick={() => setSelectedClientForNewVisit(c)}
                      className="w-full p-3 text-left hover:bg-slate-800/60 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-white text-sm">
                          {c.business_name || c.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          {c.client_code ? `#${c.client_code} • ` : ""}
                          Ruta {c.sales_route || c.internal_route || "Sin ruta"}
                          {c.address ? ` • ${c.address}` : ""}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </button>
                  ))}
                </div>
              )}

              <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
                <Button
                  variant="ghost"
                  onClick={() => setIsNewVisitOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  Cancelar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setSelectedClientForNewVisit({ name: "Cliente Express" })}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Continuar sin asociar cliente
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-2">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 mb-4 text-xs">
                <div>
                  <span className="text-slate-400">Cliente seleccionado:</span>
                  <div className="font-semibold text-white text-sm">
                    {selectedClientForNewVisit.business_name || selectedClientForNewVisit.name}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedClientForNewVisit(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Cambiar cliente
                </Button>
              </div>

              <VisitForm
                client={selectedClientForNewVisit}
                onSave={() => {
                  globalVisitsCache = { data: null, timestamp: 0, params: null };
                  setIsNewVisitOpen(false);
                  setSelectedClientForNewVisit(null);
                  fetchData(true);
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
