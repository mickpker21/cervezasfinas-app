import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import InteractiveMap from '@/components/common/InteractiveMap';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '../supabaseClient';
import { Helmet } from 'react-helmet-async';
import { getTodayMexico } from '@/lib/dateUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import VisitForm from '@/components/VisitForm';
import ClientVisitsList from '@/components/ClientVisitsList';
import ClientEvaluationsList from '@/components/ClientEvaluationsList';
import { Camera, Edit, MapPin, Plus, Eye, User, Building2, Phone, Tag, TruckIcon, Snowflake, FileText, Star, Activity, Hash, DownloadCloud, UploadCloud, Download, CheckSquare, Settings2, Share2, Upload, RefreshCw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BarcodeScanner from 'react-qr-barcode-scanner';
import SalesDialog from '@/components/SalesDialog';
import VirtualizedList from '@/components/common/VirtualizedList';
import { getClientsPaged, getClients, getClientByCode, createClient, updateClient } from '@/repositories/clientsRepository';
import { getSalesBySku } from '@/repositories/salesRepository';
import { fetchVentasPorSku } from '../lib/mysqlVentasPorSku';
import { getVisitsByClients } from '@/repositories/visitsRepository';
import { generateClientPdf } from '@/lib/pdfGenerator';
import { getCurrentPositionSafe } from '@/lib/geolocation';
import { Capacitor } from '@capacitor/core';

// (Opcional) Endpoint de backend, si se usa
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const VIRTUALIZATION_THRESHOLD = 500; // Usar virtualización si hay más de 500 clientes

/* ─────────────────────────────────────────────────────────────
   PREMIUM CLIENT CARD
   ───────────────────────────────────────────────────────────── */
const LEVEL_STYLES = {
  ORO: { bg: 'from-yellow-500/20 to-amber-600/10', badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', icon: '🥇' },
  PLATA: { bg: 'from-slate-400/20 to-gray-500/10', badge: 'bg-slate-400/20 text-slate-300 border-slate-400/30', icon: '🥈' },
  BRONCE: { bg: 'from-amber-700/20 to-orange-800/10', badge: 'bg-amber-700/20 text-amber-300 border-amber-600/30', icon: '🥉' },
  PLATINO: { bg: 'from-cyan-400/20 to-blue-500/10', badge: 'bg-cyan-400/20 text-cyan-200 border-cyan-400/30', icon: '💎' },
  TITANIO: { bg: 'from-blue-500/20 to-indigo-600/10', badge: 'bg-blue-500/20 text-blue-200 border-blue-400/30', icon: '⚡' },
};

function ClientCard({ client, avgSales3m, isControlInterno, isConquista, isSupervisor, setVisitClient, setSalesClient, updateClientCoords, navigate }) {
  const level = LEVEL_STYLES[(client.level || '').toUpperCase()] || LEVEL_STYLES.BRONCE;
  const initials = ((client.business_name || client.name || '?').trim().split(' ').slice(0, 2).map(w => w[0]).join('')).toUpperCase();
  const sales = avgSales3m?.[client.id];
  let coords = null;
  try { coords = typeof client.coords === 'string' ? JSON.parse(client.coords) : client.coords; } catch { }
  const lat = coords?.lat ?? coords?.[0];
  const lng = coords?.lng ?? coords?.[1];

  const evalUrl = `/evaluaciones/nueva?clientId=${encodeURIComponent(client.id)}&client_code=${encodeURIComponent(client.client_code || '')}&name=${encodeURIComponent(client.name || '')}&pv=${encodeURIComponent(client.business_name || client.name || '')}&nivel=${encodeURIComponent(client.level || client.type || '')}`;

  const handleEvaluationClick = async () => {
    if (lat && lng) {
      navigate(evalUrl);
    } else {
      const confirmed = window.confirm("El cliente no tiene coordenadas GPS. ¿Deseas capturar su ubicación actual para abrir la evaluación?");
      if (confirmed) {
        const newCoords = await updateClientCoords(client);
        if (newCoords) {
          navigate(evalUrl);
        }
      }
    }
  };

  return (
    <div className={`relative flex flex-col w-full rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/80 backdrop-blur-sm shadow-xl transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-emerald-900/30 hover:shadow-2xl overflow-hidden`}>
      {/* Accent gradient strip */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${level.bg.replace('/20', '/60').replace('/10', '/40')}`} />

      {/* Header */}
      <div className="flex items-start gap-3 p-4 pb-3">
        {/* Avatar (hides on small screens to save space) */}
        <div className={`hidden sm:flex flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br ${level.bg} border border-white/10 items-center justify-center text-white font-bold text-sm select-none`}>
          {initials}
        </div>

        {/* Name block */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm leading-tight break-words whitespace-normal line-clamp-3">
            {client.business_name || client.name}
          </p>
          {client.business_name && client.name && (
            <p className="text-slate-400 text-xs break-words whitespace-normal line-clamp-2 mt-0.5">
              {client.name}
            </p>
          )}
          {/* Code */}
          {client.client_code && (
            <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-mono text-slate-400 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 break-all max-w-full">
              <Hash className="w-2.5 h-2.5 flex-shrink-0" />
              <span className="truncate">{client.client_code}</span>
            </span>
          )}
        </div>

        {/* Level badge (shows only icon on small screens, full text on sm+) */}
        {client.level && (
          <span className={`inline-flex flex-shrink-0 text-[10px] items-center justify-center font-bold px-2 py-0.5 rounded-full border ${level.badge} uppercase tracking-wide`}>
            {level.icon} <span className="hidden sm:inline ml-1">{client.level}</span>
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-white/5" />

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-2 px-4 py-3">
        {sales !== undefined && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1.5 flex flex-col items-center justify-center">
            <p className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider truncate w-full text-center">Venta</p>
            <p className="text-sm font-bold text-white font-mono truncate w-full text-center">
              {sales ? `${Number(sales).toLocaleString('es-MX', { maximumFractionDigits: 1 })} HL` : '—'}
            </p>
          </div>
        )}
        {client.sales_route && (
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-2 py-1.5 flex flex-col items-center justify-center">
            <p className="text-[10px] text-indigo-300 font-medium uppercase tracking-wider truncate w-full text-center">Ruta</p>
            <p className="text-sm font-bold text-white truncate w-full text-center">{client.sales_route}</p>
          </div>
        )}
        {client.exclusivity && (
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg px-2 py-1.5 flex flex-col items-center justify-center">
            <p className="text-[10px] text-purple-300 font-medium uppercase tracking-wider truncate w-full text-center">Cond</p>
            <p className="text-xs font-bold text-white truncate w-full text-center">{client.exclusivity}</p>
          </div>
        )}
      </div>

      {/* Address */}
      {
        client.address && (
          <div className="flex items-start gap-1.5 px-4 pb-2">
            <MapPin className="w-3 h-3 text-slate-500 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">{client.address}</p>
          </div>
        )
      }

      {/* Visits / Evaluations */}
      <div className="px-4 pb-2">
        {isControlInterno ? (
          <ClientEvaluationsList client={client} />
        ) : (
          <ClientVisitsList clientId={client.id} clientCode={client.client_code} />
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-1.5 px-4 py-3 border-t border-white/5 bg-white/[0.02] flex-wrap justify-between sm:justify-start">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Maps */}
          {lat && lng && (
            <button
              title="Ver en Google Maps"
              className="p-1.5 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-sky-500/10 transition-colors"
              onClick={() => window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank')}
            >
              <MapPin className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Ver detalle */}
          <Link to={`/clients/${encodeURIComponent(client.id)}`}>
            <button className="p-1.5 rounded-lg text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors" title="Ver detalle">
              <Eye className="w-3.5 h-3.5" />
            </button>
          </Link>

          {/* Simulador */}
          {isConquista && (
            <button
              title="Simulador"
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
              onClick={() => navigate(`/conquista/clientes/${client.id}/simulator`)}
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Evaluar (Icono) - Solo si no es el botón principal */}
          {(!isConquista && !isSupervisor && !isControlInterno) && (
            <button
              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
              title="Evaluar"
              onClick={handleEvaluationClick}
            >
              <Star className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Spacer (hidden on mobile where buttons wrap) */}
        <div className="hidden sm:block flex-1" />

        <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0 justify-end">
          {/* Visitas / Evaluar — primary button */}
          {!isSupervisor && (
            isControlInterno ? (
              <button
                className="px-4 py-1.5 text-xs sm:text-[11px] font-bold rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors shadow-sm shadow-amber-900/40 flex-1 sm:flex-none text-center"
                onClick={handleEvaluationClick}
              >
                Evaluar
              </button>
            ) : (
              <button
                className="px-4 py-1.5 text-xs sm:text-[11px] font-bold rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors shadow-sm shadow-violet-900/40 flex-1 sm:flex-none text-center"
                onClick={() => setVisitClient(client)}
              >
                Visitas
              </button>
            )
          )}

          {/* Ventas — primary button */}
          <button
            className="px-4 py-1.5 text-xs sm:text-[11px] font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white transition-colors shadow-sm shadow-emerald-900/40 flex-1 sm:flex-none text-center"
            onClick={() => setSalesClient({ ...client, name: client.name || client.business_name || '' })}
          >
            Ventas
          </button>
        </div>
      </div>
    </div >
  );
}


async function updateUserMetadata({ user_id, type, route }) {
  try {
    const res = await fetch(`${API_BASE}/api/update-user-metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, type, route }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error actualizando usuario');
    return data;
  } catch (err) {
    console.error('Error actualizando user_metadata:', err);
    throw err;
  }
}

export default function ClientsPage() {
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useSupabaseAuth();

  // Roles
  const userType = (user?.user_metadata?.type || '').toLowerCase();
  const isJefeControlInterno = userType === 'jefe-control-interno' || userType === 'jefe control interno';
  const isControlInterno = userType === 'control-interno' || userType === 'control interno';
  const isConquista = userType === 'conquista';
  const isConcesion = userType === 'concesion';
  const isSupervisor = userType === 'supervisor';
  const navigate = useNavigate();

  // Estado principal
  const [clients, setClients] = useState([]);
  const [profileRoute, setProfileRoute] = useState(null); // route tomada de profiles.route (fuente de verdad)
  const [avgSales3m, setAvgSales3m] = useState({});
  const [lastVisitReason, setLastVisitReason] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [zonaFilter, setZonaFilter] = useState('');
  const [internalRouteFilter, setInternalRouteFilter] = useState('');
  const [salesRouteFilter, setSalesRouteFilter] = useState('');
  const [availableZones, setAvailableZones] = useState([]);
  const [availableInternalRoutes, setAvailableInternalRoutes] = useState([]);
  const [availableSalesRoutes, setAvailableSalesRoutes] = useState([]);

  // Paginación (no aplica a Conquista ni a Concesión AHORA)
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Formulario agregar/editar
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);

  // Normalizador de rutas (consistencia)
  const norm = useCallback((s) => (s || '').toString().trim().toUpperCase(), []);

  // Resuelve la ruta del usuario (profiles.route > user_metadata.route)
  const resolvedRoute = useMemo(() => {
    const r = (profileRoute ?? user?.user_metadata?.route ?? '').toString().trim();
    return r;
  }, [profileRoute, user]);

  // Sincronizar newClient con editingClient al abrir el diálogo
  useEffect(() => {
    if (editingClient) {
      setNewClient({
        client_code: editingClient.client_code || '',
        name: editingClient.name || '',
        business_name: editingClient.business_name || '',
        client_type: editingClient.client_type || editingClient.type || '',
        address: editingClient.address || '',
        level: editingClient.level || '',
        exclusivity: editingClient.exclusivity || '',
        internal_route: editingClient.internal_route || '',
        sales_route: editingClient.sales_route || '',
        phone: editingClient.phone || '',
        coords: editingClient.coords || { lat: '', lng: '' },
        comments: editingClient.comments || '',
        cooler_serials: Array.isArray(editingClient.cooler_serials) ? editingClient.cooler_serials : [],
        visit_days: editingClient.visit_days ? String(editingClient.visit_days).split(',') : [],
        visit_day_televenta: editingClient.visit_day_televenta ? String(editingClient.visit_day_televenta).split(',') : [],
        zona_comercial: editingClient.zona_comercial || '',
        region: editingClient.region || '',
      });
    }
  }, [editingClient]);

  const [newClient, setNewClient] = useState({
    client_code: '',
    name: '',
    business_name: '',
    client_type: '',
    address: '', // Calle
    cross_street: '',
    exterior_number: '',
    interior_number: '',
    colony: '',
    postal_code: '',
    city: 'Puebla',
    state: 'Puebla',
    reference: '',
    level: '',
    exclusivity: '',
    internal_route: user?.user_metadata?.route || '',
    sales_route: '',
    phone: '',
    email: '',
    coords: { lat: '', lng: '' },
    comments: '',
    visit_days: [],
    visit_day_televenta: [],
    cooler_serials: [],
    // Fiscal
    rfc: '',
    fiscal_name: '',
    fiscal_address: '',
    fiscal_colony: '',
    fiscal_postal_code: '',
    cedula_ieps: '',
    // Sales Config
    sales_modality: '',
    ritmo: '',
    // Zona
    zona_comercial: '',
    region: '',
  });

  // Carga automática de internal_route/sales_route en el formulario cuando abres el diálogo
  // Carga automática de internal_route/sales_route en el formulario usando detección robusta (Offline-Safe)
  useEffect(() => {
    const fetchProfileRouteForForm = async () => {
      if (isAddDialogOpen && user) {
        try {
          // Use the centralized robust detection (KV Cache -> Online -> Metadata -> Local DB)
          const { detectUserRoute } = await import('@/repositories/routeRepository');
          const route = await detectUserRoute(user);

          if (route) {
            setNewClient((prev) => ({
              ...prev,
              internal_route: prev.internal_route || route,
              // sales_route is NOT auto-filled — user must enter it manually
            }));
            console.log('[ClientsPage] 📍 Ruta detectada para formulario (Offline Safe):', route);
          }
        } catch (err) {
          console.warn('[ClientsPage] Error detectando ruta para formulario:', err);
          // Fallback final a metadata
          const fallback = user?.user_metadata?.route || '';
          if (fallback) {
            setNewClient(prev => ({ ...prev, internal_route: prev.internal_route || fallback }));
          }
        }
      }
    };
    fetchProfileRouteForForm();
  }, [isAddDialogOpen, user, isConcesion]);

  // Carga de profileRoute (fuente de verdad para Conquista y Concesión)
  useEffect(() => {
    const loadProfileRoute = async () => {
      if (user && (isConquista || isConcesion)) {
        try {
          const { data, error } = await supabase.from('profiles').select('route').eq('id', user.id).single();
          const route = (!error && data?.route) ? data.route : (user?.user_metadata?.route || null);
          setProfileRoute(route);
        } catch (err) {
          setProfileRoute(user?.user_metadata?.route || null);
        }
      }
    };
    loadProfileRoute();
  }, [user, isConquista, isConcesion]);



  // Debounce para el término de búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reiniciar página al cambiar cualquier filtro o término de búsqueda (Debounced)
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchTerm, zonaFilter, internalRouteFilter, salesRouteFilter]);

  // Fetch de clientes
  const fetchClients = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Use stable primitives inside the callback so the dep array doesn't
    // change when Supabase rebuilds the session object on tab focus
    const userId = user.id;
    const metaType = user?.user_metadata?.type || '';

    try {
      const isAdminLike = isJefeControlInterno || userType === 'admin' || metaType === 'Administrador';
      const q = (debouncedSearchTerm || '').trim();

      const filters = {};
      if (q) filters.search = q;

      let data = [];
      let count = 0;

      if (isAdminLike) {
        // Admin: all clients + filters
        const res = await getClientsPaged({ 
          page, 
          pageSize: PAGE_SIZE, 
          filters: { 
            ...filters,
            zona: zonaFilter,
            internal_route: internalRouteFilter,
            sales_route: salesRouteFilter
          } 
        });
        data = res.data;
        count = res.count;

      } else if (isSupervisor) {
        // Supervisor: rutas permitidas - OFFLINE SAFE
        const { getAllowedRoutes } = await import('@/repositories/metadataRepository');
        const allowed = await getAllowedRoutes(userId);
        const routes = allowed.internal || [];
        const salesRoutes = allowed.sales || [];

        if (routes.length === 0 && salesRoutes.length === 0) {
          setClients([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }

        filters.internal_routes = routes;
        filters.sales_routes = salesRoutes;

        const res = await getClientsPaged({ page, pageSize: PAGE_SIZE, filters });
        data = res.data;
        count = res.count;
      } else if (isControlInterno) {
        // Control Interno: misma lógica que Supervisor - rutas permitidas desde BD
        const { getAllowedRoutes } = await import('@/repositories/metadataRepository');
        const allowed = await getAllowedRoutes(userId);
        const routes = allowed.internal || [];
        const salesRoutes = allowed.sales || [];

        const metaRoute = user?.user_metadata?.route || null;
        const metaZona  = user?.user_metadata?.zona  || null;

        const hasDbRoutes   = routes.length > 0 || salesRoutes.length > 0;
        const hasMetaRoutes = !!metaRoute || !!metaZona;

        if (hasDbRoutes) {
          // Tiene rutas asignadas en BD → filtrar igual que supervisor
          filters.internal_routes = routes;
          filters.sales_routes    = salesRoutes;
        } else if (hasMetaRoutes) {
          // Fallback: ruta/zona del perfil
          if (metaRoute) filters.internal_route = metaRoute;
          if (metaZona)  filters.zona = metaZona;
        }
        // Si no tiene nada asignado, no agrega filtros y trae todos (como admin)
        // Esto es un fallback temporal hasta que el admin asigne rutas al usuario

        const res = await getClientsPaged({ page, pageSize: PAGE_SIZE, filters });
        data = res.data;
        count = res.count;

      } else if (isConquista) {
        // Use Robust Route Detection
        const { detectUserRoute } = await import('@/repositories/routeRepository');
        const route = await detectUserRoute(user);

        if (!route) {
          setClients([]); setTotalCount(0); setLoading(false); return;
        }
        filters.internal_route = route;
        const res = await getClientsPaged({ page, pageSize: PAGE_SIZE, filters });
        data = res.data;
        count = res.count;

      } else if (isConcesion) {
        // Use Robust Route Detection
        const { detectUserRoute } = await import('@/repositories/routeRepository');
        const route = await detectUserRoute(user);

        if (!route) {
          setClients([]); setTotalCount(0); setLoading(false); return;
        }
        // "sales_route" parameter in PHP handles (sales_route OR internal_route) logic
        filters.sales_route = route;
        const res = await getClientsPaged({ page, pageSize: PAGE_SIZE, filters });
        data = res.data;
        count = res.count;

      } else {
        // Default: By Owner ID
        filters.owner_id = userId;
        const res = await getClientsPaged({ page, pageSize: PAGE_SIZE, filters });
        data = res.data;
        count = res.count;
      }

      setClients(data);
      setTotalCount(count ?? 0);

    } catch (e) {
      console.error('Error fetching clients:', e);
    } finally {
      setLoading(false);
    }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.user_metadata?.type, page, debouncedSearchTerm, zonaFilter, internalRouteFilter, salesRouteFilter, isControlInterno, isConquista, isConcesion, isSupervisor, userType]);
  // Note: page is still in deps for other user types (Admin, Supervisor, Concesión)

  // Carga de clientes cuando cambian dependencias relevantes
  useEffect(() => { fetchClients(); }, [fetchClients]);

  // Cargar lista de rutas y zonas disponibles para los filtros (Admin/Control Interno)
  useEffect(() => {
    if (!(userType === 'admin' || userType === 'administrador' || isControlInterno || isSupervisor)) return;

    const fetchFilterMetadata = async () => {
      try {

        // 1. Obtener Zonas desde 'zonas_rutas' (Supabase)
        const { data: zonasData, error: zonasError } = await supabase
          .from('zonas_rutas')
          .select('zona')
          .limit(1000);

        let zones = [];
        if (!zonasError && zonasData) {
           zones = Array.from(new Set(zonasData.map(z => (z.zona || '').trim().toUpperCase()).filter(Boolean))).sort();
        }

        // 2. Obtener Rutas disponibles desde routeRepository (Local SQLite)
        const { getAvailableRoutes } = await import('@/repositories/routeRepository');
        const available = await getAvailableRoutes();
        
        const iRoutes = Array.from(new Set((available?.internal || []).map(r => r.toUpperCase()))).sort();
        const sRoutes = Array.from(new Set((available?.sales || []).map(r => r.toUpperCase()))).sort();
        
        setAvailableZones(zones);
        setAvailableInternalRoutes(iRoutes);
        setAvailableSalesRoutes(sRoutes);
        
      } catch (err) {
        console.error('[ClientsPage] Error fetching filter metadata:', err);
      }
    };

    fetchFilterMetadata();
  }, [userType, isControlInterno, isSupervisor]);

  // Último motivo de visita por cliente
  useEffect(() => {
    const loadLastReasons = async () => {
      if (!clients || clients.length === 0) { setLastVisitReason({}); return; }
      const ids = clients.map((c) => c.id).filter(Boolean);
      if (ids.length === 0) { setLastVisitReason({}); return; }

      const chunkSize = 100;
      const allRows = [];
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        try {
          const { data, error } = await supabase
            .from('visitas')
            .select('client_id, motivo, created_at')
            .in('client_id', chunk)
            .order('created_at', { ascending: false });
          if (error) { console.error('Error visitas chunk (last reason):', error); continue; }
          if (data && data.length) allRows.push(...data);
        } catch (e) {
          console.error('Exception fetching visitas chunk (last reason):', e);
        }
      }

      allRows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const map = {};
      (allRows || []).forEach((r) => { if (!map[r.client_id]) map[r.client_id] = r.motivo || ''; });
      setLastVisitReason(map);
    };
    loadLastReasons();
  }, [clients]);

  // Promedio de ventas 3 meses
  useEffect(() => {
    const loadAverages = async () => {
      if (!clients || clients.length === 0) { setAvgSales3m({}); return; }
      const ids = clients.map((c) => c.id).filter(Boolean);
      if (ids.length === 0) { setAvgSales3m({}); return; }

      // últimos 3 primeros-de-mes (incluyendo el mes actual)
      const months = [];
      const d = new Date();
      for (let i = 0; i < 3; i++) {
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const first = `${y}-${String(m).padStart(2, '0')}-01`;
        months.push(first);
        d.setMonth(d.getMonth() - 1);
      }

      const allRows = [];
      try {
        const mysqlVentas = await fetchVentasPorSku() || [];
        // Filtramos por cliente y por periodo
        const filtered = mysqlVentas.filter(v => ids.includes(v.client_id) && months.includes(v.period_date));
        allRows.push(...filtered);
      } catch (e) {
        console.error('Exception fetching ventas_por_sku for clients:', e);
      }

      const sumByClient = {};
      (allRows || []).forEach((r) => { sumByClient[r.client_id] = (sumByClient[r.client_id] || 0) + Number(r.htls_total || 0); });
      const res = {};
      ids.forEach((id) => { res[id] = (sumByClient[id] || 0) / 3; });
      setAvgSales3m(res);
    };
    loadAverages();
  }, [clients]);

  // Código de cliente: validación en vivo (debounce)
  const [isCodeChecking, setIsCodeChecking] = useState(false);
  const [isCodeDuplicate, setIsCodeDuplicate] = useState(false);
  const codeCheckTimer = useRef(null);

  useEffect(() => {
    const code = (newClient.client_code || '').trim();
    if (!code) { setIsCodeDuplicate(false); return; }

    setIsCodeChecking(true);
    if (codeCheckTimer.current) window.clearTimeout(codeCheckTimer.current);

    codeCheckTimer.current = window.setTimeout(async () => {
      try {
        const existing = await getClientByCode(code);
        if (existing && existing.id) {
          // Duplicate only if it belongs to a DIFFERENT client
          // Compare both id and client_code as strings to handle format mismatches
          const sameById = String(existing.id) === String(editingClient?.id);
          const sameByCode = existing.client_code && editingClient?.client_code &&
            String(existing.client_code).trim() === String(editingClient.client_code).trim();
          setIsCodeDuplicate(!(sameById || sameByCode));
        } else {
          setIsCodeDuplicate(false);
        }
      } catch (e) {
        setIsCodeDuplicate(false);
      } finally {
        setIsCodeChecking(false);
      }
    }, 400);

    return () => { if (codeCheckTimer.current) window.clearTimeout(codeCheckTimer.current); };
  }, [newClient.client_code, editingClient]);

  // Fotos de cliente
  const [clientPhotos, setClientPhotos] = useState({});
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [currentPhotoType, setCurrentPhotoType] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Cargar fotos al editar
  useEffect(() => {
    const fetchPhotos = async () => {
      if (editingClient?.id) {
        const { data, error } = await supabase
          .from('client_photos')
          .select('photo_type, photo_url')
          .eq('client_id', editingClient.id);
        if (!error && data) {
          const obj = {};
          data.forEach((p) => { obj[p.photo_type] = p.photo_url; });
          setClientPhotos(obj);
        } else setClientPhotos({});
      } else {
        setClientPhotos({});
      }
    };
    fetchPhotos();
  }, [editingClient]);

  const uploadClientPhoto = async (clientId, photoType, dataUrl) => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const fileName = `client_${clientId}_${photoType}_${uuidv4()}.jpg`;
    const { data: storageData, error: storageError } = await supabase.storage
      .from('client-photos')
      .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
    if (storageError) {
      toast({ title: 'Error subiendo foto', description: storageError.message, variant: 'destructive' });
      return;
    }
    const { data: urlData } = supabase.storage.from('client-photos').getPublicUrl(fileName);
    const photoUrl = urlData.publicUrl;
    await supabase.from('client_photos').upsert(
      { client_id: clientId, photo_type: photoType, photo_url: photoUrl, created_at: new Date().toISOString() },
      { onConflict: ['client_id', 'photo_type'] }
    );
    setClientPhotos((prev) => ({ ...prev, [photoType]: photoUrl }));
    toast({ title: 'Foto guardada', description: `Foto de ${photoType} actualizada.` });
  };

  const startCamera = async (photoType) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsCameraOpen(true);
      setCurrentPhotoType(photoType);
    } catch (err) {
      toast({ title: 'Error de cámara', description: 'No se pudo acceder a la cámara.', variant: 'destructive' });
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
    }
    setIsCameraOpen(false);
    setCurrentPhotoType(null);
  };

  const takePicture = async () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      const dataUrl = canvas.toDataURL('image/jpeg');
      stopCamera();
      if (editingClient?.id && currentPhotoType) {
        await uploadClientPhoto(editingClient.id, currentPhotoType, dataUrl);
      } else {
        toast({ title: 'Primero guarda el cliente', description: 'Debes guardar el cliente antes de subir fotos.', variant: 'destructive' });
      }
    }
  };

  // Edición deshabilitada para esta vista
  const canEdit = false;

  const resetForm = () => {
    setNewClient({
      client_code: '',
      name: '',
      business_name: '',
      client_type: '',
      address: '',
      cross_street: '',
      exterior_number: '',
      interior_number: '',
      colony: '',
      postal_code: '',
      city: 'Puebla',
      state: 'Puebla',
      reference: '',
      level: '',
      exclusivity: '',
      internal_route: user?.user_metadata?.route || '',
      sales_route: '',
      phone: '',
      email: '',
      coords: { lat: '', lng: '' },
      comments: '',
      visit_days: [],
      visit_day_televenta: [],
      cooler_serials: [],
      rfc: '',
      fiscal_name: '',
      fiscal_address: '',
      fiscal_colony: '',
      fiscal_postal_code: '',
      cedula_ieps: '',
      sales_modality: '',
      ritmo: '',
      zona_comercial: '',
      region: '',
    });
    setEditingClient(null);
  };

  const handleGeolocation = async () => {
    try {
      const position = await getCurrentPositionSafe({ enableHighAccuracy: true });
      const { latitude, longitude } = position.coords;
      setNewClient((prev) => ({ ...prev, coords: { lat: latitude, lng: longitude } }));
      toast({ title: '¡Ubicación capturada!' });
    } catch (error) {
      toast({ title: 'Error de geolocalización', description: error.message || 'No se pudo obtener la ubicación.', variant: 'destructive' });
    }
  };

  const updateClientCoords = async (client) => {
    try {
      toast({ title: 'Capturando ubicación...', description: 'Por favor espera un momento.' });
      const pos = await getCurrentPositionSafe({ enableHighAccuracy: true });
      const { latitude, longitude } = pos.coords;
      
      const newCoords = { lat: latitude, lng: longitude };
      await updateClient(client.id, { lat: latitude, lng: longitude, coords: newCoords });

      toast({ title: '¡Ubicación actualizada!', description: 'El cliente ahora tiene coordenadas GPS.' });
      
      // Update local state
      setClients(prev => prev.map(c => c.id === client.id ? { ...c, lat: latitude, lng: longitude, coords: newCoords } : c));
      
      return newCoords;
    } catch (error) {
      toast({ title: 'Error obteniendo ubicación', description: error.message || 'Error desconocido', variant: 'destructive' });
      return null;
    }
  };

  const handleSaveClient = async () => {
    console.log('[ClientsPage] 🔵 handleSaveClient iniciado', { newClient, editingClient });

    if (!newClient.name || !newClient.business_name || !newClient.address || !newClient.colony || !newClient.postal_code || !newClient.exterior_number || !newClient.cross_street) {
      toast({ title: 'Datos Incompletos', description: 'Por favor completa todos los campos obligatorios de dirección (Calle, Entre Calles, No. Ext, Colonia, CP).', variant: 'destructive' });
      return;
    }

    if (!newClient.coords || !newClient.coords.lat || !newClient.coords.lng) {
      toast({ title: 'GPS Requerido', description: 'Debes capturar las coordenadas GPS (botón Capturar GPS) antes de guardar.', variant: 'destructive' });
      return;
    }

    // Programación de visitas obligatoria al crear un nuevo cliente
    if (!editingClient && (!newClient.visit_days || newClient.visit_days.length === 0)) {
      toast({ title: 'Programación de Visitas requerida', description: 'Debes seleccionar al menos un día de visita presencial antes de guardar.', variant: 'destructive' });
      return;
    }

    const clientCode = (newClient.client_code && newClient.client_code.trim() !== '') ? newClient.client_code.trim() : null;
    let clientData = {
      ...newClient,
      client_code: clientCode,
      cooler_serials: Array.isArray(newClient.cooler_serials) ? newClient.cooler_serials : [],
      visit_days: Array.isArray(newClient.visit_days) ? newClient.visit_days.join(',') : (newClient.visit_days || ''),
      visit_day_televenta: Array.isArray(newClient.visit_day_televenta) ? newClient.visit_day_televenta.join(',') : (newClient.visit_day_televenta || ''),
      type: newClient.client_type, // Send legacy 'type' alias for compatibility
      tipo_cliente: newClient.client_type // Send 'tipo_cliente' alias just in case
    };
    if ('photos' in clientData) delete clientData.photos;
    if ('id' in clientData) delete clientData.id;

    console.log('[ClientsPage] 📝 clientData preparado:', clientData);

    try {
      // En Conquista: intentar linkear por código si existe
      if (isConquista && !editingClient && clientCode) {
        console.log('[ClientsPage] 🔍 Conquista: Verificando si existe cliente con código:', clientCode);
        let existing;
        let findError;
        try {
          existing = await getClientByCode(clientCode);
          console.log('[ClientsPage] ✅ Búsqueda completada:', existing);
        } catch (e) {
          findError = e;
          console.log('[ClientsPage] ⚠️ Error en búsqueda:', e);
        }

        if (findError && findError.code !== 'PGRST116') {
          toast({ title: 'Error consultando cliente', description: findError.message, variant: 'destructive' });
          return;
        }

        if (existing && existing.id) {
          console.log('[ClientsPage] ⚠️ Cliente ya existe, mostrando diálogo');
          setIsAddDialogOpen(false);
          setTimeout(() => {
            setExistingClientData(existing);
            setShowExistsDialog(true);
          }, 150);
          return;
        }
      }

      // Asignación automática de ruta si está vacía (Para Concesión, Autoventa, etc.)
      // Si el cliente no tiene ruta asignada, le ponemos la ruta activa del usuario.
      const defaultRoute = norm(resolvedRoute || user?.user_metadata?.route || '');

      if (defaultRoute) {
        // Solo sobrescribir si está vacío
        if (!clientData.internal_route) {
          clientData.internal_route = defaultRoute;
        }
        if (!clientData.sales_route) {
          clientData.sales_route = defaultRoute;
        }
        console.log('[ClientsPage] 🛣️ Ruta asignada automáticamente:', { internal: clientData.internal_route, sales: clientData.sales_route });
      } else {
        console.warn('[ClientsPage] ⚠️ No se pudo determinar ruta por defecto para el usuario.');
      }

      // ... (inside handleSaveClient)

      if (clientCode && isCodeDuplicate && !isConquista) {
        toast({ title: 'Código de cliente duplicado', description: 'Ya existe un cliente con ese código. Por favor elige otro.', variant: 'destructive' });
        return;
      }

      console.log('[ClientsPage] 💾 Guardando cliente...');
      let result;
      try {
        if (editingClient?.id) {
          console.log('[ClientsPage] 📝 Actualizando cliente ID:', editingClient.id);
          await updateClient(editingClient.id, clientData);
        } else {
          console.log('[ClientsPage] ➕ Creando nuevo cliente...');

          await createClient(clientData);
          console.log('[ClientsPage] ✅ Cliente creado exitosamente');
        }
        result = { error: null };
      } catch (e) {
        console.error('[ClientsPage] ❌ Error al guardar:', e);
        result = { error: e };
      }

      if (result.error) {
        const err = result.error;
        console.error('[ClientsPage] ❌ Error resultado:', err);
        if (err.code === '23505' || (err.message && err.message.includes('duplicate key value'))) {
          toast({ title: 'Código de cliente duplicado', description: 'Ya existe un cliente con ese código. Por favor elige otro.', variant: 'destructive' });
        } else {
          toast({ title: 'Error', description: err.message, variant: 'destructive' });
        }
      } else {
        console.log('[ClientsPage] ✅ Cliente guardado, recargando lista...');
        await fetchClients();
        toast({ title: `¡Cliente ${editingClient ? 'actualizado' : 'agregado'}!`, description: 'Los datos se han guardado correctamente.' });
        setIsAddDialogOpen(false);
        resetForm();

        // GENERAR PDF (Solo nuevos)
        if (!editingClient) {
          toast({ title: 'Generando PDF...', description: 'Se está descargando la hoja de alta.' });
          // Esperar a que se complete la generación del PDF antes de continuar
          try {
            await generateClientPdf(clientData);
            console.log('[ClientsPage] ✅ PDF generado exitosamente');
          } catch (err) {
            console.error("Error generando PDF:", err);
          }
        }

        resetForm();
      }
    } catch (err) {
      console.error('[ClientsPage] ❌ Error inesperado:', err);
      toast({ title: 'Error inesperado', description: String(err?.message || err), variant: 'destructive' });
      console.error('Error inesperado al guardar cliente:', err);
    }
  };

  // Modal de cliente existente (Conquista)
  const [showExistsDialog, setShowExistsDialog] = useState(false);
  const [existingClientData, setExistingClientData] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Columnas completas de la tabla clients para exportación exhaustiva
  const CLIENTS_EXPORT_COLUMNS = [
    { key: 'id', header: 'id' },
    { key: 'client_code', header: 'client_code' },
    { key: 'name', header: 'name' },
    { key: 'business_name', header: 'business_name' },
    { key: 'contact', header: 'contact' },
    { key: 'email', header: 'email' },
    { key: 'phone', header: 'phone' },
    { key: 'address', header: 'address' },
    { key: 'street', header: 'street' },
    { key: 'exterior_number', header: 'exterior_number' },
    { key: 'interior_number', header: 'interior_number' },
    { key: 'cross_street', header: 'cross_street' },
    { key: 'colony', header: 'colony' },
    { key: 'postal_code', header: 'postal_code' },
    { key: 'city', header: 'city' },
    { key: 'state', header: 'state' },
    { key: 'reference', header: 'reference' },
    { key: 'sales_route', header: 'sales_route' },
    { key: 'delivery_route', header: 'delivery_route' },
    { key: 'internal_route', header: 'internal_route' },
    { key: 'zona_comercial', header: 'zona_comercial' },
    { key: 'region', header: 'region' },
    { key: 'gec', header: 'gec' },
    { key: 'level', header: 'level' },
    { key: 'cadena', header: 'cadena' },
    { key: 'exclusivity', header: 'exclusivity' },
    { key: 'client_type', header: 'client_type' },
    { key: 'sales_modality', header: 'sales_modality' },
    { key: 'ritmo', header: 'ritmo' },
    { key: 'visit_days', header: 'visit_days' },
    { key: 'visit_day_televenta', header: 'visit_day_televenta' },
    { key: 'enfriador', header: 'enfriador' },
    { key: 'cooler_serials', header: 'cooler_serials' },
    { key: 'rfc', header: 'rfc' },
    { key: 'fiscal_name', header: 'fiscal_name' },
    { key: 'fiscal_address', header: 'fiscal_address' },
    { key: 'fiscal_colony', header: 'fiscal_colony' },
    { key: 'fiscal_postal_code', header: 'fiscal_postal_code' },
    { key: 'cedula_ieps', header: 'cedula_ieps' },
    { key: 'lat', header: 'lat' },
    { key: 'lng', header: 'lng' },
    { key: 'notes', header: 'notes' },
    { key: 'comments', header: 'comments' },
    { key: 'owner_id', header: 'owner_id' },
    { key: 'created_by', header: 'created_by' },
    { key: 'created_at', header: 'created_at' },
    { key: 'updated_at', header: 'updated_at' },
    { key: 'ultimo_motivo_visita', header: 'ultimo_motivo_visita' },
    { key: 'venta_actual_hl', header: 'venta_actual_hl' }
  ];

  // Helper para extraer de forma segura y completa cualquier dato de un cliente
  const getClientExportValue = (c, key) => {
    if (!c) return '';
    switch (key) {
      case 'client_type':
        return c.client_type || c.type || c.giro || '';
      case 'business_name':
        return c.business_name || c.nombre_comercial || c.nombre_negocio || '';
      case 'fiscal_name':
        return c.fiscal_name || c.razon_social || '';
      case 'lat': {
        if (c.lat !== undefined && c.lat !== null && c.lat !== '') return c.lat;
        if (c.coords?.lat !== undefined && c.coords?.lat !== null && c.coords?.lat !== '') return c.coords.lat;
        if (Array.isArray(c.coords) && c.coords.length > 0) return c.coords[0];
        return c.latitud || c.latitude || '';
      }
      case 'lng': {
        if (c.lng !== undefined && c.lng !== null && c.lng !== '') return c.lng;
        if (c.coords?.lng !== undefined && c.coords?.lng !== null && c.coords?.lng !== '') return c.coords.lng;
        if (Array.isArray(c.coords) && c.coords.length > 1) return c.coords[1];
        return c.longitud || c.longitude || '';
      }
      case 'visit_days':
        if (Array.isArray(c.visit_days)) return c.visit_days.join('; ');
        return c.visit_days || '';
      case 'visit_day_televenta':
        if (Array.isArray(c.visit_day_televenta)) return c.visit_day_televenta.join('; ');
        return c.visit_day_televenta || '';
      case 'cooler_serials':
        if (Array.isArray(c.cooler_serials)) return c.cooler_serials.join('; ');
        return c.cooler_serials || '';
      case 'notes':
        return c.notes || c.comments || '';
      case 'ultimo_motivo_visita':
        return lastVisitReason[c.id] || c.ultimo_motivo_visita || '';
      case 'venta_actual_hl':
        return avgSales3m[c.id] !== undefined ? avgSales3m[c.id] : (c.venta_actual_hl ?? '');
      default: {
        const val = c[key];
        if (val === undefined || val === null) return '';
        if (Array.isArray(val)) return val.join('; ');
        if (typeof val === 'object') return JSON.stringify(val);
        return val;
      }
    }
  };

  // Exportar toda la información de la tabla clients
  const handleExportClients = async () => {
    if (exporting) return;
    setExporting(true);

    try {
      let clientsToExport = filteredClients || [];

      // Si hay más clientes en total que los mostrados en la página actual, obtenemos todos los registros coincidentes
      if (totalCount > clientsToExport.length) {
        toast({
          title: 'Preparando exportación completa...',
          description: `Descargando toda la tabla de los ${totalCount} clientes...`,
        });

        const userId = user?.id;
        const metaType = user?.user_metadata?.type || '';
        const isAdminLike = isJefeControlInterno || userType === 'admin' || metaType === 'Administrador';
        const q = (debouncedSearchTerm || '').trim();

        const exportFilters = {};
        if (q) exportFilters.search = q;

        if (isAdminLike) {
          if (zonaFilter && zonaFilter !== '__all__') exportFilters.zona = zonaFilter;
          if (internalRouteFilter && internalRouteFilter !== '__all__') exportFilters.internal_route = internalRouteFilter;
          if (salesRouteFilter && salesRouteFilter !== '__all__') exportFilters.sales_route = salesRouteFilter;
        } else if (isSupervisor || isControlInterno) {
          const { getAllowedRoutes } = await import('@/repositories/metadataRepository');
          const allowed = await getAllowedRoutes(userId);
          const routes = allowed.internal || [];
          const salesRoutes = allowed.sales || [];
          if (routes.length > 0 || salesRoutes.length > 0) {
            exportFilters.internal_routes = routes;
            exportFilters.sales_routes = salesRoutes;
          } else {
            const metaRoute = user?.user_metadata?.route || null;
            const metaZona = user?.user_metadata?.zona || null;
            if (metaRoute) exportFilters.internal_route = metaRoute;
            if (metaZona) exportFilters.zona = metaZona;
          }
        } else if (isConquista) {
          const { detectUserRoute } = await import('@/repositories/routeRepository');
          const route = await detectUserRoute(user);
          if (route) exportFilters.internal_route = route;
        } else if (isConcesion) {
          const { detectUserRoute } = await import('@/repositories/routeRepository');
          const route = await detectUserRoute(user);
          if (route) exportFilters.sales_route = route;
        } else {
          exportFilters.owner_id = userId;
        }

        try {
          const res = await getClientsPaged({
            page: 1,
            pageSize: Math.max(totalCount, 5000),
            filters: exportFilters
          });
          if (res?.data && res.data.length > 0) {
            clientsToExport = res.data;
          }
        } catch (fetchErr) {
          console.warn('[ClientsPage] Falló carga masiva para exportación, usando clientes en vista:', fetchErr);
        }
      }

      if (!clientsToExport || clientsToExport.length === 0) {
        toast({
          title: 'No hay clientes para exportar',
          description: 'Ajusta la búsqueda o agrega clientes.',
          variant: 'destructive'
        });
        return;
      }

      // Descubrimiento dinámico de cualquier columna adicional que venga en los datos de la tabla clients
      const standardKeys = new Set(CLIENTS_EXPORT_COLUMNS.map((col) => col.key));
      standardKeys.add('coords');
      standardKeys.add('cve_cliente');
      standardKeys.add('type');
      standardKeys.add('giro');
      standardKeys.add('nombre_comercial');
      standardKeys.add('razon_social');

      const extraKeys = new Set();
      clientsToExport.forEach((c) => {
        if (c && typeof c === 'object') {
          Object.keys(c).forEach((k) => {
            if (!standardKeys.has(k) && typeof c[k] !== 'function') {
              extraKeys.add(k);
            }
          });
        }
      });

      const allColumns = [
        ...CLIENTS_EXPORT_COLUMNS,
        ...Array.from(extraKeys).map((k) => ({ key: k, header: k }))
      ];

      const esc = (val) => {
        if (val === null || val === undefined) return '';
        let s = typeof val === 'object' ? JSON.stringify(val) : String(val);
        s = s.replace(/\r\n/g, ' ').replace(/[\r\n]/g, ' '); // Eliminar saltos de línea dentro de celdas
        if (/[",;\n]/.test(s)) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };

      const date = getTodayMexico();
      const csvHeaderRow = allColumns.map((col) => esc(col.header)).join(',');
      const csvDataRows = clientsToExport.map((c) =>
        allColumns.map((col) => esc(getClientExportValue(c, col.key))).join(',')
      );

      // Prepend UTF-8 BOM (\uFEFF) para que Excel reconozca tildes y caracteres especiales en español
      const bom = '\uFEFF';
      const csvContent = bom + [csvHeaderRow, ...csvDataRows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `clientes_cervezas_finas_${date}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: '¡Exportación exitosa!',
        description: `Se descargaron ${clientsToExport.length} clientes con toda su información (${allColumns.length} columnas).`
      });
    } catch (err) {
      console.error('[ClientsPage] Error al exportar clientes:', err);
      toast({
        title: 'Error al exportar',
        description: err?.message || 'Ocurrió un error al generar la exportación.',
        variant: 'destructive'
      });
    } finally {
      setExporting(false);
    }
  };

  // Búsqueda local (Mantenemos como respaldo pero no debe ocultar resultados del servidor)
  const filteredClients = useMemo(() => {
    // Si estamos en búsqueda global (servidor), confiamos en 'clients'
    // El filtrado local aquí era lo que causaba que "solo buscase lo que se muestra"
    // porque 'clients' ya viene paginado del servidor.
    return clients || [];
  }, [clients]);

  // Visitas
  const [visitClient, setVisitClient] = useState(null);
  const [showScanner, setShowScanner] = useState(false);

  // Dialog de Ventas (visible para todos)
  const [salesClient, setSalesClient] = useState(null);

  return (
    <>
      <Helmet>
        <title>Mis Clientes - Cervezas Finas</title>
      </Helmet>

      <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 py-6">
        <h1 className="text-2xl font-bold mb-6">Mis Clientes</h1>

        <div className="mb-4 flex flex-col md:flex-row md:items-center gap-2">
          <Input
            placeholder="Buscar por nombre, negocio, dirección o código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:max-w-xs"
          />

          {/* Filtros adicionales: Zona, Ruta interna, Ruta de venta */}
          <div className="flex flex-wrap items-center gap-2 w-full">
            <Select value={zonaFilter === '' ? '__all__' : zonaFilter} onValueChange={(val) => setZonaFilter(val === '__all__' ? '' : val)}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="Filtrar zona" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {availableZones.length > 0 ? (
                  availableZones.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)
                ) : (
                  Array.from(new Set((clients || []).map((c) => (c.zona || c.zona_comercial || '').replace(/\.xlsx$/i, '').trim()).filter(Boolean))).map((z) => (
                    <SelectItem key={z} value={z}>{z}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <Select value={internalRouteFilter === '' ? '__all__' : internalRouteFilter} onValueChange={(val) => setInternalRouteFilter(val === '__all__' ? '' : val)}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="Filtrar ruta interna" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {availableInternalRoutes.length > 0 ? (
                  availableInternalRoutes.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)
                ) : (
                  Array.from(new Set((clients || []).map((c) => (c.internal_route || '').trim()).filter(Boolean))).map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <Select value={salesRouteFilter === '' ? '__all__' : salesRouteFilter} onValueChange={(val) => setSalesRouteFilter(val === '__all__' ? '' : val)}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="Filtrar ruta de venta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {availableSalesRoutes.length > 0 ? (
                  availableSalesRoutes.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)
                ) : (
                  Array.from(new Set((clients || []).map((c) => (c.sales_route || '').trim()).filter(Boolean))).map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {!isControlInterno && !isSupervisor && (
            <Button onClick={() => { setEditingClient(null); setIsAddDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Agregar Cliente
            </Button>
          )}

          <Button variant="outline" onClick={handleExportClients} disabled={exporting}>
            {exporting ? (
              <>
                <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> Exportando...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-1.5" /> Exportar Excel
              </>
            )}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-40">
            <span className="text-lg">Cargando...</span>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center text-gray-500 py-10">No hay clientes para mostrar.</div>
        ) : (
          <>
            {/* Indicador de virtualización activa */}
            {filteredClients.length > VIRTUALIZATION_THRESHOLD && (
              <div className="mb-2 text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                ⚡ Virtualización activa: Renderizando {filteredClients.length} clientes eficientemente
              </div>
            )}

            <div>
              {filteredClients.length > VIRTUALIZATION_THRESHOLD ? (
                // VIRTUALIZADO: Para listas grandes (500+)
                <VirtualizedList
                  items={filteredClients}
                  itemHeight={220}
                  height={Math.min(window.innerHeight - 300, 800)}
                  renderItem={({ item: client }) => (
                    <ClientCard
                      key={client.id}
                      client={client}
                      avgSales3m={avgSales3m}
                      isControlInterno={isControlInterno}
                      isConquista={isConquista}
                      isSupervisor={isSupervisor}
                      setVisitClient={setVisitClient}
                      setSalesClient={setSalesClient}
                      updateClientCoords={updateClientCoords}
                      navigate={navigate}
                    />
                  )}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                  {filteredClients.map((client) => (
                    <div key={client.id} className="w-full">
                      <ClientCard
                        client={client}
                        avgSales3m={avgSales3m}
                        isControlInterno={isControlInterno}
                        isConquista={isConquista}
                        isSupervisor={isSupervisor}
                        setVisitClient={setVisitClient}
                        setSalesClient={setSalesClient}
                        updateClientCoords={updateClientCoords}
                        navigate={navigate}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Controles de paginación: NO mostrar para Conquista (ahora usa getClients sin paginación) ni cuando virtualización activa */}
              {!(isConquista && (profileRoute || user?.user_metadata?.route)) && filteredClients.length <= VIRTUALIZATION_THRESHOLD && (
                <div className="flex justify-center items-center gap-4 mt-6">
                  <Button disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button>
                  <span>Página {page} de {Math.ceil(totalCount / PAGE_SIZE) || 1}</span>
                  <Button disabled={page >= Math.ceil(totalCount / PAGE_SIZE)} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Dialog agregar/editar - MODERNIZED */}
        <Dialog open={isAddDialogOpen} onOpenChange={(open) => { if (!open) { setIsAddDialogOpen(false); setEditingClient(null); } }}>
          <DialogContent className="max-w-3xl h-[95vh] max-h-[900px] overflow-hidden p-0 flex flex-col" aria-describedby="desc-client-dialog">
            <div id="desc-client-dialog" className="sr-only">Formulario para agregar o editar cliente</div>
            <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <DialogTitle className="text-xl">{editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">Complete la información del cliente</p>
                </div>
              </div>
            </DialogHeader>


            <form onSubmit={(e) => { e.preventDefault(); handleSaveClient(); }} className="flex flex-col flex-1 min-h-0">
              <Tabs defaultValue="basic" className="flex-1 flex flex-col min-h-0">
                <TabsList className="w-full justify-start px-6 pt-4 grid grid-cols-3 h-auto flex-shrink-0">
                  <TabsTrigger value="basic" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                    <User className="w-4 h-4 mr-2" />
                    Información Básica
                  </TabsTrigger>
                  <TabsTrigger value="classification" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                    <Tag className="w-4 h-4 mr-2" />
                    Clasificación
                  </TabsTrigger>
                  <TabsTrigger value="fiscal" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                    <FileText className="w-4 h-4 mr-2" />
                    Fiscal y Venta
                  </TabsTrigger>
                  <TabsTrigger value="equipment" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                    <Snowflake className="w-4 h-4 mr-2" />
                    Equipos
                  </TabsTrigger>
                </TabsList>

                {/* TAB CONTENT WILL GO HERE */}
                <TabsContent value="basic" className="flex-1 overflow-y-auto px-6 pb-4 mt-4 space-y-6 min-h-0">
                  {/* Código de Cliente */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <Tag className="w-4 h-4 text-gray-500" />
                      Código de Cliente <span className="text-xs text-gray-400 font-normal">(opcional)</span>
                    </Label>
                    <Input
                      placeholder="Ej: CLI-001"
                      value={newClient.client_code || ''}
                      onChange={(e) => setNewClient({ ...newClient, client_code: e.target.value })}
                      className={`${isCodeDuplicate ? 'border-red-500 focus-visible:ring-red-600' : ''} ${isCodeChecking && !isCodeDuplicate ? 'border-yellow-500' : ''}`}
                    />
                    {isCodeChecking && <div className="text-xs text-yellow-600">⏳ Verificando código...</div>}
                    {!isCodeChecking && isCodeDuplicate && !isConquista && <div className="text-xs text-red-600">✖ Ya existe un cliente con ese código</div>}
                  </div>

                  {/* Información Personal - Grid 2 columnas */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-500" />
                        Nombre del Contacto *
                      </Label>
                      <Input
                        placeholder="Ej: Juan Pérez"
                        value={newClient.name}
                        onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                        required
                        autoFocus
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-500" />
                        Nombre Comercial *
                      </Label>
                      <Input
                        placeholder="Ej: Abarrotes La Esquina"
                        value={newClient.business_name}
                        onChange={(e) => setNewClient({ ...newClient, business_name: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  {/* Ubicación Detallada */}
                  <div className="space-y-3 p-4 border-2 border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
                      <MapPin className="w-4 h-4" />
                      Ubicación Detallada
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Calle *</Label>
                        <Input
                          placeholder="Calle principal"
                          value={newClient.address}
                          onChange={(e) => setNewClient({ ...newClient, address: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Entre Calles *</Label>
                        <Input
                          placeholder="Cruces"
                          value={newClient.cross_street}
                          onChange={(e) => setNewClient({ ...newClient, cross_street: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">No. Ext *</Label>
                        <Input value={newClient.exterior_number} onChange={(e) => setNewClient({ ...newClient, exterior_number: e.target.value })} required />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">No. Int</Label>
                        <Input value={newClient.interior_number} onChange={(e) => setNewClient({ ...newClient, interior_number: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Colonia *</Label>
                        <Input value={newClient.colony} onChange={(e) => setNewClient({ ...newClient, colony: e.target.value })} required />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">CP *</Label>
                        <Input value={newClient.postal_code} onChange={(e) => setNewClient({ ...newClient, postal_code: e.target.value })} required />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Ciudad</Label>
                        <Input value={newClient.city} onChange={(e) => setNewClient({ ...newClient, city: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Estado</Label>
                        <Input value={newClient.state} onChange={(e) => setNewClient({ ...newClient, state: e.target.value })} />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Referencias</Label>
                      <Textarea
                        value={newClient.reference}
                        onChange={(e) => setNewClient({ ...newClient, reference: e.target.value })}
                        className="h-20"
                        placeholder="Referencias de ubicación..."
                      />
                    </div>


                    <div className="flex items-center gap-2 flex-wrap pt-2">
                      <Button type="button" variant="outline" size="sm" onClick={handleGeolocation}>
                        <MapPin className="w-4 h-4 mr-2" />
                        Capturar GPS
                      </Button>
                      {newClient.coords.lat && newClient.coords.lng && (
                        <div className="flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2 py-1 rounded border border-green-200">
                          ✓ <span className="font-mono">{newClient.coords.lat.toFixed(4)}, {newClient.coords.lng.toFixed(4)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Contacto */}
                  <div className="space-y-3 p-4 border-2 border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-300">
                      <Phone className="w-4 h-4" />
                      Información de Contacto
                    </div>
                    <Input
                      placeholder="Teléfono"
                      value={newClient.phone}
                      onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                    />
                  </div>


                  {/* Foto del Cliente */}
                  {editingClient && (
                    <div className="space-y-2 p-4 border-2 border-purple-200 dark:border-purple-800 rounded-lg">
                      <Label className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                        <Camera className="w-4 h-4" />
                        Foto del Establecimiento
                      </Label>
                      <div className="flex items-center gap-3">
                        <Button type="button" variant="outline" size="sm" onClick={() => startCamera('facade')}>
                          <Camera className="w-4 h-4 mr-2" />
                          Tomar Foto
                        </Button>
                        {clientPhotos.facade && (
                          <img src={clientPhotos.facade} alt="Foto fachada" className="w-20 h-20 object-cover rounded-lg border-2 border-gray-200" />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Notas */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-500" />
                      Comentarios / Observaciones
                    </Label>
                    <Textarea
                      placeholder="Notas adicionales sobre el cliente..."
                      value={newClient.comments}
                      onChange={(e) => setNewClient({ ...newClient, comments: e.target.value })}
                      rows={3}
                    />
                  </div>
                </TabsContent>


                {/* CLASSIFICATION TAB */}
                <TabsContent value="classification" className="flex-1 overflow-y-auto px-6 pb-4 mt-4 space-y-6 min-h-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Nivel GEC */}
                    <div className="space-y-2">
                      <Label>Nivel GEC *</Label>
                      <Select value={newClient.level} onValueChange={(val) => setNewClient({ ...newClient, level: val })} required>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona nivel" />
                        </SelectTrigger>
                        <SelectContent className="z-[10000]">
                          <SelectItem value="BRONCE">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-amber-700"></span>
                              BRONCE
                            </div>
                          </SelectItem>
                          <SelectItem value="PLATA">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-gray-400"></span>
                              PLATA
                            </div>
                          </SelectItem>
                          <SelectItem value="ORO">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
                              ORO
                            </div>
                          </SelectItem>
                          <SelectItem value="PLATINO">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-slate-300"></span>
                              PLATINO
                            </div>
                          </SelectItem>
                          <SelectItem value="TITANIO">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-blue-900"></span>
                              TITANIO
                            </div>
                          </SelectItem>
                          <SelectItem value="TITANIO 2">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-purple-900"></span>
                              TITANIO 2
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Tipo de Cliente */}
                    <div className="space-y-2">
                      <Label>Tipo de Cliente *</Label>
                      <Select value={newClient.client_type} onValueChange={(val) => setNewClient({ ...newClient, client_type: val })} required>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona tipo" />
                        </SelectTrigger>
                        <SelectContent className="z-[10000]">
                          <SelectItem value="punto de venta">Punto de Venta</SelectItem>
                          <SelectItem value="centro de consumo">Centro de Consumo</SelectItem>
                          <SelectItem value="canal moderno">Canal Moderno</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Condición/Exclusividad */}
                    <div className="space-y-2">
                      <Label>Condición *</Label>
                      <Select value={newClient.exclusivity} onValueChange={(val) => setNewClient({ ...newClient, exclusivity: val })} required>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona condición" />
                        </SelectTrigger>
                        <SelectContent className="z-[10000]">
                          <SelectItem value="Mixto">Mixto</SelectItem>
                          <SelectItem value="Competencia">Competencia</SelectItem>
                          <SelectItem value="Exclusivo">Exclusivo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Zona Comercial */}
                    <div className="space-y-2">
                      <Label>Zona Comercial</Label>
                      <Select
                        value={newClient.zona_comercial}
                        onValueChange={(val) => setNewClient({
                          ...newClient,
                          zona_comercial: val,
                          region: val  // Guardar también en region
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona zona" />
                        </SelectTrigger>
                        <SelectContent className="z-[99999]" position="popper" sideOffset={5}>
                          <SelectItem value="IZUCAR">IZUCAR</SelectItem>
                          <SelectItem value="OAXACA">OAXACA</SelectItem>
                          <SelectItem value="SERDAN">SERDAN</SelectItem>
                          <SelectItem value="PALMARITO">PALMARITO</SelectItem>
                          <SelectItem value="GPE-CHILCHOTLA">GPE-CHILCHOTLA</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Rutas */}
                  <div className="space-y-4 mt-6 p-4 border-2 border-indigo-200 dark:border-indigo-800 rounded-lg">
                    <div className="flex items-center gap-2 text-sm font-medium text-indigo-700 dark:text-indigo-300">
                      <TruckIcon className="w-4 h-4" />
                      Asignación de Rutas
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Ruta de Ventas</Label>
                        <Input
                          placeholder="Ej: 30"
                          value={newClient.sales_route}
                          onChange={(e) => setNewClient({ ...newClient, sales_route: e.target.value })}
                          disabled={!(user?.user_metadata?.type === 'admin' || user?.user_metadata?.type === 'Administrador' || isConquista || isConcesion)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Ruta Interna</Label>
                        <Input
                          placeholder="Ruta interna"
                          value={newClient.internal_route}
                          readOnly
                          disabled
                          className="bg-gray-100"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Días de Visita */}
                  <div className="space-y-4 mt-6 p-4 border-2 border-orange-200 dark:border-orange-800 rounded-lg">
                    <div className="flex items-center gap-2 text-sm font-medium text-orange-700 dark:text-orange-300">
                      <FileText className="w-4 h-4" />
                      Programación de Visitas
                    </div>

                    <div className="space-y-3">
                      <Label>Días de Visita (Presencial)</Label>
                      <div className="flex flex-wrap gap-2">
                        {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(day => (
                          <Button
                            key={day}
                            type="button"
                            variant={(newClient.visit_days || []).includes(day) ? "default" : "outline"}
                            onClick={() => {
                              const current = newClient.visit_days || [];
                              const updated = current.includes(day)
                                ? current.filter(d => d !== day)
                                : [...current, day];
                              setNewClient({ ...newClient, visit_days: updated });
                            }}
                            className="h-8 px-2 text-xs"
                          >
                            {day}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label>Días de Televenta (Llamada)</Label>
                      <div className="flex flex-wrap gap-2">
                        {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(day => (
                          <Button
                            key={day}
                            type="button"
                            variant="outline"
                            onClick={() => {
                              const current = newClient.visit_day_televenta || [];
                              const updated = current.includes(day)
                                ? current.filter(d => d !== day)
                                : [...current, day];
                              setNewClient({ ...newClient, visit_day_televenta: updated });
                            }}
                            className={`h-8 px-2 text-xs ${(newClient.visit_day_televenta || []).includes(day)
                              ? "bg-indigo-600 text-white hover:bg-indigo-700 border-indigo-600"
                              : "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                              }`}
                          >
                            {day}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="fiscal" className="flex-1 overflow-y-auto px-6 pb-4 mt-4 space-y-6 min-h-0">
                  {/* Fiscal Section */}
                  <div className="space-y-4 p-4 border-2 border-slate-200 dark:border-slate-800 rounded-lg">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                      <FileText className="w-4 h-4" />
                      Datos de Facturación
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>RFC</Label>
                        <Input value={newClient.rfc} onChange={(e) => setNewClient({ ...newClient, rfc: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Razón Social</Label>
                        <Input value={newClient.fiscal_name} onChange={(e) => setNewClient({ ...newClient, fiscal_name: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Domicilio Fiscal</Label>
                      <Input value={newClient.fiscal_address} onChange={(e) => setNewClient({ ...newClient, fiscal_address: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Colonia Fiscal</Label>
                        <Input value={newClient.fiscal_colony} onChange={(e) => setNewClient({ ...newClient, fiscal_colony: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>CP Fiscal</Label>
                        <Input value={newClient.fiscal_postal_code} onChange={(e) => setNewClient({ ...newClient, fiscal_postal_code: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Cédula IEPS</Label>
                        <Input value={newClient.cedula_ieps} onChange={(e) => setNewClient({ ...newClient, cedula_ieps: e.target.value })} />
                      </div>
                    </div>
                  </div>

                  {/* Sales Config */}
                  <div className="space-y-4 p-4 border-2 border-indigo-200 dark:border-indigo-800 rounded-lg">
                    <div className="flex items-center gap-2 text-sm font-medium text-indigo-700 dark:text-indigo-300">
                      <Tag className="w-4 h-4" />
                      Configuración de Venta
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Modalidad</Label>
                        <Select value={newClient.sales_modality} onValueChange={(val) => setNewClient({ ...newClient, sales_modality: val })}>
                          <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                          <SelectContent className="z-[10000]">
                            <SelectItem value="Autoventa">Autoventa</SelectItem>
                            <SelectItem value="Preventa">Preventa</SelectItem>
                            <SelectItem value="Televenta">Televenta</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Ritmo</Label>
                        <Select value={newClient.ritmo} onValueChange={(val) => setNewClient({ ...newClient, ritmo: val })}>
                          <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                          <SelectContent className="z-[10000]">
                            <SelectItem value="Semanal">Semanal</SelectItem>
                            <SelectItem value="Quincenal">Quincenal</SelectItem>
                            <SelectItem value="Mensual">Mensual</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </TabsContent>


                {/* EQUIPMENT TAB */}
                <TabsContent value="equipment" className="flex-1 overflow-y-auto px-6 pb-4 mt-4 space-y-6 min-h-0">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Snowflake className="w-4 h-4 text-cyan-600" />
                      Enfriadores Asignados
                    </div>

                    <div className="space-y-3">
                      <Label>Seriales de Enfriadores</Label>
                      <Input
                        placeholder="Ej: SN001, SN002, SN003 (separados por coma)"
                        value={Array.isArray(newClient.cooler_serials) ? newClient.cooler_serials.join(', ') : ''}
                        onChange={(e) => {
                          const val = e.target.value || '';
                          const arr = val.split(',').map((s) => s.trim()).filter(Boolean);
                          setNewClient({ ...newClient, cooler_serials: arr });
                        }}
                      />

                      {newClient.cooler_serials && newClient.cooler_serials.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {newClient.cooler_serials.map((serial, idx) => (
                            <span key={idx} className="px-3 py-1 bg-cyan-50 text-cyan-700 rounded-full text-xs font-mono border border-cyan-200">
                              {serial}
                            </span>
                          ))}
                        </div>
                      )}

                      <Button type="button" variant="outline" onClick={() => setShowScanner(true)} className="w-full sm:w-auto">
                        <Camera className="w-4 h-4 mr-2" />
                        Escanear Código de Barras
                      </Button>

                      {showScanner && (
                        <div className="mt-4 border rounded-lg p-4 bg-gray-50">
                          <BarcodeScanner
                            onUpdate={async (err, result) => {
                              console.debug('ClientsPage BarcodeScanner onUpdate', { err, result });
                              if (err) { console.debug('BarcodeScanner error:', err); return; }
                              if (result?.text) {
                                const scanned = result.text;
                                let serials = Array.isArray(newClient.cooler_serials) ? newClient.cooler_serials : [];
                                if (!serials.includes(scanned)) {
                                  const updatedSerials = [...serials, scanned];
                                  setNewClient({ ...newClient, cooler_serials: updatedSerials });
                                }
                                setShowScanner(false);
                              }
                            }}
                            constraints={{ video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } } }}
                            style={{ width: '100%' }}
                          />
                          <Button variant="ghost" size="sm" onClick={() => setShowScanner(false)} className="mt-2 w-full">
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Footer con botones - Sticky */}
              <div className="border-t px-6 py-3 bg-white flex justify-end gap-3 flex-shrink-0">
                <Button type="button" variant="outline" onClick={() => { setIsAddDialogOpen(false); setEditingClient(null); }}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                  {editingClient ? 'Actualizar Cliente' : 'Agregar Cliente'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Dialog para cliente existente (Conquista) */}
        <Dialog open={showExistsDialog} onOpenChange={(open) => { if (!open) { setShowExistsDialog(false); setExistingClientData(null); } }}>
          <DialogContent aria-describedby="desc-exists-client-dialog">
            <div id="desc-exists-client-dialog" className="text-gray-700 mb-2">Cliente ya existe, ¿desea agregarlo a la ruta?</div>
            {existingClientData?.id ? (
              <>
                <DialogHeader>
                  <DialogTitle>Este cliente ya existe</DialogTitle>
                </DialogHeader>
                <div className="mb-4 text-black text-base font-medium">¿Desea agregarlo a la ruta y editar su información?</div>
                <div className="mb-2 p-3 rounded bg-gray-50 border">
                  <div><b>Código:</b> {existingClientData.client_code}</div>
                  <div><b>Nombre:</b> {existingClientData.name}</div>
                  <div><b>Negocio:</b> {existingClientData.business_name}</div>
                  <div><b>Dirección:</b> {existingClientData.address}</div>
                  <div><b>Ruta actual:</b> {existingClientData.sales_route || 'No asignada'}</div>
                  <div><b>Geolocalización:</b> {existingClientData.coords?.lat && existingClientData.coords?.lng ? `${existingClientData.coords.lat}, ${existingClientData.coords.lng}` : 'No asignada'}</div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={() => { setShowExistsDialog(false); setExistingClientData(null); }}>Cancelar</Button>
                  <Button onClick={async () => {
                    // Para Concesión, adopta el cliente a su ruta por ambos campos
                    if (isConcesion) {
                      const r = norm(resolvedRoute || user?.user_metadata?.route || '');
                      await updateClient(existingClientData.id, { internal_route: r, sales_route: r });
                      await fetchClients();
                    }
                    setShowExistsDialog(false);
                    setExistingClientData(null);
                    toast({ title: 'Cliente agregado a tu ruta', description: 'Se asignó a tu ruta correctamente.' });
                  }}>Agregar a mi ruta</Button>
                </div>
              </>
            ) : (
              <>
                <div className="text-red-600 p-4">No se pudo cargar la información válida del cliente existente.</div>
                <div className="bg-gray-100 text-xs p-2 mt-2 rounded border border-gray-300">
                  <b>Debug existingClientData:</b>
                  <pre>{JSON.stringify(existingClientData, null, 2)}</pre>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Dialog de visita */}
        <Dialog open={!!visitClient} onOpenChange={(open) => { if (!open) setVisitClient(null); }}>
          <DialogContent aria-describedby="desc-visit-dialog">
            <div id="desc-visit-dialog" className="sr-only">Formulario para registrar visita a cliente</div>
            <DialogHeader>
              <DialogTitle>Registrar Visita a {visitClient?.name}</DialogTitle>
            </DialogHeader>
            {visitClient && (
              <VisitForm client={visitClient} onSave={() => { setVisitClient(null); }} />
            )}
          </DialogContent>
        </Dialog>

        {/* Dialog de Ventas (visible para todos) */}
        {salesClient && (
          <SalesDialog
            client={salesClient}
            onClose={() => setSalesClient(null)}
          />
        )}

        {/* Cámara */}
        {isCameraOpen && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-4 w-full max-w-md">
              <div className="text-lg font-semibold mb-2">Tomar foto ({currentPhotoType})</div>
              <video ref={videoRef} autoPlay playsInline className="w-full rounded" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="flex justify-end gap-2 mt-3">
                <Button variant="outline" onClick={stopCamera}>Cancelar</Button>
                <Button onClick={takePicture}>Capturar</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
