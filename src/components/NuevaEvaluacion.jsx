import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '../supabaseClient.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, Camera, CameraOff, RefreshCw, MapPin, Crosshair, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { getClientById, updateClient } from '@/repositories/clientsRepository';
import { loadEvaluationConfig, onEvaluationConfigUpdated, subscribeEvaluationConfig } from '@/lib/evaluationConfig';
import { getOptionalPositionFast } from '@/lib/geolocation';
import BarcodeScanner from 'react-qr-barcode-scanner';

/** ---------- Constantes y helpers ---------- **/

const EVAL_PHOTOS_BUCKET = 'visitas-fotos';

const presentaciones = ['1¼', '12oz', '16oz', '355ml', '473ml', '710ml', '1L', '1.2L', '1.5L', '2L', '3L'];
const estadosNegocio = ['Abierto', 'Cerrado', 'Enrejado'];
const productividadRanges = [
  { label: 'Bueno', min: 0, max: 30 },
  { label: 'Regular', min: 31, max: 60 },
  { label: 'Malo', min: 61, max: 100 },
];

const ALL_COOLER_CAPS = ['144', '192', '320', '376', '500', '552', '900', '1350'];
const allowedCapsByLevel = {
  Bronce: ['144'],
  Plata: ['144', '192', '320'],
  Oro: ['144', '192', '320', '376'],
  Platino: ['144', '192', '320', '376', '500', '552'],
  Titanio: ['144', '192', '320', '376', '500', '552', '900', '1350'],
};
const allowedForLevel = (nivel, cfg) => {
  const customMap = cfg?.allowedCapsByLevel;
  if (customMap && Array.isArray(customMap[String(nivel) || ''])) {
    return customMap[String(nivel) || ''];
  }
  return allowedCapsByLevel[String(nivel) || ''] || ALL_COOLER_CAPS;
};

const REF_VERSION = '2';
const refImg = (name) => `/reference/evaluacion/${name}?v=${REF_VERSION}`;

const elementosExteriorDefault = ['Banderola', 'Vinil', 'Lona', 'Letrero luminoso'];
const elementosInteriorDefault = ['Porta poster 1', 'Porta poster 2', 'Porta poster 3', 'Cooler blade', 'Refricalco', 'Preciador'];

function sanitizeList(list) {
  let arr = [];
  if (Array.isArray(list)) arr = list;
  else if (typeof list === 'string') {
    arr = list.split(/\r?\n|,|;/g).map((s) => s.trim()).filter(Boolean);
  }
  const cleaned = arr.map((x) => (x == null ? '' : String(x))).map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set(cleaned));
}
function normalizeKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
const brandImageOverrides = {
  'Dos Equis Lager': '/brands/XX.png',
  'Dos Equis Ambar': '/brands/XX.png',
  'Heineken': '/brands/HEINEKEN.png',
  'Tecate': '/brands/tecate.png',
  'Tecate Light': '/brands/tecate.png',
  'Indio': '/brands/INDIO.png',
  'Carta Blanca': '/brands/CARTA BLANCA.png',
  'StrongBow': '/brands/Strong Bow.png',
};
function imageCandidatesForName(name) {
  const candidates = [];
  const override = brandImageOverrides[name];
  if (override) candidates.push(override);
  const slug = slugify(name);
  const raw = String(name || '');
  const upper = raw.toUpperCase();
  candidates.push(`/brands/${slug}.png`, `/brands/${slug}.PNG`, `/brands/${raw}.png`, `/brands/${raw}.PNG`, `/brands/${upper}.png`, `/brands/${upper}.PNG`);
  return Array.from(new Set(candidates));
}
function PresentacionImg({ name, className, alt }) {
  const [idx, setIdx] = React.useState(0);
  const sources = React.useMemo(() => imageCandidatesForName(name), [name]);
  const src = sources[idx];
  if (!src) return null;
  return <img src={src} alt={alt || name} className={className} onError={() => setIdx((i) => i + 1)} />;
}

/** ---------- Cálculos ---------- **/
function calcularSurtido(presentacionesMarcadas, totalDisponibles) {
  const total = Number(totalDisponibles || presentaciones.length || 1);
  return Math.round((presentacionesMarcadas.length / total) * 100);
}
function calcularPlanograma({ invasion, huecos, skuIndividual, skuFamiliar }) {
  return invasion === 'no' && huecos === 'no' && skuIndividual === 'si' && skuFamiliar === 'si';
}
function calcularExterior({ fachadaBanderola, elementosExterior }) {
  return fachadaBanderola === 'si' && (elementosExterior?.length || 0) > 0;
}
function calcularInterior(elementosInterior, cfg) {
  const min = cfg?.thresholds?.interiorMinElements ?? 3;
  return (elementosInterior?.length || 0) >= Number(min || 0);
}
function capacidadValidaPorNivel(nivel, capacidadActual, cfg) {
  if (!capacidadActual) return false;
  const permitted = allowedForLevel(nivel, cfg);
  return permitted.includes(String(capacidadActual));
}
function calcularPuntaje(form, cfg) {
  let puntaje = 0;
  let advertencias = [];
  const weights = cfg?.weights || { surtido: 10, planograma: 10, exterior: 20, interior: 10, capacidad: 20, frio: 30 };
  const thresholds = cfg?.thresholds || { surtidoMinPercent: 80, interiorMinElements: 3 };
  const isProportional = cfg?.scoringMode === 'proportional';

  const surtidoPercent = calcularSurtido(form.presentaciones, cfg?.presentaciones?.length);
  const minSurtido = Number(thresholds.surtidoMinPercent ?? 80);
  const surtidoOk = surtidoPercent >= minSurtido;
  if (isProportional) {
    const ratio = minSurtido > 0 ? Math.min(1, surtidoPercent / minSurtido) : 1;
    puntaje += Math.round(ratio * (weights.surtido ?? 10) * 10) / 10;
  } else {
    puntaje += surtidoOk ? (weights.surtido ?? 10) : 0;
  }
  if (!surtidoOk) advertencias.push('Surtido insuficiente');

  const indispensablePlanograma = calcularPlanograma(form);
  puntaje += indispensablePlanograma ? (weights.planograma ?? 10) : 0;
  if (!indispensablePlanograma) advertencias.push('No cumple lo indispensable en planograma');

  const indispensableExterior = calcularExterior(form);
  puntaje += indispensableExterior ? (weights.exterior ?? 20) : 0;
  if (!indispensableExterior) advertencias.push('No cumple lo indispensable en comunicación exterior');

  const cumpleInterior = calcularInterior(form.elementosInterior, cfg);
  if (isProportional) {
    const minInt = Math.max(1, Number(thresholds.interiorMinElements ?? 3));
    const ratioInt = Math.min(1, (form.elementosInterior?.length || 0) / minInt);
    puntaje += Math.round(ratioInt * (weights.interior ?? 10) * 10) / 10;
  } else {
    puntaje += cumpleInterior ? (weights.interior ?? 10) : 0;
  }
  if (!cumpleInterior) advertencias.push('No cumple lo indispensable en comunicación interior');

  const capOk = capacidadValidaPorNivel(form.nivel, form.capacidadActual, cfg);
  puntaje += capOk ? (weights.capacidad ?? 20) : 0;
  if (!capOk) advertencias.push('Capacidad fría no permitida para el nivel');

  const frioOk = form.enfriadorFunciona === 'si';
  puntaje += frioOk ? (weights.frio ?? 30) : 0;
  if (!frioOk) advertencias.push('El enfriador no funciona correctamente');

  if (!indispensablePlanograma || !indispensableExterior) {
    advertencias.push('¡Advertencia! Algún indispensable no se cumple. El puntaje puede no ser válido.');
  }
  return { puntaje: Math.round(puntaje * 10) / 10, advertencias, surtidoPercent };
}

/** ---------- Estado inicial ---------- **/
const initialForm = {
  nombre: '',
  fecha: '',
  puntoVenta: '',
  zona: '',
  client_id: '',
  client_code: '',
  nivel: '',
  estadoNegocio: '',
  presentaciones: [],
  enfriadorPrimeraPos: '',
  surtidoPorcentaje: 0,
  invasion: '',
  huecos: '',
  skuIndividual: '',
  skuFamiliar: '',
  indispensablePlanograma: false,
  fachadaBanderola: '',
  cumpleExterior: false,
  elementosExterior: [],
  indispensableExterior: false,
  elementosInterior: [],
  cumpleInterior: false,
  productividad: '',
  capacidadActual: '',
  capacidadMin: '',
  capacidadMax: '',
  cumpleCapacidad: false,
  enfriadorFunciona: '',
  cooler_count: 1,
  cooler_sizes: [''],
  cooler_serials: [''],
  advertencias: [],
  lat: null,
  lng: null,
  client_type: '',
};

export default function NuevaEvaluacion({ 
  clientId, 
  routeName, 
  onComplete, 
  hideRedirect = false 
}) {
  const { user } = useSupabaseAuth();
  const navigate = useNavigate();

  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({ ...initialForm, nombre: user?.user_metadata?.full_name || user?.email || '' });

  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [installNote, setInstallNote] = useState('');

  const [fotoFachada, setFotoFachada] = useState(null);
  const [fotoInterior, setFotoInterior] = useState(null);
  const [fotoEnfriador, setFotoEnfriador] = useState(null);

  const [supportsAdvertencias, setSupportsAdvertencias] = useState(false);
  const [supportsTipoCliente, setSupportsTipoCliente] = useState(false);

  const [scannerFor, setScannerFor] = useState(null);
  const [scannerFacing, setScannerFacing] = useState('environment');
  const [scannerKey, setScannerKey] = useState(0);

  const [prevSerials, setPrevSerials] = useState([]);
  
  const [capturedLocation, setCapturedLocation] = useState(null);
  const [capturingGps, setCapturingGps] = useState(false);
  const [clientOriginalCoords, setClientOriginalCoords] = useState(null);
  const [existingClientType, setExistingClientType] = useState(null);

  // Prefill desde URL + fecha hoy
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pv = params.get('pv');
    const cId = clientId || params.get('clientId') || params.get('client_id') || params.get('id');
    const clientCode = params.get('client_code') || params.get('code') || params.get('codigo');
    const nameParam = params.get('name');
    const nivelParam = params.get('nivel') || params.get('tipo');
    setForm((prev) => ({
      ...prev,
      client_id: cId || prev.client_id,
      client_code: clientCode || prev.client_code,
      nivel: nivelParam || prev.nivel,
      puntoVenta: pv || nameParam || prev.puntoVenta,
      fecha: prev.fecha || new Date().toISOString().slice(0, 10),
    }));
  }, [clientId]);

  // Nombre evaluador
  useEffect(() => {
    const displayName = (user?.user_metadata?.full_name || '').trim() || user?.email || '';
    setForm((prev) => ({ ...prev, nombre: displayName }));
  }, [user?.id, user?.user_metadata?.full_name, user?.email]);

  // LOAD CLIENT DETAILS (Hydration)
  useEffect(() => {
    const cId = clientId || new URLSearchParams(window.location.search).get('clientId') || new URLSearchParams(window.location.search).get('client_id');
    if (!cId) return;

    let active = true;
    (async () => {
      setLoading(true);
      try {
        const clientData = await getClientById(cId);
        if (clientData && active) {
          const t = (clientData.client_type || clientData.level || clientData.type || '').toString();
          const displayName = clientData.business_name || clientData.name || '';
          const zonaComercial = clientData.zona_comercial || clientData.region || clientData.zona || '';
          const route = routeName || clientData.sales_route || clientData.ruta || '';

          setForm((prev) => ({
            ...prev,
            client_id: clientData.id,
            client_code: clientData.client_code || prev.client_code,
            nivel: clientData.level || clientData.type || prev.nivel,
            puntoVenta: prev.puntoVenta || displayName,
            zona: prev.zona || zonaComercial,
            ruta: route || prev.ruta,
            client_type: (t || prev.client_type || '').toUpperCase()
          }));

          // Coordenadas
          const cLat = parseFloat(clientData.lat);
          const cLng = parseFloat(clientData.lng);
          let parsedCoords = {};
          if (typeof clientData.coords === 'string') {
             try { parsedCoords = JSON.parse(clientData.coords); } catch (e) {}
          } else if (clientData.coords && typeof clientData.coords === 'object') {
             parsedCoords = clientData.coords;
          }
          
          const finalLat = (!isNaN(cLat) && cLat !== 0) ? cLat : parseFloat(parsedCoords.lat || parsedCoords[0]);
          const finalLng = (!isNaN(cLng) && cLng !== 0) ? cLng : parseFloat(parsedCoords.lng || parsedCoords[1]);
          
          const hasCoords = !isNaN(finalLat) && !isNaN(finalLng) && finalLat !== 0 && finalLng !== 0;
          setClientOriginalCoords(hasCoords ? { lat: finalLat, lng: finalLng } : null);
          
          const arr = Array.isArray(clientData.cooler_serials) ? clientData.cooler_serials : [];
          setPrevSerials(arr.filter(Boolean));
          setExistingClientType(t || null);
        }
      } catch (e) {
        console.error("Hydration error:", e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [clientId]);

  // Config dinámica
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const data = await loadEvaluationConfig();
      if (!mounted) return;
      setCfg(data);
    };
    load();
    const unsubLocal = onEvaluationConfigUpdated(load);
    const unsubRt = subscribeEvaluationConfig(load);
    return () => { mounted = false; unsubLocal && unsubLocal(); unsubRt && unsubRt(); };
  }, []);

  // Columnas opcionales
  useEffect(() => {
    (async () => {
      try {
        const { error } = await supabase.from('evaluaciones_pdv').select('advertencias').limit(0);
        setSupportsAdvertencias(!error);
      } catch (e) { setSupportsAdvertencias(false); }
    })();
    (async () => {
      try {
        const { error } = await supabase.from('evaluaciones_pdv').select('tipo_cliente').limit(0);
        setSupportsTipoCliente(!error);
      } catch (e) { setSupportsTipoCliente(false); }
    })();
  }, []);

  // Listas por config/zonas
  const zonasList = useMemo(() => sanitizeList(cfg?.zonas), [cfg]);
  const presentacionesBaseList = useMemo(() => sanitizeList(cfg?.presentaciones || presentaciones), [cfg]);
  const presentacionesForZona = useMemo(() => {
    const map = cfg?.presentacionesByZona || {};
    const normMap = Object.fromEntries(Object.entries(map).map(([k, v]) => [normalizeKey(k), v]));
    const zonal = form.zona ? normMap[normalizeKey(form.zona)] : null;
    return sanitizeList(zonal || presentacionesBaseList);
  }, [cfg, form.zona, presentacionesBaseList]);
  const estadosNegocioList = useMemo(() => sanitizeList(cfg?.estadosNegocio || estadosNegocio), [cfg]);
  const elementosExteriorList = useMemo(() => sanitizeList(cfg?.elementosExterior || elementosExteriorDefault), [cfg]);
  const elementosInteriorList = useMemo(() => sanitizeList(cfg?.elementosInterior || elementosInteriorDefault), [cfg]);

  // Depurar selección si cambian disponibles
  useEffect(() => {
    setForm((prev) => ({ ...prev, presentaciones: (prev.presentaciones || []).filter((p) => presentacionesForZona.includes(p)) }));
  }, [presentacionesForZona]);

  // Toggle presentaciones
  const togglePresentacion = (pres) => {
    setForm((prev) => {
      const has = (prev.presentaciones || []).includes(pres);
      return { ...prev, presentaciones: has ? prev.presentaciones.filter((p) => p !== pres) : [...(prev.presentaciones || []), pres] };
    });
  };

  // Cambios inputs
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      const presList = presentacionesForZona;
      const extList = elementosExteriorList;
      const intList = elementosInteriorList;
      if (presList.includes(name)) {
        setForm((prev) => ({ ...prev, presentaciones: checked ? [...prev.presentaciones, name] : prev.presentaciones.filter((p) => p !== name) }));
      } else if (extList.includes(name)) {
        setForm((prev) => ({ ...prev, elementosExterior: checked ? [...prev.elementosExterior, name] : prev.elementosExterior.filter((el) => el !== name) }));
      } else if (intList.includes(name)) {
        setForm((prev) => ({ ...prev, elementosInterior: checked ? [...prev.elementosInterior, name] : prev.elementosInterior.filter((el) => el !== name) }));
      }
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Puntaje live
  const { puntaje, advertencias, surtidoPercent } = useMemo(
    () => calcularPuntaje(form, { ...cfg, presentaciones: presentacionesForZona }),
    [form, cfg, presentacionesForZona]
  );
  const totalWeight = useMemo(() => (cfg?.weights ? Object.values(cfg.weights).reduce((a, b) => a + b, 0) : 100), [cfg]);

  const steps = [
    {
      key: 'datos', title: 'Datos Generales', content: (
        <div className="space-y-4">
          <div>
            <Label>Nombre del evaluador</Label>
            <Input name="nombre" value={form.nombre} readOnly />
          </div>
          <div>
            <Label>Fecha</Label>
            <Input type="date" name="fecha" value={form.fecha} onChange={handleChange} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Punto de venta</Label>
              {form.nivel ? <span className="text-[11px] px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700">Nivel: {form.nivel}</span> : null}
            </div>
            <Input name="puntoVenta" value={form.puntoVenta} onChange={handleChange} placeholder="Nombre del negocio" readOnly={!!form.puntoVenta} />
            {form.client_code ? <div className="text-xs text-muted-foreground mt-1">Código: {form.client_code}</div> : null}
          </div>
          <div>
            <Label>Zona</Label>
            <Select value={form.zona} onValueChange={(v) => setForm((p) => ({ ...p, zona: v }))}>
              <SelectTrigger className="h-11 rounded-xl border-slate-700 bg-slate-800/50"><SelectValue placeholder="Selecciona" /></SelectTrigger>
              <SelectContent className="z-[10001] bg-slate-900 border-slate-800 text-white">{(sanitizeList(cfg?.zonas) || []).filter((z) => String(z || '').trim().length > 0).map((z) => (<SelectItem key={z} value={z}>{z}</SelectItem>))}</SelectContent>
            </Select>
          </div>

          {/* Sección de Geolocalización */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <Label className="flex items-center gap-2">
                <MapPin size={14} className="text-slate-400" />
                Ubicación del Cliente
              </Label>
              {clientOriginalCoords ? (
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                   <CheckCircle2 size={10} /> Registrada
                </span>
              ) : (
                <span className="text-[10px] text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 flex items-center gap-1 animate-pulse">
                   <AlertTriangle size={10} /> Pendiente
                </span>
              )}
            </div>

            {(!clientOriginalCoords || capturedLocation) && (
              <div className={`p-4 rounded-2xl border transition-all ${capturedLocation ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-800/40 border-slate-700/50'}`}>
                 <div className="flex items-center justify-between gap-4">
                   <div className="flex-1 min-w-0">
                     {capturedLocation ? (
                       <div>
                         <p className="text-xs font-black text-emerald-400 uppercase tracking-wider mb-1">Ubicación Capturada</p>
                         <p className="text-[10px] text-emerald-300 font-mono font-bold truncate">
                           {capturedLocation.lat.toFixed(6)}, {capturedLocation.lng.toFixed(6)}
                         </p>
                       </div>
                     ) : (
                       <div>
                         <p className="text-xs font-bold text-slate-300 mb-1">Cisterna GPS</p>
                         <p className="text-[10px] text-slate-400">
                           Es obligatorio registrar la ubicación para este cliente.
                         </p>
                       </div>
                     )}
                   </div>
                   
                   <Button 
                     type="button"
                     size="sm"
                     disabled={capturingGps}
                     onClick={async () => {
                       setCapturingGps(true);
                       const pos = await getOptionalPositionFast(3000);
                       setCapturingGps(false);
                       if (pos) {
                         const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                         setCapturedLocation(loc);
                         setForm(prev => ({ ...prev, lat: loc.lat, lng: loc.lng }));
                         const cid = form.client_id || clientId;
                         if (cid) {
                           try {
                             await updateClient(cid, { lat: loc.lat, lng: loc.lng, latitude: loc.lat, longitude: loc.lng, coords: loc });
                             toast({ title: 'Ubicación registrada en la base de clientes' });
                           } catch (err) {
                             console.error("Error updating location", err);
                           }
                         }
                       } else {
                         toast({ title: 'GPS no detectado en 3s (se omitirá para no bloquear la evaluación)' });
                       }
                     }}
                     className={`shrink-0 h-10 px-4 rounded-xl shadow-sm ${capturedLocation ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-800 hover:bg-slate-900'}`}
                   >
                     {capturingGps ? (
                       <Loader2 className="w-4 h-4 animate-spin" />
                     ) : capturedLocation ? (
                       <RefreshCw className="w-4 h-4" />
                     ) : (
                       <Crosshair className="w-4 h-4" />
                     )}
                     <span className="ml-2 font-bold text-xs uppercase tracking-wider">{capturedLocation ? 'Recapturar' : 'Capturar'}</span>
                   </Button>
                 </div>
              </div>
            )}

            {clientOriginalCoords && !capturedLocation && (
              <div className="p-3 bg-slate-800/20 border border-slate-700/30 rounded-xl">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1 text-center">Coordenadas del cliente (No editable)</p>
                <p className="text-xs text-slate-300 font-mono text-center">
                  {clientOriginalCoords.lat.toFixed(6)}, {clientOriginalCoords.lng.toFixed(6)}
                </p>
              </div>
            )}
          </div>

          {/* Sección de Tipo de Cliente */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <Label className="flex items-center gap-2 font-bold text-slate-700">
                <CheckCircle2 size={14} className={form.client_type ? "text-emerald-500" : "text-slate-400"} />
                Tipo de Cliente (Canal)
              </Label>
              {existingClientType ? (
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase tracking-tighter">
                  Registrado
                </span>
              ) : (
                <span className="text-[10px] text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 uppercase tracking-tighter animate-pulse">
                  Requerido
                </span>
              )}
            </div>
            {existingClientType ? (
              <div className="h-11 flex items-center px-4 rounded-xl border border-slate-700 bg-slate-800/30 text-slate-300 text-sm font-medium capitalize">
                {form.client_type}
              </div>
            ) : (
              <Select 
                value={form.client_type} 
                onValueChange={(v) => setForm(prev => ({ ...prev, client_type: v }))}
              >
                <SelectTrigger className={`h-11 rounded-xl transition-all ${!form.client_type ? "border-amber-500/50 bg-amber-500/5 ring-1 ring-amber-500/20" : "border-slate-700 bg-slate-800/50"}`}>
                  <SelectValue placeholder="Selecciona el tipo de negocio" />
                </SelectTrigger>
                <SelectContent className="z-[10001]">
                  <SelectItem value="PUNTO DE VENTA">PUNTO DE VENTA</SelectItem>
                  <SelectItem value="CENTRO DE CONSUMO">CENTRO DE CONSUMO</SelectItem>
                  <SelectItem value="CANAL MODERNO">CANAL MODERNO</SelectItem>
                  <SelectItem value="OTRO">OTRO</SelectItem>
                </SelectContent>
              </Select>
            )}
            {!form.client_type && (
              <p className="text-[10px] text-amber-400 mt-1.5 flex items-center gap-1 font-medium bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/20">
                <AlertTriangle size={12} /> Recuerda que es obligatorio clasificar el negocio
              </p>
            )}
          </div>

          <div>
            <Label>Acceso al negocio</Label>
            <Select value={form.estadoNegocio} onValueChange={(v) => setForm((p) => ({ ...p, estadoNegocio: v }))}>
              <SelectTrigger className="h-11 rounded-xl border-slate-700 bg-slate-800/50"><SelectValue placeholder="Selecciona" /></SelectTrigger>
              <SelectContent className="z-[10001] bg-slate-900 border-slate-800 text-white">{(sanitizeList(cfg?.estadosNegocio || estadosNegocio) || []).filter((e) => String(e || '').trim().length > 0).map((e) => (<SelectItem key={e} value={e}>{e}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <Dialog>
            <DialogTrigger asChild><Button type="button" variant="outline" size="sm">Guía rápida</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Guía de evaluación</DialogTitle>
                <DialogDescription>Ayuda visual para completar la evaluación. Usa estas referencias para validar cada sección.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm text-black">
                <div><div className="font-medium mb-1">Surtido</div><img src={refImg('surtido_presentaciones_ejemplo.png')} alt="Ejemplo de surtido" className="w-full border rounded"
                  onError={(e) => { if (!e.currentTarget.dataset.fallback) { e.currentTarget.dataset.fallback = 'svg'; e.currentTarget.src = refImg('surtido_presentaciones_ejemplo.svg'); } }} /></div>
                <div><div className="font-medium mb-1">Planograma</div><img src={refImg('planograma_ejemplo.png')} alt="Ejemplo de planograma" className="w-full border rounded"
                  onError={(e) => { if (!e.currentTarget.dataset.fallback) { e.currentTarget.dataset.fallback = 'svg'; e.currentTarget.src = refImg('planograma_ejemplo.svg'); } }} /></div>
                <div><div className="font-medium mb-1">Comunicación Exterior</div><img src={refImg('fachada_banderola_ejemplo.png')} alt="Ejemplo fachada con banderola" className="w-full border rounded"
                  onError={(e) => { if (!e.currentTarget.dataset.fallback) { e.currentTarget.dataset.fallback = 'svg'; e.currentTarget.src = refImg('fachada_banderola_ejemplo.svg'); } }} /></div>
                <div><div className="font-medium mb-1">Comunicación Interior</div><img src={refImg('interior_elementos_ejemplo.png')} alt="Ejemplo elementos interior" className="w-full border rounded"
                  onError={(e) => { if (!e.currentTarget.dataset.fallback) { e.currentTarget.dataset.fallback = 'svg'; e.currentTarget.src = refImg('interior_elementos_ejemplo.svg'); } }} /></div>
                <div><div className="font-medium mb-1">Frío óptimo</div><img src={refImg('enfriador_ok_ejemplo.png')} alt="Ejemplo enfriador" className="w-full border rounded"
                  onError={(e) => { if (!e.currentTarget.dataset.fallback) { e.currentTarget.dataset.fallback = 'svg'; e.currentTarget.src = refImg('enfriador_ok_ejemplo.svg'); } }} /></div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )
    },
    {
      key: 'surtido', title: 'Surtido (10%)', content: (
        <div>
          <div className="mb-3 text-sm text-muted-foreground">Selecciona las presentaciones disponibles:</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {presentacionesForZona.map((pres) => {
              const selected = form.presentaciones.includes(pres);
              return (
                <div key={pres} role="checkbox" aria-checked={selected} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); togglePresentacion(pres); } }}
                  onClick={() => togglePresentacion(pres)}
                  className={`rounded-md border bg-white p-2 cursor-pointer select-none hover:bg-accent/40 focus:outline-none ${selected ? 'ring-2 ring-primary border-primary' : ''}`}>
                  <div className="w-full h-16 flex items-center justify-center bg-white overflow-hidden rounded">
                    <PresentacionImg name={pres} className="h-12 object-contain" alt={pres} />
                  </div>
                  <div className="mt-1 text-center text-xs text-black">{pres}</div>
                  <input type="checkbox" className="hidden" name={pres} checked={selected} onChange={handleChange} />
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>¿Enfriador en primera posición?</Label>
              <Select value={form.enfriadorPrimeraPos} onValueChange={(v) => setForm((p) => ({ ...p, enfriadorPrimeraPos: v }))}>
                <SelectTrigger className="h-11 rounded-xl border-slate-700 bg-slate-800/50"><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent className="z-[10001] bg-slate-900 border-slate-800 text-white"><SelectItem value="si">Sí</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <div className="text-sm font-semibold">% logrado: {surtidoPercent}%</div>
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'planograma', title: 'Planograma (10%)', content: (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>¿Hay invasión?</Label>
              <Select value={form.invasion} onValueChange={(v) => setForm((p) => ({ ...p, invasion: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent><SelectItem value="si">Sí</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label>¿Hay huecos?</Label>
              <Select value={form.huecos} onValueChange={(v) => setForm((p) => ({ ...p, huecos: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent><SelectItem value="si">Sí</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label>¿SKU individual (Media,Lata,Cuartito,Laton, 710)+ de 2?</Label>
              <Select value={form.skuIndividual} onValueChange={(v) => setForm((p) => ({ ...p, skuIndividual: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent><SelectItem value="si">Sí</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label>¿SKU familiar(Caguama,Caguamon,12Pack)+ de 1?</Label>
              <Select value={form.skuFamiliar} onValueChange={(v) => setForm((p) => ({ ...p, skuFamiliar: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent><SelectItem value="si">Sí</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-3 inline-flex items-center gap-2 text-sm">
            {calcularPlanograma(form) ? (
              <><CheckCircle2 className="w-4 h-4 text-emerald-600" /><span className="text-emerald-700">Indispensable: Sí</span></>
            ) : (
              <><AlertTriangle className="w-4 h-4 text-amber-600" /><span className="text-amber-700">Indispensable: No</span></>
            )}
          </div>
        </div>
      )
    },
    {
      key: 'exterior', title: 'Comunicación Exterior (20%)', content: (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
            <div>
              <Label>¿Fachada con elemento exterior?</Label>
              <Select value={form.fachadaBanderola} onValueChange={(v) => setForm((p) => ({ ...p, fachadaBanderola: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent><SelectItem value="si">Sí</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label>Elementos visibles</Label>
              <div className="flex flex-wrap gap-2">
                {elementosExteriorList.map((el) => (
                  <label key={el} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-accent">
                    <input type="checkbox" name={el} checked={form.elementosExterior.includes(el)} onChange={handleChange} />
                    {el}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><Label>Foto fachada <span className="text-red-500">*</span></Label><Input type="file" accept="image/*" capture="environment" onChange={(e) => setFotoFachada(e.target.files?.[0] || null)} /></div>
            <div><Label>Foto interior <span className="text-red-500">*</span></Label><Input type="file" accept="image/*" capture="environment" onChange={(e) => setFotoInterior(e.target.files?.[0] || null)} /></div>
            <div><Label>Foto enfriador <span className="text-red-500">*</span></Label><Input type="file" accept="image/*" capture="environment" onChange={(e) => setFotoEnfriador(e.target.files?.[0] || null)} /></div>
          </div>
          <div className="mt-1 inline-flex items-center gap-2 text-sm">
            {calcularExterior(form) ? (
              <><CheckCircle2 className="w-4 h-4 text-emerald-600" /><span className="text-emerald-700">Indispensable: Sí</span></>
            ) : (
              <><AlertTriangle className="w-4 h-4 text-amber-600" /><span className="text-amber-700">Indispensable: No</span></>
            )}
          </div>
        </div>
      )
    },
    {
      key: 'interior', title: 'Comunicación Interior (10%)', content: (
        <div>
          <div className="flex flex-wrap gap-2 mb-2">
            {elementosInteriorList.map((el) => (
              <label key={el} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-accent">
                <input type="checkbox" name={el} checked={form.elementosInterior.includes(el)} onChange={handleChange} />
                {el}
              </label>
            ))}
          </div>
          <div className="mt-1 inline-flex items-center gap-2 text-sm">
            {calcularInterior(form.elementosInterior, cfg) ? (
              <><CheckCircle2 className="w-4 h-4 text-emerald-600" /><span className="text-emerald-700">Cumple</span></>
            ) : (
              <><AlertTriangle className="w-4 h-4 text-amber-600" /><span className="text-amber-700">No cumple</span></>
            )}
          </div>
        </div>
      )
    },
    {
      key: 'capacidad', title: 'Capacidad Fría (20%)', content: (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Estado del Enfriador</Label>
              <Select value={form.productividad} onValueChange={(v) => setForm((p) => ({ ...p, productividad: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent>{productividadRanges.map((r) => (<SelectItem key={r.label} value={r.label}>{r.label}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Capacidad actual del enfriador (todas)</Label>
              <Select value={form.capacidadActual} onValueChange={(v) => setForm((p) => ({ ...p, capacidadActual: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent>{ALL_COOLER_CAPS.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent>
              </Select>
              <div className="mt-2 text-xs text-muted-foreground">
                {form.nivel ? <>Permitidas para <b>{form.nivel}</b>: {allowedForLevel(form.nivel, cfg).join(', ')}</> : <>Selecciona un nivel para validar</>}
              </div>
              {form.nivel && form.capacidadActual && !capacidadValidaPorNivel(form.nivel, form.capacidadActual, cfg) && (
                <div className="text-amber-700 text-sm flex items-center gap-2 mt-2">
                  <AlertTriangle className="w-4 h-4" /> Se descontará <b>{cfg?.weights?.capacidad ?? 20}%</b> por capacidad inválida, pero puedes continuar.
                </div>
              )}
              {form.nivel && form.capacidadActual && capacidadValidaPorNivel(form.nivel, form.capacidadActual, cfg) && (
                <div className="text-emerald-700 text-sm flex items-center gap-2 mt-2">
                  <CheckCircle2 className="w-4 h-4" /> Capacidad permitida para su nivel (sin descuento).
                </div>
              )}
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'frio', title: 'Frío óptimo / frescura (30%)', content: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>¿El enfriador funciona correctamente?</Label>
            <Select value={form.enfriadorFunciona} onValueChange={(v) => setForm((p) => ({ ...p, enfriadorFunciona: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
              <SelectContent><SelectItem value="si">Sí</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label>Comentarios (opcional)</Label>
            <Textarea name="comentarios" placeholder="Notas adicionales" onChange={handleChange} />
          </div>
        </div>
      )
    },
    {
      key: 'enfriadores', title: 'Enfriadores (serie y tamaño)', content: (
        <div className="space-y-4">
          <div>
            <Label>¿Cuántos enfriadores tiene?</Label>
            <Select
              value={String(form.cooler_count)}
              onValueChange={(v) => {
                const n = Number(v) || 1;
                setForm((prev) => ({
                  ...prev,
                  cooler_count: n,
                  cooler_sizes: Array(n).fill(''),
                  cooler_serials: Array(n).fill(''),
                }));
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
              <SelectContent>{[1, 2, 3, 4, 5].map((n) => (<SelectItem key={n} value={String(n)}>{n}</SelectItem>))}</SelectContent>
            </Select>
          </div>

          {Array.from({ length: form.cooler_count }).map((_, idx) => {
            const size = form.cooler_sizes[idx] || '';
            const serial = form.cooler_serials[idx] || '';
            return (
              <div key={idx} className="border rounded-md p-3 space-y-3">
                <div className="font-medium">Enfriador #{idx + 1}</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div>
                    <Label>Tamaño (capacidad)</Label>
                    <Select
                      value={String(size)}
                      onValueChange={(v) => {
                        const next = [...form.cooler_sizes];
                        next[idx] = v;
                        setForm((p) => ({ ...p, cooler_sizes: next }));
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Tamaño" /></SelectTrigger>
                      <SelectContent>{ALL_COOLER_CAPS.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Serie</Label>
                    <Input
                      placeholder="Escanea o escribe la serie"
                      value={serial}
                      onChange={(e) => {
                        const next = [...form.cooler_serials];
                        next[idx] = e.target.value;
                        setForm((p) => ({ ...p, cooler_serials: next }));
                      }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => { setScannerFor(idx); setScannerKey((k) => k + 1); }}>
                      <Camera className="w-4 h-4 mr-1" /> Escanear
                    </Button>
                    {scannerFor === idx && (
                      <>
                        <Button type="button" variant="ghost" onClick={() => setScannerFor(null)}>
                          <CameraOff className="w-4 h-4 mr-1" /> Cerrar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => { setScannerFacing((f) => (f === 'environment' ? 'user' : 'environment')); setScannerKey((k) => k + 1); }}
                        >
                          <RefreshCw className="w-4 h-4 mr-1" /> {scannerFacing === 'environment' ? 'Trasera' : 'Frontal'}
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {scannerFor === idx && (
                  <div className="mt-2 border rounded-md overflow-hidden">
                    <div className="bg-muted/50 text-xs px-3 py-2">Apunta al código de barras o QR. Procura buena luz.</div>
                    <div className="p-2">
                      <BarcodeScanner
                        key={scannerKey}
                        width={'100%'}
                        height={260}
                        facingMode={scannerFacing}
                        delay={200}
                        formats={['CODE_128', 'CODE_39', 'EAN_13', 'EAN_8', 'QR_CODE']}
                        onError={(err) => console.error('Scanner error', err)}
                        onUpdate={(_err, result) => {
                          const scanned = result?.text ?? result?.getText?.();
                          if (scanned) {
                            const next = [...form.cooler_serials];
                            next[idx] = scanned;
                            setForm((p) => ({ ...p, cooler_serials: next }));
                            setScannerFor(null);
                          }
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )
    },
    {
      key: 'resumen', title: 'Resumen y guardado', content: (
        <div className="space-y-4">
          <div className="font-medium">Puntaje total: {puntaje} / {totalWeight}</div>

          <div className="rounded bg-muted p-3 text-sm">
            <div className="font-semibold mb-1">Advertencias</div>
            {advertencias.length ? (
              <ul className="list-disc ml-5">{advertencias.map((a, i) => <li key={i}>{a}</li>)}</ul>
            ) : (
              <div>Sin advertencias.</div>
            )}
          </div>

          <div className="text-sm">Series actuales: {(form.cooler_serials || []).filter(Boolean).join(', ') || 'Ninguna'}</div>
          <div className="text-sm">Series previas: {prevSerials.join(', ') || 'Ninguna'}</div>

          {(() => {
            const curr = (form.cooler_serials || []).filter(Boolean);
            const prev = prevSerials || [];
            const prevSet = new Set(prev);
            const currSet = new Set(curr);
            const added = curr.filter((s) => !prevSet.has(s));
            const removed = prev.filter((s) => !currSet.has(s));
            const hasDiff = added.length > 0 || removed.length > 0;
            return (
              <div className={`text-sm rounded-md border p-3 ${hasDiff ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`}>
                {hasDiff ? (
                  <>
                    <div className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Diferencia de series detectada</div>
                    <div>Por favor, reporta la diferencia al evaluador.</div>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div><span className="font-medium">Agregadas:</span> {added.length ? added.join(', ') : 'Ninguna'}</div>
                      <div><span className="font-medium">Removidas:</span> {removed.length ? removed.join(', ') : 'Ninguna'}</div>
                    </div>
                  </>
                ) : (
                  <div className="font-medium flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Series coinciden con el histórico del cliente</div>
                )}
              </div>
            );
          })()}
        </div>
      )
    },
  ];

  const progressPct = Math.round(((page + 1) / steps.length) * 100);

  // Subida de fotos
  const uploadPhoto = async (file, kind) => {
    if (!file) return null;
    // Usamos el nuevo servicio de subida a Hostinger
    // 'visitas-fotos' es el nombre de la carpeta en el servidor
    const { uploadPhoto: uploadService } = await import('@/lib/uploadService');
    return await uploadService(file, EVAL_PHOTOS_BUCKET);
  };

  const finalizar = async () => {
    try {
      // GEOLOCALIZACIÓN RÁPIDA OPCIONAL (3s) SI EL CLIENTE NO TIENE COORDENADAS
      if (!clientOriginalCoords && !capturedLocation) {
        const quickPos = await getOptionalPositionFast(3000);
        if (quickPos) {
          const loc = { lat: quickPos.coords.latitude, lng: quickPos.coords.longitude };
          setCapturedLocation(loc);
          setForm(prev => ({ ...prev, lat: loc.lat, lng: loc.lng }));
          const cid = form.client_id || clientId;
          if (cid) {
            updateClient(cid, { lat: loc.lat, lng: loc.lng, latitude: loc.lat, longitude: loc.lng, coords: loc }).catch(() => {});
          }
        }
      }

      // VALIDATE MANDATORY CLIENT TYPE
      if (!form.client_type) {
        alert('Es obligatorio seleccionar el Tipo de Cliente para finalizar la evaluación.');
        setPage(0); // Regresar al primer paso
        return;
      }

      // VALIDATE MANDATORY PHOTOS
      if (!fotoFachada || !fotoInterior || !fotoEnfriador) {
        alert('Debes tomar las 3 fotos obligatorias (Fachada, Interior, Enfriador) para finalizar la evaluación.');
        return;
      }

      setLoading(true);
      setError('');
      setSuccess(false);
      setInstallNote('');

      const { puntaje: pFinal, advertencias: advFinal } = calcularPuntaje(form, { ...cfg, presentaciones: presentacionesForZona });
      const evalId = crypto.randomUUID();

      // 2. PREPARE EVALUATION PAYLOAD
      const payload = {
        id: evalId, // Generamos ID cliente-side para consistencia offline
        nombre: form.nombre || null,
        fecha: form.fecha || new Date().toISOString().slice(0, 10),
        punto_venta: form.puntoVenta || null,
        zona: form.zona || null,
        client_id: form.client_id || null,
        client_code: form.client_code || null,
        nivel: form.nivel || null,
        estado_negocio: form.estadoNegocio || null,
        presentaciones: form.presentaciones || [],
        enfriador_primera_pos: form.enfriadorPrimeraPos || null,
        surtido_porcentaje: calcularSurtido(form.presentaciones, presentacionesForZona.length),
        invasion: form.invasion || null,
        huecos: form.huecos || null,
        sku_individual: form.skuIndividual || null,
        sku_familiar: form.skuFamiliar || null,
        indispensable_planograma: calcularPlanograma(form),
        fachada_banderola: form.fachadaBanderola || null,
        cumple_exterior: calcularExterior(form),
        elementos_exterior: form.elementosExterior || [],
        indispensable_exterior: calcularExterior(form),
        elementos_interior: form.elementosInterior || [],
        cumple_interior: calcularInterior(form.elementosInterior, cfg),
        productividad: form.productividad || null,
        capacidad_actual: form.capacidadActual || null,
        capacidad_min: form.capacidadMin || null,
        capacidad_max: form.capacidadMax || null,
        cumple_capacidad: capacidadValidaPorNivel(form.nivel, form.capacidadActual),
        enfriador_funciona: form.enfriadorFunciona || null,
        cooler_count: form.cooler_count || 0,
        cooler_sizes: form.cooler_sizes || [],
        cooler_serials: (form.cooler_serials || []).filter(Boolean),
        prev_serials: prevSerials || [],
        puntaje_total: Number(pFinal) || 0,
        user_id: user?.id || null,
        tipo_cliente: form.client_type || null,
        // Pasamos los archivos al repositorio para que maneje la subida (online) o el buffer (offline)
        photo_files: {
          fachada: fotoFachada,
          interior: fotoInterior,
          enfriador: fotoEnfriador
        },
        advertencias: advFinal || []
      };

      // 3. SAVE VIA REPOSITORY (Offline capable)
      const { createEvaluationPDV } = await import('@/repositories/evaluationsRepository');
      await createEvaluationPDV(payload);

      // 4. CHECK-ONLY: ASSET INSTALLATIONS (no writes)
      if (form.client_id) {
        const currSerials = (form.cooler_serials || []).filter(Boolean);
        const prev = prevSerials || [];
        const prevSet = new Set(prev);
        const currSet = new Set(currSerials);
        const addedSerials = currSerials.filter(s => !prevSet.has(s));
        const removedSerials = prev.filter(s => !currSet.has(s));
        const changedSerials = [...addedSerials, ...removedSerials];

        if ((currSerials.length === 0) && (prev.length === 0)) {
          setInstallNote('favor de validad existencia de equipo y notificar a supervisor');
        } else if (changedSerials.length > 0) {
          setInstallNote('favor de agregar el equipo al cliente');
        } else {
          setInstallNote('');
        }
      }

      // 5. UPDATE CLIENT DATA IF CHANGED (COORD OR TYPE)
      if (form.client_id) {
        const clientUpdates = {};
        if (capturedLocation) {
          clientUpdates.lat = capturedLocation.lat;
          clientUpdates.lng = capturedLocation.lng;
          clientUpdates.coords = { lat: capturedLocation.lat, lng: capturedLocation.lng };
        }
        if (form.client_type && form.client_type !== existingClientType) {
          clientUpdates.client_type = form.client_type;
        }

        if (Object.keys(clientUpdates).length > 0) {
          try {
            const { updateClient } = await import('@/repositories/clientsRepository');
            await updateClient(form.client_id, clientUpdates);
            console.log('[NuevaEvaluacion] Cliente actualizado con:', clientUpdates);
          } catch (updateErr) {
            console.error('[NuevaEvaluacion] Error al actualizar cliente:', updateErr);
            // No bloqueamos el éxito de la evaluación si esto falla
          }
        }
      }

      setSuccess(true);
      
      if (onComplete) {
        onComplete({ id: evalId, score: puntaje });
      }

      if (!hideRedirect) {
        // Redirigir a /clients después de 1.5 segundos (para que vean el mensaje de éxito)
        setTimeout(() => {
          navigate('/clients');
        }, 1500);
      }

    } catch (e) {
      console.error(e);
      setError(`Error al guardar: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="w-full max-w-3xl mx-auto py-6 space-y-4">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo2.jpeg" alt="logo" className="w-6 h-6 rounded" />
          <span className="font-medium">Evaluación PDV</span>
        </div>
        <div className="w-48 h-2 rounded bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{steps[page].title}</CardTitle>
            <div className="text-sm font-medium">Puntaje: {puntaje} / {totalWeight}</div>
          </div>
          {advertencias.length > 0 && (
            <div className="mt-3 flex items-start gap-2 text-amber-600">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <ul className="list-disc ml-4">{advertencias.map((a, i) => (<li key={i} className="text-sm">{a}</li>))}</ul>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {steps[page].content}

          <div className="flex justify-between mt-6">
            {page > 0 ? (
              <Button type="button" variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Anterior
              </Button>
            ) : <div />}

            {page < steps.length - 1 ? (
              <Button type="button" onClick={() => setPage((p) => Math.min(steps.length - 1, p + 1))}>
                Siguiente <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button type="button" className="bg-green-600 text-white" onClick={finalizar} disabled={loading}>
                {loading ? 'Guardando...' : 'Finalizar'}
              </Button>
            )}
          </div>

          {error && <div className="text-red-600 mt-4">{error}</div>}
          {success && <div className="text-emerald-600 mt-4">¡Evaluación guardada!</div>}
          {installNote && (
            <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 text-blue-800 px-3 py-2">
              {installNote}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
