import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { RefreshCw, Clock, Package } from 'lucide-react';
import { useCart } from '../contexts/CartContext';

export default function RecentOrders({ onRepeatOrder }) {
    const [recentOrder, setRecentOrder] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadRecentOrder();
    }, []);

    const loadRecentOrder = async () => {
        try {
            const response = await api.get('/orders/list.php');
            if (response.data && response.data.length > 0) {
                setRecentOrder(response.data[0]); // Get most recent
            }
        } catch (error) {
            console.error('Error loading recent order:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRepeatOrder = async () => {
        if (!recentOrder || !recentOrder.items) return;

        try {
            // Add all items from previous order to cart
            for (const item of recentOrder.items) {
                const priceData = await api.post('/products/calculate-price.php', {
                    sku: item.sku,
                    quantity: item.quantity
                });

                onRepeatOrder({
                    sku: item.sku,
                    name: item.product_name || item.name,
                    base_price: item.unit_price,
                    quantity: item.quantity,
                    priceData: priceData.pricing
                });
            }

            alert('¡Pedido anterior agregado al carrito!');
        } catch (error) {
            console.error('Error repeating order:', error);
            alert('Error al repetir pedido. Intenta de nuevo.');
        }
    };

    if (loading) {
        return (
            <div className="bg-white rounded-2xl shadow-md p-6 animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
        );
    }

    if (!recentOrder) return null;

    const orderDate = new Date(recentOrder.created_at).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'long'
    });

    return (
        <div className="bg-gradient-to-br from-white to-green-50 rounded-2xl shadow-lg p-6 border-2 border-green-100 hover:shadow-xl transition-all">
            <div className="flex items-start justify-between mb-4">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-5 h-5 text-green-600" />
                        <h3 className="font-bold text-gray-900">Pedido Anterior</h3>
                    </div>
                    <p className="text-sm text-gray-600">Pedido el {orderDate}</p>
                    <p className="text-xs text-gray-500 mt-1">
                        {recentOrder.order_number}
                    </p>
                </div>

                <div className="text-right">
                    <p className="text-2xl font-black text-green-700">
                        ${parseFloat(recentOrder.total_amount).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500">
                        {recentOrder.items?.length || 0} productos
                    </p>
                </div>
            </div>

            <button
                onClick={handleRepeatOrder}
                className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold py-3 px-4 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 group"
            >
                <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                Repetir Pedido
            </button>
        </div>
    );
}
