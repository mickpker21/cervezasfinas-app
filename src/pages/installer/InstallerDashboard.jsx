import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getStatusStyle, getActionInfo } from '@/lib/utils';
import { 
  Loader2, AlertCircle, Map as MapIcon, 
  MapPin, ArrowRight, Package, 
  Snowflake, Store, Megaphone, Box 
} from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import InteractiveMap from '@/components/common/InteractiveMap';
import SyncButton from '@/components/SyncButton';
import { getOrders, getAllOrders } from '@/repositories/ordersRepository';
import { getInstallerProfile } from '@/repositories/installationsRepository';

const InstallerDashboard = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [installerProfile, setInstallerProfile] = useState(null);
  const { user } = useSupabaseAuth();

  const userRole = user?.user_metadata?.type || user?.user_metadata?.role || user?.app_metadata?.role || '';
  const isJefe = userRole.toLowerCase().includes('jefe') && userRole.toLowerCase().includes('operaciones');

  const fetchData = useCallback(async () => {
    if (!user) {
      setError("No has iniciado sesión.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      let currentOrders = [];
      let profile = null;

      if (isJefe) {
        // Jefe sees ALL orders
        currentOrders = await getAllOrders();
        // They might not have an installer profile, let's try but don't fail
        profile = await getInstallerProfile(user.id).catch(() => null);
      } else {
        // Standard installer flow
        profile = await getInstallerProfile(user.id);
        if (!profile) {
          setError("No se pudo encontrar tu perfil de instalador.");
          return;
        }
        currentOrders = await getOrders(profile.id);
      }

      setInstallerProfile(profile);
      
      // Filter for active orders
      const activeOrders = (currentOrders || []).filter(o => 
          ['APROBADA', 'EN_RUTA'].includes(o.status)
      );

      setOrders(activeOrders);
      setError('');
    } catch (e) {
      console.error("Error fetching dashboard data:", e);
      setError(`Error al cargar los datos: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [user]);
  
  const mapItems = useMemo(() => {
    const toNumber = (val) => {
      if (val === null || val === undefined || val === '') return null;
      const n = Number(val);
      return isNaN(n) ? null : n;
    };

    return orders
      .map(o => {
        const client = o.origin_client;
        if (!client) return null;

        const clientCoords = typeof client.coords === 'string' ? JSON.parse(client.coords) : client.coords;
        const lat = toNumber(client.lat || client.latitud || client.latitude || clientCoords?.lat || clientCoords?.[0]);
        const lng = toNumber(client.lng || client.longitud || client.longitude || clientCoords?.lng || clientCoords?.[1]);

        if (lat === null || lng === null) return null;

        return {
          ...o,
          id: o.id,
          name: client.business_name || client.name,
          address: client.address,
          coords: { lat, lng }
        };
      })
      .filter(Boolean);
  }, [orders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading)
    return <div className="flex items-center justify-center h-screen bg-gray-900 text-white"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /><span className='ml-3'>Cargando tu tablero...</span></div>;

  if (error)
    return (
        <div className="p-4 bg-gray-900 min-h-screen">
            <div className="p-6 text-red-400 bg-red-900/40 border border-red-700 rounded-xl max-w-2xl mx-auto mt-20 text-center shadow-2xl">
                <AlertCircle className="mx-auto mb-4 h-12 w-12" />
                <h2 className="text-xl font-bold mb-2">Error de Conexión</h2>
                <p>{error}</p>
                <button onClick={() => fetchData()} className="mt-6 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold transition-all">Reintentar</button>
            </div>
        </div>
    );

  return (
    <div className="p-4 md:p-8 bg-slate-950 text-white min-h-screen selection:bg-blue-500/30">
      <div className="max-w-5xl mx-auto">
        {/* Modern Header */}
        <header className="relative mb-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-1 w-12 bg-blue-500 rounded-full" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">Operaciones en Campo</span>
                    </div>
                    <h1 className="text-3xl sm:text-5xl font-black tracking-tighter bg-gradient-to-br from-white via-white to-slate-500 bg-clip-text text-transparent">
                        {installerProfile?.profile?.name ? 'Panel Central' : 'Control de Mando'}
                    </h1>
                    <p className="mt-3 text-slate-400 font-medium max-w-md leading-relaxed">
                        Bienvenido, <span className='text-blue-400 font-bold border-b border-blue-500/30'>{installerProfile?.profile?.name || user?.user_metadata?.name || 'Comandante'}</span>. Revisa tus misiones asignadas para hoy.
                    </p>
                </div>
                <div className="flex items-center gap-3 bg-slate-900/40 p-2 rounded-2xl border border-white/5 backdrop-blur-xl">
                    <SyncButton variant="ghost" size="sm" showLabel={true} className="text-slate-300 hover:text-white" />
                </div>
            </div>
            
            {/* Background Accent */}
            <div className="absolute -top-24 -left-24 w-64 h-64 bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-600/10 rounded-full blur-[80px] pointer-events-none" />
        </header>

        {/* Stats Overview */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {[
                { label: 'Pendientes', value: orders.length, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' },
                { label: 'Ruta Actual', value: orders.filter(o => o.status === 'EN_RUTA').length, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' },
                { label: 'Completadas', value: '-', color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' },
                { label: 'Eficiencia', value: '100%', color: 'text-indigo-400', bg: 'bg-indigo-400/10', border: 'border-indigo-400/20' },
            ].map((stat, i) => (
                <div key={i} className={`${stat.bg} ${stat.border} border backdrop-blur-sm p-4 rounded-2xl shadow-lg transition-transform hover:scale-[1.02] cursor-default`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">{stat.label}</p>
                    <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
                </div>
            ))}
        </section>

        {/* Quick Map Access */}
        <Link to="/installer/services-map" className="group block mb-12 relative overflow-hidden rounded-3xl border border-blue-500/20 bg-slate-900/40 p-8 hover:bg-slate-900/60 transition-all">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h2 className="text-xl font-bold mb-1 group-hover:text-blue-400 transition-colors">Vista de Mapa Geovisor</h2>
                    <p className="text-sm text-slate-400">Optimiza tu ruta visualizando todos los servicios activos en el mapa maestro.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-blue-500 text-white p-3 rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.5)]">
                        <MapIcon className="w-6 h-6" />
                    </div>
                </div>
            </div>
            {/* Subtle Grid Pattern Background */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        </Link>

        {/* Active Orders List */}
        <section>
            <div className="flex items-center justify-between mb-8">
               <h2 className="text-xl font-black flex items-center gap-3 uppercase tracking-tighter">
                   <div className="w-1.5 h-6 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full"></div>
                   Ordenes de Despliegue
               </h2>
               <div className="h-px flex-1 mx-6 bg-slate-800/50 hidden md:block" />
               <span className="bg-slate-900 px-4 py-1.5 rounded-full text-[10px] font-black text-slate-400 border border-slate-800 shadow-xl">
                   {orders.length} CARGAS ACTIVAS
               </span>
            </div>            {orders.length === 0 ? (
              <div className='text-center bg-slate-900/30 border-2 border-dashed border-slate-800/50 p-12 rounded-3xl'>
                <div className="inline-flex items-center justify-center w-12 h-12 bg-slate-800/50 rounded-full mb-3 text-slate-600">
                    <Loader2 className="w-6 h-6" />
                </div>
                <p className='text-slate-500 font-medium'>Sistema despejado. Sin órdenes.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {orders.map(order => {
                  const actionInfo = getActionInfo(order.action);
                  const statusStyle = getStatusStyle(order.status);
                  const clientName = order.origin_client?.business_name || order.origin_client?.name || 'N/A';
                  const ownerName = order.origin_client?.name || 'N/A';
                  const clientAddress = order.origin_client?.address || 'Sin dirección';
                  const destinationName = order.destination_client?.name || order.destination_client?.business_name;

                  // Identify Primary Asset for visual branding
                  const primaryItem = order.items?.[0];
                  const primaryType = (primaryItem?.asset_type || '').toUpperCase();
                  let MainIcon = Package;
                  let mainColor = 'blue';
                  
                  if (primaryType.includes('ENFRIADOR')) { MainIcon = Snowflake; mainColor = 'cyan'; }
                  else if (primaryType.includes('FACHADA')) { MainIcon = Store; mainColor = 'emerald'; }
                  else if (primaryType.includes('ANUNCIO')) { MainIcon = Megaphone; mainColor = 'amber'; }
                  else if (primaryType.includes('MUEBLE')) { MainIcon = Box; mainColor = 'indigo'; }
                  
                  // Location check helper
                  const toNumber = (val) => {
                    if (val === null || val === undefined || val === '') return null;
                    const n = Number(val);
                    return isNaN(n) ? null : n;
                  };

                  const client = order.origin_client || {};
                  let clientCoords = {};
                  try {
                    clientCoords = typeof client.coords === 'string' ? JSON.parse(client.coords || '{}') : (client.coords || {});
                  } catch(e) { clientCoords = {}; }

                  let lat = toNumber(client.lat ?? client.latitud ?? client.latitude ?? clientCoords?.lat ?? clientCoords?.latitude ?? clientCoords?.[0]);
                  let lng = toNumber(client.lng ?? client.longitud ?? client.longitude ?? clientCoords?.lng ?? clientCoords?.longitude ?? clientCoords?.[1]);

                  // Fallback: Buscar en las notas (Regex) - Igual que en ExecuteOrder
                  if (lat === null && order.notes) {
                    const geoMatch = order.notes.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
                    if (geoMatch) { lat = toNumber(geoMatch[1]); lng = toNumber(geoMatch[2]); }
                  }

                  const hasCoords = lat !== null && lng !== null;

                  const colorStyles = {
                      blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', shadow: 'shadow-blue-500/20' },
                      cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400', shadow: 'shadow-cyan-500/20' },
                      emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', shadow: 'shadow-emerald-500/20' },
                      amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', shadow: 'shadow-amber-500/20' },
                      indigo: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', text: 'text-indigo-400', shadow: 'shadow-indigo-500/20' },
                  }[mainColor];

                  return (
                    <Link 
                        to={`/installer/order/${order.id}`} 
                        key={order.id} 
                        className="group relative flex flex-col bg-slate-900/40 border border-white/5 p-5 rounded-2xl shadow-xl hover:bg-slate-900/60 hover:border-blue-500/30 transition-all duration-300 transform hover:-translate-y-1 active:scale-[0.98] overflow-hidden"
                    >
                      {/* Top Action/Status Bar */}
                      <div className="flex justify-between items-center gap-2 mb-5 relative z-10">
                          <span className={`inline-flex items-center px-2 py-0.5 text-[8px] rounded-md font-black uppercase tracking-widest ${actionInfo.style} border shadow-sm`}>
                            {actionInfo.label}
                          </span>
                        <div className={`px-2 py-0.5 text-[8px] rounded-md font-black uppercase tracking-widest ${statusStyle.className} border shadow-inner`}>
                            {statusStyle.text}
                        </div>
                      </div>
                      
                      <div className="flex gap-4 items-start relative z-10 mb-4">
                        {/* PROMINENT ASSET ICON */}
                        <div className={`flex-shrink-0 w-12 h-12 rounded-xl ${colorStyles.bg} ${colorStyles.border} border flex items-center justify-center ${colorStyles.shadow} shadow-lg transition-transform group-hover:scale-110 duration-500`}>
                            <MainIcon className={`w-6 h-6 ${colorStyles.text}`} />
                        </div>

                        <div className="flex-1 min-w-0">
                            <h3 className="text-base font-black text-white group-hover:text-blue-300 transition-colors tracking-tight line-clamp-2 leading-tight mb-0.5 flex items-center gap-2">
                                {clientName}
                                {hasCoords && (
                                    <button 
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
                                        }}
                                        className="p-1 -m-1 hover:bg-emerald-400/20 rounded-full transition-colors cursor-pointer"
                                        title="Ver en Google Maps"
                                    >
                                        <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                                    </button>
                                )}
                            </h3>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest truncate">{ownerName}</p>
                        </div>
                      </div>

                      <div className="flex-1 space-y-3 relative z-10">
                        <div className="flex items-start text-slate-400 text-[10px] leading-snug">
                            <MapPin className={`h-3 w-3 mr-2 ${hasCoords ? 'text-blue-400' : 'text-slate-600'} mt-0.5 flex-shrink-0`} />
                            <span className="line-clamp-2">{clientAddress}</span>
                            {hasCoords && (
                              <div className="ml-auto pl-2 flex items-center gap-1 text-[8px] text-blue-400 font-bold uppercase tracking-tighter shrink-0" title="Ubicación verificada">
                                <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse"></div>
                                GPS
                              </div>
                            )}
                        </div>

                        {order.action === 'MOVER' && (
                            <div className='flex items-center text-[9px] font-bold text-slate-500 bg-slate-950/50 px-2 py-1.5 rounded-lg border border-white/5'>
                                <span className='opacity-30 mr-2'>⇢</span> {destinationName}
                            </div>
                        )}
                      </div>

                      <div className="mt-5 space-y-3 pt-3 border-t border-white/5 relative z-10">
                        {order.items && order.items.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {order.items.slice(0, 4).map((it, idx) => {
                                    const type = (it.asset_type || '').toUpperCase();
                                    let ItemIcon = Package;
                                    let itemColor = 'text-blue-400';
                                    if (type.includes('ENFRIADOR')) { ItemIcon = Snowflake; itemColor = 'text-cyan-400'; }
                                    else if (type.includes('FACHADA')) { ItemIcon = Store; itemColor = 'text-emerald-400'; }
                                    else if (type.includes('ANUNCIO')) { ItemIcon = Megaphone; itemColor = 'text-amber-400'; }
                                    else if (type.includes('MUEBLE')) { ItemIcon = Box; itemColor = 'text-indigo-400'; }

                                    return (
                                        <div key={idx} className="bg-slate-950/40 text-[8px] font-black uppercase tracking-tighter px-2 py-1 rounded-lg border border-white/5 flex items-center gap-1.5">
                                            <ItemIcon className={`w-2.5 h-2.5 ${itemColor} opacity-70`} />
                                            <span className="text-slate-400">{it.quantity} {it.asset_type.split(' ')[0]}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        
                        <div className="flex justify-between items-center">
                            <span className="text-[8px] font-mono text-slate-700 tracking-widest uppercase">#{order.id.split('-')[0]}</span>
                            <div className="flex items-center text-[10px] font-black text-blue-400 uppercase tracking-tighter group-hover:translate-x-1 transition-transform">
                                {order.status === 'EN_RUTA' ? 'CONTINUAR' : 'INICIAR'} <ArrowRight className="ml-1.5 h-3 w-3" />
                            </div>
                        </div>
                      </div>

                      {/* Dynamic Background Glow based on asset type */}
                      <div className={`absolute -top-10 -left-10 w-32 h-32 ${colorStyles.bg} blur-[60px] opacity-20 pointer-events-none group-hover:opacity-40 transition-opacity`} />
                    </Link>
                  )
                })}
              </div>
            )}
        </section>
      </div>
    </div>
  );
};

export default InstallerDashboard;
