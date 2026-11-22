import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HardDrive, Loader2, Package, Calendar } from 'lucide-react';
import { getAssets } from '@/repositories/ordersRepository';

const ClientAssetsList = ({ client_id }) => {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAssets = async () => {
      if (!client_id) return;
      try {
        setLoading(true);
        const data = await getAssets({ client_id });
        setAssets(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Error fetching client assets:', err);
        setError('No se pudieron cargar los equipos asignados.');
      } finally {
        setLoading(false);
      }
    };

    fetchAssets();
  }, [client_id]);

  if (loading) {
    return (
      <Card className="bg-gray-900 border-2 border-emerald-500/30">
        <CardContent className="p-8 flex flex-col items-center justify-center text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin mb-2" />
          <p>Buscando equipos asignados...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-900 border-2 border-emerald-500/30 h-full">
      <CardHeader className="border-b border-gray-800">
        <CardTitle className="flex items-center gap-2 text-lg text-white">
          <HardDrive className="h-5 w-5 text-emerald-500" />
          Equipos / Activos
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        {assets.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Package className="h-10 w-10 mx-auto mb-2 opacity-20" />
            <p>No hay equipos asignados a este cliente.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {assets.map((asset) => (
              <div 
                key={asset.id} 
                className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-emerald-500/50 transition-colors"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-mono text-emerald-400 font-bold px-2 py-0.5 bg-emerald-900/30 rounded border border-emerald-500/20">
                    {asset.serial}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                    {asset.type}
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">
                    {asset.brand} {asset.model}
                  </p>
                  {asset.installation_date && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Calendar className="h-3 w-3" />
                      <span>Instalado el: {new Date(asset.installation_date).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ClientAssetsList;
