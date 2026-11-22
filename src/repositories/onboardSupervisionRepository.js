import { v4 as uuidv4 } from 'uuid';
import { getDb, isMockDb } from '@/lib/localDb';
import { isOnline } from '@/lib/network';
import { importOnboardSupervisionApi } from '@/lib/mysqlOnboard';
import { addPendingOperation } from '@/sync/syncService';
import { createOrder } from './ordersRepository';
import { updateClient } from './clientsRepository';
import { loadEvaluationConfig, defaultEvaluationConfig } from '@/lib/evaluationConfig';

/**
 * Helper to attempt immediate cloud sync if online
 */
async function tryImmediateSync(supervision = null, visit = null) {
    try {
        const online = await isOnline().catch(() => false);
        if (!online) return false;

        await importOnboardSupervisionApi({
            supervisions: supervision ? [supervision] : [],
            visits: visit ? [visit] : []
        });
        
        return true;
    } catch (e) {
        console.warn('[onboardSupervisionRepository] Immediate sync failed (expected if offline/server issues):', e);
        return false;
    }
}

export async function startOnboardSupervision({ supervisor_id, supervisor_name, route_name, vendedor_id, vendedor_name, checklist_data }) {
    const db = await getDb();
    const id = uuidv4();
    const start_at = new Date().toISOString();

    if (isMockDb()) {
        const current = db._storage.get('supervisor_onboard_supervisions') || [];
        const newSession = {
            id, supervisor_id, supervisor_name, route_name, vendedor_id, vendedor_name, start_at, 
            checklist_data: JSON.stringify(checklist_data), status: 'draft', score: 0, synced: 0
        };
        db._storage.set('supervisor_onboard_supervisions', [...current, newSession]);
    } else {
        const query = `
            INSERT INTO supervisor_onboard_supervisions (
                id, supervisor_id, supervisor_name, route_name, vendedor_id, vendedor_name, start_at, checklist_data, status, score, synced
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await db.run(query, [
            id,
            supervisor_id,
            supervisor_name,
            route_name,
            vendedor_id,
            vendedor_name,
            start_at,
            JSON.stringify(checklist_data),
            'draft',
            0,
            0
        ]);
    }

    // 2. Queue for Cloud Sync (Offline first/Background)
    const syncPayload = {
        id, supervisor_id, route_name, vendedor_id, vendedor_name, start_at, 
        checklist_data: JSON.stringify(checklist_data), status: 'draft', score: 0
    };

    await addPendingOperation({
        entity_type: 'supervisor_onboard_supervision',
        operation: 'insert',
        payload: syncPayload,
        created_at: start_at
    });

    // 3. Try Immediate Sync
    tryImmediateSync(syncPayload);

    return id;
}

export async function addOnboardVisit({ supervision_id, client_id, client_name, client_code, survey_data, evaluation_pdv_id }) {
    const db = await getDb();
    let id = uuidv4();
    const created_at = new Date().toISOString();

    if (isMockDb()) {
        const current = db._storage.get('supervisor_onboard_visits') || [];
        const existingIdx = current.findIndex(v => v.supervision_id === supervision_id && v.client_id === client_id);
        if (existingIdx >= 0) {
            id = current[existingIdx].id;
            current[existingIdx] = {
                ...current[existingIdx],
                client_name,
                client_code,
                survey_data: JSON.stringify(survey_data),
                evaluation_pdv_id: evaluation_pdv_id || current[existingIdx].evaluation_pdv_id || null,
                synced: 0
            };
            db._storage.set('supervisor_onboard_visits', [...current]);
        } else {
            const newVisit = {
                id, supervision_id, client_id, client_name, client_code, 
                survey_data: JSON.stringify(survey_data), evaluation_pdv_id: evaluation_pdv_id || null, created_at, synced: 0
            };
            db._storage.set('supervisor_onboard_visits', [...current, newVisit]);
        }
    } else {
        const existingRes = await db.query(
            "SELECT id FROM supervisor_onboard_visits WHERE supervision_id = ? AND client_id = ? LIMIT 1",
            [supervision_id, client_id]
        );
        if (existingRes.values?.[0]?.id) {
            id = existingRes.values[0].id;
            await db.run(
                `UPDATE supervisor_onboard_visits
                 SET client_name = ?, client_code = ?, survey_data = ?, evaluation_pdv_id = ?, synced = 0
                 WHERE id = ?`,
                [client_name, client_code, JSON.stringify(survey_data), evaluation_pdv_id || null, id]
            );
        } else {
            const query = `
                INSERT INTO supervisor_onboard_visits (
                    id, supervision_id, client_id, client_name, client_code, survey_data, evaluation_pdv_id, created_at, synced
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            await db.run(query, [
                id,
                supervision_id,
                client_id,
                client_name,
                client_code,
                JSON.stringify(survey_data),
                evaluation_pdv_id || null,
                created_at,
                0
            ]);
        }
    }

    // 2. Queue for Cloud Sync
    const visitPayload = {
        id, supervision_id, client_id, client_name, client_code, 
        survey_data: JSON.stringify(survey_data), evaluation_pdv_id: evaluation_pdv_id || null, created_at
    };

    await addPendingOperation({
        entity_type: 'supervisor_onboard_visit',
        operation: 'insert',
        payload: visitPayload,
        created_at
    });

    // 3. Try Immediate Sync
    tryImmediateSync(null, visitPayload);

    // Handle Facade Assignment if present
    if (survey_data.facade_ok === 'si' && survey_data.facade_type) {
        try {
            let supervisor_id;
            if (isMockDb()) {
                const sessions = db._storage.get('supervisor_onboard_supervisions') || [];
                supervisor_id = sessions.find(s => s.id === supervision_id)?.supervisor_id;
            } else {
                supervisor_id = (await db.query("SELECT supervisor_id FROM supervisor_onboard_supervisions WHERE id = ?", [supervision_id])).values?.[0]?.supervisor_id;
            }

            if (supervisor_id) {
                await registerFacadeAssignment({
                    client_id,
                    client_name,
                    client_code,
                    facade_type: survey_data.facade_type,
                    supervisor_id: supervisor_id
                });
            }
        } catch (e) {
            console.error('[onboardSupervisionRepository] Failed to register facade:', e);
        }
    }

    // Handle Visit Frequency Update
    if (survey_data.frequency) {
        try {
            await updateClient(client_id, { visit_days: survey_data.frequency });
        } catch (e) {
            console.error('[onboardSupervisionRepository] Failed to update client frequency:', e);
        }
    }

    return id;
}

async function registerFacadeAssignment({ client_id, client_name, facade_type, supervisor_id }) {
    const orderId = uuidv4();
    const order = {
        id: orderId,
        client_id: client_id,
        action: 'INSTALAR',
        created_by: supervisor_id,
        assigned_to: supervisor_id,
        status: 'COMPLETADA',
        notes: `Asignación automática de fachada ${facade_type} desde supervisión a bordo.`
    };

    const items = [{
        asset_type: 'FACHADA',
        asset_serial: `FAC-${client_id.substring(0, 8)}-${facade_type}`,
        quantity: 1,
        notes: `Tipo: ${facade_type}`
    }];

    await createOrder(order, items);
}

export async function getActiveSupervision(supervisor_id) {
    const db = await getDb();
    if (isMockDb()) {
        const all = db._storage.get('supervisor_onboard_supervisions') || [];
        return all.filter(s => s.supervisor_id === supervisor_id && s.status === 'draft')
                  .sort((a, b) => new Date(b.start_at) - new Date(a.start_at))[0] || null;
    }

    const res = await db.query(
        "SELECT * FROM supervisor_onboard_supervisions WHERE supervisor_id = ? AND status = 'draft' ORDER BY start_at DESC LIMIT 1",
        [supervisor_id]
    );
    return res.values?.[0] || null;
}

export async function getSupervisionData(supervision_id) {
    const db = await getDb();
    let header, visits;

    if (isMockDb()) {
        const allSessions = db._storage.get('supervisor_onboard_supervisions') || [];
        header = { values: [allSessions.find(s => s.id === supervision_id)] };
        
        const allVisits = db._storage.get('supervisor_onboard_visits') || [];
        const sessionVisits = allVisits.filter(v => v.supervision_id === supervision_id)
                                      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        visits = { values: sessionVisits };
    } else {
        header = await db.query("SELECT * FROM supervisor_onboard_supervisions WHERE id = ?", [supervision_id]);
        visits = await db.query("SELECT * FROM supervisor_onboard_visits WHERE supervision_id = ? ORDER BY created_at ASC", [supervision_id]);
    }

    if (!header.values?.[0]) return null;

    return {
        ...header.values[0],
        checklist_data: JSON.parse(header.values[0].checklist_data || '{}'),
        visits: (visits.values || []).map(v => ({
            ...v,
            survey_data: JSON.parse(v.survey_data || '{}')
        }))
    };
}

export async function getAllSupervisions(supervisor_id) {
    const db = await getDb();
    let results = [];

    if (isMockDb()) {
        const all = db._storage.get('supervisor_onboard_supervisions') || [];
        results = all.filter(s => supervisor_id === 'all' || s.supervisor_id === supervisor_id)
                     .sort((a, b) => new Date(b.start_at) - new Date(a.start_at));
    } else {
        let res;
        if (supervisor_id === 'all') {
            res = await db.query("SELECT * FROM supervisor_onboard_supervisions ORDER BY start_at DESC");
        } else {
            res = await db.query(
                "SELECT * FROM supervisor_onboard_supervisions WHERE supervisor_id = ? ORDER BY start_at DESC",
                [supervisor_id]
            );
        }
        results = res.values || [];
        console.log(`[onboardSupervisionRepository] getAllSupervisions SQL results for ${supervisor_id}:`, results.length);
    }

    // Attach visits and evaluations to each supervision
    let allVisits = [];
    let allEvals = [];

    if (isMockDb()) {
        allVisits = db._storage.get('supervisor_onboard_visits') || [];
        allEvals = db._storage.get('evaluaciones_pdv') || [];
    } else {
        const visitsRes = await db.query("SELECT * FROM supervisor_onboard_visits ORDER BY created_at ASC");
        allVisits = visitsRes.values || [];
        const evalsRes = await db.query("SELECT * FROM evaluaciones_pdv");
        allEvals = evalsRes.values || [];
    }

    const evalsMap = {};
    for (const e of allEvals) {
        evalsMap[e.id] = typeof e.payload === 'string' ? JSON.parse(e.payload || '{}') : (e.payload || {});
    }

    const visitsMap = {};
    for (const v of allVisits) {
        if (!visitsMap[v.supervision_id]) visitsMap[v.supervision_id] = [];
        visitsMap[v.supervision_id].push({
            ...v,
            survey_data: JSON.parse(v.survey_data || '{}'),
            evaluation_pdv_data: v.evaluation_pdv_id ? evalsMap[v.evaluation_pdv_id] : null
        });
    }

    return results.map(s => ({
        ...s,
        checklist_data: JSON.parse(s.checklist_data || '{}'),
        visits: visitsMap[s.id] || []
    }));
}

export async function finishOnboardSupervision(supervision_id, closingNotes = '') {
    const data = await getSupervisionData(supervision_id);
    if (!data) return 0;

    const db = await getDb();
    const visits = data.visits || [];
    const evalCfg = await loadEvaluationConfig().catch(() => defaultEvaluationConfig);
    const onboardCfg = evalCfg?.onboardConfig || defaultEvaluationConfig.onboardConfig;
    const weights = onboardCfg?.weights || { checklist: 10, purchases: 30, steps: 20, execution: 40 };
    const redistribute = onboardCfg?.redistributeIfNoCooler !== false;

    const wChecklist = Number(weights.checklist ?? 10);
    const wPurchases = Number(weights.purchases ?? 30);
    const wSteps = Number(weights.steps ?? 20);
    const wExecution = Number(weights.execution ?? 40);

    // 1. Checklist
    const checklist = data.checklist_data || {};
    const activeChecklistItems = (onboardCfg?.checklistItems || []).filter(i => i.active !== false);
    const checkKeys = activeChecklistItems.length > 0
        ? activeChecklistItems.map(i => i.key)
        : ['vehicle_clean', 'uniform_ok', 'vehicle_status_ok'];
    const passedChecks = checkKeys.filter(k => Boolean(checklist[k])).length;
    const checkRate = checkKeys.length > 0 ? passedChecks / checkKeys.length : 1;

    // 2. Purchases
    const purchaseRate = visits.length > 0 
        ? visits.filter(v => v.survey_data?.purchased === 'si').length / visits.length 
        : 0;

    // 3. Visit Steps
    const activeStepItems = (onboardCfg?.visitSteps || []).filter(s => s.active !== false);
    const stepKeys = activeStepItems.length > 0
        ? activeStepItems.map(s => s.key)
        : ['greeting', 'negotiation', 'pop_updated'];
    let stepsSum = 0;
    visits.forEach(v => {
        const s = v.survey_data || {};
        const passedSteps = stepKeys.filter(k => s[k] === 'si').length;
        stepsSum += stepKeys.length > 0 ? (passedSteps / stepKeys.length) : 1;
    });
    const stepsRate = visits.length > 0 ? (stepsSum / visits.length) : 0;

    // 4. Execution (PDV Cooler or Canal Moderno)
    let executionSum = 0;
    let evalCount = 0;
    for (const v of visits) {
        const directScore = Number(v.survey_data?.evaluation_score);
        if (Number.isFinite(directScore) && directScore > 0) {
            executionSum += Math.min(100, directScore);
            evalCount++;
            continue;
        }
        if (v.evaluation_pdv_id) {
            let evalRes;
            if (isMockDb()) {
                const allEvals = db._storage.get('evaluaciones_pdv') || [];
                const allModern = db._storage.get('evaluaciones_canal_moderno') || [];
                evalRes = { values: [allEvals.find(e => e.id === v.evaluation_pdv_id) || allModern.find(e => e.id === v.evaluation_pdv_id)] };
            } else {
                evalRes = await db.query("SELECT payload FROM evaluaciones_pdv WHERE id = ?", [v.evaluation_pdv_id]);
            }

            if (evalRes.values?.[0]) {
                const row = evalRes.values[0];
                let payload = {};
                try {
                    const rawPayload = row.payload;
                    payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload || '{}') : (rawPayload || {});
                } catch (e) {}
                const evalScore = Number(row.puntaje_total) || Number(row.score_final) || Number(row.score) || Number(payload.puntaje_total) || Number(payload.resultados?.scoreFinal) || Number(payload.score) || 0;
                executionSum += Math.min(100, evalScore);
                evalCount++;
            }
        }
    }

    const executionRate = evalCount > 0 ? (executionSum / (evalCount * 100)) : 0;

    let checkScore = checkRate * wChecklist;
    let purchaseScore = purchaseRate * wPurchases;
    let stepsScore = stepsRate * wSteps;
    let executionScore = executionRate * wExecution;

    // Si ningún cliente visitado tuvo auditoría de ejecución y está activa la redistribución inteligente:
    if (evalCount === 0 && redistribute) {
        const nonExecTotalWeight = wChecklist + wPurchases + wSteps;
        if (nonExecTotalWeight > 0) {
            const scale = (nonExecTotalWeight + wExecution) / nonExecTotalWeight;
            checkScore = checkScore * scale;
            purchaseScore = purchaseScore * scale;
            stepsScore = stepsScore * scale;
            executionScore = 0;
        }
    }

    const finalScore = Math.min(100, Math.round((checkScore + purchaseScore + stepsScore + executionScore) * 10) / 10);
    const end_at = new Date().toISOString();
    const enrichedChecklist = {
        ...checklist,
        _closing_notes: closingNotes || checklist._closing_notes || '',
        _score_breakdown: {
            checkScore: Math.round(checkScore * 10) / 10,
            purchaseScore: Math.round(purchaseScore * 10) / 10,
            stepsScore: Math.round(stepsScore * 10) / 10,
            executionScore: Math.round(executionScore * 10) / 10,
            evalCount,
            redistributed: evalCount === 0 && redistribute,
        }
    };
    const checklistJson = JSON.stringify(enrichedChecklist);

    if (isMockDb()) {
        const allSessions = db._storage.get('supervisor_onboard_supervisions') || [];
        const idx = allSessions.findIndex(s => s.id === supervision_id);
        if (idx >= 0) {
            allSessions[idx] = { ...allSessions[idx], checklist_data: checklistJson, status: 'completed', end_at, score: finalScore, synced: 0 };
            db._storage.set('supervisor_onboard_supervisions', allSessions);
        }
    } else {
        await db.run(
            "UPDATE supervisor_onboard_supervisions SET checklist_data = ?, status = 'completed', end_at = ?, score = ? WHERE id = ?",
            [checklistJson, end_at, finalScore, supervision_id]
        );
    }

    // 2. Update in Cloud Sync Queue
    const updatePayload = {
        id: supervision_id,
        supervisor_id: data.supervisor_id,
        supervisor_name: data.supervisor_name,
        route_name: data.route_name,
        vendedor_id: data.vendedor_id,
        vendedor_name: data.vendedor_name,
        start_at: data.start_at,
        checklist_data: enrichedChecklist,
        status: 'completed',
        end_at: end_at,
        score: finalScore
    };

    await addPendingOperation({
        entity_type: 'supervisor_onboard_supervision',
        operation: 'update',
        payload: updatePayload,
        created_at: end_at
    });

    // 3. Try Immediate Sync
    tryImmediateSync(updatePayload);

    return finalScore;
}

export async function syncOnboardSupervisions(supervisor_id = 'all') {
    const online = await isOnline().catch(() => false);
    if (!online) return { count: 0 };

    try {
        const { fetchOnboardSupervisionsApi } = await import('@/lib/mysqlOnboard');
        const res = await fetchOnboardSupervisionsApi({ supervisor_id, limit: 300 });
        const supervisions = res.rows || [];
        console.log(`[onboardSupervisionRepository] Sync for ${supervisor_id} returned ${supervisions.length} records`);

        if (supervisions.length > 0) {
            await saveOnboardDataToLocal(supervisions);
        }

        return { count: supervisions.length };
    } catch (e) {
        console.error('[onboardSupervisionRepository] Sync failed:', e);
        return { count: 0 };
    }
}

async function saveOnboardDataToLocal(supervisions) {
    const db = await getDb();
    
    if (isMockDb()) {
        const allSessions = db._storage.get('supervisor_onboard_supervisions') || [];
        const allVisits = db._storage.get('supervisor_onboard_visits') || [];
        
        const sessionsMap = new Map(allSessions.map(s => [s.id, s]));
        const visitsMap = new Map(allVisits.map(v => [v.id, v]));

        supervisions.forEach(s => {
            const { visits, ...header } = s;
            sessionsMap.set(header.id, { ...header, synced: 1 });
            if (visits) {
                visits.forEach(v => visitsMap.set(v.id, { ...v, synced: 1 }));
            }
        });

        db._storage.set('supervisor_onboard_supervisions', Array.from(sessionsMap.values()));
        db._storage.set('supervisor_onboard_visits', Array.from(visitsMap.values()));
        return;
    }

    // SQLite Transaction
    await db.execute('BEGIN TRANSACTION');
    try {
        for (const s of supervisions) {
            const { visits, ...header } = s;
            
            // Upsert Header
            await db.run(
                `INSERT OR REPLACE INTO supervisor_onboard_supervisions (
                    id, supervisor_id, supervisor_name, route_name, vendedor_id, vendedor_name, start_at, end_at, checklist_data, status, score, synced
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    header.id, header.supervisor_id, header.supervisor_name, header.route_name, header.vendedor_id, header.vendedor_name,
                    header.start_at, header.end_at, 
                    typeof header.checklist_data === 'string' ? header.checklist_data : JSON.stringify(header.checklist_data || {}),
                    header.status, header.score, 1
                ]
            );

            // Upsert Visits
            if (visits && visits.length > 0) {
                for (const v of visits) {
                    await db.run(
                        `INSERT OR REPLACE INTO supervisor_onboard_visits (
                            id, supervision_id, client_id, client_name, client_code, survey_data, evaluation_pdv_id, created_at, synced
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            v.id, v.supervision_id, v.client_id, v.client_name, v.client_code,
                            typeof v.survey_data === 'string' ? v.survey_data : JSON.stringify(v.survey_data || {}),
                            v.evaluation_pdv_id, v.created_at, 1
                        ]
                    );
                }
            }
        }
        await db.execute('COMMIT');
    } catch (e) {
        console.error('[onboardSupervisionRepository] SQLite Save Error:', e);
        await db.execute('ROLLBACK');
    }
}
