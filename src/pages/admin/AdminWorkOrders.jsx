import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import OrderDetailsModal from '../../components/admin/OrderDetailsModal';
import { getStatusStyle, getActionInfo } from '@/lib/utils';
import { 
    Loader2, 
    RefreshCw, 
    Search, 
    Filter, 
    ChevronRight, 
    Calendar, 
    User, 
    MapPin, 
    Box,
    LayoutGrid,
    List,
    TrendingUp,
    Clock,
    CheckCircle2,
    AlertCircle
} from 'lucide-react';
import { fetchOrdersApi, updateOrderApi } from '@/lib/mysqlOrders';
import { motion, AnimatePresence } from 'framer-motion';
import { pushService } from '@/lib/pushService';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';

// Persistent session cache
let cachedOrders = null;
let cachedInstallers = null;
let cachedProfiles = null;
let lastFetchTime = 0;
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

const AdminWorkOrders = () => {
  const [orders, setOrders] = useState(cachedOrders || []);
  const [loading, setLoading] = useState(!cachedOrders);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [installers, setInstallers] = useState(cachedInstallers || []);
  const [profiles, setProfiles] = useState(cachedProfiles || []);
  const [viewingOrderId, setViewingOrderId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [viewMode, setViewMode] = useState('CARD'); // 'CARD' or 'LIST'

  const fetchData = useCallback(async (force = false) => {
    // Prevent re-fetch if cache is fresh and not forced
    const now = Date.now();
    if (!force && cachedOrders && (now - lastFetchTime < CACHE_TTL)) {
        setLoading(false);
        return;
    }

    if (cachedOrders) setIsRefreshing(true);
    else setLoading(true);

    setError('');
    try {
      const [ordersResult, installersResult, profilesResult] = await Promise.all([
        fetchOrdersApi({ limit: 1000 }),
        supabase.from('installers').select('id, profile:profiles(id, name)'),
        supabase.from('profiles').select('id, name')
      ]);

      if (installersResult.error) throw installersResult.error;
      if (profilesResult.error) throw profilesResult.error;

      const orderRows = ordersResult.rows || [];
      const installersData = installersResult.data || [];
      const profilesData = profilesResult.data || [];
      
      const installersMap = new Map((installersData || []).map(i => [i.id, i.profile?.name]));
      const profilesMap = new Map((profilesData || []).map(p => [p.id, p.name]));

      // Deduplicate orders by ID to protect against multiple client rows in backend joins
      const uniqueOrderRows = Array.from(new Map(orderRows.map(o => [o.id, o])).values());

      const enrichedOrders = uniqueOrderRows.map(order => ({
        ...order,
        origin_client: { 
            name: order.origin_client_name, 
            client_code: order.origin_client_code,
            address: order.origin_client_address,
            business_name: order.origin_client_business_name
        },
        destination_client: { 
            name: order.destination_client_name,
            address: order.destination_client_address,
            business_name: order.destination_client_business_name
        },
        installer_name: installersMap.get(order.assigned_to) || 'Sin asignar',
        creator_name: profilesMap.get(order.created_by) || 'Sistema'
      }));

      cachedOrders = enrichedOrders;
      cachedInstallers = installersData;
      cachedProfiles = profilesData;
      lastFetchTime = now;
      
      setOrders(enrichedOrders);
      setInstallers(installersData);
      setProfiles(profilesData);

    } catch (err) {
      console.error("Fetch error:", err);
      setError(`Error al cargar datos: ${err.message}`);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derived stats for KPIs
  const stats = useMemo(() => {
    return {
        total: orders.length,
        pending: orders.filter(o => o.status === 'PENDIENTE').length,
        inProgress: orders.filter(o => ['APROBADA', 'EN_PROCESO', 'EN_RUTA'].includes(o.status)).length,
        completed: orders.filter(o => o.status === 'COMPLETADA').length
    };
  }, [orders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
        const matchesSearch = 
            (order.origin_client?.name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (order.origin_client?.business_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (order.origin_client?.client_code?.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (order.id?.toLowerCase().includes(searchTerm.toLowerCase()));
        
        const matchesStatus = filterStatus === 'ALL' || order.status === filterStatus;
        
        return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, filterStatus]);

  const handleAssignInstaller = async (orderId, installerId) => {
    try {
      setIsRefreshing(true);
      const orderToUpdate = orders.find(o => o.id === orderId);
      if (!orderToUpdate) return;

      const newStatus = installerId ? 'APROBADA' : 'PENDIENTE';
      
      const res = await updateOrderApi(orderId, {
        assigned_to: installerId || null,
        status: newStatus
      });

      if (res.status === 'error') throw new Error(res.message);

      // Enviar Notificación Push si se asignó un instalador
      if (installerId) {
        const installer = installers.find(i => i.id === installerId);
        if (installer && installer.profile?.id) {
          pushService.sendToUser(
            installer.profile.id,
            "🛠️ Nueva Orden de Trabajo",
            `Hola ${installer.profile.name}, se te ha asignado la orden #${orderId} para el cliente ${orderToUpdate.origin_client?.name || 'N/A'}.`,
            "/installer/dashboard"
          );
        }
      }

      await fetchData(true); 
    } catch (err) {
      console.error("Assignment error:", err);
      alert(`Error al asignar: ${err.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const OrderCard = ({ order }) => {
    const actionInfo = getActionInfo(order.action);
    const statusStyle = getStatusStyle(order.status);
    
    return (
        <motion.div 
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="group relative bg-gray-800/40 border border-gray-700/50 rounded-2xl p-5 hover:bg-gray-800 hover:border-blue-500/50 transition-all duration-300 shadow-lg cursor-pointer overflow-hidden"
            onClick={() => setViewingOrderId(order.id)}
        >
            {/* Action Bar background accent */}
            <div className={`absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 rounded-full opacity-5 blur-2xl ${actionInfo.style.includes('green') ? 'bg-green-500' : 'bg-blue-500'}`}></div>

            <div className="flex justify-between items-start mb-4">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${actionInfo.style} border border-white/10 shadow-sm`}>
                    <actionInfo.icon className="w-3 h-3 mr-2" />
                    {actionInfo.label}
                </span>
                <span className={`px-3 py-1 text-[10px] font-bold rounded-full border ${statusStyle.className}`}>
                    {statusStyle.text}
                </span>
            </div>

            <div className="space-y-3">
                <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors leading-tight">
                        {order.origin_client?.name || 'Cliente N/A'}
                    </h3>
                    {order.origin_client?.business_name && (
                        <p className="text-sm text-blue-400/80 font-medium">{order.origin_client.business_name}</p>
                    )}
                    <p className="text-[10px] text-gray-500 font-mono mt-1 flex items-center">
                        <MapPin className="w-3 h-3 mr-1 opacity-50" />
                        <span className="truncate">{order.origin_client?.address || 'Dirección N/A'}</span>
                    </p>
                </div>

                {order.action === 'MOVER' && (
                    <div className="flex flex-col text-[10px] text-gray-400 bg-gray-900/50 p-2 rounded-lg border border-gray-700/30">
                        <div className="flex items-center">
                            <ChevronRight className="w-3 h-3 text-blue-500 mr-2" />
                            <span className="truncate text-gray-200 font-bold">{order.destination_client?.name}</span>
                        </div>
                        {order.destination_client?.business_name && (
                            <p className="pl-5 text-blue-400/70 truncate">{order.destination_client.business_name}</p>
                        )}
                        <p className="pl-5 text-gray-500 truncate flex items-center mt-0.5">
                            <MapPin size={8} className="mr-1 opacity-50" />
                            {order.destination_client?.address || '---'}
                        </p>
                    </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-gray-700/30">
                    <div className="flex items-center gap-3">
                        <div className="bg-gray-700/50 p-1.5 rounded-lg border border-gray-600/30">
                            <User className="w-3 h-3 text-gray-400" />
                        </div>
                        <div className="text-[10px]">
                            <p className="text-gray-500 uppercase tracking-tighter">Inst / Creado por</p>
                            <p className="text-gray-200 font-bold truncate max-w-[100px]">{order.installer_name || 'Sin Asignar'}</p>
                            <p className="text-blue-400/60 font-medium truncate max-w-[100px]">{order.creator_name}</p>
                        </div>
                    </div>
                    <div className="text-right text-[10px]">
                        <p className="text-gray-500 uppercase tracking-tighter">Creada</p>
                        <p className="text-gray-300 flex items-center justify-end">
                            <Calendar className="w-3 h-3 mr-1 opacity-50" />
                            {new Date(order.created_at).toLocaleDateString()}
                        </p>
                    </div>
                </div>
            </div>
        </motion.div>
    );
  };

  const KpiCard = ({ title, value, color, icon: Icon, trend }) => (
    <div className="bg-gray-800/40 border border-gray-700/50 p-4 rounded-2xl flex items-center justify-between shadow-sm relative overflow-hidden group">
        <div className={`absolute bottom-0 right-0 w-16 h-16 -mr-8 -mb-8 rounded-full opacity-5 blur-xl bg-${color}-500 group-hover:scale-150 transition-transform duration-500`}></div>
        <div>
            <p className="text-[10px] uppercase font-black text-gray-500 tracking-widest">{title}</p>
            <h4 className="text-2xl font-black text-white mt-1">{value}</h4>
        </div>
        <div className={`p-3 rounded-2xl bg-gray-900/50 border border-gray-700/30 text-${color}-400 shadow-inner`}>
            <Icon size={20} />
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8 font-sans selection:bg-blue-500/30">
        <div className="max-w-7xl mx-auto space-y-8">
            
            {/* Header Section */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-blue-500 uppercase tracking-widest mb-1">
                        <Box size={14} />
                        <span>Logística & Activos</span>
                    </div>
                    <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white flex items-center gap-4">
                        Work Orders
                        {isRefreshing && <RefreshCw size={24} className="animate-spin text-blue-500 opacity-50" />}
                    </h1>
                </div>

                <div className="flex items-center gap-3">
                    <Link 
                        to="/orders"
                        className="p-3 bg-green-600 hover:bg-green-500 text-white rounded-2xl shadow-lg shadow-green-900/20 transition-all active:scale-95 flex items-center gap-2 font-bold text-sm"
                    >
                        <Plus size={18} />
                        <span>Nueva Orden</span>
                    </Link>
                    <button 
                        onClick={() => fetchData(true)}
                        className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl shadow-lg shadow-blue-900/20 transition-all active:scale-95 flex items-center gap-2 font-bold text-sm"
                    >
                        <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
                        <span>Sync</span>
                    </button>
                    <div className="flex bg-gray-800/50 p-1.5 rounded-2xl border border-gray-700/50">
                        <button onClick={() => setViewMode('CARD')} className={`p-2 rounded-xl transition-all ${viewMode === 'CARD' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}><LayoutGrid size={18} /></button>
                        <button onClick={() => setViewMode('LIST')} className={`p-2 rounded-xl transition-all ${viewMode === 'LIST' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}><List size={18} /></button>
                    </div>
                </div>
            </header>

            {/* KPI Section */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard title="Total Órdenes" value={stats.total} color="blue" icon={TrendingUp} />
                <KpiCard title="Pendientes" value={stats.pending} color="amber" icon={Clock} />
                <KpiCard title="En Proceso" value={stats.inProgress} color="indigo" icon={RefreshCw} />
                <KpiCard title="Completadas" value={stats.completed} color="green" icon={CheckCircle2} />
            </div>

            {/* Filters Section */}
            <div className="bg-gray-800/30 border border-gray-700/50 p-2 rounded-3xl flex flex-col md:flex-row items-center gap-2">
                <div className="relative flex-grow w-full md:w-auto">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input 
                        type="text"
                        placeholder="Buscar por cliente, código o ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-gray-950/50 border-none rounded-2xl pl-12 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-gray-600"
                    />
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="relative w-full md:w-48">
                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                        <select 
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="w-full bg-gray-950/50 border-none rounded-2xl pl-10 pr-4 py-3 text-sm appearance-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                        >
                            <option value="ALL">Todos los Estados</option>
                            <option value="PENDIENTE">Pendientes</option>
                            <option value="APROBADA">Aprobadas</option>
                            <option value="EN_PROCESO">En Proceso</option>
                            <option value="COMPLETADA">Completadas</option>
                            <option value="CANCELADA">Canceladas</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <AnimatePresence mode="wait">
                {loading && !orders.length ? (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="py-20 text-center"
                    >
                        <div className="relative inline-block">
                            <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Box className="text-blue-500" size={24} />
                            </div>
                        </div>
                        <p className="mt-4 text-gray-500 font-bold uppercase tracking-widest text-xs">Sincronizando Archivos...</p>
                    </motion.div>
                ) : error ? (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-red-900/20 border border-red-700/50 p-8 rounded-3xl text-center"
                    >
                        <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
                        <h3 className="text-xl font-bold text-white uppercase tracking-tighter">Error de Conexión</h3>
                        <p className="text-red-400 mt-2 text-sm">{error}</p>
                        <button onClick={() => fetchData(true)} className="mt-6 bg-red-600 hover:bg-red-500 px-6 py-2 rounded-xl font-bold shadow-lg shadow-red-900/40">Reintentar</button>
                    </motion.div>
                ) : (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={viewMode === 'CARD' 
                            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" 
                            : "bg-gray-800/20 border border-gray-700/30 rounded-3xl overflow-hidden shadow-2xl"
                        }
                    >
                        {filteredOrders.length === 0 ? (
                            <div className="col-span-full py-20 text-center bg-gray-900/30 border border-dashed border-gray-700 rounded-3xl">
                                <p className="text-gray-600 font-medium italic">No se encontraron registros que coincidan con la búsqueda.</p>
                            </div>
                        ) : viewMode === 'CARD' ? (
                            filteredOrders.map(order => <OrderCard key={order.id} order={order} />)
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead>
                                        <tr className="bg-gray-900/50 text-gray-500 uppercase text-[10px] font-black tracking-widest border-b border-gray-700/50">
                                            <th className="px-6 py-4">Negocio / Ubicación</th>
                                            <th className="px-6 py-4">Tipo</th>
                                            <th className="px-6 py-4">Instalador / Creador</th>
                                            <th className="px-6 py-4">Estado</th>
                                            <th className="px-6 py-4">Asignar</th>
                                            <th className="px-6 py-4 text-right">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-700/30">
                                        {filteredOrders.map(order => (
                                            <tr key={order.id} className="hover:bg-gray-700/20 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-gray-100 group-hover:text-blue-400 transition-colors">
                                                        {order.origin_client?.name || 'N/A'}
                                                        {order.origin_client?.business_name && (
                                                            <span className="text-blue-500/80 ml-2 text-[10px] font-medium italic">({order.origin_client.business_name})</span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-gray-500 font-mono mt-0.5 flex items-center">
                                                        <MapPin size={10} className="mr-1 opacity-50" />
                                                        {order.origin_client?.address || order.origin_client?.client_code || order.id}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${getActionInfo(order.action).style} border border-white/5`}>
                                                        {getActionInfo(order.action).label}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 font-medium text-gray-400">
                                                    <div className="text-gray-200 font-bold">{order.installer_name || <span className="text-gray-700">Sin asignar</span>}</div>
                                                    <div className="text-[10px] text-blue-400/60">{order.creator_name}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-3 py-1 text-[9px] font-black rounded-full uppercase ${getStatusStyle(order.status).className}`}>
                                                        {getStatusStyle(order.status).text}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <select 
                                                        value={order.assigned_to || ''} 
                                                        onChange={(e) => handleAssignInstaller(order.id, e.target.value)} 
                                                        className="bg-gray-950/50 border border-gray-700 rounded-xl text-xs text-blue-400 font-bold p-1.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-30"
                                                        disabled={['COMPLETADA', 'CANCELADA'].includes(order.status) || isRefreshing}
                                                    >
                                                        <option value="">-- Asignar --</option>
                                                        {installers.map(inst => <option key={inst.id} value={inst.id}>{inst.profile.name}</option>)}
                                                    </select>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button onClick={() => setViewingOrderId(order.id)} className="p-2 hover:bg-blue-500/10 rounded-xl text-blue-400 transition-all"><ChevronRight size={20} /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        {/* Floating Add Action? (Optional) */}
        
        {viewingOrderId && (
            <OrderDetailsModal 
                orderId={viewingOrderId} 
                installers={installers} 
                profiles={profiles}
                onClose={() => setViewingOrderId(null)} 
                onActionCompleted={() => { 
                    setViewingOrderId(null); 
                    fetchData(true); 
                }} 
            />
        )}
    </div>
  );
};

export default AdminWorkOrders;
