import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import VisitsHeader from '@/components/admin/visits/VisitsHeader';
import VisitsStats from '@/components/admin/visits/VisitsStats';
import VisitsFilters from '@/components/admin/visits/VisitsFilters';
import VisitsTable from '@/components/admin/visits/VisitsTable';
import VisitsMap from '@/components/admin/visits/VisitsMap';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '../supabaseClient';
import { getClientsByIds, getClientsByCodes } from '@/repositories/clientsRepository';

export default function AdminVisits() {
  const { toast } = useToast();
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    searchTerm: '',
    date: '',
    route: '',
  });

  useEffect(() => {
    const fetchVisits = async () => {
      setLoading(true);
      try {
        // `clients` lives in MySQL, so PostgREST cannot join it to `visitas`.
        // Fetch visits and enrich them through their repositories instead.
        const { data, error } = await supabase
          .from('visitas')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        const raw = (data || []);

        const clientIds = [...new Set(raw.map(v => v.client_id).filter(Boolean).map(String))];
        const clientCodes = [...new Set(raw.map(v => v.client_code).filter(Boolean).map(String))];
        const clientsById = [];
        const clientsByCode = [];
        for (let i = 0; i < clientIds.length; i += 100) {
          clientsById.push(...await getClientsByIds(clientIds.slice(i, i + 100)));
        }
        for (let i = 0; i < clientCodes.length; i += 100) {
          clientsByCode.push(...await getClientsByCodes(clientCodes.slice(i, i + 100)));
        }
        const clientMap = new Map();
        [...clientsById, ...clientsByCode].forEach(client => {
          if (client?.id != null) clientMap.set(`id:${String(client.id)}`, client);
          if (client?.client_code != null) clientMap.set(`code:${String(client.client_code).trim()}`, client);
          if (client?.code != null) clientMap.set(`code:${String(client.code).trim()}`, client);
        });

        const userIds = [...new Set(raw.map(v => v.user_id).filter(Boolean))];
        const profileMap = {};
        for (let i = 0; i < userIds.length; i += 500) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('*')
            .in('id', userIds.slice(i, i + 500));
          if (profilesError) {
            console.warn('No se pudieron cargar perfiles de visitas:', profilesError);
            continue;
          }
          (profilesData || []).forEach(profile => { profileMap[profile.id] = profile; });
        }

        const populatedVisits = raw.map(visit => {
          const client =
            (visit.client_code && clientMap.get(`code:${String(visit.client_code).trim()}`)) ||
            (visit.client_id && clientMap.get(`id:${String(visit.client_id)}`)) ||
            {};
          const profile = profileMap[visit.user_id] || {};
          return {
            hora: visit.hora || '',
            ...visit,
            clientName: visit.business_name || visit.cliente_nombre || client.business_name || client.name || 'Cliente no encontrado',
            businessName: visit.business_name || client.business_name || visit.cliente_nombre || client.name || 'Negocio no encontrado',
            coords: client.coords || null,
            userName: profile.name || profile.full_name || profile.email || visit.user_id || 'Usuario no encontrado',
            routeNumber: profile.route || visit.ruta || visit.route || 'N/A',
            userRole: profile.role || visit.role || '',
            photoFachada: visit.photo_fachada || null,
            photoInterior: visit.photo_interior || null,
            photoEnfriador: visit.photo_enfriador || null,
            visit_date: visit.fecha || visit.visit_date || null,
          };
        }).filter(v => v.coords);
        
        setVisits(populatedVisits);
      } catch (error) {
        toast({
          title: "Error al cargar datos",
          description: "No se pudieron cargar las visitas.",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchVisits();
  }, [toast]);

  const filteredVisits = useMemo(() => {
    return visits.filter(visit => {
      const term = filters.searchTerm.toLowerCase();
      let visitDate = '';
      if (visit.visit_date) {
        const dateObj = new Date(visit.visit_date);
        visitDate = isNaN(dateObj) ? '' : dateObj.toISOString().split('T')[0];
      }

      const matchesSearch = !term || 
        (visit.clientName && visit.clientName.toLowerCase().includes(term)) ||
        (visit.businessName && visit.businessName.toLowerCase().includes(term)) ||
        (visit.userName && visit.userName.toLowerCase().includes(term)) ||
        (visit.comments && visit.comments.toLowerCase().includes(term));

      const matchesDate = !filters.date || visitDate === filters.date;
      const matchesRoute = !filters.route || visit.routeNumber === filters.route;

      return matchesSearch && matchesDate && matchesRoute;
    });
  }, [visits, filters]);

  const uniqueRoutes = useMemo(() => [...new Set(visits.map(v => v.routeNumber).filter(Boolean))], [visits]);

  // ---- Normalize and counts (same logic used in SupervisorVisits) ----
  const normalize = (s) =>
    (s || '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const visitsByRole = useMemo(() => {
    return filteredVisits.reduce((acc, v) => {
      const key = normalize(v.userRole) || 'n/a';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [filteredVisits]);

  const roleCardCounts = useMemo(() => {
    const counts = {
      conquista: 0,
      'control interno': 0,
      'asesor dinamico': 0,
      otros: 0,
    };
    filteredVisits.forEach((v) => {
      const r = normalize(v.userRole);
      if (r.includes('conquista')) counts['conquista']++;
      else if (r.includes('control') && r.includes('interno')) counts['control interno']++;
      else if (r.includes('asesor') && r.includes('dinamico')) counts['asesor dinamico']++;
      else counts['otros']++;
    });
    return counts;
  }, [filteredVisits]);

  if (loading) {
    return <div className="flex justify-center items-center h-full"><p className="text-white">Cargando visitas...</p></div>;
  }

  return (
    <>
      <Helmet>
        <title>Gestión de Visitas - Admin</title>
        <meta name="description" content="Administración y mapa de todas las visitas del sistema." />
      </Helmet>

      <div className="space-y-6">
  <VisitsHeader visits={filteredVisits} />
  <VisitsStats visits={filteredVisits} visitsByRole={visitsByRole} roleCardCounts={roleCardCounts} />
        <VisitsFilters filters={filters} setFilters={setFilters} routes={uniqueRoutes} />

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <VisitsMap visits={filteredVisits} />
          </div>
          <div className="lg:col-span-2">
            <VisitsTable visits={filteredVisits} />
          </div>
        </div>
      </div>
    </>
  );
}
