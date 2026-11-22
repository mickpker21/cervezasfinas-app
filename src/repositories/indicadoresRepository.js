import { supabase } from '../supabaseClient';

/**
 * Obtiene los indicadores manuales (faltas, minutos) para una lista de rutas y un periodo.
 * @param {string[]} routes 
 * @param {string} period Fecha en formato YYYY-MM-01
 */
export async function getManualIndicators(routes, period) {
    try {
        let query = supabase
            .from('indicadores_ruta_manual')
            .select('*')
            .eq('periodo', period);
            
        if (routes && routes.length > 0) {
            query = query.in('ruta', routes);
        }
            
        const { data, error } = await query;
            
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error('Error fetching manual indicators:', e);
        return [];
    }
}

/**
 * Guarda o actualiza un indicador manual.
 */
export async function upsertManualIndicator(payload) {
    // payload: { ruta, periodo, faltas, minutos }
    try {
        const { data, error } = await supabase
            .from('indicadores_ruta_manual')
            .upsert(payload, { onConflict: 'ruta,periodo' })
            .select();
            
        if (error) throw error;
        return data?.[0] || null;
    } catch (e) {
        console.error('Error saving manual indicator:', e);
        throw e;
    }
}
