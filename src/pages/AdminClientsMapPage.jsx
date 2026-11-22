import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import InteractiveMap from '@/components/common/InteractiveMap';
import { fetchAllClientsOnline } from '@/repositories/clientsRepository';
import { getAssetLocations } from '@/repositories/ordersRepository';

export default function AdminClientsMapPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchClients = async () => {
      setLoading(true);
      try {
        console.log("[AdminClientsMapPage] Loading clients...");
        const all = await fetchAllClientsOnline();
        
        console.log("[AdminClientsMapPage] Loading assets...");
        let assets = [];
        try {
          assets = await getAssetLocations();
        } catch (assetErr) {
          console.warn("[AdminClientsMapPage] Could not load assets, continuing with clients only:", assetErr);
        }
        
        if (active) {
          // Merge assets into clients
          const merged = (all || []).map(c => {
            // Check matching by both ID and Client Code
            const clientAssets = (assets || []).filter(a => 
              (a.client_id && String(a.client_id) === String(c.id)) || 
              (a.client_id && String(a.client_id) === String(c.client_code))
            );
            
            const coolers = clientAssets.filter(a => {
              const type = (a.asset_type || "").toUpperCase();
              return type.includes("ENFRIADOR") || type.includes("COOLER") || type.includes("REFRIGERADOR");
            });

            const facades = clientAssets.filter(a => {
              const type = (a.asset_type || "").toUpperCase();
              return type.includes("FACHADA") || type.includes("ANUNCIO") || type.includes("LUMINOSO");
            });

            return {
              ...c,
              cooler_serials: coolers.map(a => a.asset_serial || a.serial || a.asset_id).filter(Boolean),
              has_cooler: coolers.length > 0,
              has_facade: facades.length > 0,
              asset_count: clientAssets.length,
              detailed_assets: clientAssets // Keep all for the list
            };
          });
          setClients(merged);
        }
      } catch (e) {
        console.error("Error loading clients map data:", e);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchClients();
    return () => { active = false; };
  }, []);

  // Normalizar coordenadas igual que en ConquestMapPage
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

  return (
    <>
      <Helmet><title>Mapa de Clientes</title></Helmet>
      <div className="flex flex-col min-h-screen p-6 pb-20">
        <h1 className="text-2xl font-bold text-green-900 mb-6 shrink-0">Mapa de Clientes</h1>
        <div className="heineken-card p-0 flex-1 min-h-[600px] mb-10 shadow-2xl">
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-500">Cargando mapa...</div>
          ) : (
            <InteractiveMap items={clientsWithCoords} />
          )}
        </div>
      </div>
    </>
  );
}
