import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/supabaseClient";
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { kvStorage } from '@/services/kvStorage';
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from '@/components/ui/use-toast';
import ClientVisitsList from "@/components/ClientVisitsList";
import VisitForm from "@/components/VisitForm";
import AddExistingAssetModal from '@/components/clients/AddExistingAssetModal';
import SalesDialog from '@/components/SalesDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu.jsx';
import { useNavigate } from "react-router-dom";
import { FixedSizeList as List } from "@/lib/react-window-wrapper";
import { MapPin, PackagePlus, Calendar, DollarSign, MoreVertical, Edit } from "lucide-react";
import { getCurrentPositionSafe } from '@/lib/geolocation';

const PAGE_SIZE = 1000;

// Helper hook to measure container size
const useContainerSize = () => {
    const [size, setSize] = useState({ width: 0, height: 0 });
    const ref = React.useRef(null);

    useEffect(() => {
        const updateSize = () => {
            if (ref.current) {
                setSize({
                    width: ref.current.offsetWidth,
                    height: ref.current.offsetHeight
                });
            }
        };
        window.addEventListener('resize', updateSize);
        updateSize();
        setTimeout(updateSize, 100);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    return [ref, size];
};

export default function AutoventaClientsPage() {
    const [userRoute, setUserRoute] = useState(null); // Empezamos en null para saber cuándo ya se detectó la ruta
    const [clients, setClients] = useState([]);
    const [assetSerials, setAssetSerials] = useState({});
    const [loading, setLoading] = useState(false);
    const [visitClient, setVisitClient] = useState(null);
    const [salesClient, setSalesClient] = useState(null);
    const [updatingId, setUpdatingId] = useState(null);
    const [search, setSearch] = useState("");
    const { toast } = useToast();
    const { user } = useSupabaseAuth();
    const [assetClient, setAssetClient] = useState(null);
    const navigate = useNavigate();
    /* New State for Edit Client */
    const [editClient, setEditClient] = useState(null);
    const [editForm, setEditForm] = useState({ phone: '', address: '', contact: '' });
    const [listContainerRef, listSize] = useContainerSize();
    const [routeClosed, setRouteClosed] = useState(false);

    // Check Route Status (Strict Closure)
    useEffect(() => {
        const checkSession = async () => {
            if (!user) return;
            try {
                const { getRouteSession, ROUTE_STATUS } = await import('@/repositories/routeRepository');
                const { getTodayMexico } = await import('@/lib/dateUtils');
                const session = await getRouteSession(user.id, getTodayMexico());
                if (session && session.status === ROUTE_STATUS.CLOSED) {
                    setRouteClosed(true);
                }
            } catch (e) { console.error('Error checking session', e); }
        };
        checkSession();
    }, [user]);

    useEffect(() => {
        if (editClient) {
            setEditForm({
                phone: editClient.phone || '',
                address: editClient.address || '',
                contact: editClient.contact || ''
            });
        }
    }, [editClient]);

    const handleUpdateClient = async () => {
        if (!editClient) return;
        try {
            const { updateClient } = await import('@/repositories/clientsRepository');
            await updateClient(editClient.id, {
                ...editForm, // Includes visit_days, phone, address, contact
                updated_at: new Date().toISOString() // Force sync
            });

            toast({ title: "Cliente actualizado", description: "Los datos han sido guardados." });

            // Update local state
            setClients(prev => prev.map(c => c.id === editClient.id ? { ...c, ...editForm } : c));
            setEditClient(null);
        } catch (e) {
            console.error("Error updating client:", e);
            toast({ title: "Error", description: "No se pudo actualizar el cliente.", variant: "destructive" });
        }
    };

    const fold = useCallback((s) => {
        if (s == null) return "";
        return String(s)
            .toLowerCase()
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '');
    }, []);

    const routeMatches = useCallback((c, route) => {
        const r = c?.sales_route ?? c?.internal_route ?? c?.ruta ?? c?.route;
        return String(r ?? "") === String(route ?? "");
    }, []);

    // Establecer ruta del usuario (ROBUST)
    useEffect(() => {
        let active = true;
        let cancelled = false;

        const loadRoute = async () => {
            try {
                const { detectUserRoute } = await import('@/repositories/routeRepository');
                const r = await detectUserRoute(user);
                if (active) {
                    console.log('[AutoventaClientsPage] Routes detected (Robust):', r);
                    setUserRoute(r || "");
                }
            } catch (e) { console.error(e); }
        };
        if (user) loadRoute();
        return () => { active = false; };
    }, [user]);

    // Helper for route matching (copied from AutoventaSalesPage for consistency)
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

    // ... inside component ...

    // OFFLINE-FIRST: Carga de clientes usando repositorio
    useEffect(() => {
        // Evitamos descargar clientes antes de que termine de detectar la ruta (null significa no detectado aún)
        if (userRoute === null) return; 

        let cancelled = false;

        const run = async () => {
            // Strict: If we don't have a route yet, don't try to load clients to avoid flashing wrong data
            // UNLESS we have no clients at all, then maybe show empty or skeleton.
            // MODIFIED: Remove strict return to allow offline/fallback loading
            // if (!userRoute) { return; } 

            // Just log warning but proceed to try local load
            if (!userRoute) {
                console.warn("[AutoventaClientsPage] userRoute is empty. Attempting to load ALL local clients (Offline Mode / Fallback).");
            }

            setLoading(true);
            try {
                // Determine normalized user route for comparison
                const normUserRoute = normalizeRouteValue(userRoute);

                // OPTIMIZATION: Pass userRoute to enable server-side filtering (MySQL)
                const { getClients } = await import('@/repositories/clientsRepository');
                const allClients = await getClients(userRoute || null);
                console.log("DEBUG: All Clients fetched:", allClients.length);

                if (allClients.length === 0 && navigator.onLine && clients.length > 0) {
                    // Safety: If online returned 0, maybe keep what we have? 
                    // Or assume route is truly empty.
                    // If we have existing clients and the new fetch returns 0 while online,
                    // it might be a temporary glitch or an empty route. Keep existing clients.
                    // If clients.length is 0, then it's genuinely empty.
                    if (!cancelled) setLoading(false);
                    return;
                }

                let filtered = allClients;

                // Strict filtering ONLY if route is assigned
                if (normUserRoute) {
                    filtered = allClients.filter((c, idx) => {
                        // Robust Matching using Candidates
                        const candidates = collectClientRouteCandidates(c);
                        // Relaxed Match: Check if user route is part of candidate or vice versa
                        const routeMatch = candidates.some(val =>
                            val === normUserRoute ||
                            val.includes(normUserRoute) ||
                            normUserRoute.includes(val)
                        );

                        // Strict Day Match Logic (Restored from previous session)
                        const todayNum = new Date().getDay(); // 0 for Sunday, 1 for Monday, etc.
                        const parseVisitDays = (client) => {
                            if (!client || !client.visit_days) return [];
                            if (Array.isArray(client.visit_days)) return client.visit_days;
                            try {
                                const parsed = JSON.parse(client.visit_days);
                                if (Array.isArray(parsed)) return parsed;
                            } catch (e) { /* not JSON */ }
                            return String(client.visit_days).split(',').map(Number).filter(n => !isNaN(n));
                        };
                        const days = parseVisitDays(c);
                        // If no days defined, maybe show? No, usually strict.
                        // But if days is empty, user might want to see them if queried?
                        // User requirement: "son clientes que tienen ese dia de visita"
                        const dayMatch = days.length === 0 || days.includes(todayNum);

                        return routeMatch && dayMatch;
                    });
                } else {
                    console.log("DEBUG: No user route. Showing all clients.");
                }

                console.log("DEBUG: Filtered Clients:", filtered.length);

                if (!cancelled) {
                    setClients(filtered);
                }
            } catch (err) {
                console.error('Error al cargar clientes:', err);
                // Don't clear clients on error, keep stale data
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        run();
        return () => { cancelled = true; };
    }, [userRoute]);

    useEffect(() => {
        const fetchAssetSerials = async () => {
            if (clients.length === 0) return;

            // Intentar cargar asset serials desde cache primero
            try {
                const cached = await kvStorage.getItem('advisor_asset_serials');
                if (cached) {
                    setAssetSerials(cached);
                }
            } catch (e) { }

            // Intentar actualizar desde Supabase (requiere internet)
            const clientIds = clients.map(c => c.id);
            try {
                const { data, error } = await supabase
                    .from('current_asset_locations')
                    .select('client_id, asset_serial')
                    .in('client_id', clientIds);

                if (error) {
                    console.warn("[DynamicAdvisorClients] No se pudieron cargar asset serials (offline?):", error);
                    return;
                }

                const map = {};
                (data || []).forEach(row => {
                    if (!map[row.client_id]) map[row.client_id] = [];
                    map[row.client_id].push(row.asset_serial);
                });

                setAssetSerials(map);
                // Guardar en cache
                try {
                    await kvStorage.setItem('advisor_asset_serials', map);
                } catch (e) {
                    console.warn("[DynamicAdvisorClients] No se pudo guardar asset serials en cache:", e);
                }
            } catch (err) {
                console.warn("[DynamicAdvisorClients] Error offline al cargar asset serials:", err);
                // No hacer nada, la página seguirá funcionando sin asset serials
            }
        };

        fetchAssetSerials();
    }, [clients]);

    const visibleClients = useMemo(() => {
        const q = fold(search.trim());
        if (!q) return clients;

        const isLikelyId = /^(\d+|[0-9a-f]{8}-?[0-9a-f]{4}-?[1-5][0-9a-f]{3}-?[89ab][0-9a-f]{3}-?[0-9a-f]{12})$/i.test(search.trim());

        return clients.filter((c) => {
            const idStr = fold(c.id);
            const name = fold(c.name);
            const business = fold(c.business_name);
            const code = fold(c.client_code);
            if (isLikelyId) {
                if (idStr.includes(q)) return true;
            }
            return (
                idStr.includes(q) ||
                name.includes(q) ||
                business.includes(q) ||
                code.includes(q)
            );
        });
    }, [clients, search, fold]);

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

    const updateClientGeolocation = async (client) => {
        setUpdatingId(client.id);
        try {
            const pos = await getCurrentPositionSafe({ enableHighAccuracy: true });
            const { latitude, longitude } = pos.coords;
            const { updateClient } = await import('@/repositories/clientsRepository');
            await updateClient(client.id, { coords: { lat: latitude, lng: longitude } });

            toast({ title: '¡Ubicación actualizada!' });
            setClients(prev => prev.map(c => c.id === client.id ? { ...c, coords: { lat: latitude, lng: longitude } } : c));
        } catch (error) {
            toast({ title: 'Error obteniendo ubicación', description: error.message || 'Error desconocido', variant: 'destructive' });
        } finally {
            setUpdatingId(null);
        }
    };

    const handleAssetSuccess = () => {
        setAssetClient(null);
        toast({ title: "Éxito", description: "El activo ha sido registrado y asignado al cliente." });
    }



    return (
        <>
            <div className="flex flex-col h-full w-full mx-auto p-2 md:p-6">
                <Helmet><title>Cartera de Clientes</title></Helmet>

                <div className="flex-none mb-4">
                    <h1 className="text-xl md:text-2xl font-bold mb-4 text-white">Cartera de Clientes</h1>

                    <div className="flex flex-col md:flex-row gap-2">
                        <input
                            type="text"
                            aria-label="Buscar clientes"
                            placeholder="Buscar por nombre, ID, negocio o código..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-white"
                        />
                        {search && (
                            <Button variant="outline" onClick={() => setSearch("")} className="md:w-auto">Limpiar</Button>
                        )}
                    </div>

                    <div className="mt-2 text-sm text-muted-foreground">
                        {loading ? (
                            <span>Cargando...</span>
                        ) : (
                            <span>
                                Mostrando {visibleClients.length} de {clients.length} clientes
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex-1 min-h-0 relative bg-slate-900/50 rounded-lg border border-slate-800 overflow-hidden">
                    {listContainerRef && (
                        <div ref={listContainerRef} className="absolute inset-0">
                            {loading ? (
                                <div className="flex justify-center items-center h-full">Cargando...</div>
                            ) : visibleClients.length === 0 ? (
                                <div className="flex justify-center items-center h-full text-muted-foreground">No se encontraron clientes para "{search}".</div>
                            ) : (
                                <List
                                    height={listSize.height}
                                    itemCount={visibleClients.length}
                                    itemSize={listSize.width < 768 ? 170 : 120} // Slightly taller for mobile
                                    width={listSize.width}
                                >
                                    {({ index, style }) => {
                                        const client = visibleClients[index];
                                        const assetList = assetSerials[client.id] || [];
                                        const hasAssets = assetList.length > 0;

                                        return (
                                            <div style={{ ...style, padding: '6px 8px' }}>
                                                <div className="bg-slate-900 border border-slate-700 hover:border-green-600/50 transition-colors rounded-xl shadow-lg shadow-black/20 p-3 flex flex-col md:flex-row items-start md:items-center justify-between h-full gap-3 text-slate-100 relative overflow-hidden group">

                                                    {/* Info Section */}
                                                    <div className="flex flex-col justify-center min-w-0 flex-1 z-10 w-full">
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            <span className="text-xs font-mono bg-slate-950 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800">
                                                                {client.client_code || '---'}
                                                            </span>
                                                            {hasAssets && <PackagePlus className="text-green-500 h-4 w-4" />}

                                                            {/* Mobile Phone Display */}
                                                            {client.phone && (
                                                                <a href={`tel:${client.phone}`} className="md:hidden text-xs text-blue-400 flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
                                                                    {client.phone}
                                                                </a>
                                                            )}
                                                        </div>

                                                        <div className="font-bold text-base md:text-lg truncate text-white leading-tight mb-1" title={client.business_name || client.name}>
                                                            {client.business_name || client.name || 'Sin Nombre'}
                                                        </div>

                                                        <div className="text-xs text-slate-400 truncate flex items-center gap-2 mb-1">
                                                            <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                                                            <span className="truncate">{client.address || 'Sin dirección'}</span>
                                                        </div>

                                                        {(client.visit_days || client.visit_day) && (
                                                            <div className="text-[10px] md:text-xs text-slate-500 truncate flex items-center gap-2">
                                                                <Calendar className="w-3 h-3 text-blue-500 shrink-0" />
                                                                <span className="text-blue-200 truncate">
                                                                    {(client.visit_days || client.visit_day).split(',').map(d => d.trim()).join(', ')}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Actions Section - Full width on mobile */}
                                                    <div className="flex items-center gap-2 flex-shrink-0 z-10 w-full md:w-auto mt-auto md:mt-0 justify-end border-t border-slate-800/50 pt-2 md:pt-0 md:border-0">
                                                        <div className="text-xs text-slate-500 font-mono hidden md:block mr-2">
                                                            {client.phone ? client.phone : ''}
                                                        </div>

                                                        <Button
                                                            disabled={routeClosed}
                                                            className={`h-9 px-4 shadow-lg font-medium flex-1 md:flex-none ${routeClosed ? 'bg-gray-700 text-gray-400' : 'bg-green-600 hover:bg-green-700 text-white shadow-green-900/20'}`}
                                                            size="sm"
                                                            onClick={() => {
                                                                if (routeClosed) return;
                                                                setSalesClient(client);
                                                            }}
                                                        >
                                                            <DollarSign className="w-4 h-4 mr-1.5" />
                                                            {routeClosed ? 'Cerrado' : 'Ventas'}
                                                        </Button>

                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700">
                                                                    <MoreVertical className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="bg-slate-900 border-slate-700 text-slate-200">
                                                                <DropdownMenuItem onClick={() => setVisitClient(client)} className="focus:bg-slate-800 focus:text-white cursor-pointer py-3">
                                                                    <MapPin className="mr-2 h-4 w-4" /> Registrar Visita
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => setAssetClient(client)} className="focus:bg-slate-800 focus:text-white cursor-pointer py-3">
                                                                    <PackagePlus className="mr-2 h-4 w-4" /> Asignar Activos
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => {
                                                                    setEditClient(client);
                                                                    setEditForm({
                                                                        phone: client.phone || '',
                                                                        address: client.address || '',
                                                                        contact: client.contact || '',
                                                                        visit_days: client.visit_days || client.visit_day || ''
                                                                    });
                                                                }} className="focus:bg-slate-800 focus:text-white cursor-pointer py-3">
                                                                    <Edit className="mr-2 h-4 w-4" /> Editar Datos
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => updateClientGeolocation(client)} className="focus:bg-slate-800 focus:text-white cursor-pointer py-3">
                                                                    <MapPin className="mr-2 h-4 w-4" /> Actualizar GPS
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }}
                                </List>
                            )}
                        </div>
                    )}
                </div>

                {/* Modals & Dialogs */}
                {/* ... keep existing modals ... */}
                <Dialog open={!!visitClient} onOpenChange={(open) => !open && setVisitClient(null)}>
                    <DialogContent className="max-w-lg">
                        <DialogHeader><DialogTitle>Registrar Visita</DialogTitle></DialogHeader>
                        {visitClient && <VisitForm client={visitClient} onSuccess={() => { setVisitClient(null); toast({ title: "Visita registrada" }); }} onCancel={() => setVisitClient(null)} />}
                    </DialogContent>
                </Dialog>

                {salesClient && (
                    <SalesDialog
                        client={salesClient}
                        onClose={() => setSalesClient(null)}
                    />
                )}

                {assetClient && (
                    <AddExistingAssetModal
                        isOpen={!!assetClient}
                        onClose={() => setAssetClient(null)}
                        client={assetClient}
                        onSuccess={handleAssetSuccess}
                    />
                )}

                <Dialog open={!!editClient} onOpenChange={(val) => !val && setEditClient(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Editar Cliente: {editClient?.name}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Teléfono</label>
                                <input className="w-full border p-2 rounded" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Dirección</label>
                                <input className="w-full border p-2 rounded" value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Contacto</label>
                                <input className="w-full border p-2 rounded" value={editForm.contact} onChange={e => setEditForm({ ...editForm, contact: e.target.value })} />
                            </div>

                            {/* Selector de Días de Visita (Multiple) */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium">Días de Visita Preferidos</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'].map(day => {
                                        const currentDays = editForm.visit_days ? editForm.visit_days.split(',').map(d => d.trim()) : [];
                                        const isChecked = currentDays.includes(day);
                                        // const isDisabled = !!editClient?.visit_days; // Restriction removed by user request
                                        const isDisabled = false;

                                        return (
                                            <div key={day} className="flex items-center space-x-2">
                                                <input
                                                    type="checkbox"
                                                    id={`day-${day}`}
                                                    checked={isChecked}
                                                    disabled={isDisabled}
                                                    onChange={(e) => {
                                                        let newDays = [...currentDays];
                                                        if (e.target.checked) {
                                                            newDays.push(day);
                                                        } else {
                                                            newDays = newDays.filter(d => d !== day);
                                                        }
                                                        setEditForm({ ...editForm, visit_days: newDays.join(',') });
                                                    }}
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                                                />
                                                <label
                                                    htmlFor={`day-${day}`}
                                                    className={`text-sm ${isDisabled ? 'text-gray-400' : 'text-gray-700'}`}
                                                >
                                                    {day}
                                                </label>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="pt-4 flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setEditClient(null)}>Cancelar</Button>
                                <Button onClick={handleUpdateClient}>Guardar Cambios</Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>


        </>
    );
}
