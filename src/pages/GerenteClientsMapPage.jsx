import { fetchAllClientsOnline } from '@/repositories/clientsRepository';

export default function AdminClientsMapPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchClients = async () => {
      setLoading(true);
      try {
        const all = await fetchAllClientsOnline();
        if (active) {
          setClients(all);
        }
      } catch (e) {
        console.error("Error loading gerente clients map:", e);
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
      <div className="flex flex-col min-h-0 h-full">
        <h1 className="text-2xl font-bold text-green-900 mb-4 shrink-0">Mapa de Clientes</h1>
        <div className="heineken-card p-0 flex-1 min-h-0">
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
