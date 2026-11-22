import { useEffect, useState, useMemo } from 'react';
import { 
  Loader2, AlertCircle, Search, ChevronDown, ChevronRight, 
  HardDrive, Package, Hash, MapPin, LayoutGrid, Box 
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { getAssetLocations } from '../../repositories/ordersRepository';

const AssetStatusByClient = () => {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedClients, setExpandedClients] = useState(new Set());

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        setLoading(true);
        const data = await getAssetLocations();
        setLocations(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Error fetching asset locations:", err);
        setError(`No se pudieron cargar las ubicaciones: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    fetchLocations();
  }, []);

  // Agrupamos los activos por cliente (deduplicando para proteger contra múltiples filas de clientes)
  const assetsByClient = useMemo(() => {
    if (!Array.isArray(locations)) return {};

    const seenSerials = new Set();
    const uniqueLocations = locations.filter(loc => {
      const key = loc.asset_serial || loc.asset_id;
      if (!key) return true;
      if (seenSerials.has(key)) return false;
      seenSerials.add(key);
      return true;
    });

    return uniqueLocations.reduce((acc, loc) => {
      const id = loc.client_id || 'warehouse';
      if (!acc[id]) {
        acc[id] = {
          id: loc.client_id,
          code: loc.client_code || '—',
          name: loc.client_id ? (loc.client_business_name || loc.client_name || 'Cliente sin nombre') : 'EN ALMACÉN / DISPONIBLES',
          address: loc.client_id ? (loc.client_address || 'Sin dirección') : 'Equipos sin asignar o retirados',
          isWarehouse: !loc.client_id,
          assets: [],
        };
      }
      acc[id].assets.push(loc);
      return acc;
    }, {});
  }, [locations]);

  // Filtramos los clientes según el término de búsqueda
  const filteredClients = useMemo(() => {
    const clientsArray = Object.entries(assetsByClient);
    if (!searchTerm) return clientsArray;
    
    const lowercasedFilter = searchTerm.toLowerCase();
    return clientsArray.filter(([_, clientData]) => {
      return (
        (clientData.name || '').toLowerCase().includes(lowercasedFilter) ||
        (clientData.code || '').toLowerCase().includes(lowercasedFilter) ||
        (clientData.address || '').toLowerCase().includes(lowercasedFilter)
      );
    });
  }, [assetsByClient, searchTerm]);

  const toggleClient = (clientId) => {
    const newSet = new Set(expandedClients);
    if (newSet.has(clientId)) {
      newSet.delete(clientId);
    } else {
      newSet.add(clientId);
    }
    setExpandedClients(newSet);
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-white">
      <div className="relative">
        <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full animate-pulse"></div>
        <Loader2 className="h-12 w-12 animate-spin text-emerald-400 relative z-10" />
      </div>
      <span className='mt-4 font-bold text-emerald-400 tracking-widest uppercase text-xs'>Sincronizando Activos...</span>
    </div>
  );

  if (error) return (
    <div className="p-8 bg-slate-950 min-h-screen flex items-center justify-center">
      <div className="p-6 text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl max-w-md w-full text-center shadow-2xl">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500"/>
        <h3 className="text-xl font-bold mb-2">Error de Conexión</h3>
        <p className="text-sm opacity-80 mb-6">{error}</p>
        <button onClick={() => window.location.reload()} className="px-6 py-2 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all">Reintentar</button>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-8 bg-slate-950 text-white min-h-screen font-sans">
      <div className="max-w-5xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight uppercase bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
              Estado de Activos
            </h1>
            <p className="text-slate-400 text-sm font-medium">Control centralizado de equipos en campo</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="px-4 py-2 bg-slate-900/50 border border-white/5 rounded-2xl flex items-center gap-3 backdrop-blur-xl">
               <div className="flex flex-col items-end">
                 <span className="text-[10px] text-slate-500 font-bold uppercase">Total Activos</span>
                 <span className="text-lg font-black text-emerald-400">{locations.length}</span>
               </div>
               <div className="w-px h-8 bg-white/10"></div>
               <LayoutGrid className="w-5 h-5 text-emerald-500" />
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-8 group">
          <div className="absolute inset-0 bg-emerald-500/5 blur-xl group-focus-within:bg-emerald-500/10 transition-all"></div>
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 group-focus-within:text-emerald-500 transition-colors" />
          <Input
            type="text"
            placeholder="Buscar por cliente, código o dirección..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900/80 backdrop-blur-xl border-white/5 pl-12 pr-4 py-6 rounded-2xl focus:ring-emerald-500/20 focus:border-emerald-500/30 text-lg transition-all"
          />
        </div>

        {/* Clients List */}
        <div className="space-y-4">
          {filteredClients.length > 0 ? (
            filteredClients.map(([clientId, clientData]) => (
              <div 
                key={clientId} 
                className={`group border transition-all duration-300 rounded-3xl overflow-hidden ${
                  expandedClients.has(clientId) 
                    ? 'bg-slate-900/60 border-white/10 shadow-2xl' 
                    : 'bg-slate-900/30 border-white/5 hover:border-white/10 hover:bg-slate-900/50'
                }`}
              >
                <button 
                  onClick={() => toggleClient(clientId)}
                  className="w-full flex flex-col sm:flex-row sm:justify-between sm:items-center p-6 text-left"
                >
                  <div className='flex items-start gap-4 flex-1'>
                    <div className={`mt-1 p-3 rounded-2xl shrink-0 ${clientData.isWarehouse ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}`}>
                       {clientData.isWarehouse ? <Box className="w-6 h-6" /> : <Store className="w-6 h-6" />}
                    </div>
                    <div className='min-w-0'>
                      <h3 className="text-xl font-bold tracking-tight uppercase truncate group-hover:text-emerald-400 transition-colors">
                        {clientData.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-y-1 gap-x-4 mt-1 text-sm text-slate-400 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Hash className="w-3.5 h-3.5 text-emerald-500/60" />
                          <span className="font-mono text-xs">{clientData.code}</span>
                        </div>
                        <div className="flex items-center gap-1.5 min-w-0 max-w-xs sm:max-w-md">
                          <MapPin className="w-3.5 h-3.5 text-slate-600" />
                          <span className="truncate opacity-80">{clientData.address}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className='flex items-center justify-between sm:justify-end mt-4 sm:mt-0 gap-4'>
                    <div className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border ${
                      clientData.isWarehouse 
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                        : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                    }`}>
                      {clientData.assets.length} {clientData.assets.length === 1 ? 'Activo' : 'Activos'}
                    </div>
                    <div className={`p-2 rounded-xl bg-white/5 text-slate-500 transition-transform duration-300 ${expandedClients.has(clientId) ? 'rotate-180 text-white' : ''}`}>
                      <ChevronDown className="w-5 h-5" />
                    </div>
                  </div>
                </button>

                {expandedClients.has(clientId) && (
                  <div className="bg-black/20 px-6 py-6 border-t border-white/5 animate-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {clientData.assets.map(asset => (
                        <div key={asset.asset_id || asset.asset_serial} className='p-4 bg-slate-800/40 border border-white/5 rounded-2xl flex items-start gap-4 hover:bg-slate-800/60 transition-all'>
                          <div className={`p-2 rounded-lg ${clientData.isWarehouse ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                             {asset.asset_type?.toUpperCase().includes('ENFRIADOR') ? <Snowflake className='w-4 h-4' /> : <LayoutGrid className='w-4 h-4'/>}
                          </div>
                          <div className="flex-1">
                             <div className="flex items-center justify-between mb-1">
                               <span className='font-mono font-bold text-sm bg-slate-900 px-2 py-0.5 rounded border border-white/5'>{asset.asset_serial}</span>
                               <span className='text-[10px] font-black uppercase tracking-tighter opacity-40'>{asset.asset_type}</span>
                             </div>
                             <p className='text-xs text-slate-500 font-medium'>
                               {clientData.isWarehouse 
                                 ? 'Disponible para asignación' 
                                 : `Asignado el ${asset.installation_date ? new Date(asset.installation_date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : 'fecha desconocida'}`}
                             </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-20 bg-slate-900/20 border border-dashed border-white/10 rounded-3xl">
              <Search className="w-12 h-12 mx-auto mb-4 text-slate-700" />
              <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">No se encontraron resultados</p>
              <p className="text-slate-600 text-xs mt-1">Intenta con otros términos de búsqueda</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Simple Lucide wrapper for Snowflake if not imported
const Snowflake = (props) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="m20 16-4-4 4-4" />
    <path d="m4 8 4 4-4 4" />
    <path d="m16 4-4 4-4-4" />
    <path d="m8 20 4-4 4 4" />
  </svg>
);

const Store = (props) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
    <path d="M2 7h20" />
    <path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7" />
  </svg>
);

export default AssetStatusByClient;
