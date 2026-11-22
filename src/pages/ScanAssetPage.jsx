import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation, useNavigate } from 'react-router-dom';
import QrScanner from '@/components/common/QrScanner';
import AssetHistoryModal from '@/components/admin/AssetHistoryModal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { searchAsset } from '@/repositories/ordersRepository';

const ScanAssetPage = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [manualSerialNumber, setManualSerialNumber] = useState('');
    const [asset, setAsset] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isManualEntry, setIsManualEntry] = useState(false);

    const navigate = useNavigate();
    const location = useLocation();
    const { isOrderCreation, from } = location.state || {};

    useEffect(() => {
        if (!searchQuery) return;

        const fetchAsset = async () => {
            setLoading(true);
            setError('');
            setAsset(null);

            try {
                // Use MySQL repository
                const data = await searchAsset(searchQuery);

                if (data) {
                    if (isOrderCreation && from) {
                        navigate(from, { state: { scannedAsset: data }, replace: true });
                        return;
                    }
                    setAsset(data);
                } else {
                    setError(`No se encontró ningún activo con el identificador: ${searchQuery}`);
                }
            } catch (err) {
                console.error("Error fetching asset:", err);
                setError(`Error al buscar el activo: ${err.message}`);
            } finally {
                setLoading(false);
            }
        };

        fetchAsset();
    }, [searchQuery, navigate, isOrderCreation, from, isManualEntry]);

    const handleScanSuccess = (decodedText) => {
        setSearchQuery(decodedText);
        setIsManualEntry(false);
    };

    const handleManualSubmit = (e) => {
        e.preventDefault();
        if (!manualSerialNumber.trim()) return;
        setSearchQuery(manualSerialNumber.trim());
        setIsManualEntry(true);
    };

    const handleReset = () => {
        setSearchQuery('');
        setManualSerialNumber('');
        setAsset(null);
        setError('');
        setLoading(false);
    };

    return (
        <>
            <Helmet>
                <title>Escanear/Buscar Activo - Cervezas Finas</title>
            </Helmet>
            <div className="p-6 bg-gray-900 text-white min-h-screen">
                <h1 className="text-3xl font-bold mb-6">Escanear o Buscar Activo</h1>

                {searchQuery && (
                    <Button onClick={handleReset} className="w-full max-w-xl mx-auto mb-6" variant="secondary">
                        Buscar de Nuevo
                    </Button>
                )}

                {!searchQuery ? (
                    <div className="max-w-xl mx-auto bg-gray-800 p-8 rounded-lg shadow-lg">
                        <div className="text-center text-gray-300 mb-4">
                            <p className="mb-2">Apunta la cámara al código QR del activo o ingresa el número de serie.</p>
                            <Button onClick={() => setIsManualEntry(!isManualEntry)} variant="link">
                                {isManualEntry ? 'Cambiar a Escáner QR' : 'Ingresar Número de Serie Manualmente'}
                            </Button>
                        </div>

                        {isManualEntry ? (
                            <form onSubmit={handleManualSubmit} className="flex flex-col gap-4">
                                <Input
                                    type="text"
                                    value={manualSerialNumber}
                                    onChange={(e) => setManualSerialNumber(e.target.value)}
                                    placeholder="Número de serie del activo"
                                    className="bg-gray-700 text-white border-gray-600"
                                />
                                <Button type="submit">Buscar Activo</Button>
                            </form>
                        ) : (
                            <QrScanner onScanSuccess={handleScanSuccess} onScanFailure={() => {}} />
                        )}
                    </div>
                ) : (
                    <div className="max-w-xl mx-auto">
                        {loading && <p className="text-center text-lg">Buscando activo...</p>}
                        {error && 
                            <div className="bg-red-900/50 text-red-300 p-4 rounded-lg text-center">
                                <p className="font-bold">Error</p>
                                <p>{error}</p>
                            </div>
                        }
                        {asset && (
                            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                                <h2 className="text-2xl font-bold mb-4">Activo Encontrado</h2>
                                <div className="space-y-2 text-lg">
                                    <p><strong className="text-gray-400">Serial:</strong> <span className="font-mono">{asset.serial_number || asset.serial}</span></p>
                                    <p><strong className="text-gray-400">Tipo:</strong> {asset.type}</p>
                                    <p><strong className="text-gray-400">Cliente Actual:</strong> {asset.clients?.name || 'En Almacén'}</p>
                                    <p><strong className="text-gray-400">Estado:</strong> <span className={`font-semibold ${asset.status === 'EN_ALMACEN' ? 'text-blue-400' : 'text-green-400'}`}>{asset.status?.replace('_', ' ')}</span></p>
                                </div>
                                <div className="mt-6 flex flex-col sm:flex-row gap-4">
                                    <Button onClick={() => setIsHistoryOpen(true)} className="flex-1">
                                        Ver Historial
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {isHistoryOpen && asset && (
                <AssetHistoryModal asset={asset} onClose={() => setIsHistoryOpen(false)} />
            )}
        </>
    );
};

export default ScanAssetPage;
