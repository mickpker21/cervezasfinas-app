import { useState, useEffect } from 'react';
import ScannerModal from '../common/ScannerModal';
import { QrCode } from 'lucide-react';
import { createAsset } from '../../repositories/ordersRepository';
import { getAssetTypes } from '../../repositories/metadataRepository';

const AddAssetModal = ({ onClose, onSaveSuccess }) => {
  const [asset, setAsset] = useState({
    serial: '',
    type: '',
    brand: '',
    model: '',
    qr_value: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [assetTypes, setAssetTypes] = useState([]);

  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const types = await getAssetTypes();
        setAssetTypes(types || []);
        if (types && types.length > 0) {
          setAsset(prev => ({ ...prev, type: types[0] }));
        }
      } catch (e) {
        console.error('Error loading types:', e);
      }
    };
    fetchTypes();
  }, []);

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
      const data = await createAsset({
        serial: asset.serial,
        type: asset.type,
        brand: asset.brand || null,
        model: asset.model || null,
        qr_value: asset.qr_value || asset.serial,
        status: 'EN_ALMACEN'
      });
      onSaveSuccess(data);
    } catch (insertError) {
      console.error('Error creating asset:', insertError);
      setError(`Error al crear el activo: ${insertError.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setAsset(prev => ({ ...prev, [name]: value }));
  };

  const handleScanSuccess = (decodedText) => {
    setAsset(prev => ({ ...prev, serial: decodedText }));
    setIsScannerOpen(false);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
        <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="p-6 pb-4 border-b border-gray-700">
            <h2 className="text-2xl font-bold text-white">Añadir Nuevo Activo</h2>
          </div>
          
          <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
            <form onSubmit={handleSave}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="serial" className="block text-sm font-medium text-gray-300 mb-1">Número de Serie (Obligatorio)</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      name="serial"
                      id="serial"
                      value={asset.serial}
                      onChange={handleChange}
                      className="flex-grow bg-gray-900 border border-gray-700 rounded-md p-2.5 text-white focus:ring-2 focus:ring-green-500"
                      required
                    />
                    <button type="button" onClick={() => setIsScannerOpen(true)} className="p-2.5 bg-gray-700 hover:bg-gray-600 rounded-md">
                      <QrCode className="h-5 w-5 text-white" />
                    </button>
                  </div>
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
                    value={asset.qr_value}
                    onChange={handleChange}
                    className="w-full bg-gray-900 border border-gray-700 rounded-md p-2.5 text-white focus:ring-2 focus:ring-green-500"
                  />
                </div>
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
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition-colors duration-200 disabled:opacity-50 flex items-center justify-center"
                >
                  {loading ? 'Guardando...' : 'Guardar Activo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      
      <ScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
        title="Escanear Número de Serie"
        description="Apunta la cámara al código de barras o QR del número de serie."
      />
    </>
  );
};

export default AddAssetModal;
