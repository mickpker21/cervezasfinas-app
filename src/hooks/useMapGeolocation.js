import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { kvStorage } from '@/services/kvStorage';

const LAST_POS_KEY = "cmp:lastUserPos";

export function useMapGeolocation(map, secureCtx) {
  const [userPos, setUserPos] = useState(null); // {lat, lng, accuracy}
  const [permStatus, setPermStatus] = useState("");
  const [followMe, setFollowMe] = useState(true);
  const [geoMsg, setGeoMsg] = useState("");
  const [lastUpdate, setLastUpdate] = useState(null);
  
  const watchIdRef = useRef(null);
  const prevPos = useRef(null);

  // 1. Initial Position Load from Storage
  useEffect(() => {
    const loadPos = async () => {
      try {
        const cached = await kvStorage.getItem(LAST_POS_KEY);
        if (cached?.lat && cached?.lng) setUserPos(cached);
      } catch (e) {}
    };
    loadPos();
  }, []);

  // 2. Permissions Monitoring
  useEffect(() => {
    let p;
    try {
      if (navigator.permissions?.query) {
        navigator.permissions
          .query({ name: "geolocation" })
          .then((res) => {
            p = res;
            setPermStatus(res.state || "");
            res.onchange = () => setPermStatus(res.state || "");
          })
          .catch(() => {});
      }
    } catch (e) {}
    return () => {
      if (p) p.onchange = null;
    };
  }, []);

  // 3. Auto-follow Logic
  useEffect(() => {
    if (!map || !userPos || !followMe) return;
    try {
      const a = prevPos.current ? window.L.latLng(prevPos.current) : null;
      const b = window.L.latLng(userPos);
      if (!a || a.distanceTo(b) > 10) {
        map.flyTo([userPos.lat, userPos.lng], Math.max(map.getZoom() || 13, 16), {
          duration: 0.45,
        });
        prevPos.current = userPos;
      }
    } catch (e) {}
  }, [userPos, map, followMe]);

  // 4. Manual centering and Watch Start
  const getAndCenter = useCallback(async () => {
    setGeoMsg("");
    setFollowMe(true);
    if (!map) return;

    if (!secureCtx) {
      setGeoMsg("El sitio no es seguro (HTTPS/localhost requerido). Usa 'Elegir' para marcar manualmente.");
      return;
    }

    const centerNow = (p) => {
      setUserPos(p);
      setLastUpdate(new Date().toLocaleTimeString());
      try { kvStorage.setItem(LAST_POS_KEY, p); } catch (e) {}
      if (map) {
        map.setView([p.lat, p.lng], Math.max(map.getZoom() || 13, 16), { animate: true });
      }
    };

    const runNativeGeo = async () => {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000
        });
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        centerNow(next);

        if (watchIdRef.current) await Geolocation.clearWatch({ id: watchIdRef.current });
        
        watchIdRef.current = await Geolocation.watchPosition({
          enableHighAccuracy: true,
          timeout: 10000
        }, (p) => {
          if (p) {
            setUserPos({
              lat: p.coords.latitude,
              lng: p.coords.longitude,
              accuracy: p.coords.accuracy,
            });
          }
        });
      } catch (e) {
        console.error("Native Geo Error:", e);
        runWebGeo();
      }
    };

    const runWebGeo = () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          centerNow({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        (err) => {
          setGeoMsg("No se pudo obtener ubicación. Verifica el GPS.");
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    };

    if (Capacitor.isNativePlatform()) {
      await runNativeGeo();
    } else {
      runWebGeo();
    }
  }, [map, secureCtx]);

  // 5. Cleanup
  useEffect(() => {
    return () => {
      if (watchIdRef.current) {
        if (Capacitor.isNativePlatform()) {
          import('@capacitor/geolocation').then(geo => {
            geo.Geolocation.clearWatch({ id: watchIdRef.current });
          });
        } else {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
      }
    };
  }, []);

  return {
    userPos,
    setUserPos,
    permStatus,
    followMe,
    setFollowMe,
    geoMsg,
    setGeoMsg,
    lastUpdate,
    getAndCenter
  };
}
