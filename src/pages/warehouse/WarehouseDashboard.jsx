import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import Layout from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Users, Truck, ClipboardCheck, AlertCircle } from 'lucide-react';

const WarehouseDashboard = () => {
    const navigate = useNavigate();
    const [drivers, setDrivers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchDrivers = async () => {
            try {
                // Fetch all profiles
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*');

                if (error) throw error;

                // RLS Note: If this returns only the current user, an RLS policy is needed on 'profiles'.
                const filteredDrivers = (data || []).filter(p =>
                    p.role === 'autoventa' || p.role === 'chofer' || p.email === 'chofer@demo.com'
                );
                setDrivers(filteredDrivers);

            } catch (err) {
                console.error('Error fetching drivers', err);
                setError('No se pudieron cargar los conductores.');
            } finally {
                setLoading(false);
            }
        };

        fetchDrivers();
    }, []);

    if (error) {
        return (
            <Layout>
                <div className="p-6 bg-slate-950 min-h-screen flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4 text-center">
                        <div className="bg-red-500/10 p-4 rounded-full">
                            <AlertCircle size={48} className="text-red-400" />
                        </div>
                        <h2 className="text-xl font-bold text-white">Error al cargar</h2>
                        <p className="text-slate-400">{error}</p>
                        <Button variant="outline" onClick={() => window.location.reload()} className="mt-2">
                            Reintentar
                        </Button>
                    </div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="p-6 bg-slate-950 min-h-screen">
                <header className="mb-8">
                    <h1 className="text-3xl font-bold text-white">Panel de Almacén</h1>
                    <p className="text-slate-400">Gestión de Inventario a Bordo y Auditorías</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {/* Access Cards */}
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer bg-blue-50 border-blue-200" onClick={() => navigate('/warehouse/load')}>
                        <CardHeader className="flex flex-row items-center gap-4">
                            <div className="bg-blue-600 p-3 rounded-full text-white">
                                <Truck size={32} />
                            </div>
                            <div>
                                <CardTitle className="text-blue-900">Cargar Camión</CardTitle>
                                <CardDescription>Asignar inventario a un vendedor para su ruta.</CardDescription>
                            </div>
                        </CardHeader>
                    </Card>

                    <Card className="hover:shadow-lg transition-shadow cursor-pointer bg-green-50 border-green-200" onClick={() => navigate('/warehouse/audit')}>
                        <CardHeader className="flex flex-row items-center gap-4">
                            <div className="bg-green-600 p-3 rounded-full text-white">
                                <ClipboardCheck size={32} />
                            </div>
                            <div>
                                <CardTitle className="text-green-900">Auditoría Simple</CardTitle>
                                <CardDescription>Validar inventario físico al regreso (sin caja).</CardDescription>
                            </div>
                        </CardHeader>
                    </Card>

                    <Card className="hover:shadow-lg transition-shadow cursor-pointer bg-teal-50 border-teal-200" onClick={() => navigate('/warehouse/liquidation')}>
                        <CardHeader className="flex flex-row items-center gap-4">
                            <div className="bg-teal-600 p-3 rounded-full text-white">
                                <ClipboardCheck size={32} />
                            </div>
                            <div>
                                <CardTitle className="text-teal-900">Liquidación de Ruta</CardTitle>
                                <CardDescription>Cierre de viaje: Recepción física y de valores.</CardDescription>
                            </div>
                        </CardHeader>
                    </Card>

                    <Card className="hover:shadow-lg transition-shadow cursor-pointer bg-amber-50 border-amber-200" onClick={() => navigate('/warehouse/inventory')}>
                        <CardHeader className="flex flex-row items-center gap-4">
                            <div className="bg-amber-600 p-3 rounded-full text-white">
                                <ClipboardCheck size={32} />
                            </div>
                            <div>
                                <CardTitle className="text-amber-900">Inventario Maestro</CardTitle>
                                <CardDescription>Gestión del WMS, catálogo de productos y SKUs.</CardDescription>
                            </div>
                        </CardHeader>
                    </Card>

                    <Card className="hover:shadow-lg transition-shadow cursor-pointer bg-purple-50 border-purple-200" onClick={() => navigate('/warehouse/history')}>
                        <CardHeader className="flex flex-row items-center gap-4">
                            <div className="bg-purple-600 p-3 rounded-full text-white">
                                <ClipboardCheck size={32} />
                            </div>
                            <div>
                                <CardTitle className="text-purple-900">Historial de Cargas</CardTitle>
                                <CardDescription>Consulta de viajes y auditorías pasadas.</CardDescription>
                            </div>
                        </CardHeader>
                    </Card>

                    <Card className="hover:shadow-lg transition-shadow cursor-pointer bg-indigo-50 border-indigo-200" onClick={() => navigate('/warehouse/transfers')}>
                        <CardHeader className="flex flex-row items-center gap-4">
                            <div className="bg-indigo-600 p-3 rounded-full text-white">
                                <Truck size={32} />
                            </div>
                            <div>
                                <CardTitle className="text-indigo-900">Traspasos (Bodegas)</CardTitle>
                                <CardDescription>Envío y recepción de mercancía entre sucursales.</CardDescription>
                            </div>
                        </CardHeader>
                    </Card>
                </div>

                <h2 className="text-xl font-bold mb-4 text-white">Vendedores / Choferes Activos</h2>
                {loading ? (
                    <p className="text-slate-400">Cargando personal...</p>
                ) : drivers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="bg-slate-800 p-5 rounded-full mb-4">
                            <Users size={40} className="text-slate-500" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-300 mb-1">Sin conductores registrados</h3>
                        <p className="text-slate-500 text-sm max-w-xs">
                            No se encontraron vendedores o choferes activos. Verifica los perfiles en el sistema.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {drivers.map(driver => (
                            <Card key={driver.id}>
                                <CardContent className="pt-6 text-center">
                                    <div className="mx-auto w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-3">
                                        <Users size={24} className="text-gray-500" />
                                    </div>
                                    <h3 className="font-bold text-lg">{driver.name || driver.email}</h3>
                                    <p className="text-sm text-gray-500 mb-4">{driver.email}</p>
                                    <div className="flex justify-center gap-2">
                                        <Button size="sm" variant="outline" onClick={() => navigate(`/warehouse/audit?driver=${driver.id}`)}>
                                            Auditar
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default WarehouseDashboard;
