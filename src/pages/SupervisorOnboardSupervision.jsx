import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ClipboardCheck, 
  Car, 
  User, 
  MapPin, 
  Search, 
  CheckCircle2, 
  XCircle, 
  ChevronRight, 
  ChevronLeft, 
  Save, 
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  ShoppingBag,
  MessageSquare,
  LayoutDashboard,
  Plus,
  Target,
  Crosshair,
  RefreshCw,
  Map as MapIcon,
  Type
} from 'lucide-react';
import LocationPickerModal from '@/components/common/LocationPickerModal';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { getClients, updateClient, searchClients } from '@/repositories/clientsRepository';
import { getAllowedRoutes } from '@/repositories/metadataRepository';
import { getOptionalPositionFast, warmUpGeolocation } from '@/lib/geolocation';
import { loadEvaluationConfig, defaultEvaluationConfig, onEvaluationConfigUpdated, subscribeEvaluationConfig } from '@/lib/evaluationConfig';
import { 
  startOnboardSupervision, 
  getActiveSupervision, 
  getSupervisionData, 
  addOnboardVisit, 
  finishOnboardSupervision 
} from '@/repositories/onboardSupervisionRepository';
import NuevaEvaluacion from '@/components/NuevaEvaluacion';
import CanalModernoPage from '@/pages/CanalModernoPage';
import DonutProgress from '@/components/DonutProgress';

const STEPS = [
  { id: 'start', title: 'Inicio y Checklist', icon: Car },
  { id: 'visits', title: 'Visitas a Clientes', icon: MapPin },
  { id: 'summary', title: 'Resumen Final', icon: TrendingUp }
];

export default function SupervisorOnboardSupervision() {
  const { user } = useSupabaseAuth();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { toast } = useToast();

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [onboardCfg, setOnboardCfg] = useState(defaultEvaluationConfig.onboardConfig);
  const [closingNotes, setClosingNotes] = useState('');

  useEffect(() => {
    const loadCfg = async () => {
      const full = await loadEvaluationConfig();
      if (full?.onboardConfig) setOnboardCfg(full.onboardConfig);
    };
    loadCfg();
    const unsub1 = onEvaluationConfigUpdated(loadCfg);
    const unsub2 = subscribeEvaluationConfig(loadCfg);
    return () => {
      unsub1 && unsub1();
      unsub2 && unsub2();
    };
  }, []);

  // Step 1: Start Form
  const [startForm, setStartForm] = useState({
    route_name: '',
    vendedor_name: '',
    vehicle_clean: false,
    uniform_ok: false,
    vehicle_status_ok: false
  });
  const [availableRoutes, setAvailableRoutes] = useState([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);

  // Step 2: Visits
  const [routeClients, setRouteClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [surveyForm, setSurveyForm] = useState({
    greeting: 'no',
    negotiation: 'no',
    pop_updated: 'no',
    facade_ok: 'no',
    has_cooler: 'no',
    frequency: '',
    purchased: 'no',
    facade_type: ''
  });
  const [showSurveyDialog, setShowSurveyDialog] = useState(false);
  const [showCoolerSurvey, setShowCoolerSurvey] = useState(false);
  const [currentCoolerEvalId, setCurrentCoolerEvalId] = useState(null);

  // Global Search
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [globalResults, setGlobalResults] = useState([]);
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  // Load Initial Data
  useEffect(() => {
    warmUpGeolocation();
    const init = async () => {
      if (!user) return;
      
      // 1. Try to hydrate from LocalStorage first (for volatile progress)
      const savedStart = localStorage.getItem(`onboard_start_${user.id}`);
      if (savedStart) {
        try { setStartForm(JSON.parse(savedStart)); } catch(e){}
      }

      const savedSurvey = localStorage.getItem(`onboard_survey_${user.id}`);
      if (savedSurvey) {
        try {
          const parsed = JSON.parse(savedSurvey);
          setSurveyForm(parsed.form);
          setSelectedClient(parsed.client);
          setShowSurveyDialog(true);
        } catch(e){}
      }

      // 2. Load DB Data (Session ID from URL has priority over active session)
      const targetSessionId = sessionId;
      let session = null;

      if (targetSessionId) {
        session = await getSupervisionData(targetSessionId);
      } else {
        // Only look for active if no specific session is requested
        const active = await getActiveSupervision(user.id);
        if (active) {
          session = await getSupervisionData(active.id);
        }
      }

      if (session) {
        setActiveSessionId(session.id);
        setSessionData(session);
        setStartForm({
          route_name: session.route_name || '',
          vendedor_name: session.vendedor_name || '',
          ...session.checklist_data
        });

        if (session.status === 'completed') {
          setCurrentStep(2); // Jump to summary if finished
        } else {
          setCurrentStep(1); // Resume if active
          loadClientsForRoute(session.route_name);
        }
      }

      // Load allowed routes
      setLoadingRoutes(true);
      try {
        const routesResponse = await getAllowedRoutes(user.id);
        const salesRoutes = routesResponse?.sales || [];
        setAvailableRoutes(salesRoutes);
        
        if (salesRoutes.length === 1 && !startForm.route_name) {
          setStartForm(p => ({ ...p, route_name: salesRoutes[0] }));
        }
      } catch (e) {
        console.error("Error loading routes", e);
      } finally {
        setLoadingRoutes(false);
      }
    };
    init();
  }, [user]);

  // Persist Volatile State
  useEffect(() => {
    if (user && currentStep === 0) {
      try {
        localStorage.setItem(`onboard_start_${user.id}`, JSON.stringify(startForm));
      } catch (e) {
        console.warn('Could not save onboard_start to localStorage (quota exceeded?)', e);
      }
    }
  }, [startForm, user, currentStep]);

  useEffect(() => {
    if (user && showSurveyDialog && selectedClient) {
      try {
        localStorage.setItem(`onboard_survey_${user.id}`, JSON.stringify({ form: surveyForm, client: selectedClient }));
      } catch (e) {
        console.warn('Could not save onboard_survey to localStorage (quota exceeded?)', e);
      }
    } else if (user && !showSurveyDialog) {
      try {
        localStorage.removeItem(`onboard_survey_${user.id}`);
      } catch (e) {}
    }
  }, [surveyForm, selectedClient, showSurveyDialog, user]);

  const loadClientsForRoute = async (route) => {
    if (!route) return;
    const clients = await getClients(route);
    setRouteClients(clients || []);
  };

  const handleStartSession = async () => {
    if (!startForm.route_name || !startForm.vendedor_name) {
      toast({ title: 'Campos incompletos', description: 'Por favor selecciona una ruta y nombre del vendedor.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const activeChecks = (onboardCfg?.checklistItems || defaultEvaluationConfig.onboardConfig.checklistItems).filter(i => i.active !== false);
      const dynamicChecklistData = {};
      activeChecks.forEach(item => {
        dynamicChecklistData[item.key] = Boolean(startForm[item.key]);
      });

      const id = await startOnboardSupervision({
        supervisor_id: user.id,
        supervisor_name: user.user_metadata?.full_name || user.email,
        route_name: startForm.route_name,
        vendedor_id: '',
        vendedor_name: startForm.vendedor_name,
        checklist_data: dynamicChecklistData
      });
      
      localStorage.removeItem(`onboard_start_${user.id}`); // Clear local draft on success
      setActiveSessionId(id);
      const data = await getSupervisionData(id);
      setSessionData(data);
      setCurrentStep(1);
      loadClientsForRoute(startForm.route_name);
      toast({ title: 'Sesión iniciada', description: 'Supervisión a bordo iniciada correctamente.' });
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudo iniciar la sesión.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSurvey = async (client) => {
    // ROBUST GEOLOCATION DETECTION
    const toNum = (v) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    
    const lat = toNum(client.lat || client.latitud || client.latitude || 0);
    const lng = toNum(client.lng || client.longitud || client.longitude || 0);
    
    // Check if coords JSON exists as fallback
    let finalLat = lat;
    let finalLng = lng;
    
    if (finalLat === 0 && client.coords) {
        try {
            const c = typeof client.coords === 'string' ? JSON.parse(client.coords) : client.coords;
            finalLat = toNum(c.lat || c[0] || 0);
            finalLng = toNum(c.lng || c[1] || 0);
        } catch(e){}
    }

    const hasValidCoords = finalLat !== 0 && finalLng !== 0;

    // Normalizamos el objeto client para que el resto de la app vea lat/lng correctamente
    client = { ...client, lat: finalLat, lng: finalLng };

    if (!hasValidCoords) {
      setIsCapturingLocation(true);
      try {
        const pos = await getOptionalPositionFast(6000);
        if (pos) {
          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          await updateClient(client.id, {
            lat: coords.lat,
            lng: coords.lng,
            latitude: coords.lat,
            longitude: coords.lng,
            coords: JSON.stringify(coords),
          });
          setRouteClients((prev) =>
            prev.map((c) => (c.id === client.id ? { ...c, lat: coords.lat, lng: coords.lng } : c))
          );
          toast({ title: 'Ubicación actualizada', description: 'Coordenadas guardadas correctamente.' });
          client = { ...client, lat: coords.lat, lng: coords.lng, coords: JSON.stringify(coords) };
        } else {
          toast({
            title: 'GPS omitido (6s)',
            description: 'No se detectó señal GPS. Puedes evaluar al cliente sin bloquear la supervisión.',
          });
        }
      } catch (e) {
        console.warn('GPS omitido en supervisión a bordo:', e);
      } finally {
        setIsCapturingLocation(false);
      }
    }

    const existingVisit = (sessionData?.visits || []).find((v) => v.client_id === client.id);
    const activeSteps = (onboardCfg?.visitSteps || defaultEvaluationConfig.onboardConfig.visitSteps).filter(s => s.active !== false);
    const defaultStepsState = {};
    activeSteps.forEach((s) => {
      defaultStepsState[s.key] = existingVisit?.survey_data?.[s.key] || 'no';
    });

    const routing = onboardCfg?.evaluationRouting || defaultEvaluationConfig.onboardConfig.evaluationRouting;
    const rawType = String(existingVisit?.survey_data?.client_type || client.client_type || client.type || '').trim().toLowerCase();
    const isOxxoClient =
      rawType === 'oxxo' ||
      (routing?.autoDetectOxxo !== false && (
        String(client.cadena || '').toUpperCase().includes('OXXO') ||
        String(client.business_name || client.name || '').toUpperCase().includes('OXXO')
      ));
    const resolvedClientType = isOxxoClient
      ? 'oxxo'
      : (['punto de venta', 'centro de consumo', 'canal moderno', 'oxxo'].includes(rawType) ? rawType : 'punto de venta');

    setSelectedClient(client);
    setCurrentCoolerEvalId(existingVisit?.evaluation_pdv_id || null);
    setSurveyForm({
      greeting: 'no',
      stock_check: 'no',
      negotiation: 'no',
      pop_updated: 'no',
      ...defaultStepsState,
      facade_ok: existingVisit?.survey_data?.facade_ok || 'no',
      has_cooler: existingVisit?.survey_data?.has_cooler || ((client.enfriador === 'SI' || client.has_cooler === 'si') ? 'si' : 'no'),
      frequency: existingVisit?.survey_data?.frequency ?? (Array.isArray(client.visit_days) ? client.visit_days.join(',') : (client.visit_days || client.frequency || '')),
      purchased: existingVisit?.survey_data?.purchased || 'no',
      facade_type: existingVisit?.survey_data?.facade_type || '',
      client_type: resolvedClientType,
      coaching_note: existingVisit?.survey_data?.coaching_note || '',
      evaluation_score: existingVisit?.survey_data?.evaluation_score || null,
      evaluation_type: existingVisit?.survey_data?.evaluation_type || null,
    });
    setShowSurveyDialog(true);
  };

  const getRequiredEvalKind = (formState = surveyForm) => {
    const routing = onboardCfg?.evaluationRouting || defaultEvaluationConfig.onboardConfig.evaluationRouting;
    const ct = String(formState?.client_type || '').toLowerCase();
    if (ct === 'oxxo') {
      return routing?.routeOxxoToEval !== false ? 'oxxo' : null;
    }
    if (ct === 'canal moderno') {
      return routing?.routeModernToEval !== false ? 'modern' : null;
    }
    if (formState?.has_cooler === 'si') {
      return routing?.routeToCoolerEval !== false ? 'pdv' : null;
    }
    return null;
  };

  const handleSaveVisit = async () => {
    if (!surveyForm.client_type) {
      toast({ 
        title: 'Clasificación requerida', 
        description: 'Debes seleccionar el Tipo de Cliente (Canal) antes de guardar.', 
        variant: 'destructive' 
      });
      return;
    }

    const requiredEvalKind = getRequiredEvalKind(surveyForm);
    if (requiredEvalKind && !currentCoolerEvalId) {
      setShowCoolerSurvey(true);
      return;
    }

    setLoading(true);
    try {
      // Update client if type changed or GPS was captured during this session
      const clientUpdates = {};
      if (surveyForm.client_type && surveyForm.client_type !== (selectedClient.client_type || selectedClient.type)) {
        clientUpdates.client_type = surveyForm.client_type;
      }
      
      if (Object.keys(clientUpdates).length > 0) {
        await updateClient(selectedClient.id, clientUpdates);
        // Update local list
        setRouteClients(prev => prev.map(c => 
          c.id === selectedClient.id ? { ...c, ...clientUpdates } : c
        ));
      }

      await addOnboardVisit({
        supervision_id: activeSessionId,
        client_id: selectedClient.id,
        client_name: selectedClient.business_name || selectedClient.name,
        client_code: selectedClient.client_code,
        survey_data: surveyForm,
        evaluation_pdv_id: currentCoolerEvalId
      });

      // Refresh session data
      const data = await getSupervisionData(activeSessionId);
      setSessionData(data);
      
      setShowSurveyDialog(false);
      setSelectedClient(null);
      setCurrentCoolerEvalId(null);
      localStorage.removeItem(`onboard_survey_${user.id}`); // Clear survey draft
      toast({ title: 'Visita guardada', description: 'La información del cliente se registró con éxito.' });
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudo guardar la visita.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSearchGlobal = async () => {
    if (!globalSearchTerm || globalSearchTerm.length < 3) {
      toast({ title: 'Búsqueda corta', description: 'Escribe al menos 3 caracteres.', variant: 'warning' });
      return;
    }
    setIsSearchingGlobal(true);
    try {
      const results = await searchClients(globalSearchTerm);
      setGlobalResults(results || []);
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudo realizar la búsqueda global.', variant: 'destructive' });
    } finally {
      setIsSearchingGlobal(false);
    }
  };

  const handleAddGlobalClient = (client) => {
    // Verificar si ya está en la lista para evitar duplicados
    if (routeClients.some(c => c.id === client.id)) {
      toast({ title: 'Ya existe', description: 'Este cliente ya está en tu lista de trabajo.' });
    } else {
      setRouteClients(prev => [client, ...prev]);
      toast({ title: 'Cliente agregado', description: `${client.business_name || client.name} se añadió a la ruta.` });
    }
    setShowGlobalSearch(false);
    setGlobalResults([]);
    setGlobalSearchTerm('');
  };

  const handleFinishSupervision = async () => {
    if (!sessionData?.visits?.length) {
      toast({ title: 'Sin visitas', description: 'Debes evaluar al menos a un cliente antes de finalizar.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const finalScore = await finishOnboardSupervision(activeSessionId, closingNotes);
      const data = await getSupervisionData(activeSessionId);
      setSessionData(data);
      setCurrentStep(2);
      toast({ title: 'Supervisión finalizada', description: `Puntaje total obtenido: ${Number(finalScore || 0).toFixed(1)}%` });
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudo finalizar la supervisión.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = useMemo(() => {
    if (!searchTerm) return routeClients;
    const lower = searchTerm.toLowerCase();
    return routeClients.filter(c => 
      (c.business_name || '').toLowerCase().includes(lower) ||
      (c.name || '').toLowerCase().includes(lower) ||
      (c.client_code || '').toLowerCase().includes(lower)
    );
  }, [routeClients, searchTerm]);

  const visitedClientIds = useMemo(() => {
    return new Set((sessionData?.visits || []).map(v => v.client_id));
  }, [sessionData]);

  // UI Components
  const ProgressBar = () => (
    <div className="flex justify-between items-center mb-5 px-2">
      {STEPS.map((step, idx) => {
        const Icon = step.icon;
        const isActive = currentStep === idx;
        const isCompleted = currentStep > idx;
        return (
          <div key={step.id} className="flex flex-col items-center flex-1 relative">
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center z-10 transition-all duration-300 ${
              isActive ? 'bg-emerald-500 text-white ring-4 ring-emerald-500/20' : 
              isCompleted ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}>
              {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4 sm:w-5 sm:h-5" />}
            </div>
            <span className={`text-[11px] sm:text-xs mt-1.5 font-medium text-center leading-tight px-1 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`}>
              {step.title}
            </span>
            {idx < STEPS.length - 1 && (
              <div className={`absolute h-0.5 top-4 sm:top-5 left-[50%] w-full z-0 ${currentStep > idx ? 'bg-emerald-600' : 'bg-slate-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="w-full max-w-2xl mx-auto text-slate-200 pb-10">
      <header className="p-3 sm:p-4 mb-4 rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-xl shrink-0">
            <ClipboardCheck className="text-emerald-500 w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold truncate">Supervisión a Bordo</h1>
            <p className="text-xs text-slate-400 truncate">Evaluación de ejecución y ventas</p>
          </div>
        </div>
      </header>

      {/* Global Geolocation Loader */}
      <AnimatePresence>
        {isCapturingLocation && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <div className="relative">
              <DonutProgress 
                value={100} 
                size={120} 
                strokeWidth={8}
                color="#10b981"
                className="animate-spin-slow opacity-20"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <MapPin className="w-10 h-10 text-emerald-500 animate-pulse" />
              </div>
            </div>
            <h2 className="mt-6 text-xl font-bold text-white">Sincronizando GPS</h2>
            <p className="text-sm text-slate-400 mt-2">Localizando cliente para auditoría...</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full">
        <ProgressBar />

        <AnimatePresence mode="wait">
          {currentStep === 0 && (
            <motion.div
              key="step-start"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4 sm:space-y-6"
            >
              <PremiumCard className="p-4 sm:p-6 bg-slate-900/40 border-white/10">
                <CardHeader className="px-0 pt-0">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Car className="text-emerald-500 w-5 h-5" /> Datos del acompañamiento
                  </CardTitle>
                </CardHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-slate-400">Ruta a supervisar</Label>
                    <Select value={startForm.route_name} onValueChange={(v) => setStartForm(p => ({...p, route_name: v}))}>
                      <SelectTrigger className="bg-slate-800 border-white/5 h-12">
                        <SelectValue placeholder="Selecciona la ruta" />
                      </SelectTrigger>
                      <SelectContent 
                        position="popper" 
                        sideOffset={5} 
                        className="bg-slate-900 border-white/10 text-white max-h-[300px] w-[var(--radix-select-trigger-width)] z-[1001]"
                      >
                        <div className="p-1 space-y-1 overflow-y-auto max-h-[280px] custom-scrollbar">
                          {loadingRoutes ? (
                            <div className="p-3 text-xs text-slate-500 animate-pulse text-center">Cargando rutas...</div>
                          ) : availableRoutes.length > 0 ? (
                            availableRoutes.map(r => (
                              <SelectItem key={r} value={r} className="rounded-lg focus:bg-emerald-500/10 focus:text-emerald-400 cursor-pointer">
                                {r}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="p-3 text-xs text-red-400 text-center">Sin rutas asignadas</div>
                          )}
                        </div>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-xs">Vendedor evaluado</Label>
                    <Input 
                      className="bg-slate-800 border-white/5 h-12" 
                      placeholder="Nombre del vendedor"
                      value={startForm.vendedor_name}
                      onChange={(e) => setStartForm(p => ({...p, vendedor_name: e.target.value}))}
                    />
                  </div>
                </div>
              </PremiumCard>

              <PremiumCard className="p-4 sm:p-6 bg-slate-900/40 border-white/10">
                <CardHeader className="px-0 pt-0">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ClipboardCheck className="text-blue-500 w-5 h-5" /> Checklist de salida
                  </CardTitle>
                </CardHeader>
                <div className="space-y-3">
                  {((onboardCfg?.checklistItems || defaultEvaluationConfig.onboardConfig.checklistItems).filter(i => i.active !== false)).map((item) => (
                    <div key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-white/5">
                      <div className="space-y-0.5 pr-3">
                        <Label className="text-sm font-medium">{item.label}</Label>
                        {item.subtitle && <p className="text-xs text-slate-500">{item.subtitle}</p>}
                      </div>
                      <Checkbox 
                        checked={Boolean(startForm[item.key])}
                        onCheckedChange={(v) => setStartForm(p => ({ ...p, [item.key]: !!v }))}
                        className="w-6 h-6 border-slate-600 data-[state=checked]:bg-emerald-500"
                      />
                    </div>
                  ))}
                </div>
              </PremiumCard>

              <Button 
                onClick={handleStartSession} 
                disabled={loading}
                className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-900/20 gap-2"
              >
                {loading ? 'Iniciando...' : 'Comenzar Supervisión'} <ArrowRight className="w-5 h-5" />
              </Button>
            </motion.div>
          )}

          {currentStep === 1 && (
            <motion.div
              key="step-visits"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 px-4 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-emerald-500 text-xs font-bold uppercase tracking-wider">
                  Ruta: {startForm.route_name}
                </div>
                <div className="text-xs text-slate-400">
                  {sessionData?.visits?.length || 0} visitas registradas
                </div>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-[50%] -translate-y-[50%] text-slate-500 w-5 h-5" />
                  <Input 
                    placeholder="Buscar en esta ruta..."
                    className="bg-slate-900 border-white/10 h-12 pl-11 rounded-xl"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button 
                  onClick={() => setShowGlobalSearch(true)}
                  className="bg-blue-600 hover:bg-blue-500 text-white w-12 h-12 p-0 rounded-xl flex-shrink-0"
                >
                  <Plus className="w-6 h-6" />
                </Button>
              </div>

              <div className="space-y-3 pt-2">
                {filteredClients.length > 0 ? (
                  filteredClients.slice(0, 150).map(client => {
                    const isVisited = visitedClientIds.has(client.id);
                    return (
                      <div 
                        key={client.id}
                        onClick={() => handleOpenSurvey(client)}
                        className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                          isVisited ? 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/15' : 'bg-slate-900/40 border-white/5 active:scale-95 hover:border-white/15'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-sm truncate">{client.business_name || client.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded uppercase font-bold tracking-tighter">
                              {client.client_code}
                            </span>
                            <span className="text-xs text-slate-500 truncate italic">
                              {client.address}
                            </span>
                          </div>
                        </div>
                        {isVisited ? (
                          <div className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full px-2.5 py-1 text-[10px] font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Evaluado (Editar)
                          </div>
                        ) : (
                          <ChevronRight className="text-slate-600 w-5 h-5" />
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 space-y-4">
                    <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto opacity-50">
                      <Search className="w-8 h-8 text-slate-500" />
                    </div>
                    <p className="text-slate-500 text-sm">No se encontraron clientes en esta ruta.</p>
                  </div>
                )}
              </div>

              <div className="sticky bottom-2 z-20 pt-2">
                <Button 
                  onClick={handleFinishSupervision}
                  disabled={loading || !sessionData?.visits?.length}
                  className="w-full h-13 sm:h-14 bg-emerald-500 text-slate-950 font-black rounded-xl shadow-2xl hover:bg-emerald-400"
                >
                  Finalizar Día de Ruta
                </Button>
              </div>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div
              key="step-result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4 sm:space-y-6"
            >
              <PremiumCard className="p-4 sm:p-8 text-center bg-gradient-to-br from-slate-900 to-emerald-900/20 border-emerald-500/20 relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/10 blur-[80px] rounded-full" />
                
                <h2 className="text-xl font-bold mb-6">Puntaje de Supervisión</h2>
                
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    <DonutProgress 
                      value={sessionData?.score || 0} 
                      size={180} 
                      strokeWidth={14}
                      color="#10b981"
                      className="drop-shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-black text-white">{(sessionData?.score || 0).toFixed(1)}%</span>
                      <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Ejecución Total</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 text-left">
                  <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                    <p className="text-[10px] text-slate-400 uppercase font-bold">Checklist Salida</p>
                    <p className="text-lg font-black text-emerald-400">
                      {sessionData?.checklist_data?._score_breakdown?.checkScore ?? '—'} pts
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                    <p className="text-[10px] text-slate-400 uppercase font-bold">Pasos de Venta</p>
                    <p className="text-lg font-black text-cyan-400">
                      {sessionData?.checklist_data?._score_breakdown?.stepsScore ?? '—'} pts
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                    <p className="text-[10px] text-slate-400 uppercase font-bold">Efectividad Compra</p>
                    <p className="text-lg font-black text-amber-400">
                      {sessionData?.checklist_data?._score_breakdown?.purchaseScore ?? (
                        sessionData?.visits?.length > 0 ? 
                          ((sessionData.visits.filter(v => v.survey_data.purchased === 'si').length / sessionData.visits.length) * 100).toFixed(0) + '%' : '0%'
                      )}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                    <p className="text-[10px] text-slate-400 uppercase font-bold">Ejecución PDV</p>
                    <p className="text-lg font-black text-purple-400">
                      {sessionData?.checklist_data?._score_breakdown?.redistributed
                        ? 'Redistribuido'
                        : `${sessionData?.checklist_data?._score_breakdown?.executionScore ?? 0} pts`}
                    </p>
                  </div>
                </div>
              </PremiumCard>

              <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 px-1">
                  Detalle de clientes visitados ({sessionData?.visits?.length || 0})
                </h3>
                {(sessionData?.visits || []).map((visit, i) => (
                  <div key={i} className="p-4 rounded-xl bg-slate-900/40 border border-white/5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-sm">{visit.client_name}</h4>
                        <p className="text-xs text-slate-500">
                          Código: {visit.client_code} · Canal: {visit.survey_data?.client_type || 'PDV'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {visit.survey_data?.purchased === 'si' && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                            <ShoppingBag className="w-3 h-3" /> Compró
                          </span>
                        )}
                        {(visit.evaluation_pdv_id || visit.survey_data?.evaluation_score) && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 text-[10px] font-bold flex items-center gap-1">
                            <ClipboardCheck className="w-3 h-3" /> {visit.survey_data?.evaluation_score ? `${Number(visit.survey_data.evaluation_score).toFixed(0)} pts` : 'Auditado'}
                          </span>
                        )}
                      </div>
                    </div>
                    {visit.survey_data?.coaching_note && (
                      <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
                        💡 Coaching: {visit.survey_data.coaching_note}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  type="button"
                  onClick={() => {
                    const visits = sessionData?.visits || [];
                    const bought = visits.filter(v => v.survey_data?.purchased === 'si').length;
                    const eff = visits.length > 0 ? Math.round((bought / visits.length) * 100) : 0;
                    const lines = [
                      `*RESUMEN SUPERVISIÓN A BORDO - CERVEZAS FINAS*`,
                      `📍 Ruta: *${sessionData?.route_name || startForm.route_name}*`,
                      `👤 Vendedor: *${sessionData?.vendedor_name || startForm.vendedor_name}*`,
                      `🏆 Calificación Total: *${Number(sessionData?.score || 0).toFixed(1)}%*`,
                      `📊 Visitas: *${visits.length}* | Efectividad Compra: *${eff}%* (${bought}/${visits.length})`,
                      ...(sessionData?.checklist_data?._closing_notes ? [`📝 Compromisos: ${sessionData.checklist_data._closing_notes}`] : []),
                    ];
                    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
                  }}
                  className="h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl"
                >
                  Compartir Scorecard por WhatsApp
                </Button>
                <Button 
                  onClick={() => navigate(sessionId ? '/supervisor/onboard-summary' : '/supervisor/dashboard')}
                  className="h-12 bg-slate-800 text-white font-bold rounded-xl"
                >
                  {sessionId ? 'Volver al Historial' : 'Volver al Dashboard'}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Survey Dialog */}
      <Dialog open={showSurveyDialog} onOpenChange={setShowSurveyDialog}>
        <DialogContent className="!flex !flex-col !gap-0 w-[92vw] max-w-[420px] max-h-[86dvh] bg-slate-900 border-white/10 text-white rounded-3xl p-0 overflow-hidden">
          <div className="px-5 pt-5 pb-3 border-b border-white/10 shrink-0 pr-10">
            <DialogHeader className="text-left">
              <DialogTitle className="text-base sm:text-lg font-bold truncate">
                {selectedClient?.business_name || selectedClient?.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Responde los pasos básicos de la visita
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3.5 custom-scrollbar">
            {/* GPS & Canal Section (Priority) */}
            <div className="p-3.5 rounded-2xl bg-slate-800/40 border border-white/5 space-y-3">
              {/* GPS Info */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-cyan-500/10 rounded-lg">
                    <MapPin size={14} className="text-cyan-400" />
                  </div>
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ubicación PDV</Label>
                </div>
                {(selectedClient?.lat && selectedClient?.lng && Number(selectedClient.lat) !== 0) ? (
                  <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 size={10} /> CAPTURADA
                  </span>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 animate-pulse">
                      PENDIENTE
                    </span>
                    <Button 
                      size="xs" 
                      onClick={() => setShowMapPicker(true)}
                      className="h-7 px-2 text-[9px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-1 shadow-lg shadow-emerald-900/40"
                    >
                      <MapIcon size={10} /> MAPA
                    </Button>
                    <Button 
                      size="xs" 
                      onClick={() => handleOpenSurvey(selectedClient)}
                      className="h-7 px-2 text-[9px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl flex items-center gap-1 border border-white/5"
                    >
                      <Crosshair size={10} /> GPS
                    </Button>
                  </div>
                )}
              </div>

              <LocationPickerModal
                open={showMapPicker}
                onClose={() => setShowMapPicker(false)}
                initialLocation={selectedClient?.lat ? { lat: selectedClient.lat, lng: selectedClient.lng } : null}
                onConfirm={async (pos) => {
                    setLoading(true);
                    try {
                        const coords = { lat: pos.lat, lng: pos.lng };
                        await updateClient(selectedClient.id, { 
                            lat: coords.lat, 
                            lng: coords.lng, 
                            coords: JSON.stringify(coords) 
                        });
                        
                        setRouteClients(prev => prev.map(c => 
                          c.id === selectedClient.id ? { ...c, lat: coords.lat, lng: coords.lng } : c
                        ));
                        
                        setSelectedClient(prev => ({ ...prev, lat: coords.lat, lng: coords.lng }));
                        setShowMapPicker(false);
                        toast({ title: 'Ubicación guardada', description: 'Coordenadas manuales actualizadas.' });
                    } catch(e) {
                        toast({ title: 'Error', description: 'No se pudo guardar la ubicación.', variant: 'destructive' });
                    } finally {
                        setLoading(false);
                    }
                }}
              />

              {/* Vertical Client Type Selector */}
              <div className="space-y-2 pt-2 border-t border-white/5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-purple-500/10 rounded-lg">
                    <Target size={14} className="text-purple-400" />
                  </div>
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Clasificación de Canal</Label>
                </div>

                <Select 
                  value={surveyForm.client_type} 
                  onValueChange={(v) => {
                    const prevType = surveyForm.client_type;
                    setSurveyForm(p => ({ ...p, client_type: v }));
                    if (prevType !== v) {
                      setCurrentCoolerEvalId(null);
                    }
                    updateClient(selectedClient.id, { client_type: v });
                    setRouteClients(prev => prev.map(c => 
                      c.id === selectedClient.id ? { ...c, client_type: v } : c
                    ));
                  }}
                >
                  <SelectTrigger className={`h-11 bg-slate-900/70 border-white/10 rounded-xl text-xs font-bold ring-0 focus:ring-0 transition-all ${!surveyForm.client_type ? 'border-rose-500/50 ring-1 ring-rose-500/20 bg-rose-500/5' : ''}`}>
                    <SelectValue placeholder="Selecciona el tipo de negocio" />
                  </SelectTrigger>
                  <SelectContent 
                    position="popper" 
                    sideOffset={5}
                    className="z-[10001] bg-slate-900 border-white/10 text-white max-h-[250px] w-[var(--radix-select-trigger-width)]"
                  >
                    <div className="p-1 space-y-1">
                      <SelectItem value="punto de venta" className="rounded-lg focus:bg-purple-500/10 focus:text-purple-400 font-medium">🛒 Punto de Venta</SelectItem>
                      <SelectItem value="centro de consumo" className="rounded-lg focus:bg-purple-500/10 focus:text-purple-400 font-medium">🏮 Centro de Consumo</SelectItem>
                      <SelectItem value="oxxo" className="rounded-lg focus:bg-amber-500/10 focus:text-amber-400 font-medium">🏪 OXXO</SelectItem>
                      <SelectItem value="canal moderno" className="rounded-lg focus:bg-purple-500/10 focus:text-purple-400 font-medium">🏢 Canal Moderno</SelectItem>
                    </div>
                  </SelectContent>
                </Select>

                {!surveyForm.client_type && (
                  <p className="text-[9px] text-rose-400 font-bold animate-pulse flex items-center gap-1 mt-1 justify-center bg-rose-500/10 p-2 rounded-xl">
                    <AlertTriangle size={10} /> CLASIFICACIÓN OBLIGATORIA
                  </p>
                )}
              </div>
            </div>

              <div className="space-y-3">
                {[
                  ...((onboardCfg?.visitSteps || defaultEvaluationConfig.onboardConfig.visitSteps)
                    .filter((s) => s.active !== false)
                    .map((s) => ({ label: s.label, key: s.key, icon: MessageSquare, color: 'blue' }))),
                  { label: '¿Tiene Fachada?', key: 'facade_ok', icon: Car, color: 'indigo' },
                  { label: '¿Realizó compra?', key: 'purchased', icon: ShoppingBag, color: 'emerald', highlight: true }
                ].map((item) => (
                  <div key={item.key} className={`flex flex-col gap-2 p-3 rounded-2xl border transition-all ${item.highlight ? 'border-emerald-500/30 bg-emerald-500/5' : 'bg-white/5 border-white/5'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 bg-${item.color}-500/10 rounded-xl`}>
                        <item.icon className={`w-4 h-4 text-${item.color}-400`} />
                      </div>
                      <Label className="font-bold text-sm">{item.label}</Label>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <Button 
                        variant={surveyForm[item.key] === 'si' ? 'default' : 'outline'}
                        onClick={() => setSurveyForm(p => ({...p, [item.key]: 'si'}))}
                        className={`h-10 rounded-xl font-bold transition-all ${surveyForm[item.key] === 'si' ? 'bg-emerald-600 shadow-lg shadow-emerald-900/20' : 'border-white/10 opacity-60'}`}
                      >
                        SÍ
                      </Button>
                      <Button 
                        variant={surveyForm[item.key] === 'no' ? 'default' : 'outline'}
                        onClick={() => setSurveyForm(p => ({...p, [item.key]: 'no'}))}
                        className={`h-10 rounded-xl font-bold transition-all ${surveyForm[item.key] === 'no' ? 'bg-slate-700' : 'border-white/10 opacity-60'}`}
                      >
                        NO
                      </Button>
                    </div>
                    
                    {/* Conditionally show Facade Type Selection */}
                    {item.key === 'facade_ok' && surveyForm.facade_ok === 'si' && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-3 space-y-2"
                      >
                        <Label className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] ml-1">Tipo de Fachada</Label>
                        <div className="grid grid-cols-2 gap-2">
                           {['BÁSICA', 'HIGH'].map(type => (
                             <Button 
                                key={type}
                                variant={surveyForm.facade_type === type ? 'default' : 'outline'}
                                onClick={() => setSurveyForm(p => ({...p, facade_type: type}))}
                                className={`h-9 rounded-xl text-[10px] font-bold transition-all ${surveyForm.facade_type === type ? 'bg-indigo-600 shadow-lg shadow-indigo-900/20 text-white' : 'border-white/5 opacity-50'}`}
                             >
                               {type}
                             </Button>
                           ))}
                        </div>
                      </motion.div>
                    )}
                  </div>
                ))}

                {/* Visit Days Selection */}
                <div className="space-y-3 pt-2 border-t border-white/5">
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Frecuencia de Visita</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'L', value: 'Lunes' },
                      { label: 'M', value: 'Martes' },
                      { label: 'Mi', value: 'Miércoles' },
                      { label: 'J', value: 'Jueves' },
                      { label: 'V', value: 'Viernes' },
                      { label: 'S', value: 'Sábado' },
                      { label: 'D', value: 'Domingo' }
                    ].map(day => {
                      const days = surveyForm.frequency ? surveyForm.frequency.split(',') : [];
                      const isSelected = days.includes(day.value);
                      
                      return (
                        <Button
                          key={day.value}
                          type="button"
                          variant={isSelected ? 'default' : 'outline'}
                          className={`h-9 w-9 rounded-full text-[10px] font-bold p-0 transition-all ${isSelected ? 'bg-cyan-600 shadow-lg shadow-cyan-900/20 text-white border-cyan-500' : 'border-white/5 opacity-50 bg-slate-900'}`}
                          onClick={() => {
                            let newDays = [...days];
                            if (isSelected) {
                              newDays = newDays.filter(d => d !== day.value);
                            } else {
                              newDays.push(day.value);
                            }
                            setSurveyForm(p => ({ ...p, frequency: newDays.join(',') }));
                          }}
                        >
                          {day.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5 mt-2">
                  {surveyForm.client_type === 'oxxo' || surveyForm.client_type === 'canal moderno' ? (
                    <div className={`p-3.5 rounded-2xl border space-y-2 ${surveyForm.client_type === 'oxxo' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-purple-500/10 border-purple-500/30'}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-black uppercase tracking-wider ${surveyForm.client_type === 'oxxo' ? 'text-amber-300' : 'text-purple-300'}`}>
                          {surveyForm.client_type === 'oxxo' ? '🏪 Nueva Evaluación OXXO' : '🏢 Evaluación Canal Moderno'}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-white/10 text-white">
                          {getRequiredEvalKind(surveyForm) ? 'AUTOMÁTICA' : 'OPCIONAL'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-snug">
                        {surveyForm.client_type === 'oxxo'
                          ? 'Al continuar se abrirá la Nueva Evaluación de OXXO y al guardarla regresarás a esta ventana para cerrar la visita.'
                          : 'Al continuar se abrirá la Evaluación de Canal Moderno y al guardarla regresarás a esta ventana para cerrar la visita.'}
                      </p>
                      {currentCoolerEvalId && (
                        <div className="mt-2 flex items-center justify-between gap-2 p-2 px-3 bg-emerald-500/15 text-emerald-300 text-[10px] font-bold rounded-xl border border-emerald-500/30">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            AUDITORÍA {surveyForm.client_type === 'oxxo' ? 'OXXO' : 'CANAL MODERNO'} COMPLETADA
                            {surveyForm.evaluation_score != null ? ` (${Number(surveyForm.evaluation_score).toFixed(1)} pts)` : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowCoolerSurvey(true)}
                            className="underline text-emerald-200 hover:text-white"
                          >
                            Ver / Editar
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">¿Tiene Enfriador?</Label>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${surveyForm.has_cooler === 'si' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                          {surveyForm.has_cooler === 'si' ? 'ENVÍA A EVALUACIÓN' : 'OMITIR'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button 
                          variant={surveyForm.has_cooler === 'si' ? 'default' : 'outline'}
                          onClick={() => setSurveyForm(p => ({...p, has_cooler: 'si'}))}
                          className={`h-11 rounded-xl font-bold transition-all ${surveyForm.has_cooler === 'si' ? 'bg-emerald-600 shadow-lg shadow-emerald-900/20' : 'border-white/10 opacity-60'}`}
                        >
                          SÍ
                        </Button>
                        <Button 
                          variant={surveyForm.has_cooler === 'no' ? 'default' : 'outline'}
                          onClick={() => {
                            setSurveyForm(p => ({...p, has_cooler: 'no'}));
                            setCurrentCoolerEvalId(null);
                          }}
                          className={`h-11 rounded-xl font-bold transition-all ${surveyForm.has_cooler === 'no' ? 'bg-slate-700' : 'border-white/10 opacity-60'}`}
                        >
                          NO
                        </Button>
                      </div>
                      {surveyForm.has_cooler === 'si' && currentCoolerEvalId && (
                        <div className="mt-3 flex items-center justify-between gap-2 p-2 px-3 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-lg border border-emerald-500/20">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3" /> AUDITORÍA ENFRIADOR COMPLETADA {surveyForm.evaluation_score != null ? `(${Number(surveyForm.evaluation_score).toFixed(1)} pts)` : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowCoolerSurvey(true)}
                            className="underline text-emerald-300 hover:text-white"
                          >
                            Ver / Editar
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Observaciones / Coaching en este PDV */}
                <div className="pt-2 border-t border-white/5 space-y-1.5">
                  <Label className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                    Nota de Coaching / Observación en PDV (Opcional)
                  </Label>
                  <Input
                    value={surveyForm.coaching_note || ''}
                    onChange={(e) => setSurveyForm((p) => ({ ...p, coaching_note: e.target.value }))}
                    placeholder="Ej. Faltó ofrecer paquete Chidas o rotar enfriador..."
                    className="bg-slate-950 border-white/10 text-white text-xs h-10 rounded-xl"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950/90 border-t border-white/10 shrink-0">
              <Button 
                className={`w-full h-12 sm:h-13 font-bold rounded-2xl shadow-lg gap-2 transition-all ${!surveyForm.client_type ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-50' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'}`}
                onClick={handleSaveVisit}
                disabled={loading || !surveyForm.client_type}
              >
                {getRequiredEvalKind(surveyForm) && !currentCoolerEvalId ? (
                  <>
                    {surveyForm.client_type === 'oxxo'
                      ? 'Ir a Evaluación OXXO'
                      : surveyForm.client_type === 'canal moderno'
                        ? 'Ir a Evaluación Canal Moderno'
                        : 'Ir a Evaluación de Enfriador'}{' '}
                    <ChevronRight className="w-5 h-5" />
                  </>
                ) : (
                  <>Guardar y Cerrar Visita <Save className="w-5 h-5" /></>
                )}
              </Button>
              {!surveyForm.client_type && (
                <p className="text-center text-[10px] text-rose-400 font-bold mt-2 uppercase tracking-tighter">
                  Falta Clasificación de Canal
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>

      {/* Cooler / OXXO / Canal Moderno Survey Full Modal */}
      <Dialog open={showCoolerSurvey} onOpenChange={setShowCoolerSurvey}>
        <DialogContent className="!fixed !inset-0 !left-0 !top-0 !translate-x-0 !translate-y-0 !w-screen !h-[100dvh] !max-w-none !rounded-none !p-0 !m-0 !gap-0 bg-slate-100 dark:bg-slate-900 border-none overflow-hidden !flex !flex-col">
          <div className="flex-1 overflow-y-auto">
            {surveyForm.client_type === 'oxxo' ? (
              <CanalModernoPage
                evalMode="oxxo"
                embeddedClient={selectedClient}
                hideRedirect={true}
                onComplete={(evalData) => {
                  setCurrentCoolerEvalId(evalData.id);
                  setSurveyForm((p) => ({
                    ...p,
                    evaluation_score: evalData.score ?? evalData.puntaje_total ?? null,
                    evaluation_type: 'OXXO',
                  }));
                  setShowCoolerSurvey(false);
                  toast({
                    title: '✅ Evaluación OXXO registrada',
                    description: `Puntaje: ${Number(evalData.score || 0).toFixed(1)} pts. Ahora puedes cerrar la visita.`,
                  });
                }}
              />
            ) : surveyForm.client_type === 'canal moderno' ? (
              <CanalModernoPage
                evalMode="modern"
                embeddedClient={selectedClient}
                hideRedirect={true}
                onComplete={(evalData) => {
                  setCurrentCoolerEvalId(evalData.id);
                  setSurveyForm((p) => ({
                    ...p,
                    evaluation_score: evalData.score ?? evalData.puntaje_total ?? null,
                    evaluation_type: 'CANAL MODERNO',
                  }));
                  setShowCoolerSurvey(false);
                  toast({
                    title: '✅ Evaluación Canal Moderno registrada',
                    description: `Puntaje: ${Number(evalData.score || 0).toFixed(1)} pts. Ahora puedes cerrar la visita.`,
                  });
                }}
              />
            ) : (
              <NuevaEvaluacion 
                clientId={selectedClient?.id}
                embeddedClient={selectedClient}
                routeName={startForm.route_name}
                hideRedirect={true}
                onComplete={(evalData) => {
                  setCurrentCoolerEvalId(evalData.id);
                  setSurveyForm((p) => ({
                    ...p,
                    evaluation_score: evalData.puntaje_total ?? evalData.score ?? null,
                    evaluation_type: 'PDV',
                  }));
                  setShowCoolerSurvey(false);
                  toast({
                    title: '✅ Evaluación de Enfriador registrada',
                    description: 'Ahora puedes guardar y cerrar la visita del cliente.',
                  });
                }}
              />
            )}
          </div>
          <Button 
            variant="ghost" 
            className="absolute top-4 right-4 text-slate-500 z-[100]"
            onClick={() => setShowCoolerSurvey(false)}
          >
            <XCircle className="w-8 h-8" />
          </Button>
        </DialogContent>
      </Dialog>

      {/* Global Search Dialog */}
      <Dialog open={showGlobalSearch} onOpenChange={setShowGlobalSearch}>
        <DialogContent className="w-[92vw] max-w-[400px] bg-slate-900 border-white/10 text-white rounded-3xl p-5 overflow-hidden">
          <DialogHeader>
            <DialogTitle>Agregar Cliente Extra</DialogTitle>
            <DialogDescription className="text-slate-400">
              Busca en toda la base de datos de Cervezas Finas
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="flex gap-2">
              <Input 
                placeholder="Nombre o código..."
                value={globalSearchTerm}
                onChange={e => setGlobalSearchTerm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearchGlobal()}
                className="bg-slate-800 border-white/5 h-12 rounded-xl"
              />
              <Button 
                onClick={handleSearchGlobal} 
                disabled={isSearchingGlobal}
                className="h-12 w-12 bg-blue-600 hover:bg-blue-500 rounded-xl"
              >
                {isSearchingGlobal ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-2 custom-scrollbar pr-1">
              {globalResults.map(client => (
                <div 
                  key={client.id}
                  onClick={() => handleAddGlobalClient(client)}
                  className="p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-emerald-500/50 cursor-pointer transition-all active:scale-95"
                >
                  <p className="text-sm font-bold truncate text-emerald-400">{client.business_name || client.name}</p>
                  <p className="text-[10px] text-slate-500 mt-1 font-medium">
                    <span className="text-slate-400">Cód:</span> {client.client_code} | <span className="text-slate-400">Ruta:</span> {client.sales_route}
                  </p>
                </div>
              ))}
              {globalResults.length === 0 && !isSearchingGlobal && globalSearchTerm.length >= 3 && (
                <div className="text-center py-8">
                  <AlertTriangle className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">No se encontraron clientes.</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

const PremiumCard = ({ children, className = "", ...props }) => (
  <motion.div
    whileHover={{ y: -2 }}
    className={`rounded-3xl border shadow-2xl ${className}`}
    {...props}
  >
    {children}
  </motion.div>
);
