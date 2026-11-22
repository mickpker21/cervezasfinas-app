import React, { useEffect, useMemo, useRef, useState } from 'react';
import InteractiveMap from '@/components/common/InteractiveMap';
import { Link, useLocation } from 'react-router-dom';
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
import { Plus, Building2, MapPin, Tag, FileText, Snowflake, User, Copy, Eye, CopyCheckIcon } from 'lucide-react';
import { getCurrentPositionSafe } from '@/lib/geolocation';
import BarcodeScanner from 'react-qr-barcode-scanner';
import { fetchVentasPorSku } from '@/lib/mysqlVentasPorSku';
import { getClientsPaged, getClientByCode, createClient, updateClient } from '@/repositories/clientsRepository';

// (Opcional) Endpoint de backend, si se usa
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
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
  const isControlInterno = userType === 'control-interno' || userType === 'control interno';
  const isConquista = userType === 'conquista';
  const isSupervisor = userType === 'supervisor';
  const isGerente = userType === 'gerente';
  const isAdmin = userType === 'admin' || (user?.user_metadata?.type || '').toLowerCase() === 'administrador';

  // Estado principal
  const [clients, setClients] = useState([]);
  const [profileRoute, setProfileRoute] = useState(null); // route tomada de profiles.route (fuente de verdad)
  const [avgSales3m, setAvgSales3m] = useState({});
  const [lastVisitReason, setLastVisitReason] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [zonaFilter, setZonaFilter] = useState('');
  const [internalRouteFilter, setInternalRouteFilter] = useState('');
  const [salesRouteFilter, setSalesRouteFilter] = useState('');

  // Paginación (no aplica a Conquista)
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Formulario agregar/editar
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  // Sincronizar newClient con editingClient al abrir el diálogo
  useEffect(() => {
    if (editingClient) {
      setNewClient({
        client_code: editingClient.client_code || '',
        name: editingClient.name || '',
        business_name: editingClient.business_name || '',
        type: editingClient.type || '',
        address: editingClient.address || '',
        level: editingClient.level || '',
        exclusivity: editingClient.exclusivity || '',
        internal_route: editingClient.internal_route || '',
        sales_route: editingClient.sales_route || '',
        phone: editingClient.phone || '',
        coords: editingClient.coords || { lat: '', lng: '' },
        comments: editingClient.comments || '',
      });
    }
  }, [editingClient]);
  const [newClient, setNewClient] = useState({
    client_code: '',
    name: '',
    business_name: '',
    type: '',
    address: '',
    level: '',
    exclusivity: '',
    internal_route: user?.user_metadata?.route || '',
    sales_route: '',
    phone: '',
    coords: { lat: '', lng: '' },
    comments: '',
    cooler_serials: [],
  });

  // Carga automática de internal_route en el formulario cuando abres el diálogo
  useEffect(() => {
    const fetchProfileRouteForForm = async () => {
      if (isAddDialogOpen && user) {
        try {
          const { data, error } = await supabase.from('profiles').select('route').eq('id', user.id).single();
          if (!error && data?.route) setNewClient((prev) => ({ ...prev, internal_route: data.route }));
        } catch (err) {
          // Silently ignore profile route fetch errors for the form (keep existing value)
          console.debug('fetchProfileRouteForForm error:', err);
        }
      }
    };
    fetchProfileRouteForForm();
  }, [isAddDialogOpen, user]);

  // Carga de profileRoute (fuente de verdad para Conquista)
  useEffect(() => {
    const loadProfileRoute = async () => {
      if (user && isConquista) {
        try {
          const { data, error } = await supabase.from('profiles').select('route').eq('id', user.id).single();
          const route = !error && data?.route ? data.route : user?.user_metadata?.route || null;
          setProfileRoute(route);
        } catch (err) {
          console.debug('loadProfileRoute error:', err);
          setProfileRoute(user?.user_metadata?.route || null);
        }
      }
    };
    loadProfileRoute();
  }, [user, isConquista]);

  // Fetch de clientes — evita doble filtrado para Conquista (búsqueda global con texto)
  // Fetch de clientes — reemplazado por versión MySQL/API
  const fetchClients = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const isAdminLike = isControlInterno || userType === 'admin' || user?.user_metadata?.type === 'Administrador';
      const q = (searchTerm || '').trim();
      const filters = {};
      if (q) filters.search = q;

      let data = [];
      let count = 0;

      if (isAdminLike) {
        // Admin / Control Interno
        const res = await getClientsPaged({ page, pageSize: PAGE_SIZE, filters });
        data = res.data;
        count = res.count;

      } else if (isSupervisor || isGerente) {
        // Supervisor/Gerente - OFFLINE SAFE via metadataRepository
        const { getAllowedRoutes } = await import('@/repositories/metadataRepository');
        const allowed = await getAllowedRoutes(user.id);
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

      } else if (isConquista) {
        // Conquista
        const route = profileRoute || user?.user_metadata?.route || null;
        if (!route) {
          setClients([]); setTotalCount(0); setLoading(false); return;
        }
        filters.internal_route = route;
        const res = await getClientsPaged({ page, pageSize: PAGE_SIZE, filters });
        data = res.data;
        count = res.count;

      } else {
        // Otros usuarios
        filters.owner_id = user.id;
        const res = await getClientsPaged({ page, pageSize: PAGE_SIZE, filters });
        data = res.data;
        count = res.count;
      }

      setClients(data);
      setTotalCount(count ?? 0);

    } catch (e) {
      console.error('Excepción al consultar clients:', e);
      setClients([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [user?.id, page, isConquista, profileRoute, searchTerm, isControlInterno, userType, isSupervisor, isGerente]);

  // Carga de clientes cuando cambian dependencias relevantes
  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Último motivo de visita por cliente
  useEffect(() => {
    const loadLastReasons = async () => {
      if (!clients || clients.length === 0) {
        setLastVisitReason({});
        return;
      }
      const ids = clients.map((c) => c.id).filter(Boolean);
      if (ids.length === 0) {
        setLastVisitReason({});
        return;
      }

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
          if (error) {
            console.error('Error visitas chunk (last reason):', error);
            continue;
          }
          if (data && data.length) allRows.push(...data);
        } catch (e) {
          console.error('Exception fetching visitas chunk (last reason):', e);
        }
      }

      // ensure newest first and pick first motivo per client
      allRows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const map = {};
      (allRows || []).forEach((r) => {
        if (!map[r.client_id]) map[r.client_id] = r.motivo || '';
      });
      setLastVisitReason(map);
    };
    loadLastReasons();
  }, [clients]);

  // Promedio de ventas 3 meses
  useEffect(() => {
    const loadAverages = async () => {
      if (!clients || clients.length === 0) {
        setAvgSales3m({});
        return;
      }
      const ids = clients.map((c) => c.id);

      // últimos 3 primeros-de-mes (incluyendo el mes actual)
      const months = [];
      const d = new Date();
      for (let i = 0; i < 3; i++) {
        const y = d.getFullYear();
        const m = d.getMonth() + 1; // 1..12
        const first = `${y}-${String(m).padStart(2, '0')}-01`;
        months.push(first);
        d.setMonth(d.getMonth() - 1);
      }

      const idsFiltered = ids.filter(Boolean);
      if (idsFiltered.length === 0) {
        setAvgSales3m({});
        return;
      }

      const chunkSize = 100;
      const allRows = [];
      for (let i = 0; i < idsFiltered.length; i += chunkSize) {
        const chunk = idsFiltered.slice(i, i + chunkSize);
        try {
          const { data, error } = await supabase
            .from('client_sales')
            .select('client_id, period_date, amount')
            .in('client_id', chunk)
            .in('period_date', months);
          if (error) {
            console.error('Error client_sales chunk:', error);
            continue;
          }
          if (data && data.length) allRows.push(...data);
        } catch (e) {
          console.error('Exception fetching client_sales chunk:', e);
        }
      }

      const sumByClient = {};
      (allRows || []).forEach((r) => {
        sumByClient[r.client_id] = (sumByClient[r.client_id] || 0) + Number(r.amount || 0);
      });
      const res = {};
      idsFiltered.forEach((id) => {
        res[id] = (sumByClient[id] || 0) / 3;
      });
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
    if (!code) {
      setIsCodeDuplicate(false);
      return;
    }

    setIsCodeChecking(true);
    if (codeCheckTimer.current) window.clearTimeout(codeCheckTimer.current);

    codeCheckTimer.current = window.setTimeout(async () => {
      try {
        const existing = await getClientByCode(code);
        if (existing && existing.id !== editingClient?.id) {
          setIsCodeDuplicate(true);
        } else {
          setIsCodeDuplicate(false);
        }
      } catch (e) {
        setIsCodeDuplicate(false);
      } finally {
        setIsCodeChecking(false);
      }
    }, 400);

    return () => {
      if (codeCheckTimer.current) window.clearTimeout(codeCheckTimer.current);
    };
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
          data.forEach((p) => {
            obj[p.photo_type] = p.photo_url;
          });
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
    await supabase
      .from('client_photos')
      .upsert(
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
        toast({
          title: 'Primero guarda el cliente',
          description: 'Debes guardar el cliente antes de subir fotos.',
          variant: 'destructive',
        });
      }
    }
  };

  // Permisos de edición
  const canEditAny = (user?.user_metadata?.type !== 'asesor-dinamico') && !isControlInterno && !isSupervisor && !isGerente;
  const canEditLimitedGerente = isGerente; // solo ruta de ventas y teléfono

  const resetForm = () => {
    setNewClient({
      client_code: '',
      name: '',
      business_name: '',
      type: '',
      address: '',
      level: '',
      exclusivity: '',
      internal_route: user?.user_metadata?.route || '',
      sales_route: '',
      phone: '',
      coords: { lat: '', lng: '' },
      comments: '',
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

  const handleSaveClient = async () => {
    // Si no es gerente, aplican validaciones de requeridos
    if (!isGerente && (!newClient.name || !newClient.business_name || !newClient.address)) {
      toast({ title: 'Error', description: 'Por favor completa los campos obligatorios.', variant: 'destructive' });
      return;
    }

    const clientCode = newClient.client_code && newClient.client_code.trim() !== '' ? newClient.client_code.trim() : null;
    let clientData = {
      ...newClient,
      client_code: clientCode,
      cooler_serials: Array.isArray(newClient.cooler_serials) ? newClient.cooler_serials : [],
    };
    if ('photos' in clientData) delete clientData.photos;
    if ('id' in clientData) delete clientData.id;

    try {
      // Si Conquista y NO edita: intenta asociar un cliente existente por código
      if (isConquista && !editingClient && clientCode) {
        let existing;
        let findError;
        try { existing = await getClientByCode(clientCode); } catch (e) { findError = e; }

        // Si hay error distinto a not-found, muéstralo
        if (findError && findError.code !== 'PGRST116') {
          toast({ title: 'Error consultando cliente', description: findError.message, variant: 'destructive' });
          return;
        }

        if (existing && existing.id) {
          // Abre modal para editar y agregar a la ruta
          setIsAddDialogOpen(false);
          setTimeout(() => {
            setExistingClientData(existing);
            setShowExistsDialog(true);
          }, 150);
          return;
        }
        // Si no existe, permitimos crear uno nuevo normalmente
      }

      if (clientCode && isCodeDuplicate && !isConquista) {
        toast({ title: 'Código de cliente duplicado', description: 'Ya existe un cliente con ese código. Por favor elige otro.', variant: 'destructive' });
        return;
      }

      let result;
      try {
        if (editingClient?.id) {
          if (isGerente) {
            // Gerente: specific update
            await updateClient(editingClient.id, { sales_route: newClient.sales_route, phone: newClient.phone });
          } else {
            await updateClient(editingClient.id, clientData);
          }
        } else {
          // Seguridad extra: el gerente no puede crear clientes
          if (isGerente) {
            toast({ title: 'Permiso denegado', description: 'El gerente no puede crear clientes.', variant: 'destructive' });
            return;
          }
          await createClient(clientData);
        }
        result = { error: null };
      } catch (e) {
        result = { error: e };
      }

      if (result.error) {
        const err = result.error;
        if (err.code === '23505' || (err.message && err.message.includes('duplicate key value'))) {
          toast({ title: 'Código de cliente duplicado', description: 'Ya existe un cliente con ese código. Por favor elige otro.', variant: 'destructive' });
        } else {
          toast({ title: 'Error', description: err.message, variant: 'destructive' });
        }
      } else {
        await fetchClients();
        toast({ title: `¡Cliente ${editingClient ? 'actualizado' : 'agregado'}!`, description: 'Los datos se han guardado correctamente.' });
        setIsAddDialogOpen(false);
        resetForm();
      }
    } catch (err) {
      toast({ title: 'Error inesperado', description: String(err?.message || err), variant: 'destructive' });
      console.error('Error inesperado al guardar cliente:', err);
    }
  };

  // Modal de cliente existente (Conquista)
  const [showExistsDialog, setShowExistsDialog] = useState(false);
  const [existingClientData, setExistingClientData] = useState(null);

  // Exportar CSV
  const handleExportClients = () => {
    const rows = filteredClients.map((c) => ({
      codigo: c.client_code || '',
      id: c.id || '',
      nombre: c.name || '',
      negocio: c.business_name || '',
      giro: c.type || '',
      direccion: c.address || '',
      nivel: c.level || '',
      condicion: c.exclusivity || '',
      ruta_interna: c.internal_route || '',
      ruta_venta: c.sales_route || '',
      telefono: c.phone || '',
      creado_por_id: c.owner_id || '',
      lat: c.coords?.lat ?? '',
      lng: c.coords?.lng ?? '',
      ultimo_motivo_visita: lastVisitReason[c.id] || '',
      venta_actual_hl: avgSales3m[c.id] ? Number(avgSales3m[c.id]) : '',
    }));

    if (!rows.length) {
      toast({ title: 'No hay clientes para exportar', description: 'Ajusta la búsqueda o agrega clientes.', variant: 'destructive' });
      return;
    }

    const date = getTodayMexico(); // Mexico timezone
    const headers = [
      'codigo',
      'id',
      'nombre',
      'negocio',
      'giro',
      'direccion',
      'nivel',
      'condicion',
      'ruta_interna',
      'ruta_venta',
      'telefono',
      'creado_por_id',
      'lat',
      'lng',
      'ultimo_motivo_visita',
      'venta_actual_hl',
    ];

    const escape = (val) => {
      const s = String(val ?? '');
      return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };

    const lines = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clientes_cervezas_finas_${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: '¡Exportación exitosa!', description: 'Se descargó el listado de clientes.' });
  };

  // Búsqueda local
  const filteredClients = useMemo(() => {
    const q = (searchTerm || '').toLowerCase();
    // apply text search first
    let list = (clients || []).filter((client) => {
      if (!q) return true;
      return (
        (client.name && client.name.toLowerCase().includes(q)) ||
        (client.business_name && client.business_name.toLowerCase().includes(q)) ||
        (client.address && client.address.toLowerCase().includes(q)) ||
        (client.client_code && String(client.client_code).toLowerCase().includes(q))
      );
    });

    // apply zona/internal/sales filters if set
    const norm = (v) => (v || '').toString().replace(/\.xlsx$/i, '').trim();
    if (zonaFilter) {
      list = list.filter((c) => (norm(c.zona || '') || '').toLowerCase() === zonaFilter.toLowerCase());
    }
    if (internalRouteFilter) {
      list = list.filter((c) => (norm(c.internal_route || '') || '').toLowerCase() === internalRouteFilter.toLowerCase());
    }
    if (salesRouteFilter) {
      list = list.filter((c) => (norm(c.sales_route || '') || '').toLowerCase() === salesRouteFilter.toLowerCase());
    }

    return list;
  }, [clients, searchTerm, zonaFilter, internalRouteFilter, salesRouteFilter]);

  // Visitas
  const [visitClient, setVisitClient] = useState(null);
  const [showScanner, setShowScanner] = useState(false);

  return (
    <>
      <Helmet>
        <title>Mis Clientes - Cervezas Finas</title>
      </Helmet>

      <div className="container mx-auto py-8">
        <h1 className="text-2xl font-bold mb-6">Mis Clientes</h1>

        <div className="mb-4 flex flex-col md:flex-row md:items-center gap-2">
          <Input
            placeholder="Buscar por nombre, negocio, dirección o código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:max-w-xs"
          />

          {/* Filtros adicionales: Zona, Ruta interna, Ruta de venta */}
          <div className="flex flex-col md:flex-row items-center gap-2 w-full">
            <Select value={zonaFilter === '' ? '__all__' : zonaFilter} onValueChange={(val) => setZonaFilter(val === '__all__' ? '' : val)}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="Filtrar zona" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {Array.from(new Set((clients || []).map((c) => (c.zona || '').replace(/\.xlsx$/i, '').trim()).filter(Boolean))).map((z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={internalRouteFilter === '' ? '__all__' : internalRouteFilter} onValueChange={(val) => setInternalRouteFilter(val === '__all__' ? '' : val)}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="Filtrar ruta interna" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {Array.from(new Set((clients || []).map((c) => (c.internal_route || '').trim()).filter(Boolean))).map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={salesRouteFilter === '' ? '__all__' : salesRouteFilter} onValueChange={(val) => setSalesRouteFilter(val === '__all__' ? '' : val)}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="Filtrar ruta de venta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {Array.from(new Set((clients || []).map((c) => (c.sales_route || '').trim()).filter(Boolean))).map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isControlInterno && !isSupervisor && !isGerente && (
            <Button
              onClick={() => {
                setEditingClient(null);
                setIsAddDialogOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1" /> Agregar Cliente
            </Button>
          )}

          <Button variant="outline" onClick={handleExportClients}>
            Exportar Excel
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
            <div>
              <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                {filteredClients.map((client) => (
                  <div key={client.id} className="bg-white rounded-lg shadow p-5 flex flex-col gap-2 border">
                    <div className="text-xs text-black">Código: {client.client_code || '—'}</div>
                    <div className="font-semibold text-lg text-black break-words leading-tight">{client.name}</div>
                    <div className="text-black text-sm">Nivel (GEC): {client.level || '—'}</div>
                    <div className="text-black text-sm">Condición: {client.exclusivity || '—'}</div>
                    <div className="text-black text-sm">Venta actual: {avgSales3m[client.id] ? `${Number(avgSales3m[client.id]).toLocaleString('es-MX')} HL` : '—'}</div>
                    <div className="text-black text-sm">{client.address}</div>
                    <div className="text-xs font-semibold text-black">Ruta de ventas: {client.sales_route || 'No asignada'}</div>

                    {isControlInterno ? <ClientEvaluationsList client={client} /> : <ClientVisitsList clientId={client.id} />}

                    <div className="flex gap-2 mt-2">
                      {/* Ocultar Evaluar para Conquista, Supervisor y Gerente */}
                      {!isConquista && !isSupervisor && !isGerente && (
                        <Link
                          to={`/evaluaciones/nueva?clientId=${encodeURIComponent(client.id)}&client_code=${encodeURIComponent(
                            client.client_code || ''
                          )}&name=${encodeURIComponent(client.name || '')}&pv=${encodeURIComponent(
                            client.business_name || client.name || ''
                          )}&nivel=${encodeURIComponent(client.level || client.type || '')}`}
                        >
                          <Button size="sm" variant="outline" className="crm-accent-text crm-accent-border">
                            Evaluar
                          </Button>
                        </Link>
                      )}

                      {!isControlInterno && !isSupervisor && !isGerente && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="crm-accent-text crm-accent-border"
                          onClick={() => setVisitClient(client)}
                        >
                          Visitar
                        </Button>
                      )}

                      {/* Ver detalles */}
                      <Link to={`/clients/${encodeURIComponent(client.id)}`}>
                        <Button size="sm" variant="outline" aria-label={`Ver detalles de ${client.name}`}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>

                      {(canEditAny || canEditLimitedGerente) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingClient(client);
                            setNewClient({
                              client_code: client.client_code || '',
                              name: client.name || '',
                              business_name: client.business_name || '',
                              type: client.type || '',
                              address: client.address || '',
                              level: client.level || '',
                              exclusivity: client.exclusivity || '',
                              internal_route: client.internal_route || '',
                              sales_route: client.sales_route || '',
                              phone: client.phone || '',
                              coords: client.coords || { lat: '', lng: '' },
                              comments: client.comments || '',
                            });
                            setIsAddDialogOpen(true);
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                      {/* Botón de eliminar removido */}
                    </div>
                  </div>
                ))}
              </div>

              {/* Controles de paginación: NO mostrar para Conquista (sin paginación) */}
              {!(isConquista && (profileRoute || user?.user_metadata?.route)) && (
                <div className="flex justify-center items-center gap-4 mt-6">
                  <Button disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Anterior
                  </Button>
                  <span>
                    Página {page} de {Math.ceil(totalCount / PAGE_SIZE) || 1}
                  </span>
                  <Button disabled={page >= Math.ceil(totalCount / PAGE_SIZE)} onClick={() => setPage((p) => p + 1)}>
                    Siguiente
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Dialog agregar/editar */}
        <Dialog
          open={isAddDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setIsAddDialogOpen(false);
              setEditingClient(null);
            }
          }}
        >
          <DialogContent aria-describedby="desc-client-dialog">
            <div id="desc-client-dialog" className="sr-only">
              Formulario para agregar o editar cliente
            </div>
            <DialogHeader>
              <DialogTitle>{editingClient ? 'Editar Cliente' : 'Agregar Cliente'}</DialogTitle>
            </DialogHeader>

            <div className="px-2 md:px-6 max-h-[80vh] w-full md:max-w-lg overflow-y-auto">
              <form onSubmit={(e) => { e.preventDefault(); handleSaveClient(); }} className="space-y-4 overflow-visible z-50">
                <div>
                  <Input
                    placeholder="Código de Cliente (manual)"
                    value={newClient.client_code}
                    onChange={(e) => setNewClient({ ...newClient, client_code: e.target.value })}
                    disabled={isGerente}
                    className={`${isCodeDuplicate ? 'border-red-500 focus-visible:ring-red-600' : ''} ${isCodeChecking && !isCodeDuplicate ? 'border-yellow-500' : ''
                      }`}
                  />
                  {isCodeChecking && <div className="text-xs text-yellow-600 mt-1">Verificando código...</div>}
                  {!isCodeChecking && isCodeDuplicate && !isConquista && (
                    <div className="text-xs text-red-600 mt-1">Ya existe un cliente con ese código.</div>
                  )}
                </div>

                <Input
                  placeholder="Nombre"
                  value={newClient.name}
                  onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                  required
                  disabled={isGerente}
                />
                <Input
                  placeholder="Nombre Comercial"
                  value={newClient.business_name}
                  onChange={(e) => setNewClient({ ...newClient, business_name: e.target.value })}
                  required
                  disabled={isGerente}
                />
                <Input
                  placeholder="Dirección"
                  value={newClient.address}
                  onChange={(e) => setNewClient({ ...newClient, address: e.target.value })}
                  required
                  disabled={isGerente}
                />
                <Input
                  placeholder="Teléfono"
                  value={newClient.phone}
                  onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                  disabled={!(isGerente || canEditAny)}
                />

                <Label>Nivel (GEC)</Label>
                <Select value={newClient.level} onValueChange={(val) => setNewClient({ ...newClient, level: val })} required disabled={isGerente}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona nivel" />
                  </SelectTrigger>
                  <SelectContent className="z-[10000]">
                    <SelectItem value="BRONCE">BRONCE</SelectItem>
                    <SelectItem value="PLATA">PLATA</SelectItem>
                    <SelectItem value="ORO">ORO</SelectItem>
                    <SelectItem value="PLATINO">PLATINO</SelectItem>
                    <SelectItem value="TITANIO">TITANIO</SelectItem>
                  </SelectContent>
                </Select>

                <Label>Tipo de Cliente</Label>
                <Select value={newClient.type} onValueChange={(val) => setNewClient({ ...newClient, type: val })} required disabled={isGerente}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona tipo" />
                  </SelectTrigger>
                  <SelectContent className="z-[10000]">
                    <SelectItem value="punto de venta">Punto de Venta</SelectItem>
                    <SelectItem value="centro de consumo">Centro de Consumo</SelectItem>
                    <SelectItem value="canal moderno">Canal Moderno</SelectItem>
                  </SelectContent>
                </Select>

                <Label>Condición</Label>
                <Select
                  value={newClient.exclusivity}
                  onValueChange={(val) => setNewClient({ ...newClient, exclusivity: val })}
                  required
                  disabled={isGerente}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona condición" />
                  </SelectTrigger>
                  <SelectContent className="z-[10000]">
                    <SelectItem value="Mixto">Mixto</SelectItem>
                    <SelectItem value="Competencia">Competencia</SelectItem>
                    <SelectItem value="Exclusivo">Exclusivo</SelectItem>
                  </SelectContent>
                </Select>

                <Label>Ruta de Ventas</Label>
                <Input
                  placeholder="Ruta de ventas"
                  value={newClient.sales_route}
                  onChange={(e) => setNewClient({ ...newClient, sales_route: e.target.value })}
                  disabled={!(isAdmin || isConquista || isGerente)}
                />

                <Label>Ruta Interna</Label>
                <Input placeholder="Ruta interna" value={newClient.internal_route} readOnly disabled />

                <div className="flex items-center gap-2">
                  <Label>Ubicación</Label>
                  <Button type="button" variant="outline" onClick={handleGeolocation} disabled={isGerente}>
                    <MapPin className="w-4 h-4 mr-1" /> Capturar ubicación
                  </Button>
                  {newClient.coords.lat && newClient.coords.lng && (
                    <span className="text-xs text-green-600">{`Lat: ${newClient.coords.lat}, Lng: ${newClient.coords.lng}`}</span>
                  )}
                </div>

                {editingClient && !isGerente && (
                  <div className="flex items-center gap-2">
                    <Label>Foto del Cliente</Label>
                    <Button type="button" variant="outline" onClick={() => startCamera('facade')}>
                      <Camera className="w-4 h-4 mr-1" /> Tomar foto
                    </Button>
                    {clientPhotos.facade && (
                      <img src={clientPhotos.facade} alt="Foto fachada" className="w-16 h-16 object-cover rounded" />
                    )}
                  </div>
                )}

                <Textarea
                  placeholder="Comentarios"
                  value={newClient.comments}
                  onChange={(e) => setNewClient({ ...newClient, comments: e.target.value })}
                  disabled={isGerente}
                />

                {!isGerente && (
                  <>
                    <Label>Seriales de enfriadores</Label>
                    <Input
                      placeholder="Agregar serial manualmente"
                      value={Array.isArray(newClient.cooler_serials) ? newClient.cooler_serials.join(', ') : ''}
                      onChange={(e) => {
                        const val = e.target.value || '';
                        const arr = val
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean);
                        setNewClient({ ...newClient, cooler_serials: arr });
                      }}
                    />
                    <Button type="button" variant="outline" onClick={() => setShowScanner(true)}>
                      Escanear código de barras
                    </Button>
                  </>
                )}

                {!isGerente && showScanner && (
                  <div className="mt-2">
                    <BarcodeScanner
                      onUpdate={async (err, result) => {
                        // Debug: log errors and results to console to help diagnose scanning issues
                        console.debug('ClientsPage BarcodeScanner onUpdate', { err, result });
                        if (err) {
                          console.debug('BarcodeScanner error:', err);
                          return;
                        }
                        if (result?.text) {
                          const scanned = result.text;
                          let serials = Array.isArray(newClient.cooler_serials) ? newClient.cooler_serials : [];
                          if (serials.includes(scanned)) {
                            window.alert('¡El código de enfriador es correcto y ya está registrado!');
                            setNewClient({ ...newClient, cooler_serials: serials });
                          } else {
                            window.alert('El código de enfriador no coincide, se actualizará el registro.');
                            const updatedSerials = [...serials, scanned];
                            setNewClient({ ...newClient, cooler_serials: updatedSerials });
                          }
                          setShowScanner(false);
                        }
                      }}
                      // Explicit constraints increase chance of correct camera selection and sizing
                      constraints={{ video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } } }}
                      style={{ width: '100%' }}
                    />
                    <Button variant="ghost" size="sm" onClick={() => setShowScanner(false)}>
                      Cancelar
                    </Button>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsAddDialogOpen(false);
                      setEditingClient(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit">{editingClient ? 'Actualizar' : 'Agregar'}</Button>
                </div>
              </form>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog para cliente existente (Conquista) */}
        <Dialog
          open={showExistsDialog}
          onOpenChange={(open) => {
            if (!open) {
              setShowExistsDialog(false);
              setExistingClientData(null);
            }
          }}
        >
          <DialogContent aria-describedby="desc-exists-client-dialog">
            <div id="desc-exists-client-dialog" className="text-gray-700 mb-2">
              Cliente ya existe, ¿desea agregarlo a la ruta?
            </div>
            {existingClientData?.id ? (
              <>
                <DialogHeader>
                  <DialogTitle>Este cliente ya existe</DialogTitle>
                </DialogHeader>
                <div className="mb-4 text-black text-base font-medium">¿Desea agregarlo a la ruta y editar su información?</div>
                <div className="mb-2 p-3 rounded bg-gray-50 border">
                  <div>
                    <b>Código:</b> {existingClientData.client_code}
                  </div>
                  <div>
                    <b>Nombre:</b> {existingClientData.name}
                  </div>
                  <div>
                    <b>Negocio:</b> {existingClientData.business_name}
                  </div>
                  <div>
                    <b>Dirección:</b> {existingClientData.address}
                  </div>
                  <div>
                    <b>Ruta actual:</b> {existingClientData.sales_route || 'No asignada'}
                  </div>
                  <div>
                    <b>Geolocalización:</b>{' '}
                    {existingClientData.coords?.lat && existingClientData.coords?.lng
                      ? `${existingClientData.coords.lat}, ${existingClientData.coords.lng}`
                      : 'No asignada'}
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowExistsDialog(false);
                      setExistingClientData(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => {
                      setEditingClient(existingClientData);
                      setNewClient({
                        client_code: existingClientData.client_code || '',
                        name: existingClientData.name || '',
                        business_name: existingClientData.business_name || '',
                        type: existingClientData.type || '',
                        address: existingClientData.address || '',
                        level: existingClientData.level || '',
                        exclusivity: existingClientData.exclusivity || '',
                        internal_route: existingClientData.internal_route || '',
                        sales_route: existingClientData.sales_route || '',
                        phone: existingClientData.phone || '',
                        coords: existingClientData.coords || { lat: '', lng: '' },
                        comments: existingClientData.comments || '',
                      });
                      setShowExistsDialog(false);
                      setIsAddDialogOpen(true);
                    }}
                  >
                    Editar y agregar a ruta
                  </Button>
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
            <div id="desc-visit-dialog" className="sr-only">
              Formulario para registrar visita a cliente
            </div>
            <DialogHeader>
              <DialogTitle>Registrar Visita a {visitClient?.name}</DialogTitle>
            </DialogHeader>
            {visitClient && <VisitForm client={visitClient} onSave={() => { setVisitClient(null); }} />}
          </DialogContent>
        </Dialog>

        {/* Cámara */}
        {isCameraOpen && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-4 w-full max-w-md">
              <div className="text-lg font-semibold mb-2">Tomar foto ({currentPhotoType})</div>
              <video ref={videoRef} autoPlay playsInline className="w-full rounded" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="flex justify-end gap-2 mt-3">
                <Button variant="outline" onClick={stopCamera}>
                  Cancelar
                </Button>
                <Button onClick={takePicture}>Capturar</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
