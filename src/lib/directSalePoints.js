import { API_URL, getShopAuthHeaders } from '@/lib/api';

export async function awardDirectSalePoints(saleId) {
    const headers = await getShopAuthHeaders({ 'Content-Type': 'application/json' });
    if (!headers.Authorization && !headers.authorization) {
        throw new Error('Se requiere una sesión de personal para acreditar puntos de una venta directa');
    }

    const response = await fetch(`${API_URL}/televenta/award-direct-sale-points.php`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sale_id: saleId })
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
        throw new Error(data.error || `No se pudieron acreditar puntos (${response.status})`);
    }
    return data.data;
}
