import { useEffect, useState, useMemo, useCallback } from 'react';
import { Map as MapIcon, Loader2, List, Calendar, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import InteractiveMap from '@/components/common/InteractiveMap';
import SyncButton from '@/components/SyncButton';
import { getAllOrders } from '@/repositories/ordersRepository';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

const ServicesMapPage = () => {
    const { user } = useSupabaseAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const all = await getAllOrders();
            // Filter only active/planned services
            const active = (all || []).filter(o => 
                ['APROBADA', 'EN_RUTA', 'EN_PROCESO', 'PENDIENTE'].includes(o.status)
            );
            setOrders(active);
            setError(null);
        } catch (e) {
            console.error('[ServicesMapPage] Error:', e);
            setError('No se pudieron cargar las ubicaciones de los servicios.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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

                // Robust coordinate extraction (matches Supervisor/Admin maps)
                const clientCoords = typeof client.coords === 'string' ? JSON.parse(client.coords) : client.coords;
                let lat = toNumber(client.lat || client.latitud || client.latitude || clientCoords?.lat || clientCoords?.[0]);
                let lng = toNumber(client.lng || client.longitud || client.longitude || clientCoords?.lng || clientCoords?.[1]);

                // Fallback to extraction from notes if missing from client record
                if (lat === null || lng === null) {
                    const notesStr = o.notes || '';
                    const geoMatch = notesStr.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
                    if (geoMatch) {
                        lat = toNumber(geoMatch[1]);
                        lng = toNumber(geoMatch[2]);
                    }
                }

                if (lat === null || lng === null) return null;

                return {
                    ...o,
                    id: o.id,
                    name: client.business_name || client.name || 'Cliente Desconocido',
                    address: client.address || 'Sin dirección',
                    coords: { lat, lng },
                    type: o.action
                };
            })
            .filter(Boolean);
    }, [orders]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
                <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
                <p className="text-gray-400 animate-pulse">Cargando mapa de servicios...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
            {/* Header */}
            <header className="p-4 md:p-6 border-b border-gray-800 bg-gray-900/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 z-10">
                <div className="flex items-center gap-4">
                    <Link to="/installer/dashboard" className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white">
                        <ArrowLeft className="h-6 w-6" />
                    </Link>
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                            <MapIcon className="text-blue-500" />
                            Mapa de Servicios
                        </h1>
                        <p className="text-sm text-gray-400">
                            Visualizando {mapItems.length} servicios con ubicación
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <SyncButton variant="outline" size="sm" showLabel={true} className="border-blue-500/30" />
                    <Link 
                        to="/installer/dashboard" 
                        className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium transition-all"
                    >
                        <List className="h-4 w-4" />
                        Ver Lista
                    </Link>
                </div>
            </header>

            {/* Map Area */}
            <main className="flex-1 relative">
                {mapItems.length > 0 ? (
                    <InteractiveMap items={mapItems} />
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                        <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                            <MapIcon className="h-10 w-10 text-gray-600" />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">No hay servicios mappedos</h3>
                        <p className="text-gray-400 max-w-md">
                            No se encontraron órdenes en estado 'Aprobada' o 'En Ruta' que tengan coordenadas de cliente registradas.
                        </p>
                        <button 
                            onClick={fetchData}
                            className="mt-6 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-full font-bold transition-all shadow-lg shadow-blue-900/20"
                        >
                            Actualizar Datos
                        </button>
                    </div>
                )}
            </main>

            {/* Legend / Info Overlay (Optional) */}
            <div className="absolute bottom-6 right-6 p-4 bg-gray-900/90 border border-gray-700 rounded-xl backdrop-blur-sm shadow-2xl z-10 pointer-events-none hidden md:block">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Leyenda</h4>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                        <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                        Servicio Activo
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                        <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                        Pendiente/Proceso
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ServicesMapPage;
