import React, { createContext, useState, useContext, useEffect } from 'react';
import { calculatePrice } from '../lib/pricing';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);

export function CartProvider({ children }) {
    const { user } = useAuth();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);

    // Cargar carrito del localStorage
    useEffect(() => {
        if (user) {
            const savedCart = localStorage.getItem(`cart_${user.client_code}`);
            if (savedCart) {
                setItems(JSON.parse(savedCart));
            }
        } else {
            setItems([]);
        }
    }, [user]);

    // Guardar carrito en localStorage
    useEffect(() => {
        if (user && items.length > 0) {
            localStorage.setItem(`cart_${user.client_code}`, JSON.stringify(items));
        }
    }, [items, user]);

    const addItem = async (product, quantity = 1) => {
        if (!user) return;

        setLoading(true);
        try {
            // Calcular precio con descuentos
            const { pricing } = await calculatePrice(product.sku, user.client_code, quantity);
            const priceData = pricing;

            const existingIndex = items.findIndex(item => item.sku === product.sku);

            if (existingIndex >= 0) {
                // Actualizar cantidad
                const newItems = [...items];
                newItems[existingIndex].quantity += quantity;
                newItems[existingIndex].priceData = priceData;
                setItems(newItems);
            } else {
                // Añadir nuevo item
                setItems([...items, {
                    ...product,
                    quantity,
                    priceData,
                }]);
            }
        } catch (error) {
            console.error('Error adding to cart:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const removeItem = (sku) => {
        setItems(items.filter(item => item.sku !== sku));
    };

    const updateQuantity = async (sku, quantity) => {
        if (quantity <= 0) {
            removeItem(sku);
            return;
        }

        const item = items.find(i => i.sku === sku);
        if (!item || !user) return;

        setLoading(true);
        try {
            const { pricing } = await calculatePrice(sku, user.client_code, quantity);
            const priceData = pricing;

            const newItems = items.map(i =>
                i.sku === sku
                    ? { ...i, quantity, priceData }
                    : i
            );
            setItems(newItems);
        } catch (error) {
            console.error('Error updating quantity:', error);
        } finally {
            setLoading(false);
        }
    };

    const refreshCart = async () => {
        if (!user || items.length === 0) return;
        setLoading(true);
        try {
            const updatedItems = await Promise.all(items.map(async (item) => {
                try {
                    const { pricing } = await calculatePrice(item.sku, user.client_code, item.quantity);
                    return { ...item, priceData: pricing };
                } catch (e) {
                    console.error(`Error refreshing price for ${item.sku}`, e);
                    return item;
                }
            }));
            setItems(updatedItems);
        } catch (error) {
            console.error('Error refreshing cart:', error);
        } finally {
            setLoading(false);
        }
    };

    const clearCart = () => {
        setItems([]);
        if (user) {
            localStorage.removeItem(`cart_${user.client_code}`);
        }
    };

    const getTotal = () => {
        return items.reduce((sum, item) => {
            const price = item.priceData?.unit_price || item.base_price || 0;
            return sum + (price * item.quantity);
        }, 0);
    };

    const value = {
        items,
        loading,
        addItem,
        removeItem,
        updateQuantity,
        refreshCart,
        clearCart,
        getTotal,
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    };

    return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
    const context = useContext(CartContext);
    if (!context) {
        throw new Error('useCart must be used within CartProvider');
    }
    return context;
}
