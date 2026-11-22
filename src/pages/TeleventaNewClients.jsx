import React, { useEffect, useState } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { fetchClientsApi } from '@/lib/mysqlClients';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Helmet } from 'react-helmet-async';
import { MessageCircle, Calendar, User, Phone, Building2, CheckCircle2, MapPin } from 'lucide-react';
import { getTodayMexico, isTodayMexico } from '@/lib/dateUtils';
import { Capacitor } from '@capacitor/core';

export default function TeleventaNewClients() {
    const { user } = useSupabaseAuth();
    const { toast } = useToast();
    const [newClients, setNewClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sentMessages, setSentMessages] = useState(new Set());

    useEffect(() => {
        fetchTodayClients();
    }, []);

    const fetchTodayClients = async () => {
        setLoading(true);
        try {
            const today = getTodayMexico(); // YYYY-MM-DD

            // Consultamos la API MySQL usando 'created_after' para traer solo CREACIONES de hoy
            // Esto evita traer actualizaciones de clientes viejos que saturaban el límite
            const { rows } = await fetchClientsApi({
                created_after: today,
                limit: 1000 // Límite generoso para un solo día
            });

            // Filtramos localmente para operar con zona horaria correcta
            const todayClients = rows.filter(client => {
                if (!client.created_at) return false;
                // Usamos la utilidad timezone-aware para validar si fue hoy en CDMX
                return isTodayMexico(client.created_at);
            });

            // Ordenar por más reciente
            todayClients.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

            setNewClients(todayClients);

            if (todayClients.length === 0) {
                console.log('[Televenta] No clients found for today:', today, 'Rows fetched:', rows.length);
            }

        } catch (err) {
            console.error('[TeleventaNewClients] Error:', err);
            toast({
                title: 'Error',
                description: 'No se pudieron cargar los clientes nuevos',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const sendWelcomeWhatsApp = (client) => {
        const phone = client.phone ? client.phone.replace(/\D/g, '') : '';

        if (!phone) {
            toast({
                title: 'Sin teléfono',
                description: 'Este cliente no tiene un teléfono registrado',
                variant: 'destructive',
            });
            return;
        }

        const clientName = client.name || client.business_name || 'Cliente';
        const createdByName = client.created_by || 'tu asesor';

        const message = `Hola *${clientName}*, ¡Bienvenido a Cervezas Finas! 🍻
Estamos encantados de atenderte.

Tu asesor: *${createdByName}*
Te compartimos nuestras líneas de atención y la página web donde podrás realizar tus pedidos:
📞 Tel: 245 452 0134
🌐 Web: www.cervezasfinas.com.mx`;

        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        const platform = Capacitor.getPlatform();

        // Marcar como enviado
        setSentMessages(prev => new Set([...prev, client.id]));

        // Abrir WhatsApp
        if (platform === 'web') {
            window.open(url, '_blank');
        } else {
            window.location.href = url;
        }

        toast({
            title: 'WhatsApp abierto',
            description: `Mensaje de bienvenida para ${clientName}`,
        });
    };

    const wasSent = (clientId) => sentMessages.has(clientId);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Cargando clientes nuevos...</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <Helmet>
                <title>Clientes Nuevos de Hoy - Televenta</title>
            </Helmet>

            <div className="container mx-auto p-6 max-w-[1600px]">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center gap-3 mb-2">
                        <Calendar className="w-8 h-8 text-blue-600" />
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                            Clientes Nuevos de Hoy
                        </h1>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400">
                        Panel de Televenta - Enviar mensajes de bienvenida por WhatsApp
                    </p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-xl border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-100 dark:bg-blue-800 rounded-full">
                                <User className="w-8 h-8 text-blue-600 dark:text-blue-300" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">Total Nuevos</p>
                                <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">{newClients.length}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-xl border border-green-200 dark:border-green-800">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-green-100 dark:bg-green-800 rounded-full">
                                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-300" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">Enviados</p>
                                <p className="text-4xl font-bold text-green-600 dark:text-green-400">{sentMessages.size}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-orange-50 dark:bg-orange-900/20 p-6 rounded-xl border border-orange-200 dark:border-orange-800">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-orange-100 dark:bg-orange-800 rounded-full">
                                <MessageCircle className="w-8 h-8 text-orange-600 dark:text-orange-300" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">Pendientes</p>
                                <p className="text-4xl font-bold text-orange-600 dark:text-orange-400">
                                    {newClients.length - sentMessages.size}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Clients List */}
                {newClients.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <p className="text-xl text-gray-600 dark:text-gray-400">
                            No hay clientes nuevos hoy
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {newClients.map((client) => (
                            <div
                                key={client.id}
                                className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border-2 transition-all ${wasSent(client.id)
                                    ? 'border-green-300 bg-green-50/50 dark:bg-green-900/10'
                                    : 'border-gray-200 dark:border-gray-700'
                                    }`}
                            >
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    {/* Client Info */}
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-start gap-3">
                                            <Building2 className="w-5 h-5 text-blue-600 mt-1" />
                                            <div>
                                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                                    {client.business_name || client.name}
                                                </h3>
                                                {client.business_name && client.name && (
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                                        Contacto: {client.name}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                            <Phone className="w-4 h-4" />
                                            <span>{client.phone || 'Sin teléfono'}</span>
                                        </div>

                                        <div className="flex items-center gap-4 text-xs text-gray-500">
                                            <span>Código: {client.client_code || 'N/A'}</span>
                                            <span>Ruta: {client.sales_route || 'N/A'}</span>
                                            <span className="text-gray-400">
                                                Creado: {(() => {
                                                    try {
                                                        if (!client.created_at) return 'N/A';
                                                        // Asumimos que la BD guarda en UTC pero lo devuelve sin 'Z'
                                                        // Forzamos la interpretación como UTC agregando 'Z' (y reemplazando espacio por T)
                                                        let dateStr = client.created_at.replace(' ', 'T');
                                                        if (!dateStr.endsWith('Z')) dateStr += 'Z';

                                                        const date = new Date(dateStr);
                                                        return date.toLocaleTimeString('es-MX', {
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                            timeZone: 'America/Mexico_City'
                                                        });
                                                    } catch (e) {
                                                        return 'Error hora';
                                                    }
                                                })()}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-2">
                                        {/* Botón de ubicación */}
                                        {(() => {
                                            let coords = null;
                                            try { coords = typeof client.coords === 'string' ? JSON.parse(client.coords) : client.coords; } catch (e) { }
                                            const lat = coords?.lat ?? coords?.[0];
                                            const lng = coords?.lng ?? coords?.[1];
                                            return lat && lng ? (
                                                <button
                                                    title="Ver en Google Maps"
                                                    onClick={() => window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank')}
                                                    className="p-2 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 transition-colors"
                                                >
                                                    <MapPin className="w-5 h-5" />
                                                </button>
                                            ) : null;
                                        })()}
                                        {wasSent(client.id) ? (
                                            <div className="flex items-center gap-2 text-green-600 bg-green-100 dark:bg-green-900/30 px-4 py-2 rounded-lg">
                                                <CheckCircle2 className="w-5 h-5" />
                                                <span className="font-medium">Enviado</span>
                                            </div>
                                        ) : (
                                            <Button
                                                onClick={() => sendWelcomeWhatsApp(client)}
                                                className="bg-green-600 hover:bg-green-700 text-white gap-2"
                                                disabled={!client.phone}
                                            >
                                                <MessageCircle className="w-5 h-5" />
                                                Enviar Bienvenida
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
