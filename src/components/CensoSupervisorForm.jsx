import React, { useState, useRef, useEffect } from 'react';
import { Camera, QrCode, CheckCircle2, AlertTriangle, MapPin, Loader2, X, HelpCircle, Plus } from 'lucide-react';
import { getCurrentPositionSafe } from '@/lib/geolocation';
import { createCenso } from '@/repositories/censosRepository';
import { updateClient } from '@/repositories/clientsRepository';
import { useToast } from '@/components/ui/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import SmartBarcodeScanner from '@/components/SmartBarcodeScanner';

const COOLER_MODELS = ['CCV144', 'CCV192', 'CCV320', 'CCV376', 'CCV500', 'CCV900', 'CCV1350', 'Z11', 'BAJOBARRA'];
const POSITIONS = ['PP', 'PPA', 'OTRA POSICION'];

import { createOrder as createInstallationOrder, getAssets } from '@/repositories/ordersRepository';

const MAX_DISTANCE_M = 100; // meters

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function PhotoCapture({ label, value, onChange }) {
  const fileRef = useRef();
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-slate-300 uppercase tracking-wide">{label}</label>
      <div
        onClick={() => fileRef.current?.click()}
        className={cn(
          'relative cursor-pointer rounded-xl border-2 border-dashed transition-all h-36 flex flex-col items-center justify-center gap-2 overflow-hidden',
          value ? 'border-emerald-500/40' : 'border-slate-700 hover:border-slate-500'
        )}
      >
        {value ? (
          <>
            <img src={value} alt="foto" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              <Camera className="w-8 h-8 text-white" />
            </div>
          </>
        ) : (
          <>
            <Camera className="w-8 h-8 text-slate-500" />
            <span className="text-xs text-slate-500">Toca para tomar foto</span>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async e => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => onChange(ev.target.result);
            reader.readAsDataURL(file);
          }}
        />
      </div>
    </div>
  );
}

function ToggleSwitch({ value, onChange, label, activeColor = 'bg-emerald-500' }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate-300">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          'relative w-12 h-6 rounded-full transition-colors duration-300 flex-shrink-0',
          value ? activeColor : 'bg-slate-700'
        )}
      >
        <span className={cn(
          'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300',
          value ? 'left-6' : 'left-0.5'
        )} />
      </button>
    </div>
  );
}

/**
 * CensoSupervisorForm
 * Props:
 *  - client: client object { id, client_code, name, business_name, lat, lng }
 *  - user: auth user
 *  - onClose: () => void
 *  - onSaved: () => void
 */
export default function CensoSupervisorForm({ client, user, onClose, onSaved }) {
  const { toast } = useToast();

  // Geolocation state
  const [geoStatus, setGeoStatus] = useState('idle'); // idle | checking | ok | too_far | no_coords
  const [userPos, setUserPos] = useState(null);
  const [distanceM, setDistanceM] = useState(null);

  // Form state
  // Facade (New)
  const [tieneFachada, setTieneFachada] = useState(false);
  const [tipoFachada, setTipoFachada] = useState('');
  const [photoFachadaUrl, setPhotoFachadaUrl] = useState('');
  
  // Cooler
  const [tieneEnfriador, setTieneEnfriador] = useState(false);
  const [modelo, setModelo] = useState('');
  const [serial, setSerial] = useState('');
  const [posicion, setPosicion] = useState('');
  const [invadido, setInvadido] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  // Existing assets validation
  const [existingAssets, setExistingAssets] = useState([]);
  const [validatedAssets, setValidatedAssets] = useState({}); // { serial: boolean }
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [isAddingManual, setIsAddingManual] = useState(false);

  // Check geolocation and fetch assets on mount
  useEffect(() => {
    checkGeo();
    fetchExistingAssets();
  }, [client.id]);

  const fetchExistingAssets = async () => {
    setIsLoadingAssets(true);
    try {
      const assets = await getAssets({ client_id: client.id });
      setExistingAssets(assets || []);
      // Initialize validated state
      const initialValidated = {};
      (assets || []).forEach(a => {
        initialValidated[a.serial] = false;
      });
      setValidatedAssets(initialValidated);
    } catch (err) {
      console.error('[CensoForm] Error fetching client assets:', err);
    } finally {
      setIsLoadingAssets(false);
    }
  };

  const checkGeo = async () => {
    setGeoStatus('checking');
    try {
      // Use maximumAge:Infinity so Chrome reuses any cached position immediately
      const pos = await getCurrentPositionSafe({ maximumAge: Infinity, timeout: 8000, enableHighAccuracy: false });
      // Normalize: Web API returns pos.coords.latitude, Capacitor returns pos.coords.latitude too
      const lat = pos?.lat ?? pos?.coords?.latitude;
      const lng = pos?.lng ?? pos?.coords?.longitude;
      if (!lat) { setGeoStatus('ok'); return; } // No coords but permission ok — allow
      setUserPos({ lat, lng });

      // Parse client coordinates safely
      let clientLat = client.lat;
      let clientLng = client.lng;

      if (!clientLat || !clientLng) {
        try {
          // If coords is a JSON string or object
          const coords = typeof client.coords === 'string' ? JSON.parse(client.coords) : client.coords;
          clientLat = coords?.lat ?? coords?.[0];
          clientLng = coords?.lng ?? coords?.[1];
        } catch (e) {
          // Fallback if it's a simple comma-separated string "lat,lng"
          const parts = String(client.coords || '').split(',');
          clientLat = parseFloat(parts[0]);
          clientLng = parseFloat(parts[1]);
        }
      }

      if (!clientLat || !clientLng) {
        setGeoStatus('no_client_geo');
        return;
      }

      const dist = haversineDistance(lat, lng, clientLat, clientLng);
      setDistanceM(Math.round(dist));
      setGeoStatus(dist <= MAX_DISTANCE_M ? 'ok' : 'too_far');
    } catch (e) {
      console.warn('[CensoForm] Geo error:', e?.message ?? e);
      // Only block on explicit permission denial; treat timeout/unavailable as allowed
      if (e?.message === 'PERMISSION_DENIED') {
        setGeoStatus('no_coords');
      } else {
        // GPS timeout or unavailable — allow form with unverified coordinates
        setGeoStatus('ok');
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();

    // -- VALIDATION --
    const errors = [];
    if (tieneFachada) {
      if (!tipoFachada) errors.push('Tipo de Fachada');
      if (!photoFachadaUrl) errors.push('Foto de la Fachada');
    }
    if (tieneEnfriador) {
      // If we are adding manual, check fields
      if (isAddingManual || existingAssets.length === 0) {
        if (!modelo) errors.push('Modelo del Enfriador');
        if (!serial) errors.push('Número de Serie');
        if (!posicion) errors.push('Posición del Enfriador');
        if (!photoUrl) errors.push('Foto del Enfriador');

        // Check for duplicate with existing
        if (serial && existingAssets.some(a => a.serial === serial.trim())) {
            toast({
                title: 'Activo Duplicado',
                description: `El número de serie ${serial} ya está registrado para este cliente. Por favor, valídalo en la sección de arriba.`,
                variant: 'destructive'
            });
            return;
        }
      } else {
        // If not adding manual, at least one must be validated
        const someValidated = Object.values(validatedAssets).some(v => v === true);
        if (!someValidated) {
            errors.push('Debes validar al menos un activo o agregar uno nuevo');
        }
      }
    }
    if (!notas || notas.trim().length === 0) {
      errors.push('Notas adicionales');
    }

    if (errors.length > 0) {
      toast({
        title: 'Campos requeridos',
        description: `Por favor completa: ${errors.join(', ')}`,
        variant: 'destructive'
      });
      return;
    }

    setSaving(true);
    try {
      await createCenso({
        client_id:       client.id,
        client_code:     client.client_code,
        client_name:     client.name || client.business_name,
        supervisor_id:   user?.id,
        supervisor_name: user?.user_metadata?.name || user?.email,
        survey_type:     'CENSO_SUPERVISOR',
        
        // Fachada
        tiene_fachada:   tieneFachada,
        tipo_fachada:    tieneFachada ? (tipoFachada || null) : null,
        photo_fachada:   tieneFachada ? (photoFachadaUrl || null) : null,
        
        // Enfriador
        tiene_enfriador: tieneEnfriador,
        modelo:          tieneEnfriador ? modelo : null,
        serial:          tieneEnfriador ? serial : null,
        posicion:        tieneEnfriador ? posicion : null,
        invadido:        tieneEnfriador ? invadido : false,
        photo_url:       tieneEnfriador ? (photoUrl || null) : null,
        
        // Comunes
        lat:             userPos?.lat,
        lng:             userPos?.lng,
        notas,
        // Validation data (metadata)
        validated_assets: JSON.stringify(validatedAssets)
      });
      toast({ title: '¡Censo guardado!', description: 'El censo se ha registrado correctamente.' });
      onSaved?.();
      onClose?.();
    } catch (err) {
      console.error('[CensoForm] Save error:', err);
      toast({ title: 'Error', description: 'No se pudo guardar el censo.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateGeo = async () => {
    setSaving(true);
    try {
      const pos = await getCurrentPositionSafe({ enableHighAccuracy: true });
      const lat = pos?.coords?.latitude ?? pos?.lat;
      const lng = pos?.coords?.longitude ?? pos?.lng;
      if (!lat || !lng) throw new Error("No se pudieron obtener las coordenadas");

      await updateClient(client.id, { coords: { lat, lng } });

      // Update the client object locally so the checkGeo function sees the new coords
      client.lat = lat;
      client.lng = lng;
      client.coords = { lat, lng };

      toast({ title: '¡Ubicación actualizada!', description: 'Coordenadas del cliente guardadas.' });
      await checkGeo();
    } catch (err) {
      console.error('[CensoForm] Geo update error:', err);
      toast({ title: 'No se pudo actualizar', description: err?.message || 'Revisa tus permisos GPS.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ──────────────────────────────────────────────
  // Geolocation gate
  // ──────────────────────────────────────────────
  if (geoStatus === 'checking') {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        <p className="text-sm">Verificando tu ubicación…</p>
      </div>
    );
  }

  if (geoStatus === 'no_coords') {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-orange-500/10 flex items-center justify-center">
          <MapPin className="w-7 h-7 text-orange-400" />
        </div>
        <h3 className="text-white font-bold">GPS no disponible</h3>
        <p className="text-slate-400 text-sm">Activa los permisos de ubicación para realizar encuestas.</p>
        <button
          onClick={checkGeo}
          className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium"
        >
          Intentar de nuevo
        </button>
      </div>
    );
  }

  if (geoStatus === 'no_client_geo') {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-slate-500/10 flex items-center justify-center">
          <MapPin className="w-7 h-7 text-slate-400" />
        </div>
        <h3 className="text-white font-bold">Cliente sin ubicación</h3>
        <p className="text-slate-400 text-sm leading-relaxed">Este cliente no tiene coordenadas geográficas registradas instaladas en el sistema.</p>
        <p className="text-slate-500 text-xs mb-2">Presiona el botón abajo para obtener y guardar la ubicación actual como la coordenada oficial del cliente.</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleUpdateGeo}
            className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
            disabled={saving}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            Actualizar y Continuar
          </button>
        </div>
      </div>
    );
  }

  if (geoStatus === 'too_far') {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-red-400" />
        </div>
        <h3 className="text-white font-bold">Demasiado lejos del cliente</h3>
        <p className="text-slate-400 text-sm">
          Estás a <span className="text-red-400 font-bold">{distanceM}m</span> del punto de venta.<br />
          Necesitas estar a menos de {MAX_DISTANCE_M}m para realizar el censo.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium"
        >
          Cerrar
        </button>
      </div>
    );
  }

  // ──────────────────────────────────────────────
  // Main form
  // ──────────────────────────────────────────────
  return (
    <form onSubmit={handleSave} className="space-y-5 overflow-y-auto max-h-[75vh] pr-1">

      {/* Geo badge */}
      {distanceM !== null && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="text-xs text-emerald-300">Ubicación verificada · {distanceM}m del cliente</span>
        </div>
      )}

      {/* Fachada Section */}
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-white px-1">Censo de Fachada</h3>
        <div className="rounded-xl border border-white/[0.08] bg-slate-900/60 p-4">
          <ToggleSwitch value={tieneFachada} onChange={setTieneFachada} label="¿El cliente cuenta con fachada exterior?" activeColor="bg-blue-500" />
        </div>
        
        <AnimatePresence>
          {tieneFachada && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-4 overflow-hidden"
            >
              <div className="space-y-2 px-1">
                <label className="text-xs font-medium text-slate-300 uppercase tracking-wide">
                  Tipo de Fachada <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-2">
                  {['BÁSICA', 'HIGH'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTipoFachada(t)}
                      className={cn(
                        'flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all border',
                        tipoFachada === t
                          ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                          : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="px-1">
                <PhotoCapture
                  label="Foto de la Fachada *"
                  value={photoFachadaUrl}
                  onChange={setPhotoFachadaUrl}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="h-px bg-white/10 w-full my-4" />

      {/* Enfriador Section */}
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-white px-1">Censo de Enfriador</h3>
        <div className="rounded-xl border border-white/[0.08] bg-slate-900/60 p-4">
          <ToggleSwitch value={tieneEnfriador} onChange={setTieneEnfriador} label="¿El cliente tiene enfriador de la empresa?" />
        </div>

      {/* Enfriador details — only visible when yes */}
      <AnimatePresence>
        {tieneEnfriador && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-4 overflow-hidden"
          >
            {/* Existing Assets Validation List */}
            {existingAssets.length > 0 && (
                <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                        <CheckCircle2 size={12} className="text-emerald-500" /> Activos Registrados en Sistema
                    </label>
                    <div className="space-y-2">
                        {existingAssets.map(asset => (
                            <div key={asset.serial} className="flex items-center justify-between p-3 rounded-xl bg-slate-800 border border-white/5">
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-white">{asset.type}</span>
                                    <span className="text-[10px] text-slate-500 font-mono italic">S/N: {asset.serial}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] text-slate-400 font-medium">¿Presente?</span>
                                    <button
                                        type="button"
                                        onClick={() => setValidatedAssets(prev => ({ ...prev, [asset.serial]: !prev[asset.serial] }))}
                                        className={cn(
                                            "w-6 h-6 rounded-md flex items-center justify-center border transition-all",
                                            validatedAssets[asset.serial] 
                                                ? "bg-emerald-500 border-emerald-500 text-white" 
                                                : "bg-slate-900 border-white/10 text-transparent"
                                        )}
                                    >
                                        <CheckCircle2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    {!isAddingManual && (
                        <button
                            type="button"
                            onClick={() => setIsAddingManual(true)}
                            className="w-full py-2 text-[10px] font-black uppercase tracking-widest text-cyan-400 hover:text-cyan-300 transition-colors flex items-center justify-center gap-2"
                        >
                            <Plus size={12} /> Agregar otro enfriador no registrado
                        </button>
                    )}
                </div>
            )}

            {/* Manual Entry Form */}
            {(isAddingManual || existingAssets.length === 0) && (
                <div className="space-y-4 pt-2 border-t border-white/5">
                    {existingAssets.length > 0 && (
                        <div className="flex items-center justify-between">
                             <h4 className="text-xs font-black text-cyan-400 uppercase tracking-widest">Nuevo Enfriador</h4>
                             <button type="button" onClick={() => setIsAddingManual(false)} className="text-slate-500 hover:text-white"><X size={14} /></button>
                        </div>
                    )}
                    
                    {/* Modelo */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-300 uppercase tracking-wide">
                        Modelo del Enfriador <span className="text-red-400">*</span>
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {COOLER_MODELS.map(m => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setModelo(m)}
                            className={cn(
                              'py-2 px-1 rounded-lg text-xs font-bold transition-all border',
                              modelo === m
                                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                                : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
                            )}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Número de serie */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-300 uppercase tracking-wide">
                        Número de Serie <span className="text-red-400">*</span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          value={serial}
                          onChange={e => setSerial(e.target.value)}
                          placeholder="Ingresa o escanea el número de serie"
                          className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                        />
                        <button
                          type="button"
                          title="Escanear código de barras"
                          className={cn(
                            'px-3 py-2 rounded-lg border transition-colors flex items-center gap-1',
                            scannerOpen
                              ? 'bg-cyan-600 border-cyan-500 text-white'
                              : 'bg-slate-800 border-white/10 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300'
                          )}
                          onClick={() => setScannerOpen(s => !s)}
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                      </div>
                      <SmartBarcodeScanner
                          open={scannerOpen}
                          onDetected={(text) => { setSerial(text); setScannerOpen(false); }}
                          onClose={() => setScannerOpen(false)}
                        />
                    </div>

                    {/* Posición */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-slate-300 uppercase tracking-wide">
                          Posición del Enfriador <span className="text-red-400">*</span>
                        </label>
                        <button 
                          type="button" 
                          onClick={() => toast({ title: 'Glosario de Posiciones', description: '• PP: Primera Posición, es decir antes que la competencia.\n\n• PPA: Primera Posición Absoluta, lo primero que ves al entrar a la tienda.\n\n• OTRA: Cualquier posición que no sea PP o PPA.', duration: 7000 })}
                          className="text-slate-400 hover:text-cyan-400 transition-colors p-1"
                        >
                          <HelpCircle className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {POSITIONS.map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setPosicion(p)}
                            className={cn(
                              'px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                              posicion === p
                                ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                                : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
                            )}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Invadido */}
                    <div className="rounded-xl border border-white/[0.08] bg-slate-900/60 p-4">
                      <ToggleSwitch
                        value={invadido}
                        onChange={setInvadido}
                        label="¿Enfriador invadido con otras marcas?"
                        activeColor="bg-red-500"
                      />
                    </div>

                    {/* Foto del enfriador */}
                    <PhotoCapture
                      label="Foto del Enfriador *"
                      value={photoUrl}
                      onChange={setPhotoUrl}
                    />
                </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!tieneEnfriador && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 mb-2">
              <div className="flex items-center gap-2 text-blue-400">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wide">Solicitud Automática</span>
              </div>
              <p className="text-[10px] text-blue-400 mt-1 px-1 italic">
                * Se generará una orden de instalación pendiente de aprobación ya que el cliente no cuenta con enfriador.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {/* Notas generales */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-300 uppercase tracking-wide">
          Notas adicionales <span className="text-red-400">*</span>
        </label>
        <textarea
          value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Observaciones, condiciones del local, etc."
          rows={3}
          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-emerald-400 resize-none transition-colors"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 text-sm font-medium transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : '✓ Guardar Censo'}
        </button>
      </div>
    </form>
  );
}
