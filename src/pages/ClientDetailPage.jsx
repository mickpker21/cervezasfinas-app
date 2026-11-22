import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getClientById } from '@/repositories/clientsRepository';
import SalesSimulator from '@/components/SalesSimulator';

const ClientDetailPage = () => {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchClient = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const data = await getClientById(id);
        if (data) {
          setClient(data);
        } else {
          setError('Cliente no encontrado');
        }
      } catch (err) {
        console.error('Error fetching client:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchClient();
  }, [id]);

  if (loading) {
    return <div className="p-4">Cargando...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">Error al cargar el cliente: {error}</div>;
  }

  if (!client) {
    return <div className="p-4">Cliente no encontrado.</div>;
  }

  // Pass the whole client object to the simulator.
  return <SalesSimulator client={client} />;
};

export default ClientDetailPage;
