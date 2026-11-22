import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { PlusCircle, Loader2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const getStatusVariant = (status) => {
  switch (status) {
    case 'PENDIENTE': return 'default';
    case 'ASIGNADA': return 'secondary';
    case 'EN_PROCESO': return 'outline';
    case 'COMPLETADA': return 'success';
    case 'CANCELADA': return 'destructive';
    default: return 'default';
  }
};

const OrderManager = () => {
  const { user } = useSupabaseAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchOrders = async () => {
      if (!user) return;
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('installation_orders')
          .select('id, created_at, action, status, clients(name)')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setOrders(data || []);
      } catch (err) {
        console.error("Error fetching orders:", err);
        setError(`No se pudieron cargar las órdenes: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [user]);

  const handleNewOrder = () => {
    // The route for new installations from the old sidebar link
    navigate('/requests/new-installation');
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (error) return <div className="text-red-400 text-center">{error}</div>;

  return (
    <div className="p-4 md:p-6 bg-gray-900 text-white min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold">Mis Órdenes de Equipos</h1>
          <Button onClick={handleNewOrder} className="bg-green-600 hover:bg-green-700">
            <PlusCircle className="mr-2 h-4 w-4" />
            Crear Nueva Orden
          </Button>
        </div>

        {orders.length > 0 ? (
          <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden">
             <ul className="divide-y divide-gray-700">
              {orders.map(order => (
                <li key={order.id} className="p-4 flex justify-between items-center hover:bg-gray-700/50 transition-colors duration-200">
                  <div>
                    <p className="font-semibold text-lg text-green-400">{order.action}</p>
                    <p className="text-sm text-gray-400">
                      Cliente: {order.clients?.name || 'N/A'}
                    </p>
                     <p className="text-xs text-gray-500 mt-1">
                      {new Date(order.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant={getStatusVariant(order.status)}>{order.status}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="text-center py-20 bg-gray-800 rounded-lg">
            <AlertCircle className="mx-auto h-12 w-12 text-gray-500" />
            <h3 className="mt-2 text-lg font-medium">No hay órdenes todavía</h3>
            <p className="mt-1 text-sm text-gray-400">¡Crea tu primera orden para empezar!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderManager;
