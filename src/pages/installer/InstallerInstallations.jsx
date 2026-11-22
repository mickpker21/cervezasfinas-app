import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { Link } from 'react-router-dom';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { getActionInfo, getStatusStyle } from '@/lib/utils.jsx';
import { Loader2 } from 'lucide-react';
import { getOrders } from '@/repositories/ordersRepository';

const InstallerInstallations = () => {
  const { user } = useSupabaseAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchInstallationOrders = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        // 1. Get Installer ID from Supabase (since profiles/installers stay there for now)
        const { data: installerData, error: installerError } = await supabase
          .from('installers')
          .select('id')
          .eq('profile_id', user.id)
          .single();

        if (installerError || !installerData) {
          throw new Error(installerError?.message || 'No se encontró el perfil de instalador.');
        }
        const installerId = installerData.id;

        // 2. Get Orders from Repository (MySQL/SQLite)
        const ordersData = await getOrders(installerId);
        setOrders(ordersData || []);

      } catch (err) {
        setError(err.message);
        console.error('Error fetching installation orders:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchInstallationOrders();
  }, [user]);

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-green-400" /></div>;
  }

  if (error) {
    return <div className="text-red-500 bg-red-900/20 p-4 rounded-lg text-center mt-10 max-w-lg mx-auto border border-red-700">Error al cargar las órdenes: {error}</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h1 className="text-3xl font-bold text-white">Órdenes Asignadas</h1>
           <p className="text-gray-400 mt-1">Órdenes de instalación y mantenimiento pendientes.</p>
        </div>
        <div className="hidden md:block bg-gray-800 p-3 rounded-lg border border-gray-700">
           <span className="text-gray-400 text-sm">Total de órdenes: </span>
           <span className="text-white font-bold">{orders.length}</span>
        </div>
      </header>
      
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800/80">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Cliente</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Tipo</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Estado</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Fecha</th>
                <th scope="col" className="relative px-6 py-4"><span className="sr-only">Ver</span></th>
              </tr>
            </thead>
            <tbody className="bg-gray-900/40 divide-y divide-gray-800">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-gray-500 italic">No tienes órdenes de trabajo asignadas.</td>
                </tr>
              ) : (
                orders.map((order) => {
                  const actionInfo = getActionInfo(order.action);
                  const statusStyle = getStatusStyle(order.status);
                  return (
                    <tr key={order.id} className="hover:bg-gray-800/60 transition-all group">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-white group-hover:text-green-400 transition-colors">{(order.origin_client && order.origin_client.name) || order.clients?.name || 'N/A'}</div>
                        <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{order.origin_client?.address || 'Dirección no disponible'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${actionInfo.style}`}>
                          <actionInfo.icon className="-ml-0.5 mr-1.5 h-3.5 w-3.5" />
                          {actionInfo.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full ${statusStyle.className}`}>
                          {statusStyle.text}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{new Date(order.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Link to={`/installer/installations/${order.id}`} className="inline-flex items-center text-green-400 hover:text-green-300 font-bold decoration-2 underline-offset-4 hover:underline">
                          Ir a Ejecutar 
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InstallerInstallations;
