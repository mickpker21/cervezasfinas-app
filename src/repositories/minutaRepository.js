// src/repositories/minutaRepository.js
// Repository para el sistema de Minutas

import { supabase } from '@/supabaseClient';

/* ===========================
   MINUTAS (sesiones/reuniones)
   =========================== */

/**
 * Obtener todas las minutas con conteo de items
 */
export async function getMinutas() {
  const { data, error } = await supabase
    .from('minutas')
    .select(`
      *,
      profiles:created_by ( id, name, email ),
      minuta_items ( id, status )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[minutaRepo] Error fetching minutas:', error);
    return [];
  }
  return data || [];
}

/**
 * Obtener una minuta por ID con todos sus items y perfiles asignados
 */
export async function getMinutaById(minutaId) {
  const { data, error } = await supabase
    .from('minutas')
    .select(`
      *,
      creator:created_by ( id, name, email ),
      minuta_items (
        *,
        assignee:assigned_to ( id, name, email ),
        approver:approved_by ( id, name, email )
      )
    `)
    .eq('id', minutaId)
    .single();

  if (error) {
    console.error('[minutaRepo] Error fetching minuta:', error);
    return null;
  }
  return data;
}

/**
 * Crear una nueva minuta
 */
export async function createMinuta({ title, description, created_by }) {
  const { data, error } = await supabase
    .from('minutas')
    .insert({
      title,
      description,
      created_by,
      status: 'activa',
    })
    .select()
    .single();

  if (error) {
    console.error('[minutaRepo] Error creating minuta:', error);
    throw error;
  }
  return data;
}

/**
 * Actualizar una minuta
 */
export async function updateMinuta(minutaId, updates) {
  const { data, error } = await supabase
    .from('minutas')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', minutaId)
    .select()
    .single();

  if (error) {
    console.error('[minutaRepo] Error updating minuta:', error);
    throw error;
  }
  return data;
}

/**
 * Cerrar una minuta
 */
export async function closeMinuta(minutaId) {
  return updateMinuta(minutaId, { status: 'cerrada' });
}

/* ===========================
   MINUTA ITEMS (actividades)
   =========================== */

/**
 * Crear un item/actividad en una minuta
 */
export async function createMinutaItem({ minuta_id, assigned_to, title, description, due_date }) {
  const { data, error } = await supabase
    .from('minuta_items')
    .insert({
      minuta_id,
      assigned_to,
      title,
      description,
      due_date,
      status: 'pendiente',
    })
    .select(`
      *,
      assignee:assigned_to ( id, name, email )
    `)
    .single();

  if (error) {
    console.error('[minutaRepo] Error creating item:', error);
    throw error;
  }
  return data;
}

/**
 * Obtener items asignados a un usuario específico
 */
export async function getMyMinutaItems(userId) {
  const { data, error } = await supabase
    .from('minuta_items')
    .select(`
      *,
      minuta:minuta_id ( id, title, status ),
      approver:approved_by ( id, name, email )
    `)
    .eq('assigned_to', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[minutaRepo] Error fetching my items:', error);
    return [];
  }
  return data || [];
}

/**
 * Actualizar el estatus de un item
 */
export async function updateMinutaItemStatus(itemId, status, notes = null) {
  const updates = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (notes !== null) {
    updates.evidence_notes = notes;
  }

  const { data, error } = await supabase
    .from('minuta_items')
    .update(updates)
    .eq('id', itemId)
    .select()
    .single();

  if (error) {
    console.error('[minutaRepo] Error updating item status:', error);
    throw error;
  }
  return data;
}

/**
 * Subir evidencia fotográfica y actualizar el item
 */
export async function uploadEvidence(itemId, file) {
  const ext = file.name?.split('.').pop() || 'jpg';
  const path = `${itemId}/${Date.now()}.${ext}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('minuta-evidence')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error('[minutaRepo] Error uploading evidence:', uploadError);
    throw uploadError;
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('minuta-evidence')
    .getPublicUrl(path);

  const publicUrl = urlData?.publicUrl;

  // Append URL to evidence_urls array
  // First get current URLs
  const { data: current } = await supabase
    .from('minuta_items')
    .select('evidence_urls')
    .eq('id', itemId)
    .single();

  const urls = [...(current?.evidence_urls || []), publicUrl];

  const { data, error } = await supabase
    .from('minuta_items')
    .update({
      evidence_urls: urls,
      status: 'evidencia_enviada',
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .select()
    .single();

  if (error) {
    console.error('[minutaRepo] Error updating evidence URLs:', error);
    throw error;
  }

  return { ...data, newUrl: publicUrl };
}

/**
 * Aprobar la evidencia de un item
 */
export async function approveItem(itemId, approvedBy) {
  const { data, error } = await supabase
    .from('minuta_items')
    .update({
      status: 'aprobada',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .select()
    .single();

  if (error) {
    console.error('[minutaRepo] Error approving item:', error);
    throw error;
  }
  return data;
}

/**
 * Rechazar la evidencia de un item
 */
export async function rejectItem(itemId, reason) {
  const { data, error } = await supabase
    .from('minuta_items')
    .update({
      status: 'rechazada',
      rejection_reason: reason,
      approved_by: null,
      approved_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .select()
    .single();

  if (error) {
    console.error('[minutaRepo] Error rejecting item:', error);
    throw error;
  }
  return data;
}

/**
 * Eliminar un item de minuta
 */
export async function deleteMinutaItem(itemId) {
  const { error } = await supabase
    .from('minuta_items')
    .delete()
    .eq('id', itemId);

  if (error) {
    console.error('[minutaRepo] Error deleting item:', error);
    throw error;
  }
}
