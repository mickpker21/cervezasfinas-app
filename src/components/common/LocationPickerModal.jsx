import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, Navigation, MapPin, Check, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Fix for default marker icon
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const LocationMarker = ({ position, setPosition }) => {
  const map = useMap();
  
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
      map.flyTo(e.latlng, map.getZoom());
    },
  });

  return position === null ? null : (
    <Marker position={position} draggable={true} eventHandlers={{
        dragend: (e) => {
            setPosition(e.target.getLatLng());
        }
    }} />
  );
};

const MapController = ({ center }) => {
    const map = useMap();
    useEffect(() => {
        if (center) {
            map.flyTo([center.lat, center.lng], 16);
        }
    }, [center, map]);
    return null;
};

const LocationPickerModal = ({ open, onClose, onConfirm, initialLocation }) => {
  const [position, setPosition] = useState(initialLocation || null);
  const [searchQuery, setSearchQuery] = useState('');
  const tehuacan = { lat: 18.463, lng: -97.395 };

  const handleCurrentLocation = () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setPosition(next);
    }, (err) => {
      alert("No se pudo obtener la ubicación actual.");
    }, { enableHighAccuracy: true });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] p-0 overflow-hidden bg-slate-950 border-white/10 rounded-[2rem]">
        <div className="flex flex-col h-full relative">
          {/* Header */}
          <div className="absolute top-4 left-4 right-4 z-[1000] flex gap-2">
            <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input 
                    type="text"
                    placeholder="Buscar dirección..."
                    className="w-full bg-slate-900/90 backdrop-blur-md border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500/50"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            // Simple geocoding could be added here if needed
                        }
                    }}
                />
            </div>
            <Button onClick={onClose} variant="ghost" className="bg-slate-900/90 backdrop-blur-md hover:bg-slate-800 rounded-2xl p-3 h-auto border border-white/10">
                <X className="text-white" size={20} />
            </Button>
          </div>

          {/* Map Container */}
          <div className="flex-grow w-full relative">
            <MapContainer 
              center={position || tehuacan} 
              zoom={15} 
              style={{ height: '100%', width: '100%' }}
              className="z-0"
            >
              <TileLayer
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              <LocationMarker position={position} setPosition={setPosition} />
              <MapController center={position} />
            </MapContainer>

            {/* Floating Hint */}
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[1000] bg-black/60 backdrop-blur-sm text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full border border-white/10 pointer-events-none">
                Toca el mapa para fijar el punto o arrastra el marcador
            </div>

            {/* Map Actions */}
            <div className="absolute bottom-6 left-6 right-6 z-[1000] flex justify-between items-center">
                <Button 
                    onClick={handleCurrentLocation}
                    className="bg-white text-slate-900 hover:bg-slate-100 rounded-2xl p-4 h-auto shadow-2xl flex items-center gap-2 font-black text-xs uppercase"
                >
                    <Navigation size={18} fill="currentColor" />
                    Mi Ubicación
                </Button>

                <Button 
                    onClick={() => {
                        if (position) onConfirm(position);
                    }}
                    disabled={!position}
                    className="bg-blue-600 hover:bg-blue-500 text-white rounded-2xl px-8 py-4 h-auto shadow-2xl flex items-center gap-2 font-black text-xs uppercase disabled:opacity-50"
                >
                    <Check size={18} />
                    Confirmar Punto
                </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LocationPickerModal;
