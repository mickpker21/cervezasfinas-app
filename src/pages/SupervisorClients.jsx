import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '../supabaseClient';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import VisitForm from '@/components/VisitForm';
import ClientVisitsList from '@/components/ClientVisitsList';
import SalesDialog from '@/components/SalesDialog';
import { useNavigate } from 'react-router-dom';
import { PackagePlus, MoreVertical, ClipboardList, Eye, DollarSign, MapPin, ExternalLink, Activity, Hash, ClipboardCheck, Truck, Download } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu.jsx';
import { useToast } from '@/components/ui/use-toast';
import { getSalesBySku } from '@/repositories/salesRepository';
import { getVisitsByClients } from '@/repositories/visitsRepository';
import SurveyPanelSelector from '@/components/SurveyPanelSelector';
import CensoSupervisorForm from '@/components/CensoSupervisorForm';

import { getClientsPaged, countLocalClients, updateClient, createClient } from '@/repositories/clientsRepository';
import { countPendingOperations } from '@/sync/syncService';
import { getCurrentPositionSafe } from '@/lib/geolocation';
import { getAllowedRoutes as getRoutesMeta, getAllowedZonas } from '@/repositories/metadataRepository';
import { kvStorage } from '@/services/kvStorage';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Save } from 'lucide-react';

const exportToCSV = (data, filename = 'clientes.csv') => {
  if (!data || data.length === 0) return;
  const headers = ['Nombre', 'Código', 'RFC', 'Dirección', 'Ruta', 'Zona', 'Teléfono'];
  const rows = data.map(c => [
    c.business_name || c.name || '',
    c.client_code || c.code || '',
    c.rfc || '',
    c.address || '',
    c.sales_route || c.route || '',
    c.branch_id || c.zona || '',
    c.phone || ''
  ]);
  const csvContent = [headers, ...rows]
    .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// MySQL column for zone is usually 'zona' or 'zona_comercial'. We will check both or prefer 'zona'.
const PREFERRED_ZONE_COLUMNS = ['zona_comercial', 'zona', 'region', 'branch_id'];

const getZoneValue = (client) => {
  if (!client) return null;
  for (const col of PREFERRED_ZONE_COLUMNS) {
    if (client[col] !== undefined && client[col] !== null && String(client[col]).trim() !== '') {
      return String(client[col]).trim();
    }
  }
  return null;
};

const normalizeRouteList = (items) => {
  const map = new Map();
  (items || []).forEach(item => {
    if (item === null || item === undefined) return;
    const str = String(item).trim();
    if (!str) return;
    const key = str.toUpperCase();
    if (!map.has(key)) {
      map.set(key, str);
    }
  });
  return Array.from(map.values()).sort((a, b) => 
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
};

const buildIn = (col, arr) => `${col}.in.(${arr.map((v) => `"${String(v).replaceAll('"', '\""')}"`).join(',')})`;

const tryDetectZoneColumn = async () => {
  // Simple default for now as we prefer 'zona' or 'zona_comercial'
  return 'zona';
};

export default function SupervisorClients({ cadenaFilter = null, readOnly = false }) {
  const { user } = useSupabaseAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const userType = (user?.user_metadata?.type || '').toLowerCase();
  const isSupervisor = userType === 'supervisor' || userType === 'coortrade' || userType === 'coorcon' || userType === 'jefeum6' || userType === 'jefe-um6' || !!cadenaFilter;

  const [allClients, setAllClients] = useState([]);
  const [clients, setClients] = useState([]);
  const [assetSerials, setAssetSerials] = useState({});
  const [visitsByClientId, setVisitsByClientId] = useState({});
  const [avgSales3m, setAvgSales3m] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  const [zoneFilter, setZoneFilter] = useState('');
  const [internalRouteFilter, setInternalRouteFilter] = useState('');
  const [salesRouteFilter, setSalesRouteFilter] = useState('');
  const [allowedRoutes, setAllowedRoutes] = useState({ internal: [], sales: [] });
  const [routesLoaded, setRoutesLoaded] = useState(false);
  const [zoneColumn, setZoneColumn] = useState('zona');
  const [uniqueZones, setUniqueZones] = useState([]);
  const [uniqueInternalRoutes, setUniqueInternalRoutes] = useState([]);
  const [uniqueSalesRoutes, setUniqueSalesRoutes] = useState([]);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [totalCount, setTotalCount] = useState(0);
  const [visitClient, setVisitClient] = useState(null);
  const [salesClient, setSalesClient] = useState(null);
  const [evaluationClient, setEvaluationClient] = useState(null);
  const [assetClient, setAssetClient] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [localCount, setLocalCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [monthlySales, setMonthlySales] = useState({});
  const [censusClient, setCensusClient] = useState(null);
  const [surveyType, setSurveyType] = useState(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newClient, setNewClient] = useState({
    name: '',
    business_name: '',
    phone: '',
    address: '',
    sales_route: '',
    zona_comercial: '',
    level: 'BRONCE',
    client_type: 'PUNTO DE VENTA'
  });

  // Ref guardián: evita re-cargar clientes cuando Supabase renueva auth en cambio de pestaña
  const clientsFetchedRef = useRef(false);
  const lastFetchedRoutesRef = useRef('');  // JSON de las rutas ya cargadas


  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(searchTerm), 450);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => { setPage(1); }, [debouncedSearchTerm, zoneFilter, internalRouteFilter, salesRouteFilter]);

  const fetchAllowedRoutes = useCallback(async () => {
    if (!user || !isSupervisor) return;

    try {
      // Usar metadataRepository que tiene SQLite local → Supabase fallback
      const [routesMeta, zones] = await Promise.all([
        getRoutesMeta(user.id),
        getAllowedZonas(user.id)
      ]);

      const internal = (routesMeta?.internal || []).filter(Boolean);
      const sales = (routesMeta?.sales || []).filter(Boolean);
      
      // Merge zones with user.profile.assigned_zones if present
      const profileZones = user?.profile?.assigned_zones || [];
      const mergedZones = Array.from(new Set([...zones, ...profileZones])).filter(Boolean);

      console.log('[SupervisorClients] Allowed routes (offline-ready):', { internal, sales, zones: mergedZones });
      setAllowedRoutes({ internal, sales, zones: mergedZones });
    } catch (e) {
      console.error('[SupervisorClients] Error fetching allowed routes:', e);
    } finally {
      setRoutesLoaded(true);
    }
  }, [user?.id, isSupervisor]);

  useEffect(() => { fetchAllowedRoutes(); }, [fetchAllowedRoutes]);

  useEffect(() => { (async () => setZoneColumn(await tryDetectZoneColumn()))(); }, []);

  // Calculate unique filters from allowedRoutes and loaded clients
  useEffect(() => {
    const rawZones = [...(allowedRoutes?.zones || [])];
    const rawInternal = [...(allowedRoutes?.internal || [])];
    const rawSales = [...(allowedRoutes?.sales || [])];

    allClients.forEach(c => {
      const z = getZoneValue(c);
      if (z) rawZones.push(z);
      const ir = c.internal_route || c.ruta_interna || c.ruta_conquista;
      if (ir) rawInternal.push(ir);
      const sr = c.sales_route || c.ruta_venta || c.ruta;
      if (sr) rawSales.push(sr);
    });

    setUniqueZones(normalizeRouteList(rawZones));
    setUniqueInternalRoutes(normalizeRouteList(rawInternal));
    setUniqueSalesRoutes(normalizeRouteList(rawSales));
  }, [allClients, allowedRoutes]);



  const refreshLocalStatus = useCallback(async () => {
    const [local, pending] = await Promise.all([
      countLocalClients(),
      countPendingOperations(),
    ]);
    setLocalCount(local);
    setPendingCount(pending);
    return local;
  }, []);



  // ── fetchAllClients: solo se llama cuando cambian las rutas permitidas (Supabase)
  //    Usa user?.id (primitivo) en vez del objeto user completo para evitar
  //    que el refresh de token de Supabase dispare un re-fetch al cambiar de pestaña.
  const fetchAllClients = useCallback(async () => {
    if (!user?.id || !isSupervisor) {
      setClients([]); setAllClients([]); setTotalCount(0); setLoading(false); return;
    }
    // If cadenaFilter is set, skip route-based restrictions — load all clients
    if (!cadenaFilter && !routesLoaded) {
      console.warn('[SupervisorClients] Routes not loaded yet, skipping fetch.');
      return;
    }

    // Guardián: no re-cargar si ya tenemos clientes para ESTAS mismas rutas
    const routesKey = JSON.stringify({
      internal: [...(allowedRoutes.internal || [])].sort(),
      sales: [...(allowedRoutes.sales || [])].sort(),
    });
    if (clientsFetchedRef.current && lastFetchedRoutesRef.current === routesKey) {
      console.log('[SupervisorClients] Clientes ya cargados para estas rutas, omitiendo re-fetch.');
      return;
    }

    setLoading(true);
    setVisitsByClientId({});

    try {
      console.log('[SupervisorClients] Fetching clients for routes:', allowedRoutes);

      const routeFilters = {};
      if (allowedRoutes.internal && allowedRoutes.internal.length > 0) {
        routeFilters.internal_routes = allowedRoutes.internal;
      }
      if (allowedRoutes.sales && allowedRoutes.sales.length > 0) {
        routeFilters.sales_routes = allowedRoutes.sales;
      }
      
      // Si no tiene rutas asignadas, pero SÍ tiene zonas asignadas, filtramos por zona en el backend 
      // para evitar descargar 50,000 clientes de todo el país
      if (!routeFilters.sales_routes && !routeFilters.internal_routes && allowedRoutes.zones && allowedRoutes.zones.length > 0) {
        routeFilters.zonas = allowedRoutes.zones;
      }

      const { data: fetchedClients } = await getClientsPaged({
        page: 1,
        pageSize: 50000,
        userId: user.id,
        // When cadenaFilter is set, skip route filters so we load ALL clients
        filters: cadenaFilter ? {} : routeFilters,
      });

      // Apply cadena filter in memory if provided
      const filtered = cadenaFilter
        ? fetchedClients.filter(c => {
            const cadena = (c.cadena || c.chain || '').toString().toUpperCase();
            return cadena.includes(cadenaFilter.toUpperCase());
          })
        : fetchedClients;

      console.log(`[SupervisorClients] Loaded ${filtered.length} clients${cadenaFilter ? ` (cadena: ${cadenaFilter})` : ''}.`);
      setAllClients(filtered);
      // Pre-guardar snapshot de clientes y puntos en segundo plano para garantizar modo offline en Puntos de Clientes
      import('@/repositories/clientPointsRepository').then(({ saveSupervisorClientsSnapshot, syncClientPointsSummary }) => {
        saveSupervisorClientsSnapshot(user.id, filtered);
        syncClientPointsSummary();
      }).catch(() => {});

      // Marcar como ya cargado para estas rutas
      clientsFetchedRef.current = true;
      lastFetchedRoutesRef.current = routesKey;
    } catch (error) {
      console.error('[SupervisorClients] Error fetching clients:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los clientes', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user?.id, isSupervisor, allowedRoutes, routesLoaded, toast]);

  // ── Efecto 1: cargar clientes cuando las rutas estén disponibles
  //    Limpia el guardián cuando las rutas cambian para forzar re-carga legítima
  useEffect(() => {
    if (cadenaFilter) {
      // For cadena-filtered mode, skip zone column detection dependency
      setRoutesLoaded(true);
      fetchAllClients();
      return;
    }
    if (zoneColumn === undefined) return;
    // Calcular la clave de rutas actuales
    const newKey = JSON.stringify({
      internal: [...(allowedRoutes.internal || [])].sort(),
      sales: [...(allowedRoutes.sales || [])].sort(),
    });
    // Si las rutas cambiaron, limpiar el guardián para permitir re-carga
    if (lastFetchedRoutesRef.current && lastFetchedRoutesRef.current !== newKey) {
      console.log('[SupervisorClients] Rutas cambiaron, limpiando guardián.');
      clientsFetchedRef.current = false;
    }
    fetchAllClients();
  }, [fetchAllClients, zoneColumn, allowedRoutes]);

  // ── Efecto 2: filtrar y paginar en MEMORIA cuando cambian los filtros o la página
  //    No hace ninguna petición a la API
  useEffect(() => {
    let filtered = [...allClients];

    if (debouncedSearchTerm) {
      const term = debouncedSearchTerm.toLowerCase();
      filtered = filtered.filter((c) => {
        const name = (c.name || '').toLowerCase();
        const business = (c.business_name || '').toLowerCase();
        const addr = (c.address || '').toLowerCase();
        const code = (c.client_code || '').toLowerCase();
        return name.includes(term) || business.includes(term) || addr.includes(term) || code.includes(term);
      });
    }

    if (zoneFilter && zoneFilter !== 'all' && zoneFilter !== '__all__') {
      const targetZone = String(zoneFilter).trim().toUpperCase();
      filtered = filtered.filter(c => {
        const val = getZoneValue(c);
        return val && String(val).trim().toUpperCase() === targetZone;
      });
    }
    if (internalRouteFilter && internalRouteFilter !== 'all' && internalRouteFilter !== '__all__') {
      const targetInternal = String(internalRouteFilter).trim().toUpperCase();
      filtered = filtered.filter(c => {
        const ir = c.internal_route || c.ruta_interna || c.ruta_conquista;
        return ir && String(ir).trim().toUpperCase() === targetInternal;
      });
    }
    if (salesRouteFilter && salesRouteFilter !== 'all' && salesRouteFilter !== '__all__') {
      const targetSales = String(salesRouteFilter).trim().toUpperCase();
      filtered = filtered.filter(c => {
        const sr = c.sales_route || c.ruta_venta || c.ruta;
        return sr && String(sr).trim().toUpperCase() === targetSales;
      });
    }

    setTotalCount(filtered.length);

    const from = (page - 1) * PAGE_SIZE;
    const pageClients = filtered.slice(from, from + PAGE_SIZE);
    setClients(pageClients);

    const clientIds = pageClients.map(c => c.id).filter(Boolean);
    if (clientIds.length > 0) {
      getVisitsByClients(clientIds)
        .then(visitsMap => setVisitsByClientId(visitsMap))
        .catch(err => console.error('Error fetching visits', err));
    }
  }, [allClients, debouncedSearchTerm, zoneFilter, internalRouteFilter, salesRouteFilter, page]);

  // ── Poll para sincronización en background (solo nativo/offline)
  useEffect(() => {
    refreshLocalStatus();

    const interval = setInterval(async () => {
      const currentCount = await refreshLocalStatus();
      if (!routesLoaded && !loading && !searchTerm && !zoneFilter && !internalRouteFilter && !salesRouteFilter) {
        if (allClients.length === 0 && currentCount > 0) {
          console.log('[SupervisorClients] Auto-refresh: Data arrived in DB (pre-routes load).');
          fetchAllClients();
        }
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [refreshLocalStatus, routesLoaded, allClients.length, loading, searchTerm, zoneFilter, internalRouteFilter, salesRouteFilter, fetchAllClients]);

  // Extract asset serials directly from client data (MySQL)
  useEffect(() => {
    if (clients.length === 0) { setAssetSerials({}); return; }

    const map = {};
    clients.forEach(c => {
      // c.cooler_serials might be array or string (decoded by PHP, hopefully array)
      if (c.cooler_serials && Array.isArray(c.cooler_serials) && c.cooler_serials.length > 0) {
        map[c.id] = c.cooler_serials;
      } else if (c.cooler_serials && typeof c.cooler_serials === 'string') {
        // Try parse if somehow string
        try { map[c.id] = JSON.parse(c.cooler_serials); } catch (e) {
          if (c.cooler_serials.trim()) map[c.id] = [c.cooler_serials];
        }
      }
    });
    setAssetSerials(map);
  }, [clients]);

  useEffect(() => {
    if (!clients || clients.length === 0) { setAvgSales3m({}); setMonthlySales({}); return; }
    const loadAverages = async () => {
      try {
        const codes = clients.map((c) => c.client_code).filter(Boolean);
        if (codes.length === 0) { setAvgSales3m({}); setMonthlySales({}); return; }
        const now = new Date();
        const start = new Date(now); start.setDate(start.getDate() - 90);

        // Extraemos las rutas de los clientes del supervisor para filtrar en MySQL y evitar escanear toda la BD
        const routesSet = new Set(clients.map(c => c.sales_route || c.internal_route).filter(Boolean));
        const routesList = Array.from(routesSet);

        // Calcular ventas promedio de 3 meses
        const rows = await getSalesBySku({
          from: start.toISOString().slice(0, 10),
          to: now.toISOString().slice(0, 10),
          sales_routes: routesList.length > 0 ? routesList : undefined
        });
        
        // Normalizador de códigos (quita ceros a la izquierda y espacios)
        const normalize = (c) => String(c || '').trim().replace(/^0+/, '');

        const sumByCode = (rows || []).reduce((acc, row) => {
          const code = normalize(row.cve_cliente);
          const hl = Number(row.htls_total) || 0;
          acc[code] = (acc[code] || 0) + hl;
          return acc;
        }, {});
        const mapById = {};
        clients.forEach((c) => { 
          const normCode = normalize(c.client_code);
          mapById[c.id] = (sumByCode[normCode] || 0) / 3; 
        });
        setAvgSales3m(mapById);

        // Calcular ventas del mes actual
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthRows = await getSalesBySku({
          from: monthStart.toISOString().slice(0, 10),
          to: now.toISOString().slice(0, 10),
          sales_routes: routesList.length > 0 ? routesList : undefined
        });
        const monthSumByCode = (monthRows || []).reduce((acc, row) => {
          const code = normalize(row.cve_cliente);
          const hl = Number(row.htls_total) || 0;
          acc[code] = (acc[code] || 0) + hl;
          return acc;
        }, {});
        const monthMapById = {};
        clients.forEach((c) => { 
          const normCode = normalize(c.client_code);
          monthMapById[c.id] = monthSumByCode[normCode] || 0; 
        });
        setMonthlySales(monthMapById);
      } catch (e) { console.error('Excepción promedio 3m:', e); setAvgSales3m({}); setMonthlySales({}); }
    };
    loadAverages();
  }, [clients]);

  const updateClientGeolocation = async (client) => {
    try {
      setUpdatingId(client.id);
      const pos = await getCurrentPositionSafe({ enableHighAccuracy: true });
      const { latitude, longitude } = pos.coords;

      await updateClient(client.id, { coords: { lat: latitude, lng: longitude } });

      toast({ title: '¡Ubicación actualizada!' });
      setClients(prev => prev.map(c => c.id === client.id ? { ...c, coords: { lat: latitude, lng: longitude } } : c));
    } catch (err) {
      toast({
        title: 'No se pudo actualizar la ubicación',
        description: (err && err.message) || 'Revisa los permisos de ubicación en tu dispositivo.',
        variant: 'destructive'
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const openMaps = (lat, lng) => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
  };
  
  const handleSaveNewClient = async (e) => {
    e.preventDefault();
    if (!newClient.business_name || !newClient.address) {
      toast({ title: "Faltan datos", description: "El nombre del negocio y la dirección son obligatorios.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const clientToCreate = {
        ...newClient,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // We ensure internal_route matches sales_route if empty for consistency
        internal_route: newClient.internal_route || newClient.sales_route
      };

      console.log('[SupervisorClients] Creating new client:', clientToCreate);
      const created = await createClient(clientToCreate);
      
      toast({ title: "¡Éxito!", description: `Cliente ${created.business_name} registrado correctamente.` });
      
      // Reset and close
      setIsAddDialogOpen(false);
      setNewClient({
        name: '', business_name: '', phone: '', address: '', 
        sales_route: allowedRoutes.sales[0] || '', 
        zona_comercial: allowedRoutes.zones[0] || '',
        level: 'BRONCE', client_type: 'PUNTO DE VENTA'
      });
      
      // Refresh list: we clear the ref and call fetch
      clientsFetchedRef.current = false;
      fetchAllClients();
    } catch (error) {
      console.error('[SupervisorClients] Registration error:', error);
      toast({ title: "Error", description: "No se pudo registrar el cliente.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const fetchClientsAndVisits = useCallback(async () => {
    clientsFetchedRef.current = false;
    await fetchAllClients();
  }, [fetchAllClients]);

  const handleVisitSaved = useCallback(async () => {
    const savedClientId = visitClient?.id;
    setVisitClient(null);
    toast({
      title: 'Visita registrada',
      description: 'La visita se ha guardado exitosamente.',
    });
    if (savedClientId) {
      try {
        const visitsMap = await getVisitsByClients([savedClientId]);
        setVisitsByClientId(prev => ({
          ...prev,
          ...visitsMap,
        }));
      } catch (err) {
        console.error('[SupervisorClients] Error refreshing client visits:', err);
      }
    }
  }, [visitClient, toast]);

  return (
    <>
      <Helmet><title>Clientes (Supervisor) - Cervezas Finas</title></Helmet>
      <div className="container mx-auto py-8 pb-20">
        <h1 className="text-2xl font-bold mb-6">Mis Clientes (Supervisor)</h1>
        <div className="mb-4 flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <Input
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:w-1/4"
          />
          <div className="flex flex-col sm:flex-row items-stretch gap-2 w-full md:flex-1">
            <div className="flex-1">
              <Select
                value={zoneFilter || '__all__'}
                onValueChange={(val) => {
                  setZoneFilter(val === '__all__' ? '' : val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Zona" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas las zonas</SelectItem>
                  {uniqueZones.map((z) => z && (
                    <SelectItem key={String(z)} value={String(z)}>
                      {String(z)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Select
                value={internalRouteFilter || '__all__'}
                onValueChange={(val) => {
                  setInternalRouteFilter(val === '__all__' ? '' : val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Ruta de conquista" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas las rutas de conquista</SelectItem>
                  {uniqueInternalRoutes.map((r) => r && (
                    <SelectItem key={String(r)} value={String(r)}>
                      {String(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Select
                value={salesRouteFilter || '__all__'}
                onValueChange={(val) => {
                  setSalesRouteFilter(val === '__all__' ? '' : val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Ruta de venta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas las rutas de venta</SelectItem>
                  {uniqueSalesRoutes.map((r) => r && (
                    <SelectItem key={String(r)} value={String(r)}>
                      {String(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button
              onClick={() => exportToCSV(clients, 'clientes_supervisor.csv')}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shrink-0"
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-10">Cargando clientes...</div>
        ) : clients.length === 0 ? (
          <div className="text-center text-gray-500 py-10">No hay clientes.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {clients.map((client) => {
                const serials = assetSerials[client.id] || [];
                const hasCooler = serials.length > 0;
                const salesHL = Number(monthlySales[client.id] || 0);
                const hasSalesThisMonth = salesHL > 0;

                const LEVEL_STYLES = {
                  ORO: { bg: 'from-yellow-500/20 to-amber-600/10', badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', icon: '🥇' },
                  PLATA: { bg: 'from-slate-400/20 to-gray-500/10', badge: 'bg-slate-400/20 text-slate-300 border-slate-400/30', icon: '🥈' },
                  BRONCE: { bg: 'from-amber-700/20 to-orange-800/10', badge: 'bg-amber-700/20 text-amber-300 border-amber-600/30', icon: '🥉' },
                  PLATINO: { bg: 'from-cyan-400/20 to-blue-500/10', badge: 'bg-cyan-400/20 text-cyan-200 border-cyan-400/30', icon: '💎' },
                  TITANIO: { bg: 'from-blue-500/20 to-indigo-600/10', badge: 'bg-blue-500/20 text-blue-200 border-blue-400/30', icon: '⚡' },
                };
                const level = LEVEL_STYLES[(client.level || '').toUpperCase()] || LEVEL_STYLES.BRONCE;
                const initials = ((client.business_name || client.name || '?').trim().split(' ').slice(0, 2).map(w => w[0]).join('')).toUpperCase();

                let coords = null;
                try { coords = typeof client.coords === 'string' ? JSON.parse(client.coords) : client.coords; } catch (e) { }
                const lat = coords?.lat ?? coords?.[0];
                const lng = coords?.lng ?? coords?.[1];

                const statusMessage = hasSalesThisMonth
                  ? null
                  : hasCooler
                    ? 'Tiene enfriador pero no compra en el mes'
                    : 'Sin compras registradas en el mes';

                const statusDot = statusMessage ? (
                  <span
                    className={`inline-flex shrink-0 items-center justify-center rounded-full border border-white/80 shadow ${hasCooler ? 'h-4 w-4 bg-red-500' : 'h-3.5 w-3.5 bg-orange-400'}`}
                    title={statusMessage}
                    aria-label={statusMessage}
                    role="img"
                  />
                ) : null;

                const sales = avgSales3m[client.id];

                return (
                  <div key={client.id} className="relative flex flex-col w-full rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/80 backdrop-blur-sm shadow-xl transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-emerald-900/30 hover:shadow-2xl overflow-hidden">
                    <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${level.bg.replace('/20', '/60').replace('/10', '/40')}`} />

                    <div className="flex items-start gap-2.5 p-3 pb-2">
                      <div className={`hidden sm:flex flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${level.bg} border border-white/10 items-center justify-center text-white font-bold text-xs select-none`}>
                        {initials}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm leading-tight break-words whitespace-normal line-clamp-3 inline-flex items-center gap-2">
                          {client.business_name || client.name}
                          {statusDot}
                        </p>
                        {client.business_name && client.name && (
                          <p className="text-slate-400 text-xs break-words whitespace-normal line-clamp-2 mt-0.5">
                            {client.name}
                          </p>
                        )}
                        {client.client_code && (
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-mono text-slate-400 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 break-all max-w-full">
                            <Hash className="w-2.5 h-2.5 flex-shrink-0" />
                            <span className="truncate">{client.client_code}</span>
                          </span>
                        )}
                      </div>

                      {client.level && (
                        <span className={`inline-flex flex-shrink-0 text-[10px] items-center justify-center font-bold px-2 py-0.5 rounded-full border ${level.badge} uppercase tracking-wide`}>
                          {level.icon} <span className="hidden sm:inline ml-1">{client.level}</span>
                        </span>
                      )}
                    </div>

                    <div className="mx-3 h-px bg-white/5" />

                    <div className="flex gap-1.5 px-3 py-2">
                      {sales !== undefined && (
                        <div className="flex-1 bg-emerald-500/10 border border-emerald-500/20 rounded-[0.4rem] px-1.5 py-1 flex flex-col items-center justify-center min-w-0">
                          <p className="text-[9px] text-emerald-400 font-medium uppercase tracking-wider truncate w-full text-center">Venta (3m)</p>
                          <p className="text-xs font-bold text-white font-mono truncate w-full text-center">
                            {sales ? `${Number(sales).toLocaleString('es-MX', { maximumFractionDigits: 1 })} HL` : '—'}
                          </p>
                        </div>
                      )}
                      <div className="flex-1 bg-indigo-500/10 border border-indigo-500/20 rounded-[0.4rem] px-1.5 py-1 flex flex-col items-center justify-center min-w-0">
                        <p className="text-[9px] text-indigo-300 font-medium uppercase tracking-wider truncate w-full text-center">Mes</p>
                        <p className="text-xs font-bold text-white truncate w-full text-center">
                          {hasSalesThisMonth ? `${salesHL.toLocaleString('es-MX', { maximumFractionDigits: 1 })} HL` : '—'}
                        </p>
                      </div>
                      {(() => {
                        const sRoute = client.sales_route || client.ruta_venta || client.ruta;
                        const iRoute = client.internal_route || client.ruta_interna || client.ruta_conquista;
                        const isSame = sRoute && iRoute && String(sRoute).trim().toUpperCase() === String(iRoute).trim().toUpperCase();

                        return (
                          <>
                            {sRoute && (
                              <div className="flex-1 bg-purple-500/10 border border-purple-500/20 rounded-[0.4rem] px-1.5 py-1 flex flex-col items-center justify-center min-w-0" title={`Ruta de Venta: ${sRoute}`}>
                                <p className="text-[9px] text-purple-300 font-medium uppercase tracking-wider truncate w-full text-center">Ruta</p>
                                <p className="text-xs font-bold text-white truncate w-full text-center">{sRoute}</p>
                              </div>
                            )}
                            {iRoute && !isSame && (
                              <div className="flex-1 bg-amber-500/10 border border-amber-500/20 rounded-[0.4rem] px-1.5 py-1 flex flex-col items-center justify-center min-w-0" title={`Ruta Conquista: ${iRoute}`}>
                                <p className="text-[9px] text-amber-300 font-medium uppercase tracking-wider truncate w-full text-center">Conquista</p>
                                <p className="text-xs font-bold text-white truncate w-full text-center">{iRoute}</p>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {client.address && (
                      <div className="flex items-start gap-1.5 px-3 pb-1.5">
                        <MapPin className="w-3 h-3 text-slate-500 mt-0.5 flex-shrink-0" />
                        <p className="text-[10px] text-slate-400 leading-snug line-clamp-2">{client.address}</p>
                      </div>
                    )}

                    {serials.length > 0 && (
                      <div className="flex items-start gap-1.5 px-3 pb-1.5">
                        <PackagePlus className="w-3 h-3 text-slate-500 mt-0.5 flex-shrink-0" />
                        <p className="text-[10px] text-slate-400 leading-snug line-clamp-2">Seriales: {serials.join(', ')}</p>
                      </div>
                    )}

                    <div className="px-3 pb-2">
                      <ClientVisitsList visits={visitsByClientId[client.id] || []} />
                    </div>

                    <div className="flex items-center gap-2 px-3 py-2 border-t border-white/5 bg-white/[0.02] flex-wrap justify-between">
                      {/* Left: Action Buttons */}
                      <div className="flex flex-1 items-center gap-2 flex-wrap min-w-0">
                        {lat && lng && (
                          <button
                            title="Ver en Google Maps"
                            className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-sky-600/20 hover:bg-sky-500/30 text-sky-400 border border-sky-500/20 transition-colors shadow-sm whitespace-nowrap"
                            onClick={() => openMaps(lat, lng)}
                          >
                            Maps
                          </button>
                        )}
                        <button
                          className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-teal-600/20 hover:bg-teal-500/30 text-teal-400 border border-teal-500/20 transition-colors shadow-sm whitespace-nowrap"
                          onClick={() => setEvaluationClient(client)}
                        >
                          Evaluar
                        </button>
                        <button
                          className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors shadow-sm shadow-violet-900/40 whitespace-nowrap"
                          onClick={() => setVisitClient(client)}
                        >
                          Visitar
                        </button>
                      </div>

                      {/* Right: 3-dots Menu */}
                      <div className="flex items-center justify-end pl-1 border-l border-white/10 ml-auto">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors" title="Más opciones">
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setSalesClient(client)}>
                              <DollarSign className="w-4 h-4 mr-2" />Ventas
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => { setCensusClient(client); setSurveyType(null); }}>
                              <ClipboardCheck className="w-4 h-4 mr-2" />Encuesta
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => navigate(`/clients/${client.id}`)}>
                              <Eye className="w-4 h-4 mr-2" />Detalles
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => navigate(`/orders?clientId=${client.id}`)}>
                              <Truck className="w-4 h-4 mr-2" />Solicitar Equipo
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault();
                                if (!lat || !lng) updateClientGeolocation(client);
                              }}
                              disabled={updatingId === client.id || (!!lat && !!lng)}
                              className={(!!lat && !!lng) ? "opacity-50 cursor-not-allowed" : ""}
                            >
                              <MapPin className="w-4 h-4 mr-2" />
                              {updatingId === client.id ? 'Actualizando...' : (lat && lng ? 'Geo Registrada' : 'Actualizar Geo')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-col items-center gap-2 mt-6">
              <div className="flex justify-center items-center gap-4">
                <Button disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Anterior
                </Button>
                <span>
                  Página {page} de {Math.ceil(totalCount / PAGE_SIZE) || 1}
                </span>
                <Button
                  disabled={page >= Math.ceil(totalCount / PAGE_SIZE)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
              <div className="text-xs text-gray-500">
                Clientes mostrados en esta página: {clients.length} / Total filtrado: {totalCount}
              </div>
            </div>
          </>
        )}

        {visitClient && (
          <Dialog open={!!visitClient} onOpenChange={(open) => !open && setVisitClient(null)}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Registrar Visita a {visitClient?.name}</DialogTitle>
              </DialogHeader>
              <VisitForm client={visitClient} onSave={handleVisitSaved} />
            </DialogContent>
          </Dialog>
        )}

        {salesClient && <SalesDialog client={salesClient} onClose={() => setSalesClient(null)} />}

        {evaluationClient && (
          <Dialog open={!!evaluationClient} onOpenChange={(open) => !open && setEvaluationClient(null)}>
            <DialogContent className="max-w-md bg-slate-900 border border-white/10 text-white">
              <DialogHeader>
                <DialogTitle className="text-white">Evaluar {evaluationClient?.business_name || evaluationClient?.name}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3 py-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Evaluaciones Manuales (Flujo Actual)
                </div>
                <Button
                  onClick={() =>
                    navigate(
                      `/evaluaciones/nueva` +
                      `?clientId=${encodeURIComponent(evaluationClient.id)}` +
                      `&pv=${encodeURIComponent(evaluationClient.business_name || evaluationClient.name || '')}` +
                      `&client_code=${encodeURIComponent(evaluationClient.client_code || '')}` +
                      `&nivel=${encodeURIComponent(evaluationClient.level || '')}`
                    )
                  }
                >
                  🧊 PDV (Enfriador Tradicional)
                </Button>

                <Button
                  className="bg-amber-600 hover:bg-amber-500 text-white"
                  onClick={() => navigate('/evaluacion/canal-moderno?mode=oxxo', { state: { client: evaluationClient, mode: 'oxxo' } })}
                >
                  🏪 NUEVA EVALUACIÓN OXXO
                </Button>

                <Button
                  variant="secondary"
                  onClick={() => navigate('/evaluacion/canal-moderno?mode=modern', { state: { client: evaluationClient, mode: 'modern' } })}
                >
                  🏢 CANAL MODERNO (Autoservicio)
                </Button>

                <div className="my-1 border-t border-white/10 pt-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-2.5">
                    <span>🤖 Nuevas Evaluaciones con Inteligencia Artificial (Pruebas)</span>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <Button
                      className="bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold shadow-md"
                      onClick={() =>
                        navigate(
                          `/evaluaciones/nueva` +
                          `?clientId=${encodeURIComponent(evaluationClient.id)}` +
                          `&pv=${encodeURIComponent(evaluationClient.business_name || evaluationClient.name || '')}` +
                          `&client_code=${encodeURIComponent(evaluationClient.client_code || '')}` +
                          `&nivel=${encodeURIComponent(evaluationClient.level || '')}` +
                          `&ai=1`
                        )
                      }
                    >
                      🤖 PDV con IA (Enfriador por Tamaño y Parrillas)
                    </Button>

                    <Button
                      className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold shadow-md"
                      onClick={() => navigate('/evaluacion/canal-moderno?mode=oxxo&ai=1', { state: { client: evaluationClient, mode: 'oxxo', ai: true } })}
                    >
                      🤖 NUEVA EVALUACIÓN OXXO con IA
                    </Button>

                    <Button
                      className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold shadow-md"
                      onClick={() => navigate('/evaluacion/canal-moderno?mode=modern&ai=1', { state: { client: evaluationClient, mode: 'modern', ai: true } })}
                    >
                      🤖 CANAL MODERNO con IA (Autoservicio)
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {salesClient && <SalesDialog client={salesClient} onClose={() => setSalesClient(null)} />}

        {/* Survey panel selector */}
        <SurveyPanelSelector
          open={!!censusClient && !surveyType}
          client={censusClient}
          onClose={() => { setCensusClient(null); setSurveyType(null); }}
          onSelect={(type) => {
            if (type === 'CENSO_SUPERVISOR') {
              setSurveyType(type);
            } else {
              // Dynamic survey
              navigate(`/supervisor/custom-survey/${censusClient.id}/${type}`);
            }
          }}
        />

        {/* Censo Supervisor form dialog */}
        {censusClient && surveyType === 'CENSO_SUPERVISOR' && (
          <Dialog open onOpenChange={() => { setCensusClient(null); setSurveyType(null); }}>
            <DialogContent className="max-w-lg bg-slate-950 border border-white/10 text-white">
              <DialogHeader>
                <DialogTitle className="text-white text-sm font-bold">
                  🧊 Censo Supervisor — {censusClient.name || censusClient.business_name}
                </DialogTitle>
              </DialogHeader>
              <CensoSupervisorForm
                client={censusClient}
                user={user}
                onClose={() => { setCensusClient(null); setSurveyType(null); }}
                onSaved={() => { setCensusClient(null); setSurveyType(null); }}
              />
            </DialogContent>
          </Dialog>
        )}
        {/* Registration Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogContent className="max-w-2xl bg-slate-900 text-white border-white/10">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <Plus className="text-emerald-400" />
                        Alta de Nuevo Cliente
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSaveNewClient} className="space-y-4 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="business_name" className="text-slate-400">Nombre del Negocio (Obligatorio)</Label>
                            <Input 
                                id="business_name"
                                value={newClient.business_name}
                                onChange={e => setNewClient({...newClient, business_name: e.target.value.toUpperCase()})}
                                className="bg-slate-800 border-white/10"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="contact_name" className="text-slate-400">Nombre del Contacto</Label>
                            <Input 
                                id="contact_name"
                                value={newClient.name}
                                onChange={e => setNewClient({...newClient, name: e.target.value.toUpperCase()})}
                                className="bg-slate-800 border-white/10"
                            />
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <Label htmlFor="address" className="text-slate-400">Dirección Completa (Obligatorio)</Label>
                        <Input 
                            id="address"
                            value={newClient.address}
                            onChange={e => setNewClient({...newClient, address: e.target.value})}
                            className="bg-slate-800 border-white/10"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="phone" className="text-slate-400">Teléfono</Label>
                            <Input 
                                id="phone"
                                value={newClient.phone}
                                onChange={e => setNewClient({...newClient, phone: e.target.value})}
                                className="bg-slate-800 border-white/10"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="level" className="text-slate-400">Nivel de Cliente</Label>
                            <Select value={newClient.level} onValueChange={val => setNewClient({...newClient, level: val})}>
                                <SelectTrigger className="bg-slate-800 border-white/10">
                                    <SelectValue placeholder="Seleccionar nivel" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="BRONCE">BRONCE</SelectItem>
                                    <SelectItem value="PLATA">PLATA</SelectItem>
                                    <SelectItem value="ORO">ORO</SelectItem>
                                    <SelectItem value="PLATINO">PLATINO</SelectItem>
                                    <SelectItem value="TITANIO">TITANIO</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-slate-400">Ruta de Venta</Label>
                            <Select value={newClient.sales_route} onValueChange={val => setNewClient({...newClient, sales_route: val})}>
                                <SelectTrigger className="bg-slate-800 border-white/10">
                                    <SelectValue placeholder="Seleccionar ruta" />
                                </SelectTrigger>
                                <SelectContent>
                                    {(allowedRoutes?.sales || []).map(r => (
                                        <SelectItem key={r} value={r}>{r}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-slate-400">Zona Comercial</Label>
                            <Select value={newClient.zona_comercial} onValueChange={val => setNewClient({...newClient, zona_comercial: val})}>
                                <SelectTrigger className="bg-slate-800 border-white/10">
                                    <SelectValue placeholder="Seleccionar zona" />
                                </SelectTrigger>
                                <SelectContent>
                                    {(allowedRoutes?.zones || []).map(z => (
                                        <SelectItem key={z} value={z}>{z}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <DialogFooter className="pt-6">
                        <Button type="button" variant="ghost" onClick={() => setIsAddDialogOpen(false)} disabled={isSaving}>
                            Cancelar
                        </Button>
                        <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-bold" disabled={isSaving}>
                            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                            {isSaving ? "Guardando..." : "Registrar Cliente"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
      </div>


    </>
  );
}
