import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { 
    X, 
    Save, 
    Loader2, 
    Plus, 
    Trash2, 
    CheckCircle, 
    XCircle, 
    Info, 
    ClipboardList,
    Truck,
    MapPin,
    Calendar,
    User,
    ChevronDown,
    AlertCircle,
    FileCheck,
    FileText,
    Navigation,
    Eye,
    RefreshCw,
    CheckCircle2,
    Warehouse,
    PlusCircle
} from 'lucide-react';
import { getStatusStyle, getActionInfo } from '@/lib/utils';
import { getAssetTypes, completeOrder, getWarehouses, updateOrder } from '@/repositories/ordersRepository';
import { fetchOrdersApi, importOrdersApi, updateOrderApi } from '@/lib/mysqlOrders';
import { motion, AnimatePresence } from 'framer-motion';

const normIdStr = (v) => String(v);
const isNewId = (v) => normIdStr(v).startsWith('new-');

const OrderDetailsModal = ({ orderId, installers, onClose, onActionCompleted }) => {
  const [originalOrder, setOriginalOrder] = useState(null);
  const [editableOrder, setEditableOrder] = useState(null);
  const [availableAssetTypes, setAvailableAssetTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [newAssetType, setNewAssetType] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');

  useEffect(() => {
    const loadData = async () => {
      const [types, whs] = await Promise.all([getAssetTypes(), getWarehouses()]);
      setAvailableAssetTypes(types || []);
      setWarehouses(whs || []);
    };
    loadData();
  }, []);

  const fetchDetails = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const res = await fetchOrdersApi({ id: orderId });
      const orderData = res.rows?.[0];
      if (!orderData) throw new Error("Order not found");

      const installersMap = new Map((installers || []).map(i => [i.id, i.profile?.name]));

      const enrichedOrder = {
        ...orderData,
        origin_client: { 
            name: orderData.origin_client_name, 
            client_code: orderData.origin_client_code,
            address: orderData.origin_client_address,
            business_name: orderData.origin_client_business_name
        },
        destination_client: { 
            name: orderData.destination_client_name,
            address: orderData.destination_client_address,
            business_name: orderData.destination_client_business_name
        },
        installer_name: installersMap.get(orderData.assigned_to) || 'Sin asignar',
        creator_name: orderData.creator_name,
        items: orderData.items || [],
      };

      setOriginalOrder(enrichedOrder);
      setEditableOrder(JSON.parse(JSON.stringify(enrichedOrder))); // deep copy
      setError('');
    } catch (err) {
      console.error(err);
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [orderId, installers]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const handleFieldChange = (field, value) => setEditableOrder(prev => ({ ...prev, [field]: value }));
  
  const handleItemQuantityChange = (itemId, newQuantity) => {
    const q = Math.max(1, Number(newQuantity) || 1);
    setEditableOrder(prev => ({
      ...prev,
      items: prev.items.map(item =>
        normIdStr(item.id) === normIdStr(itemId) ? { ...item, quantity: q } : item
      ),
    }));
  };

  const handleItemSerialChange = (itemId, newSerial) => {
    setEditableOrder(prev => ({
      ...prev,
      items: prev.items.map(it => 
        normIdStr(it.id) === normIdStr(itemId) ? { ...it, asset_serial: newSerial } : it
      )
    }));
  };

  const handleAddItem = () => {
    if (!newAssetType) return;
    setEditableOrder(prev => ({
      ...prev,
      items: [
        ...prev.items,
        { id: `new-${Date.now()}`, asset_type: newAssetType, quantity: 1, order_id: orderId },
      ],
    }));
    setNewAssetType('');
  };

  const handleRemoveItem = (itemIdToRemove) => {
    setEditableOrder(prev => ({ ...prev, items: prev.items.filter(item => normIdStr(item.id) !== normIdStr(itemIdToRemove)) }));
  };

  const handleCompleteOrder = async (warehouseId = null) => {
    const hasSerials = editableOrder.items.every(it => it.asset_serial);
    if (!hasSerials && ['INSTALAR', 'CAMBIO_EQUIPO'].includes(editableOrder.action)) {
        if (!window.confirm("Esta orden de instalación no tiene todos los números de serie asignados. Completarla podría causar errores de inventario. ¿Deseas continuar?")) return;
    }

    setIsSaving(true);
    try {
        // IMPORTANT: Save current items (with serials) before completing
        await updateOrder(orderId, editableOrder);

        // If it's a withdrawal, we might need a warehouse
        const needsWarehouse = ['RETIRAR', 'CAMBIO_EQUIPO'].includes(editableOrder.action);
        if (needsWarehouse && !warehouseId) {
            setShowWarehouseModal(true);
            setIsSaving(false);
            return;
        }
        
        const res = await completeOrder(orderId, warehouseId);
        if (res.status === 'success') {
            setShowWarehouseModal(false);
            onActionCompleted?.();
        } else {
            throw new Error(res.message);
        }
    } catch (err) {
        console.error("Completion error:", err);
        alert(`Error al completar: ${err.message}`);
    } finally {
        setIsSaving(false);
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    if (!orderId || isSaving) return;
    setIsSaving(true);
    try {
      const res = await updateOrderApi(orderId, { status: newStatus });
      if (res.status === 'error') throw new Error(res.message);
      onActionCompleted?.();
    } catch (err) {
      alert(`Error al actualizar estado: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!editableOrder || !originalOrder) return;
    setIsSaving(true);
    try {
      const newStatus = (editableOrder.assigned_to && originalOrder.status === 'PENDIENTE') ? 'APROBADA' : editableOrder.status;

      // 1. Update order fields (assigned_to, status, notes)
      const orderRes = await updateOrderApi(orderId, {
        assigned_to: editableOrder.assigned_to,
        status: newStatus,
        notes: editableOrder.notes
      });
      if (orderRes.status === 'error') throw new Error(orderRes.message);

      // 2. Update items via importOrdersApi (bulk)
      // Strict filtering of fields to avoid server-side SQL errors with unknown columns
      const itemsRes = await importOrdersApi([{
          order: {
              id: editableOrder.id,
              client_id: editableOrder.client_id,
              destination_client_id: editableOrder.destination_client_id,
              action: editableOrder.action,
              assigned_to: editableOrder.assigned_to,
              created_by: editableOrder.created_by,
              status: newStatus,
              notes: editableOrder.notes,
              created_at: editableOrder.created_at
          },
          items: editableOrder.items.map(i => ({
              id: isNewId(i.id) ? null : i.id,
              order_id: i.order_id || orderId,
              asset_type: i.asset_type,
              asset_serial: i.asset_serial,
              quantity: i.quantity,
              condition_status: i.condition_status || 'BUENO',
              notes: i.notes || ''
          }))
      }]);

      if (itemsRes.errors?.length > 0) throw new Error(itemsRes.errors[0].error);
      
      onActionCompleted?.();
    } catch (err) {
      console.error("Save error:", err);
      alert(`Error al guardar: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const isDirty = originalOrder && editableOrder && JSON.stringify(originalOrder) !== JSON.stringify(editableOrder);

  if (!orderId) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-gray-950/80 backdrop-blur-md z-[60] flex justify-center items-end sm:items-center p-0 sm:p-4 overflow-hidden" 
        onClick={onClose}
      >
        <motion.div 
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="bg-gray-900 sm:rounded-3xl shadow-2xl w-full max-w-4xl h-[92vh] sm:h-auto sm:max-h-[85vh] flex flex-col border border-gray-800/50" 
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex justify-between items-center p-6 border-b border-gray-800/50 relative">
            <div className="flex items-center gap-4">
                <div className="bg-blue-600/20 p-3 rounded-2xl border border-blue-500/20 shadow-inner">
                    <ClipboardList className="text-blue-400" size={24} />
                </div>
                <div>
                    <h2 className="text-xl font-black text-white leading-none">Detalles de Orden</h2>
                    <p className="text-[10px] text-gray-500 font-mono mt-1 uppercase tracking-widest">{orderId}</p>
                </div>
            </div>
            <button onClick={onClose} className="p-3 bg-gray-800/50 hover:bg-gray-700/50 text-gray-400 hover:text-white rounded-2xl transition-all"><X size={20}/></button>
          </div>

          {/* Content */}
          <div className="flex-grow overflow-y-auto p-6 space-y-8 custom-scrollbar">
            {loading ? (
                <div className="py-20 text-center">
                    <Loader2 className="h-10 w-10 animate-spin text-blue-500 mx-auto mb-4" />
                    <p className="text-gray-500 font-black text-xs uppercase tracking-widest">Consultando Datos...</p>
                </div>
            ) : error ? (
                <div className="bg-red-900/10 border border-red-700/30 p-8 rounded-3xl text-center">
                    <AlertCircle className="text-red-500 mx-auto mb-4" size={32} />
                    <p className="text-red-400 font-bold">{error}</p>
                </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Info Column */}
                <div className="lg:col-span-5 space-y-6">
                    <section className="bg-gray-800/30 p-5 rounded-3xl border border-gray-800/50 space-y-4">
                        <h3 className="text-[10px] font-black uppercase text-gray-500 tracking-widest flex items-center gap-2">
                            <Info size={12} /> Información General
                        </h3>
                        
                        <div className="space-y-4 pt-2">
                            <div className="flex items-start gap-4">
                                <div className="bg-gray-900/50 p-2 rounded-xl border border-gray-700/50"><MapPin size={16} className="text-gray-400" /></div>
                                <div>
                                    <p className="text-[9px] text-gray-500 uppercase font-black tracking-tighter">Cliente Origen</p>
                                    <p className="text-sm font-bold text-white">{editableOrder.origin_client?.name || '---'}</p>
                                    {editableOrder.origin_client?.business_name && (
                                        <p className="text-xs text-blue-400/80 font-medium">{editableOrder.origin_client.business_name}</p>
                                    )}
                                    <p className="text-[10px] text-gray-400 opacity-60 flex items-center mt-1">
                                        <MapPin size={10} className="mr-1 opacity-50" />
                                        {editableOrder.origin_client?.address || editableOrder.origin_client?.client_code || '---'}
                                    </p>
                                </div>
                            </div>

                            {editableOrder.action === 'MOVER' && (
                                <div className="flex items-start gap-4 pl-4 border-l-2 border-blue-500/20">
                                    <div className="bg-blue-900/20 p-2 rounded-xl border border-blue-500/20"><Truck size={16} className="text-blue-400" /></div>
                                    <div>
                                        <p className="text-[9px] text-blue-500 uppercase font-black tracking-tighter">Cliente Destino</p>
                                        <p className="text-sm font-bold text-white">{editableOrder.destination_client?.name || '---'}</p>
                                        {editableOrder.destination_client?.business_name && (
                                            <p className="text-xs text-blue-400/70 font-medium">{editableOrder.destination_client.business_name}</p>
                                        )}
                                        <p className="text-[10px] text-gray-400 opacity-60 flex items-center mt-1">
                                            <MapPin size={10} className="mr-1 opacity-50" />
                                            {editableOrder.destination_client?.address || '---'}
                                        </p>
                                    </div>
                                </div>
                            )}

                                <div className="grid grid-cols-2 gap-4 pt-2">
                                    <div className="flex items-start gap-3">
                                        <Calendar size={14} className="text-gray-500 mt-0.5" />
                                        <div>
                                            <p className="text-[9px] text-gray-500 uppercase font-black">Fecha / Creador</p>
                                            <p className="text-xs font-bold">{new Date(editableOrder.created_at).toLocaleDateString()}</p>
                                            <p className="text-[10px] text-blue-400/80 font-medium">{editableOrder.creator_name || 'Sistema'}</p>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-gray-500 uppercase font-black mb-1">Estado Actual</p>
                                        <span className={`px-3 py-0.5 text-[9px] font-black rounded-full uppercase border ${getStatusStyle(editableOrder.status).className}`}>
                                            {getStatusStyle(editableOrder.status).text}
                                        </span>
                                    </div>
                                </div>
                        </div>
                    </section>

                    <section className="bg-gray-800/30 p-5 rounded-3xl border border-gray-800/50 space-y-4">
                        <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest flex items-center gap-2 mb-2">
                            <User size={12} /> Asignación de Instalador
                        </label>
                        <div className="relative">
                            <select 
                                value={editableOrder.assigned_to || ''} 
                                onChange={e => handleFieldChange('assigned_to', e.target.value)} 
                                className="w-full bg-gray-950 border-2 border-gray-800 rounded-2xl p-4 text-sm text-white appearance-none focus:border-blue-500/50 transition-all outline-none disabled:opacity-50"
                                disabled={['COMPLETADA', 'CANCELADA'].includes(originalOrder.status)}
                            >
                                <option value="">--- Sin Asignar ---</option>
                                {installers.map(inst => (<option key={inst.id} value={inst.id}>{inst.profile.name}</option>))}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" size={16} />
                        </div>
                    </section>

                    {/* --- SECCIÓN DE DOCUMENTOS Y GEO --- */}
                    {(() => {
                        let parsedNotes = null;
                        try {
                            parsedNotes = JSON.parse(editableOrder.notes);
                        } catch (e) {
                            // No es JSON, es texto normal
                        }

                        if (!parsedNotes || (!parsedNotes.attachments && !parsedNotes.location && !parsedNotes.text_notes && typeof editableOrder.notes !== 'string')) return null;

                        return (
                            <section className="bg-gray-800/30 p-5 rounded-3xl border border-gray-800/50 space-y-4">
                                <h3 className="text-[10px] font-black uppercase text-gray-500 tracking-widest flex items-center gap-2">
                                    <FileCheck size={12} /> Evidencia Obligatoria
                                </h3>
                                
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {parsedNotes.attachments?.photo_ine && (
                                        <div className="space-y-2">
                                            <p className="text-[9px] text-gray-500 uppercase font-black">INE</p>
                                            <div 
                                                onClick={() => setSelectedPhoto({ src: parsedNotes.attachments.photo_ine, label: 'INE' })}
                                                className="relative aspect-video rounded-xl overflow-hidden border border-gray-700 cursor-pointer group"
                                            >
                                                <img src={parsedNotes.attachments.photo_ine} className="w-full h-full object-cover" alt="INE" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                    <Eye className="text-white" size={20} />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {parsedNotes.attachments?.photo_address && (
                                        <div className="space-y-2">
                                            <p className="text-[9px] text-gray-500 uppercase font-black">Comprobante</p>
                                            <div 
                                                onClick={() => setSelectedPhoto({ src: parsedNotes.attachments.photo_address, label: 'Comprobante Domicilio' })}
                                                className="relative aspect-video rounded-xl overflow-hidden border border-gray-700 cursor-pointer group"
                                            >
                                                <img src={parsedNotes.attachments.photo_address} className="w-full h-full object-cover" alt="Comprobante" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                    <Eye className="text-white" size={20} />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {parsedNotes.attachments?.photo_before && (
                                        <div className="space-y-2">
                                            <p className="text-[9px] text-gray-500 uppercase font-black text-amber-500">Evidencia Antes</p>
                                            <div 
                                                onClick={() => setSelectedPhoto({ src: parsedNotes.attachments.photo_before, label: 'Evidencia Antes de Instalar' })}
                                                className="relative aspect-video rounded-xl overflow-hidden border border-amber-500/30 cursor-pointer group"
                                            >
                                                <img src={parsedNotes.attachments.photo_before} className="w-full h-full object-cover" alt="Evidencia Antes" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                    <Eye className="text-white" size={20} />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {parsedNotes.attachments?.photo_after && (
                                        <div className="space-y-2">
                                            <p className="text-[9px] text-gray-500 uppercase font-black text-emerald-500">Evidencia Instalación</p>
                                            <div 
                                                onClick={() => setSelectedPhoto({ src: parsedNotes.attachments.photo_after, label: 'Evidencia de Trabajo Terminado' })}
                                                className="relative aspect-video rounded-xl overflow-hidden border border-emerald-500/30 cursor-pointer group"
                                            >
                                                <img src={parsedNotes.attachments.photo_after} className="w-full h-full object-cover" alt="Evidencia Después" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                    <Eye className="text-white" size={20} />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {parsedNotes.location && (
                                    <div className="pt-2 border-t border-gray-700/50">
                                        <p className="text-[9px] text-gray-500 uppercase font-black mb-2">Ubicación Capturada</p>
                                        <a 
                                            href={`https://www.google.com/maps?q=${parsedNotes.location.lat},${parsedNotes.location.lng}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-between bg-gray-900/50 p-3 rounded-2xl border border-blue-500/20 hover:bg-blue-500/10 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
                                                    <Navigation size={14} />
                                                </div>
                                                <span className="text-[10px] font-bold text-gray-300">Abrir en Google Maps</span>
                                            </div>
                                            <div className="text-[9px] font-mono text-gray-500">
                                                {parsedNotes.location.lat.toFixed(6)}, {parsedNotes.location.lng.toFixed(6)}
                                            </div>
                                        </a>
                                    </div>
                                )}

                                {(parsedNotes.text_notes || (typeof editableOrder.notes === 'string' && !editableOrder.notes.startsWith('{') && editableOrder.notes)) && (
                                    <div className="pt-2 border-t border-gray-700/50">
                                        <p className="text-[9px] text-gray-500 uppercase font-black mb-1">Notas e Instrucciones</p>
                                        <p className="text-xs text-gray-300 italic p-3 bg-gray-900/50 rounded-2xl border border-gray-800">
                                            "{parsedNotes.text_notes || editableOrder.notes}"
                                        </p>
                                    </div>
                                )}
                            </section>
                        );
                    })()}
                </div>

                {/* Items and Notes Column */}
                <div className="lg:col-span-7 space-y-6">
                    <section className="bg-gray-800/20 p-6 rounded-3xl border border-gray-800/30">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-black text-white flex items-center gap-3">
                                <div className="w-2 h-6 bg-blue-600 rounded-full"></div>
                                Activos
                                <span className="bg-gray-800 px-2 py-0.5 rounded-lg text-[10px] font-mono text-gray-500 border border-gray-700">
                                    {editableOrder.items.length}
                                </span>
                            </h3>
                        </div>

                        <div className="space-y-3">
                            {editableOrder.items.map(item => (
                                <motion.div 
                                    layout
                                    key={item.id} 
                                    className="bg-gray-900/60 p-4 rounded-2xl flex items-center justify-between border border-gray-800/50 group hover:border-gray-700 transition-all"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="bg-gray-800 p-2 rounded-xl text-blue-400 group-hover:scale-110 transition-transform"><Plus size={16}/></div>
                                        <div>
                                            <p className="text-sm font-bold text-white leading-tight">{item.asset_type}</p>
                                            <div className="mt-1 flex items-center gap-2">
                                                <span className="text-[9px] font-black text-gray-500 uppercase">S/N:</span>
                                                <input 
                                                    type="text"
                                                    placeholder="Ingresar serie..."
                                                    value={item.asset_serial || ''}
                                                    onChange={e => handleItemSerialChange(item.id, e.target.value)}
                                                    className="bg-gray-800/50 border border-gray-700/50 text-white text-[10px] px-2 py-0.5 rounded-lg w-32 font-mono focus:border-blue-500/50 outline-none transition-colors"
                                                />
                                            </div>
                                            {!item.asset_serial && (
                                                <p className="text-[8px] text-amber-500/70 font-medium italic mt-1 animate-pulse">Pendiente de asignación física</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className='flex items-center gap-4'>
                                        <div className='flex items-center gap-2 bg-gray-950 p-1.5 rounded-xl border border-gray-800'>
                                            <input 
                                                type="number" 
                                                min="1" 
                                                value={item.quantity} 
                                                onChange={e => handleItemQuantityChange(item.id, e.target.value)} 
                                                className="bg-transparent rounded text-white text-xs w-10 text-center font-bold focus:outline-none" 
                                            />
                                        </div>
                                        <button onClick={() => handleRemoveItem(item.id)} className="p-2 text-gray-600 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        <div className="mt-4 flex gap-2 items-center">
                            <div className="relative flex-grow">
                                <select 
                                    value={newAssetType} 
                                    onChange={e => setNewAssetType(e.target.value)} 
                                    className="w-full bg-gray-950/70 border-2 border-gray-800 rounded-2xl p-3 text-xs text-white appearance-none outline-none focus:border-blue-500/30"
                                >
                                    <option value="">Seleccionar Tipo...</option>
                                    {availableAssetTypes.map(type => <option key={type} value={type}>{type}</option>)}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-700 pointer-events-none" size={14} />
                            </div>
                            <button 
                                onClick={handleAddItem} 
                                disabled={!newAssetType} 
                                className="bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-2xl shadow-lg transition-all disabled:opacity-30 active:scale-95"
                            >
                                <Plus size={20}/>
                            </button>
                        </div>
                    </section>

                    <section className="bg-gray-800/20 p-6 rounded-3xl border border-gray-800/30">
                        <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest block mb-3">Notas de Trabajo</label>
                        <textarea 
                            value={editableOrder.notes || ''} 
                            onChange={e => handleFieldChange('notes', e.target.value)} 
                            placeholder="Añade instrucciones o comentarios aquí..."
                            rows="4" 
                            className="w-full bg-gray-950/50 border-2 border-gray-800 rounded-3xl p-4 text-sm text-gray-300 focus:border-blue-500/30 outline-none transition-all resize-none"
                        />
                    </section>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-6 border-t border-gray-800/50 bg-gray-900/50 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex gap-2 w-full sm:w-auto">
                {['PENDIENTE', 'APROBADA', 'COMPLETADA'].includes(originalOrder?.status) && (
                    <>
                        {originalOrder?.status === 'PENDIENTE' && (
                            <button 
                                onClick={() => handleUpdateStatus('APROBADA')} 
                                disabled={isSaving} 
                                className="bg-green-600/10 hover:bg-green-600 text-green-500 hover:text-white border border-green-600/30 font-bold py-3 px-6 rounded-2xl flex-grow flex items-center justify-center transition-all disabled:opacity-30 active:scale-95 text-xs"
                            >
                                <CheckCircle className="mr-2 h-4 w-4"/> Aprobar
                            </button>
                        )}
                        {['APROBADA', 'COMPLETADA'].includes(originalOrder?.status) && (
                            <div className="flex flex-col sm:flex-row gap-2 w-full">
                                <button 
                                    onClick={() => handleUpdateStatus('PENDIENTE')} 
                                    disabled={isSaving} 
                                    className="bg-amber-600/10 hover:bg-amber-600 text-amber-500 hover:text-white border border-amber-600/30 font-bold py-3 px-6 rounded-2xl flex-grow flex items-center justify-center transition-all disabled:opacity-30 active:scale-95 text-xs"
                                >
                                    <RefreshCw className="mr-2 h-4 w-4"/> Regresar a Pendiente
                                </button>
                                {originalOrder?.status !== 'COMPLETADA' && (
                                    <button 
                                        onClick={() => handleCompleteOrder()} 
                                        disabled={isSaving} 
                                        className="bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white border border-blue-600/30 font-bold py-3 px-6 rounded-2xl flex-grow flex items-center justify-center transition-all disabled:opacity-30 active:scale-95 text-xs"
                                    >
                                        <CheckCircle2 className="mr-2 h-4 w-4"/> Completar y Mover Activos
                                    </button>
                                )}
                            </div>
                        )}
                        <button 
                            onClick={() => handleUpdateStatus('CANCELADA')} 
                            disabled={isSaving} 
                            className="bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-600/30 font-bold py-3 px-6 rounded-2xl flex-grow flex items-center justify-center transition-all disabled:opacity-30 active:scale-95 text-xs"
                        >
                            <XCircle className="mr-2 h-4 w-4"/> Cancelar
                        </button>
                    </>
                )}
            </div>
            <button 
                onClick={handleSave} 
                disabled={!isDirty || isSaving} 
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-black py-4 px-10 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-900/20 disabled:opacity-30 disabled:grayscale transition-all active:scale-95"
            >
                {isSaving ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <Save className="mr-2 h-5 w-5" />} 
                GUARDAR CAMBIOS
            </button>
          </div>
        </motion.div>

        {/* Modal de Selección de Almacén */}
        <AnimatePresence>
            {showWarehouseModal && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4"
                >
                    <motion.div 
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        className="bg-gray-900 border border-gray-800 rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl space-y-6"
                    >
                        <div className="flex flex-col items-center text-center space-y-4">
                            <div className="w-20 h-20 bg-blue-600/10 rounded-full flex items-center justify-center border border-blue-500/20">
                                <Warehouse size={40} className="text-blue-400" />
                            </div>
                            <h3 className="text-2xl font-black text-white">¿A qué almacén va?</h3>
                            <p className="text-gray-400 text-sm">Selecciona el destino del equipo que se está retirando para actualizar el inventario correctamente.</p>
                        </div>

                        <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                            {warehouses.map(wh => (
                                <button
                                    key={wh.id}
                                    onClick={() => setSelectedWarehouseId(wh.id)}
                                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                                        selectedWarehouseId === wh.id 
                                            ? 'bg-blue-600/20 border-blue-500 text-white' 
                                            : 'bg-gray-800/30 border-gray-800 text-gray-400 hover:border-gray-700'
                                    }`}
                                >
                                    <div className={`p-2 rounded-xl ${selectedWarehouseId === wh.id ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-500'}`}>
                                        <Warehouse size={16} />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold text-sm">{wh.name}</p>
                                        <p className="text-[10px] opacity-60 truncate max-w-[200px]">{wh.address || 'Sin dirección'}</p>
                                    </div>
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-4">
                            <button 
                                onClick={() => { setShowWarehouseModal(false); setSelectedWarehouseId(''); }}
                                className="py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest text-gray-500 hover:bg-gray-800 transition-all"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={() => handleCompleteOrder(selectedWarehouseId)}
                                disabled={!selectedWarehouseId || isSaving}
                                className="bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl shadow-blue-600/20 disabled:opacity-30 transition-all active:scale-95"
                            >
                                {isSaving ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Confirmar Retiro'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>

        {/* Modal de Foto Full Size */}
        <AnimatePresence>
            {selectedPhoto && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[70] bg-black/95 flex flex-col items-center justify-center p-4"
                    onClick={() => setSelectedPhoto(null)}
                >
                    <div className="absolute top-6 right-6">
                        <button className="p-4 bg-gray-800 rounded-full text-white"><X size={24} /></button>
                    </div>
                    <div className="max-w-4xl w-full">
                        <p className="text-center text-xs font-black uppercase tracking-widest text-gray-500 mb-4">{selectedPhoto.label}</p>
                        <img 
                            src={selectedPhoto.src} 
                            className="w-full h-auto max-h-[80vh] object-contain rounded-2xl shadow-2xl" 
                            alt="Full Document" 
                        />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};

export default OrderDetailsModal;
