import React, { useEffect } from 'react';
import { useCart } from '../../contexts/CartContext';
import { API_URL } from '../../lib/api';
import { formatPrice } from '../../lib/pricing';
import { X, Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function CartDrawer({ isOpen, onClose }) {
    const { items, updateQuantity, removeItem, getTotal, refreshCart } = useCart();
    const navigate = useNavigate();

    // Refresh prices when drawer opens to ensure they are up to date
    useEffect(() => {
        if (isOpen && items.length > 0) {
            refreshCart();
        }
    }, [isOpen]);

    const handleCheckout = () => {
        onClose();
        navigate('/checkout');
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Overlay */}
            <div
                className="fixed inset-0 bg-black/50 z-40"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <ShoppingBag className="w-6 h-6" />
                        Carrito ({items.length})
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Items */}
                <div className="flex-1 overflow-y-auto p-4">
                    {items.length === 0 ? (
                        <div className="text-center py-12">
                            <ShoppingBag className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                            <p className="text-gray-600 dark:text-gray-400">
                                Tu carrito está vacío
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {items.map((item) => {
                                const unitPrice = item.priceData?.unit_price || item.base_price;
                                const subtotal = unitPrice * item.quantity;

                                return (
                                    <div
                                        key={item.sku}
                                        className="flex gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                                    >
                                        <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200 dark:border-gray-600">
                                            <img
                                                src={`${API_URL}/products/image.php?sku=${item.sku}`}
                                                alt={item.name}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    e.target.src = "https://cervezasfinas.com/assets/placeholder-beer.png";
                                                }}
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-semibold text-sm mb-1">{item.name}</h3>
                                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                                                {item.sku}
                                            </p>
                                            <p className="text-blue-600 dark:text-blue-400 font-bold">
                                                {formatPrice(unitPrice)} c/u
                                            </p>
                                        </div>

                                        <div className="flex flex-col items-end justify-between">
                                            {/* Quantity Controls */}
                                            <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg p-1">
                                                <button
                                                    onClick={() => updateQuantity(item.sku, item.quantity - 1)}
                                                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                                >
                                                    <Minus className="w-4 h-4" />
                                                </button>
                                                <span className="w-8 text-center font-semibold">
                                                    {item.quantity}
                                                </span>
                                                <button
                                                    onClick={() => updateQuantity(item.sku, item.quantity + 1)}
                                                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </button>
                                            </div>

                                            {/* Subtotal and Remove */}
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold">{formatPrice(subtotal)}</p>
                                                <button
                                                    onClick={() => removeItem(item.sku)}
                                                    className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {items.length > 0 && (
                    <div className="border-t dark:border-gray-700 p-4 space-y-4">
                        <div className="flex justify-between items-center text-lg font-bold">
                            <span>Total:</span>
                            <span className="text-blue-600 dark:text-blue-400">
                                {formatPrice(getTotal())}
                            </span>
                        </div>

                        <button
                            onClick={handleCheckout}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
                        >
                            Proceder al Checkout
                        </button>

                        <button
                            onClick={onClose}
                            className="w-full border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 font-semibold py-3 rounded-lg transition-colors"
                        >
                            Continuar Comprando
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}
