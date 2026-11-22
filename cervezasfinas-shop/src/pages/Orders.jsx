import React, { useState, useEffect } from 'react';
import { api, API_URL } from '../lib/api';
import { formatPrice } from '../lib/pricing';
import { Loader2, Package, Calendar, CheckCircle, Clock, XCircle, ArrowLeft } from 'lucide-react';

export default function Orders() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('active'); // 'active' or 'history'

    useEffect(() => {
        loadOrders();
    }, [viewMode]);

    async function loadOrders() {
        setLoading(true);
        try {
            const endpoint = viewMode === 'history' ? '/orders/list.php?history=true' : '/orders/list.php';
            const response = await api.get(endpoint);
            if (response.success) {
                setOrders(response.data);
            }
        } catch (error) {
            console.error('Error loading orders:', error);
        } finally {
            setLoading(false);
        }
    }

    const getStatusBadge = (status) => {
        const badges = {
            pending: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400', icon: Clock, text: 'Pendiente' },
            confirmed: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400', icon: CheckCircle, text: 'Confirmado' },
            delivered: { color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400', icon: CheckCircle, text: 'Entregado' },
            cancelled: { color: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400', icon: XCircle, text: 'Cancelado' },
        };

        const badge = badges[status] || badges.pending;
        const Icon = badge.icon;

        return (
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${badge.color}`}>
                <Icon className="w-4 h-4" />
                {badge.text}
            </span>
        );
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
            <div className="container mx-auto px-4 max-w-6xl">
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={() => window.history.back()}
                        className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <h1 className="text-3xl font-bold">Mis Pedidos</h1>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 mb-6 border-b dark:border-gray-700 pb-2">
                    <button
                        onClick={() => setViewMode('active')}
                        className={`px-4 py-2 font-semibold rounded-t-lg transition-colors ${viewMode === 'active'
                            ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400'
                            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            }`}
                    >
                        Pedidos Activos
                    </button>
                    <button
                        onClick={() => setViewMode('history')}
                        className={`px-4 py-2 font-semibold rounded-t-lg transition-colors ${viewMode === 'history'
                            ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400'
                            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            }`}
                    >
                        Historial
                    </button>
                </div>

                {orders.length === 0 ? (
                    <div className="text-center py-12">
                        <Package className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-600 dark:text-gray-400">
                            No tienes pedidos aún
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {orders.map((order, index) => (
                            <div
                                key={order.id}
                                className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-100 dark:border-gray-700 transition-all duration-300 hover:shadow-xl"
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                {/* Order Header */}
                                <div className={`px-6 py-4 border-b dark:border-gray-700 flex flex-wrap items-center justify-between gap-4 ${viewMode === 'history' ? 'bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800' : 'bg-gray-50 dark:bg-gray-700'
                                    }`}>
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                                            {viewMode === 'history' ? 'Remisión' : 'Pedido'}
                                        </p>
                                        <p className="text-lg font-bold text-gray-900 dark:text-white">
                                            #{order.order_number}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Calendar className="w-4 h-4 text-blue-500" />
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                {new Date(order.created_at).toLocaleDateString('es-MX', {
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric'
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {getStatusBadge(order.status)}
                                        <p className="text-2xl font-black text-gray-900 dark:text-white mt-2">
                                            {formatPrice(order.total_amount)}
                                        </p>
                                    </div>
                                </div>

                                {/* Order Items */}
                                <div className="p-6">
                                    <h3 className="font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                                        <Package className="w-5 h-5 text-gray-400" />
                                        Productos
                                    </h3>
                                    <div className="space-y-4">
                                        {order.items?.map((item, idx) => (
                                            <div key={idx} className="flex gap-4 items-center">
                                                {/* Image */}
                                                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200 dark:border-gray-600">
                                                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200 dark:border-gray-600">
                                                        <img
                                                            src={`${API_URL}/products/image.php?sku=${item.sku}`}
                                                            alt={item.product_name}
                                                            className="w-full h-full object-cover"
                                                            onError={(e) => {
                                                                e.target.onerror = null;
                                                                e.target.src = "https://cervezasfinas.com/assets/placeholder-beer.png";
                                                            }}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-gray-900 dark:text-white truncate">
                                                        {item.product_name || item.sku}
                                                    </p>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                                        SKU: {item.sku}
                                                    </p>
                                                </div>

                                                <div className="text-right">
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                        {Math.round(item.quantity)} pzas
                                                    </p>
                                                    <p className="font-bold text-blue-600 dark:text-blue-400">
                                                        {formatPrice(item.subtotal)}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Footer Info */}
                                    <div className="mt-6 pt-4 border-t dark:border-gray-700 flex flex-wrap gap-4 text-sm text-gray-500">
                                        {order.delivery_date && (
                                            <div className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500" />
                                                <span>Entregado: {new Date(order.delivery_date).toLocaleDateString()}</span>
                                            </div>
                                        )}
                                        {order.notes && (
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold">Nota:</span>
                                                <span>{order.notes}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
