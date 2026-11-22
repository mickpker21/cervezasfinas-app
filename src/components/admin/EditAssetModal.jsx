import React, { useState, useEffect } from 'react';
import { updateAsset, getWarehouses } from '../../repositories/ordersRepository';
import { getAssetTypes } from '../../repositories/metadataRepository';

const EditAssetModal = ({ asset: initialAsset, onClose, onSaveSuccess }) => {
  const [asset, setAsset] = useState(initialAsset);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [assetTypes, setAssetTypes] = useState([]);

  useEffect(() => {
    setAsset(initialAsset);
    const fetchMetadata = async () => {
        try {
            const [w, t] = await Promise.all([
                getWarehouses(),
                getAssetTypes()
            ]);
            setWarehouses(w || []);
            
            // Make sure the current asset type is included in the dropdown options
            let types = t || [];
            if (initialAsset.type && !types.includes(initialAsset.type)) {
                types = [...types, initialAsset.type];
            }
            setAssetTypes(types);
        } catch (e) {
            console.error("Error fetching metadata:", e);
        }
    };
    fetchMetadata();
  }, [initialAsset]);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!asset.serial) {
      setError('El número de serie es obligatorio.');
      setLoading(false);
      return;
    }

    try {
      const updateData = {
        id: asset.id,
        serial: asset.serial,
        type: asset.type,
        brand: asset.brand || null,
        model: asset.model || null,
        qr_value: asset.qr_value || null,
        status: asset.status,
        warehouse_id: asset.warehouse_id || null
      };

      if (asset.status === 'INSTALADO') {
        updateData.warehouse_id = null;
      }

      const data = await updateAsset(updateData);
      
      // Update the local state with the new warehouse name so the parent table updates immediately
      const finalAsset = { ...asset, ...updateData };
      if (updateData.warehouse_id) {
          const wh = warehouses.find(w => String(w.id) === String(updateData.warehouse_id));
          if (wh) {
              finalAsset.warehouse_name = wh.name;
          }
      } else {
          finalAsset.warehouse_name = null;
      }
      
      onSaveSuccess(finalAsset);
    } catch (updateError) {
      console.error('Error updating asset:', updateError);
      setError(`Error al actualizar el activo: ${updateError.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setAsset(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 pb-4 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-white">Editar Activo</h2>
        </div>
        
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          <form onSubmit={handleSave}>
            <div className="space-y-4">
              <div>
                <label htmlFor="serial" className="block text-sm font-medium text-gray-300 mb-1">Número de Serie (Obligatorio)</label>
                <input
                  type="text"
                  name="serial"
                  id="serial"
                  value={asset.serial}
                  onChange={handleChange}
                  className="w-full bg-gray-900 border border-gray-700 rounded-md p-2.5 text-white focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="type" className="block text-sm font-medium text-gray-300 mb-1">Tipo de Activo</label>
                <select
                  name="type"
                  id="type"
                  value={asset.type}
                  onChange={handleChange}
                  className="w-full bg-gray-900 border border-gray-700 rounded-md p-2.5 text-white focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Selecciona tipo...</option>
                  {assetTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                  <label htmlFor="status" className="block text-sm font-medium text-gray-300 mb-1">Estado</label>
                  <select name="status" id="status" value={asset.status} onChange={handleChange} className="w-full bg-gray-900 border border-gray-700 rounded-md p-2.5 text-white focus:ring-2 focus:ring-green-500">
                      <option value="EN_ALMACEN">EN ALMACEN</option>
                      <option value="INSTALADO">INSTALADO</option>
                      <option value="EN_TRANSITO">EN TRANSITO</option>
                      <option value="EN_MANTENIMIENTO">EN MANTENIMIENTO</option>
                      <option value="DE_BAJA">DE BAJA</option>
                  </select>
              </div>
              <div>
                <label htmlFor="brand" className="block text-sm font-medium text-gray-300 mb-1">Marca</label>
                <input
                  type="text"
                  name="brand"
                  id="brand"
                  value={asset.brand}
                  onChange={handleChange}
                  className="w-full bg-gray-900 border border-gray-700 rounded-md p-2.5 text-white focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label htmlFor="model" className="block text-sm font-medium text-gray-300 mb-1">Modelo</label>
                <input
                  type="text"
                  name="model"
                  id="model"
                  value={asset.model}
                  onChange={handleChange}
                  className="w-full bg-gray-900 border border-gray-700 rounded-md p-2.5 text-white focus:ring-2 focus:ring-green-500"
                />
              </div>
               <div>
                <label htmlFor="qr_value" className="block text-sm font-medium text-gray-300 mb-1">Valor QR (Opcional)</label>
                <input
                  type="text"
                  name="qr_value"
                  id="qr_value"
                  value={asset.qr_value || ''}
                  onChange={handleChange}
                  className="w-full bg-gray-900 border border-gray-700 rounded-md p-2.5 text-white focus:ring-2 focus:ring-green-500"
                />
              </div>
              {asset.status === 'EN_ALMACEN' && (
                <div>
                  <label htmlFor="warehouse_id" className="block text-sm font-medium text-gray-300 mb-1">Almacén de Resguardo</label>
                  <select
                    name="warehouse_id"
                    id="warehouse_id"
                    value={asset.warehouse_id || ''}
                    onChange={handleChange}
                    className="w-full bg-gray-900 border border-gray-700 rounded-md p-2.5 text-white focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Ninguno / No definido</option>
                    {warehouses.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            
            {error && <p className="mt-4 text-sm text-red-400 bg-red-900/50 p-3 rounded-md">{error}</p>}
            
            <div className="mt-6 pt-4 border-t border-gray-700 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded transition-colors duration-200 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors duration-200 disabled:opacity-50 flex items-center justify-center"
              >
                {loading ? 'Actualizando...' : 'Actualizar Activo'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EditAssetModal;
