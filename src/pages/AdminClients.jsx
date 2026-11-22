import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import InteractiveMap from '@/components/common/InteractiveMap';
import { Link, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '../supabaseClient';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import VisitForm from '@/components/VisitForm';
import ClientVisitsList from '@/components/ClientVisitsList';
import ClientEvaluationsList from '@/components/ClientEvaluationsList';
import { Camera, Edit, MapPin, Plus, Eye, ExternalLink, Download, RefreshCw } from 'lucide-react';
import BarcodeScanner from "react-qr-barcode-scanner";
import SalesDialog from '@/components/SalesDialog';
import { getCurrentPositionSafe } from '@/lib/geolocation';
import { getClientsPaged, getClientByCode, createClient, updateClient } from '@/repositories/clientsRepository';
import { getChannels, updateChannel } from '@/repositories/metadataRepository';

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
  const isAdminLike = isControlInterno || userType === 'admin' || userType === 'administrador' || user?.user_metadata?.type === 'Administrador';

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
  const [canalFilter, setCanalFilter] = useState('');

  // Paginación (no aplica a Conquista)
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [channelMap, setChannelMap] = useState({});

  const loadChannels = useCallback(async () => {
    try {
      const data = await getChannels(true); // force refresh
      const m = {};
      data.forEach(r => { if (r.cve_cliente) m[r.cve_cliente] = r.canal; });
      setChannelMap(m);
    } catch (e) {
      console.error('Error loading channels:', e);
    }
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

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
        type: editingClient.client_type || editingClient.type || '',
        address: editingClient.address || '',
        cross_street: editingClient.cross_street || '',
        exterior_number: editingClient.exterior_number || '',
        interior_number: editingClient.interior_number || '',
        colony: editingClient.colony || '',
        postal_code: editingClient.postal_code || '',
        city: editingClient.city || '',
        state: editingClient.state || '',
        reference: editingClient.reference || '',
        level: editingClient.level || '',
        gec: editingClient.gec || '',
        cadena: editingClient.cadena || '',
        region: editingClient.region || '',
        zona_comercial: editingClient.zona_comercial || editingClient.zona || '',
        exclusivity: editingClient.exclusivity || '',
        internal_route: editingClient.internal_route || '',
        sales_route: editingClient.sales_route || '',
        phone: editingClient.phone || '',
        email: editingClient.email || '',
        contact: editingClient.contact || '',
        coords: editingClient.coords || { lat: '', lng: '' },
        comments: editingClient.notes || editingClient.comments || '',
        visit_days: editingClient.visit_days ? (Array.isArray(editingClient.visit_days) ? editingClient.visit_days : String(editingClient.visit_days).split(',')) : [],
        visit_day_televenta: editingClient.visit_day_televenta ? (Array.isArray(editingClient.visit_day_televenta) ? editingClient.visit_day_televenta : String(editingClient.visit_day_televenta).split(',')) : [],
        enfriador: editingClient.enfriador || '',
        cooler_serials: editingClient.cooler_serials || [],
        rfc: editingClient.rfc || '',
        fiscal_name: editingClient.fiscal_name || '',
        fiscal_address: editingClient.fiscal_address || '',
        fiscal_colony: editingClient.fiscal_colony || '',
        fiscal_postal_code: editingClient.fiscal_postal_code || '',
        cedula_ieps: editingClient.cedula_ieps || '',
        sales_modality: editingClient.sales_modality || '',
        ritmo: editingClient.ritmo || '',
        canal: channelMap[editingClient.client_code] || ''
      });
    }
  }, [editingClient, channelMap]);
  const [newClient, setNewClient] = useState({
    client_code: '',
    name: '',
    business_name: '',
    type: '',
    address: '',
    cross_street: '',
    exterior_number: '',
    interior_number: '',
    colony: '',
    postal_code: '',
    city: '',
    state: '',
    reference: '',
    level: '',
    gec: '',
    cadena: '',
    region: '',
    zona_comercial: '',
    exclusivity: '',
    internal_route: user?.user_metadata?.route || '',
    sales_route: '',
    delivery_route: '',
    phone: '',
    email: '',
    contact: '',
    coords: { lat: '', lng: '' },
    comments: '',
    visit_days: [],
    visit_day_televenta: [],
    cooler_serials: [],
    enfriador: '',
    rfc: '',
    fiscal_name: '',
    fiscal_address: '',
    fiscal_colony: '',
    fiscal_postal_code: '',
    cedula_ieps: '',
    sales_modality: '',
    ritmo: '',
    canal: ''
  });


  // Carga automática de internal_route en el formulario cuando abres el diálogo
  useEffect(() => {
    const fetchProfileRouteForForm = async () => {
      if (isAddDialogOpen && user) {
        try {
          const { data, error } = await supabase.from('profiles').select('route').eq('id', user.id).single();
          if (!error && data?.route) setNewClient(prev => ({ ...prev, internal_route: data.route }));
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
          const route = (!error && data?.route) ? data.route : (user?.user_metadata?.route || null);
          setProfileRoute(route);
        } catch (err) {
          console.debug('loadProfileRoute error:', err);
          setProfileRoute(user?.user_metadata?.route || null);
        }
      }
    };
    loadProfileRoute();
  }, [user, isConquista]);

  // Fetch de clientes — reemplazado por versión MySQL/API
  const fetchClients = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
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

      } else if (isSupervisor) {
        // Supervisor: rutas permitidas
        const [{ data: r1 }, { data: r2 }] = await Promise.all([
          supabase.from('supervisor_allowed_routes').select('route').eq('supervisor_id', user.id),
          supabase.from('supervisor_allowed_sales_routes').select('sales_route').eq('supervisor_id', user.id),
        ]);
        const routes = (r1 || []).map((r) => r.route).filter(Boolean);
        const salesRoutes = (r2 || []).map((r) => r.sales_route).filter(Boolean);

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
        // Otros usuarios: por owner_id
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
  }, [user?.id, page, isConquista, profileRoute, searchTerm, isAdminLike, isSupervisor]);

  // Carga de clientes cuando cambian dependencias relevantes
  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Último motivo de visita por cliente
  useEffect(() => {
    const loadLastReasons = async () => {
      if (!clients || clients.length === 0) { setLastVisitReason({}); return; }
      const ids = clients.map(c => c.id).filter(Boolean);
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
      (allRows || []).forEach(r => {
        if (!map[r.client_id]) map[r.client_id] = r.motivo || '';
      });
      setLastVisitReason(map);
    };
    loadLastReasons();
  }, [clients]);

  // Promedio de ventas 3 meses
  useEffect(() => {
    const loadAverages = async () => {
      if (!clients || clients.length === 0) { setAvgSales3m({}); return; }
      const ids = clients.map(c => c.id);

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
      if (idsFiltered.length === 0) { setAvgSales3m({}); return; }

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
      (allRows || []).forEach(r => {
        sumByClient[r.client_id] = (sumByClient[r.client_id] || 0) + Number(r.amount || 0);
      });
      const res = {};
      idsFiltered.forEach(id => { res[id] = (sumByClient[id] || 0) / 3; });
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
          // It's a duplicate only if it belongs to a DIFFERENT client.
          // Compare by id (UUID) AND by client_code to handle format mismatches.
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
          data.forEach(p => { obj[p.photo_type] = p.photo_url; });
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
    setClientPhotos(prev => ({ ...prev, [photoType]: photoUrl }));
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
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
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

  const canEdit = (user?.user_metadata?.type !== 'asesor-dinamico') && !isControlInterno && !isSupervisor;

  const resetForm = () => {
    setNewClient({
      client_code: '',
      name: '',
      business_name: '',
      type: '',
      address: '',
      cross_street: '',
      exterior_number: '',
      interior_number: '',
      colony: '',
      postal_code: '',
      city: '',
      state: '',
      reference: '',
      level: '',
      gec: '',
      cadena: '',
      region: '',
      zona_comercial: '',
      exclusivity: '',
      internal_route: user?.user_metadata?.route || '',
      sales_route: '',
      delivery_route: '',
      phone: '',
      email: '',
      contact: '',
      coords: { lat: '', lng: '' },
      comments: '',
      visit_days: [],
      visit_day_televenta: [],
      cooler_serials: [],
      enfriador: '',
      rfc: '',
      fiscal_name: '',
      fiscal_address: '',
      fiscal_colony: '',
      fiscal_postal_code: '',
      cedula_ieps: '',
      sales_modality: '',
      ritmo: '',
      canal: ''
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
    if (!isAdminLike && (!newClient.name || !newClient.business_name || !newClient.address)) {
      toast({ title: 'Error', description: 'Por favor completa los campos obligatorios.', variant: 'destructive' });
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
      notes: newClient.comments || '' // Sincronizar campo notas con comments
    };
    if ('photos' in clientData) delete clientData.photos;
    if ('id' in clientData) delete clientData.id;
    if ('canal' in clientData) delete clientData.canal; // Se guarda por separado

    try {
      // Si Conquista y NO edita: intenta asociar un cliente existente por código
      if (isConquista && !editingClient && clientCode) {
        let existing;
        let findError;
        try {
          existing = await getClientByCode(clientCode);
        } catch (e) {
          findError = e;
        }

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

      // Block save if code is flagged as duplicate (applies to both create AND edit)
      if (clientCode && isCodeDuplicate) {
        toast({ title: 'Código de cliente duplicado', description: 'Ya existe un cliente con ese código. Por favor elige otro.', variant: 'destructive' });
        return;
      }

      let result;
      try {
        if (editingClient?.id) {
          await updateClient(editingClient.id, clientData);
        } else {
          await createClient(clientData);
        }
        result = { error: null }; // Mock success
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
        // Actualizar canal si ha cambiado
        if (clientCode && newClient.canal) {
          try { await updateChannel(clientCode, newClient.canal); } catch (e) { console.error('Error updating canal:', e); }
        }

        await fetchClients();
        await loadChannels();
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

      if (totalCount > clientsToExport.length) {
        toast({
          title: 'Preparando exportación completa...',
          description: `Descargando toda la tabla de los ${totalCount} clientes...`,
        });

        const exportFilters = {};
        const q = (searchTerm || '').trim();
        if (q) exportFilters.search = q;

        if (isAdminLike) {
          if (zonaFilter && zonaFilter !== '__all__') exportFilters.zona = zonaFilter;
          if (internalRouteFilter && internalRouteFilter !== '__all__') exportFilters.internal_route = internalRouteFilter;
          if (salesRouteFilter && salesRouteFilter !== '__all__') exportFilters.sales_route = salesRouteFilter;
        } else if (isSupervisor) {
          const { getAllowedRoutes } = await import('@/repositories/metadataRepository');
          const allowed = await getAllowedRoutes(user.id);
          const routes = allowed.internal || [];
          const salesRoutes = allowed.sales || [];
          if (routes.length > 0 || salesRoutes.length > 0) {
            exportFilters.internal_routes = routes;
            exportFilters.sales_routes = salesRoutes;
          }
        } else if (isConquista) {
          const route = profileRoute || user?.user_metadata?.route || null;
          if (route) exportFilters.internal_route = route;
        } else {
          exportFilters.owner_id = user.id;
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
          console.warn('[AdminClients] Falló carga masiva para exportación, usando clientes en vista:', fetchErr);
        }
      }

      if (!clientsToExport || clientsToExport.length === 0) {
        toast({ title: 'No hay clientes para exportar', description: 'Ajusta la búsqueda o agrega clientes.', variant: 'destructive' });
        return;
      }

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

      const escape = (val) => {
        if (val === null || val === undefined) return '';
        let s = typeof val === 'object' ? JSON.stringify(val) : String(val);
        s = s.replace(/\r\n/g, ' ').replace(/[\r\n]/g, ' ');
        if (/[",;\n]/.test(s)) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };

      const date = new Date().toISOString().split('T')[0];
      const csvHeaderRow = allColumns.map((col) => escape(col.header)).join(',');
      const csvDataRows = clientsToExport.map((c) =>
        allColumns.map((col) => escape(getClientExportValue(c, col.key))).join(',')
      );

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
      console.error('[AdminClients] Error al exportar clientes:', err);
      toast({
        title: 'Error al exportar',
        description: err?.message || 'Ocurrió un error al generar la exportación.',
        variant: 'destructive'
      });
    } finally {
      setExporting(false);
    }
  };

  // Búsqueda local
  const filteredClients = useMemo(() => {
    const q = (searchTerm || '').toLowerCase();
    // apply text search first
    let list = (clients || []).filter(client => {
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
      list = list.filter(c => (norm(c.zona || '') || '').toLowerCase() === zonaFilter.toLowerCase());
    }
    if (internalRouteFilter) {
      list = list.filter(c => (norm(c.internal_route || '') || '').toLowerCase() === internalRouteFilter.toLowerCase());
    }
    if (salesRouteFilter) {
      list = list.filter(c => (norm(c.sales_route || '') || '').toLowerCase() === salesRouteFilter.toLowerCase());
    }
    if (canalFilter) {
      list = list.filter(c => (channelMap[c.client_code] || '').toLowerCase() === canalFilter.toLowerCase());
    }
    return list;
  }, [clients, searchTerm, zonaFilter, internalRouteFilter, salesRouteFilter, canalFilter, channelMap]);

  // Visitas
  const [visitClient, setVisitClient] = useState(null);
  const [showScanner, setShowScanner] = useState(false);

  // âœ... NUEVO: estado para dialog de Ventas (visible para todos)
  const [salesClient, setSalesClient] = useState(null);

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
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full md:max-w-xs"
          />

          {/* Filtros adicionales: Zona, Ruta interna, Ruta de venta */}
          <div className="flex flex-col md:flex-row items-center gap-2 w-full">
            <Select value={zonaFilter === '' ? '__all__' : zonaFilter} onValueChange={val => setZonaFilter(val === '__all__' ? '' : val)}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="Filtrar zona" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {Array.from(new Set((clients || []).map(c => (c.zona || '').replace(/\.xlsx$/i, '').trim()).filter(Boolean))).map(z => (
                  <SelectItem key={z} value={z}>{z}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={internalRouteFilter === '' ? '__all__' : internalRouteFilter} onValueChange={val => setInternalRouteFilter(val === '__all__' ? '' : val)}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="Filtrar ruta interna" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {Array.from(new Set((clients || []).map(c => (c.internal_route || '').trim()).filter(Boolean))).map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={salesRouteFilter === '' ? '__all__' : salesRouteFilter} onValueChange={val => setSalesRouteFilter(val === '__all__' ? '' : val)}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="Filtrar ruta de venta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {Array.from(new Set((clients || []).map(c => (c.sales_route || '').trim()).filter(Boolean))).map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={canalFilter === '' ? '__all__' : canalFilter} onValueChange={val => setCanalFilter(val === '__all__' ? '' : val)}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="Filtrar canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos los canales</SelectItem>
                {Array.from(new Set(Object.values(channelMap).filter(Boolean))).sort().map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
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
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredClients.map(client => (
                  <div key={client.id} className="bg-white rounded-lg shadow p-5 flex flex-col gap-2 border">
                    <div className="text-xs text-black">Código: {client.client_code || '—'}</div>
                    <div className="font-semibold text-lg text-black">{client.business_name || client.name}</div>
                    {client.business_name && client.name && (
                      <div className="text-xs text-gray-500">{client.name}</div>
                    )}
                    <div className="text-black text-sm">Nivel (GEC): {client.level || '—'}</div>
                    <div className="text-black text-sm">Canal: <span className="font-semibold text-emerald-600">{channelMap[client.client_code] || '—'}</span></div>
                    <div className="text-black text-sm">Condición: {client.exclusivity || '—'}</div>
                    <div className="text-black text-sm">Venta actual: {avgSales3m[client.id] ? `${Number(avgSales3m[client.id]).toLocaleString('es-MX')} HL` : '—'}</div>
                    <div className="text-black text-sm">{client.address}</div>
                    <div className="text-xs font-semibold text-black">Ruta de ventas: {client.sales_route || 'No asignada'}</div>

                    {isControlInterno ? (
                      <ClientEvaluationsList client={client} />
                    ) : (
                      <ClientVisitsList clientId={client.id} />
                    )}

                    <div className="flex gap-2 mt-2 flex-wrap">
                      {/* Botón de ubicación */}
                      {(() => {
                        let coords = null;
                        try { coords = typeof client.coords === 'string' ? JSON.parse(client.coords) : client.coords; } catch (e) { }
                        const lat = coords?.lat ?? coords?.[0];
                        const lng = coords?.lng ?? coords?.[1];
                        return lat && lng ? (
                          <Button size="sm" variant="outline" title="Ver en Google Maps"
                            className="px-2"
                            onClick={() => window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank')}>
                            <MapPin className="w-4 h-4" />
                          </Button>
                        ) : null;
                      })()}
                      {/* Ocultar Evaluar para Conquista */}
                      {!isConquista && !isSupervisor && (
                        <Link to={`/evaluaciones/nueva?clientId=${encodeURIComponent(client.id)}&client_code=${encodeURIComponent(client.client_code || '')}&name=${encodeURIComponent(client.name || '')}&pv=${encodeURIComponent(client.business_name || client.name || '')}&nivel=${encodeURIComponent(client.level || client.type || '')}`}>
                          <Button size="sm" variant="outline" className="crm-accent-text crm-accent-border">Evaluar</Button>
                        </Link>
                      )}

                      {!isControlInterno && !isSupervisor && (
                        <Button size="sm" variant="outline" className="crm-accent-text crm-accent-border" onClick={() => setVisitClient(client)}>
                          Visitar
                        </Button>
                      )}

                      {/* âœ... NUEVO: Ventas (visible para todos) */}
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500"
                        onClick={() => setSalesClient({ ...client, name: client.name || client.business_name || '' })}
                      >
                        Ventas
                      </Button>

                      {/* Ver detalles */}
                      <Link to={`/clients/${encodeURIComponent(client.id)}`}>
                        <Button size="sm" variant="outline" aria-label={`Ver detalles de ${client.name}`}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>

                      {canEdit && (
                        <Button size="sm" variant="outline" onClick={() => {
                          setEditingClient(client);
                          setIsAddDialogOpen(true);
                        }}>
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
                  <Button disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Anterior</Button>
                  <span>Página {page} de {Math.ceil(totalCount / PAGE_SIZE) || 1}</span>
                  <Button disabled={page >= Math.ceil(totalCount / PAGE_SIZE)} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Dialog agregar/editar */}
        <Dialog open={isAddDialogOpen} onOpenChange={open => { if (!open) { setIsAddDialogOpen(false); setEditingClient(null); } }}>
          <DialogContent aria-describedby="desc-client-dialog">
            <div id="desc-client-dialog" className="sr-only">Formulario para agregar o editar cliente</div>
            <DialogHeader>
              <DialogTitle>{editingClient ? 'Editar Cliente' : 'Agregar Cliente'}</DialogTitle>
            </DialogHeader>

            <div className="px-1 md:px-2 max-h-[85vh] w-full overflow-y-auto">
              <form onSubmit={e => { e.preventDefault(); handleSaveClient(); }} className="space-y-4">
                <Tabs defaultValue="general" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto bg-slate-800/50 p-1 rounded-lg">
                    <TabsTrigger value="general" className="data-[state=active]:bg-emerald-600">General</TabsTrigger>
                    <TabsTrigger value="direccion" className="data-[state=active]:bg-emerald-600">Dirección</TabsTrigger>
                    <TabsTrigger value="comercial" className="data-[state=active]:bg-emerald-600">Comercial</TabsTrigger>
                    <TabsTrigger value="operacion" className="data-[state=active]:bg-emerald-600">Operación</TabsTrigger>
                    <TabsTrigger value="fiscal" className="data-[state=active]:bg-emerald-600">Fiscal</TabsTrigger>
                  </TabsList>

                  <TabsContent value="general" className="space-y-4 pt-4">
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label>Código de Cliente</Label>
                        <Input
                          placeholder="ABC001"
                          value={newClient.client_code}
                          onChange={e => setNewClient({ ...newClient, client_code: e.target.value.toUpperCase() })}
                          className={`${isCodeDuplicate ? 'border-red-500 focus-visible:ring-red-600' : ''}`}
                          disabled={!!editingClient && !isAdminLike}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Nombre del Propietario / Contacto</Label>
                        <Input placeholder="Juan Pérez" value={newClient.name} onChange={e => setNewClient({ ...newClient, name: e.target.value })} required={!isAdminLike} />
                      </div>
                      <div className="space-y-2">
                        <Label>Nombre del Negocio</Label>
                        <Input placeholder="Abarrotes La Esperanza" value={newClient.business_name} onChange={e => setNewClient({ ...newClient, business_name: e.target.value })} required={!isAdminLike} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Teléfono</Label>
                          <Input placeholder="5512345678" value={newClient.phone} onChange={e => setNewClient({ ...newClient, phone: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input type="email" placeholder="cliente@correo.com" value={newClient.email} onChange={e => setNewClient({ ...newClient, email: e.target.value })} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Canal (Módulo Supervisor)</Label>
                        <Input placeholder="Ej. Tradicional, Hogar, etc." value={newClient.canal} onChange={e => setNewClient({ ...newClient, canal: e.target.value })} />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="direccion" className="space-y-4 pt-4">
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label>Dirección Completa</Label>
                        <Input placeholder="Av. Principal #123" value={newClient.address} onChange={e => setNewClient({ ...newClient, address: e.target.value })} required={!isAdminLike} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Num. Ext</Label>
                          <Input placeholder="123" value={newClient.exterior_number} onChange={e => setNewClient({ ...newClient, exterior_number: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Num. Int</Label>
                          <Input placeholder="A-1" value={newClient.interior_number} onChange={e => setNewClient({ ...newClient, interior_number: e.target.value })} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Entre Calles / Referencia</Label>
                        <Input placeholder="Esquina con Calle X" value={newClient.cross_street} onChange={e => setNewClient({ ...newClient, cross_street: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Colonia</Label>
                          <Input placeholder="Centro" value={newClient.colony} onChange={e => setNewClient({ ...newClient, colony: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>C.P.</Label>
                          <Input placeholder="12345" value={newClient.postal_code} onChange={e => setNewClient({ ...newClient, postal_code: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Ciudad</Label>
                          <Input placeholder="México" value={newClient.city} onChange={e => setNewClient({ ...newClient, city: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Estado</Label>
                          <Input placeholder="CDMX" value={newClient.state} onChange={e => setNewClient({ ...newClient, state: e.target.value })} />
                        </div>
                      </div>
                      <div className="pt-2">
                        <Button type="button" variant="outline" onClick={handleGeolocation} className="w-full">
                          <MapPin className="w-4 h-4 mr-2" /> Capturar Coordenadas Actuales
                        </Button>
                        {newClient.coords?.lat && (
                          <p className="text-[10px] text-emerald-400 mt-1 text-center font-mono">
                            Geo: {Number(newClient.coords.lat).toFixed(6)}, {Number(newClient.coords.lng).toFixed(6)}
                          </p>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="comercial" className="space-y-4 pt-4">
                    <div className="grid gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>GEC (Nivel)</Label>
                          <Select value={newClient.gec || newClient.level} onValueChange={val => setNewClient({ ...newClient, gec: val, level: val })}>
                            <SelectTrigger><SelectValue placeholder="GEC" /></SelectTrigger>
                            <SelectContent className="z-[10001]">
                              {['TITANIO', 'PLATINO', 'ORO', 'PLATA', 'BRONCE'].map(l => (
                                <SelectItem key={l} value={l}>{l}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Tipo de Cliente</Label>
                          <Select value={newClient.type} onValueChange={val => setNewClient({ ...newClient, type: val })}>
                            <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                            <SelectContent className="z-[10001]">
                              <SelectItem value="punto de venta">Punto de Venta</SelectItem>
                              <SelectItem value="centro de consumo">Centro de Consumo</SelectItem>
                              <SelectItem value="canal moderno">Canal Moderno</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Cadena / Grupo</Label>
                        <Input placeholder="Ej. OXXO, INDEPENDIENTE" value={newClient.cadena} onChange={e => setNewClient({ ...newClient, cadena: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Zona Comercial</Label>
                          <Input value={newClient.zona_comercial} onChange={e => setNewClient({ ...newClient, zona_comercial: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Región</Label>
                          <Input value={newClient.region} onChange={e => setNewClient({ ...newClient, region: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Ruta de Ventas</Label>
                          <Input value={newClient.sales_route} onChange={e => setNewClient({ ...newClient, sales_route: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Ruta de Reparto</Label>
                          <Input value={newClient.delivery_route} onChange={e => setNewClient({ ...newClient, delivery_route: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Ruta Interna</Label>
                          <Input 
                            value={newClient.internal_route} 
                            onChange={e => setNewClient({ ...newClient, internal_route: e.target.value })}
                            disabled={!isAdminLike} 
                            className={!isAdminLike ? "opacity-50" : ""} 
                          />
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="operacion" className="space-y-4 pt-4">
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label>
                          Días de Visita Presencial <span className="text-red-500">*</span>
                          {(!newClient.visit_days || newClient.visit_days.length === 0) && !editingClient && (
                            <span className="ml-2 text-xs text-red-400 font-normal">(obligatorio)</span>
                          )}
                        </Label>
                        <div className="flex flex-wrap gap-1">
                          {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map(d => (
                            <Button
                              key={d} type="button" size="sm"
                              variant={newClient.visit_days?.includes(d) ? 'default' : 'outline'}
                              onClick={() => {
                                const days = newClient.visit_days?.includes(d)
                                  ? newClient.visit_days.filter(x => x !== d)
                                  : [...(newClient.visit_days || []), d];
                                setNewClient({ ...newClient, visit_days: days });
                              }}
                              className="h-7 text-[10px] px-2"
                            >
                              {d.slice(0, 2)}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Días de Televenta</Label>
                        <div className="flex flex-wrap gap-1">
                          {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map(d => (
                            <Button
                              key={d} type="button" size="sm"
                              variant={newClient.visit_day_televenta?.includes(d) ? 'secondary' : 'outline'}
                              onClick={() => {
                                const days = newClient.visit_day_televenta?.includes(d)
                                  ? newClient.visit_day_televenta.filter(x => x !== d)
                                  : [...(newClient.visit_day_televenta || []), d];
                                setNewClient({ ...newClient, visit_day_televenta: days });
                              }}
                              className="h-7 text-[10px] px-2"
                            >
                              {d.slice(0, 2)}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Modalidad Venta</Label>
                          <Input value={newClient.sales_modality} onChange={e => setNewClient({ ...newClient, sales_modality: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Ritmo</Label>
                          <Input value={newClient.ritmo} onChange={e => setNewClient({ ...newClient, ritmo: e.target.value })} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Tiene Enfriador CF</Label>
                        <Input value={newClient.enfriador} onChange={e => setNewClient({ ...newClient, enfriador: e.target.value })} placeholder="SI / NO / PROPIO" />
                      </div>
                      <div className="space-y-2">
                        <Label>Notas / Comentarios</Label>
                        <Textarea value={newClient.comments} onChange={e => setNewClient({ ...newClient, comments: e.target.value })} className="h-20" />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="fiscal" className="space-y-4 pt-4">
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label>RFC</Label>
                        <Input value={newClient.rfc} onChange={e => setNewClient({ ...newClient, rfc: e.target.value.toUpperCase() })} placeholder="XAXX010101000" />
                      </div>
                      <div className="space-y-2">
                        <Label>Razón Social Fiscal</Label>
                        <Input value={newClient.fiscal_name} onChange={e => setNewClient({ ...newClient, fiscal_name: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Dirección Fiscal</Label>
                        <Input value={newClient.fiscal_address} onChange={e => setNewClient({ ...newClient, fiscal_address: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Colonia Fiscal</Label>
                          <Input value={newClient.fiscal_colony} onChange={e => setNewClient({ ...newClient, fiscal_colony: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>C.P. Fiscal</Label>
                          <Input value={newClient.fiscal_postal_code} onChange={e => setNewClient({ ...newClient, fiscal_postal_code: e.target.value })} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Cédula IEPS</Label>
                        <Input value={newClient.cedula_ieps} onChange={e => setNewClient({ ...newClient, cedula_ieps: e.target.value })} placeholder="Num. Cédula" />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <DialogFooter className="mt-6">
                  <Button type="button" variant="ghost" onClick={() => setIsAddDialogOpen(false)}>Cancelar</Button>
                  <Button
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={isCodeDuplicate && !editingClient}
                  >
                    {editingClient ? 'Actualizar Cliente' : 'Guardar Nuevo'}
                  </Button>
                </DialogFooter>
              </form>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog para cliente existente (Conquista) */}
        <Dialog open={showExistsDialog} onOpenChange={open => { if (!open) { setShowExistsDialog(false); setExistingClientData(null); } }}>
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
                  <Button onClick={() => {
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
                      delivery_route: existingClientData.delivery_route || '',
                      phone: existingClientData.phone || '',
                      coords: existingClientData.coords || { lat: '', lng: '' },
                      comments: existingClientData.comments || ''
                    });
                    setShowExistsDialog(false);
                    setIsAddDialogOpen(true);
                  }}>Editar y agregar a ruta</Button>
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
        <Dialog open={!!visitClient} onOpenChange={open => { if (!open) setVisitClient(null); }}>
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

        {/* âœ... NUEVO: Dialog de Ventas (visible para todos) */}
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
