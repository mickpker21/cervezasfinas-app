import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { pointsService } from '../lib/points';
import { Loader2, Gift, TrendingUp, Clock, CheckCircle, XCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Points() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [balance, setBalance] = useState(0);
    const [transactions, setTransactions] = useState([]);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            // Cargar balance
            const balanceData = await pointsService.getBalance('');
            setBalance(balanceData.balance || 0);

            // Cargar transacciones
            const response = await api.get('/points/transactions.php');
            if (response.success) {
                setTransactions(response.data);
            }
        } catch (error) {
            console.error('Error loading points data:', error);
        } finally {
            setLoading(false);
        }
    }

    const getTransactionIcon = (type) => {
        switch (type) {
            case 'earned':
                return <TrendingUp className="w-5 h-5 text-green-600" />;
            case 'redeemed':
                return <Gift className="w-5 h-5 text-blue-600" />;
            case 'expired':
                return <Clock className="w-5 h-5 text-red-600" />;
            default:
                return <CheckCircle className="w-5 h-5 text-gray-600" />;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
            <div className="container mx-auto px-4 max-w-4xl">
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={() => window.history.back()}
                        className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <h1 className="text-3xl font-bold">Mis Puntos</h1>
                </div>

                {/* Balance Card */}
                <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-xl p-8 mb-8 text-white">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-blue-100 mb-2">Balance Disponible</p>
                            <p className="text-5xl font-bold">{pointsService.formatPoints(balance)}</p>
                            <p className="text-blue-100 mt-2">puntos</p>
                        </div>
                        <Gift className="w-20 h-20 text-blue-200 opacity-50" />
                    </div>

                    <div className="mt-6 flex gap-3">
                        <button
                            onClick={() => navigate('/redeem')}
                            className="flex-1 bg-white text-blue-600 font-semibold py-3 px-4 rounded-lg hover:bg-blue-50 transition-colors"
                        >
                            Canjear Puntos
                        </button>
                        <button
                            onClick={() => navigate('/cooler-execution')}
                            className="flex-1 bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg hover:bg-blue-800 transition-colors"
                        >
                            Subir Foto Enfriador
                        </button>
                    </div>
                </div>

                {/* Transactions History */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold mb-4">Historial de Puntos</h2>

                    {transactions.length === 0 ? (
                        <p className="text-center py-8 text-gray-600 dark:text-gray-400">
                            No tienes transacciones aún
                        </p>
                    ) : (
                        <div className="space-y-4">
                            {transactions.map((transaction) => (
                                <div
                                    key={transaction.id}
                                    className="flex items-center justify-between p-4 border dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        {getTransactionIcon(transaction.type)}
                                        <div>
                                            <p className="font-medium">
                                                {transaction.reason || transaction.type}
                                            </p>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                {new Date(transaction.created_at).toLocaleDateString('es-MX', {
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric'
                                                })}
                                            </p>
                                            {transaction.expires_at && !transaction.is_expired && (
                                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                    Expira: {new Date(transaction.expires_at).toLocaleDateString('es-MX')}
                                                </p>
                                            )}
                                            {transaction.order_number && (
                                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                    Pedido: {transaction.order_number}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-xl font-bold ${transaction.type === 'earned' ? 'text-green-600' :
                                            transaction.type === 'redeemed' ? 'text-blue-600' :
                                                'text-red-600'
                                            }`}>
                                            {transaction.type === 'earned' ? '+' : '-'}{transaction.points}
                                        </p>
                                        {transaction.is_expired && (
                                            <span className="text-xs text-red-600">Expirado</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
