/**
 * clientContainerService.js
 * Servicio para calcular y rastrear el saldo de envases retornables por cliente.
 */

import { supabase } from '@/supabaseClient';

/**
 * Obtiene el saldo de envases del cliente (cuántos envases debe).
 * Un saldo positivo (+) significa que el cliente DEBE envases al camión/empresa.
 */
export async function getClientContainerBalance(clientId) {
  if (!clientId) return 0;

  try {
    // 1. Consultar preventas del cliente que fueron entregadas
    const { data: preventas, error } = await supabase
      .from('preventa')
      .select('id, status')
      .eq('client_id', clientId)
      .eq('status', 'entregado');

    if (error || !preventas || preventas.length === 0) return 0;

    const preventaIds = preventas.map(p => p.id);

    // 2. Obtener items de esas preventas
    const { data: items } = await supabase
      .from('preventa_items')
      .select('cve_marca, quantity, envases_requeridos, envases_retornados, es_retornable')
      .in('preventa_id', preventaIds);

    if (!items || items.length === 0) return 0;

    // 3. Calcular saldo acumulado
    let owedCount = 0;
    items.forEach(item => {
      const isRet = item.es_retornable || (item.envases_requeridos && item.envases_requeridos > 0);
      if (isRet) {
        const req = Number(item.envases_requeridos || item.quantity || 0);
        const ret = Number(item.envases_retornados || 0);
        owedCount += (req - ret);
      }
    });

    return Math.max(0, owedCount);
  } catch (err) {
    console.error('[clientContainerService] Error calculando saldo:', err);
    return 0;
  }
}

/**
 * Registra devolución manual de envases o ajuste por el cobro del cliente
 */
export async function recordContainerReturn(clientId, preventaId, bottlesReturned, notes = '') {
  if (!preventaId || bottlesReturned <= 0) return;

  try {
    const { data: items } = await supabase
      .from('preventa_items')
      .select('id, envases_retornados')
      .eq('preventa_id', preventaId)
      .limit(1);

    if (items && items[0]) {
      const currentRet = Number(items[0].envases_retornados || 0);
      await supabase
        .from('preventa_items')
        .update({ envases_retornados: currentRet + bottlesReturned })
        .eq('id', items[0].id);
    }
  } catch (err) {
    console.error('[clientContainerService] Error registrando devolución:', err);
  }
}
