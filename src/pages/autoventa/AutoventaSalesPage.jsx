import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import SalesDialog from "@/components/SalesDialog";
import NoSaleModal from "@/components/NoSaleModal.jsx";
import InteractiveMap from "@/components/common/InteractiveMap";
import { getClients } from "@/repositories/clientsRepository";
import { getDailySales } from "@/repositories/directSalesRepository";
import { checkDailyAudit } from "@/repositories/inventoryRepository";
import DashboardSkeleton from "@/components/skeletons/DashboardSkeleton";
import { getTodayMexico, getTodayDayOfWeekMexico } from "@/lib/dateUtils";
import { getCurrentPositionSafe } from "@/lib/geolocation";


// Location Utils
const parseCoords = (client) => {
    if (!client) return null;
    if (client.coords) {
        try {
            const c = typeof client.coords === 'string' ? JSON.parse(client.coords) : client.coords;
            if (Array.isArray(c) && c.length >= 2) return { lat: Number(c[0]), lng: Number(c[1]) };
            if (c && typeof c === 'object' && c.lat != null && c.lng != null) return { lat: Number(c.lat), lng: Number(c.lng) };
        } catch (e) { }
    }
    const lat = client.lat ?? client.latitude ?? client.latitud;
    const lng = client.lng ?? client.longitude ?? client.longitud;
    if (lat != null && lng != null) return { lat: Number(lat), lng: Number(lng) };
    return null;
};

const distanceMeters = (lat1, lon1, lat2, lon2) => {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

// Icons 
import { DollarSign, MapPin, Search, Map as MapIcon, List, Navigation, User, Phone, CheckCircle2, XCircle, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Helper for route matching
const normalizeRouteValue = (value) => {
    if (value == null) return "";
    return String(value).toLowerCase().replace(/\.xlsx$/g, "").trim();
};

const splitMultiValue = (raw) => {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw.map((entry) => String(entry));
    const text = String(raw).trim();
    if (!text) return [];
    if (text.startsWith("[")) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) return parsed.map((entry) => String(entry));
        } catch (e) { }
    }
    return text.split(/[,;|]/).map((entry) => entry.trim()).filter(Boolean);
};

const dayNameToNumber = (input) => {
    if (input === null || input === undefined) return null;
    const dictionary = {
        domingo: 0, dom: 0,
        lunes: 1, lun: 1,
        martes: 2, mar: 2,
        miercoles: 3, mier: 3, mi: 3,
        jueves: 4, jue: 4,
        viernes: 5, vie: 5,
        sabado: 6, sab: 6
    };
    const key = String(input).trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(dictionary, key)) return dictionary[key];
    const numeric = Number(key);
    if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 6) return numeric;
    return null;
};

const parseVisitDays = (client) => {
    // User requested to check 'visit_day' specifically
    const raw = client.visit_days ?? client.visitDays ?? client.visit_day ?? client.visitDaysText ?? "";
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(dayNameToNumber).filter(v => v !== null);

    // JSON Check
    if (typeof raw === "string" && raw.trim().startsWith("[")) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.map(dayNameToNumber).filter(v => v !== null);
        } catch (e) { }
    }

    return splitMultiValue(raw).map(dayNameToNumber).filter(v => v !== null);
};

const ROUTE_CANDIDATE_FIELDS = ["sales_route", "internal_route", "route", "ruta"];

const collectClientRouteCandidates = (client) => {
    const set = new Set();
    if (!client) return [];
    ROUTE_CANDIDATE_FIELDS.forEach((field) => {
        if (field in client) {
            const entries = splitMultiValue(client[field]);
            entries.forEach((entry) => {
                const normalized = normalizeRouteValue(entry);
                if (normalized) set.add(normalized);
            });
        }
    });
    return Array.from(set);
};

export default function AutoventaSalesPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { user } = useSupabaseAuth();

    // State
    const [userRoute, setUserRoute] = useState("");
    const [loading, setLoading] = useState(true);
    const [clients, setClients] = useState([]);
    const [viewMode, setViewMode] = useState("list"); // 'list' | 'map'
    const [search, setSearch] = useState("");

    // Transaction State
    const [salesDialogOpen, setSalesDialogOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState(null);
    const [noSaleClient, setNoSaleClient] = useState(null);
    const [noSaleModalOpen, setNoSaleModalOpen] = useState(false);

    // Daily Status State
    const [visitedIds, setVisitedIds] = useState(new Set());
    const [soldIds, setSoldIds] = useState(new Set());
    const [isLocked, setIsLocked] = useState(false); // New lock state

    // Use Mexico timezone for dates (fixes issue where day changes at wrong time)
    const todayNum = getTodayDayOfWeekMexico(); // 0-6 in Mexico time  
    const todayStr = getTodayMexico(); // YYYY-MM-DD in Mexico time

    // 1. Get User Route (Robust) & Check Audit Lock
    useEffect(() => {
        const fetchRoute = async () => {
            // Priority 1: Check Profile (Source of Truth set by Sistemas)
            if (user?.id) {
                try {
                    const { data: profile } = await supabase.from("profiles").select("ruta").eq("id", user.id).single();
                    if (profile && profile.ruta) {
                        found = String(profile.ruta).trim();
                    }
                } catch (e) {
                    console.warn("Error fetching profile route", e);
                }
            }

            // Priority 2: Check Metadata
            const metaRoute = user?.user_metadata?.route_number || user?.user_metadata?.route || user?.user_metadata?.sales_route || user?.user_metadata?.ruta || "";

            const finalRoute = normalizeRouteValue(found) || normalizeRouteValue(metaRoute);
            if (finalRoute) {
                setUserRoute(finalRoute);
                console.log("Autoventa Route detected:", finalRoute);
            }
        };
        fetchRoute();

        async function checkLock() {
            if (user) {
                let locked = false;
                // 1. Check Inventory Audit (Legacy)
                try {
                    locked = await checkDailyAudit(user.id);
                } catch (e) { console.warn(e); }

                // 2. Check Route Session (New)
                if (!locked) {
                    try {
                        const { getRouteSession, ROUTE_STATUS } = await import('@/repositories/routeRepository');
                        const { getTodayMexico } = await import('@/lib/dateUtils');
                        const session = await getRouteSession(user.id, getTodayMexico());
                        console.log('[AutoventaSalesPage] Session Check:', session);

                        if (session && session.status === ROUTE_STATUS.CLOSED) {
                            setIsLocked(true);
                        } else {
                            // Explicitly set false if open (in case of re-mounts/updates)
                            setIsLocked(false);
                        }
                    } catch (e) { console.error('Error checking route session', e); }
                }

                // If audit locked it, or session locked it, then it's locked.
                // The new logic above already sets setIsLocked, so this final check
                // should primarily consider the 'locked' variable from the audit.
                // If the session logic is the definitive source for `isLocked`,
                // then the `setIsLocked(locked)` below might be redundant or overridden.
                // For now, we'll keep the original `locked` variable for audit and let the
                // session check explicitly set `isLocked` if it's not already locked by audit.
                // If audit locks it, `locked` will be true
                if (locked) { // This 'locked' comes from checkDailyAudit
                    setIsLocked(true); // Ensure state is set if audit locked it
                    console.log("Route locked (Audit or Closed Session)");
                }
            }
        };
        checkLock();
    }, [user]);

    // 2. Load Clients (Hybrid: Local First -> Then Network)
    useEffect(() => {
        const fetchClients = async () => {
            if (!userRoute) {
                setClients([]);
                setLoading(false);
                return;
            }

            // A. FAST RENDER: Load from Local Storage first
            try {
                const { getLocalClients } = await import('@/repositories/clientsRepository');
                const local = await getLocalClients(userRoute);
                if (local && local.length > 0) {
                    const filteredLocal = filterClientsLogic(local, userRoute, todayNum);
                    if (filteredLocal.length > 0) {
                        setClients(filteredLocal);
                        setLoading(false); // Show immediately
                    }
                }
            } catch (e) { console.warn("Local client load error", e); }

            // B. NETWORK SYNC: Fetch fresh from Supabase/MySQL
            // This runs even if we showed local data, to ensure updates.
            try {
                if (!clients.length) setLoading(true); // Show loader only if we have nothing

                const routeClients = await getClients(userRoute);
                const filtered = filterClientsLogic(routeClients, userRoute, todayNum);

                // Sort: Alphabetical
                filtered.sort((a, b) => (a.business_name || a.name).localeCompare(b.business_name || b.name));
                setClients(filtered);

            } catch (e) {
                console.error("Error loading clients", e);
            } finally {
                setLoading(false);
            }
        };
        fetchClients();
    }, [userRoute, todayNum, user]);

    // Helper for consistency
    const filterClientsLogic = (list, route, day) => {
        return list.filter(c => {
            const candidates = collectClientRouteCandidates(c);
            const routeMatch = candidates.some(val => val === route);
            const days = parseVisitDays(c);
            const dayMatch = days.includes(day);
            return routeMatch && dayMatch;
        });
    };

    // 3. Load Daily Status (Sales/Visits today)
    const refreshStatus = useCallback(async () => {
        if (!user) return;
        try {
            const sales = await getDailySales(user.id, todayStr);
            const sold = new Set(sales.map(s => s.client_id));
            const visited = new Set(sales.map(s => s.client_id));
            setSoldIds(sold);
            setVisitedIds(visited);
        } catch (e) { console.error(e); }
    }, [user, todayStr]);

    useEffect(() => { refreshStatus(); }, [refreshStatus]);

    // Filtering
    const filteredClients = useMemo(() => {
        if (!search) return clients;
        const q = search.toLowerCase();
        return clients.filter(c =>
            (c.name || "").toLowerCase().includes(q) ||
            (c.business_name || "").toLowerCase().includes(q) ||
            (c.client_code || "").toLowerCase().includes(q)
        );
    }, [clients, search]);

    // Location Check
    const checkLocationAndProceed = async (client, actionCallback) => {
        const clientCoords = parseCoords(client);

        if (!clientCoords) {
            toast({
                title: 'Ubicación no disponible',
                description: 'El cliente no tiene coordenadas configuradas. No se puede verificar la ubicación para vender.',
                variant: 'destructive'
            });
            return;
        }

        try {
            const pos = await getCurrentPositionSafe({ enableHighAccuracy: true, timeout: 10000 });
            const userLat = pos.coords.latitude;
            const userLng = pos.coords.longitude;
            const dist = distanceMeters(userLat, userLng, clientCoords.lat, clientCoords.lng);

            // Allow if within 50 meters
            if (dist <= 50) {
                actionCallback();
            } else {
                toast({
                    title: 'Fuera de rango',
                    description: `Estás a ${Math.round(dist)} m. Debes estar dentro de 50 metros para realizar la operación.`,
                    variant: 'destructive'
                });
            }
        } catch (err) {
            let msg = 'No se pudo obtener tu ubicación.';
            if (err.code === 1) msg = 'Permiso de ubicación denegado. Habilita la ubicación para vender.';
            else if (err.code === 2) msg = 'Ubicación no disponible.';
            else if (err.code === 3) msg = 'Tiempo de espera agotado al obtener ubicación.';

            toast({ title: 'Error de ubicación', description: msg, variant: 'destructive' });
        }
    };

    // Actions
    const handleSaleClick = (client) => {
        if (isLocked) {
            toast({
                title: "Ruta Cerrada",
                description: "Ya has realizado el cierre (auditoría) de hoy. No puedes realizar más ventas.",
                variant: "destructive"
            });
            return;
        }

        checkLocationAndProceed(client, () => {
            // Navigate to dedicated Mobile Session
            navigate('/autoventa/session', { state: { client } });
        });
    };

    const handleNoSaleClick = (client) => {
        if (isLocked) {
            toast({
                title: "Ruta Cerrada",
                description: "Ya has realizado el cierre (auditoría) de hoy.",
                variant: "destructive"
            });
            return;
        }

        checkLocationAndProceed(client, () => {
            setNoSaleClient(client);
            setNoSaleModalOpen(true);
        });
    };

    const onSaleSuccess = () => {
        setSalesDialogOpen(false);
        refreshStatus();
        toast({ title: "Venta Exitosa", className: "bg-green-600 text-white" });
    };

    const onNoSaleSuccess = () => {
        setNoSaleModalOpen(false);
        setNoSaleClient(null);
        refreshStatus();
        toast({ title: "Reporte Guardado", description: "Se registró la no-venta." });
    };

    return (
        <div className="max-w-screen-2xl mx-auto px-4 py-4 space-y-6 bg-[#1f2031] min-h-screen text-white pb-24">
            <Helmet><title>Mi Ruta - Autoventa</title></Helmet>

            {/* Header (Simplified) */}
            <div className="flex flex-col lg:flex-row lg:items-end gap-3 mb-2">
                <div className="flex-1">
                    <h1 className="text-3xl font-extrabold leading-tight flex items-center gap-3">
                        {isLocked && <Lock className="text-red-500 w-8 h-8" />}
                        Mi Ruta
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-white/60 text-sm">
                            {isLocked ? "RUTA CERRADA - Auditoría completada" : `${filteredClients.length} Clientes visible${filteredClients.length !== 1 ? 's' : ''}`}
                        </span>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button onClick={() => setViewMode("list")} className={`p-2 rounded-md transition border border-white/10 ${viewMode === 'list' ? 'bg-green-600 text-white shadow-lg' : 'bg-[#2a2c44] text-white/60 hover:text-white'}`}>
                        <List size={20} />
                    </button>
                    <button onClick={() => setViewMode("map")} className={`p-2 rounded-md transition border border-white/10 ${viewMode === 'map' ? 'bg-green-600 text-white shadow-lg' : 'bg-[#2a2c44] text-white/60 hover:text-white'}`}>
                        <MapIcon size={20} />
                    </button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-4 top-3.5 text-white/40" size={20} />
                <input
                    type="text"
                    placeholder="Buscar cliente..."
                    className="w-full pl-12 pr-4 py-3 rounded-xl bg-[#2a2c44] border hover:border-white/20 border-white/10 focus:ring-2 focus:ring-green-500/50 focus:border-green-500 text-white placeholder-white/30 transition-all outline-none"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            {/* Content */}
            <div className="mt-4">
                {isLocked && (
                    <div className="mb-6 bg-red-900/20 border border-red-500/30 p-4 rounded-xl flex items-center gap-4">
                        <div className="bg-red-500/20 p-2 rounded-full text-red-400"><Lock size={24} /></div>
                        <div>
                            <p className="font-bold text-red-200">Operaciones Bloqueadas</p>
                            <p className="text-sm text-red-300/80">Se ha realizado el cierre de día. No es posible generar más ventas.</p>
                        </div>
                    </div>
                )}

                {loading ? (
                    <DashboardSkeleton />
                ) : viewMode === 'list' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[calc(100vh-280px)] overflow-y-auto pr-2">
                        {filteredClients.length === 0 && (
                            <div className="col-span-full text-center py-12 text-white/30 italic border border-dashed border-white/10 rounded-xl">
                                No se encontraron clientes para hoy.
                            </div>
                        )}
                        {filteredClients.map(client => {
                            const isSold = soldIds.has(client.id);

                            return (
                                <motion.div
                                    key={client.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`bg-[#2a2c44] rounded-xl p-4 shadow-lg border border-white/5 relative overflow-hidden group hover:border-white/10 transition-all ${isSold ? 'ring-1 ring-green-500/30 bg-green-900/10' : ''} ${isLocked ? 'opacity-60 grayscale-[0.8]' : ''}`}
                                >
                                    {/* Status Badge */}
                                    {isSold && (
                                        <div className="absolute top-0 right-0 bg-green-500/20 text-green-300 px-3 py-1 rounded-bl-xl text-[10px] font-bold tracking-wider flex items-center gap-1 border-b border-l border-green-500/10">
                                            <CheckCircle2 size={10} /> VENDIDO
                                        </div>
                                    )}

                                    <div className="mb-3 pr-8">
                                        <h3 className="font-bold text-white text-lg leading-tight mb-1 truncate">{client.business_name || client.name}</h3>
                                        <p className="text-white/40 text-xs flex items-center gap-1 truncate">
                                            <User size={10} /> {client.name}
                                        </p>
                                    </div>

                                    <div className="space-y-2 mb-4">
                                        <div className="flex items-start gap-2 text-sm text-white/60">
                                            <MapPin size={14} className="mt-0.5 flex-shrink-0 text-white/30" />
                                            <span className="line-clamp-2 text-xs">{client.address || "Sin dirección"}</span>
                                        </div>
                                        {client.phone && (
                                            <div className="flex items-center gap-2 text-sm text-white/60">
                                                <Phone size={14} className="text-white/30" />
                                                <a href={`tel:${client.phone}`} className="text-blue-400 text-xs hover:underline hover:text-blue-300 transition-colors">{client.phone}</a>
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-white/5">
                                        <Button
                                            onClick={() => handleNoSaleClick(client)}
                                            variant="ghost"
                                            disabled={isLocked}
                                            className="w-full text-white/50 hover:text-white hover:bg-white/5 h-9 text-xs"
                                        >
                                            <XCircle size={14} className="mr-2" />
                                            No Venta
                                        </Button>

                                        <Button
                                            onClick={() => handleSaleClick(client)}
                                            disabled={isLocked}
                                            className={`w-full h-9 text-xs font-bold shadow-lg ${isSold ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                                        >
                                            <DollarSign size={14} className="mr-2" />
                                            {isSold ? 'Venta Extra' : 'Vender'}
                                        </Button>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="h-[70vh] rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-[#2a2c44] relative">
                        {/* TODO: Ensure InteractiveMap supports dark mode styles or renders nicely */}
                        <InteractiveMap
                            clients={filteredClients.map(c => ({ ...c, coords: { lat: Number(c.lat), lng: Number(c.lng) } }))}
                            userLocation={null}
                            onMarkerClick={handleSaleClick}
                        />
                        {isLocked && (
                            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[500] pointer-events-none">
                                <div className="bg-[#2a2c44] p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-3 border border-red-500/20">
                                    <div className="bg-red-500/20 p-3 rounded-full text-red-400 animate-pulse"><Lock size={32} /></div>
                                    <span className="font-bold text-white text-lg">Mapa Bloqueado</span>
                                    <span className="text-white/60 text-sm">Ruta cerrada.</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Dialogs */}
            <SalesDialog
                open={salesDialogOpen}
                onOpenChange={setSalesDialogOpen}
                client={selectedClient}
                onSaleComplete={onSaleSuccess}
            />

            <NoSaleModal
                isOpen={noSaleModalOpen}
                onClose={() => setNoSaleModalOpen(false)}
                client={noSaleClient}
                onSuccess={onNoSaleSuccess}
            />
        </div>
    );
}
