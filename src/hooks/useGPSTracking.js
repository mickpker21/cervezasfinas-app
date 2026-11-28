import { useEffect, useRef } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

const OFFLINE_BREADCRUMBS_KEY = 'cf_offline_gps_breadcrumbs_v1';
const MAX_OFFLINE_BREADCRUMBS = 2500;
const MIN_DISTANCE_METERS = 25; // Registrar punto cada >= 25 metros de movimiento
const MIN_TIME_MOVING_MS = 60 * 1000; // O cada 60s si hubo desplazamiento ligero (>= 8m)
const HEARTBEAT_STATIONARY_MS = 5 * 60 * 1000; // Heartbeat cada 5 min si permanece en el mismo punto

const TRACKED_FIELD_ROLES = new Set([
    'autoventa',
    'chofer',
    'preventa',
    'instalador',
    'installer',
    'conquista',
    'asesor-dinamico',
    'asesor_dinamico',
    'asesor dinamico',
    'asesor',
    'vendedor',
    'supervisor',
    'coortrade',
    'coorcon',
    'control-interno',
    'control interno',
]);

function calcDistanceMeters(lat1, lon1, lat2, lon2) {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function readOfflineBreadcrumbs() {
    try {
        const raw = localStorage.getItem(OFFLINE_BREADCRUMBS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeOfflineBreadcrumbs(list) {
    try {
        const trimmed = list.slice(-MAX_OFFLINE_BREADCRUMBS);
        localStorage.setItem(OFFLINE_BREADCRUMBS_KEY, JSON.stringify(trimmed));
    } catch {
        // ignore storage quota errors
    }
}

function enqueueOfflineBreadcrumb(point) {
    const list = readOfflineBreadcrumbs();
    list.push(point);
    writeOfflineBreadcrumbs(list);
}

let isFlushingQueue = false;
export async function flushOfflineGPSBreadcrumbs() {
    if (isFlushingQueue) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const queue = readOfflineBreadcrumbs();
    if (!queue.length) return;

    isFlushingQueue = true;
    try {
        const BATCH_SIZE = 100;
        let remaining = [...queue];

        while (remaining.length > 0) {
            const batch = remaining.slice(0, BATCH_SIZE);
            const { error } = await supabase.from('user_locations').insert(batch);
            if (error) {
                break;
            }
            remaining = remaining.slice(BATCH_SIZE);
            writeOfflineBreadcrumbs(remaining);
        }
    } catch {
        // retry on next online tick
    } finally {
        isFlushingQueue = false;
    }
}

export function useGPSTracking() {
    const { user } = useSupabaseAuth();
    const watchIdRef = useRef(null);
    const lastRecordedRef = useRef({ lat: null, lng: null, timestamp: 0 });

    useEffect(() => {
        if (!user?.id) return;

        let cancelled = false;

        const recordPosition = async (coords, rawTimestamp) => {
            if (!coords) return;
            const lat = Number(coords.latitude);
            const lng = Number(coords.longitude);
            const accuracy = Number(coords.accuracy || 0);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return;
            // Descartar rebotes extremos de antena (> 800m de imprecisión) si ya tenemos un punto previo
            if (accuracy > 800 && lastRecordedRef.current.lat !== null) return;

            const nowMs = Date.now();
            const prev = lastRecordedRef.current;

            if (prev.lat !== null && prev.lng !== null) {
                const dist = calcDistanceMeters(prev.lat, prev.lng, lat, lng);
                const elapsed = nowMs - prev.timestamp;

                const movedEnough = dist >= MIN_DISTANCE_METERS;
                const movedSlightlyAfterMinute = elapsed >= MIN_TIME_MOVING_MS && dist >= 8;
                const isHeartbeat = elapsed >= HEARTBEAT_STATIONARY_MS;

                if (!movedEnough && !movedSlightlyAfterMinute && !isHeartbeat) {
                    return;
                }
            }

            lastRecordedRef.current = { lat, lng, timestamp: nowMs };

            const pointPayload = {
                user_id: user.id,
                latitude: lat,
                longitude: lng,
                accuracy: Number.isFinite(accuracy) ? accuracy : null,
                speed: Number.isFinite(Number(coords.speed)) ? Number(coords.speed) : null,
                heading: Number.isFinite(Number(coords.heading)) ? Number(coords.heading) : null,
                timestamp: new Date(rawTimestamp || nowMs).toISOString(),
            };

            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                enqueueOfflineBreadcrumb(pointPayload);
                return;
            }

            try {
                const { error } = await supabase.from('user_locations').insert(pointPayload);
                if (error) {
                    enqueueOfflineBreadcrumb(pointPayload);
                } else {
                    flushOfflineGPSBreadcrumbs();
                }
            } catch {
                enqueueOfflineBreadcrumb(pointPayload);
            }
        };

        const resolveRoleOfflineSafe = async () => {
            const directRole =
                user?.profile?.role ||
                user?.user_metadata?.type ||
                user?.user_metadata?.role ||
                null;
            if (directRole) return String(directRole).toLowerCase().trim();

            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                return null;
            }
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();
                return profile?.role ? String(profile.role).toLowerCase().trim() : null;
            } catch {
                return null;
            }
        };

        const startTracking = async () => {
            try {
                const role = await resolveRoleOfflineSafe();
                if (!role || !TRACKED_FIELD_ROLES.has(role)) {
                    return;
                }
                if (cancelled) return;

                flushOfflineGPSBreadcrumbs();

                try {
                    const permissions = await Geolocation.checkPermissions();
                    if (permissions.location !== 'granted') {
                        const request = await Geolocation.requestPermissions();
                        if (request.location !== 'granted') return;
                    }
                } catch {
                    // En web o si Capacitor falla, continuamos con watchPosition
                }

                if (cancelled) return;

                const watchHandle = await Geolocation.watchPosition(
                    { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 },
                    (position, err) => {
                        if (err || !position?.coords) return;
                        recordPosition(position.coords, position.timestamp);
                    }
                );

                if (cancelled) {
                    Geolocation.clearWatch({ id: watchHandle });
                } else {
                    watchIdRef.current = watchHandle;
                }
            } catch {
                // Fail silently if permissions denied
            }
        };

        startTracking();

        const handleOnline = () => {
            flushOfflineGPSBreadcrumbs();
        };
        window.addEventListener('online', handleOnline);

        return () => {
            cancelled = true;
            window.removeEventListener('online', handleOnline);
            if (watchIdRef.current) {
                Geolocation.clearWatch({ id: watchIdRef.current }).catch(() => {});
                watchIdRef.current = null;
            }
        };
    }, [user]);
}
