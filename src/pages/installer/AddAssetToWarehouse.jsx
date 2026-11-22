import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { Loader2, Warehouse, PlusCircle, Search, Box, ArrowRightLeft } from 'lucide-react';
import { getAssets, createAsset, updateAsset, getWarehouses } from '@/repositories/ordersRepository';

const AddAssetToWarehouse = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [userWarehouses, setUserWarehouses] = useState([]); // Warehouses assigned to this user
  const [allWarehouses, setAllWarehouses] = useState([]); // ALL warehouses in the system (for transfers)
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddMode, setIsAddMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Transfer modal state
  const [transferAsset, setTransferAsset] = useState(null);
  const [transferTargetWarehouseId, setTransferTargetWarehouseId] = useState('');

  const [assetData, setAssetData] = useState({
    type: 'ENFRIADOR',
    brand: '',
    model: '',
    serial: '',
    qr_value: '',
    warehouse_id: ''
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        navigate('/login');
        return;
      }
      const currentUser = session.user;
      setUser(currentUser);

      // Fetch user profile to get warehouse_ids
      const { data: profile } = await supabase
        .from('profiles')
        .select('warehouse_ids')
        .eq('id', currentUser.id)
        .single();

      let userWarehouseIds = profile?.warehouse_ids || [];

      // Fallback: check owner_profile if JSONB array is empty
      if (userWarehouseIds.length === 0) {
        const { data: ownedWarehouses } = await supabase
          .from('warehouses')
          .select('id')
          .eq('owner_profile', currentUser.id);
        if (ownedWarehouses?.length > 0) {
          userWarehouseIds = ownedWarehouses.map(w => w.id);
        }
      }

      if (userWarehouseIds.length === 0) {
        setError('No tienes ningún almacén asignado en tu perfil. Contacta a un administrador.');
        setLoading(false);
        return;
      }

      // Fetch ALL warehouses to allow transferring out
      const allWh = await getWarehouses();
      setAllWarehouses(allWh || []);

      // Determine which ones are assigned to this user
      const assigned = (allWh || []).filter(w => userWarehouseIds.includes(w.id));
      setUserWarehouses(assigned);

      if (assigned?.length === 1) {
        setAssetData(prev => ({ ...prev, warehouse_id: assigned[0].id }));
      }

      // Fetch inventory for the ASSIGNED warehouses
      const inventory = await getAssets({
        warehouse_ids: JSON.stringify(userWarehouseIds)
      });
      
      // Filter out installed assets since they are no longer in the warehouse
      const activeInventory = (inventory || []).filter(a => a.status !== 'INSTALADO');
      setAssets(activeInventory);

    } catch (err) {
      console.error('Error fetching warehouse data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setAssetData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!assetData.warehouse_id) {
      alert('Por favor, selecciona un almacén de destino.');
      return;
    }
    if (!assetData.serial) {
        alert('El número de serie es obligatorio.');
        return;
    }

    setSubmitting(true);
    setError('');

    try {
      await createAsset({
        ...assetData,
        status: 'EN_ALMACEN'
      }, assetData.warehouse_id);

      alert('¡Activo añadido al almacén correctamente!');
      setIsAddMode(false);
      setAssetData({
        type: 'ENFRIADOR', brand: '', model: '', serial: '', qr_value: '', 
        warehouse_id: userWarehouses.length === 1 ? userWarehouses[0].id : ''
      });
      fetchData(); // Refresh inventory

    } catch (err) {
      console.error('Error submitting asset:', err);
      setError(`Error al crear el activo: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    if (!transferAsset || !transferTargetWarehouseId) return;

    setSubmitting(true);
    try {
      await updateAsset({
        id: transferAsset.id,
        serial: transferAsset.serial,
        type: transferAsset.type,
        status: transferAsset.status,
        warehouse_id: transferTargetWarehouseId
      });
      
      alert('¡Equipo transferido exitosamente!');
      setTransferAsset(null);
      setTransferTargetWarehouseId('');
      fetchData(); // Refresh list to reflect removal
    } catch (err) {
      console.error('Error transferring asset:', err);
      alert(`Error al transferir: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredAssets = assets.filter(a => 
    (a.serial && a.serial.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (a.brand && a.brand.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (a.model && a.model.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return <div className="p-4 text-center text-white flex items-center justify-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /><span className="ml-3">Cargando Mi Almacén...</span></div>;
  }

  return (
    <div className="p-4 md:p-6 bg-gray-900 text-white min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <h1 className="text-3xl font-bold text-white flex items-center">
            <Warehouse className="mr-3 text-blue-400 h-8 w-8"/> Mi Almacén
          </h1>
          <button 
            onClick={() => { setIsAddMode(!isAddMode); setTransferAsset(null); }} 
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center transition-colors"
          >
            {isAddMode ? 'Ver Inventario' : <><PlusCircle className="mr-2 h-5 w-5"/> Añadir Activo</>}
          </button>
        </div>

        {error && <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-lg mb-6">{error}</div>}

        {/* Transfer Modal */}
        {transferAsset && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-center items-center p-4">
            <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700 p-6">
              <h2 className="text-xl font-bold text-white mb-2 flex items-center"><ArrowRightLeft className="mr-2 text-amber-400"/> Transferir Equipo</h2>
              <p className="text-sm text-gray-400 mb-6">Transfiriendo equipo serie <strong className="text-white">{transferAsset.serial}</strong> a otro almacén.</p>
              
              <form onSubmit={handleTransferSubmit}>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-300 mb-2">Selecciona el Almacén Destino</label>
                  <select
                    required
                    value={transferTargetWarehouseId}
                    onChange={(e) => setTransferTargetWarehouseId(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg p-3 focus:ring-2 focus:ring-amber-500 outline-none"
                  >
                    <option value="" disabled>-- Selecciona un almacén --</option>
                    {allWarehouses.filter(w => w.id !== transferAsset.warehouse_id).map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-3">
                  <button type="button" disabled={submitting} onClick={() => setTransferAsset(null)} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">Cancelar</button>
                  <button type="submit" disabled={submitting || !transferTargetWarehouseId} className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center">
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null} 
                    Transferir
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isAddMode ? (
          <div className="bg-gray-800 rounded-xl shadow-lg p-6 max-w-2xl mx-auto border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4 border-b border-gray-700 pb-2">Registrar Nuevo Equipo</h2>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Almacén de Destino *</label>
                <select
                  name="warehouse_id"
                  value={assetData.warehouse_id}
                  onChange={handleInputChange}
                  required
                  disabled={userWarehouses.length <= 1}
                  className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-70"
                >
                  <option value="" disabled>-- Selecciona un almacén --</option>
                  {userWarehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Tipo de Activo *</label>
                  <select name="type" value={assetData.type} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="ENFRIADOR">Enfriador</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Número de Serie *</label>
                  <input type="text" name="serial" value={assetData.serial} onChange={handleInputChange} required placeholder="Ej. ABC123456" className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Marca</label>
                  <input type="text" name="brand" value={assetData.brand} onChange={handleInputChange} placeholder="Opcional" className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Modelo</label>
                  <input type="text" name="model" value={assetData.model} onChange={handleInputChange} placeholder="Opcional" className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-1">Código QR</label>
                  <input type="text" name="qr_value" value={assetData.qr_value} onChange={handleInputChange} placeholder="Opcional. Se usará el número de serie si se deja vacío." className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsAddMode(false)} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={submitting || !assetData.warehouse_id} className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded-lg transition-colors disabled:opacity-50 flex items-center">
                  {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : null} 
                  Guardar Activo
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-800/50">
              <div className="flex items-center gap-2 text-gray-300">
                <Box className="h-5 w-5 text-blue-400" />
                <span className="font-semibold">{assets.length} Activos en almacén</span>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Buscar serie, marca o modelo..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="bg-gray-900/80 text-gray-400 uppercase text-xs">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Número de Serie</th>
                    <th className="px-6 py-4 font-semibold">Tipo</th>
                    <th className="px-6 py-4 font-semibold">Marca / Modelo</th>
                    <th className="px-6 py-4 font-semibold">Estado</th>
                    <th className="px-6 py-4 font-semibold">Almacén</th>
                    <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {filteredAssets.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                        No se encontraron activos. Usa el botón "Añadir Activo" para registrar uno.
                      </td>
                    </tr>
                  ) : (
                    filteredAssets.map(asset => (
                      <tr key={asset.id} className="hover:bg-gray-700/20 transition-colors">
                        <td className="px-6 py-4 font-medium text-white">{asset.serial}</td>
                        <td className="px-6 py-4">{asset.type}</td>
                        <td className="px-6 py-4">
                          {asset.brand || 'N/A'} {asset.model ? `/ ${asset.model}` : ''}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold tracking-wider ${
                            asset.status === 'EN_ALMACEN' ? 'bg-blue-500/20 text-blue-400' :
                            asset.status === 'INSTALADO' ? 'bg-green-500/20 text-green-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {asset.status || 'DESCONOCIDO'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-400">
                          {asset.warehouse_name || userWarehouses.find(w => w.id === asset.warehouse_id)?.name || 'Central'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => setTransferAsset(asset)}
                            className="bg-gray-700 hover:bg-gray-600 text-gray-200 py-1 px-3 rounded text-xs font-semibold flex items-center ml-auto transition-colors"
                          >
                            <ArrowRightLeft className="h-3 w-3 mr-1"/> Transferir
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddAssetToWarehouse;
