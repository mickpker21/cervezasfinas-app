import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { 
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import { 
    PlusCircle, 
    Trash2, 
    Camera, 
    Type, 
    Loader2, 
    AlertCircle, 
    Search, 
    ChevronRight, 
    Package, 
    Truck, 
    RotateCcw,
    X,
    CheckCircle2,
    Calendar,
    MapPin,
    ArrowRightLeft,
    Plus,
    RefreshCw,
    Info,
    FileCheck,
    FileText,
    Navigation,
    Map as MapIcon,
    Box,
    TrendingUp
} from 'lucide-react';
import LocationPickerModal from '@/components/common/LocationPickerModal';
import { getCurrentPositionSafe } from '../../lib/geolocation';
import SmartBarcodeScanner from '../../components/SmartBarcodeScanner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getClients } from '@/repositories/clientsRepository';
import { getAssetTypes, getOrders, createOrder as createOrderRepo, searchAsset, getAssets } from '@/repositories/ordersRepository';
import { motion, AnimatePresence } from 'framer-motion';
import { fileToBase64 } from '@/lib/fileUtils';

// Persistent session cache
let cachedClients = null;
let cachedAssetTypes = null;
let cachedUserOrders = null;
let lastFetchTime = 0;
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

async function get3MonthHtlAverage(client) {
  if (!client) return 0;

  // Extract numeric client code robustly (ignoring UUIDs)
  let code = String(client.client_code || client.cve_cliente || client.clave_cliente || client.code || '').trim();
  if (code.includes('-') && code.length > 20) {
    code = '';
  }

  // If code is missing, try fetching full client record
  if (!code && client.id) {
    try {
      const { getClientById } = await import('@/repositories/clientsRepository');
      const full = await getClientById(client.id);
      if (full) {
        code = String(full.client_code || full.cve_cliente || full.clave_cliente || full.code || '').trim();
        if (code.includes('-') && code.length > 20) code = '';
      }
    } catch (e) {}
  }

  const now = new Date();
  // 1st day of 3 completed months ago
  const startMonth = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const fromStr = startMonth.toISOString().split('T')[0];
  const toStr = now.toISOString().split('T')[0];

  let totalHtl = 0;

  if (code) {
    try {
      const { getSalesBySku } = await import('@/repositories/salesRepository');
      const cleanCode = code.replace(/^0+/, '');
      
      // Query sales history in MySQL/local DB
      let sales = await getSalesBySku({ cve_cliente: code, from: fromStr, to: toStr }).catch(() => []);
      if ((!sales || sales.length === 0) && cleanCode !== code) {
        sales = await getSalesBySku({ cve_cliente: cleanCode, from: fromStr, to: toStr }).catch(() => []);
      }

      if (sales && sales.length > 0) {
        sales.forEach(s => {
          const val = Number(
            s.htls_total ?? s.htls ?? s.hl ?? s.hectolitros ?? s.htl ?? s.volumen ?? s.venta ?? s.cajas_equivalentes ?? 0
          );
          if (val > 0) {
            totalHtl += val;
          } else if (s.cajas) {
            totalHtl += Number(s.cajas) * 0.108;
          }
        });
      }
    } catch (e) {
      console.warn('[get3MonthHtlAverage] Error fetching salesBySku:', e);
    }
  }

  // Fallback 1: Query Supabase direct_sales
  if (totalHtl === 0 && (client.id || code)) {
    try {
      const { supabase } = await import('@/supabaseClient');
      const orFilter = client.id ? `client_id.eq.${client.id}${code ? `,client_id.eq.${code}` : ''}` : `client_id.eq.${code}`;
      const { data: directSales } = await supabase
        .from('direct_sales')
        .select('id, created_at, direct_sales_items(quantity)')
        .or(orFilter)
        .gte('created_at', `${fromStr}T00:00:00`);

      if (directSales && directSales.length > 0) {
        let totalQty = 0;
        directSales.forEach(ds => {
          (ds.direct_sales_items || []).forEach(item => {
            totalQty += Number(item.quantity || 0);
          });
        });
        if (totalQty > 0) {
          totalHtl = totalQty * 0.108;
        }
      }
    } catch (e) {
      console.warn('[get3MonthHtlAverage] Direct sales query fallback error:', e);
    }
  }

  // Fallback 2: client.ritmo if present
  if (totalHtl === 0 && client.ritmo !== undefined && client.ritmo !== null && !isNaN(Number(client.ritmo)) && Number(client.ritmo) > 0) {
    return Number(Number(client.ritmo).toFixed(1));
  }

  if (totalHtl > 0) {
    const avg = (totalHtl / 3).toFixed(1);
    return Number(avg);
  }

  return 0;
}


function PhotoCapture({ label, value, onChange }) {
  const fileRef = useRef();
  const [compressing, setCompressing] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressing(true);
    try {
      const { uploadPhoto: uploadService } = await import('@/lib/uploadService');
      const url = await uploadService(file, 'order-evidences');
      onChange(url);
    } catch (err) {
      console.error('Error procesando evidencia:', err);
    } finally {
      setCompressing(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">{label}</label>
      <div 
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all ${
          value ? 'border-green-500/50 bg-green-500/5' : 'border-gray-800 bg-gray-950/40 hover:border-gray-700'
        }`}
      >
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
        {compressing ? (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-blue-400">
            <Loader2 size={16} className="animate-spin" /> Procesando foto...
          </div>
        ) : value ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={value} alt="Evidencia" className="w-12 h-12 object-cover rounded-xl border border-green-500/30" />
              <span className="text-xs font-bold text-green-400 flex items-center gap-1.5">
                <CheckCircle2 size={14} /> Evidencia Lista
              </span>
            </div>
            <span className="text-[10px] text-gray-500 underline">Cambiar</span>
          </div>
        ) : (
          <div className="py-2 space-y-1">
            <Camera size={20} className="mx-auto text-gray-500" />
            <p className="text-[11px] font-bold text-gray-400">Capturar Evidencia</p>
          </div>
        )}
      </div>
    </div>
  );
}


const ClientSearchInput = ({ placeholder, onClientSelected, selectedClientId, disabled }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedClientId) {
      if (!searchTerm) {
        setLoading(true);
        const fetchClient = async () => {
          try {
            const { getClientById } = await import('@/repositories/clientsRepository');
            const client = await getClientById(selectedClientId);
            if (client) {
              const codeStr = String(client.client_code || client.cve_cliente || client.id || '').trim();
              const rawName = String(client.name || '').trim();
              const bName = String(client.business_name || client.nombre_comercial || client.razon_social || '').trim();
              const isCodeName = !rawName || rawName === codeStr || (!isNaN(Number(rawName)) && Number(rawName) > 100);
              const nameToShow = (isCodeName && bName) ? bName : (rawName || bName || codeStr);
              setSearchTerm(nameToShow);
            }
          } catch (e) {
            console.error('Error fetching client for pre-fill:', e);
          } finally {
            setLoading(false);
          }
        };
        fetchClient();
      }
    } else {
      setSearchTerm('');
    }
  }, [selectedClientId]);

  const handleSearch = async (val) => {
    setSearchTerm(val);
    if (val.length < 3) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const { searchClients } = await import('@/repositories/clientsRepository');
      const data = await searchClients(val);
      setResults(data.slice(0, 10));
      setIsDropdownOpen(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (client) => {
    onClientSelected(client.id);
    const codeStr = String(client.client_code || client.cve_cliente || client.id || '').trim();
    const rawName = String(client.name || '').trim();
    const bName = String(client.business_name || client.nombre_comercial || client.razon_social || '').trim();
    const isCodeName = !rawName || rawName === codeStr || (!isNaN(Number(rawName)) && Number(rawName) > 100);
    const nameToShow = (isCodeName && bName) ? bName : (rawName || bName || codeStr);
    setSearchTerm(nameToShow);
    setIsDropdownOpen(false);
    setResults([]);
  };

  return (
    <div className="relative group">
      <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${isDropdownOpen ? 'text-blue-500' : 'text-gray-500'}`}>
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
      </div>
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={() => setIsDropdownOpen(results.length > 0)}
        onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
        placeholder={placeholder}
        className="w-full bg-gray-950/50 border-2 border-gray-800 rounded-2xl pl-12 pr-4 py-4 text-sm text-white focus:border-blue-500/50 transition-all outline-none placeholder:text-gray-600 disabled:opacity-40"
        autoComplete="off"
        disabled={disabled}
      />
      
      <AnimatePresence>
        {isDropdownOpen && results.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 w-full mt-2 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl max-h-60 overflow-y-auto backdrop-blur-xl"
          >
            {results.map(client => {
              const codeStr = String(client.client_code || client.cve_cliente || client.id || '').trim();
              const rawName = String(client.name || '').trim();
              const bName = String(client.business_name || client.nombre_comercial || client.razon_social || client.nombre_negocio || '').trim();
              const isCodeName = !rawName || rawName === codeStr || (!isNaN(Number(rawName)) && Number(rawName) > 100);
              
              const mainTitle = (isCodeName && bName) ? bName : (rawName || bName || `Cliente #${codeStr}`);
              const subTitle = (bName && bName !== mainTitle) ? `#${codeStr} • ${bName}` : `#${codeStr}`;

              return (
                <div
                  key={client.id}
                  onMouseDown={() => handleSelect(client)}
                  className="px-5 py-3 hover:bg-blue-600/10 cursor-pointer flex items-center justify-between border-b border-gray-800/50 last:border-none group/item"
                >
                  <div>
                     <p className="text-sm font-bold text-gray-200 group-hover/item:text-blue-400">{mainTitle}</p>
                     <p className="text-[10px] text-gray-500 mt-0.5">{subTitle}</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-600 group-hover/item:text-blue-500" />
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const getStatusVariant = (status) => {
  switch (status) {
    case 'PENDIENTE': return 'outline';
    case 'PROCESANDO': return 'secondary';
    case 'COMPLETADA': return 'default';
    case 'CANCELADA': return 'destructive';
    default: return 'outline';
  }
};

const NewInstallationRequest = () => {  const { user } = useSupabaseAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Page state
  const [userOrders, setUserOrders] = useState(cachedUserOrders || []);
  const [availableAssetTypes, setAvailableAssetTypes] = useState(cachedAssetTypes || []);

  // Form state
  const [action, setAction] = useState('INSTALAR');
  const [clientId, setClientId] = useState('');
  const [isClientLocked, setIsClientLocked] = useState(false);
  const [destinationClientId, setDestinationClientId] = useState('');
  const [notes, setNotes] = useState('');
  const [requestedItems, setRequestedItems] = useState([]);
  const [scannedAsset, setScannedAsset] = useState(null);
  const [currentItem, setCurrentItem] = useState({ asset_type: '', quantity: 1, photo_before: '' });
  
  // Documentación Obligatoria
  const [photoIne, setPhotoIne] = useState('');
  const [photoAddress, setPhotoAddress] = useState('');
  const [photoBefore, setPhotoBefore] = useState(''); // Nueva foto del antes
  const [capturedLocation, setCapturedLocation] = useState(null);
  const [clientHasGeo, setClientHasGeo] = useState(true);
  const [currentCoords, setCurrentCoords] = useState(null); // Para mostrar las existentes
  const [isCapturingGeo, setIsCapturingGeo] = useState(false);
  const [isManualGeo, setIsManualGeo] = useState(false); // Modo manual
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [clientAssets, setClientAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  // Client Details & HTL State
  const [selectedClientDetails, setSelectedClientDetails] = useState(null);
  const [clientHtlAvg, setClientHtlAvg] = useState(null);
  const [destinationClientDetails, setDestinationClientDetails] = useState(null);
  const [destClientHtlAvg, setDestClientHtlAvg] = useState(null);

  // UI State
  const [loading, setLoading] = useState(!cachedUserOrders);
  const [submitting, setSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(false);

  const [promptDialog, setPromptDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    fields: [],
    onConfirm: null,
    onCancel: null,
  });

  const requestPrompt = useCallback((title, message, fields) => {
    return new Promise((resolve) => {
      setPromptDialog({
        isOpen: true,
        title,
        message,
        fields,
        onConfirm: (values) => {
          setPromptDialog(prev => ({ ...prev, isOpen: false }));
          resolve(values);
        },
        onCancel: () => {
          setPromptDialog(prev => ({ ...prev, isOpen: false }));
          resolve(null);
        }
      });
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlClientId = params.get('clientId');
    if (urlClientId) {
      setClientId(urlClientId);
      setIsFormVisible(true);
    }
  }, [location.search]);

  // Check geolocation and assets when client or action changes
  useEffect(() => {
    if (!clientId) {
      setClientHasGeo(true); 
      setCapturedLocation(null);
      setClientAssets([]);
      return;
    }

    const checkGeoAndAssets = async () => {
      try {
        const { getClientById } = await import('@/repositories/clientsRepository');
        const client = await getClientById(clientId);
        setSelectedClientDetails(client);
        
        if (client) {
          get3MonthHtlAverage(client).then(avg => setClientHtlAvg(avg));
        } else {
          setClientHtlAvg(null);
        }

        // ROBUST DETECTION (Matches Clients Page)
        let coords = null;
        try { 
            coords = typeof client?.coords === 'string' ? JSON.parse(client.coords) : client?.coords; 
        } catch (e) { }
        
        const lat = client?.lat || coords?.lat || coords?.[0];
        const lng = client?.lng || coords?.lng || coords?.[1];
        
        const hasGeo = !!(lat && lng && Number(lat) !== 0);
        setClientHasGeo(hasGeo);
        
        if (hasGeo) {
            setCurrentCoords({ lat: Number(lat), lng: Number(lng) });
        } else {
            setCurrentCoords(null);
        }
        setCapturedLocation(null); 
        setIsManualGeo(false);

        // Fetch client assets if action is RETIRAR, MOVER, or CAMBIO_EQUIPO
        if (['RETIRAR', 'MOVER', 'CAMBIO_EQUIPO'].includes(action)) {
            setLoadingAssets(true);
            try {
                const assets = await getAssets({ client_id: clientId });
                setClientAssets(assets || []);
            } catch (e) {
                console.error('Error fetching client assets:', e);
            } finally {
                setLoadingAssets(false);
            }
        }
      } catch (e) {
        console.error('Error checking client info:', e);
      }
    };
    checkGeoAndAssets();
  }, [clientId, action]);

  // Effect for Destination Client Details and HTL Average
  useEffect(() => {
    if (!destinationClientId) {
      setDestinationClientDetails(null);
      setDestClientHtlAvg(null);
      return;
    }
    const fetchDestClient = async () => {
      try {
        const { getClientById } = await import('@/repositories/clientsRepository');
        const destClient = await getClientById(destinationClientId);
        setDestinationClientDetails(destClient);
        if (destClient) {
          get3MonthHtlAverage(destClient).then(avg => setDestClientHtlAvg(avg));
        }
      } catch (e) {
        console.error('Error fetching destination client info:', e);
      }
    };
    fetchDestClient();
  }, [destinationClientId]);


  const fetchData = useCallback(async (force = false) => {
    if (!user) return;

    // Zero-refresh check
    const now = Date.now();
    if (!force && cachedUserOrders && (now - lastFetchTime < CACHE_TTL)) {
        setLoading(false);
        return;
    }

    if (cachedUserOrders) setIsRefreshing(true);
    else setLoading(true);

    try {
      const [typesRes, ordersRes] = await Promise.all([
        getAssetTypes(),
        getOrders(user.id)
      ]);

      cachedAssetTypes = typesRes || [];
      // Deduplicate orders by ID to prevent repeated orders from multiple client rows
      const uniqueOrders = Array.from(new Map((ordersRes || []).map(o => [o.id, o])).values());
      cachedUserOrders = uniqueOrders;
      lastFetchTime = now;

      setAvailableAssetTypes(cachedAssetTypes);
      setUserOrders(cachedUserOrders);

    } catch (error) {
      setError('Error al cargar datos remotos.');
      console.error(error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [user.id]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const resetForm = () => {
    setClientId('');
    setDestinationClientId('');
    setNotes('');
    setRequestedItems([]);
    setScannedAsset(null);
    setIsClientLocked(false);
    setCurrentItem({ asset_type: '', quantity: 1, photo_before: '' });
    setPhotoIne('');
    setPhotoAddress('');
    setPhotoBefore('');
    setCapturedLocation(null);
    setCurrentCoords(null);
    setIsManualGeo(false);
    setManualLat('');
    setManualLng('');
    setError('');
  }

  const handleActionChange = (newAction) => {
    resetForm();
    setAction(newAction);
  }

  const handleAssetSearch = useCallback(async (serialNumber) => {
    if (!serialNumber) return;
    setSubmitting(true);
    setError('');
    try {
      let locationData = await searchAsset(serialNumber);
      if (!locationData) {
          if (['RETIRAR', 'MOVER'].includes(action)) {
              const typeOptions = availableAssetTypes.map(t => ({ value: t, label: t }));
              if (!typeOptions.find(o => o.value === 'ENFRIADOR')) typeOptions.unshift({ value: 'ENFRIADOR', label: 'ENFRIADOR' });
              
              const confirmCreate = await requestPrompt(
                'Equipo no registrado',
                `El equipo con serie ${serialNumber} no existe. ¿Deseas darlo de alta ahora mismo?`,
                [{ name: 'tipo', label: 'Tipo de Equipo', type: 'select', options: typeOptions, defaultValue: 'ENFRIADOR' }]
              );

              if (confirmCreate) {
                  const { createAsset } = await import('@/repositories/ordersRepository');
                  locationData = await createAsset({
                      serial: serialNumber,
                      type: confirmCreate.tipo || 'ENFRIADOR',
                      brand: 'N/A',
                      model: 'Alta en campo',
                      status: 'INSTALADO'
                  }, clientId, true); // isClient = true
              } else {
                  throw new Error(`Activo "${serialNumber}" no encontrado.`);
              }
          } else {
              throw new Error(`Activo "${serialNumber}" no encontrado.`);
          }
      }
      if (['RETIRAR', 'DESINSTALAR'].includes(locationData.action)) throw new Error(`El activo "${serialNumber}" ya fue retirado.`);

      setScannedAsset(locationData);
      
      // If client is already selected and doesn't match, warn or prevent
      if (clientId && locationData.client_id && clientId !== locationData.client_id) {
          setError(`El activo "${serialNumber}" pertenece a otro cliente (${locationData.current_client_name}).`);
          setScannedAsset(null);
          return;
      }

      if (locationData.client_id) {
          setClientId(locationData.client_id);
          setIsClientLocked(true);
      }
      
      // Check if client has geo
      const clients = await getClients();
      const client = clients.find(c => c.id === locationData.client_id);
      setClientHasGeo(!!(client?.lat && client?.lng));
    } catch (err) {
      setError(err.message);
      setScannedAsset(null);
      setClientId('');
      setIsClientLocked(false);
    } finally {
      setSubmitting(false);
      setIsScannerOpen(false);
    }
  }, [clientId, action, availableAssetTypes, requestPrompt]);

  const handleManualAdd = async () => {
    const vals = await requestPrompt(
      'Número de Serie',
      'Ingresa el número de serie del activo:',
      [{ name: 'serial', label: 'Número de Serie', type: 'text', placeholder: 'Ej: 123456' }]
    );
    if (!vals || !vals.serial?.trim()) return;
    const trimmedSerial = vals.serial.trim();

    setSubmitting(true);
    setError('');
    try {
      let locationData = await searchAsset(trimmedSerial);

      if (!locationData) {
        if (['RETIRAR', 'MOVER', 'CAMBIO_EQUIPO'].includes(action)) {
          // El equipo no está en el sistema — ofrecer darlo de alta
          const typeOptions = availableAssetTypes.map(t => ({ value: t, label: t }));
          if (!typeOptions.find(o => o.value === 'ENFRIADOR')) typeOptions.unshift({ value: 'ENFRIADOR', label: 'ENFRIADOR' });

          const typeVals = await requestPrompt(
            'Equipo no registrado',
            `El equipo "${trimmedSerial}" no está en el sistema. Registra el tipo para continuar:`,
            [{ 
              name: 'tipo', 
              label: 'Tipo de Equipo', 
              type: 'select', 
              options: typeOptions,
              defaultValue: 'ENFRIADOR'
            }]
          );
          if (!typeVals) {
            // Usuario canceló
            setError(`Activo "${trimmedSerial}" no encontrado. Alta cancelada.`);
            return;
          }
          const finalType = typeVals.tipo?.trim().toUpperCase() || 'ENFRIADOR';
          const { createAsset } = await import('@/repositories/ordersRepository');
          locationData = await createAsset({
            serial: trimmedSerial,
            type: finalType,
            brand: 'N/A',
            model: 'Alta en campo',
            status: 'INSTALADO'
          }, clientId, true);
          if (!locationData) throw new Error('No se pudo registrar el equipo.');
          // Poblar directamente como activo escaneado
          setScannedAsset({
            asset_id: locationData.asset_id || locationData.id,
            asset_serial: trimmedSerial,
            asset_type: finalType,
            client_id: clientId
          });
          return; // ya está seleccionado, no continuar con el flujo normal
        } else {
          throw new Error(`Activo "${trimmedSerial}" no encontrado.`);
        }
      }

      if (['RETIRAR', 'DESINSTALAR'].includes(locationData.action)) {
        throw new Error(`El activo "${trimmedSerial}" ya fue retirado.`);
      }

      // Si el activo existe y pertenece a otro cliente, avisar
      if (clientId && locationData.client_id && clientId !== locationData.client_id) {
        setError(`El activo "${trimmedSerial}" pertenece a otro cliente (${locationData.current_client_name}).`);
        return;
      }

      setScannedAsset(locationData);
      if (locationData.client_id) {
        setClientId(locationData.client_id);
        setIsClientLocked(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddItem = () => {
    if (!currentItem.asset_type || currentItem.quantity < 1) return;
    if (currentItem.asset_type === 'FACHADA' && !currentItem.photo_before) {
        setError('Por favor, es obligatorio adjuntar una foto del local actual (ANTES) para solicitar una FACHADA.');
        return;
    }
    if (requestedItems.find(item => item.asset_type === currentItem.asset_type)) return;
    
    // Convert to JSON notes if there's a photo, so backend logic handles it if needed
    const notesJson = currentItem.photo_before ? JSON.stringify({ photo_before: currentItem.photo_before }) : null;
    
    setRequestedItems([...requestedItems, { ...currentItem, notes: notesJson }]);
    setCurrentItem({ asset_type: '', quantity: 1, photo_before: '' });
    setError('');
  };

  const handleRemoveItem = (assetType) => {
    setRequestedItems(requestedItems.filter(item => item.asset_type !== assetType));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');

    try {
      if (!clientId) throw new Error('Selecciona un cliente de origen.');
      if (action === 'MOVER' && !destinationClientId) throw new Error('Selecciona un cliente de destino.');
      if (['RETIRAR', 'MOVER'].includes(action) && !scannedAsset) throw new Error('Escanea un activo válido.');
      if (action === 'INSTALAR' && requestedItems.length === 0) throw new Error('Añade al menos un activo.');
      if (action === 'CAMBIO_EQUIPO' && !scannedAsset) throw new Error('Selecciona el equipo a retirar.');
      if (action === 'CAMBIO_EQUIPO' && requestedItems.length === 0) throw new Error('Añade al menos un equipo nuevo a instalar.');
      
      // Validaciones de Documentación (INE y Comprobante opcionales para RETIRAR)
      if (action !== 'RETIRAR') {
        if (!photoIne) throw new Error('El INE es obligatorio.');
        if (!photoAddress) throw new Error('El Comprobante de Domicilio es obligatorio.');
      }
      
      // Geolocalización solo obligatoria para INSTALAR
      if ((action === 'INSTALAR' || action === 'CAMBIO_EQUIPO') && !clientHasGeo && !capturedLocation) {
        throw new Error('La geolocalización del negocio es obligatoria para instalaciones.');
      }

      const finalNotes = {
        user_notes: notes,
        attachments: {
          photo_ine: photoIne,
          photo_address: photoAddress,
          photo_before: photoBefore
        },
        location: capturedLocation || null
      };

      // Get client details for caching
      const { getClientById } = await import('@/repositories/clientsRepository');
      const originClient = await getClientById(clientId);
      const destClient = destinationClientId ? await getClientById(destinationClientId) : null;

      const orderPayload = {
        client_id: clientId,
        notes: JSON.stringify(finalNotes),
        created_by: user.id,
        action,
        destination_client_id: action === 'MOVER' ? destinationClientId : null,
        // Cached fields for MySQL reporting
        client_name_cached: originClient?.name,
        client_address_cached: originClient?.address,
        client_business_name_cached: originClient?.business_name,
        destination_client_name_cached: destClient?.name,
        destination_client_address_cached: destClient?.address,
        destination_client_business_name_cached: destClient?.business_name
      };

      let itemsPayload;
      if (action === 'CAMBIO_EQUIPO') {
        // Dual items: withdrawal item + installation items
        const withdrawalItem = { 
          asset_type: scannedAsset.asset_type || scannedAsset.type, 
          quantity: 1, 
          asset_id: scannedAsset.asset_id || scannedAsset.id,
          asset_serial: scannedAsset.asset_serial || scannedAsset.serial,
          notes: JSON.stringify({ item_action: 'RETIRAR' })
        };
        const installItems = requestedItems.map(item => ({ 
          asset_type: item.asset_type, 
          quantity: item.quantity, 
          notes: JSON.stringify({ item_action: 'INSTALAR', ...(item.notes ? { extra: item.notes } : {}) })
        }));
        itemsPayload = [withdrawalItem, ...installItems];
      } else if (action === 'INSTALAR') {
        itemsPayload = requestedItems.map(item => ({ asset_type: item.asset_type, quantity: item.quantity, notes: item.notes }));
      } else {
        itemsPayload = [{ 
            asset_type: scannedAsset.asset_type || scannedAsset.type, 
            quantity: 1, 
            asset_id: scannedAsset.asset_id || scannedAsset.id,
            asset_serial: scannedAsset.asset_serial || scannedAsset.serial
          }];
      }

      await createOrderRepo(orderPayload, itemsPayload);

      // Si capturamos geo nueva, actualizamos el cliente
      let finalGeo = capturedLocation;
      
      // Fallback: Si no hay geo capturada explícitamente, intentar extraer de las notas
      if (!finalGeo && notes) {
          const geoMatch = notes.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
          if (geoMatch) {
              finalGeo = {
                  lat: parseFloat(geoMatch[1]),
                  lng: parseFloat(geoMatch[2]),
                  source: 'regex_notes'
              };
          }
      }

      if (finalGeo) {
        try {
          const { updateClient } = await import('@/repositories/clientsRepository');
          await updateClient({
            id: clientId,
            lat: finalGeo.lat,
            lng: finalGeo.lng,
            coords: JSON.stringify([finalGeo.lat, finalGeo.lng]),
            synced: 0
          });
          console.log('[NewInstallationRequest] Cliente actualizado con coordenadas:', finalGeo);
        } catch (e) {
          console.error('Error actualizando geo del cliente:', e);
        }
      }

      resetForm();
      setPhotoIne('');
      setPhotoAddress('');
      setPhotoBefore('');
      setCapturedLocation(null);
      setIsFormVisible(false);
      await fetchData();

    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const ActionSelector = () => {
    const options = [
        { id: 'INSTALAR', label: 'Instalar', icon: PlusCircle, color: 'blue' },
        { id: 'RETIRAR', label: 'Retirar', icon: RotateCcw, color: 'red' },
        { id: 'MOVER', label: 'Mover', icon: ArrowRightLeft, color: 'amber' },
        { id: 'CAMBIO_EQUIPO', label: 'Cambio', icon: RefreshCw, color: 'emerald' },
    ];

    return (
        <div className="flex bg-gray-950/50 p-1.5 rounded-3xl border border-gray-800/50 mb-8">
            {options.map(opt => (
                <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleActionChange(opt.id)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${
                        action === opt.id 
                            ? `bg-${opt.color}-600 text-white shadow-lg shadow-${opt.color}-900/40` 
                            : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'
                    }`}
                >
                    <opt.icon size={16} />
                    <span className="hidden sm:inline">{opt.label}</span>
                </button>
            ))}
        </div>
    );
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500 mb-4" />
        <p className="text-gray-500 font-black text-xs uppercase tracking-widest">Sincronizando Módulos...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">

        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
                <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                    <Truck size={14} /> Gestión de Flota
                </p>
                <div className="flex items-center gap-4">
                    <h1 className="text-4xl font-black tracking-tight">Mis Órdenes</h1>
                    <button 
                        onClick={() => fetchData(true)}
                        className={`p-2 rounded-xl transition-all ${isRefreshing ? 'animate-spin text-blue-500' : 'text-gray-500 hover:text-white hover:bg-gray-800'}`}
                        title="Actualizar datos"
                    >
                        <RefreshCw size={20} />
                    </button>
                </div>
            </div>
            <button 
                onClick={() => setIsFormVisible(!isFormVisible)} 
                className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-black text-sm uppercase transition-all active:scale-95 shadow-xl ${
                    isFormVisible 
                        ? 'bg-gray-800 text-white shadow-gray-900/40' 
                        : 'bg-blue-600 text-white shadow-blue-900/40 hover:bg-blue-500'
                }`}
            >
                {isFormVisible ? <X size={18} /> : <Plus size={18} />}
                {isFormVisible ? 'Cerrar Formulario' : 'Nueva Orden'}
            </button>
        </header>

        <CustomPromptDialog prompt={promptDialog} />

        <AnimatePresence mode="wait">
            {isFormVisible && (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-gray-900/40 border border-gray-800/50 p-6 sm:p-8 rounded-[2.5rem] shadow-2xl backdrop-blur-xl relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 blur-[100px] pointer-events-none"></div>

                        <h2 className="text-2xl font-black mb-4 text-center bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent italic">
                            Nueva Solicitud de Movimiento
                        </h2>

                        <div className="mb-8 flex items-start gap-3 p-4 bg-blue-600/10 border border-blue-600/20 rounded-2xl">
                            <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-200 leading-relaxed">
                                <span className="font-bold text-blue-400 block mb-1 uppercase tracking-widest text-[10px]">Módulo de Equipos</span>
                                Utiliza este formulario para solicitar <span className="text-white font-bold">instalaciones, retiros o movimientos</span> físicos de activos. Para reportar fallas técnicas de enfriadores, utiliza el módulo de <span className="font-bold underline">Tickets</span>.
                            </p>
                        </div>

                    <form onSubmit={handleSubmit} className="space-y-8">
                        <ActionSelector />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest ml-1">
                                    {action === 'MOVER' ? 'Cliente Origen' : 'Cliente Solicitante'}
                                </label>
                                <ClientSearchInput 
                                    selectedClientId={clientId} 
                                    onClientSelected={setClientId} 
                                    placeholder="Nombre o código del cliente..." 
                                    disabled={isClientLocked} 
                                />

                                {selectedClientDetails && (
                                    <motion.div 
                                        initial={{ opacity: 0, y: -5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="mt-2.5 p-3.5 rounded-2xl bg-gradient-to-r from-blue-950/60 to-indigo-950/60 border border-blue-500/30 flex items-center justify-between shadow-lg shadow-blue-950/30"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/30">
                                                <TrendingUp size={18} />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">PROM 3 MESES</p>
                                                <p className="text-sm font-black text-white">
                                                    {clientHtlAvg !== null ? `${clientHtlAvg} HTL` : 'Calculando...'}
                                                </p>
                                            </div>
                                        </div>
                                        {selectedClientDetails.business_name && (
                                            <span className="text-[10px] font-bold text-gray-400 bg-gray-900/80 px-2.5 py-1 rounded-lg border border-gray-800">
                                                {selectedClientDetails.business_name}
                                            </span>
                                        )}
                                    </motion.div>
                                )}
                            </div>

                            <AnimatePresence>
                                {action === 'MOVER' && (
                                    <motion.div 
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        className="space-y-2"
                                    >
                                        <label className="text-[10px] font-black uppercase text-blue-500 tracking-widest ml-1">Cliente Destino</label>
                                        <ClientSearchInput 
                                            selectedClientId={destinationClientId} 
                                            onClientSelected={setDestinationClientId} 
                                            placeholder="¿A dónde se mueve...?" 
                                        />

                                        {destinationClientDetails && (
                                            <motion.div 
                                                initial={{ opacity: 0, y: -5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="mt-2.5 p-3.5 rounded-2xl bg-gradient-to-r from-blue-950/60 to-indigo-950/60 border border-blue-500/30 flex items-center justify-between shadow-lg shadow-blue-950/30"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/30">
                                                        <TrendingUp size={18} />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">PROM 3 MESES</p>
                                                        <p className="text-sm font-black text-white">
                                                            {destClientHtlAvg !== null ? `${destClientHtlAvg} HTL` : 'Calculando...'}
                                                        </p>
                                                    </div>
                                                </div>
                                                {destinationClientDetails.business_name && (
                                                    <span className="text-[10px] font-bold text-gray-400 bg-gray-900/80 px-2.5 py-1 rounded-lg border border-gray-800">
                                                        {destinationClientDetails.business_name}
                                                    </span>
                                                )}
                                            </motion.div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* --- SECCIÓN DE GEOLOCALIZACIÓN --- */}
                        {clientId && (action === 'INSTALAR' || action === 'CAMBIO_EQUIPO') && (
                            <div className="bg-gray-950/40 p-6 rounded-[2.5rem] border border-gray-800/50 space-y-4">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-3 rounded-2xl ${clientHasGeo || capturedLocation ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                            <MapPin size={20} />
                                        </div>
                                        <div>
                                            <p className="text-xs font-black uppercase tracking-widest">Geolocalización del Negocio</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">
                                                {clientHasGeo 
                                                    ? `Ubicación registrada: ${currentCoords?.lat.toFixed(4)}, ${currentCoords?.lng.toFixed(4)}` 
                                                    : (capturedLocation 
                                                        ? `Ubicación capturada: ${capturedLocation.lat.toFixed(4)}, ${capturedLocation.lng.toFixed(4)}` 
                                                        : 'Falta ubicación. Es obligatorio capturarla.')}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    {!clientHasGeo && !capturedLocation && (
                                        <div className="flex gap-2 w-full sm:w-auto">
                                            <Button
                                                type="button"
                                                onClick={async () => {
                                                    setIsCapturingGeo(true);
                                                    setIsManualGeo(false);
                                                    try {
                                                        const pos = await getCurrentPositionSafe();
                                                        setCapturedLocation({
                                                            lat: pos.coords.latitude,
                                                            lng: pos.coords.longitude,
                                                            timestamp: new Date().toISOString()
                                                        });
                                                    } catch (e) {
                                                        setError('No se pudo obtener la ubicación. Activa el GPS o usa el modo manual.');
                                                    } finally {
                                                        setIsCapturingGeo(false);
                                                    }
                                                }}
                                                disabled={isCapturingGeo}
                                                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2"
                                            >
                                                {isCapturingGeo ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
                                                Auto GPS
                                            </Button>
                                            <Button
                                                type="button"
                                                onClick={() => setShowMapPicker(true)}
                                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2"
                                            >
                                                <MapIcon size={14} />
                                                Mapa
                                            </Button>
                                            <Button
                                                type="button"
                                                onClick={() => setIsManualGeo(!isManualGeo)}
                                                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2"
                                            >
                                                <Type size={14} />
                                                Manual
                                            </Button>
                                        </div>
                                    )}
                                    
                                    {(clientHasGeo || capturedLocation) && (
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-2 text-green-400 bg-green-500/10 px-4 py-2 rounded-xl border border-green-500/20">
                                                <CheckCircle2 size={14} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Verificado</span>
                                            </div>
                                            {!clientHasGeo && (
                                                <Button 
                                                    type="button" 
                                                    onClick={() => setCapturedLocation(null)}
                                                    className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                                                >
                                                    <X size={16} />
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <LocationPickerModal 
                                    open={showMapPicker}
                                    onClose={() => setShowMapPicker(false)}
                                    initialLocation={capturedLocation || currentCoords}
                                    onConfirm={(pos) => {
                                        setCapturedLocation({
                                            lat: pos.lat,
                                            lng: pos.lng,
                                            timestamp: new Date().toISOString(),
                                            source: 'map'
                                        });
                                        setShowMapPicker(false);
                                    }}
                                />

                                {isManualGeo && !capturedLocation && (
                                    <motion.div 
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-800/50"
                                    >
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold text-gray-500 uppercase ml-1">Latitud</label>
                                            <input 
                                                type="number" 
                                                step="any"
                                                placeholder="Ej: 19.4326"
                                                value={manualLat}
                                                onChange={e => setManualLat(e.target.value)}
                                                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-xs focus:border-blue-500 outline-none"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold text-gray-500 uppercase ml-1">Longitud</label>
                                            <input 
                                                type="number" 
                                                step="any"
                                                placeholder="Ej: -99.1332"
                                                value={manualLng}
                                                onChange={e => setManualLng(e.target.value)}
                                                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-xs focus:border-blue-500 outline-none"
                                            />
                                        </div>
                                        <Button 
                                            type="button"
                                            onClick={() => {
                                                if (!manualLat || !manualLng) return;
                                                setCapturedLocation({
                                                    lat: parseFloat(manualLat),
                                                    lng: parseFloat(manualLng),
                                                    timestamp: new Date().toISOString(),
                                                    is_manual: true
                                                });
                                            }}
                                            className="col-span-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/20 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest"
                                        >
                                            Confirmar Coordenadas Manuales
                                        </Button>
                                    </motion.div>
                                )}
                            </div>
                        )}

                        {/* --- SECCIÓN DE DOCUMENTACIÓN --- */}
                        {action !== 'RETIRAR' && (
                            <section className="bg-gray-950/40 p-6 rounded-[2.5rem] border border-gray-800/50 space-y-6">
                                <h3 className="text-lg font-black flex items-center gap-3">
                                    <div className="w-1.5 h-6 bg-blue-600 rounded-full"></div>
                                    Documentación Obligatoria {action === 'MOVER' && <span className="text-blue-400 text-xs">(Nuevo Negocio)</span>}
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-blue-400">
                                            <FileCheck size={16} />
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Foto de INE {action !== 'RETIRAR' && '*'}</span>
                                        </div>
                                        <PhotoCapture 
                                            label={action === 'MOVER' ? "INE del Nuevo Negocio" : "Capturar INE"} 
                                            value={photoIne} 
                                            onChange={setPhotoIne} 
                                        />
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-blue-400">
                                            <FileText size={16} />
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Comprobante de Domicilio {action !== 'RETIRAR' && '*'}</span>
                                        </div>
                                        <PhotoCapture 
                                            label={action === 'MOVER' ? "Comprobante Nuevo Domicilio" : "Capturar Comprobante"} 
                                            value={photoAddress} 
                                            onChange={setPhotoAddress} 
                                        />
                                    </div>
                                    {action === 'INSTALAR' && (
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 text-amber-400">
                                                <Camera size={16} />
                                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Foto del Antes</span>
                                            </div>
                                            <PhotoCapture 
                                                label="Evidencia Antes de Instalar" 
                                                value={photoBefore} 
                                                onChange={setPhotoBefore} 
                                            />
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}

                        {action === 'CAMBIO_EQUIPO' ? (
                            /* ======= CAMBIO DE EQUIPO: DUAL SECTION ======= */
                            <section className="space-y-6">
                                {/* PART 1: Equipo a Retirar */}
                                <div className="bg-gray-950/60 p-6 rounded-3xl border border-red-800/30 space-y-6">
                                    <h3 className="text-lg font-black flex items-center gap-3">
                                        <div className="w-1.5 h-6 bg-red-600 rounded-full"></div>
                                        <RotateCcw size={18} className="text-red-400" />
                                        Equipo a Retirar
                                    </h3>

                                    {scannedAsset ? (
                                        <motion.div 
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="bg-red-600/10 border border-red-600/30 p-5 rounded-2xl relative"
                                        >
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-[9px] uppercase font-black text-red-500">Serie a Retirar</p>
                                                    <p className="text-xl font-mono font-black text-white">{scannedAsset.asset_serial}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] uppercase font-black text-red-500">Tipo</p>
                                                    <p className="text-sm font-bold text-gray-200">{scannedAsset.asset_type}</p>
                                                </div>
                                            </div>
                                            <button 
                                                type="button" 
                                                className="absolute top-4 right-4 p-2 text-red-400 hover:bg-red-500/10 rounded-xl"
                                                onClick={() => { setScannedAsset(null); setIsClientLocked(false); }}
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </motion.div>
                                    ) : (
                                        <div className="space-y-4">
                                            {clientId && (
                                                <div className="space-y-4">
                                                    <h4 className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Equipos instalados en el local</h4>
                                                    {loadingAssets && <Loader2 size={12} className="animate-spin text-red-500" />}
                                                    {clientAssets.length > 0 ? (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                            {clientAssets.map(asset => (
                                                                <button
                                                                    key={asset.serial}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setScannedAsset({
                                                                            asset_id: asset.id,
                                                                            asset_serial: asset.serial,
                                                                            asset_type: asset.type,
                                                                            client_id: clientId
                                                                        });
                                                                    }}
                                                                    className="flex items-center gap-3 p-3 bg-gray-950/50 border border-gray-800 rounded-2xl hover:border-red-500/50 transition-all text-left group"
                                                                >
                                                                    <div className="bg-red-600/10 p-2 rounded-xl text-red-400 group-hover:bg-red-600 group-hover:text-white transition-all">
                                                                        <Box size={16} />
                                                                    </div>
                                                                    <div className="overflow-hidden">
                                                                        <p className="text-[10px] font-black text-white truncate">{asset.serial}</p>
                                                                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">{asset.type}</p>
                                                                    </div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : !loadingAssets && (
                                                        <div className="space-y-3">
                                                            <div className="p-4 bg-amber-900/10 border border-dashed border-amber-800/40 rounded-2xl text-center">
                                                                <p className="text-[10px] text-amber-500 font-bold uppercase mb-1">Sin equipos registrados en este cliente</p>
                                                                <p className="text-[9px] text-gray-600">Puedes registrar el equipo directamente para continuar.</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={async () => {
                                                                    const typeOptions = availableAssetTypes.map(t => ({ value: t, label: t }));
                                                                    if (!typeOptions.find(o => o.value === 'ENFRIADOR')) typeOptions.unshift({ value: 'ENFRIADOR', label: 'ENFRIADOR' });
                                                                    
                                                                    const missingVals = await requestPrompt(
                                                                        'Equipo no registrado',
                                                                        'El equipo a retirar no está registrado.',
                                                                        [
                                                                            { name: 'serial', label: 'Número de Serie (opcional)', type: 'text', placeholder: 'Dejar vacío para generar uno temporal' },
                                                                            { name: 'tipo', label: 'Tipo de Equipo', type: 'select', options: typeOptions, defaultValue: 'ENFRIADOR' }
                                                                        ]
                                                                    );
                                                                    if (!missingVals) return;
                                                                    
                                                                    const finalSerial = missingVals.serial?.trim() || `CAMPO-${Date.now()}`;
                                                                    const tipo = missingVals.tipo || 'ENFRIADOR';
                                                                    try {
                                                                        const { createAsset } = await import('@/repositories/ordersRepository');
                                                                        const newAsset = await createAsset({
                                                                            serial: finalSerial,
                                                                            type: tipo.toUpperCase(),
                                                                            brand: 'N/A',
                                                                            model: 'Alta en campo — Base incompleta',
                                                                            status: 'INSTALADO'
                                                                        }, clientId, true);
                                                                        if (newAsset) {
                                                                            setScannedAsset({
                                                                                asset_id: newAsset.asset_id || newAsset.id,
                                                                                asset_serial: finalSerial,
                                                                                asset_type: tipo.toUpperCase(),
                                                                                client_id: clientId
                                                                            });
                                                                            setClientAssets(prev => [...prev, { id: newAsset.asset_id || newAsset.id, serial: finalSerial, type: tipo.toUpperCase() }]);
                                                                        }
                                                                    } catch (err) {
                                                                        setError('No se pudo registrar el equipo: ' + err.message);
                                                                    }
                                                                }}
                                                                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all active:scale-95"
                                                            >
                                                                <Plus size={16} /> Registrar Equipo y Continuar
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <button type="button" onClick={() => setIsScannerOpen(true)} className="flex items-center justify-center gap-3 bg-red-600 hover:bg-red-500 text-white py-3 rounded-2xl font-black text-sm uppercase shadow-xl transition-all active:scale-95">
                                                    <Camera size={20} /> Escanear Equipo
                                                </button>
                                                <button type="button" onClick={handleManualAdd} className="flex items-center justify-center gap-3 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-2xl font-black text-sm uppercase transition-all active:scale-95">
                                                    <Type size={20} /> Manual
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* PART 2: Equipo Nuevo a Instalar */}
                                <div className="bg-gray-950/60 p-6 rounded-3xl border border-emerald-800/30 space-y-6">
                                    <h3 className="text-lg font-black flex items-center gap-3">
                                        <div className="w-1.5 h-6 bg-emerald-600 rounded-full"></div>
                                        <PlusCircle size={18} className="text-emerald-400" />
                                        Equipo Nuevo a Instalar
                                    </h3>

                                    <div className="flex flex-col sm:flex-row gap-4">
                                        <div className="flex-grow space-y-1">
                                            <div className="relative">
                                                <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                                                <select 
                                                    value={currentItem.asset_type} 
                                                    onChange={e => setCurrentItem({ ...currentItem, asset_type: e.target.value })} 
                                                    className="w-full bg-gray-900 border-2 border-gray-800 rounded-2xl pl-12 pr-4 py-3 text-sm appearance-none focus:border-emerald-500/50 outline-none"
                                                >
                                                    <option value="">Selecciona tipo de equipo nuevo...</option>
                                                    {availableAssetTypes.map(type => (<option key={type} value={type}>{type}</option>))}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="w-full sm:w-28 space-y-1">
                                            <input 
                                                type="number" 
                                                min="1" 
                                                value={currentItem.quantity} 
                                                onChange={e => setCurrentItem({ ...currentItem, quantity: e.target.valueAsNumber || 1 })} 
                                                className="w-full bg-gray-900 border-2 border-gray-800 rounded-2xl px-4 py-3 text-sm font-black text-center focus:border-emerald-500/50 outline-none" 
                                            />
                                        </div>
                                        <button 
                                            type="button" 
                                            onClick={handleAddItem}
                                            className="bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-2xl shadow-lg transition-all active:scale-95 disabled:opacity-30"
                                            disabled={!currentItem.asset_type}
                                        >
                                            <PlusCircle size={24} />
                                        </button>
                                    </div>

                                    <div className="space-y-3 pt-2">
                                        <AnimatePresence>
                                            {requestedItems.map(item => (
                                                <motion.div
                                                    key={item.asset_type}
                                                    layout
                                                    initial={{ opacity: 0, x: -20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: 20, transition: { duration: 0.2 }}}
                                                    className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 flex items-center justify-between group"
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <span className="text-2xl font-black text-emerald-400">×{item.quantity}</span>
                                                        <span className="text-sm font-bold text-gray-200">{item.asset_type}</span>
                                                    </div>
                                                    <button type="button" onClick={() => handleRemoveItem(item.asset_type)} className="p-2 text-red-400 hover:bg-red-500/10 rounded-xl opacity-0 group-hover:opacity-100 transition-all">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </section>
                        ) : action === 'INSTALAR' ? (
                            <section className="bg-gray-950/60 p-6 rounded-3xl border border-gray-800/50 space-y-6">
                                <h3 className="text-lg font-black flex items-center gap-3">
                                    <div className="w-1.5 h-6 bg-blue-600 rounded-full"></div>
                                    Activos requeridos
                                </h3>

                                <div className="flex flex-col sm:flex-row gap-4">
                                    <div className="flex-grow space-y-1">
                                        <div className="relative">
                                            <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                                            <select 
                                                value={currentItem.asset_type} 
                                                onChange={e => setCurrentItem({ ...currentItem, asset_type: e.target.value })} 
                                                className="w-full bg-gray-900 border-2 border-gray-800 rounded-2xl pl-12 pr-4 py-3 text-sm appearance-none focus:border-blue-500/50 outline-none"
                                            >
                                                <option value="">Selecciona tipo de equipo...</option>
                                                {availableAssetTypes.map(type => (<option key={type} value={type}>{type}</option>))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="w-full sm:w-28 space-y-1">
                                        <input 
                                            type="number" 
                                            min="1" 
                                            value={currentItem.quantity} 
                                            onChange={e => setCurrentItem({ ...currentItem, quantity: e.target.valueAsNumber || 1 })} 
                                            className="w-full bg-gray-900 border-2 border-gray-800 rounded-2xl px-4 py-3 text-sm font-black text-center focus:border-blue-500/50 outline-none" 
                                        />
                                    </div>
                                    <button 
                                        type="button" 
                                        onClick={handleAddItem}
                                        className="bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-2xl shadow-lg transition-all active:scale-95 disabled:opacity-30"
                                        disabled={!currentItem.asset_type}
                                    >
                                        <PlusCircle size={24} />
                                    </button>
                                </div>
                                
                                <AnimatePresence>
                                    {currentItem.asset_type === 'FACHADA' && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <PhotoCapture 
                                                label="Foto Evidencia Local (ANTES) *" 
                                                value={currentItem.photo_before} 
                                                onChange={(val) => setCurrentItem({...currentItem, photo_before: val})} 
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <div className="space-y-3 pt-2">
                                    <AnimatePresence>
                                        {requestedItems.map(item => (
                                            <motion.div 
                                                layout
                                                key={item.asset_type} 
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: 20 }}
                                                className="flex justify-between items-center bg-gray-900/80 p-4 rounded-2xl border border-gray-800"
                                            >
                                                <span className="font-bold text-gray-200">
                                                    <span className="text-blue-500 mr-2">{item.quantity}x</span> {item.asset_type}
                                                </span>
                                                <button type="button" onClick={() => handleRemoveItem(item.asset_type)} className="p-2 text-gray-600 hover:text-red-500 transition-colors">
                                                    <Trash2 size={18} />
                                                </button>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            </section>
                        ) : (
                            <section className="bg-gray-950/60 p-6 rounded-3xl border border-gray-800/50 space-y-6">
                                <h3 className="text-lg font-black flex items-center gap-3">
                                    <div className="w-1.5 h-6 bg-amber-600 rounded-full"></div>
                                    Activo a {action === 'RETIRAR' ? 'Retirar' : 'Mover'}
                                </h3>

                                {scannedAsset ? (
                                    <motion.div 
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="bg-green-600/10 border border-green-600/30 p-5 rounded-2xl relative"
                                    >
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-[9px] uppercase font-black text-green-500">Serie Escaneada</p>
                                                <p className="text-xl font-mono font-black text-white">{scannedAsset.asset_serial}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] uppercase font-black text-green-500">Tipo Detectado</p>
                                                <p className="text-sm font-bold text-gray-200">{scannedAsset.asset_type}</p>
                                            </div>
                                        </div>
                                        <button 
                                            type="button" 
                                            className="absolute top-4 right-4 p-2 text-red-400 hover:bg-red-500/10 rounded-xl"
                                            onClick={() => { setScannedAsset(null); setIsClientLocked(false); }}
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </motion.div>
                                ) : (
                                    <div className="space-y-6">
                                        {/* Client Assets List for Withdrawal */}
                                        {['RETIRAR', 'MOVER'].includes(action) && clientId && (
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Equipos en el local</h4>
                                                    {loadingAssets && <Loader2 size={12} className="animate-spin text-blue-500" />}
                                                </div>
                                                
                                                {clientAssets.length > 0 ? (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        {clientAssets.map(asset => (
                                                            <button
                                                                key={asset.serial}
                                                                type="button"
                                                                onClick={() => {
                                                                    setScannedAsset({
                                                                        asset_id: asset.id,
                                                                        asset_serial: asset.serial,
                                                                        asset_type: asset.type,
                                                                        client_id: clientId
                                                                    });
                                                                }}
                                                                className="flex items-center gap-3 p-3 bg-gray-950/50 border border-gray-800 rounded-2xl hover:border-blue-500/50 transition-all text-left group"
                                                            >
                                                                <div className="bg-blue-600/10 p-2 rounded-xl text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                                                    <Box size={16} />
                                                                </div>
                                                                <div className="overflow-hidden">
                                                                    <p className="text-[10px] font-black text-white truncate">{asset.serial}</p>
                                                                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">{asset.type}</p>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : !loadingAssets && (
                                                    <div className="space-y-3">
                                                        <div className="p-4 bg-amber-900/10 border border-dashed border-amber-800/40 rounded-2xl text-center">
                                                            <p className="text-[10px] text-amber-500 font-bold uppercase mb-1">Sin equipos registrados en este cliente</p>
                                                            <p className="text-[9px] text-gray-600">La base de equipos está incompleta. Puedes registrar el equipo directamente para continuar con el retiro.</p>
                                                        </div>
                                                        {/* ✅ Botón para dar de alta un equipo directamente sin escanear */}
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                const typeOptions = availableAssetTypes.map(t => ({ value: t, label: t }));
                                                                if (!typeOptions.find(o => o.value === 'ENFRIADOR')) typeOptions.unshift({ value: 'ENFRIADOR', label: 'ENFRIADOR' });

                                                                const missingVals = await requestPrompt(
                                                                    'Equipo no registrado',
                                                                    'El equipo a retirar no está registrado.',
                                                                    [
                                                                        { name: 'serial', label: 'Número de Serie (opcional)', type: 'text', placeholder: 'Dejar vacío para generar uno temporal' },
                                                                        { name: 'tipo', label: 'Tipo de Equipo', type: 'select', options: typeOptions, defaultValue: 'ENFRIADOR' }
                                                                    ]
                                                                );
                                                                if (!missingVals) return;

                                                                const finalSerial = missingVals.serial?.trim() || `CAMPO-${Date.now()}`;
                                                                const tipo = missingVals.tipo || 'ENFRIADOR';
                                                                try {
                                                                    const { createAsset } = await import('@/repositories/ordersRepository');
                                                                    const newAsset = await createAsset({
                                                                        serial: finalSerial,
                                                                        type: tipo.toUpperCase(),
                                                                        brand: 'N/A',
                                                                        model: 'Alta en campo — Base incompleta',
                                                                        status: 'INSTALADO'
                                                                    }, clientId, true);
                                                                    if (newAsset) {
                                                                        setScannedAsset({
                                                                            asset_id: newAsset.asset_id || newAsset.id,
                                                                            asset_serial: finalSerial,
                                                                            asset_type: tipo.toUpperCase(),
                                                                            client_id: clientId
                                                                        });
                                                                        setClientAssets(prev => [...prev, { id: newAsset.asset_id || newAsset.id, serial: finalSerial, type: tipo.toUpperCase() }]);
                                                                    }
                                                                } catch (err) {
                                                                    setError('No se pudo registrar el equipo: ' + err.message);
                                                                }
                                                            }}
                                                            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all active:scale-95"
                                                        >
                                                            <Plus size={16} /> Registrar Equipo y Continuar Retiro
                                                        </button>
                                                    </div>
                                                )}
                                                
                                                <div className="relative flex items-center gap-4 py-2">
                                                    <div className="flex-grow h-px bg-gray-800"></div>
                                                    <span className="text-[9px] font-black uppercase text-gray-600 tracking-widest">O escanear otro</span>
                                                    <div className="flex-grow h-px bg-gray-800"></div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <button type="button" onClick={() => setIsScannerOpen(true)} className="flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black text-sm uppercase shadow-xl transition-all active:scale-95">
                                                <Camera size={20} /> Escaneo Rápido
                                            </button>
                                            <button type="button" onClick={handleManualAdd} className="flex items-center justify-center gap-3 bg-gray-800 hover:bg-gray-700 text-white py-4 rounded-2xl font-black text-sm uppercase transition-all active:scale-95">
                                                <Type size={20} /> Ingreso Manual
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </section>
                        )}

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest ml-1">Instrucciones o Notas</label>
                            <textarea 
                                rows="3" 
                                value={notes} 
                                onChange={(e) => setNotes(e.target.value)} 
                                placeholder="Escribe aquí cualquier observación relevante..."
                                className="w-full bg-gray-950/50 border-2 border-gray-800 rounded-3xl p-5 text-sm text-gray-300 focus:border-blue-500/30 outline-none transition-all resize-none"
                            />
                        </div>

                        {error && (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-red-400 p-4 rounded-2xl text-center bg-red-900/10 border border-red-800/50 flex items-center justify-center gap-2 font-bold text-sm"
                            >
                                <AlertCircle size={18} /> {error}
                            </motion.div>
                        )}

                        <div className="pt-4">
                            <button 
                                type="submit" 
                                disabled={submitting || loading}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-3xl text-lg uppercase tracking-widest shadow-2xl shadow-blue-900/40 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-30 disabled:grayscale"
                            >
                                {submitting ? <Loader2 className="animate-spin" size={24} /> : <CheckCircle2 size={24} />}
                                {submitting ? 'Procesando...' : 'Crear Orden de Trabajo'}
                            </button>
                        </div>
                    </form>
                </motion.div>
            )}
        </AnimatePresence>

        <section className="space-y-6">
            <h2 className="text-2xl font-black flex items-center gap-3">
                <div className="w-1.5 h-6 bg-blue-500 rounded-full"></div>
                Historial Reciente
            </h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {userOrders.length > 0 ? (
                    userOrders.map(order => {
                        const variant = getStatusVariant(order.status);
                        return (
                            <motion.div 
                                key={order.id} 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="bg-gray-900/40 border border-gray-800/50 p-5 rounded-3xl flex justify-between items-start group hover:bg-gray-900/60 transition-all border-l-4 border-l-blue-600/30 cursor-pointer"
                                onClick={() => navigate(`/installer/order/${order.id}`)}
                            >
                                <div className="space-y-1 w-full">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <p className="font-black text-sm uppercase tracking-tighter text-blue-400">{order.action}</p>
                                            <Badge variant={variant} className="text-[8px] px-1.5 py-0 min-h-0 font-black tracking-widest uppercase">
                                                {order.status}
                                            </Badge>
                                        </div>
                                        <div className="text-[10px] text-gray-600 flex items-center">
                                            <Calendar size={10} className="mr-1 opacity-50" />
                                            {new Date(order.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-200">
                                            <span className="text-gray-500 font-normal mr-1">Cliente:</span> {order.origin_client?.name || '---'}
                                        </p>
                                        {order.origin_client?.business_name && (
                                            <p className="text-[10px] text-gray-500 mt-0.5">{order.origin_client.business_name}</p>
                                        )}
                                    </div>
                                    
                                    {order.items && order.items.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-white/5 flex flex-wrap gap-1">
                                            {order.items.map((it, idx) => (
                                                <span key={idx} className="text-[9px] bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/10">
                                                    {it.quantity}x {it.asset_type}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="p-2 bg-gray-950 rounded-xl border border-gray-800 group-hover:border-blue-500/30 group-hover:bg-blue-500/10 transition-all self-center ml-4">
                                    <ChevronRight size={16} className="text-gray-500 group-hover:text-blue-400 transition-colors" />
                                </div>
                            </motion.div>
                        );
                    })
                ) : (
                    <div className="col-span-full py-16 text-center bg-gray-900/20 border-2 border-dashed border-gray-800 rounded-[2.5rem]">
                        <AlertCircle className="mx-auto h-12 w-12 text-gray-800 mb-4" />
                        <h3 className="text-lg font-black text-gray-500 uppercase tracking-widest">Sin actividad reciente</h3>
                        <p className="text-xs text-gray-600 mt-2">Empieza creando una nueva orden arriba.</p>
                    </div>
                )}
            </div>
        </section>
      </div>

      <SmartBarcodeScanner 
          open={isScannerOpen} 
          onClose={() => setIsScannerOpen(false)} 
          onDetected={handleAssetSearch} 
      />
    </div>
  );
};

const CustomPromptDialog = ({ prompt }) => {
  const [values, setValues] = useState({});

  useEffect(() => {
    if (prompt.isOpen) {
      const initial = {};
      prompt.fields.forEach(f => {
         initial[f.name] = f.defaultValue || '';
      });
      setValues(initial);
    }
  }, [prompt.isOpen, prompt.fields]);

  if (!prompt.isOpen) return null;

  return (
    <Dialog open={prompt.isOpen} onOpenChange={(open) => {
      if (!open) prompt.onCancel();
    }}>
      <DialogContent className="bg-gray-900 text-white border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{prompt.title}</DialogTitle>
        </DialogHeader>
        {prompt.message && <p className="text-sm text-gray-400 mt-2">{prompt.message}</p>}
        <div className="space-y-4 py-4">
          {prompt.fields.map(field => (
            <div key={field.name} className="space-y-2">
              <label className="text-sm font-medium text-gray-300">{field.label}</label>
              {field.type === 'select' ? (
                <select
                  value={values[field.name] || ''}
                  onChange={e => setValues({ ...values, [field.name]: e.target.value })}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-white focus:border-blue-500 outline-none transition-colors"
                >
                  <option value="" disabled>{field.placeholder || 'Selecciona una opción'}</option>
                  {field.options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type || 'text'}
                  value={values[field.name] || ''}
                  onChange={e => setValues({ ...values, [field.name]: e.target.value })}
                  placeholder={field.placeholder || ''}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-white focus:border-blue-500 outline-none transition-colors"
                  autoComplete="off"
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter className="flex gap-2 sm:justify-end mt-4">
          <Button variant="ghost" onClick={prompt.onCancel} className="text-gray-400 hover:text-white hover:bg-gray-800">Cancelar</Button>
          <Button onClick={() => prompt.onConfirm(values)} className="bg-blue-600 hover:bg-blue-500 text-white">Continuar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewInstallationRequest;
