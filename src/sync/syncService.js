// src/sync/syncService.js
import { isOnline } from '@/lib/network';
import { supabase } from '@/supabaseClient';
import { getDb, isMockDb } from '@/lib/localDb';
import { base64ToBlob } from '@/lib/fileUtils';
import { logger } from '@/lib/logger';
import { awardDirectSalePoints } from '@/lib/directSalePoints';

// ─── Concurrency Guard ────────────────────────────────────────────────────────
// Prevents two concurrent syncPendingOperations() calls from reading the same
// queue simultaneously and creating duplicate records.
let isSyncing = false;

/**
 * ============================================================================
 * CORE FUNCTIONS: Load/Add/Remove Pending Operations
 * ============================================================================
 */

/**
 * Lee todas las operaciones pendientes desde SQLite
 */
async function loadPendingOperations() {
  try {
    const db = await getDb();
    if (isMockDb()) {
      return db._storage.get('pending_operations') || [];
    }

    const res = await db.query('SELECT * FROM pending_operations ORDER BY id ASC');
    const rows = res.values || [];

    return rows.map(r => ({
      ...r,
      payload: r.payload ? JSON.parse(r.payload) : {}
    }));
  } catch (e) {
    logger.error('SYNC', 'LOAD_PENDING_OPS_FAILED', e);
    return [];
  }
}

/**
 * Agrega una operación pendiente (con deduplicación básica)
 */
export async function addPendingOperation(op) {
  logger.info('SYNC', 'ADD_PENDING_OP', { type: op.entity_type, operation: op.operation });

  try {
    const db = await getDb();
    const now = new Date().toISOString();

    if (isMockDb()) {
      let current = db._storage.get('pending_operations') || [];

      // -- BEGIN DEDUPLICATION LOGIC --
      // If an update comes in for the same entity and same ID, we just overwrite the payload
      // instead of creating multiple pending updates for the same record.
      if (op.operation === 'update' && op.payload) {
        const opId = op.payload.id || op.payload.order_id;
        if (opId) {
          const existingIndex = current.findIndex(existingOp =>
            existingOp.entity_type === op.entity_type &&
            existingOp.operation === 'update' &&
            (existingOp.payload?.id === opId || existingOp.payload?.order_id === opId)
          );
          if (existingIndex !== -1) {
            logger.info('SYNC', 'DEDUPLICATED_MOCK', { id: opId });
            current[existingIndex].payload = { ...current[existingIndex].payload, ...op.payload };
            current[existingIndex].created_at = now;
            db._storage.set('pending_operations', current);
            return;
          }
        }
      }
      // -- END DEDUPLICATION LOGIC --

      const nextId = current.length ? current[current.length - 1].id + 1 : 1;
      db._storage.set('pending_operations', [...current, { ...op, id: nextId, created_at: now }]);
      return;
    }

    // -- BEGIN DEDUPLICATION LOGIC (SQLite) --
    if (op.operation === 'update' && op.payload) {
      const opId = op.payload.id || op.payload.order_id;
      if (opId) {
        const res = await db.query(`
          SELECT id, payload FROM pending_operations 
          WHERE entity_type = ? AND operation = 'update'
          ORDER BY id DESC LIMIT 1
        `, [op.entity_type]);

        if (res.values && res.values.length > 0) {
          try {
            const parsedPayload = JSON.parse(res.values[0].payload);
            const existingId = parsedPayload.id || parsedPayload.order_id;
            
            if (existingId === opId) {
              logger.info('SYNC', 'DEDUPLICATED_SQLITE', { id: opId });
              const mergedPayload = { ...parsedPayload, ...op.payload };
              await db.run('UPDATE pending_operations SET payload = ?, created_at = ? WHERE id = ?', [
                JSON.stringify(mergedPayload),
                now,
                res.values[0].id
              ]);
              return;
            }
          } catch (e) {
            logger.warn('SYNC', 'DEDUP_PARSE_ERROR', e);
          }
        }
      }
    }
    // -- END DEDUPLICATION LOGIC --

    await db.run(`
      INSERT INTO pending_operations(entity_type, operation, payload, created_at)
      VALUES(?, ?, ?, ?)
    `, [
      op.entity_type,
      op.operation,
      JSON.stringify(op.payload),
      now
    ]);
    console.log('[SYNC] ✅ Pending operation saved to SQLite:', {
      entity_type: op.entity_type,
      operation: op.operation,
      hasPayload: !!op.payload
    });
  } catch (e) {
    logger.error('SYNC', 'ADD_PENDING_OP_FAILED', { type: op.entity_type, error: e });
    console.error('[SYNC] ❌ FAILED to save pending operation:', e);
    throw e; // Re-throw para que el caller sepa que falló
  }
}

/**
 * Cuenta cuántas operaciones pendientes hay
 */
export async function countPendingOperations() {
  const ops = await loadPendingOperations();
  return ops.length;
}

/**
 * Elimina una operación pendiente por ID
 */
async function removePendingOperation(id) {
  try {
    const db = await getDb();
    if (isMockDb()) {
      const current = db._storage.get('pending_operations') || [];
      db._storage.set('pending_operations', current.filter(op => op.id !== id));
      return;
    }
    await db.run('DELETE FROM pending_operations WHERE id = ?', [id]);
    logger.info('SYNC', 'PENDING_OP_REMOVED', { id });
  } catch (e) {
    logger.error('SYNC', 'REMOVE_PENDING_OP_FAILED', { id, error: e });
    throw e;
  }
}

/**
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

/**
 * Helper para subir foto Base64 a Hostinger
 */
async function uploadPhotoFromBase64(base64Data, bucket, path) {
  try {
    const blob = await base64ToBlob(base64Data);
    const { uploadPhoto } = await import('@/lib/uploadService');
    return await uploadPhoto(blob, bucket);
  } catch (e) {
    logger.warn('SYNC', 'PHOTO_UPLOAD_FAILED', { bucket, error: e.message });
    return null;
  }
}

/**
 * Detecta si un error es por duplicado (idempotencia)
 */
function isDuplicateError(error) {
  if (!error) return false;

  // Postgres/Supabase code
  const code = error.code || error.error_code || error.statusCode;
  if (code === '23505' || code === 23505) return true;

  // MySQL codes
  if (code === 'ER_DUP_ENTRY' || code === 1062) return true;

  // String fallback
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('duplicate key') ||
    msg.includes('already exists') ||
    msg.includes('duplicate entry') ||
    msg.includes('unique constraint')) {
    return true;
  }

  // Supabase specific
  if (error.details && typeof error.details === 'string') {
    const details = error.details.toLowerCase();
    if (details.includes('already exists') || details.includes('duplicate')) {
      return true;
    }
  }

  return false;
}

/**
 * ============================================================================
 * ENTITY-SPECIFIC SYNC HANDLERS
 * ============================================================================
 */

/**
 * Handler: Client (MySQL)
 */
async function syncClient(op) {
  const payload = op.payload;
  logger.info('SYNC', 'CLIENT_START', { id: payload.id, operation: op.operation });

  const { importClientsApi } = await import('@/lib/mysqlClients');

  if (op.operation === 'insert' || op.operation === 'update') {
    const { synced, ...cleanPayload } = payload;
    const res = await importClientsApi([cleanPayload]);

    if (res.errors && res.errors.length > 0) {
      throw new Error('MySQL Import Errors: ' + JSON.stringify(res.errors));
    }

    try {
      const { getDb, isMockDb } = await import('@/lib/localDb');
      const db = await getDb();
      if (!isMockDb()) {
        await db.run('UPDATE clients SET synced = 1 WHERE id = ?', [payload.id]);
      }
    } catch (localErr) {
      logger.warn('SYNC', 'CLIENT_LOCAL_SYNCED_MARK_FAILED', { id: payload.id, error: localErr.message });
    }

    logger.info('SYNC', 'CLIENT_SUCCESS', { id: payload.id });
  }
}

/**
 * Handler: Visit (MySQL)
 */
async function syncVisit(op) {
  const payload = op.payload;
  logger.info('SYNC', 'VISIT_START', { id: payload.id });

  const base64Photos = payload._base64_photos || {};
  if (!payload.photo_fachada && !base64Photos.fachada) {
    throw new Error('La visita no contiene foto de fachada; se conserva pendiente y no se sincroniza.');
  }

  const { importVisitsApi } = await import('@/lib/mysqlVisits');

  // Keep the visit queued until every captured image has uploaded.
  if (Object.keys(base64Photos).length) {
    for (const [key, base64] of Object.entries(base64Photos)) {
      const photoUrl = await uploadPhotoFromBase64(base64, 'visitas-fotos', `visit_${payload.id}_${key}.jpg`);
      if (!photoUrl) throw new Error(`No se pudo subir la foto ${key}; la visita se mantiene pendiente.`);
      payload[`photo_${key}`] = photoUrl;
    }

    delete payload._base64_photos;
  }

  const res = await importVisitsApi([payload]);
  if (res.errors && res.errors.length > 0) {
    throw new Error('MySQL Import Errors: ' + JSON.stringify(res.errors));
  }

  try {
    const { getDb, isMockDb } = await import('@/lib/localDb');
    const db = await getDb();
    if (isMockDb()) {
      const visits = db._storage.get('visitas') || [];
      db._storage.set('visitas', visits.map(visit => visit.id === payload.id
        ? { ...visit, photo_fachada: payload.photo_fachada, photo_interior: payload.photo_interior, photo_enfriador: payload.photo_enfriador, synced: 1 }
        : visit));
    } else {
      await db.run('UPDATE visitas SET photo_fachada = ?, photo_interior = ?, photo_enfriador = ?, synced = 1 WHERE id = ?', [
        payload.photo_fachada || null,
        payload.photo_interior || null,
        payload.photo_enfriador || null,
        payload.id
      ]);
    }
  } catch (localError) {
    logger.warn('SYNC', 'VISIT_LOCAL_CACHE_UPDATE_FAILED', { id: payload.id, error: localError.message });
  }

  logger.info('SYNC', 'VISIT_SUCCESS', { id: payload.id });
}

/**
 * Handler: Evaluation PDV (MySQL)
 */
async function syncEvaluationPDV(op) {
  const payload = op.payload || {};
  logger.info('SYNC', 'EVAL_PDV_START', { id: payload.id });

  const { importEvaluationsPDVApi } = await import('@/lib/mysqlEvaluations');
  const { sanitizeEvalForMySQL } = await import('@/repositories/evaluationsRepository');

  if (typeof payload.payload === 'string') {
    try { payload.payload = JSON.parse(payload.payload); } catch { payload.payload = {}; }
  }

  // Handle Base64 photos
  const rawBase64Photos = payload.payload?._base64_photos ? { ...payload.payload._base64_photos } : null;
  if (payload.payload?._base64_photos) {
    const photos = payload.payload._base64_photos;

    for (const [key, base64] of Object.entries(photos)) {
      const photoUrl = await uploadPhotoFromBase64(base64, 'visitas-fotos', `eval_${payload.id}_${key}.jpg`);
      if (photoUrl) {
        payload.payload[`photo_${key}`] = photoUrl;
      }
    }

    delete payload.payload._base64_photos;
  }

  // 🤖 AUTO-EVALUACIÓN IA AL SINCRONIZAR (cuando la evaluación PDV con IA fue capturada en modo Offline sin chip/internet)
  if (payload.payload?.ai_mode && payload.payload?.ai_status === 'pending_offline') {
    try {
      const { analyzePdvCoolerWithAI } = await import('@/services/aiCoolerEvaluationService');
      const aiRes = await analyzePdvCoolerWithAI({
        fotoFachada: rawBase64Photos?.fachada || payload.payload.photo_fachada,
        fotoInterior: rawBase64Photos?.interior || payload.payload.photo_interior,
        fotoEnfriador: rawBase64Photos?.enfriador || payload.payload.photo_enfriador,
        coolerSize: payload.payload.ai_planogram_size || payload.payload.capacidad_actual || '376',
        clientLevel: payload.payload.nivel || 'Oro',
      });
      if (aiRes) {
        payload.payload.ai_evaluation = aiRes;
        payload.payload.ai_status = 'analyzed_on_sync';
      }
    } catch (aiErr) {
      logger.warn('SYNC', 'AI_PDV_EVAL_ON_SYNC_SKIPPED', { id: payload.id, error: aiErr?.message });
    }
  }

  const sanitizedRow = sanitizeEvalForMySQL(payload, false);
  const res = await importEvaluationsPDVApi([sanitizedRow]);
  if (res.errors && res.errors.length > 0) {
    throw new Error('MySQL Import Errors: ' + JSON.stringify(res.errors));
  }

  try {
    const db = await getDb();
    if (!isMockDb()) {
      await db.run('UPDATE evaluaciones_pdv SET synced = 1 WHERE id = ?', [sanitizedRow.id]);
    }
  } catch {}

  logger.info('SYNC', 'EVAL_PDV_SUCCESS', { id: sanitizedRow.id });
}

/**
 * Handler: Evaluation Canal Moderno (MySQL)
 */
async function syncEvaluationCM(op) {
  const payload = op.payload || {};
  logger.info('SYNC', 'EVAL_CM_START', { id: payload.id });

  const { importEvaluationsCMApi } = await import('@/lib/mysqlEvaluations');
  const { sanitizeEvalForMySQL } = await import('@/repositories/evaluationsRepository');

  if (typeof payload.payload === 'string') {
    try { payload.payload = JSON.parse(payload.payload); } catch { payload.payload = {}; }
  }

  // Handle Base64 photos
  const rawBase64Photos = payload.payload?._base64_photos ? { ...payload.payload._base64_photos } : null;
  if (payload.payload?._base64_photos) {
    const photos = payload.payload._base64_photos;

    for (const [key, base64] of Object.entries(photos)) {
      const photoUrl = await uploadPhotoFromBase64(base64, 'evaluaciones', `${payload.id}-${key}.jpg`);
      if (photoUrl) {
        payload.payload[`photo_${key}`] = photoUrl;
      }
    }

    // Update photoUrls array
    payload.payload.photoUrls = [
      payload.payload.photo_fachada,
      payload.payload.photo_destino,
      payload.payload.photo_impulso
    ].filter(Boolean);

    delete payload.payload._base64_photos;
  }

  // 🤖 AUTO-EVALUACIÓN IA AL SINCRONIZAR (cuando la evaluación OXXO / Canal Moderno con IA fue capturada Offline)
  if (payload.payload?.ai_mode && payload.payload?.ai_status === 'pending_offline') {
    try {
      const { analyzeModernChannelWithAI } = await import('@/services/aiCoolerEvaluationService');
      const isOxxo = String(payload.tipo || payload.payload.tipo || '').toUpperCase().includes('OXXO');
      const aiRes = await analyzeModernChannelWithAI({
        photoFachada: rawBase64Photos?.fachada || payload.payload.photo_fachada,
        photoDestino: rawBase64Photos?.destino || payload.payload.photo_destino,
        photoImpulso: rawBase64Photos?.impulso || payload.payload.photo_impulso,
        isOxxo,
        targetBeerPct: isOxxo ? 45 : 41,
      });
      if (aiRes) {
        payload.payload.ai_evaluation = aiRes;
        payload.payload.ai_status = 'analyzed_on_sync';
      }
    } catch (aiErr) {
      logger.warn('SYNC', 'AI_CM_EVAL_ON_SYNC_SKIPPED', { id: payload.id, error: aiErr?.message });
    }
  }

  const sanitizedRow = sanitizeEvalForMySQL(payload, true);
  const res = await importEvaluationsCMApi([sanitizedRow]);
  if (res.errors && res.errors.length > 0) {
    throw new Error('MySQL Import Errors: ' + JSON.stringify(res.errors));
  }

  try {
    const db = await getDb();
    if (!isMockDb()) {
      await db.run('UPDATE evaluaciones SET synced = 1 WHERE id = ?', [sanitizedRow.id]);
    }
  } catch {}

  logger.info('SYNC', 'EVAL_CM_SUCCESS', { id: sanitizedRow.id });
}

/**
 * Handler: Installation Order (MySQL)
 */
async function syncInstallationOrder(op) {
  const payload = op.payload;
  const { operation } = op;

  const { importOrdersApi, completeOrderApi } = await import('@/lib/mysqlOrders');

  if (operation === 'insert') {
    const orderId = payload.order?.id || 'unknown';
    logger.info('SYNC', 'ORDER_INSERT_START', { id: orderId });

    // Handle offline images in items 'notes'
    if (payload.items && Array.isArray(payload.items)) {
        for (const item of payload.items) {
            try {
                if (item.notes && item.notes.includes('data:image')) {
                    const parsedNotes = JSON.parse(item.notes);
                    let updated = false;

                    for (const photoKey of ['photo_before', 'photo_after']) {
                        if (parsedNotes[photoKey] && parsedNotes[photoKey].startsWith('data:')) {
                            const photoUrl = await uploadPhotoFromBase64(
                                parsedNotes[photoKey],
                                'asset-photos',
                                `order_${orderId}_${item.asset_type}_${photoKey}_${Date.now()}.jpg`
                            );
                            if (photoUrl) {
                                parsedNotes[photoKey] = photoUrl;
                                updated = true;
                            }
                        }
                    }

                    if (updated) {
                        item.notes = JSON.stringify(parsedNotes);
                    }
                }
            } catch (e) {
                logger.warn('SYNC', 'ORDER_PHOTO_PARSE_FAILED', { error: e.message });
            }
        }
    }

    const res = await importOrdersApi([payload]);
    if (res.errors && res.errors.length > 0) {
      throw new Error('MySQL Import Errors: ' + JSON.stringify(res.errors));
    }
    logger.info('SYNC', 'ORDER_INSERT_SUCCESS', { id: orderId });
    logger.info('SYNC', 'ORDER_COMPLETE_SUCCESS', { id: orderId });
  } else if (operation === 'update') {
    const orderId = payload.order_id;
    logger.info('SYNC', 'ORDER_UPDATE_START', { id: orderId });
    
    // Extract data except order_id
    const { order_id, ...updateData } = payload;
    const res = await updateOrderApi(orderId, updateData);
    
    if (res.status === 'error') {
      throw new Error('Order Update Error: ' + res.message);
    }
    logger.info('SYNC', 'ORDER_UPDATE_SUCCESS', { id: orderId });
  }
}

/**
 * Handler: Asset (MySQL)
 */
async function syncAsset(op) {
  const payload = op.payload;
  const { operation } = op;
  const { importAssetsApi, updateAssetApi } = await import('@/lib/mysqlOrders');

  if (operation === 'insert') {
    logger.info('SYNC', 'ASSET_INSERT_START', { id: payload.id || payload.serial });
    const assets = Array.isArray(payload.assets) ? payload.assets : [payload];
    const res = await importAssetsApi(assets);
    if (res.errors && res.errors.length > 0) {
      throw new Error('MySQL Asset Import Errors: ' + JSON.stringify(res.errors));
    }
    logger.info('SYNC', 'ASSET_INSERT_SUCCESS', { id: payload.id || payload.serial });
  } else if (operation === 'update') {
    logger.info('SYNC', 'ASSET_UPDATE_START', { id: payload.id });
    const { id, ...updateData } = payload;
    const res = await updateAssetApi(payload);
    if (res.status === 'error') {
      throw new Error('MySQL Asset Update Error: ' + res.message);
    }
    logger.info('SYNC', 'ASSET_UPDATE_SUCCESS', { id: payload.id });
  }
}

/**
 * Handler: Onboard Supervision (MySQL)
 */
async function syncOnboardSupervision(op) {
  const payload = op.payload;
  logger.info('SYNC', 'ONBOARD_SUPERVISION_START', { id: payload.id });

  const { importOnboardSupervisionApi } = await import('@/lib/mysqlOnboard');
  const res = await importOnboardSupervisionApi({ supervisions: [payload] });

  if (res.errors && res.errors.length > 0) {
    throw new Error('MySQL Onboard Supervision Errors: ' + JSON.stringify(res.errors));
  }
  logger.info('SYNC', 'ONBOARD_SUPERVISION_SUCCESS', { id: payload.id });
}

/**
 * Handler: Onboard Visit (MySQL)
 */
async function syncOnboardVisit(op) {
  const payload = op.payload;
  logger.info('SYNC', 'ONBOARD_VISIT_START', { id: payload.id });

  const { importOnboardSupervisionApi } = await import('@/lib/mysqlOnboard');
  const res = await importOnboardSupervisionApi({ visits: [payload] });

  if (res.errors && res.errors.length > 0) {
    throw new Error('MySQL Onboard Visit Errors: ' + JSON.stringify(res.errors));
  }
  logger.info('SYNC', 'ONBOARD_VISIT_SUCCESS', { id: payload.id });
}

/**
 * Handler: Preventa (Supabase) - WITH ATOMIC RPC
 */
async function syncPreventa(op) {
  const payload = op.payload;
  // Older queued operations may predate client generated preventa IDs.
  const preventaId = payload.id || crypto.randomUUID();
  payload.id = preventaId;
  logger.info('SYNC', 'PREVENTA_START', { id: preventaId });

  // Use Atomic RPC to insert header and items together
  const preventaHeader = {
    id: payload.id,
    user_id: payload.user_id,
    client_id: payload.client_id,
    total_amount: payload.total_amount,
    status: payload.status || 'pendiente',
    gec_discount: payload.gec_discount || 0,
    promo_discount: payload.promo_discount || 0,
    cargo: payload.cargo || null,
    created_at: payload.created_at
  };

  const items = payload.items || [];

  const { data, error } = await supabase.rpc('sync_preventa_atomic', {
    p_preventa: preventaHeader,
    p_items: items
  });

  if (error) {
    // Si el RPC de Supabase falla porque preventa_items no tiene columna des_marca,
    // sincronizar directamente insertando solo columnas válidas
    if (String(error.message || '').includes('des_marca')) {
      const { error: headErr } = await supabase.from('preventa').upsert(preventaHeader, { onConflict: 'id' });
      if (headErr) throw headErr;
      if (items.length > 0) {
        const cleanItems = items.map(it => ({
          preventa_id: preventaId,
          cve_marca: it.cve_marca || it.sku,
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
          total_price: Number(it.total_price) || ((Number(it.quantity) || 1) * (Number(it.unit_price) || 0))
        }));
        const { error: itErr } = await supabase.from('preventa_items').insert(cleanItems);
        if (itErr && !String(itErr.message || '').includes('duplicate')) throw itErr;
      }
      return { success: true, fallback: true };
    }
    logger.error('SYNC', 'PREVENTA_ATOMIC_FAILED', { id: preventaId, error });
    throw error;
  }

  // Handling standard success or custom dup response
  if (data && data.success === false && data.error === 'DUPLICATE') {
    logger.warn('SYNC', 'PREVENTA_DUPLICATE_CAUGHT_IN_RPC', { id: preventaId });
    const err = new Error('RPC returned duplicate');
    err.code = '23505'; // mimic postgres constraint violation to trigger isDuplicateError check
    throw err;
  }

  logger.info('SYNC', 'PREVENTA_SUCCESS', { id: preventaId });
}

/**
 * Handler: Direct Sale (Supabase) - WITH ATOMIC RPC
 * CRITICAL: This handler is now 100% atomic in the DB via RPC
 */
async function syncDirectSale(op) {
  const { sale, items } = op.payload;
  const saleId = sale?.id;

  logger.info('SYNC', 'DIRECT_SALE_START_ATOMIC', { id: saleId, itemCount: items?.length || 0 });

  // Validate
  if (!sale || !saleId) {
    throw new Error('Invalid direct_sale payload: missing sale header');
  }
  if (!items || items.length === 0) {
    throw new Error('Invalid direct_sale payload: missing items');
  }

  // Clean payload - Build object with ONLY valid direct_sales columns
  const cleanSaleHeader = {
    id: sale.id,
    user_id: sale.user_id,
    client_id: sale.client_id,
    total_amount: sale.total_amount,
    payment_method: sale.payment_method || 'CASH',
    status: sale.status || 'COMPLETED',
    gec_discount: sale.gec_discount || 0,
    promo_discount: sale.promo_discount || 0,
    cargo: sale.cargo || null,
    created_at: sale.created_at
  };

  const mappedItems = items.map(item => ({
    cve_marca: item.cve_marca,
    quantity: item.quantity,
    unit_price: item.price,
    total_price: item.price * item.quantity,
    des_marca: item.des_marca || ''
  }));

  const { data, error } = await supabase.rpc('sync_direct_sale_atomic', {
    p_sale: cleanSaleHeader,
    p_items: mappedItems
  });

  if (error) {
    logger.error('SYNC', 'DIRECT_SALE_ATOMIC_FAILED', { id: saleId, error });
    console.error(`❌❌❌ [SYNC] DIRECT_SALE_ATOMIC_FAILED:`, JSON.stringify(error, null, 2));
    throw error;
  }

  if (data && data.success === false && data.error === 'DUPLICATE') {
    logger.warn('SYNC', 'DIRECT_SALE_DUPLICATE_CAUGHT_IN_RPC', { id: saleId });
    // A previous sync may have inserted the sale before its points request
    // completed. The points endpoint is idempotent, so retry it before dropping
    // this duplicate from the queue.
    await awardDirectSalePoints(saleId);
    const err = new Error('RPC returned duplicate');
    err.code = '23505'; // trigger idempotent handler downstream
    throw err;
  }

  await awardDirectSalePoints(saleId);
  logger.info('SYNC', 'DIRECT_SALE_SUCCESS_ATOMIC', { id: saleId });
}

async function syncDirectSalePoints(op) {
  const saleId = op.payload?.sale_id;
  if (!saleId) throw new Error('Invalid direct_sale_points payload: missing sale_id');
  await awardDirectSalePoints(saleId);
  logger.info('SYNC', 'DIRECT_SALE_POINTS_SUCCESS', { id: saleId });
}

async function syncPreventaPoints(op) {
  const preventaId = op.payload?.preventa_id;
  if (!preventaId) throw new Error('Invalid preventa_points payload: missing preventa_id');
  const { awardPreventaPoints } = await import('@/lib/preventaPoints');
  await awardPreventaPoints(preventaId);
  logger.info('SYNC', 'PREVENTA_POINTS_SUCCESS', { id: preventaId });
}

/**
 * ============================================================================
 * MAIN SYNC LOGIC
 * ============================================================================
 */

/**
 * Handler: Stock Request
 */
async function syncStockRequest(op) {
  const payload = op.payload;
  logger.info('SYNC', 'STOCK_REQUEST_START', { id: payload.id });

  const { error } = await supabase.from('stock_requests').upsert(payload);
  if (error) {
    throw error;
  }

  // Update local SQLite synced flag as well via direct query
  try {
    const db = await getDb();
    if (isMockDb()) {
      const all = db._storage.get('stock_requests') || [];
      const updated = all.map(r => r.id === payload.id ? { ...r, synced: 1 } : r);
      db._storage.set('stock_requests', updated);
    } else {
      await db.run('UPDATE stock_requests SET synced = 1 WHERE id = ?', [payload.id]);
    }
  } catch (e) { /* ignore cleanup error, main table is what matters */ }

  logger.info('SYNC', 'STOCK_REQUEST_SUCCESS', { id: payload.id });
}

/**
 * Handler: Censo Supervisor (MySQL)
 */
async function syncCensoSupervisor(op) {
  const payload = op.payload;
  logger.info('SYNC', 'CENSO_SUPERVISOR_START', { id: payload.id });

  // If photo is stored as base64, upload it first
  if (payload.photo_url && payload.photo_url.startsWith('data:')) {
    const photoUrl = await uploadPhotoFromBase64(
      payload.photo_url,
      'visitas-fotos',
      `censo_${payload.id}.jpg`
    );
    if (photoUrl) {
      payload.photo_url = photoUrl;
    } else {
      payload.photo_url = null; // don't block sync if photo fails
    }
  }

  // Handle Fachada photo similarly
  if (payload.photo_fachada && payload.photo_fachada.startsWith('data:')) {
    const photoFachadaUrl = await uploadPhotoFromBase64(
      payload.photo_fachada,
      'visitas-fotos',
      `censo_${payload.id}_fachada.jpg`
    );
    if (photoFachadaUrl) {
      payload.photo_fachada = photoFachadaUrl;
    } else {
      payload.photo_fachada = null; // don't block sync if photo fails
    }
  }

  const { importCensosApi } = await import('@/lib/mysqlCensos');
  const res = await importCensosApi([payload]);

  if (res.errors && res.errors.length > 0) {
    throw new Error('MySQL Censos Import Errors: ' + JSON.stringify(res.errors));
  }

  // Mark local record as synced
  try {
    const { getDb, isMockDb } = await import('@/lib/localDb');
    const db = await getDb();
    if (isMockDb()) {
      const all = db._storage.get('censos_supervisor') || [];
      db._storage.set('censos_supervisor', all.map(c => c.id === payload.id ? { ...c, synced: 1 } : c));
    } else {
      await db.run('UPDATE censos_supervisor SET synced = 1 WHERE id = ?', [payload.id]);
    }
  } catch (e) { /* non-critical cleanup */ }

  logger.info('SYNC', 'CENSO_SUPERVISOR_SUCCESS', { id: payload.id });
}

/**
 * Handler: Support Ticket Area (MySQL)
 */
async function syncSupportTicketArea(op) {
  const payload = op.payload;
  logger.info('SYNC', 'HELPDESK_AREA_START', { id: payload.id });

  const { importHelpdeskApi } = await import('@/lib/mysqlHelpdesk');
  const res = await importHelpdeskApi({ areas: [payload] });

  if (res.errors && res.errors.length > 0) throw new Error('MySQL Helpdesk Area Errors: ' + JSON.stringify(res.errors));

  try {
    const { getDb, isMockDb } = await import('@/lib/localDb');
    const db = await getDb();
    if (isMockDb()) {
      const all = db._storage.get('support_ticket_areas') || [];
      db._storage.set('support_ticket_areas', all.map(c => c.id === payload.id ? { ...c, synced: 1 } : c));
    } else {
      await db.run('UPDATE support_ticket_areas SET synced = 1 WHERE id = ?', [payload.id]);
    }
  } catch (e) {}

  logger.info('SYNC', 'HELPDESK_AREA_SUCCESS', { id: payload.id });
}

/**
 * Handler: Support Ticket (MySQL)
 */
async function syncSupportTicket(op) {
  const payload = op.payload;
  logger.info('SYNC', 'HELPDESK_TICKET_START', { id: payload.id });

  const { importHelpdeskApi } = await import('@/lib/mysqlHelpdesk');
  const res = await importHelpdeskApi({ tickets: [payload] });

  if (res.errors && res.errors.length > 0) throw new Error('MySQL Helpdesk Ticket Errors: ' + JSON.stringify(res.errors));

  try {
    const { getDb, isMockDb } = await import('@/lib/localDb');
    const db = await getDb();
    if (isMockDb()) {
      const all = db._storage.get('support_tickets') || [];
      db._storage.set('support_tickets', all.map(c => c.id === payload.id ? { ...c, synced: 1 } : c));
    } else {
      await db.run('UPDATE support_tickets SET synced = 1 WHERE id = ?', [payload.id]);
    }
  } catch (e) {}

  logger.info('SYNC', 'HELPDESK_TICKET_SUCCESS', { id: payload.id });
}

/**
 * Handler: Support Ticket Message (MySQL)
 */
async function syncSupportTicketMessage(op) {
  const payload = op.payload;
  logger.info('SYNC', 'HELPDESK_MESSAGE_START', { id: payload.id });

  const { importHelpdeskApi } = await import('@/lib/mysqlHelpdesk');
  const res = await importHelpdeskApi({ messages: [payload] });

  if (res.errors && res.errors.length > 0) throw new Error('MySQL Helpdesk Message Errors: ' + JSON.stringify(res.errors));

  try {
    const { getDb, isMockDb } = await import('@/lib/localDb');
    const db = await getDb();
    if (isMockDb()) {
      const all = db._storage.get('support_ticket_messages') || [];
      db._storage.set('support_ticket_messages', all.map(c => c.id === payload.id ? { ...c, synced: 1 } : c));
    } else {
      await db.run('UPDATE support_ticket_messages SET synced = 1 WHERE id = ?', [payload.id]);
    }
  } catch (e) {}

  logger.info('SYNC', 'HELPDESK_MESSAGE_SUCCESS', { id: payload.id });
}

/**
 * Map de entity_type a handler
 */
const SYNC_HANDLERS = {
  client: syncClient,
  visit: syncVisit,
  evaluation_pdv: syncEvaluationPDV,
  evaluation: syncEvaluationCM,
  installation_order: syncInstallationOrder,
  preventa: syncPreventa,
  direct_sale: syncDirectSale,
  direct_sale_points: syncDirectSalePoints,
  preventa_points: syncPreventaPoints,
  stock_request: syncStockRequest,
  censo_supervisor: syncCensoSupervisor,
  asset: syncAsset,
  supervisor_onboard_supervision: syncOnboardSupervision,
  supervisor_onboard_visit: syncOnboardVisit,
  support_ticket_area: syncSupportTicketArea,
  support_ticket: syncSupportTicket,
  support_ticket_message: syncSupportTicketMessage,
};

/**
 * Sincroniza UNA operación pendiente (atomic unit)
 */
async function syncSingleOperation(op) {
  logger.info('SYNC', 'OP_START', { id: op.id, type: op.entity_type, operation: op.operation });

  const handler = SYNC_HANDLERS[op.entity_type];

  if (!handler) {
    logger.warn('SYNC', 'NO_HANDLER', { id: op.id, type: op.entity_type });
    return { success: false, duplicate: false, reason: 'NO_HANDLER' };
  }

  try {
    await handler(op);
    logger.info('SYNC', 'OP_SUCCESS', { id: op.id, type: op.entity_type });
    return { success: true, duplicate: false };
  } catch (error) {
    if (isDuplicateError(error)) {
      logger.warn('SYNC', 'OP_DUPLICATE', { id: op.id, type: op.entity_type });
      return { success: false, duplicate: true };
    }

    logger.error('SYNC', 'OP_FAILED', { id: op.id, type: op.entity_type, error: error.message });
    throw error; // Re-throw para que caller lo maneje
  }
}

/**
 * Sincroniza TODAS las operaciones pendientes
 * Returns: { synced, failed, skipped }
 */
export async function syncPendingOperations() {
  // ── Mutex: skip if already syncing ──────────────────────────────────────
  if (isSyncing) {
    console.log('[SYNC] ⏩ Ya hay una sincronización en curso — omitiendo llamada concurrente');
    return { synced: 0, failed: 0, skipped: 0 };
  }
  isSyncing = true;
  // ────────────────────────────────────────────────────────────────────────

  try {
    const online = await isOnline();
    if (!online) {
      logger.info('SYNC', 'SKIPPED_OFFLINE');
      return { synced: 0, failed: 0, skipped: 0 };
    }

    // Dispatch sync start event
    window.dispatchEvent(new CustomEvent('sync-start'));

    const ops = await loadPendingOperations();
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔄 [SYNC] INICIANDO SINCRONIZACIÓN');
    console.log('═══════════════════════════════════════════════════════');
    console.log('[SYNC] Operaciones pendientes encontradas:', ops.length);

    if (!ops.length) {
      logger.info('SYNC', 'NO_PENDING_OPS');
      console.log('[SYNC] ✅ No hay operaciones pendientes');
      console.log('═══════════════════════════════════════════════════════');
      return { synced: 0, failed: 0, skipped: 0 };
    }

    // Log detailed breakdown
    const breakdown = {};
    ops.forEach(op => {
      breakdown[op.entity_type] = (breakdown[op.entity_type] || 0) + 1;
    });
    console.log('[SYNC] Desglose por tipo:', breakdown);
    console.log('[SYNC] Handlers disponibles:', Object.keys(SYNC_HANDLERS));

    logger.info('SYNC', 'START', { count: ops.length });

    let synced = 0;
    let failed = 0;
    let skipped = 0;

    for (const op of ops) {
      // Ensure we have a retry_count initialized for backwards compatibility
      op.retry_count = op.retry_count || 0;

      try {
        const result = await syncSingleOperation(op);

        if (result.success) {
          // Operation succeeded - remove from pending
          await removePendingOperation(op.id);
          synced++;
        } else if (result.duplicate) {
          // Duplicate - safe to remove
          await removePendingOperation(op.id);
          skipped++;
        } else {
          // No handler or other non-critical issue - skip but don't remove and don't increment retry
          skipped++;
        }
      } catch (e) {
        op.retry_count += 1;
        const maxRetries = 5;

        if (op.retry_count >= maxRetries) {
          logger.error('SYNC', 'OP_MAX_RETRIES_REACHED_RETAINED', { id: op.id, type: op.entity_type, error: e.message });
        } else {
          logger.warn('SYNC', 'OP_RETAINED', { id: op.id, type: op.entity_type, retries: op.retry_count, error: e.message });
        }

        // Never discard a user's offline work because of a retry limit. The limit
        // changes logging only; the queue item remains available for the next sync.
        try {
          const db = await getDb();
          if (!isMockDb()) {
            await db.run('UPDATE pending_operations SET retry_count = ? WHERE id = ?', [op.retry_count, op.id]);
          } else {
            const current = db._storage.get('pending_operations') || [];
            const existingIndex = current.findIndex(existingOp => existingOp.id === op.id);
            if (existingIndex !== -1) {
              current[existingIndex].retry_count = op.retry_count;
              db._storage.set('pending_operations', current);
            }
          }
        } catch (updateErr) {
          logger.error('SYNC', 'FAILED_TO_UPDATE_RETRY_COUNT', updateErr);
        }
        failed++;
      }
    }

    logger.info('SYNC', 'COMPLETE', { synced, failed, skipped, total: ops.length });

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ [SYNC] SINCRONIZACIÓN COMPLETADA');
    console.log('═══════════════════════════════════════════════════════');
    console.log('[SYNC] ✅ Sincronizadas:', synced);
    console.log('[SYNC] ❌ Fallidas:', failed);
    console.log('[SYNC] ⏩ Omitidas (Duplicados):', skipped);
    console.log('[SYNC] 📊 Total procesadas:', ops.length);
    console.log('═══════════════════════════════════════════════════════');

    // Dispatch events
    if (synced > 0 || skipped > 0) {
      window.dispatchEvent(new CustomEvent('sync-completed', {
        detail: { synced, failed, skipped }
      }));
    }

    // Dispatch error event if any failed
    if (failed > 0) {
      window.dispatchEvent(new CustomEvent('sync-error', {
        detail: { message: `${failed} operaciones fallaron`, failed }
      }));
    }

    // Trigger inventory refresh
    logger.info('SYNC', 'TRIGGER_INVENTORY_REFRESH');
    window.dispatchEvent(new CustomEvent('sync-inventory-refresh'));

    return { synced, failed, skipped };
  } finally {
    isSyncing = false;
  }
}

/**
 * Descarga y cachea los datos del Kiosco (PIN y perfiles con rostro)
 */
export async function syncKioskData() {
  try {
    const online = await isOnline();
    if (!online) return false;

    const db = await getDb();
    
    // 1. Sync global_settings (Kiosk PIN)
    const { data: settings, error: errSettings } = await supabase.from('global_settings').select('*');
    if (!errSettings && settings) {
      if (settings.length && isMockDb()) {
        db._storage.set('global_settings', settings);
      } else if (settings.length) {
        await db.execute('BEGIN TRANSACTION');
        try {
          await db.run('DELETE FROM global_settings');
          for (const s of settings) {
            await db.run('INSERT INTO global_settings (key, value, updated_at) VALUES (?, ?, ?)', [s.key, s.value, s.updated_at]);
          }
          await db.execute('COMMIT');
        } catch (error) {
          await db.execute('ROLLBACK');
          throw error;
        }
      }
    }

    // 2. Sync profiles with face descriptors
    const { data: profiles, error: errProfiles } = await supabase
        .from('profiles')
        .select('id, name, role, face_descriptor, zona')
        .not('face_descriptor', 'is', null);

    if (!errProfiles && profiles) {
      if (profiles.length && isMockDb()) {
        db._storage.set('profiles_kiosk', profiles);
      } else if (profiles.length) {
        await db.execute('BEGIN TRANSACTION');
        try {
          await db.run('DELETE FROM profiles');
          for (const p of profiles) {
            await db.run('INSERT INTO profiles (id, full_name, role, face_descriptor) VALUES (?, ?, ?, ?)', [p.id, p.name, p.role, p.face_descriptor]);
          }
          await db.execute('COMMIT');
        } catch (error) {
          await db.execute('ROLLBACK');
          throw error;
        }
      }
    }

    console.log('[SYNC] ✅ Kiosk data synced to local SQLite.');
    return true;
  } catch (e) {
    console.error('[SYNC] ❌ Error syncing Kiosk data:', e);
    return false;
  }
}

// END OF FILE
