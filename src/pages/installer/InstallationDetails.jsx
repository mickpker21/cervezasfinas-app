import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { useParams, useNavigate } from 'react-router-dom';
import ScannerModal from '../../components/common/ScannerModal';
import { Camera, QrCode, CheckCircle, Package, ArrowLeft, Type, Loader2 } from 'lucide-react';
import { getActionInfo, getStatusStyle } from '@/lib/utils';
import { useRef } from 'react';
import { fileToBase64 } from '@/lib/fileUtils';

const InstallationDetails = () => {
  const { id: orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [assignedAssets, setAssignedAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [currentItemToUpdate, setCurrentItemToUpdate] = useState(null);
  
  const [evidencePhoto, setEvidencePhoto] = useState(null);
  const [compressing, setCompressing] = useState(false);
  const fileRef = useRef(null);

  const fetchOrderDetails = useCallback(async (id) => {
    setLoading(true);
    setError('');
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('installation_orders')
        .select('id, created_at, status, action, clients:clients!installation_orders_client_id_fkey(*)')
        .eq('id', id)
        .single();
      if (orderError) throw orderError;
      setOrder(orderData);

      const { data: itemsData, error: itemsError } = await supabase
        .from('installation_order_items')
        .select('id, quantity, asset_type')
        .eq('order_id', id);
      if (itemsError) throw itemsError;
      const safeItemsData = itemsData || [];
      setItems(safeItemsData);

      if (safeItemsData.length === 0) {
        setAssignedAssets([]);
        return;
      }
      
      const itemIds = safeItemsData.map(item => item.id);
      const { data: assignedData, error: assignedError } = await supabase
        .from('assigned_assets')
        .select('id, order_item_id, assets(serial)')
        .in('order_item_id', itemIds);
      
      if (assignedError) throw assignedError;

      const itemTypeMap = safeItemsData.reduce((acc, item) => {
        acc[item.id] = item.asset_type;
        return acc;
      }, {});

      const processedAssets = (assignedData || [])
        .filter(a => a.assets)
        .map(a => ({
          id: a.id,
          serial: a.assets.serial,
          asset_type: itemTypeMap[a.order_item_id] || 'Tipo Desconocido'
        }));
      setAssignedAssets(processedAssets);

    } catch (err) {
      console.error('Error fetching order details:', err);
      setError(`No se pudo cargar el detalle de la orden: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (orderId) {
      fetchOrderDetails(orderId);
    }
  }, [orderId, fetchOrderDetails]);

  const handleSerialProvided = async (serial, item) => {
    if (!item || !orderId || !serial) return;
    setUpdating(true);

    try {
        const { data: assetData, error: assetError } = await supabase
            .from('assets')
            .select('id')
            .eq('serial', serial)
            .single();

        if (assetError || !assetData) {
            throw new Error(`No se encontró ningún activo con la serie "${serial}".`);
        }

        const { error: insertError } = await supabase
            .from('assigned_assets')
            .insert({
                asset_id: assetData.id,
                order_item_id: item.id,
            });

        if (insertError) throw insertError;

        await fetchOrderDetails(orderId);

    } catch (err) {
        alert(`Error al asignar el activo: ${err.message}`);
    } finally {
        setUpdating(false);
        setCurrentItemToUpdate(null);
    }
};

  const handleScanClick = (item) => {
    setCurrentItemToUpdate(item);
    setIsScannerOpen(true);
  };

  const handleScanSuccess = (scannedSerial) => {
    if (currentItemToUpdate) {
      handleSerialProvided(scannedSerial, currentItemToUpdate);
    }
    setIsScannerOpen(false);
  };

  const handleManualAddClick = (item) => {
    const serial = window.prompt(`Ingresa manualmente el número de serie para ${item.asset_type}:`);
    if (serial && serial.trim() !== '') {
      handleSerialProvided(serial.trim(), item);
    }
  };

    const handleCompleteOrder = async () => {
    if (!orderId) return;
    
    const hasFachada = items.some(i => i.asset_type === 'FACHADA');
    if (hasFachada && !evidencePhoto) {
        alert('Por favor, toma o selecciona una foto de la instalación terminada (DESPUÉS) antes de completar la orden.');
        return;
    }

    setUpdating(true);
    try {
      if (evidencePhoto) {
          // Subir la foto de evidencia y asociarla en las notas (para offline/online mix, en detalles es online)
          const blobData = await (await fetch(evidencePhoto)).blob();
          const { data: uploadData, error: uploadErr } = await supabase.storage
            .from('asset-photos')
            .upload(`order_${orderId}_instalacion_${Date.now()}.jpg`, blobData, { upsert: true });
          
          if (!uploadErr && uploadData) {
            const { data: { publicUrl } } = supabase.storage.from('asset-photos').getPublicUrl(uploadData.path);
            const notesObj = { foto_instalacion_despues: publicUrl };
            const existingNotes = order.notes ? (order.notes + "\n" + JSON.stringify(notesObj)) : JSON.stringify(notesObj);
            
            await supabase.from('installation_orders').update({ notes: existingNotes }).eq('id', orderId);
          }
      }

      const { data, error } = await supabase.rpc('complete_order', { order_id_param: orderId });
      
      if (error) throw error;
      
      console.log(data); // Log success message from function
      alert('¡Orden completada con éxito! El estado de los activos ha sido actualizado.');

      // Re-fetch data to show the updated order status
      await fetchOrderDetails(orderId);

    } catch(err) {
      console.error('Error completing order:', err);
      alert(`Error al completar la orden: ${err.message}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    if (!orderId) return;
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('installation_orders')
        .update({ status: newStatus })
        .eq('id', orderId);
      
      if (error) throw error;
      setOrder(prev => ({...prev, status: newStatus}));

    } catch(err) {
      alert(`Error al actualizar el estado: ${err.message}`);
    } finally {
      setUpdating(false);
    }
  };
  
  const allItemsAssigned = items.every(item => {
    const assignedCount = assignedAssets.filter(asset => asset.asset_type === item.asset_type).length;
    return assignedCount >= item.quantity;
  });

  if (loading) {
    return <div className="p-4 text-center text-white flex items-center justify-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /><span className="ml-3">Cargando detalle...</span></div>;
  }

  if (error) {
    return (
        <div className="p-6 bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center">
            <div className="bg-red-900/50 border border-red-700 p-8 rounded-lg text-center max-w-lg">
                <h2 className="text-2xl font-bold mb-4">Error al Cargar</h2>
                <p className="text-red-300">{error}</p>
                <button onClick={() => navigate(-1)} className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                  <ArrowLeft className="inline mr-2"/> Volver
                </button>
            </div>
        </div>
    );
  }
  
  if (!order) {
      return <div className="p-4 text-white text-center">No se encontró la orden especificada.</div>
  }
  
  const actionInfo = getActionInfo(order.action);

  return (
    <>
      <div className="p-4 md:p-6 bg-gray-900 text-white min-h-screen">
          <div className="max-w-4xl mx-auto">
              <button onClick={() => navigate(-1)} className="mb-4 text-blue-400 hover:text-blue-300 flex items-center text-sm">
                <ArrowLeft className="mr-2 h-4 w-4"/> Volver a la lista
              </button>

              <div className="bg-gray-800 rounded-lg shadow-lg p-4 sm:p-6">
                <div className="flex flex-col md:flex-row justify-between md:items-center mb-4">
                  <h1 className="text-2xl sm:text-3xl font-bold text-white">Orden #{order.id.substring(0, 8)}</h1>
                  <span className={`mt-2 md:mt-0 text-xs sm:text-sm font-bold px-3 py-1 rounded-full ${getStatusStyle(order.status)}`}>
                    {order.status}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                        <h2 className="text-lg font-semibold mb-3 border-b border-gray-700 pb-2">Cliente</h2>
                        <p><strong className="text-gray-400">Nombre:</strong> {order.clients?.name || 'N/A'}</p>
                        <p><strong className="text-gray-400">Dirección:</strong> {order.clients?.address || 'N/A'}</p>
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold mb-3 border-b border-gray-700 pb-2">Detalles</h2>
                        <p><strong className="text-gray-400">Acción:</strong> {actionInfo.label}</p>
                        <p><strong className="text-gray-400">Fecha:</strong> {new Date(order.created_at).toLocaleString('es-MX')}</p>
                    </div>
                </div>

                <div className="mt-6">
                    <h2 className="text-lg font-semibold mb-4 border-b border-gray-700 pb-2 flex items-center"><Package className="mr-2"/> Activos Requeridos</h2>
                    {items.length > 0 ? (
                      <div className="space-y-4">
                          {items.map(item => {
                            const assetsOfThisType = assignedAssets.filter(a => a.asset_type === item.asset_type);
                            const assignedCount = assetsOfThisType.length;
                            const isComplete = assignedCount >= item.quantity;
                            return (
                              <div key={item.id} className="p-4 bg-gray-800 border border-gray-700 rounded-md">
                                  <div className="flex justify-between items-start flex-wrap gap-y-2">
                                    <div className='flex-grow'>
                                        <p className="font-bold text-lg text-white">{item.asset_type || 'Activo no especificado'}</p>
                                        <p className={`font-mono text-sm ${isComplete ? 'text-green-400' : 'text-yellow-400'}`}>
                                            {assignedCount} de {item.quantity} asignados
                                        </p>
                                    </div>
                                    {!isComplete && order.status === 'APROBADA' && (
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <button onClick={() => handleScanClick(item)} disabled={updating} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 rounded-md flex items-center text-sm disabled:opacity-50">
                                                {updating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <QrCode className="mr-2 h-4 w-4"/>} Escanear
                                            </button>
                                            <button onClick={() => handleManualAddClick(item)} disabled={updating} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-md flex items-center text-sm disabled:opacity-50">
                                                <Type className="mr-2 h-4 w-4"/> Manual
                                            </button>
                                        </div>
                                    )}
                                    {isComplete && <CheckCircle className="text-green-500 h-6 w-6 mt-1 flex-shrink-0"/>}
                                  </div>
                                  {assignedCount > 0 && (
                                      <div className="mt-3 pt-3 border-t border-gray-600/50">
                                          <p className="text-sm font-semibold mb-2 text-gray-300">Series Asignadas:</p>
                                          <ul className="list-disc list-inside space-y-1 pl-2">
                                              {assetsOfThisType.map(a => (
                                                  <li key={a.id} className="font-mono text-gray-400 text-xs">{a.serial}</li>
                                              ))}
                                          </ul>
                                      </div>
                                  )}
                              </div>
                            )
                          })}
                      </div>
                    ) : (
                      <p className="text-gray-400">No hay ítems en esta orden.</p>
                    )}
                </div>

                {order.status !== 'COMPLETADA' && order.status !== 'CANCELADA' && (
                  <div className="mt-8 pt-6 border-t border-gray-700">
                      <h2 className="text-lg font-semibold mb-4">Actualizar Estado</h2>
                      
                      {items.some(i => i.asset_type === 'FACHADA') && (order.status === 'EN_RUTA' || order.status === 'EN_PROCESO') && (
                          <div className="mb-6 bg-blue-900/10 border border-blue-500/20 p-4 rounded-xl">
                              <label className="text-xs font-semibold text-blue-300 uppercase block mb-2">Evidencia Fotográfica (Fachada Instalada) *</label>
                              <div
                                onClick={() => { if (!compressing) fileRef.current?.click(); }}
                                className={`relative cursor-pointer rounded-lg border-2 border-dashed transition-all h-32 flex flex-col items-center justify-center gap-2 overflow-hidden ${evidencePhoto ? 'border-blue-500/40 bg-blue-500/5' : 'border-gray-600 bg-gray-800 hover:border-gray-500'} ${compressing ? 'opacity-50 pointer-events-none' : ''}`}
                              >
                                {compressing ? (
                                  <>
                                    <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                                    <span className="text-xs text-blue-400 font-bold uppercase">Comprimiendo...</span>
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
                                    <Camera className="w-6 h-6 text-gray-400" />
                                    <span className="text-xs text-gray-400">Toca para tomar foto del trabajo terminado</span>
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
                                    }
                                    setCompressing(false);
                                    e.target.value = '';
                                  }}
                                />
                              </div>
                          </div>
                      )}

                      <div className="flex flex-wrap gap-3">
                          {order.status === 'APROBADA' && 
                            <button onClick={() => handleUpdateStatus('EN_RUTA')} disabled={!allItemsAssigned || updating} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors duration-200 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center" title={!allItemsAssigned ? 'Debes escanear todos los activos solicitados primero' : ''}>
                                {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} Marcar EN RUTA
                            </button>
                          }
                          {(order.status === 'EN_RUTA' || order.status === 'EN_PROCESO') && 
                            <button onClick={handleCompleteOrder} disabled={updating} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition-colors duration-200 disabled:opacity-50 flex items-center">
                                {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} Marcar COMPLETADA
                            </button>
                          }
                      </div>
                  </div>
                )}
              </div>
          </div>
      </div>
      
      <ScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
        title={`Escanear Serial para ${currentItemToUpdate?.asset_type || 'Activo'}`}
        description="Apunta la cámara al código de barras o QR del activo."
      />
    </>
  );
};

export default InstallationDetails;
