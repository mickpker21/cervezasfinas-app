import { api } from './api';

/**
 * Calcula el precio final de un producto considerando:
 * 1. Precio especial (si existe)
 * 2. Promoción activa
 * 3. Descuento GEC del cliente
 */
export async function calculatePrice(sku, client_code, quantity = 1) {
    try {
        const response = await api.post('/products/calculate-price.php', {
            sku,
            client_code,
            quantity,
        });

        if (response.success) {
            return response.data;
        }

        throw new Error(response.error || 'Error calculando precio');
    } catch (error) {
        console.error('Error calculating price:', error);
        throw error;
    }
}

/**
 * Formatea un precio para mostrar
 */
export function formatPrice(price) {
    const numericPrice = typeof price === 'string' ? parseFloat(price) : price;
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
    }).format(numericPrice || 0);
}

/**
 * Calcula el descuento aplicado
 */
export function calculateDiscount(basePrice, finalPrice) {
    if (basePrice <= 0) return 0;
    return ((basePrice - finalPrice) / basePrice) * 100;
}
