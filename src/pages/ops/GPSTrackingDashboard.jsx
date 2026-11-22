import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin, Navigation, User, Clock } from 'lucide-react';

// Fix Leaflet Default Icon issue in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom icons based on role or status
const createCustomIcon = (color) => new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const GPSTrackingDashboard = () => {
    const [locations, setLocations] = useState([]);
    const [profiles, setProfiles] = useState({});
    const [selectedRole, setSelectedRole] = useState('all');
    const [loading, setLoading] = useState(true);

    const fetchLatestLocations = async () => {
        try {
            // First get profiles for names
            const { data: profileData } = await supabase.from('profiles').select('id, name, role, email');
            const profMap = {};
            (profileData || []).forEach(p => profMap[p.id] = p);
            setProfiles(profMap);

            // Fetch the most recent location for each user
            // In PostgreSQL we would use DISTINCT ON (user_id), but with Supabase standard client we can fetch last 24h and filter in JS
            const yesterday = new Date();
            yesterday.setHours(yesterday.getHours() - 24);

            const { data: locData } = await supabase
                .from('user_locations')
                .select('*')
                .gte('timestamp', yesterday.toISOString())
                .order('timestamp', { ascending: false });

            // Deduplicate to keep only the latest per user
            const latestPerUser = {};
            (locData || []).forEach(loc => {
                if (!latestPerUser[loc.user_id]) {
                    latestPerUser[loc.user_id] = loc;
                }
            });

            setLocations(Object.values(latestPerUser));
        } catch (error) {
            console.error("Error fetching GPS data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLatestLocations();

        // Subscribe to real-time updates for user_locations
        const channel = supabase
            .channel('public:user_locations')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_locations' }, payload => {
                const newLoc = payload.new;
                setLocations(prev => {
                    const filtered = prev.filter(l => l.user_id !== newLoc.user_id);
                    return [newLoc, ...filtered];
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const filteredLocations = locations.filter(loc => {
        if (selectedRole === 'all') return true;
        const role = profiles[loc.user_id]?.role;
        return role === selectedRole;
    });

    const getRoleColor = (role) => {
        switch(role) {
            case 'autoventa': return 'green';
            case 'chofer': return 'blue';
            case 'preventa': return 'orange';
            case 'instalador': return 'violet';
            default: return 'grey';
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 flex flex-col">
            <Helmet>
                <title>Rastreo GPS en Vivo - Cervezas Finas</title>
            </Helmet>

            <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500 flex items-center gap-2">
                        <Navigation className="h-8 w-8 text-blue-500" />
                        Rastreo GPS en Vivo
                    </h1>
                    <p className="text-slate-400">Monitoreo en tiempo real del personal en campo.</p>
                </div>
                
                <div className="flex gap-4">
                    <Select value={selectedRole} onValueChange={setSelectedRole}>
                        <SelectTrigger className="w-[180px] bg-slate-900 border-slate-700">
                            <SelectValue placeholder="Filtrar por Perfil" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="autoventa">Autoventa</SelectItem>
                            <SelectItem value="chofer">Reparto (Chofer)</SelectItem>
                            <SelectItem value="preventa">Preventa</SelectItem>
                            <SelectItem value="instalador">Instaladores</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </header>

            <div className="flex-1 rounded-xl overflow-hidden border border-slate-800 shadow-2xl relative min-h-[600px] z-0">
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm z-50">
                        <div className="text-blue-400 flex flex-col items-center">
                            <Navigation className="h-8 w-8 animate-spin mb-2" />
                            Cargando mapa...
                        </div>
                    </div>
                ) : (
                    <MapContainer 
                        center={[20.659698, -103.349609]} // Default to GDL or Center of operations
                        zoom={12} 
                        style={{ height: '100%', width: '100%', zIndex: 1 }}
                    >
                        <TileLayer
                            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        />
                        
                        {filteredLocations.map(loc => {
                            const profile = profiles[loc.user_id];
                            if (!profile) return null;
                            const color = getRoleColor(profile.role);
                            const lastUpdate = new Date(loc.timestamp);
                            const minutesAgo = Math.floor((new Date() - lastUpdate) / 60000);
                            
                            // Dim the marker if it's older than 30 mins
                            const opacity = minutesAgo > 30 ? 0.5 : 1.0;

                            return (
                                <Marker 
                                    key={loc.user_id} 
                                    position={[loc.latitude, loc.longitude]}
                                    icon={createCustomIcon(color)}
                                    opacity={opacity}
                                >
                                    <Popup className="custom-popup">
                                        <div className="p-1">
                                            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                                <User className="h-4 w-4" /> {profile.name || profile.email}
                                            </h3>
                                            <div className="text-sm text-slate-600 mb-2 uppercase font-semibold">{profile.role}</div>
                                            
                                            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                                                <Clock className="h-3 w-3" /> 
                                                Hace {minutesAgo} min ({lastUpdate.toLocaleTimeString()})
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <Navigation className="h-3 w-3" /> 
                                                Precisión: {Math.round(loc.accuracy)}m
                                            </div>
                                            {loc.speed > 0 && (
                                                <div className="text-xs text-slate-500 mt-1">
                                                    Velocidad: {Math.round(loc.speed * 3.6)} km/h
                                                </div>
                                            )}
                                        </div>
                                    </Popup>
                                </Marker>
                            );
                        })}
                    </MapContainer>
                )}
            </div>
            
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-400">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500"></div> Autoventa</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Reparto</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500"></div> Preventa</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-purple-500"></div> Instalador</div>
                <div className="flex items-center gap-2 opacity-50"><div className="w-3 h-3 rounded-full bg-gray-500"></div> Inactivo (&gt;30m)</div>
            </div>
        </div>
    );
};

export default GPSTrackingDashboard;
