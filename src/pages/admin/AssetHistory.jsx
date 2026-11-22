import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { useParams, Link } from 'react-router-dom';
import { Loader2, ArrowLeft, MapPin, User, Calendar, ArrowRight } from 'lucide-react';
import { searchAssetsApi } from '@/lib/mysqlOrders';
import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/http';

const AssetHistory = () => {
  const { assetId } = useParams();
  const [asset, setAsset] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Fetch Asset Details from MySQL
      const assetRes = await searchAssetsApi({ id: assetId });
      if (!assetRes.rows?.[0]) throw new Error("Activo no encontrado.");
      setAsset(assetRes.rows[0]);

      // 2. Fetch History from MySQL
      const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost/backend_scripts' : 'https://mueblesmexico.com/um6/backend_scripts';
      const historyUrl = `${API_BASE}/assets-history-read.php?asset_id=${assetId}`;
      
      let historyData;
      if (Capacitor.isNativePlatform()) {
          const res = await CapacitorHttp.get({ url: historyUrl });
          historyData = res.data;
      } else {
          const res = await fetch(historyUrl);
          historyData = await res.json();
      }

      const movementRows = historyData.rows || [];

      // 3. Fetch Installer names from Supabase for those movements
      const performerIds = [...new Set(movementRows.map(m => m.performer_id).filter(Boolean))];
      let performerMap = new Map();

      if (performerIds.length > 0) {
          const { data: profiles, error: pError } = await supabase
            .from('profiles')
            .select('id, name')
            .in('id', performerIds);
          
          if (!pError && profiles) {
              performerMap = new Map(profiles.map(p => [p.id, p.name]));
          }
      }

      setHistory(movementRows.map(m => ({
          ...m,
          performer_name: performerMap.get(m.performer_id) || 'N/A'
      })));

    } catch (err) {
      console.error('Error fetching asset history:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const renderLocation = (movement) => {
    const fromName = movement.from_client_name || 'Almacén/N/A';
    const toName = movement.to_client_name || 'Almacén/N/A';

    return (
      <div className="flex items-center text-sm mt-1">
        <span className="text-gray-400">{fromName}</span>
        <ArrowRight className="w-4 h-4 mx-2 text-blue-500"/>
        <span className="font-semibold text-gray-200">{toName}</span>
      </div>
    );
  }

  if (loading) return <div className="flex justify-center items-center h-screen bg-gray-900"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>;
  if (error) return <div className="p-8 text-center bg-gray-900 text-red-400 h-screen"><AlertCircle className="mx-auto mb-4 h-12 w-12"/> Error: {error}</div>;
  if (!asset) return <div className="p-4 text-center bg-gray-900 text-white h-screen">Activo no encontrado.</div>;

  return (
    <div className="p-4 md:p-6 text-white bg-gray-900 min-h-screen">
      <Link to="/admin/inventory" className="text-blue-400 hover:text-blue-300 flex items-center mb-4 transition-colors">
        <ArrowLeft className="mr-2 h-4 w-4"/> Volver al Inventario
      </Link>
      
      <header className="mb-6 p-6 bg-gray-800 rounded-xl shadow-lg border border-gray-700">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Historial del Activo</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6">
            <div className="space-y-1">
                <strong className="text-gray-500 text-xs uppercase tracking-wider">Serial</strong>
                <div className="font-mono text-lg text-blue-300">{asset.serial}</div>
            </div>
            <div className="space-y-1">
                <strong className="text-gray-500 text-xs uppercase tracking-wider">Tipo</strong>
                <div className="text-lg">{asset.type}</div>
            </div>
            <div className="space-y-1">
                <strong className="text-gray-500 text-xs uppercase tracking-wider">Estado</strong>
                <div>
                   <span className={`px-3 py-1 rounded-full text-xs font-bold ${asset.status === 'INSTALADO' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'}`}>
                     {asset.status}
                   </span>
                </div>
            </div>
            <div className="space-y-1">
                <strong className="text-gray-500 text-xs uppercase tracking-wider">Ubicación Actual</strong>
                <div className="text-sm text-gray-200 truncate">{asset.client_name || 'ALMACÉN'}</div>
            </div>
        </div>
      </header>

      <div className="space-y-4">
        {history.length > 0 ? history.map(h => (
          <div key={h.id} className="bg-gray-800/40 hover:bg-gray-800/60 transition-all border border-gray-700/50 p-5 rounded-xl flex flex-wrap md:flex-nowrap items-center gap-6">
            <div className="flex-1 min-w-[200px]">
                <div className="flex items-center mb-2">
                    <MapPin className="h-4 w-4 mr-2 text-blue-400"/>
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-500">{h.action}</span>
                </div>
                {renderLocation(h)}
            </div>
            
            <div className="w-full md:w-auto md:min-w-[180px] border-t md:border-t-0 md:border-l border-gray-700/50 pt-4 md:pt-0 md:pl-6">
                <div className="flex items-center mb-1 text-gray-500">
                    <User className="h-4 w-4 mr-2"/>
                    <span className="text-xs uppercase tracking-wider">Responsable</span>
                </div>
                <div className="text-sm font-medium text-gray-200">{h.performer_name}</div>
            </div>

            <div className="w-full md:w-auto md:min-w-[150px] border-t md:border-t-0 md:border-l border-gray-700/50 pt-4 md:pt-0 md:pl-6">
                <div className="flex items-center mb-1 text-gray-500">
                    <Calendar className="h-4 w-4 mr-2"/>
                    <span className="text-xs uppercase tracking-wider">Fecha</span>
                </div>
                <div className="text-sm text-gray-300">{new Date(h.created_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            </div>
          </div>
        )) : (
          <div className="bg-gray-800/30 border border-dashed border-gray-700 rounded-xl p-12 text-center text-gray-500 italic">
            No hay movimientos registrados para este activo.
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetHistory;
