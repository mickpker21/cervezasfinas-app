import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { pointsService } from '../lib/points';
import { formatPrice } from '../lib/pricing';
import { Loader2, Gift, ShoppingBag, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Redeem() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState([]);
    const [balance, setBalance] = useState(0);
    const [redeeming, setRedeeming] = useState(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            // Cargar balance
            const balanceData = await pointsService.getBalance('');
            setBalance(balanceData.balance || 0);

            // Cargar productos canjeables
            const response = await api.get('/points/redemption-products.php');
            if (response.success) {
                setProducts(response.data);
            }
        } catch (error) {
            console.error('Error loading redemption data:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleRedeem(product) {
        if (balance < product.points_required) {
            alert('No tienes suficientes puntos');
            return;
        }

        if (!confirm(`¿Canjear ${product.points_required} puntos por ${product.name}?`)) {
            return;
        }

        setRedeeming(product.id);
        try {
            const response = await api.post('/points/redeem.php', {
                product_sku: product.sku
            });

            if (response.success) {
                setSuccess(true);
                setBalance(response.data.new_balance);
            }
        } catch (error) {
            alert('Error al realizar el canje: ' + error.message);
        } finally {
            setRedeeming(null);
        }
    }

    if (success) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
                    <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold mb-2">¡Canje Exitoso!</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        Tu solicitud ha sido enviada. Televenta se pondrá en contacto contigo para coordinar la entrega.
                    </p>
                    <div className="space-y-2">
                        <button
                            onClick={() => navigate('/points')}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
                        >
                            Ver Mis Puntos
                        </button>
                        <button
                            onClick={() => { setSuccess(false); loadData(); }}
                            className="w-full border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 font-semibold py-3 rounded-lg transition-colors"
                        >
                            Canjear Más Puntos
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
            <div className="container mx-auto px-4 max-w-6xl">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/catalog')}
                            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                        >
                            <ArrowLeft className="w-6 h-6 text-gray-600 dark:text-gray-300" />
                        </button>
                        <h1 className="text-3xl font-bold">Canjear Puntos</h1>
                    </div>
                    <div className="bg-blue-600 text-white px-6 py-3 rounded-lg">
                        <p className="text-sm">Puntos Disponibles</p>
                        <p className="text-2xl font-bold">{pointsService.formatPoints(balance)}</p>
                    </div>
                </div>

                {products.length === 0 ? (
                    <div className="text-center py-12">
                        <ShoppingBag className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-600 dark:text-gray-400">
                            No hay productos disponibles para canje en este momento
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {products.map((product) => {
                            const canRedeem = balance >= product.points_required;

                            return (
                                <div
                                    key={product.id}
                                    className={`bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden ${!canRedeem ? 'opacity-60' : ''
                                        }`}
                                >
                                    {/* Product Image */}
                                    <div className="h-48 bg-gray-200 dark:bg-gray-700 flex items-center justify-center relative">
                                        {product.image_url ? (
                                            <img
                                                src={product.image_url}
                                                alt={product.name}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <Gift className="w-16 h-16 text-gray-400" />
                                        )}
                                        {!canRedeem && (
                                            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                                                <div className="bg-white rounded-lg px-4 py-2 flex items-center gap-2">
                                                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                                                    <span className="font-semibold">Puntos Insuficientes</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Product Info */}
                                    <div className="p-4">
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                                            {product.sku}
                                        </p>
                                        <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                                            {product.name}
                                        </h3>
                                        {product.description && (
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                                                {product.description}
                                            </p>
                                        )}

                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                                    {pointsService.formatPoints(product.points_required)}
                                                </p>
                                                <p className="text-xs text-gray-500">puntos</p>
                                            </div>
                                            <button
                                                onClick={() => handleRedeem(product)}
                                                disabled={!canRedeem || redeeming === product.id}
                                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                            >
                                                {redeeming === product.id ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        Canjeando...
                                                    </>
                                                ) : (
                                                    'Canjear'
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
