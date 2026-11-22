import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/supabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table-component";
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const PreventaDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [preventa, setPreventa] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPreventaDetails = async () => {
      setLoading(true);
      try {
        // Step 1: Fetch the main preventa record (NO JOIN with clients)
        const { data: preventaData, error: preventaError } = await supabase
          .from('preventa')
          .select('*')
          .eq('id', id)
          .single();

        if (preventaError) throw preventaError;

        // Step 2: Fetch Client and Seller details

        // Fetch Client from Local DB (MySQL)
        let clientName = 'Desconocido/Sync';
        if (preventaData && preventaData.client_id) {
          try {
            // Dynamically import to avoid top-level await issues if any
            const { getClientById } = await import('@/repositories/clientsRepository');
            const localClient = await getClientById(preventaData.client_id);
            if (localClient) {
              clientName = localClient.name || localClient.business_name || 'Desconocido';
            }
          } catch (err) {
            console.warn('Could not fetch local client', err);
          }
        }

        // Fetch Seller from Supabase Profiles
        let sellerName = 'N/A';
        if (preventaData && preventaData.user_id) {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', preventaData.user_id)
            .single();

          if (profileError) {
            console.error("Error fetching seller's profile:", profileError);
          } else {
            sellerName = profileData.name;
          }
        }

        // Step 3: Fetch the items associated with this preventa
        const { data: itemsData, error: itemsError } = await supabase
          .from('preventa_items')
          .select('*')
          .eq('preventa_id', id);

        if (itemsError) throw itemsError;

        // Step 4: Combine the data and update the state
        setPreventa({
          ...preventaData,
          profiles: { name: sellerName },
          clients: { name: clientName }
        });
        setItems(itemsData);

      } catch (error) {
        console.error('Error fetching preventa details:', error);
        toast({ title: 'Error', description: `No se pudieron cargar los detalles: ${error.message}`, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    fetchPreventaDetails();
  }, [id, toast]);

  if (loading) {
    return <p className="p-4">Cargando detalles de la simulación...</p>;
  }

  if (!preventa) {
    return <p className="p-4">No se encontró la simulación.</p>;
  }

  return (
    <div className="p-4">
      <Button onClick={() => navigate(-1)} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Volver
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Detalle de la Simulación</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p><strong>Fecha:</strong> {new Date(preventa.created_at).toLocaleString()}</p>
              <p><strong>Cliente:</strong> {preventa.clients?.name || 'N/A'}</p>
            </div>
            <div>
              <p><strong>Vendedor:</strong> {preventa.profiles?.name || 'N/A'}</p>
              <p><strong>Monto Total:</strong> ${preventa.total_amount?.toFixed(2)}</p>
            </div>
          </div>

          <h3 className="font-bold mb-2">Productos en la Simulación:</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Código</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Precio Unitario</TableHead>
                <TableHead className="text-right">Precio Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(item => (
                <TableRow key={item.id}>
                  <TableCell>{item.des_marca || item.cve_marca || 'N/A'}</TableCell>
                  <TableCell>{item.cve_marca}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">${item.unit_price?.toFixed(2)}</TableCell>
                  <TableCell className="text-right">${item.total_price?.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default PreventaDetailPage;
