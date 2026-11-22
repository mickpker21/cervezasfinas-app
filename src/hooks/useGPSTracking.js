import { useEffect, useRef } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

export function useGPSTracking() {
    const { user } = useSupabaseAuth();
    const watchIdRef = useRef(null);

    useEffect(() => {
        if (!user) return;

        // ✅ FIX: Race-condition guard — if component unmounts before the async
        // startTracking() resolves, we cancel the watch immediately so GPS
        // never runs in the background (prevents battery drain).
        let cancelled = false;
        
        const startTracking = async () => {
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                const fieldRoles = ['autoventa', 'chofer', 'preventa', 'instalador', 'conquista'];
                
                if (!profile || !fieldRoles.includes(profile.role)) {
                    return;
                }

                // If component already unmounted by the time profile loaded, bail out
                if (cancelled) return;

                const permissions = await Geolocation.checkPermissions();
                if (permissions.location !== 'granted') {
                    const request = await Geolocation.requestPermissions();
                    if (request.location !== 'granted') return;
                }

                if (cancelled) return;
                
                const watchHandle = await Geolocation.watchPosition(
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
                    async (position, err) => {
                        if (err || !position) return;

                        try {
                            await supabase.from('user_locations').insert({
                                user_id: user.id,
                                latitude: position.coords.latitude,
                                longitude: position.coords.longitude,
                                accuracy: position.coords.accuracy,
                                speed: position.coords.speed,
                                heading: position.coords.heading,
                                timestamp: new Date(position.timestamp).toISOString()
                            });
                        } catch (dbErr) {
                            // Offline: skip silently
                        }
                    }
                );

                // ✅ If component unmounted while watchPosition was resolving,
                // clear the watch immediately instead of leaving it open.
                if (cancelled) {
                    Geolocation.clearWatch({ id: watchHandle });
                } else {
                    watchIdRef.current = watchHandle;
                }

            } catch (err) {
                // Permissions denied or Geolocation unavailable — fail silently
            }
        };

        startTracking();

        return () => {
            cancelled = true;
            if (watchIdRef.current) {
                Geolocation.clearWatch({ id: watchIdRef.current });
                watchIdRef.current = null;
            }
        };
    }, [user]);
}
