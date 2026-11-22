// ============================================================
// ticketTemplatesRepository.js
// Gestión de plantillas de ticket: Supabase + kvStorage cache
// ============================================================
import { supabase } from '@/supabaseClient';
import { kvStorage } from '@/services/kvStorage';

const CACHE_KEY = 'ticket_templates_cache';
const ACTIVE_KEY = 'active_ticket_template';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 horas

// Plantilla mínima hardcoded como fallback final
const FALLBACK_TEMPLATE = {
  id: 'fallback',
  name: 'Estándar',
  is_active: true,
  is_default: true,
  template_json: {
    paperWidth: 58,
    charWidth: 32,
    sections: [
      { id: 'header', type: 'header', enabled: true, fields: [
        { id: 'company_name', type: 'bold_center_text', value: 'CERVEZAS FINAS', enabled: true },
        { id: 'address', type: 'center_text', value: 'C. 5 Pte. 303, Col Centro', enabled: true },
        { id: 'phone', type: 'center_text', value: 'Tel. 245 452 0134', enabled: true },
      ]},
      { id: 'order_info', type: 'order_info', enabled: true, fields: [
        { id: 'date', type: 'data_field', label: '', value: '{{date}}', enabled: true },
        { id: 'client_code', type: 'data_field', label: 'Cliente:', value: '{{client.client_code}}', enabled: true },
        { id: 'client_name', type: 'data_field', label: '', value: '{{client.name}}', enabled: true },
        { id: 'sale_id', type: 'data_field', label: 'Venta ID:', value: '#{{sale.id}}', enabled: true },
      ]},
      { id: 'items', type: 'items_table', enabled: true, columns: [
        { id: 'qty', label: 'CANT', width: 4, align: 'left' },
        { id: 'name', label: 'DESCRIPCION', width: 19, align: 'left' },
        { id: 'total', label: 'IMPORTE', width: 9, align: 'right' },
      ]},
      { id: 'totals', type: 'totals', enabled: true, fields: [
        { id: 'subtotal', label: 'articulos   Subtotal:', enabled: true, type: 'subtotal' },
        { id: 'total', label: 'TOTAL:', enabled: true, type: 'total', bold: true },
      ]},
      { id: 'footer', type: 'footer', enabled: true, fields: [
        { id: 'website', type: 'center_text', value: 'www.cervezasfinas.com.mx', enabled: true },
        { id: 'qr', type: 'qr_code', value: '{{sale.verify_url}}', enabled: true },
        { id: 'thanks', type: 'bold_center_text', value: 'GRACIAS POR SU COMPRA!', enabled: true },
      ]},
    ],
  },
};

/**
 * Obtiene la plantilla activa. Lee de cache primero, luego Supabase.
 */
export async function getActiveTemplate() {
  try {
    // 1. Intentar cache local
    const cached = await kvStorage.getItem(ACTIVE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed._cachedAt && Date.now() - parsed._cachedAt < CACHE_TTL) {
        return parsed.data;
      }
    }
  } catch (_) {}

  // 2. Intentar Supabase
  try {
    const { data, error } = await supabase
      .from('ticket_templates')
      .select('*')
      .eq('is_active', true)
      .single();

    if (!error && data) {
      await kvStorage.setItem(ACTIVE_KEY, JSON.stringify({ data, _cachedAt: Date.now() }));
      return data;
    }
  } catch (_) {}

  // 3. Fallback hardcoded
  return FALLBACK_TEMPLATE;
}

/**
 * Descarga todas las plantillas (para el editor de admin).
 */
export async function getAllTemplates() {
  const { data, error } = await supabase
    .from('ticket_templates')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Crea una nueva plantilla (solo admin/sistemas).
 */
export async function createTemplate(templateData) {
  const { data, error } = await supabase
    .from('ticket_templates')
    .insert([{
      name: templateData.name,
      description: templateData.description || '',
      is_active: false,
      is_default: false,
      template_json: templateData.template_json,
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Actualiza una plantilla existente.
 */
export async function updateTemplate(id, updates) {
  const { data, error } = await supabase
    .from('ticket_templates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  // Invalidar cache si se actualizó la activa
  if (updates.is_active) {
    await kvStorage.removeItem(ACTIVE_KEY);
  }
  return data;
}

/**
 * Activa una plantilla (desactiva las demás).
 */
export async function activateTemplate(id) {
  // Supabase no soporta transacciones en cliente, usamos RPC o secuencia
  // Primero desactivar todas
  const { error: deactivateError } = await supabase
    .from('ticket_templates')
    .update({ is_active: false })
    .neq('id', id);

  if (deactivateError) throw deactivateError;

  // Luego activar la seleccionada
  const { data, error } = await supabase
    .from('ticket_templates')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  // Actualizar cache
  await kvStorage.setItem(ACTIVE_KEY, JSON.stringify({ data, _cachedAt: Date.now() }));
  return data;
}

/**
 * Elimina una plantilla (no se puede eliminar la predeterminada).
 */
export async function deleteTemplate(id) {
  // Verificar que no sea la predeterminada
  const { data: tmpl } = await supabase
    .from('ticket_templates')
    .select('is_default, is_active')
    .eq('id', id)
    .single();

  if (tmpl?.is_default) {
    throw new Error('No se puede eliminar la plantilla predeterminada.');
  }
  if (tmpl?.is_active) {
    throw new Error('No se puede eliminar la plantilla activa. Activa otra primero.');
  }

  const { error } = await supabase
    .from('ticket_templates')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * Duplica una plantilla con un nuevo nombre.
 */
export async function duplicateTemplate(id, newName) {
  const { data: source } = await supabase
    .from('ticket_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (!source) throw new Error('Plantilla no encontrada.');

  return createTemplate({
    name: newName || `${source.name} (Copia)`,
    description: source.description,
    template_json: source.template_json,
  });
}

/**
 * Sincroniza la plantilla activa al iniciar sesión.
 * Llamar desde SupabaseAuthContext.
 */
export async function syncActiveTemplateOnLogin() {
  try {
    const { data, error } = await supabase
      .from('ticket_templates')
      .select('*')
      .eq('is_active', true)
      .single();

    if (!error && data) {
      await kvStorage.setItem(ACTIVE_KEY, JSON.stringify({ data, _cachedAt: Date.now() }));
    }
  } catch (e) {
    console.warn('[ticketTemplatesRepository] syncActiveTemplateOnLogin error:', e);
  }
}
