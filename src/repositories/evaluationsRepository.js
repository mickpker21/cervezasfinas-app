import { getDb, isMockDb } from '@/lib/localDb';
import { isOnline } from '@/lib/network';
// import { supabase } from '@/supabaseClient'; // REMOVED: Migration to MySQL
import { fileToBase64 } from '@/lib/fileUtils';
import { importEvaluationsPDVApi, importEvaluationsCMApi } from '@/lib/mysqlEvaluations';
import { getTodayMexico, getNowMexico } from '@/lib/dateUtils';
import { uploadPhoto } from '@/lib/uploadService';

async function uploadPhotoIfOnline(file, bucket, path) {
  const url = await uploadPhoto(file, bucket);
  if (!url) throw new Error("Upload returned null");
  return url;
}

/**
 * Normaliza una fila de evaluación (PDV o Canal Moderno) para que las columnas
 * estrictas de MySQL (client_id/tienda_id INT NOT NULL, fecha DATE, created_at TIMESTAMP)
 * jamás rechacen el INSERT por valores nulos, UUIDs o strings ISO con 'T'/'Z'.
 */
export function sanitizeEvalForMySQL(rawRow, isCM = false) {
  const row = { ...(rawRow || {}) };
  let payload = row.payload;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
      if (typeof payload === 'string') payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  } else {
    payload = { ...(payload || {}) };
  }

  delete row.photo_files;
  delete payload.photo_files;

  const rawIdCandidate = isCM
    ? (row.tienda_id ?? row.client_id ?? payload.tienda_id ?? payload.client_id ?? payload.client_code ?? payload.storeInfo?.client_code)
    : (row.client_id ?? payload.client_id ?? payload.client_code ?? payload.cve_cliente);

  const numericId = parseInt(String(rawIdCandidate ?? '').replace(/[^0-9]/g, ''), 10);
  const safeIntId = Number.isFinite(numericId) && numericId > 0 ? numericId : 0;

  // Normalizar fecha a YYYY-MM-DD (columna DATE en MySQL)
  const rawFecha = String(row.fecha || payload.fecha || payload.storeInfo?.fecha || getTodayMexico()).trim();
  const safeFecha = /^\d{4}-\d{2}-\d{2}/.test(rawFecha) ? rawFecha.slice(0, 10) : getTodayMexico();

  // Normalizar created_at a YYYY-MM-DD HH:mm:ss (columna TIMESTAMP en MySQL, sin 'T' ni 'Z')
  const rawCreated = String(row.created_at || getNowMexico()).trim();
  let safeCreatedAt = getNowMexico();
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(rawCreated)) {
    safeCreatedAt = rawCreated.slice(0, 19).replace('T', ' ');
  }

  if (isCM) {
    return {
      ...row,
      tienda_id: safeIntId,
      fecha: safeFecha,
      tipo: row.tipo || payload.tipo || 'Canal Moderno',
      payload,
      created_at: safeCreatedAt,
    };
  }

  return {
    ...row,
    client_id: safeIntId,
    user_id: row.user_id || payload.user_id || null,
    fecha: safeFecha,
    puntaje_total: Number(row.puntaje_total ?? payload.puntaje_total ?? payload.score ?? 0) || 0,
    surtido_porcentaje: Number(row.surtido_porcentaje ?? payload.surtido_porcentaje ?? 0) || 0,
    payload,
    created_at: safeCreatedAt,
  };
}

/**
 * Crea una evaluación PDV
 */
export async function createEvaluationPDV(evaluation) {
  const online = await isOnline();
  const now = getNowMexico();
  const today = getTodayMexico();

  // Asegurar ID
  if (!evaluation.id) {
    evaluation.id = crypto.randomUUID();
  }

  // Extraer archivos de fotos
  const photoFiles = evaluation.photo_files || {};
  const cleanEvaluation = { ...evaluation };
  delete cleanEvaluation.photo_files;

  const payload = { ...cleanEvaluation };
  delete payload.photo_files;

  const row = sanitizeEvalForMySQL({
    id: cleanEvaluation.id,
    client_id: cleanEvaluation.client_id,
    user_id: cleanEvaluation.user_id,
    fecha: cleanEvaluation.fecha || today,
    puntaje_total: cleanEvaluation.puntaje_total || 0,
    surtido_porcentaje: cleanEvaluation.surtido_porcentaje || 0,
    payload: payload,
    created_at: now
  }, false);

  if (online) {
    // Phase 1: Upload photos (independent of DB)
    // Track which photos were already uploaded so we don't re-upload in offline fallback
    try {
      console.log('[evaluationsRepository] Fase 1: Subida de fotos online...');
      if (photoFiles.fachada) {
        try {
          const url = await uploadPhotoIfOnline(photoFiles.fachada, 'visitas-fotos', `eval_${row.id}_fachada.jpg`);
          row.payload.photo_fachada = url;
        } catch (e) { console.warn('[evaluationsRepository] Fachada upload failed, will use base64:', e.message); }
      }
      if (photoFiles.interior) {
        try {
          const url = await uploadPhotoIfOnline(photoFiles.interior, 'visitas-fotos', `eval_${row.id}_interior.jpg`);
          row.payload.photo_interior = url;
        } catch (e) { console.warn('[evaluationsRepository] Interior upload failed, will use base64:', e.message); }
      }
      if (photoFiles.enfriador) {
        try {
          const url = await uploadPhotoIfOnline(photoFiles.enfriador, 'visitas-fotos', `eval_${row.id}_enfriador.jpg`);
          row.payload.photo_enfriador = url;
        } catch (e) { console.warn('[evaluationsRepository] Enfriador upload failed, will use base64:', e.message); }
      }
    } catch (photoError) {
      console.error('[evaluationsRepository] Error general en subida de fotos:', photoError);
    }

    // Phase 2: Try MySQL insert
    try {
      console.log('[evaluationsRepository] Fase 2: Insertando en MySQL...');
      const res = await importEvaluationsPDVApi([row]);
      if (res.errors && res.errors.length > 0) throw new Error('MySQL Import Errors: ' + JSON.stringify(res.errors));

      console.log('[evaluationsRepository] Insert exitoso en MySQL');
      await insertLocalEvaluationPDV(row, true);

    } catch (dbError) {
      console.error('[evaluationsRepository] Error en MySQL, redirigiendo a modo OFFLINE:', dbError);
      // Fallback offline: only convert to base64 photos that WEREN'T already uploaded
      await handleOfflineEvaluationPDV(row, photoFiles, now);
    }
  } else {
    await handleOfflineEvaluationPDV(row, photoFiles, now);
  }

  return row;
}

async function handleOfflineEvaluationPDV(row, photoFiles, now) {
  // Only convert to Base64 photos that DON'T already have a URL
  // (they may have been uploaded successfully before the DB insert failed)
  const base64Photos = {};
  if (photoFiles.fachada && !row.payload.photo_fachada) {
    base64Photos.fachada = await fileToBase64(photoFiles.fachada);
  }
  if (photoFiles.interior && !row.payload.photo_interior) {
    base64Photos.interior = await fileToBase64(photoFiles.interior);
  }
  if (photoFiles.enfriador && !row.payload.photo_enfriador) {
    base64Photos.enfriador = await fileToBase64(photoFiles.enfriador);
  }

  if (Object.keys(base64Photos).length > 0) {
    row.payload._base64_photos = base64Photos;
  }

  await insertLocalEvaluationPDV(row, false);

  try {
    const { addPendingOperation } = await import('@/sync/syncService');
    await addPendingOperation({
      entity_type: 'evaluation_pdv',
      operation: 'insert',
      payload: row,
      created_at: now,
    });
  } catch (e) {
    console.error('[evaluationsRepository] Error agregando operación pendiente PDV:', e);
  }
}

async function insertLocalEvaluationPDV(row, synced) {
  try {
    const db = await getDb();
    if (isMockDb()) {
      const current = db._storage.get('evaluaciones_pdv') || [];
      const index = current.findIndex(c => c.id === row.id);
      const newItem = { ...row, synced: synced ? 1 : 0 };

      if (index >= 0) {
        current[index] = newItem;
        db._storage.set('evaluaciones_pdv', [...current]);
      } else {
        db._storage.set('evaluaciones_pdv', [...current, newItem]);
      }
      return;
    }
    await db.run(`
      INSERT OR REPLACE INTO evaluaciones_pdv (id, client_id, user_id, fecha, payload, created_at, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      row.id,
      row.client_id,
      row.user_id,
      row.fecha,
      JSON.stringify(row.payload),
      row.created_at,
      synced ? 1 : 0
    ]);
  } catch (e) {
    console.error('[evaluationsRepository] Error saving PDV local:', e);
  }
}

// ... (End of insertLocalEvaluationPDV)

export async function getEvaluations(dateParams = {}) {
  const online = await isOnline().catch(() => false);
  if (online) {
    try {
      // Intentar fetch online (PDV)
      const { fetchEvaluationsPDVApi } = await import('@/lib/mysqlEvaluations');
      const rows = await fetchEvaluationsPDVApi({ limit: 1000, ...dateParams });
      if (rows && rows.length > 0) {
        // Guardar en local para offline
        for (const r of rows) {
          // Parsear payload si viene como string
          if (typeof r.payload === 'string') r.payload = JSON.parse(r.payload);
          await insertLocalEvaluationPDV(r, true);
        }
      }
    } catch (e) {
      console.warn('[evaluationsRepository] Error syncing online evaluations:', e);
    }
  }
  return await loadLocalEvaluationsPDV(dateParams);
}

async function loadLocalEvaluationsPDV(dateParams = {}) {
  try {
    const db = await getDb();
    const { from, to } = dateParams;

    if (isMockDb()) {
      const stored = db._storage.get('evaluaciones_pdv') || [];
      const fromDay = from ? String(from).slice(0, 10) : null;
      const toDay = to ? String(to).slice(0, 10) : null;
      const filtered = stored.filter(r => {
        const d = String(r.fecha || r.created_at || '').slice(0, 10);
        if (!d) return true;
        if (fromDay && d < fromDay) return false;
        if (toDay && d > toDay) return false;
        return true;
      });
      return filtered;
    }

    let query = 'SELECT * FROM evaluaciones_pdv';
    const params = [];
    if (from || to) {
      query += ' WHERE';
      if (from) {
        query += ' date(fecha) >= date(?)';
        params.push(from);
      }
      if (to) {
        if (from) query += ' AND';
        query += ' date(fecha) <= date(?)';
        params.push(to);
      }
    }

    const res = await db.query(query, params);
    const rows = res.values || [];
    return rows.map(r => {
      let payload = r.payload;
      try {
        if (typeof payload === 'string') {
          payload = JSON.parse(payload);
        }
        // Double-check: if still string, parse again
        if (typeof payload === 'string') {
          payload = JSON.parse(payload);
        }
      } catch (e) {
        console.warn('Error parsing local PDV payload:', e);
        payload = {};
      }
      return { ...r, payload };
    });
  } catch (e) {
    console.error('[evaluationsRepository] Error loading local evaluations:', e);
    return [];
  }
}

async function insertLocalEvaluationsPDVBatch(rows, synced = true) {
  if (!rows?.length) return;
  try {
    const db = await getDb();
    if (isMockDb()) {
      const current = db._storage.get('evaluaciones_pdv') || [];
      const map = new Map(current.map((c) => [c.id, c]));
      rows.forEach((r) => {
        map.set(r.id, { ...r, synced: synced ? 1 : 0 });
      });
      db._storage.set('evaluaciones_pdv', Array.from(map.values()));
      return;
    }
    await db.execute('BEGIN TRANSACTION');
    try {
      for (const row of rows) {
        await db.run(
          `INSERT OR REPLACE INTO evaluaciones_pdv (id, client_id, user_id, fecha, payload, created_at, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.client_id,
            row.user_id,
            row.fecha,
            typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload || {}),
            row.created_at,
            synced ? 1 : 0,
          ]
        );
      }
      await db.execute('COMMIT');
    } catch (txErr) {
      await db.execute('ROLLBACK');
      throw txErr;
    }
  } catch (e) {
    console.error('[evaluationsRepository] Error batch saving PDV local:', e);
  }
}

async function insertLocalEvaluationsCMBatch(rows, synced = true) {
  if (!rows?.length) return;
  try {
    const db = await getDb();
    if (isMockDb()) {
      const current = db._storage.get('evaluaciones') || [];
      const map = new Map(current.map((c) => [c.id, c]));
      rows.forEach((r) => {
        map.set(r.id, { ...r, synced: synced ? 1 : 0 });
      });
      db._storage.set('evaluaciones', Array.from(map.values()));
      return;
    }
    await db.execute('BEGIN TRANSACTION');
    try {
      for (const row of rows) {
        await db.run(
          `INSERT OR REPLACE INTO evaluaciones (id, tienda_id, fecha, tipo, payload, created_at, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.tienda_id || row.client_id,
            row.fecha,
            row.tipo || 'Canal Moderno',
            typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload || {}),
            row.created_at,
            synced ? 1 : 0,
          ]
        );
      }
      await db.execute('COMMIT');
    } catch (txErr) {
      await db.execute('ROLLBACK');
      throw txErr;
    }
  } catch (e) {
    console.error('[evaluationsRepository] Error batch saving CM local:', e);
  }
}

export async function getAllEvaluations(dateParams = {}) {
  const { localOnly = false, ...apiParams } = dateParams || {};
  if (localOnly) {
    return await getAllEvaluationsLocal(apiParams);
  }

  const online = await isOnline().catch(() => false);
  if (online) {
    try {
      const { fetchEvaluationsPDVApi, fetchEvaluationsCMApi } = await import('@/lib/mysqlEvaluations');

      // Descarga en paralelo PDV y Canal Moderno para reducir a la mitad el tiempo de red
      const [pdvRows, cmRows] = await Promise.all([
        fetchEvaluationsPDVApi({ limit: 1500, ...apiParams }).catch((e) => {
          console.warn('[evaluationsRepository] PDV fetch warning:', e);
          return [];
        }),
        fetchEvaluationsCMApi({ limit: 1500, ...apiParams }).catch((e) => {
          console.warn('[evaluationsRepository] CM fetch warning:', e);
          return [];
        }),
      ]);

      if (pdvRows?.length) {
        const normalizedPdv = pdvRows.map((r) => {
          let payload = r.payload;
          if (typeof payload === 'string') {
            try {
              payload = JSON.parse(payload);
              if (typeof payload === 'string') payload = JSON.parse(payload);
            } catch {
              payload = {};
            }
          }
          return { ...r, payload: payload || {} };
        });
        await insertLocalEvaluationsPDVBatch(normalizedPdv, true);
      }

      if (cmRows?.length) {
        const normalizedCm = cmRows.map((r) => {
          let payload = r.payload;
          if (typeof payload === 'string') {
            try {
              payload = JSON.parse(payload);
              if (typeof payload === 'string') payload = JSON.parse(payload);
            } catch {
              payload = {};
            }
          }
          return { ...r, payload: payload || {} };
        });
        await insertLocalEvaluationsCMBatch(normalizedCm, true);
      }
    } catch (e) {
      console.warn('[evaluationsRepository] Error syncing online all evaluations:', e);
    }
  }
  return await getAllEvaluationsLocal(apiParams);
}

/**
 * Permite al Admin editar una evaluación (PDV o Canal Moderno) y sincronizarla con MySQL.
 */
export async function updateEvaluationAdmin(evalItem, updates = {}) {
  const realId = evalItem.original_id || evalItem.id;
  const isCM =
    (evalItem.tipo || '').toUpperCase() === 'CANAL MODERNO' ||
    (evalItem.tipo || '').toUpperCase() === 'CC';

  const basePayload =
    typeof evalItem.payload === 'string'
      ? JSON.parse(evalItem.payload || '{}')
      : { ...(evalItem.payload || {}) };

  const newScore =
    updates.puntaje !== undefined ? Number(updates.puntaje) || 0 : Number(evalItem.puntaje) || 0;
  const newFecha = updates.fecha || evalItem.fecha || new Date().toISOString();
  const newPuntoVenta =
    updates.punto_venta !== undefined ? updates.punto_venta : evalItem.punto_venta;
  const newClientCode =
    updates.client_code !== undefined ? updates.client_code : evalItem.client_code;
  const newRuta = updates.ruta !== undefined ? updates.ruta : evalItem.ruta;
  const newZona = updates.zona !== undefined ? updates.zona : evalItem.zona;
  const newEvaluator =
    updates.usuario !== undefined ? updates.usuario : evalItem.usuario;
  const newNotes =
    updates.observaciones !== undefined
      ? updates.observaciones
      : basePayload.observaciones ?? basePayload.comentarios ?? basePayload.notes ?? '';

  const updatedPayload = {
    ...basePayload,
    punto_venta: newPuntoVenta,
    nombre_tienda: newPuntoVenta,
    client_code: newClientCode,
    cve_cliente: newClientCode,
    ruta: newRuta,
    zona: newZona,
    user: newEvaluator,
    evaluador: newEvaluator,
    nombre: newEvaluator,
    puntaje_total: newScore,
    score: newScore,
    promedio: newScore,
    observaciones: newNotes,
    comentarios: newNotes,
    resultados: {
      ...(basePayload.resultados || {}),
      scoreFinal: newScore,
    },
    storeInfo: {
      ...(basePayload.storeInfo || {}),
      nombre: newPuntoVenta,
      client_code: newClientCode,
      evaluador: newEvaluator,
      fecha: newFecha,
    },
  };

  if (updates.surtido_porcentaje !== undefined) {
    updatedPayload.surtido_porcentaje = Number(updates.surtido_porcentaje) || 0;
  }

  if (isCM) {
    const cmRow = sanitizeEvalForMySQL({
      id: realId,
      tienda_id: evalItem.client_id || basePayload.tienda_id || newClientCode || 0,
      fecha: newFecha,
      tipo: 'Canal Moderno',
      payload: updatedPayload,
      created_at: evalItem.created_at || newFecha,
    }, true);
    await insertLocalEvaluationCM(cmRow, true);
    const res = await importEvaluationsCMApi([cmRow]);
    if (res?.errors?.length) {
      throw new Error(res.errors.join(', '));
    }
    return cmRow;
  } else {
    const pdvRow = sanitizeEvalForMySQL({
      id: realId,
      client_id: evalItem.client_id || basePayload.client_id || newClientCode || 0,
      user_id: basePayload.user_id || evalItem.user_id || null,
      fecha: newFecha,
      puntaje_total: newScore,
      surtido_porcentaje:
        updates.surtido_porcentaje !== undefined
          ? Number(updates.surtido_porcentaje) || 0
          : Number(basePayload.surtido_porcentaje) || 0,
      payload: updatedPayload,
      created_at: evalItem.created_at || newFecha,
    }, false);
    await insertLocalEvaluationPDV(pdvRow, true);
    const res = await importEvaluationsPDVApi([pdvRow]);
    if (res?.errors?.length) {
      throw new Error(res.errors.join(', '));
    }
    return pdvRow;
  }
}

async function getAllEvaluationsLocal(dateParams = {}) {
  const pdv = await loadLocalEvaluationsPDV(dateParams);
  const cm = await loadLocalEvaluationsCM(dateParams);

  // Unificar formato local
  console.log(`[Repository] Local PDV: ${pdv.length}, Local CM: ${cm.length}`);

  const unifiedPdv = pdv.map(e => {
    // Ensure payload is an object
    let payload = e.payload || {};
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
        if (typeof payload === 'string') payload = JSON.parse(payload);
      } catch (e) { payload = {}; }
    }

    const detectedType = (payload.tipo || e.tipo || 'PDV').toUpperCase();
    const isCM = detectedType === 'CANAL MODERNO' || detectedType === 'CC';
    const finalType = isCM ? 'Canal Moderno' : 'PDV';

    return {
      id: e.id,
      composite_id: e.id,
      fecha: e.fecha || e.created_at,
      punto_venta: payload.punto_venta || payload.nombre_tienda || payload.storeInfo?.nombre || 'PDV', // Added storeInfo.nombre for CM in PDV table
      client_code: payload.client_code || payload.cve_cliente || payload.storeInfo?.client_code || null,
      client_id: e.client_id,
      ruta: payload.ruta || null,
      zona: payload.zona || null,
      tipo: finalType, // Respect payload type to allow deduplication with real CM table
      puntaje: Number(payload.puntaje_total || payload.score || payload.promedio || payload.resultados?.scoreFinal || 0),
      usuario: payload.user || payload.evaluador || payload.nombre || payload.storeInfo?.evaluador || 'Usuario',
      evaluator_name: payload.user || payload.evaluador || payload.nombre || payload.storeInfo?.evaluador || 'Usuario',
      payload: payload
    };
  });

  const unifiedCm = cm.map(e => {
    const payload = e.payload || {};
    const storeInfo = payload.storeInfo || {};
    // DEBUG: Inspect corrupted CM data
    if (!storeInfo.nombre && !payload.nombre_tienda) {
      console.warn('[Repository] Found suspicious CM row:', { id: e.id, payloadKeys: Object.keys(payload) });
    }

    return {
      id: e.id,
      composite_id: e.id,
      fecha: storeInfo.fecha || e.fecha || e.created_at,
      punto_venta: storeInfo.nombre || payload.nombre_tienda || 'Canal Moderno',
      client_code: storeInfo.client_code || payload.client_code || payload.cve_cliente || null,
      client_id: e.tienda_id,
      ruta: null,
      tipo: 'Canal Moderno',
      puntaje: Number(payload.resultados?.scoreFinal || payload.scoreFinal || payload.score || payload.promedio || 0), // Added payload.resultados check
      usuario: storeInfo.evaluador || 'Usuario',
      evaluator_name: storeInfo.evaluador || 'Usuario',
      payload: payload
    };
  });

  const all = [...unifiedPdv, ...unifiedCm];

  // Deduplicate by ID
  // Deduplicate by ID
  const uniqueMap = new Map();
  all.forEach(item => {
    if (!uniqueMap.has(item.id)) {
      uniqueMap.set(item.id, item);
    } else {
      const existing = uniqueMap.get(item.id);

      // FIX: If types differ, it means we have a collision (likely UUID reuse or corruption).
      // We must PRESERVE both to ensure Canal Moderno evaluations are shown.
      if (existing.tipo !== item.tipo) {
        console.warn(`[Repository] Type Collision detected! Preserving both. ID: ${item.id}`, {
          existing: existing.tipo,
          new: item.tipo
        });
        // Modify ID to ensure uniqueness in Render
        const newId = `${item.id}_${item.tipo.replace(/\s+/g, '')}`;
        const newItem = { ...item, id: newId, original_id: item.id };
        uniqueMap.set(newId, newItem);
      } else {
        // Genuine duplicate (same ID, same type). Ignore.
        // console.warn(`[Repository] Duplicate ignored: ${item.id}`);
      }
    }
  });

  return Array.from(uniqueMap.values()).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

async function loadLocalEvaluationsCM(dateParams = {}) {
  try {
    const db = await getDb();
    const { from, to } = dateParams;

    if (isMockDb()) {
      const stored = db._storage.get('evaluaciones');
      const all = Array.isArray(stored) ? stored : [];
      const fromDay = from ? String(from).slice(0, 10) : null;
      const toDay = to ? String(to).slice(0, 10) : null;
      return all.filter(r => {
        const d = String(r.fecha || r.payload?.storeInfo?.fecha || r.created_at || '').slice(0, 10);
        if (!d) return true;
        if (fromDay && d < fromDay) return false;
        if (toDay && d > toDay) return false;
        return true;
      });
    }

    let query = 'SELECT * FROM evaluaciones';
    const params = [];
    if (from || to) {
      query += ' WHERE';
      if (from) {
        query += ' date(fecha) >= date(?)';
        params.push(from);
      }
      if (to) {
        if (from) query += ' AND';
        query += ' date(fecha) <= date(?)';
        params.push(to);
      }
    }

    const res = await db.query(query, params);
    return (res.values || []).map(r => ({ ...r, payload: r.payload ? JSON.parse(r.payload) : {} }));
  } catch (e) { return []; }
}

export async function createEvaluationCanalModerno(evaluation) {
  const online = await isOnline();
  const now = getNowMexico();
  const today = getTodayMexico();

  const id = evaluation.id || crypto.randomUUID();
  const photoFiles = evaluation.photo_files || {};
  const cleanEvaluation = { ...evaluation };
  delete cleanEvaluation.photo_files;
  if (cleanEvaluation.payload && typeof cleanEvaluation.payload === 'object') {
    cleanEvaluation.payload = { ...cleanEvaluation.payload };
    delete cleanEvaluation.payload.photo_files;
  }

  const row = sanitizeEvalForMySQL({
    id: id,
    tienda_id: cleanEvaluation.tienda_id || cleanEvaluation.client_id,
    fecha: cleanEvaluation.fecha || today,
    tipo: cleanEvaluation.tipo || 'Canal Moderno',
    payload: cleanEvaluation.payload || cleanEvaluation,
    created_at: cleanEvaluation.created_at || now,
  }, true);

  if (online) {
    // Phase 1: Upload photos (independent of DB)
    try {
      if (photoFiles.fachada) {
        try {
          const url = await uploadPhotoIfOnline(photoFiles.fachada, 'evaluaciones', `${id}-fachada.jpg`);
          row.payload.photo_fachada = url;
        } catch (e) { console.warn('[evaluationsRepository] CM Fachada upload failed:', e.message); }
      }
      if (photoFiles.destino) {
        try {
          const url = await uploadPhotoIfOnline(photoFiles.destino, 'evaluaciones', `${id}-destino.jpg`);
          row.payload.photo_destino = url;
        } catch (e) { console.warn('[evaluationsRepository] CM Destino upload failed:', e.message); }
      }
      if (photoFiles.impulso) {
        try {
          const url = await uploadPhotoIfOnline(photoFiles.impulso, 'evaluaciones', `${id}-impulso.jpg`);
          row.payload.photo_impulso = url;
        } catch (e) { console.warn('[evaluationsRepository] CM Impulso upload failed:', e.message); }
      }

      // Update URLs list
      row.payload.photoUrls = [
        row.payload.photo_fachada,
        row.payload.photo_destino,
        row.payload.photo_impulso
      ].filter(Boolean);
    } catch (photoError) {
      console.error('[evaluationsRepository] Error general subida fotos CM:', photoError);
    }

    // Phase 2: Try MySQL insert
    try {
      console.log('[evaluationsRepository] Insertando CM en MySQL...');
      const res = await importEvaluationsCMApi([row]);
      if (res.errors && res.errors.length > 0) throw new Error('MySQL Import Errors: ' + JSON.stringify(res.errors));

      await insertLocalEvaluationCM(row, true);
      return row;

    } catch (e) {
      console.error('[evaluationsRepository] Error MySQL CM, redirigiendo a offline:', e);
      return await handleOfflineEvaluationCM(row, photoFiles, now);
    }
  } else {
    return await handleOfflineEvaluationCM(row, photoFiles, now);
  }
}

async function handleOfflineEvaluationCM(row, photoFiles, now) {
  // Only convert to Base64 photos that DON'T already have a URL
  const base64Photos = {};
  if (photoFiles.fachada && !row.payload.photo_fachada) {
    base64Photos.fachada = await fileToBase64(photoFiles.fachada);
  }
  if (photoFiles.destino && !row.payload.photo_destino) {
    base64Photos.destino = await fileToBase64(photoFiles.destino);
  }
  if (photoFiles.impulso && !row.payload.photo_impulso) {
    base64Photos.impulso = await fileToBase64(photoFiles.impulso);
  }

  if (Object.keys(base64Photos).length > 0) {
    row.payload._base64_photos = base64Photos;
  }

  await insertLocalEvaluationCM(row, false);

  try {
    const { addPendingOperation } = await import('@/sync/syncService');
    await addPendingOperation({
      entity_type: 'evaluation',
      operation: 'insert',
      payload: row,
      created_at: now,
    });
  } catch (e) {
    console.error('[evaluationsRepository] Error agregando operación pendiente CM:', e);
  }

  return { id: row.id, offline: true };
}

async function insertLocalEvaluationCM(row, synced) {
  try {
    const db = await getDb();
    if (isMockDb()) {
      const current = db._storage.get('evaluaciones') || [];
      const index = current.findIndex(c => c.id === row.id);
      const newItem = { ...row, synced: synced ? 1 : 0 };

      if (index >= 0) {
        current[index] = newItem;
        db._storage.set('evaluaciones', [...current]);
      } else {
        db._storage.set('evaluaciones', [...current, newItem]);
      }
      return;
    }

    await db.run(`
      INSERT OR REPLACE INTO evaluaciones (id, tienda_id, fecha, tipo, payload, created_at, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      row.id,
      row.tienda_id,
      row.fecha,
      row.tipo,
      JSON.stringify(row.payload),
      row.created_at,
      synced ? 1 : 0
    ]);
  } catch (e) {
    console.error('[evaluationsRepository] Error saving Canal Moderno local:', e);
  }
}

export async function getEvaluationById(id, type) {
  // Fallback to local only for now as MySQL Read not implemented
  return await getEvaluationByIdLocal(id, type);
}

async function getEvaluationByIdLocal(id, type) {
  try {
    const db = await getDb();
    const isPdv = (type || '').toUpperCase() === 'PDV';
    const parsePayload = (p) => {
      if (!p) return {};
      if (typeof p === 'string') {
        try {
          const parsed = JSON.parse(p);
          return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
        } catch {
          return {};
        }
      }
      return p;
    };

    if (isMockDb()) {
      const table = isPdv ? 'evaluaciones_pdv' : 'evaluaciones';
      const rows = db._storage.get(table) || [];
      const found = rows.find((r) => String(r.id) === String(id)) ||
        (db._storage.get(isPdv ? 'evaluaciones' : 'evaluaciones_pdv') || []).find((r) => String(r.id) === String(id));
      if (found) {
        return { ...found, payload: parsePayload(found.payload) };
      }
      return null;
    }

    if (isPdv) {
      const res = await db.query('SELECT * FROM evaluaciones_pdv WHERE id = ?', [id]);
      if (res.values?.length) return { ...res.values[0], payload: parsePayload(res.values[0].payload) };
    } else {
      const res = await db.query('SELECT * FROM evaluaciones WHERE id = ?', [id]);
      if (res.values?.length) return { ...res.values[0], payload: parsePayload(res.values[0].payload) };
    }
  } catch (e) {}
  return null;
}

export async function getDebugRawData() {
  try {
    const db = await getDb();
    let pdv = [];
    let cm = [];

    if (isMockDb()) {
      pdv = db._storage.get('evaluaciones_pdv') || [];
      cm = db._storage.get('evaluaciones') || [];
    } else {
      const resPdv = await db.query('SELECT * FROM evaluaciones_pdv');
      pdv = resPdv.values || [];
      const resCm = await db.query('SELECT * FROM evaluaciones');
      cm = resCm.values || [];
    }

    return {
      pdvCount: pdv.length,
      cmCount: cm.length,
      pdvSamples: pdv.slice(0, 5).map(r => ({
        id: r.id,
        payloadType: (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload)?.tipo,
        storeName: (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload)?.punto_venta || (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload)?.storeInfo?.nombre
      })),
      cmSamples: cm.slice(0, 5).map(r => ({
        id: r.id,
        payloadType: (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload)?.tipo
      }))
    };
  } catch (e) {
    return { error: e.message };
  }
}
