import React, { useState, useEffect, useCallback } from 'react';
import { getAssets, deactivateAsset } from '../../repositories/ordersRepository';
import { getAssetTypes } from '../../repositories/metadataRepository';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import AddAssetModal from '@/components/admin/AddAssetModal';
import EditAssetModal from '@/components/admin/EditAssetModal';
import AssetHistoryModal from '@/components/admin/AssetHistoryModal';
import AssetTypesManager from '@/components/admin/AssetTypesManager';
import { Settings, Trash2, Edit, History, Search, Filter, X, PlusCircle } from 'lucide-react';

const AdminInventory = () => {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isTypesModalOpen, setIsTypesModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const { user } = useSupabaseAuth();
  const userRole = (user?.user_metadata?.type || user?.user_metadata?.role || '').toLowerCase();
  const isAdmin = userRole.includes('admin');

  // States for filtering and search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [assetTypes, setAssetTypes] = useState([]);
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    if (user?.id) {
      import('@/supabaseClient').then(({ supabase }) => {
        supabase.from('profiles').select('warehouse_ids').eq('id', user.id).single()
          .then(({ data }) => {
            if (data) setUserProfile(data);
          });
      });
    }
  }, [user?.id]);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      console.log('[AdminInventory] Fetching assets with params:', { searchTerm, filterType, filterStatus });
      const params = {
        serial: searchTerm,
        type: filterType,
        status: filterStatus
      };
      
      // Filter by warehouse_ids for non-admins
      if (!isAdmin && userProfile?.warehouse_ids && Array.isArray(userProfile.warehouse_ids) && userProfile.warehouse_ids.length > 0) {
        params.warehouse_ids = JSON.stringify(userProfile.warehouse_ids);
      }

      const data = await getAssets(params);
      console.log('[AdminInventory] Assets received:', data);
      setAssets(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching assets:', err);
      setError('No se pudo cargar el inventario. Revise la consola para más detalles.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, filterType, filterStatus]);

  const fetchAssetTypes = useCallback(async () => {
    try {
        const types = await getAssetTypes();
        setAssetTypes(types || []);
    } catch (e) {
        console.error('Error loading types:', e);
    }
  }, []);

  useEffect(() => {
    fetchAssets();
    fetchAssetTypes();
  }, [fetchAssets, fetchAssetTypes]);

  const handleAddSuccess = (newAsset) => {
    fetchAssets(); // Re-fetch to get the full asset data including warehouse name
    closeModal();
  };

  const handleEditClick = (asset) => {
    setSelectedAsset(asset);
    setIsEditModalOpen(true);
  };
  
  const handleHistoryClick = (asset) => {
    setSelectedAsset(asset);
    setIsHistoryModalOpen(true);
  };

  const handleUpdateSuccess = (updatedAsset) => {
    setAssets(prevAssets => 
      prevAssets.map(asset => 
        asset.id === updatedAsset.id ? { ...asset, ...updatedAsset } : asset
      )
    );
    fetchAssets(); // Re-fetch to ensure data consistency
    closeModal();
  };
  
  const clearFilters = () => {
      setSearchTerm('');
      setFilterType('');
      setFilterStatus('');
  }

  const handleDeactivate = async (asset) => {
      if (!window.confirm(`¿Estás seguro de dar de BAJA el activo con serie ${asset.serial}? Esta acción lo marcará como inactivo permanentemente.`)) return;
      try {
          await deactivateAsset(asset.id);
          fetchAssets();
      } catch (e) {
          alert('Error al dar de baja el activo');
      }
  }

  const closeModal = () => {
      setIsAddModalOpen(false);
      setIsEditModalOpen(false);
      setIsHistoryModalOpen(false);
      setIsTypesModalOpen(false);
      setSelectedAsset(null);
  }

  if (error) {
    return <div className="p-4 text-red-500 text-center">{error}</div>;
  }

  return (
    <>
      <div className="w-full text-white font-sans selection:bg-blue-500/30">
        <div className="w-full max-w-[1600px] mx-auto">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8">
            <div className="space-y-1">
              <h1 className="text-xl sm:text-3xl md:text-4xl font-black uppercase tracking-tighter text-white flex items-center gap-3">
                <div className="w-1.5 md:w-2.5 h-8 md:h-10 bg-emerald-500 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
                Inventario Maestro
              </h1>
              <p className="text-slate-500 text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] md:tracking-[0.3em] ml-1">Control Global de Activos y Equipamiento</p>
            </div>
            
            <div className="flex flex-wrap gap-2 w-full lg:w-auto">
              <button 
                  onClick={() => setIsTypesModalOpen(true)}
                  className="flex-1 lg:flex-none bg-slate-900/50 hover:bg-slate-800 text-slate-300 font-bold py-3 px-4 md:px-6 rounded-xl transition-all border border-slate-800 hover:border-slate-700 flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest active:scale-95"
              >
                  <Settings size={16} className="text-slate-500" /> Tipos
              </button>
              <button 
                  onClick={() => setIsAddModalOpen(true)}
                  className="flex-1 lg:flex-none bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 px-4 md:px-8 rounded-xl transition-all shadow-xl shadow-emerald-900/20 hover:shadow-emerald-500/10 flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest active:scale-95"
              >
                  <PlusCircle size={16} /> Nuevo
              </button>
            </div>
          </div>

          {/* Filtros Auto-ajustables */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-8 p-4 bg-slate-900/40 border border-slate-800/50 backdrop-blur-md rounded-3xl">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-500 transition-colors" size={16} />
                <input 
                    type="text"
                    placeholder="Buscar por serial..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-xs text-white focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 outline-none transition-all placeholder:text-slate-600"
                />
              </div>

              <div className="relative">
                <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <select 
                    value={filterType} 
                    onChange={(e) => setFilterType(e.target.value)} 
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-xs text-white focus:border-emerald-500/50 outline-none transition-all appearance-none cursor-pointer"
                >
                    <option value="">Todos los Tipos</option>
                    {assetTypes.map(t => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
              </div>

              <div className="relative">
                <Settings className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <select 
                    value={filterStatus} 
                    onChange={(e) => setFilterStatus(e.target.value)} 
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-xs text-white focus:border-emerald-500/50 outline-none transition-all appearance-none cursor-pointer"
                >
                    <option value="">Cualquier Estado</option>
                    <option value="EN_ALMACEN">EN ALMACÉN</option>
                    <option value="INSTALADO">INSTALADO</option>
                    <option value="EN_TRANSITO">EN TRÁNSITO</option>
                    <option value="EN_MANTENIMIENTO">EN MANTENIMIENTO</option>
                    <option value="DE_BAJA">DE BAJA</option>
                </select>
              </div>

              <button 
                  onClick={clearFilters} 
                  className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-bold py-3 px-6 rounded-xl transition-all border border-slate-700/50 flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest"
              >
                  <X size={16} /> Limpiar
              </button>
          </div>
          
          {/* Table for Desktop / Cards for Mobile */}
          <div className="bg-slate-900/30 border border-slate-800/50 rounded-2xl md:rounded-3xl overflow-hidden backdrop-blur-sm shadow-2xl">
              {loading ? (
                  <div className="p-16 text-center flex flex-col items-center gap-4">
                    <div className="relative">
                      <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                    </div>
                    <span className="text-slate-500 font-black text-[10px] uppercase tracking-[0.4em] animate-pulse">Sincronizando...</span>
                  </div>
              ) : (
                <>
                  {/* Vista Mobile: Cards */}
                  <div className="block md:hidden p-4 space-y-4">
                    {assets.length > 0 ? (
                      assets.map(asset => (
                        <div key={asset.id} className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4 space-y-3 relative overflow-hidden group">
                           {/* Status Badge Floated */}
                           <div className={`absolute top-0 right-0 px-3 py-1 text-[8px] font-black uppercase tracking-tighter border-b border-l rounded-bl-xl ${
                                asset.status === 'EN_ALMACEN' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                                asset.status === 'INSTALADO' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                asset.status === 'DE_BAJA' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              }`}>
                                {asset.status?.replace('_', ' ')}
                           </div>

                           <div className="flex flex-col">
                              <span className="text-emerald-400 font-mono font-black text-sm tracking-tighter">{asset.serial || 'SIN SERIE'}</span>
                              <span className="text-slate-500 text-[10px] font-bold uppercase">{asset.type || 'OTRO'}</span>
                           </div>

                           <div className="flex justify-between items-end border-t border-slate-800/50 pt-3">
                              <div className="flex flex-col">
                                <span className="text-slate-200 text-xs font-bold">{asset.brand || 'Genérica'}</span>
                                <span className="text-slate-500 text-[10px]">{asset.model || 'Modelo Estándar'}</span>
                              </div>
                              <div className="flex gap-1">
                                {isAdmin && (
                                  <button onClick={() => handleEditClick(asset)} className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg">
                                    <Edit size={16} />
                                  </button>
                                )}
                                <button onClick={() => handleHistoryClick(asset)} className="p-2 text-slate-400 hover:bg-slate-700 rounded-lg">
                                  <History size={16} />
                                </button>
                                {isAdmin && (
                                  <button onClick={() => handleDeactivate(asset)} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg">
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </div>
                           </div>

                           <div className="bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/50">
                              <p className="text-[9px] text-slate-500 font-black uppercase mb-1">Ubicación / Resguardo</p>
                              {asset.status === 'INSTALADO' ? (
                                <p className="text-[10px] text-slate-200 font-bold truncate">{asset.current_client_name || 'Desconocido'}</p>
                              ) : (
                                <p className="text-[10px] text-emerald-400 font-black uppercase tracking-tighter">{asset.warehouse_name || 'Sin Almacén'}</p>
                              )}
                           </div>
                        </div>
                      ))
                    ) : (
                       <div className="py-10 text-center opacity-30 text-xs font-black uppercase tracking-widest">Sin resultados</div>
                    )}
                  </div>

                  {/* Vista Desktop: Table */}
                  <div className="hidden md:block overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900/80 border-b border-slate-800">
                          <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Serie / QR</th>
                          <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Categoría</th>
                          <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Identificación</th>
                          <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Estado</th>
                          <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Ubicación Geográfica</th>
                          <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {assets.length > 0 ? (
                          assets.map(asset => (
                            <tr key={asset.id} className="hover:bg-blue-500/[0.02] transition-colors group">
                              <td className="px-8 py-5">
                                  <div className="flex flex-col">
                                      <span className="font-mono font-black text-white text-sm tracking-tighter group-hover:text-emerald-400 transition-colors">{asset.serial || 'N/A'}</span>
                                      <span className="text-[10px] text-slate-600 font-bold uppercase">{asset.qr_value ? 'QR Vinculado' : 'Sin QR'}</span>
                                  </div>
                              </td>
                              <td className="px-8 py-5">
                                  <span className="px-3 py-1 bg-slate-800/50 text-slate-400 text-[10px] font-black rounded-lg border border-slate-700/50 group-hover:border-slate-500/30 transition-all uppercase">
                                      {asset.type || 'OTRO'}
                                  </span>
                              </td>
                              <td className="px-8 py-5">
                                  <div className="flex flex-col">
                                      <span className="text-slate-200 text-xs font-bold">{asset.brand || 'Genérica'}</span>
                                      <span className="text-slate-500 text-[10px]">{asset.model || 'Modelo Estándar'}</span>
                                  </div>
                              </td>
                              <td className="px-8 py-5">
                                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${
                                  asset.status === 'EN_ALMACEN' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                                  asset.status === 'INSTALADO' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                  asset.status === 'DE_BAJA' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                  'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                }`}>
                                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                                      asset.status === 'EN_ALMACEN' ? 'bg-blue-400' : 
                                      asset.status === 'INSTALADO' ? 'bg-emerald-400' : 
                                      'bg-amber-400'
                                  }`}></div>
                                  {(asset.status || 'N/A').replace('_', ' ')}
                                </div>
                              </td>
                              <td className="px-8 py-5">
                                {asset.status === 'INSTALADO' ? (
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-1.5">
                                      <Search size={10} className="text-slate-500" />
                                      <span className="text-slate-100 text-xs font-bold truncate max-w-[200px]">{asset.current_client_name || 'Desconocido'}</span>
                                    </div>
                                    <span className="text-slate-500 text-[10px] truncate max-w-[250px] ml-4">{asset.current_client_address || ''}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <Filter size={10} className="text-emerald-500/50" />
                                    <span className="text-emerald-400/80 text-xs font-black uppercase tracking-tighter">{asset.warehouse_name || 'Sin Almacén'}</span>
                                  </div>
                                )}
                              </td>
                              <td className="px-8 py-5 text-right">
                                  <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                      {isAdmin && (
                                          <button onClick={() => handleEditClick(asset)} className="p-2.5 text-blue-400 hover:bg-blue-500/20 rounded-2xl transition-all" title="Editar Metadatos">
                                              <Edit size={18} />
                                          </button>
                                      )}
                                      <button onClick={() => handleHistoryClick(asset)} className="p-2.5 text-slate-400 hover:bg-slate-700 rounded-2xl transition-all" title="Historial Completo">
                                          <History size={18} />
                                      </button>
                                      {isAdmin && (
                                          <button onClick={() => handleDeactivate(asset)} className="p-2.5 text-rose-500 hover:bg-rose-500/20 rounded-2xl transition-all" title="Dar de Baja">
                                              <Trash2 size={18} />
                                          </button>
                                      )}
                                  </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="6" className="py-32 text-center">
                              <div className="flex flex-col items-center gap-3 opacity-20">
                                  <Filter size={48} />
                                  <p className="text-xs font-black uppercase tracking-[0.5em]">Sin resultados encontrados</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
          </div>
        </div>
      </div>

      {isAddModalOpen && (
        <AddAssetModal 
          onClose={closeModal} 
          onSaveSuccess={handleAddSuccess} 
        />
      )}

      {isEditModalOpen && selectedAsset && (
        <EditAssetModal
          asset={selectedAsset}
          onClose={closeModal}
          onSaveSuccess={handleUpdateSuccess}
        />
      )}
      
      {isHistoryModalOpen && selectedAsset && (
        <AssetHistoryModal
            asset={selectedAsset}
            onClose={closeModal}
        />
      )}

      {isTypesModalOpen && (
          <AssetTypesManager 
            onClose={closeModal} 
            onUpdate={fetchAssetTypes}
            isAdmin={isAdmin}
          />
      )}
    </>
  );
};

export default AdminInventory;
