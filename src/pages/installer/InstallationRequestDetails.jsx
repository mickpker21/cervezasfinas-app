import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Hash, Calendar, FileText, CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';

const InstallationRequestDetails = () => {
  const { id } = useParams();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchRequestDetails = async () => {
      setLoading(true);
      setError('');

      const { data, error } = await supabase
        .from('installation_requests')
        .select(`
          id, 
          status, 
          notes, 
          created_at,
          clients(name, client_code, address, city, state),
          installation_request_items(asset_type, quantity)
        `)
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching request details:', error);
        setError('No se pudo cargar la solicitud. Por favor, inténtalo de nuevo.');
      } else {
        setRequest(data);
      }
      setLoading(false);
    };

    fetchRequestDetails();
  }, [id]);

  if (loading) {
    return <div className="p-4 text-white text-center">Cargando detalles de la solicitud...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500 text-center">{error}</div>;
  }

  if (!request) {
    return <div className="p-4 text-white text-center">Solicitud no encontrada.</div>;
  }
  
  const getStatusIcon = (status) => {
    switch (status) {
        case 'APROBADA': return <CheckCircle className="h-5 w-5 text-green-400" />;
        case 'RECHAZADA': return <XCircle className="h-5 w-5 text-red-400" />;
        case 'PENDIENTE': return <AlertCircle className="h-5 w-5 text-yellow-400" />;
        default: return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
            <Link to="/installer/installations" className="flex items-center text-blue-400 hover:text-blue-300 transition-colors duration-200">
                <ArrowLeft className="h-5 w-5 mr-2" />
                Volver a Mis Solicitudes
            </Link>
        </div>

        <div className="bg-gray-800 rounded-lg shadow-xl overflow-hidden">
          <div className="p-6 border-b border-gray-700">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold">{request.clients?.name || 'Cliente no especificado'}</h1>
                    <div className="flex items-center text-gray-400 mt-2">
                        <Hash className="h-4 w-4 mr-2" />
                        <span>{request.clients?.client_code || 'N/A'}</span>
                    </div>
                </div>
                <div className="flex items-center space-x-2 text-sm font-semibold py-1 px-3 rounded-full bg-gray-700">
                    {getStatusIcon(request.status)}
                    <span>{request.status?.replace('_', ' ') || 'DESCONOCIDO'}</span>
                </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold text-white">Detalles del Cliente</h2>
                    <div className="flex items-start"><MapPin className="h-5 w-5 mr-3 mt-1 flex-shrink-0 text-gray-400" /> <span>{`${request.clients?.address || ''}, ${request.clients?.city || ''}, ${request.clients?.state || ''}`}</span></div>
                    <div className="flex items-start"><Calendar className="h-5 w-5 mr-3 mt-1 flex-shrink-0 text-gray-400" /> <span>Solicitado el {new Date(request.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
                    {request.notes && <div className="flex items-start"><FileText className="h-5 w-5 mr-3 mt-1 flex-shrink-0 text-gray-400" /> <p className="border-l-2 border-gray-600 pl-3">{request.notes}</p></div>}
                </div>
                
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold text-white">Activos Solicitados</h2>
                  <ul className="space-y-3">
                    {request.installation_request_items.length > 0 ? (
                        request.installation_request_items.map((item, index) => (
                            <li key={index} className="flex justify-between items-center bg-gray-700 p-3 rounded-md">
                                <span className="font-medium">{item.asset_type}</span>
                                <span className="font-bold text-green-400">x {item.quantity}</span>
                            </li>
                        ))
                    ) : (
                        <p className="text-gray-400 text-center py-4">No se solicitaron activos específicos.</p>
                    )}
                  </ul>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstallationRequestDetails;
