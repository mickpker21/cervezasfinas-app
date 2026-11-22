// src/components/common/InteractiveMap.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  CircleMarker,
  Tooltip,
  useMap,
  Pane,
  Polyline
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./InteractiveMapPremium.css";
import { Maximize2, Minimize2, Crosshair, Users, X, ArrowRight, ArrowLeft, ArrowUpRight, ArrowUpLeft, ArrowUp, Flag, MapPin, Navigation, ExternalLink, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import VisitForm from "@/components/VisitForm";
import ClientVisitsList from "@/components/ClientVisitsList";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { useToast } from "@/components/ui/use-toast";
import { kvStorage } from "@/services/kvStorage";
import { Capacitor } from "@capacitor/core";
import { useMapGeolocation } from "@/hooks/useMapGeolocation";
import { useMapFilters } from "@/hooks/useMapFilters";
import { MapToolbar } from "@/components/map/MapToolbar";
import { ClientDetailsPremium } from "@/components/map/ClientDetailsPremium";
import { NearbyClientsList } from "@/components/map/NearbyClientsList";
import { useMapRouting } from "@/hooks/useMapRouting";
import { 
  getDotIcon, 
  normalizeCoords, 
  isFlagged, 
  toSet, 
  createClusterCustomIcon,
  humanMeters
} from "@/components/map/mapUtils";

// Iconos locales Leaflet
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function MapReady({ onMap }) {
  const map = useMap();
  useEffect(() => {
    if (map && onMap) onMap(map);
  }, [map, onMap]);
  return null;
}

// Helper function removed since instructions are no longer rendered

const InteractiveMap = React.memo(function InteractiveMap({
  items = [],
  center,
  zoom = 13,
  height = "32rem",
  className = "",
  allowManualPick = true,
  flaggedClientCodes,
  flaggedClientIds,
  showFilters = true,
}) {
  const [map, setMap] = useState(null);
  const [secureCtx, setSecureCtx] = useState(true);
  const [pickManual, setPickManual] = useState(false);
  const centeredOnceRef = useRef(false);
  const manualClickHandler = useRef(null);
  const prevPos = useRef(null);
  const containerRef = useRef(null);
  const [isNativeFs, setIsNativeFs] = useState(false);
  const [isPseudoFs, setIsPseudoFs] = useState(false);
  const isAnyFs = isNativeFs || isPseudoFs;
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  const [detailClient, setDetailClient] = useState(null);
  const [showVisitFormFor, setShowVisitFormFor] = useState(null);
  const [radius, setRadius] = useState(1500);
  const [showNearby, setShowNearby] = useState(false);

  const tehuacan = [18.463, -97.395];

  const flaggedCodesSet = useMemo(() => toSet(flaggedClientCodes), [flaggedClientCodes]);
  const flaggedIdsSet = useMemo(() => toSet(flaggedClientIds), [flaggedClientIds]);

  useEffect(() => {
    try {
      setSecureCtx(window.isSecureContext !== false);
    } catch (e) {
      setSecureCtx(true);
    }
  }, []);

  const validItems = useMemo(
    () =>
      (items || [])
        .map((it) => {
          const c = normalizeCoords(it?.coords, it);
          return c ? { ...it, coords: c } : null;
        })
        .filter(Boolean),
    [items]
  );

  // --- HOOKS ---
  const {
    userPos,
    setUserPos,
    followMe,
    setFollowMe,
    geoMsg,
    lastUpdate,
    getAndCenter
  } = useMapGeolocation(map, secureCtx);

  const {
    filteredItems,
    searchInput,
    setSearchInput,
    routeFilter,
    setRouteFilter,
    exFilters,
    setExFilters,
    routeOptions
  } = useMapFilters(validItems);

  // --- ROUTING HOOK ---
  const { routeCoords, routeSummary, isRouting, calculateRoute, clearRoute } = useMapRouting();

  const handleNavigateToClient = async (client) => {
    if (!userPos) {
      toast({
        title: "Ubicación Requerida",
        description: "Necesitamos tu ubicación actual para trazar la ruta.",
        variant: "destructive",
      });
      getAndCenter();
      return;
    }
    const clientCoords = normalizeCoords(client?.coords, client);
    if (!clientCoords) {
      toast({
        title: "Error",
        description: "Este cliente no tiene coordenadas válidas.",
        variant: "destructive"
      });
      return;
    }
    
    await calculateRoute(userPos, clientCoords);
    setDetailClient(null); // Close modal to show the map
    
    // Zoom to show both user and client
    if (map) {
      const bounds = L.latLngBounds([
        [userPos.lat, userPos.lng],
        [clientCoords.lat, clientCoords.lng]
      ]);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  };

  useEffect(() => {
    if (!map || centeredOnceRef.current) return;
    try {
      if (userPos) {
        map.setView([userPos.lat, userPos.lng], Math.max(map.getZoom() || zoom, 15));
      } else if (validItems.length) {
        const b = L.latLngBounds(
          validItems.map((v) => [v.coords.lat, v.coords.lng])
        );
        map.fitBounds(b, { padding: [28, 28] });
      } else {
        map.setView(center || tehuacan, zoom);
      }
      centeredOnceRef.current = true;
    } catch (e) { }
  }, [map, userPos, validItems, center, zoom]);

  useEffect(() => {
    if (!map) return;
    const stop = () => setFollowMe(false);
    map.on("dragstart", stop);
    map.on("zoomstart", stop);
    return () => {
      map.off("dragstart", stop);
      map.off("zoomstart", stop);
    };
  }, [map, setFollowMe]);

  useEffect(() => {
    if (!map || !userPos || !followMe) return;
    try {
      const a = prevPos.current ? L.latLng(prevPos.current) : null;
      const b = L.latLng(userPos);
      if (!a || a.distanceTo(b) > 10) {
        map.flyTo([userPos.lat, userPos.lng], Math.max(map.getZoom() || 13, 16), {
          duration: 0.45,
        });
        prevPos.current = userPos;
      }
    } catch (e) { }
  }, [userPos, map, followMe]);

  // Memoized Markers for Performance
  const renderedMarkers = useMemo(() => {
    return filteredItems.map((item) => {
      const isFl = isFlagged(item, flaggedCodesSet, flaggedIdsSet);
      return (
        <Marker
          key={item.id}
          position={[item.coords.lat, item.coords.lng]}
          icon={getDotIcon(item.exclusivity || item.exclusividad, item.sales_route ?? item.route, isFl, item.color)}
          zIndexOffset={1000}
          eventHandlers={{
            click: () => setDetailClient(item),
          }}
        />
      );
    });
  }, [filteredItems, flaggedCodesSet, flaggedIdsSet]);

  useEffect(() => {
    const onFsChange = () => {
      const fs = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      );
      setIsNativeFs(fs);
      setTimeout(() => {
        try {
          map && map.invalidateSize();
        } catch (e) { }
      }, 150);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    document.addEventListener("MSFullscreenChange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
      document.removeEventListener("MSFullscreenChange", onFsChange);
    };
  }, [map]);

  useEffect(() => {
    if (isPseudoFs) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isPseudoFs]);

  const canUseNativeFs = (() => {
    if (typeof document === "undefined") return false;
    return !!(
      document.fullscreenEnabled ||
      document.webkitFullscreenEnabled ||
      document.msFullscreenEnabled
    );
  })();

  const enterFs = () => {
    const el = containerRef.current;
    if (!el) return;
    if (
      canUseNativeFs &&
      (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen)
    ) {
      try {
        if (el.requestFullscreen) {
          const p = el.requestFullscreen();
          if (p && typeof p.catch === "function") {
            p.catch(() => setIsPseudoFs(true));
          }
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        } else if (el.msRequestFullscreen) {
          el.msRequestFullscreen();
        }
        return;
      } catch (e) { }
    }
    setIsPseudoFs(true);
    setTimeout(() => {
      try {
        map && map.invalidateSize();
      } catch (e) { }
    }, 150);
  };

  const exitFs = () => {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
    setIsPseudoFs(false);
    setTimeout(() => {
      try {
        map && map.invalidateSize();
      } catch (e) { }
    }, 150);
  };

  const toggleFs = () => (isAnyFs ? exitFs() : enterFs());

  const fullscreenElement =
    typeof document !== "undefined"
      ? document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement ||
      (isPseudoFs ? containerRef.current : null)
      : null;

  const makeClientHref = (c) => {
    const role = user?.user_metadata?.role;
    if (role === 'admin') return `/admin/clients/${c.id}`;
    if (role === 'supervisor') return `/supervisor/clients/${c.id}`;
    return '#';
  };

  const tryRegisterVisitFromMap = (client) => {
    if (!client) return;
    const clientCoords = normalizeCoords(client?.coords, client);
    if (!clientCoords) {
      toast({
        title: "Error",
        description: "El cliente no tiene coordenadas válidas.",
        variant: "destructive",
      });
      return;
    }
    if (!userPos) {
      toast({
        title: "Obteniendo ubicación",
        description: "Intentando obtener tu posición para validar distancia.",
      });
      getAndCenter();
      return;
    }
    try {
      const here = L.latLng(userPos.lat, userPos.lng);
      const there = L.latLng(clientCoords.lat, clientCoords.lng);
      const dist = here.distanceTo(there);
      if (dist <= 500) {
        setShowVisitFormFor(client);
      } else {
        toast({
          title: "Fuera de rango",
          description: `Estás a ${Math.round(
            dist
          )} m. Debes estar dentro de 500 m para registrar la visita.`,
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Error comprobando distancia para visita:", err);
      toast({ title: "Error", description: "No se pudo validar la distancia.", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (!map) return;
    if (!pickManual) {
      if (manualClickHandler.current) {
        map.off("click", manualClickHandler.current);
        manualClickHandler.current = null;
      }
      map.getContainer().style.cursor = "";
      return;
    }
    map.getContainer().style.cursor = "crosshair";
    const handler = (e) => {
      const { lat, lng } = e.latlng || {};
      if (typeof lat === "number" && typeof lng === "number") {
        const next = { lat, lng };
        setUserPos(next);
        try {
          kvStorage.setItem(LAST_POS_KEY, next);
        } catch (e) { }
        map.setView([lat, lng], Math.max(map.getZoom() || 13, 16), { animate: true });
        map.panTo([lat, lng], { animate: true });
        setPickManual(false);
      }
    };
    manualClickHandler.current = handler;
    map.once("click", handler);
    return () => {
      if (manualClickHandler.current) {
        map.off("click", manualClickHandler.current);
        manualClickHandler.current = null;
      }
      map.getContainer().style.cursor = "";
    };
  }, [map, pickManual, setUserPos]);

  const fitAllClients = () => {
    if (!map) return;
    const list = filteredItems.length ? filteredItems : validItems;
    if (!list.length) return;
    if (list.length === 1) {
      const only = list[0];
      map.setView([only.coords.lat, only.coords.lng], Math.max(map.getZoom() || 13, 16), {
        animate: true,
      });
      return;
    }
    const b = L.latLngBounds(list.map((v) => [v.coords.lat, v.coords.lng]));
    if (map.flyToBounds) {
      map.flyToBounds(b, { padding: [28, 28], maxZoom: 17 });
    } else {
      map.fitBounds(b, { padding: [28, 28] });
    }
    setTimeout(() => {
      try {
        map.invalidateSize();
      } catch (e) { }
    }, 120);
  };

  const containerStyle = isPseudoFs
    ? { position: "fixed", inset: 0, height: "100dvh", width: "100vw", zIndex: 9999 }
    : { height: isNativeFs ? "100dvh" : height, width: "100%" };

  return (
    <div className={cn("w-full h-full", className)} style={{ height }}>
      {showFilters && (
        <MapToolbar
          allowManualPick={allowManualPick}
          setPickManual={setPickManual}
          geoMsg={geoMsg}
          secureCtx={secureCtx}
          radius={radius}
          setRadius={setRadius}
          filters={exFilters}
          setFilters={setExFilters}
          routeFilter={routeFilter}
          setRouteFilter={setRouteFilter}
          routeOptions={routeOptions}
          followMe={followMe}
          setFollowMe={setFollowMe}
          lastUpdate={lastUpdate}
          getAndCenter={getAndCenter}
          fitAllClients={fitAllClients}
          userPos={userPos}
          totalNearby={filteredItems.length}
          totalFiltered={validItems.length}
          mapSearch={searchInput}
          setMapSearch={setSearchInput}
        />
      )}

      <div
        ref={containerRef}
        className="relative w-full rounded-xl overflow-hidden"
        style={containerStyle}
      >
        {/* Botón flotante: Pantalla completa */}
        <div className="absolute z-[2000] left-3 bottom-12 flex flex-col items-start gap-2">
          {/* Centrar en todos los clientes */}
          <button
            type="button"
            onClick={fitAllClients}
            className="w-11 h-11 rounded-full bg-white text-emerald-600 shadow-xl border border-emerald-100 flex items-center justify-center hover:bg-emerald-50 active:scale-[0.95] transition-all"
            title="Centrar en todos los clientes"
            aria-label="Centrar mapa"
          >
            <Crosshair className="w-5 h-5" />
          </button>

          {/* Limpiar Ruta (Only visible if route active) */}
          {routeCoords && (
            <button
              type="button"
              onClick={clearRoute}
              className="w-11 h-11 rounded-full bg-red-500 text-white shadow-xl border border-red-600 flex items-center justify-center hover:bg-red-600 active:scale-[0.95] transition-all animate-in zoom-in"
              title="Cancelar Navegación"
              aria-label="Limpiar Ruta"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {/* Pantalla completa */}
          <button
            type="button"
            onClick={toggleFs}
            className="w-11 h-11 rounded-full bg-white text-gray-700 shadow-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 active:scale-[0.95] transition-all"
            title={isAnyFs ? "Salir de pantalla completa" : "Pantalla completa"}
            aria-label="Pantalla completa"
          >
            {isAnyFs ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>

        {/* Banner selección manual */}
        {pickManual &&
          (fullscreenElement
            ? createPortal(
              <div className="fixed left-1/2 -translate-x-1/2 top-4 z-[100001] bg-black/80 text-white text-xs px-3 py-2 rounded shadow text-center">
                Da click en el mapa para fijar tu ubicación (Esc para cancelar)
              </div>,
              fullscreenElement
            )
            : (
              <div className="absolute left-1/2 -translate-x-1/2 top-4 z-[2100] bg-black/80 text-white text-xs px-3 py-2 rounded shadow text-center">
                Da click en el mapa para fijar tu ubicación (Esc para cancelar)
              </div>
            ))}

        <MapContainer
          center={center || tehuacan}
          zoom={zoom}
          scrollWheelZoom
          preferCanvas={true}
          className="z-0"
          style={{ height: "100%", width: "100%" }}
        >
          <MapReady onMap={setMap} />

          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MarkerClusterGroup 
            chunkedLoading 
            iconCreateFunction={createClusterCustomIcon}
            spiderfyOnMaxZoom={true}
            showCoverageOnHover={false}
            maxClusterRadius={50}
            polygonOptions={{ weight: 1, color: '#3b82f6', fillOpacity: 0.1 }}
          >
            {renderedMarkers}
          </MarkerClusterGroup>

          {/* Mi ubicación + círculo de búsqueda */}
          {userPos && (
            <Pane name="user-pos" style={{ zIndex: 1200, pointerEvents: 'none' }}>
              {userPos.accuracy && (
                <Circle
                  center={[userPos.lat, userPos.lng]}
                  radius={Math.min(userPos.accuracy, 120)}
                  pathOptions={{ color: "#60a5fa", weight: 1, fillColor: "#60a5fa", fillOpacity: 0.15 }}
                />
              )}
              <CircleMarker
                center={[userPos.lat, userPos.lng]}
                radius={8}
                pathOptions={{ color: "#111827", weight: 2, fillColor: "#111827", fillOpacity: 0.95 }}
              >
                <Tooltip direction="top" offset={[0, -12]} permanent>
                  Tú
                </Tooltip>
              </CircleMarker>
              <Circle
                center={[userPos.lat, userPos.lng]}
                radius={radius}
                pathOptions={{ color: "#10b981", weight: 1.5, dashArray: "4 4", fillOpacity: 0 }}
              />
            </Pane>
          )}

          {/* Real Street Route Polyline */}
          {routeCoords && (
            <Pane name="routing-pane" style={{ zIndex: 500, pointerEvents: 'none' }}>
              {/* Outer stroke for outline effect */}
              <Polyline 
                positions={routeCoords} 
                pathOptions={{ color: "#1e3a8a", weight: 8, opacity: 0.5, lineCap: "round", lineJoin: "round" }} 
              />
              {/* Inner stroke for Waze-like neon style */}
              <Polyline 
                positions={routeCoords} 
                pathOptions={{ color: "#3b82f6", weight: 5, opacity: 0.9, lineCap: "round", lineJoin: "round", dashArray: "1 10" }} 
              />
            </Pane>
          )}
        </MapContainer>
        {/* Nearby List Toggle & Panel */}
        <div className="absolute z-[2000] right-3 top-20 bottom-3 flex flex-col items-end gap-2 pointer-events-none">
           <button
             type="button"
             onClick={() => setShowNearby(!showNearby)}
             className="pointer-events-auto w-11 h-11 rounded-full bg-slate-900 text-emerald-400 shadow-2xl border border-white/10 flex items-center justify-center hover:bg-slate-800 active:scale-[0.95] transition-all shrink-0"
             title={showNearby ? "Ocultar lista" : "Mostrar lista de cercanos"}
           >
             <Users className="w-5 h-5" />
           </button>

           {showNearby && (
             <div className="pointer-events-auto w-80 flex-1 min-h-0 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-right duration-300">
               <NearbyClientsList 
                  clients={filteredItems}
                  userPos={userPos}
                  onSelectClient={(c) => {
                    setDetailClient(c);
                    if (map) map.flyTo([c.coords.lat, c.coords.lng], 17);
                  }}
                  humanMeters={humanMeters}
               />
             </div>
           )}
        </div>

        <Dialog
          open={!!detailClient}
          onOpenChange={(open) => {
            if (!open) {
              setDetailClient(null);
              setShowVisitFormFor(null);
            }
          }}
        >
          <DialogContent className="p-0 border-none bg-transparent shadow-none max-w-md w-[95vw]">
            {detailClient && !showVisitFormFor && (
              <ClientDetailsPremium
                client={detailClient}
                onClose={() => setDetailClient(null)}
                onRegisterVisit={tryRegisterVisitFromMap}
                isFlagged={isFlagged(detailClient, flaggedCodesSet, flaggedIdsSet)}
                visitList={ClientVisitsList}
                onNavigate={handleNavigateToClient}
                isRouting={isRouting}
                onEdit={((user && (user.user_metadata?.role === "admin" || user.user_metadata?.role === "supervisor")) || false) 
                  ? (c) => { window.location.href = makeClientHref(c); } 
                  : null
                }
              />
            )}
            {detailClient && showVisitFormFor && (
              <div className="p-6 bg-slate-900 border border-white/10 rounded-3xl text-white">
                <DialogHeader className="mb-4">
                  <DialogTitle className="text-white uppercase font-black">Registrar Visita</DialogTitle>
                </DialogHeader>
                <VisitForm
                  client={detailClient}
                  onSave={() => {
                    setShowVisitFormFor(null);
                    setDetailClient(null);
                  }}
                />
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* --- PANEL DE INSTRUCCIONES SIMPLIFICADO --- */}
        {routeSummary && routeCoords && (
          <div className="absolute z-[2000] bottom-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-[450px] bg-slate-900 border border-slate-700 shadow-2xl rounded-3xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 duration-500">
            {/* Header: Resumen de ruta */}
            <div className="p-4 bg-gradient-to-r from-blue-900/50 to-indigo-900/50 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-400" />
                  {Math.ceil(routeSummary.duration / 60)} min
                </h3>
                <p className="text-sm text-slate-300 font-medium">
                  {(routeSummary.distance / 1000).toFixed(1)} km
                </p>
              </div>
              <div className="flex gap-2">
                <a 
                  href={`https://waze.com/ul?ll=${routeCoords[routeCoords.length-1][0]},${routeCoords[routeCoords.length-1][1]}&navigate=yes`}
                  target="_blank" rel="noreferrer"
                  className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center hover:bg-blue-400 transition-colors shadow-lg"
                  title="Abrir en Waze"
                >
                  <Navigation className="w-5 h-5" />
                </a>
                <a 
                  href={`https://www.google.com/maps/dir/?api=1&destination=${routeCoords[routeCoords.length-1][0]},${routeCoords[routeCoords.length-1][1]}&travelmode=driving`}
                  target="_blank" rel="noreferrer"
                  className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-500 transition-colors shadow-lg"
                  title="Abrir en Google Maps"
                >
                  <MapPin className="w-5 h-5" />
                </a>
                <button 
                  onClick={clearRoute}
                  className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white flex items-center justify-center transition-colors ml-2"
                  title="Cerrar Ruta"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
});

export default InteractiveMap;
