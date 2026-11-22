import { API_URL, getShopAuthHeaders } from '@/lib/api';
import { supabase } from '@/supabaseClient';

export async function awardPreventaPoints(preventaId, orderContext = {}) {
    const headers = await getShopAuthHeaders({ 'Content-Type': 'application/json' });
    const response = await fetch(`${API_URL}/televenta/award-preventa-points.php`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            preventa_id: preventaId,
            client_code: orderContext?.client_code || '',
            total_amount: orderContext?.total_amount ?? null,
            items: Array.isArray(orderContext?.items) ? orderContext.items : []
        })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
        throw new Error(data.error || `No se pudieron acreditar puntos (${response.status})`);
    }
    return data.data;
}

export async function deliverPreventa(preventaId) {
    let deliveredInPhp = false;
    let deliveredInSupabase = false;

    // 1. Intentar marcar entregado en PHP (que además persiste en MySQL shop_preventa_overrides y llama al RPC)
    try {
        const headers = await getShopAuthHeaders({ 'Content-Type': 'application/json' });
        const response = await fetch(`${API_URL}/televenta/deliver-preventa.php`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ preventa_id: preventaId })
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.success) {
            deliveredInPhp = true;
        }
    } catch (err) {
        console.warn('Warning calling deliver-preventa.php:', err);
    }

    // 2. Intentar también vía RPC directo de Supabase con la sesión activa del navegador
    try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('deliver_preventa_for_televenta', {
            p_preventa_id: preventaId
        });
        if (!rpcError && rpcData) {
            deliveredInSupabase = true;
        }
    } catch (rpcErr) {
        console.warn('Warning calling RPC deliver_preventa_for_televenta:', rpcErr);
    }

    // 3. Respaldo directo en tabla preventa si el usuario es creador o admin
    if (!deliveredInSupabase) {
        try {
            const { error: updErr } = await supabase
                .from('preventa')
                .update({ status: 'entregado' })
                .eq('id', preventaId);
            if (!updErr) {
                deliveredInSupabase = true;
            }
        } catch (e) {}
    }

    if (!deliveredInPhp && !deliveredInSupabase) {
        throw new Error('No se pudo marcar la preventa como entregada');
    }

    return {
        preventa_id: preventaId,
        status: 'entregado'
    };
}
