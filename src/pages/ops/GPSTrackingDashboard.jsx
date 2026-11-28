import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/supabaseClient';
import { Helmet } from 'react-helmet-async';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
    MapPin,
    Navigation,
    User,
    Clock,
    Route as RouteIcon,
    Calendar,
    RefreshCw,
    Store,
    Activity,
    Eye,
    Layers,
} from 'lucide-react';
import { getTodayMexico } from '@/lib/dateUtils';

// Fix Leaflet Default Icon issue in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const createCustomIcon = (color) =>
    new L.Icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
    });

const USER_TRAIL_COLORS = [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#f59e0b', // amber
    '#ec4899', // pink
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#f97316', // orange
    '#84cc16', // lime
];

function calcDistanceKm(lat1, lon1, lat2, lon2) {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function FitMapToPoints({ points }) {
    const map = useMap();
    useEffect(() => {
        if (!points || points.length === 0) return;
        const valid = points.filter(
            (p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && !(Number(p.lat) === 0 && Number(p.lng) === 0)
        );
        if (valid.length === 0) return;
        if (valid.length === 1) {
            map.setView([Number(valid[0].lat), Number(valid[0].lng)], 15);
            return;
        }
        const bounds = L.latLngBounds(valid.map((p) => [Number(p.lat), Number(p.lng)]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }, [points, map]);
    return null;
}

const GPSTrackingDashboard = () => {
    const [selectedDate, setSelectedDate] = useState(() => getTodayMexico());
    const [selectedRole, setSelectedRole] = useState('all');
    const [selectedRoute, setSelectedRoute] = useState('all');
    const [selectedUserId, setSelectedUserId] = useState('all');
    const [showTrails, setShowTrails] = useState(true);
    const [showVisits, setShowVisits] = useState(true);
    const [showBreadcrumbs, setShowBreadcrumbs] = useState(true);

    const [profiles, setProfiles] = useState({});
    const [userRoutesMap, setUserRoutesMap] = useState({});
    const [rawLocations, setRawLocations] = useState([]);
    const [dayVisits, setDayVisits] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchTrackingData = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Cargar perfiles y sus rutas asignadas (profiles.route + supervisor_allowed_sales_routes + supervisor_allowed_routes)
            const [profilesRes, salesRoutesRes, internalRoutesRes] = await Promise.all([
                supabase.from('profiles').select('id, name, full_name, role, email, route'),
                supabase.from('supervisor_allowed_sales_routes').select('supervisor_id, sales_route'),
                supabase.from('supervisor_allowed_routes').select('supervisor_id, internal_route'),
            ]);

            const routesByUser = {};
            const addRoute = (uid, r) => {
                if (!uid || !r) return;
                const clean = String(r).trim();
                if (!clean) return;
                if (!routesByUser[uid]) routesByUser[uid] = new Set();
                routesByUser[uid].add(clean);
            };

            (salesRoutesRes.data || []).forEach((row) => addRoute(row.supervisor_id, row.sales_route));
            (internalRoutesRes.data || []).forEach((row) => addRoute(row.supervisor_id, row.internal_route));

            const profMap = {};
            (profilesRes.data || []).forEach((p) => {
                if (p.route) {
                    String(p.route)
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .forEach((r) => addRoute(p.id, r));
                }
                const assignedRoutes = routesByUser[p.id] ? Array.from(routesByUser[p.id]) : [];
                profMap[p.id] = {
                    ...p,
                    displayName: p.name || p.full_name || p.email || 'Usuario',
                    normalizedRole: String(p.role || '').toLowerCase().trim(),
                    routes: assignedRoutes,
                };
            });

            const finalUserRoutesMap = {};
            Object.keys(routesByUser).forEach((uid) => {
                finalUserRoutesMap[uid] = Array.from(routesByUser[uid]);
            });
            setProfiles(profMap);
            setUserRoutesMap(finalUserRoutesMap);

            // 2. Rango horario del día seleccionado (hora de México UTC-6)
            const startIso = `${selectedDate}T00:00:00-06:00`;
            const endIso = `${selectedDate}T23:59:59.999-06:00`;

            // 3. Consultar puntos GPS de user_locations y visitas registradas en esa fecha
            const [locRes, visitsRes] = await Promise.all([
                supabase
                    .from('user_locations')
                    .select('*')
                    .gte('timestamp', startIso)
                    .lte('timestamp', endIso)
                    .order('timestamp', { ascending: true })
                    .limit(10000),
                supabase
                    .from('visits')
                    .select('id, user_id, client_id, client_code, business_name, cliente_nombre, ruta, fecha, hora, motivo, notes, lat, lng, photo_fachada, created_at')
                    .eq('fecha', selectedDate)
                    .order('created_at', { ascending: true }),
            ]);

            setRawLocations(locRes.data || []);
            setDayVisits(visitsRes.data || []);
        } catch (error) {
            console.error('Error fetching GPS tracking data:', error);
        } finally {
            setLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        fetchTrackingData();

        const channel = supabase
            .channel('public:user_locations_trail')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_locations' }, (payload) => {
                const newLoc = payload.new;
                if (!newLoc?.timestamp) return;
                const locDateMex = new Date(newLoc.timestamp).toLocaleDateString('en-CA', {
                    timeZone: 'America/Mexico_City',
                });
                if (locDateMex === selectedDate) {
                    setRawLocations((prev) => [...prev, newLoc]);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchTrackingData, selectedDate]);

    // Lista de todas las rutas disponibles (para el filtro por Ruta)
    const availableRoutes = useMemo(() => {
        const set = new Set();
        Object.values(userRoutesMap).forEach((arr) => arr.forEach((r) => set.add(r)));
        dayVisits.forEach((v) => {
            if (v.ruta) set.add(String(v.ruta).trim());
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }, [userRoutesMap, dayVisits]);

    const roleMatches = useCallback(
        (roleStr) => {
            if (selectedRole === 'all') return true;
            const r = String(roleStr || '').toLowerCase().trim();
            if (selectedRole === 'asesor-dinamico') {
                return ['asesor-dinamico', 'asesor_dinamico', 'asesor dinamico', 'asesor', 'vendedor'].includes(r);
            }
            if (selectedRole === 'instalador') {
                return ['instalador', 'installer'].includes(r);
            }
            return r === selectedRole;
        },
        [selectedRole]
    );

    const userMatchesRoute = useCallback(
        (userId, visitRoute = null) => {
            if (selectedRoute === 'all') return true;
            const target = String(selectedRoute).trim().toLowerCase();
            if (visitRoute && String(visitRoute).trim().toLowerCase() === target) return true;
            const assigned = userRoutesMap[userId] || profiles[userId]?.routes || [];
            return assigned.some((r) => String(r).trim().toLowerCase() === target);
        },
        [selectedRoute, userRoutesMap, profiles]
    );

    // Lista de usuarios filtrados por Rol y Ruta para el selector de Usuario
    const availableUsers = useMemo(() => {
        const activeIds = new Set([
            ...rawLocations.map((l) => l.user_id),
            ...dayVisits.map((v) => v.user_id),
            ...Object.keys(profiles),
        ]);

        return Array.from(activeIds)
            .map((uid) => profiles[uid])
            .filter(Boolean)
            .filter((p) => roleMatches(p.normalizedRole))
            .filter((p) => {
                if (selectedRoute === 'all') return true;
                const hasVisitOnRoute = dayVisits.some(
                    (v) => v.user_id === p.id && String(v.ruta || '').trim().toLowerCase() === String(selectedRoute).trim().toLowerCase()
                );
                return hasVisitOnRoute || userMatchesRoute(p.id);
            })
            .sort((a, b) => a.displayName.localeCompare(b.displayName));
    }, [rawLocations, dayVisits, profiles, roleMatches, selectedRoute, userMatchesRoute]);

    // Construir recorrido completo (GPS + puntos de visita) agrupado por usuario
    const userTrails = useMemo(() => {
        const byUser = {};

        const ensureUser = (uid) => {
            if (!uid) return null;
            if (!byUser[uid]) {
                byUser[uid] = {
                    userId: uid,
                    profile: profiles[uid] || {
                        id: uid,
                        displayName: `Usuario ${String(uid).slice(0, 6)}`,
                        role: 'campo',
                        normalizedRole: 'campo',
                        routes: userRoutesMap[uid] || [],
                    },
                    gpsPoints: [],
                    visits: [],
                };
            }
            return byUser[uid];
        };

        rawLocations.forEach((loc) => {
            const lat = Number(loc.latitude);
            const lng = Number(loc.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return;
            const bucket = ensureUser(loc.user_id);
            if (!bucket) return;
            bucket.gpsPoints.push({
                id: loc.id || `${loc.user_id}-${loc.timestamp}`,
                lat,
                lng,
                accuracy: Number(loc.accuracy || 0),
                speedKmh: loc.speed && Number(loc.speed) > 0 ? Math.round(Number(loc.speed) * 3.6) : 0,
                timestamp: loc.timestamp,
                timeLabel: new Date(loc.timestamp).toLocaleTimeString('es-MX', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                    timeZone: 'America/Mexico_City',
                }),
                source: 'gps',
            });
        });

        dayVisits.forEach((v) => {
            const bucket = ensureUser(v.user_id);
            if (!bucket) return;
            const lat = Number(v.lat);
            const lng = Number(v.lng);
            const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
            bucket.visits.push({
                ...v,
                lat: hasCoords ? lat : null,
                lng: hasCoords ? lng : null,
                hasCoords,
                clientLabel: v.business_name || v.cliente_nombre || v.client_code || 'Cliente visitado',
                timeLabel:
                    v.hora ||
                    (v.created_at
                        ? new Date(v.created_at).toLocaleTimeString('es-MX', {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                              timeZone: 'America/Mexico_City',
                          })
                        : '--:--'),
            });
        });

        return Object.values(byUser)
            .filter((item) => {
                if (selectedUserId !== 'all' && item.userId !== selectedUserId) return false;
                if (!roleMatches(item.profile.normalizedRole)) return false;
                if (selectedRoute !== 'all') {
                    const hasVisitInRoute = item.visits.some(
                        (v) => String(v.ruta || '').trim().toLowerCase() === String(selectedRoute).trim().toLowerCase()
                    );
                    if (!hasVisitInRoute && !userMatchesRoute(item.userId)) return false;
                }
                return item.gpsPoints.length > 0 || item.visits.some((v) => v.hasCoords);
            })
            .map((item, idx) => {
                // Si el usuario tiene puntos GPS continuos, usamos esos para la polilínea;
                // y también integramos cronológicamente las visitas con coordenadas para que el trazo pase por cada visita
                const combinedChronological = [
                    ...item.gpsPoints.map((p) => ({
                        ...p,
                        sortTime: new Date(p.timestamp).getTime() || 0,
                    })),
                    ...item.visits
                        .filter((v) => v.hasCoords)
                        .map((v) => ({
                            id: `visit-pt-${v.id}`,
                            lat: v.lat,
                            lng: v.lng,
                            accuracy: 15,
                            speedKmh: 0,
                            timestamp: v.created_at || `${selectedDate}T${v.hora || '12:00'}:00-06:00`,
                            timeLabel: v.timeLabel,
                            source: 'visit',
                            clientLabel: v.clientLabel,
                            sortTime: v.created_at ? new Date(v.created_at).getTime() : 0,
                        })),
                ].sort((a, b) => a.sortTime - b.sortTime);

                let distanceKm = 0;
                for (let i = 1; i < combinedChronological.length; i++) {
                    const prev = combinedChronological[i - 1];
                    const curr = combinedChronological[i];
                    const segKm = calcDistanceKm(prev.lat, prev.lng, curr.lat, curr.lng);
                    // Ignorar saltos irreales (> 80km en un solo salto)
                    if (segKm < 80) {
                        distanceKm += segKm;
                    }
                }

                const latestPoint = combinedChronological[combinedChronological.length - 1] || null;
                const firstPoint = combinedChronological[0] || null;
                const routesSet = new Set([
                    ...(item.profile.routes || []),
                    ...item.visits.map((v) => v.ruta).filter(Boolean),
                ]);

                return {
                    ...item,
                    color: USER_TRAIL_COLORS[idx % USER_TRAIL_COLORS.length],
                    pathPoints: combinedChronological,
                    distanceKm: Number(distanceKm.toFixed(2)),
                    latestPoint,
                    firstPoint,
                    routesList: Array.from(routesSet),
                };
            });
    }, [
        rawLocations,
        dayVisits,
        profiles,
        userRoutesMap,
        selectedUserId,
        selectedRoute,
        selectedDate,
        roleMatches,
        userMatchesRoute,
    ]);

    const allVisibleMapPoints = useMemo(() => {
        const pts = [];
        userTrails.forEach((u) => {
            u.pathPoints.forEach((p) => pts.push({ lat: p.lat, lng: p.lng }));
        });
        return pts;
    }, [userTrails]);

    const summaryStats = useMemo(() => {
        let totalGpsPoints = 0;
        let totalVisits = 0;
        let totalKm = 0;
        userTrails.forEach((u) => {
            totalGpsPoints += u.gpsPoints.length;
            totalVisits += u.visits.length;
            totalKm += u.distanceKm;
        });
        return {
            activeUsers: userTrails.length,
            totalGpsPoints,
            totalVisits,
            totalKm: totalKm.toFixed(2),
        };
    }, [userTrails]);

    const getRoleMarkerColor = (role) => {
        const r = String(role || '').toLowerCase();
        if (r.includes('asesor') || r.includes('vendedor')) return 'blue';
        if (r.includes('supervisor')) return 'gold';
        if (r.includes('conquista')) return 'red';
        if (r.includes('autoventa')) return 'green';
        if (r.includes('chofer')) return 'blue';
        if (r.includes('preventa')) return 'orange';
        if (r.includes('instalador') || r.includes('installer')) return 'violet';
        return 'grey';
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 flex flex-col gap-5">
            <Helmet>
                <title>Mapa de Movimientos y Rastreo GPS - Cervezas Finas</title>
            </Helmet>

            {/* Encabezado y Filtros por Fecha, Ruta, Usuario y Rol */}
            <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 flex items-center gap-2.5">
                        <Navigation className="h-7 w-7 text-blue-400" />
                        Mapa de Movimientos y Recorridos GPS
                    </h1>
                    <p className="text-slate-400 text-sm mt-0.5">
                        Historial de desplazamientos, trazos por calle y visitas en campo filtrable por Usuario, Ruta y Fecha.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                    {/* Filtro de Fecha */}
                    <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5">
                        <Calendar className="h-4 w-4 text-blue-400" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="bg-transparent text-sm text-slate-100 focus:outline-none"
                        />
                    </div>

                    {/* Filtro por Ruta */}
                    <Select
                        value={selectedRoute}
                        onValueChange={(val) => {
                            setSelectedRoute(val);
                            setSelectedUserId('all');
                        }}
                    >
                        <SelectTrigger className="w-[170px] bg-slate-950 border-slate-700 text-sm">
                            <SelectValue placeholder="Filtrar por Ruta" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700 text-slate-100 max-h-72">
                            <SelectItem value="all">📍 Todas las Rutas</SelectItem>
                            {availableRoutes.map((route) => (
                                <SelectItem key={route} value={route}>
                                    Ruta {route}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Filtro por Rol */}
                    <Select
                        value={selectedRole}
                        onValueChange={(val) => {
                            setSelectedRole(val);
                            setSelectedUserId('all');
                        }}
                    >
                        <SelectTrigger className="w-[175px] bg-slate-950 border-slate-700 text-sm">
                            <SelectValue placeholder="Filtrar por Perfil" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                            <SelectItem value="all">👥 Todos los Roles</SelectItem>
                            <SelectItem value="asesor-dinamico">Asesor Dinámico</SelectItem>
                            <SelectItem value="supervisor">Supervisor</SelectItem>
                            <SelectItem value="conquista">Conquista</SelectItem>
                            <SelectItem value="autoventa">Autoventa</SelectItem>
                            <SelectItem value="chofer">Reparto (Chofer)</SelectItem>
                            <SelectItem value="preventa">Preventa</SelectItem>
                            <SelectItem value="instalador">Instaladores</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Filtro por Usuario */}
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                        <SelectTrigger className="w-[230px] bg-slate-950 border-slate-700 text-sm">
                            <SelectValue placeholder="Filtrar por Usuario" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700 text-slate-100 max-h-72">
                            <SelectItem value="all">👤 Todos los Usuarios ({availableUsers.length})</SelectItem>
                            {availableUsers.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                    {u.displayName} {u.routes?.length ? `· (${u.routes.slice(0, 2).join(', ')})` : ''}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchTrackingData}
                        disabled={loading}
                        className="bg-slate-950 border-slate-700 text-slate-200 hover:bg-slate-800 gap-1.5"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Actualizar
                    </Button>
                </div>
            </header>

            {/* Tarjetas KPI de Movimientos y Controles de Capas */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400">
                        <User className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-400">Usuarios con Recorrido</p>
                        <p className="text-xl font-black text-white">{summaryStats.activeUsers}</p>
                    </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                        <RouteIcon className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-400">Distancia Recorrida</p>
                        <p className="text-xl font-black text-emerald-400">{summaryStats.totalKm} km</p>
                    </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                        <Activity className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-400">Puntos GPS Capturados</p>
                        <p className="text-xl font-black text-indigo-300">{summaryStats.totalGpsPoints}</p>
                    </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400">
                        <Store className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-400">Visitas en el Día</p>
                        <p className="text-xl font-black text-amber-300">{summaryStats.totalVisits}</p>
                    </div>
                </div>

                {/* Controles de Capas del Mapa */}
                <div className="col-span-2 lg:col-span-1 bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-col justify-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5 text-blue-400" /> Capas del Mapa
                    </span>
                    <div className="flex flex-wrap gap-2 text-xs">
                        <button
                            type="button"
                            onClick={() => setShowTrails((v) => !v)}
                            className={`px-2 py-1 rounded-md border font-medium transition ${
                                showTrails
                                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                                    : 'bg-slate-950 border-slate-800 text-slate-500'
                            }`}
                        >
                            📈 Línea Ruta
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowBreadcrumbs((v) => !v)}
                            className={`px-2 py-1 rounded-md border font-medium transition ${
                                showBreadcrumbs
                                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                                    : 'bg-slate-950 border-slate-800 text-slate-500'
                            }`}
                        >
                            🔵 Puntos GPS
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowVisits((v) => !v)}
                            className={`px-2 py-1 rounded-md border font-medium transition ${
                                showVisits
                                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                                    : 'bg-slate-950 border-slate-800 text-slate-500'
                            }`}
                        >
                            🏪 Visitas
                        </button>
                    </div>
                </div>
            </div>

            {/* Contenedor Principal: Mapa Interactivo + Lista Lateral de Usuarios/Rutas */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 flex-1 min-h-[600px]">
                {/* Mapa con Polilíneas de Movimiento, Puntos GPS y Visitas */}
                <div className="rounded-2xl overflow-hidden border border-slate-800 shadow-2xl relative min-h-[540px] z-0">
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm z-50">
                            <div className="text-blue-400 flex flex-col items-center">
                                <Navigation className="h-8 w-8 animate-spin mb-2" />
                                Cargando recorridos GPS...
                            </div>
                        </div>
                    )}

                    <MapContainer
                        center={[20.659698, -103.349609]}
                        zoom={12}
                        style={{ height: '100%', width: '100%', zIndex: 1 }}
                    >
                        <TileLayer
                            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        />

                        {allVisibleMapPoints.length > 0 && <FitMapToPoints points={allVisibleMapPoints} />}

                        {userTrails.map((trail) => {
                            const polylinePositions = trail.pathPoints.map((p) => [p.lat, p.lng]);
                            const markerColor = getRoleMarkerColor(trail.profile.normalizedRole);

                            return (
                                <React.Fragment key={trail.userId}>
                                    {/* 1. Polilínea del recorrido completo del usuario en el día */}
                                    {showTrails && polylinePositions.length >= 2 && (
                                        <Polyline
                                            positions={polylinePositions}
                                            pathOptions={{
                                                color: trail.color,
                                                weight: 4,
                                                opacity: 0.85,
                                            }}
                                        />
                                    )}

                                    {/* 2. Puntos intermedios (breadcrumbs cronológicos) */}
                                    {showBreadcrumbs &&
                                        trail.gpsPoints.map((pt, idx) => (
                                            <CircleMarker
                                                key={pt.id || `${trail.userId}-pt-${idx}`}
                                                center={[pt.lat, pt.lng]}
                                                radius={idx === 0 ? 7 : 4}
                                                pathOptions={{
                                                    color: '#ffffff',
                                                    weight: 1.5,
                                                    fillColor: idx === 0 ? '#22c55e' : trail.color,
                                                    fillOpacity: 0.9,
                                                }}
                                            >
                                                <Popup>
                                                    <div className="text-slate-800 text-xs space-y-1">
                                                        <div className="font-bold text-sm">
                                                            {idx === 0 ? '🟢 Inicio de Recorrido' : `📍 Punto GPS #${idx + 1}`}
                                                        </div>
                                                        <div className="font-semibold">{trail.profile.displayName}</div>
                                                        <div>Hora: <strong>{pt.timeLabel}</strong></div>
                                                        {pt.speedKmh > 0 && <div>Velocidad: {pt.speedKmh} km/h</div>}
                                                        {pt.accuracy > 0 && <div>Precisión: ±{Math.round(pt.accuracy)}m</div>}
                                                    </div>
                                                </Popup>
                                            </CircleMarker>
                                        ))}

                                    {/* 3. Marcadores de Visitas Realizadas en el día */}
                                    {showVisits &&
                                        trail.visits
                                            .filter((v) => v.hasCoords)
                                            .map((visit, vIdx) => (
                                                <CircleMarker
                                                    key={`visit-${visit.id || vIdx}`}
                                                    center={[visit.lat, visit.lng]}
                                                    radius={8}
                                                    pathOptions={{
                                                        color: '#064e3b',
                                                        weight: 2,
                                                        fillColor: '#10b981',
                                                        fillOpacity: 0.95,
                                                    }}
                                                >
                                                    <Popup>
                                                        <div className="text-slate-800 text-xs space-y-1 min-w-[190px]">
                                                            <div className="font-bold text-emerald-700 text-sm">
                                                                🏪 Visita #{vIdx + 1}: {visit.clientLabel}
                                                            </div>
                                                            <div>
                                                                Asesor: <strong>{trail.profile.displayName}</strong>
                                                            </div>
                                                            {visit.ruta && (
                                                                <div>
                                                                    Ruta: <strong>{visit.ruta}</strong>
                                                                </div>
                                                            )}
                                                            <div>
                                                                Hora: <strong>{visit.timeLabel}</strong> · Motivo: {visit.motivo || 'Visita'}
                                                            </div>
                                                            {visit.notes && (
                                                                <div className="italic text-slate-600 border-t pt-1 mt-1">
                                                                    "{visit.notes}"
                                                                </div>
                                                            )}
                                                            {visit.photo_fachada && (
                                                                <a
                                                                    href={visit.photo_fachada}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="inline-block mt-1 text-blue-600 underline font-semibold"
                                                                >
                                                                    Ver foto de fachada
                                                                </a>
                                                            )}
                                                        </div>
                                                    </Popup>
                                                </CircleMarker>
                                            ))}

                                    {/* 4. Pin principal con la Última Ubicación del Usuario */}
                                    {trail.latestPoint && (
                                        <Marker
                                            position={[trail.latestPoint.lat, trail.latestPoint.lng]}
                                            icon={createCustomIcon(markerColor)}
                                        >
                                            <Popup>
                                                <div className="p-1 text-slate-800 min-w-[200px]">
                                                    <h3 className="font-bold text-base flex items-center gap-1.5">
                                                        <User className="h-4 w-4 text-blue-600" />
                                                        {trail.profile.displayName}
                                                    </h3>
                                                    <div className="text-xs text-slate-500 uppercase font-bold mb-1">
                                                        {trail.profile.role || 'Campo'}
                                                        {trail.routesList.length > 0 && ` · Ruta(s): ${trail.routesList.join(', ')}`}
                                                    </div>
                                                    <div className="text-xs space-y-1 border-t pt-1.5 mt-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <Clock className="h-3.5 w-3.5 text-slate-500" />
                                                            Último punto: <strong>{trail.latestPoint.timeLabel}</strong>
                                                        </div>
                                                        <div>
                                                            Distancia del día: <strong>{trail.distanceKm} km</strong>
                                                        </div>
                                                        <div>
                                                            Puntos GPS: <strong>{trail.gpsPoints.length}</strong> · Visitas:{' '}
                                                            <strong>{trail.visits.length}</strong>
                                                        </div>
                                                    </div>
                                                </div>
                                            </Popup>
                                        </Marker>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </MapContainer>
                </div>

                {/* Panel Lateral: Resumen por Usuario / Ruta y Bitácora Cronológica */}
                <aside className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 max-h-[680px] overflow-y-auto">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                        <div>
                            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                                Personal y Rutas ({userTrails.length})
                            </h2>
                            <p className="text-xs text-slate-400">
                                Haz clic en un usuario para enfocar su recorrido
                            </p>
                        </div>
                        {selectedUserId !== 'all' && (
                            <button
                                type="button"
                                onClick={() => setSelectedUserId('all')}
                                className="text-xs text-blue-400 hover:text-blue-300 underline font-semibold"
                            >
                                Ver todos
                            </button>
                        )}
                    </div>

                    {userTrails.length === 0 ? (
                        <div className="text-center py-12 px-3 text-slate-400 text-sm space-y-2">
                            <MapPin className="h-8 w-8 mx-auto text-slate-600" />
                            <p className="font-semibold text-slate-300">
                                Sin movimientos registrados para estos filtros en {selectedDate}.
                            </p>
                            <p className="text-xs text-slate-500">
                                Selecciona otra fecha, ruta o usuario. Los movimientos offline se sincronizan automáticamente al detectar internet.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {userTrails.map((trail) => {
                                const isSelected = selectedUserId === trail.userId;
                                return (
                                    <div
                                        key={trail.userId}
                                        onClick={() => setSelectedUserId(isSelected ? 'all' : trail.userId)}
                                        className={`cursor-pointer rounded-xl border p-3 transition ${
                                            isSelected
                                                ? 'bg-blue-950/40 border-blue-500/60 ring-1 ring-blue-500/40'
                                                : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className="w-3 h-3 rounded-full shrink-0"
                                                    style={{ backgroundColor: trail.color }}
                                                />
                                                <div>
                                                    <h3 className="text-sm font-bold text-white leading-tight">
                                                        {trail.profile.displayName}
                                                    </h3>
                                                    <span className="text-[11px] uppercase font-semibold text-slate-400">
                                                        {trail.profile.role || 'Campo'}
                                                    </span>
                                                </div>
                                            </div>
                                            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                                                {trail.distanceKm} km
                                            </span>
                                        </div>

                                        {trail.routesList.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {trail.routesList.slice(0, 6).map((r) => (
                                                    <span
                                                        key={r}
                                                        className="text-[10px] font-semibold bg-slate-800 text-slate-200 px-2 py-0.5 rounded"
                                                    >
                                                        Ruta {r}
                                                    </span>
                                                ))}
                                                {trail.routesList.length > 6 && (
                                                    <span className="text-[10px] text-slate-400">
                                                        +{trail.routesList.length - 6} más
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-[11px] text-slate-300 bg-slate-900/80 rounded-lg p-2">
                                            <div>
                                                <span className="text-slate-500 block">Puntos GPS</span>
                                                <strong>{trail.gpsPoints.length}</strong>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 block">Visitas</span>
                                                <strong>{trail.visits.length}</strong>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 block">Horario</span>
                                                <strong>
                                                    {trail.firstPoint?.timeLabel || '--'} - {trail.latestPoint?.timeLabel || '--'}
                                                </strong>
                                            </div>
                                        </div>

                                        {/* Bitácora cronológica de paradas y visitas cuando el usuario está seleccionado */}
                                        {isSelected && trail.pathPoints.length > 0 && (
                                            <div className="mt-3 pt-2.5 border-t border-slate-800 space-y-1.5 max-h-56 overflow-y-auto">
                                                <p className="text-[11px] font-bold uppercase text-blue-300">
                                                    Bitácora Cronológica ({trail.pathPoints.length} eventos)
                                                </p>
                                                {trail.pathPoints.map((ev, i) => (
                                                    <div
                                                        key={`${ev.id}-${i}`}
                                                        className="flex items-center justify-between text-[11px] bg-slate-900/70 px-2 py-1 rounded"
                                                    >
                                                        <span className="truncate max-w-[200px]">
                                                            {ev.source === 'visit'
                                                                ? `🏪 Visita: ${ev.clientLabel}`
                                                                : i === 0
                                                                ? '🟢 Inicio de ruta GPS'
                                                                : `📍 Movimiento GPS (${ev.lat.toFixed(4)}, ${ev.lng.toFixed(4)})`}
                                                        </span>
                                                        <span className="font-mono text-slate-400 shrink-0 ml-2">
                                                            {ev.timeLabel}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
};

export default GPSTrackingDashboard;
