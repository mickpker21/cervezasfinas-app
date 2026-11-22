import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/supabaseClient';
import InteractiveMap from '@/components/common/InteractiveMap';

import { getClientsPaged } from '@/repositories/clientsRepository';

export default function ConquestMapPage() {
  const { user } = useSupabaseAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  const clientsWithCoords = useMemo(() => {
    const toNumber = (v) => {
      if (typeof v === 'number') return isFinite(v) ? v : null;
      if (typeof v === 'string') { const n = parseFloat(v); return isFinite(n) ? n : null; }
      return null;
    };
    const normalize = (c) => {
      let val = c?.coords;
      if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch (e) { /* noop */ }
      }
      if (Array.isArray(val) && val.length >= 2) {
        const lat = toNumber(val[0]); const lng = toNumber(val[1]);
        if (lat != null && lng != null) return { ...c, coords: { lat, lng } };
      }
      if (val && typeof val === 'object') {
        const lat = toNumber(val.lat ?? val.latitude ?? val.Lat ?? val.latitud);
        const lng = toNumber(val.lng ?? val.longitude ?? val.Lng ?? val.longitud);
        if (lat != null && lng != null) return { ...c, coords: { lat, lng } };
      }
      const lat = toNumber(c.lat ?? c.latitude ?? c.latitud);
      const lng = toNumber(c.lng ?? c.longitude ?? c.longitud);
      if (lat != null && lng != null) return { ...c, coords: { lat, lng } };
      return null;
    };
    return (clients || []).map(normalize).filter(Boolean);
  }, [clients]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!user) return;
      setLoading(true);

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, route, role')
          .eq('id', user.id)
          .single();

        const route = profile?.route;
        const role = profile?.role;

        // Build route filters. Only fetch the specific route if available.
        // Otherwise, if admin/supervisor, fetch all without filters.
        let filters = {};
        if (route) {
          filters.internal_routes = [route];
        } else if (role !== 'asesor dinamico' && role !== 'supervisor' && role !== 'admin') {
          // If a low level user has no route, safely fetch nothing until assigned
          if (active) {
            setClients([]);
            setLoading(false);
          }
          return;
        }

        // Use the highly-optimized getClientsPaged repository function
        // 50,000 is effectively "all" but skips the extremely unoptimized path
        const { data: fetchedClients } = await getClientsPaged({
          page: 1,
          pageSize: 50000,
          userId: user.id,
          filters
        });

        if (active) {
          setClients(fetchedClients);
        }
      } catch (err) {
        console.error('Error cargando clientes para mapa:', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    return () => { active = false; };
  }, [user]);

  return (
    <>
      <Helmet><title>Mapa - Conquista</title></Helmet>
      <div className="flex flex-col min-h-0 h-full">
        <h1 className="text-2xl font-bold text-white mb-4 shrink-0">Mapa de Clientes</h1>
        <div className="heineken-card p-0 flex-1 min-h-0">
          {loading ? (
            <div className="h-full flex items-center justify-center text-white">Cargando mapa...</div>
          ) : (
            <InteractiveMap items={clientsWithCoords} height="26rem" />
          )}
        </div>
      </div>
    </>
  );
}
