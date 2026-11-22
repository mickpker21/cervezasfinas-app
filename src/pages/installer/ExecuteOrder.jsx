import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle, Truck, Camera, Type, X, MapPin, Eye } from 'lucide-react';
import ScannerModal from '../../components/common/ScannerModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getOrderById, searchAsset, updateOrderItem, updateOrder, completeOrder } from '@/repositories/ordersRepository';
import { fileToBase64 } from '@/lib/fileUtils';
import { useRef } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

const ExecuteOrder = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { roleType } = useSupabaseAuth();

  // Only installers and admins can execute orders; everyone else gets read-only view
  const INSTALLER_ROLES = ['installer', 'instalador', 'admin', 'superadmin'];
  const isReadOnly = !INSTALLER_ROLES.includes((roleType || '').toLowerCase());

  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingItemId, setUpdatingItemId] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [itemToAssign, setItemToAssign] = useState(null);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  
  // Warehouse selection for returns
  const [showWarehouseDialog, setShowWarehouseDialog] = useState(false);
  const [userWarehouses, setUserWarehouses] = useState([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  
  const [evidencePhoto, setEvidencePhoto] = useState(null);
  const [compressing, setCompressing] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [modalPhoto, setModalPhoto] = useState('');
  const fileRef = useRef(null);

  const fetchOrderDetails = useCallback(async () => {
    try {
      setLoading(true);
      const orderData = await getOrderById(orderId);
      if (!orderData) throw new Error("No se encontró la orden localmente.");
      
      setOrder(orderData);
      setItems(orderData.items || []);

      // Fetch warehouses assigned to user for returns
      const { data: { session } } = await import('@/supabaseClient').then(m => m.supabase.auth.getSession());
      if (session) {
          const { data: profile } = await import('@/supabaseClient').then(m => m.supabase.from('profiles').select('warehouse_ids').eq('id', session.user.id).single());
          const warehouseIds = profile?.warehouse_ids || [];
          
          const { getWarehouses } = await import('@/repositories/ordersRepository');
          const allWh = await getWarehouses();
          const assigned = (allWh || []).filter(w => warehouseIds.includes(w.id));
          setUserWarehouses(assigned);
          if (assigned.length > 0) setSelectedWarehouseId(assigned[0].id);
      }
    } catch (err) {
      console.error("Error fetching details:", err);
      setError(`No se pudieron cargar los detalles: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrderDetails();
  }, [fetchOrderDetails]);

  const handleAssignAsset = async (serial) => {
    if (!itemToAssign || !serial) return;
    
    console.log('[ExecuteOrder] handleAssignAsset start. Item ID:', itemToAssign.id, 'Serial:', serial);
    setUpdatingItemId(itemToAssign.id);
    try {
      const trimmedSerial = serial.trim();
      let asset = await searchAsset(trimmedSerial);
      
      if (!asset) {
          const createIt = window.confirm(`El número de serie ${trimmedSerial} no fue encontrado en el almacén. ¿Deseas darlo de alta en el inventario ahora para asignarlo?`);
          if (!createIt) {
              return; // Cancel assignment
          }
          
          console.log(`[ExecuteOrder] Creating new asset for serial: ${trimmedSerial}`);
          const { createAsset } = await import('@/repositories/ordersRepository');
          try {
              // Creating physical asset in database (avoids MOCK ghost assets)
              asset = await createAsset({ 
                  serial: trimmedSerial,
                  type: itemToAssign.asset_type || 'OTRO',
                  brand: 'N/A',
                  model: 'Alta en campo'
              }, order.origin_warehouse_id || null);
          } catch(e) {
              alert(`Error al registrar el equipo en el inventario: ${e.message}`);
              return;
          }
      }

      console.log('[ExecuteOrder] Asset to assign:', asset);

      const scannedType = (asset.asset_type || asset.type || '').toUpperCase().trim();
      const expectedType = (itemToAssign.asset_type || '').toUpperCase().trim();

      if (expectedType && scannedType !== expectedType && scannedType !== 'OTRO') {
         throw new Error(`El activo escaneado es de tipo '${scannedType}' pero se esperaba un '${expectedType}'.`);
      }

      // Update local storage
      console.log('[ExecuteOrder] Calling updateOrderItem...');
      await updateOrderItem(itemToAssign.id, { 
          order_id: orderId,
          asset_type: itemToAssign.asset_type,
          asset_id: asset.asset_id || asset.id, 
          asset_serial: asset.asset_serial || asset.serial 
      });
      console.log('[ExecuteOrder] updateOrderItem completed.');

      // Refresh local state
      console.log('[ExecuteOrder] Refreshing order details...');
      await fetchOrderDetails();
      console.log('[ExecuteOrder] Refresh completed.');

    } catch (err) {
        console.error("Error al asignar activo:", err);
        alert(`No se pudo asignar el activo: ${err.message}`);
    } finally {
        setShowScanner(false);
        setShowAssignDialog(false);
        setItemToAssign(null);
        setUpdatingItemId(null);
    }
  };

  const handleManualAssign = () => {
    if (!itemToAssign) return;
    setShowAssignDialog(false);
    const serial = window.prompt("Ingresa el número de serie del activo:");
    if (serial) {
      handleAssignAsset(serial);
    }
  };
  
  const handleSetEnRuta = async () => {
    // BLINDAJE: Validar que todos los activos tengan serie antes de ponerse en ruta
    const allAssigned = items.every(item => !!item.asset_id || !!item.asset_serial);
    
    if ((order.action === 'INSTALAR' || order.action === 'CAMBIO_EQUIPO') && !allAssigned) {
      alert("Debes escanear y asignar todos los equipos antes de ponerte 'En Ruta'. Esto asegura que llevas el equipo correcto en tu unidad.");
      return;
    }

    setUpdatingItemId('set_en_ruta');
    try {
      await updateOrder(orderId, { status: 'EN_RUTA', synced: 0 });
      await fetchOrderDetails();
    } catch (err) {
      console.error("Error al poner en ruta:", err);
      alert(`No se pudo actualizar el estado: ${err.message}`);
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleCompleteOrder = async () => {
    if (order.status !== 'EN_RUTA') {
        alert("Primero debes poner la orden 'En Ruta'.");
        return;
    }

    if (!evidencePhoto) {
        alert("Debes tomar una foto de evidencia del trabajo terminado antes de finalizar.");
        return;
    }

    if (!window.confirm("¿Estás seguro de que quieres completar esta orden? Esta acción es final.")) return;
    
    if ((order.action === 'INSTALAR' || order.action === 'CAMBIO_EQUIPO') && !items.every(item => !!item.asset_id || !!item.asset_serial)) {
      alert("Debes asignar un número de serie a todos los activos antes de completar.");
      return;
    }

    // Check if we need to ask for a warehouse (for withdrawals)
    const hasWithdrawal = order.action === 'RETIRAR' || order.action === 'CAMBIO_EQUIPO'; // In CAMBIO_EQUIPO we always withdraw
    if (hasWithdrawal && !selectedWarehouseId && userWarehouses.length > 0) {
        setShowWarehouseDialog(true);
        return;
    }

    await performCompletion();
  };

  const performCompletion = async () => {
    setUpdatingItemId('complete_order');
    try {
        // Save evidence photo in notes as JSON
        let currentNotes = {};
        try {
            currentNotes = JSON.parse(order.notes || '{}');
        } catch(e) {
            if (order.notes) currentNotes = { text_notes: order.notes };
        }

        const updatedNotes = JSON.stringify({
            ...currentNotes,
            attachments: {
                ...(currentNotes.attachments || {}),
                photo_after: evidencePhoto
            }
        });

        // Update order with photo before completing
        await updateOrder(orderId, { notes: updatedNotes });

        const res = await completeOrder(orderId, selectedWarehouseId);
        if (res.status === 'error') throw new Error(res.message);

        alert("¡Orden completada con éxito!");
        navigate('/installer/dashboard');
    } catch (err) {
        console.error("Error al completar la orden:", err);
        alert(`Error al completar la orden: ${err.message}`);
    } finally {
        setUpdatingItemId(null);
    }
  };
  
  if (loading) return <div className="flex items-center justify-center h-screen bg-gray-900 text-white"><Loader2 className="h-8 w-8 animate-spin" /><span className='ml-3'>Cargando detalles...</span></div>;
  if (error) return <div className="p-4 text-red-400 bg-red-900/40 border border-red-700 rounded-md max-w-2xl mx-auto mt-10 text-center"><AlertCircle className="w-5 h-5 mr-2 inline"/> {error}</div>;
  if (!order) return null;

  const isBusy = !!updatingItemId;
  const allAssetsAssigned = items.every(item => !!item.asset_id || !!item.asset_serial);

  return (
    <>
      <div className="p-4 md:p-6 bg-slate-950 text-white min-h-screen">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-slate-400 hover:text-white">
              <Truck className="w-5 h-5 rotate-180" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">
                {isReadOnly ? 'Detalle de Orden' : 'Ejecutar Orden'}
              </h1>
              <p className='text-slate-500 text-xs font-mono'>{order.id}</p>
            </div>
          </div>

          {/* Read-only banner for non-installer roles */}
          {isReadOnly && (
            <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold px-4 py-3 rounded-xl mb-6 uppercase tracking-wide">
              <Eye className="w-4 h-4 shrink-0" />
              Solo lectura — no tienes permisos para ejecutar esta orden
            </div>
          )}
          

          {/* Cliente Information */}
          <div className="bg-slate-900/50 border border-white/5 backdrop-blur-xl p-6 rounded-2xl shadow-2xl mb-8 space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Acción</span>
                <span className="px-3 py-1 bg-blue-500/10 text-blue-400 text-xs font-bold rounded-full border border-blue-500/20">{order.action}</span>
            </div>
            <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Estado</span>
                <span className={`px-3 py-1 text-xs font-bold rounded-full border ${
                    order.status === 'COMPLETADA' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                    order.status === 'EN_RUTA' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                    'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>{order.status}</span>
            </div>
            <div className="pt-2 border-t border-white/5">
                <p className="text-slate-400 text-xs mb-1">Cliente</p>
                <p className="font-semibold text-slate-100">{order.origin_client?.name || 'N/A'}</p>
                {order.origin_client?.business_name && (
                    <p className="text-sm text-blue-400 font-medium">{order.origin_client.business_name}</p>
                )}
                <p className="text-slate-400 text-sm mt-1">{order.origin_client?.address || 'N/A'}</p>
                
                {/* GEOLOCALIZACION DEL CLIENTE (Lógica robusta) */}
                {(() => {
                    let lat = order.origin_client?.lat;
                    let lng = order.origin_client?.lng;

                    // Fallback 1: Buscar en el campo coords del cliente
                    if (!lat && order.origin_client?.coords) {
                        try {
                            const c = typeof order.origin_client.coords === 'string' 
                                ? JSON.parse(order.origin_client.coords) 
                                : order.origin_client.coords;
                            lat = c.lat; lng = c.lng;
                        } catch(e) {}
                    }

                    // Fallback 2: Buscar en las notas (Regex)
                    if (!lat && order.notes) {
                        const geoMatch = order.notes.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
                        if (geoMatch) { lat = geoMatch[1]; lng = geoMatch[2]; }
                    }

                    if (lat && lng) {
                        return (
                            <div className="mt-3 flex flex-col gap-2">
                                <div className="flex items-center text-[10px] text-emerald-400/80 font-mono bg-emerald-500/5 px-2 py-1 rounded border border-emerald-500/10 w-fit">
                                    <MapPin className="w-3 h-3 mr-1.5" />
                                    GPS: {lat}, {lng}
                                </div>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="w-full sm:w-fit text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 px-3 h-8 rounded-lg border border-emerald-500/20 text-xs font-bold"
                                    onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank')}
                                >
                                    Abrir en Google Maps
                                </Button>
                            </div>
                        );
                    }
                    return null;
                })()}
            </div>

            {order.action === 'MOVER' && order.destination_client && (
                <div className="pt-2 border-t border-white/5">
                    <p className="text-slate-400 text-xs mb-1">Destino</p>
                    <p className="font-semibold text-slate-100">{order.destination_client.name}</p>
                    {order.destination_client.business_name && (
                        <p className="text-sm text-emerald-400 font-medium">{order.destination_client.business_name}</p>
                    )}
                    <p className="text-slate-400 text-sm mt-1">{order.destination_client.address}</p>
                    
                    {/* GEOLOCALIZACION DESTINO */}
                    {(() => {
                        let lat = order.destination_client?.lat;
                        let lng = order.destination_client?.lng;
                        if (lat && lng) {
                            return (
                                <div className="mt-3 flex flex-col gap-2">
                                    <div className="flex items-center text-[10px] text-emerald-400/80 font-mono bg-emerald-500/5 px-2 py-1 rounded border border-emerald-500/10 w-fit">
                                        <MapPin className="w-3 h-3 mr-1.5" />
                                        GPS: {lat}, {lng}
                                    </div>
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="w-full sm:w-fit text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 px-3 h-8 rounded-lg border border-emerald-500/20 text-xs font-bold"
                                        onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank')}
                                    >
                                        Navegar al Destino
                                    </Button>
                                </div>
                            );
                        }
                    })()}
                </div>
            )}
          </div>

          {/* Notas Section */}
          {(() => {
              let textNotes = '';
              let extractedCoords = null;
              try {
                  const n = order.notes;
                  if (!n) return null;
                  if (n.startsWith('{')) {
                      const notesObj = JSON.parse(n);
                      textNotes = notesObj.text_notes || notesObj.user_notes || '';
                  } else {
                      textNotes = n;
                  }
                  
                  // Try to extract coordinates from text if client doesn't have them
                  if (textNotes && !order.origin_client?.lat) {
                      const geoMatch = textNotes.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
                      if (geoMatch) {
                          extractedCoords = { lat: geoMatch[1], lng: geoMatch[2] };
                      }
                  }
              } catch(e) {
                  textNotes = order.notes;
              }
              
              if (!textNotes) return null;

              return (
                  <div className="space-y-4 mb-8">
                      <div className="bg-slate-900/40 border border-white/5 p-5 rounded-2xl">
                          <h3 className="text-sm font-bold text-slate-400 flex items-center gap-2 mb-2">
                              <Type className="w-4 h-4" /> Notas e Instrucciones
                          </h3>
                          <p className="text-slate-200 text-sm italic">"{textNotes}"</p>
                      </div>

                      {extractedCoords && (
                          <Button 
                              variant="ghost" 
                              size="sm" 
                              className="w-full bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 py-6 rounded-2xl border border-emerald-500/20 font-black uppercase tracking-widest text-[10px]"
                              onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${extractedCoords.lat},${extractedCoords.lng}`, '_blank')}
                          >
                              <MapPin className="w-4 h-4 mr-2" /> Usar Coordenadas de las Notas
                          </Button>
                      )}
                  </div>
              );
          })()}

          {/* Estado Inicial (Antes) Section */}
          {(() => {
              let photoBefore = null;
              try {
                  const notesObj = JSON.parse(order.notes || '{}');
                  photoBefore = notesObj.attachments?.photo_before;
              } catch(e) {}
              
              if (!photoBefore) return null;

              return (
                  <div className="bg-slate-900/40 border border-amber-500/20 p-5 rounded-2xl mb-8">
                      <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2 mb-3">
                          <Camera className="w-4 h-4" /> Estado Inicial (Capturado al crear)
                      </h3>
                      <div 
                          className="relative h-40 rounded-xl overflow-hidden cursor-pointer group"
                          onClick={() => { setModalPhoto(photoBefore); setShowPhotoModal(true); }}
                      >
                          <img src={photoBefore} alt="Antes" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                          <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity">
                              Toca para ampliar
                          </div>
                      </div>
                  </div>
              );
          })()}

          <div className="space-y-4 mb-8">
            <h2 className="text-lg font-semibold text-slate-300 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-500" /> Activos Involucrados
            </h2>
            {items.map(item => {
              // Parse item_action for CAMBIO_EQUIPO orders
              let itemAction = null;
              if (order.action === 'CAMBIO_EQUIPO') {
                try {
                  const notesData = typeof item.notes === 'string' ? JSON.parse(item.notes) : item.notes;
                  itemAction = notesData?.item_action || null;
                } catch(e) {}
              }
              const isWithdrawal = itemAction === 'RETIRAR';
              const borderClass = order.action === 'CAMBIO_EQUIPO' 
                ? (isWithdrawal ? 'border-red-500/20' : 'border-emerald-500/20')
                : 'border-white/5';
              
              return (
              <div key={item.id} className={`bg-slate-900/40 border ${borderClass} p-4 rounded-xl flex justify-between items-center group transition-all hover:bg-slate-900/60`}>
                <div>
                  {order.action === 'CAMBIO_EQUIPO' && (
                    <span className={`inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full mb-1 ${isWithdrawal ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                      {isWithdrawal ? '↩ Retirar' : '↪ Instalar Nuevo'}
                    </span>
                  )}
                  <p className="font-semibold text-slate-200">{item.asset_type}</p>
                  <p className="text-xs text-slate-500">Cantidad: {item.quantity}</p>
                  { (item.asset_id || item.asset_serial) ? (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                        <CheckCircle className="w-3.5 h-3.5" /> Serie: {item.asset_serial}
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400 font-medium tracking-tight">
                        <AlertCircle className="w-3.5 h-3.5" /> Pendiente de validar serie
                    </div>
                  )}
                </div>
                {!(item.asset_id || item.asset_serial) && !isReadOnly && (
                  <Button 
                    variant="outline"
                    onClick={() => { setItemToAssign(item); setShowAssignDialog(true); }}
                    disabled={isBusy}
                    className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                  >
                    {updatingItemId === item.id ? <Loader2 className='h-4 w-4 animate-spin' /> : 'Validar Serie'}
                  </Button>
                )}
              </div>
              );
            })}
          </div>
          {order.status === 'EN_RUTA' && (
            <div className="bg-slate-900/50 border border-blue-500/20 p-6 rounded-2xl mb-8 space-y-4">
                <h3 className="text-sm font-bold text-blue-400 flex items-center gap-2">
                    <Camera className="w-4 h-4" /> Evidencia de Trabajo Terminado *
                </h3>
                <div
                    onClick={() => { if (!compressing) fileRef.current?.click(); }}
                    className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-all h-48 flex flex-col items-center justify-center gap-2 overflow-hidden ${evidencePhoto ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-700 bg-slate-950/50 hover:border-slate-600'} ${compressing ? 'opacity-50 pointer-events-none' : ''}`}
                >
                    {compressing ? (
                        <>
                            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                            <span className="text-xs text-blue-400 font-bold uppercase tracking-widest">Comprimiendo...</span>
                        </>
                    ) : evidencePhoto ? (
                        <>
                            <img src={evidencePhoto} alt="Evidencia" className="absolute inset-0 w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                <Camera className="w-8 h-8 text-white" />
                            </div>
                        </>
                    ) : (
                        <>
                            <Camera className="w-8 h-8 text-slate-500" />
                            <span className="text-xs text-slate-500 text-center px-6">Toca para tomar foto del equipo instalado o trabajo concluido</span>
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
                            setCompressing(true);
                            try {
                                const base64str = await fileToBase64(file, true);
                                setEvidencePhoto(base64str);
                            } catch (err) {
                                console.error("Compression failed:", err);
                                alert("No se pudo procesar la imagen.");
                            }
                            setCompressing(false);
                            e.target.value = '';
                        }}
                    />
                </div>
            </div>
          )}

          {!isReadOnly && (
            <div className="flex flex-col gap-4 pb-12">
              {order.status !== 'EN_RUTA' && order.status !== 'COMPLETADA' && (
                  <Button onClick={handleSetEnRuta} disabled={isBusy} className="w-full h-12 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-900/20">
                    {updatingItemId === 'set_en_ruta' ? <Loader2 className='h-5 w-5 animate-spin' /> : <><Truck className="w-5 h-5 mr-3"/> Poner en Ruta</>}
                  </Button>
              )}
              <Button 
                  onClick={handleCompleteOrder} 
                  disabled={!allAssetsAssigned || isBusy || order.status !== 'EN_RUTA'} 
                  className={`w-full h-12 shadow-lg transition-all duration-300 ${
                      allAssetsAssigned && order.status === 'EN_RUTA' 
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-900/20' 
                      : 'bg-slate-800 text-slate-500 shadow-none'
                  }`}
              >
                {updatingItemId === 'complete_order' ? <Loader2 className='h-5 w-5 animate-spin' /> : <><CheckCircle className="w-5 h-5 mr-3"/> Finalizar Trabajo</>}
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showAssignDialog} onOpenChange={(isOpen) => !isBusy && setShowAssignDialog(isOpen)}>
        <DialogContent className="bg-gray-800 text-white border-gray-700">
            <DialogHeader>
                <DialogTitle>Asignar Activo</DialogTitle>
                <DialogDescription>¿Cómo quieres asignar el número de serie para el {itemToAssign?.asset_type}?</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 pt-4">
                <Button variant="outline" className="border-blue-500 text-blue-400" onClick={() => { setShowAssignDialog(false); setShowScanner(true); }}>
                    <Camera className="w-5 h-5 mr-2" /> Escanear
                </Button>
                <Button variant="outline" className="border-indigo-500 text-indigo-400" onClick={handleManualAssign}>
                    <Type className="w-5 h-5 mr-2" /> Manual
                </Button>
            </div>
        </DialogContent>
      </Dialog>

      <ScannerModal
        isOpen={showScanner}
        onClose={() => !isBusy && setShowScanner(false)}
        onScanSuccess={handleAssignAsset}
        title="Escanear Activo"
        description={`Apunta la cámara al código del activo tipo \"${itemToAssign?.asset_type}\".`}
      />

      <Dialog open={showPhotoModal} onOpenChange={setShowPhotoModal}>
        <DialogContent className="bg-black border-none p-0 max-w-3xl overflow-hidden">
            <div className="relative w-full h-[80vh]">
                <img src={modalPhoto} alt="Zoom" className="w-full h-full object-contain" />
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute top-2 right-2 text-white bg-black/40 hover:bg-black/60 rounded-full"
                    onClick={() => setShowPhotoModal(false)}
                >
                    <X className="w-5 h-5" />
                </Button>
            </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showWarehouseDialog} onOpenChange={setShowWarehouseDialog}>
        <DialogContent className="bg-gray-800 text-white border-gray-700">
            <DialogHeader>
                <DialogTitle>Destino de Equipo Retirado</DialogTitle>
                <DialogDescription>Selecciona a qué almacén vas a ingresar el equipo que acabas de retirar.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
                <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Almacén de Destino</label>
                    <select 
                        value={selectedWarehouseId}
                        onChange={(e) => setSelectedWarehouseId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                        {userWarehouses.map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                        {userWarehouses.length === 0 && <option value="">Almacén General (Por defecto)</option>}
                    </select>
                </div>
                <Button 
                    className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold"
                    onClick={() => { setShowWarehouseDialog(false); performCompletion(); }}
                >
                    Confirmar y Finalizar
                </Button>
            </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ExecuteOrder;
