import React, { useState, useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { supabase } from '@/supabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import SalesSimulator from '@/components/SalesSimulator';
import { getCurrentPositionSafe } from '@/lib/geolocation';

// Location Utils
const parseCoords = (client) => {
  if (!client) return null;
  if (client.coords) {
    try {
      const c = typeof client.coords === 'string' ? JSON.parse(client.coords) : client.coords;
      if (Array.isArray(c) && c.length >= 2) return { lat: Number(c[0]), lng: Number(c[1]) };
      if (c && typeof c === 'object' && c.lat != null && c.lng != null) return { lat: Number(c.lat), lng: Number(c.lng) };
    } catch (e) { }
  }
  const lat = client.lat ?? client.latitude ?? client.latitud;
  const lng = client.lng ?? client.longitude ?? client.longitud;
  if (lat != null && lng != null) return { lat: Number(lat), lng: Number(lng) };
  return null;
};

const distanceMeters = (lat1, lon1, lat2, lon2) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const SalesSimulatorPage = () => {
  const { clientId } = useParams(); // Get client ID from URL
  const { toast } = useToast();
  const location = useLocation();

  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [denialReason, setDenialReason] = useState("");
  const { user } = useSupabaseAuth();

  const isFromTeleventa = (() => {
    try {
      const params = new URLSearchParams(location.search);
      return params.get('from') === 'televenta';
    } catch (e) {
      return false;
    }
  })();

  const [userRole, setUserRole] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchingClients, setSearchingClients] = useState(false);

  const targetClientParam = (() => {
    if (clientId) return clientId;
    try {
      const params = new URLSearchParams(location.search);
      return params.get('client') || params.get('client_code') || '';
    } catch {
      return '';
    }
  })();

  useEffect(() => {
    const fetchClientData = async () => {
      if (!targetClientParam) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Fetch User Role (from context/profile)
        let role = null;
        if (user) {
          const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
          if (profile) {
            role = profile.role;
            setUserRole(role);
          }
        }

        const { getClientById, getClientsPaged } = await import('@/repositories/clientsRepository');
        let data = await getClientById(targetClientParam).catch(() => null);
        if (!data) {
          const paged = await getClientsPaged({ page: 1, pageSize: 15, filters: { search: targetClientParam } }).catch(() => ({ data: [] }));
          const list = paged?.data || [];
          data = list.find((c) => String(c.client_code) === String(targetClientParam) || String(c.id) === String(targetClientParam)) || list[0] || null;
        }

        if (!data) {
          throw new Error('Cliente no encontrado');
        }

        // Normalize client data before setting state
        const normalizedClient = {
          ...data,
          client_code: data.client_code || data.cve_cliente || '',
          level: data.level || data.gec || 'Bronce',
          gec: data.gec || data.level || 'Bronce',
          zona_comercial: data.zona_comercial || ''
        };

        setClient(normalizedClient);

        // Security Check for Autoventa (Chofer)
        // Only if NOT televenta flag (which is weak security, but role check adds layer)
        // Ideally we trust role + logic. If role is chofer, we enforce location unless specific override?
        // Requirement: "Solo aplica para autoventa"
        if (role === 'chofer' && !isFromTeleventa) {
          const clientCoords = parseCoords(data);
          if (!clientCoords) {
            setAccessDenied(true);
            setDenialReason("El cliente no tiene coordenadas. No se puede verificar tu ubicación.");
            return;
          }

          try {
            const pos = await getCurrentPositionSafe({ enableHighAccuracy: true, timeout: 5000 });
            const dist = distanceMeters(pos.coords.latitude, pos.coords.longitude, clientCoords.lat, clientCoords.lng);
            if (dist > 50) { // 50 METERS LIMIT
              setAccessDenied(true);
              setDenialReason(`Estás fuera de rango (${Math.round(dist)}m). Debes estar a menos de 50 metros del cliente.`);
            }
          } catch (err) {
            setAccessDenied(true);
            setDenialReason("No se pudo obtener tu ubicación. Asegúrate de tener el GPS activado.");
          }
        }

      } catch (clientError) {
        console.error('Error fetching client:', clientError);
        toast({ title: 'Error', description: `No se pudo cargar el cliente: ${clientError.message}`, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    fetchClientData();
  }, [targetClientParam, toast, isFromTeleventa]);

  useEffect(() => {
    if (client) return;
    let cancelled = false;
    setSearchingClients(true);
    const timer = setTimeout(async () => {
      try {
        const { getClientsPaged } = await import('@/repositories/clientsRepository');
        const res = await getClientsPaged({
          page: 1,
          pageSize: 30,
          filters: searchQuery.trim() ? { search: searchQuery.trim() } : {},
        });
        if (!cancelled) setSearchResults(res?.data || []);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchingClients(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, searchQuery]);

  if (loading) {
    return <div className="p-4">Cargando simulador...</div>;
  }

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white p-6 text-center">
        <div className="bg-red-500/20 p-6 rounded-full mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        </div>
        <h1 className="text-3xl font-bold mb-2">Acceso Restringido</h1>
        <p className="text-lg text-slate-300 max-w-md mb-8">{denialReason}</p>
        <button
          onClick={() => window.history.back()}
          className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          Regresar
        </button>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4 text-slate-100">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <div>
            <h1 className="text-xl font-bold text-white">Crear Pedido / Cotizador</h1>
            <p className="text-xs text-slate-400 mt-1">
              Busca y selecciona un cliente por código o nombre para abrir el simulador de pedido.
            </p>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar cliente por código o nombre del negocio..."
            className="w-full bg-slate-950 border border-slate-700 text-white px-4 py-2.5 rounded-xl text-sm outline-none focus:border-emerald-500"
          />
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-800/80 border border-slate-800 rounded-xl bg-slate-950/60">
            {searchingClients ? (
              <div className="p-4 text-xs text-slate-400">Buscando clientes...</div>
            ) : searchResults.length === 0 ? (
              <div className="p-4 text-xs text-slate-400">No se encontraron clientes con ese criterio.</div>
            ) : (
              searchResults.map((c) => (
                <button
                  key={c.id || c.client_code}
                  type="button"
                  onClick={() =>
                    setClient({
                      ...c,
                      client_code: c.client_code || c.cve_cliente || '',
                      level: c.level || c.gec || 'Bronce',
                      gec: c.gec || c.level || 'Bronce',
                      zona_comercial: c.zona_comercial || '',
                    })
                  }
                  className="w-full text-left px-4 py-3 hover:bg-emerald-500/10 flex items-center justify-between gap-3 transition"
                >
                  <div>
                    <div className="text-sm font-semibold text-white">
                      [{c.client_code || c.id}] {c.business_name || c.name || 'Cliente'}
                    </div>
                    <div className="text-xs text-slate-400">
                      Ruta: {c.sales_route || c.internal_route || 'N/A'} · Zona: {c.zona_comercial || 'N/A'}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-400">Seleccionar →</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  const limitToStock = userRole === 'chofer' && !isFromTeleventa;

  const handleOrderSaved = async ({ preventaId, totalAmount, totalBoxes }) => {
    if (!isFromTeleventa || !clientId) return;
    try {
      if (user) {
        const route =
          client.sales_route ||
          client.route ||
          client.ruta ||
          client.internal_route ||
          null;

        const payload = {
          user_id: user.id,
          client_id: client.id,
          client_code: client.client_code || null,
          route,
          call_time: new Date().toISOString(),
          answered: true,
          boxes_sold: Number(totalBoxes) || 0,
          comments: 'Preventa registrada desde simulador',
        };

        const { error } = await supabase.from('telesales_calls').insert([payload]);
        if (error) {
          console.error('televenta/simulator: error al registrar llamada', error);
        }

        // Guardar de forma persistente en localStorage
        try {
          const raw = localStorage.getItem('televenta_saved_calls');
          const existing = raw ? JSON.parse(raw) : [];
          const record = {
            ...payload,
            id: 'sim_' + Math.random().toString(36).slice(2, 10),
            _client_name: client.business_name || client.name || null
          };
          localStorage.setItem('televenta_saved_calls', JSON.stringify([record, ...existing].slice(0, 300)));
        } catch (e) {}
      }
    } catch (err) {
      console.error('televenta/simulator: error inesperado al registrar llamada', err);
    } finally {
      // Redirigir siempre a la pantalla de llamadas de televenta al finalizar la venta
      window.location.href = '/televenta/llamadas';
    }
  };

  return (
    <SalesSimulator
      client={client}
      onOrderSaved={handleOrderSaved}
      hidePriceInfo={false}
      limitToStock={limitToStock}
      isTeleventa={isFromTeleventa}
      allowPriceEdit={isFromTeleventa}
      user={user}
    />
  );
};

export default SalesSimulatorPage;
