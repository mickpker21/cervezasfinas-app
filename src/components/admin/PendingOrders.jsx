
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/supabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export default function PendingOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('installation_orders')
        .select(`
          id,
          action,
          status,
          scheduled_at,
          clients ( name )
        `)
        .in('status', ['PENDIENTE', 'APROBADA'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error("Error fetching pending orders:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // TODO: Add real-time subscription for new/updated orders

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-white/80" />
      </div>
    );
  }

  if (orders.length === 0) {
    return <p className="text-white/60 p-4">No hay solicitudes pendientes.</p>;
  }

  return (
    <div className="space-y-2 p-4">
      {orders.map(order => (
        <Card key={order.id} className="bg-[#3a3b4d] border-0 text-white p-3">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-semibold">{order.clients?.name || 'Cliente no especificado'}</p>
              <p className="text-sm text-white/70">Acción: {order.action} - Estado: {order.status}</p>
              {order.scheduled_at && <p className="text-xs text-white/50">Programado para: {new Date(order.scheduled_at).toLocaleDateString()}</p>}
            </div>
            <div className="flex gap-2">
              {/* TODO: Implement approval/rejection logic */}
              <Button size="sm" variant="outline_green">Aprobar</Button>
              <Button size="sm" variant="destructive">Rechazar</Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
