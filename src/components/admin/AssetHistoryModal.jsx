import { useState, useEffect } from 'react';
import { getAssetHistory } from '@/repositories/ordersRepository';

const AssetHistoryModal = ({ asset, onClose }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchHistory = async () => {
      if (!asset) return;
      setLoading(true);
      setError('');

      try {
        const assetId = asset.asset_id || asset.id;
        const data = await getAssetHistory(assetId);
        setHistory(data || []);
      } catch (fetchError) {
        console.error('Error fetching asset history:', fetchError);
        setError(`No se pudo cargar el historial: ${fetchError.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [asset]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-white">Historial del Activo</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </div>
        <div className="mb-6 p-4 bg-gray-900 rounded-lg">
            <p><strong className="text-gray-400">Serial:</strong> <span className="font-mono">{asset.serial}</span></p>
            <p><strong className="text-gray-400">Tipo:</strong> {asset.type}</p>
            <p><strong className="text-gray-400">Estado Actual:</strong> {asset.status.replace('_', ' ')}</p>
        </div>

        {loading ? (
          <p className="text-center text-gray-300">Cargando historial...</p>
        ) : error ? (
          <p className="text-center text-red-400">{error}</p>
        ) : history.length > 0 ? (
          <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
            {history.map((item) => {
              return (
                <div key={item.id} className="p-4 bg-gray-700/50 border border-gray-600 rounded-xl">
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-bold text-blue-400">{item.action}</p>
                    <p className="text-xs text-gray-500 font-mono">{item.created_at ? new Date(item.created_at).toLocaleDateString('es-MX') : 'N/A'}</p>
                  </div>
                  
                  <div className="space-y-1 text-sm">
                    {item.from_client_name && (
                      <p><strong className="text-gray-400">Origen:</strong> {item.from_client_name}</p>
                    )}
                    {item.to_client_name && (
                      <p><strong className="text-gray-400">Destino:</strong> {item.to_client_name}</p>
                    )}
                    {item.order_notes && (
                      <p className="text-gray-400 italic mt-2">"{item.order_notes}"</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-center text-gray-400 py-8 italic">No se encontraron movimientos registrados para este activo.</p>
        )}

        <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded transition-colors duration-200"
            >
              Cerrar
            </button>
          </div>
      </div>
    </div>
  );
};

export default AssetHistoryModal;
