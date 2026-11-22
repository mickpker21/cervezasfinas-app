import { supabase } from '@/supabaseClient';
import { getDb, isMockDb } from '@/lib/localDb';

/**
 * Supervisor Work Plan Repository
 * Handles planning and reporting of monthly activities.
 */

export async function getWorkPlan(userId, monthYear) {
    // 1. Try to fetch from Supabase
    try {
        const { data, error } = await supabase
            .from('supervisor_work_plans')
            .select(`
                *,
                activities: supervisor_work_plan_activities (
                    *,
                    records: supervisor_work_plan_records (*)
                )
            `)
            .eq('supervisor_id', userId)
            .eq('month_year', monthYear)
            .maybeSingle();

        if (data) {
            // Update local cache
            await saveWorkPlanLocally(data);
            return data;
        }
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "not found"
    } catch (e) {
        console.warn('[WorkPlan] Error fetching from Supabase, falling back to local:', e);
    }

    // 2. Fallback to Local DB
    return await getLocalWorkPlan(userId, monthYear);
}

export async function getSupervisors() {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .ilike('role', '%supervisor%');
        if (!error && data && data.length > 0) {
            // Cache locally
            const db = await getDb();
            if (!isMockDb()) {
                for (const p of data) {
                    await db.run(
                        'INSERT OR REPLACE INTO profiles (id, full_name, email, role, avatar_url) VALUES (?, ?, ?, ?, ?)',
                        [p.id, p.full_name || p.name || null, p.email || null, p.role || null, p.avatar_url || null]
                    ).catch(() => {});
                }
            }
            return data;
        }
        if (error) throw error;
    } catch (e) {
        console.warn('[WorkPlan] Supabase unavailable for supervisors, reading local:', e.message);
    }
    // Fallback: leer de SQLite local
    try {
        const db = await getDb();
        if (isMockDb()) {
            return (db._storage.get('profiles') || []).filter(p =>
                (p.role || '').toLowerCase().includes('supervisor')
            );
        }
        const res = await db.query(
            "SELECT * FROM profiles WHERE lower(role) LIKE '%supervisor%'"
        ).catch(() => ({ values: [] }));
        return res.values || [];
    } catch (e2) {
        console.error('[WorkPlan] Local fallback also failed:', e2);
        return [];
    }
}

export async function getAllWorkPlans(monthYear) {
    try {
        const { data, error } = await supabase
            .from('supervisor_work_plans')
            .select('*')
            .eq('month_year', monthYear);
        if (!error && data && data.length > 0) return data;
        if (error) throw error;
    } catch (e) {
        console.warn('[WorkPlan] Supabase unavailable for all plans, reading local:', e.message);
    }
    // Fallback: leer de SQLite local
    try {
        const db = await getDb();
        if (isMockDb()) {
            return (db._storage.get('supervisor_work_plans') || []).filter(p => p.month_year === monthYear);
        }
        const res = await db.query(
            'SELECT * FROM supervisor_work_plans WHERE month_year = ?', [monthYear]
        ).catch(() => ({ values: [] }));
        return res.values || [];
    } catch (e2) {
        console.error('[WorkPlan] Local fallback also failed:', e2);
        return [];
    }
}

export async function getProfileById(userId) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        if (!error && data) {
            // Cache locally
            const db = await getDb();
            if (!isMockDb()) {
                await db.run(
                    'INSERT OR REPLACE INTO profiles (id, full_name, email, role, avatar_url) VALUES (?, ?, ?, ?, ?)',
                    [data.id, data.full_name || data.name || null, data.email || null, data.role || null, data.avatar_url || null]
                ).catch(() => {});
            }
            return data;
        }
        if (error) throw error;
    } catch (e) {
        console.warn('[WorkPlan] Supabase unavailable for profile, reading local:', e.message);
    }
    // Fallback: leer de SQLite local
    try {
        const db = await getDb();
        if (isMockDb()) {
            return (db._storage.get('profiles') || []).find(p => p.id === userId) || null;
        }
        const res = await db.query('SELECT * FROM profiles WHERE id = ?', [userId]).catch(() => ({ values: [] }));
        return res.values?.[0] || null;
    } catch (e2) {
        return null;
    }
}

export async function saveWorkPlan(plan) {
    // Save locally first
    await saveWorkPlanLocally(plan);

    // Try to save to Supabase
    try {
        const { id, supervisor_id, month_year, status, progress } = plan;
        const { data, error } = await supabase
            .from('supervisor_work_plans')
            .upsert({ id, supervisor_id, month_year, status, progress, updated_at: new Date().toISOString() })
            .select()
            .maybeSingle();

        if (error) throw error;
        
        // Mark as synced locally
        await markPlanSynced(id);
        return data;
    } catch (e) {
        console.error('[WorkPlan] Error saving to Supabase:', e);
        return plan; // Return the plan anyway as it's saved locally
    }
}

export async function saveActivity(activity) {
    // Save locally first
    await saveActivityLocally(activity);

    try {
        const { data, error } = await supabase
            .from('supervisor_work_plan_activities')
            .upsert({
                id: activity.id,
                plan_id: activity.plan_id,
                type: activity.type,
                target: activity.target,
                duration: activity.duration,
                notes: activity.notes
            })
            .select()
            .maybeSingle();

        if (error) throw error;
        await markActivitySynced(activity.id);
        return data;
    } catch (e) {
        console.error('[WorkPlan] Error saving activity to Supabase:', e);
        return activity;
    }
}

export async function saveRecord(record) {
    // Save locally first
    await saveRecordLocally(record);

    try {
        const { data, error } = await supabase
            .from('supervisor_work_plan_records')
            .upsert({
                id: record.id,
                activity_id: record.activity_id,
                day_date: record.day_date,
                status: record.status,
                notes: record.notes,
                updated_at: new Date().toISOString()
            })
            .select()
            .maybeSingle();

        if (error) throw error;
        await markRecordSynced(record.id);
        
        // Recalculate progress after record update
        await updatePlanProgress(record.activity_id);

        return data;
    } catch (e) {
        console.error('[WorkPlan] Error saving record to Supabase:', e);
        return record;
    }
}

async function updatePlanProgress(activityId) {
    // This is better done on the server with a function or locally here
    const plan = await getPlanByActivity(activityId);
    if (!plan) return;

    const activities = await getLocalActivities(plan.id);
    let totalP = 0;
    let totalE = 0;

    for (const act of activities) {
        const records = await getLocalRecords(act.id);
        // Valid status for planning: P or X or E or A or N
        // Valid status for execution: E or A
        totalP += records.filter(r => ['P', 'X', 'E', 'A', 'N'].includes(r.status)).length;
        totalE += records.filter(r => ['E', 'A'].includes(r.status)).length;
    }

    const progress = totalP > 0 ? (totalE / totalP) * 100 : 0;
    
    // Update locally
    const db = await getDb();
    if (isMockDb()) {
        const plans = db._storage.get('supervisor_work_plans') || [];
        const idx = plans.findIndex(p => p.id === plan.id);
        if (idx !== -1) {
            plans[idx].progress = progress;
            db._storage.set('supervisor_work_plans', plans);
        }
    } else {
        await db.run('UPDATE supervisor_work_plans SET progress = ?, updated_at = ?, synced = 0 WHERE id = ?', [progress, new Date().toISOString(), plan.id]);
    }

    // Try to sync progress to Supabase
    try {
        await supabase.from('supervisor_work_plans').update({ progress }).eq('id', plan.id);
    } catch (e) {}
}

// --- LOCAL HELPERS ---

async function saveWorkPlanLocally(plan) {
    const db = await getDb();
    const entry = { ...plan, synced: plan.synced || 0 };
    if (isMockDb()) {
        const plans = db._storage.get('supervisor_work_plans') || [];
        const idx = plans.findIndex(p => p.id === plan.id);
        if (idx !== -1) plans[idx] = entry; else plans.push(entry);
        db._storage.set('supervisor_work_plans', plans);
    } else {
        await db.run(`INSERT OR REPLACE INTO supervisor_work_plans (id, supervisor_id, month_year, status, progress, created_at, updated_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [entry.id, entry.supervisor_id, entry.month_year, entry.status, entry.progress, entry.created_at, entry.updated_at, entry.synced]
        );
    }
}

async function getLocalWorkPlan(userId, monthYear) {
    const db = await getDb();
    if (isMockDb()) {
        const all = db._storage.get('supervisor_work_plans') || [];
        const plan = all.find(p => p.supervisor_id === userId && p.month_year === monthYear);
        if (!plan) return null;
        const activities = (db._storage.get('supervisor_work_plan_activities') || []).filter(a => a.plan_id === plan.id);
        for (const act of activities) {
            act.records = (db._storage.get('supervisor_work_plan_records') || []).filter(r => r.activity_id === act.id);
        }
        plan.activities = activities;
        return plan;
    } else {
        const res = await db.query('SELECT * FROM supervisor_work_plans WHERE supervisor_id = ? AND month_year = ?', [userId, monthYear]);
        const plan = res.values?.[0];
        if (!plan) return null;
        
        const actRes = await db.query('SELECT * FROM supervisor_work_plan_activities WHERE plan_id = ?', [plan.id]);
        plan.activities = actRes.values || [];
        
        for (const act of plan.activities) {
            const recRes = await db.query('SELECT * FROM supervisor_work_plan_records WHERE activity_id = ?', [act.id]);
            act.records = recRes.values || [];
        }
        return plan;
    }
}

async function saveActivityLocally(activity) {
    const db = await getDb();
    if (isMockDb()) {
        const all = db._storage.get('supervisor_work_plan_activities') || [];
        const idx = all.findIndex(a => a.id === activity.id);
        if (idx !== -1) all[idx] = activity; else all.push(activity);
        db._storage.set('supervisor_work_plan_activities', all);
    } else {
        await db.run('INSERT OR REPLACE INTO supervisor_work_plan_activities (id, plan_id, type, target, duration, notes, created_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [activity.id, activity.plan_id, activity.type, activity.target, activity.duration, activity.notes, activity.created_at || new Date().toISOString(), activity.synced || 0]
        );
    }
}

async function saveRecordLocally(record) {
    const db = await getDb();
    if (isMockDb()) {
        const all = db._storage.get('supervisor_work_plan_records') || [];
        const idx = all.findIndex(r => r.id === record.id);
        if (idx !== -1) all[idx] = record; else all.push(record);
        db._storage.set('supervisor_work_plan_records', all);
    } else {
        await db.run('INSERT OR REPLACE INTO supervisor_work_plan_records (id, activity_id, day_date, status, notes, updated_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [record.id, record.activity_id, record.day_date, record.status, record.notes, record.updated_at || new Date().toISOString(), record.synced || 0]
        );
    }
}

async function markPlanSynced(id) {
    const db = await getDb();
    if (isMockDb()) {
        const all = db._storage.get('supervisor_work_plans') || [];
        const idx = all.findIndex(p => p.id === id);
        if (idx !== -1) all[idx].synced = 1;
        db._storage.set('supervisor_work_plans', all);
    } else {
        await db.run('UPDATE supervisor_work_plans SET synced = 1 WHERE id = ?', [id]);
    }
}

async function markActivitySynced(id) {
    const db = await getDb();
    if (isMockDb()) {
        const all = db._storage.get('supervisor_work_plan_activities') || [];
        const idx = all.findIndex(a => a.id === id);
        if (idx !== -1) all[idx].synced = 1;
        db._storage.set('supervisor_work_plan_activities', all);
    } else {
        await db.run('UPDATE supervisor_work_plan_activities SET synced = 1 WHERE id = ?', [id]);
    }
}

async function markRecordSynced(id) {
    const db = await getDb();
    if (isMockDb()) {
        const all = db._storage.get('supervisor_work_plan_records') || [];
        const idx = all.findIndex(r => r.id === id);
        if (idx !== -1) all[idx].synced = 1;
        db._storage.set('supervisor_work_plan_records', all);
    } else {
        await db.run('UPDATE supervisor_work_plan_records SET synced = 1 WHERE id = ?', [id]);
    }
}

async function getPlanByActivity(activityId) {
    const db = await getDb();
    if (isMockDb()) {
        const activities = db._storage.get('supervisor_work_plan_activities') || [];
        const act = activities.find(a => a.id === activityId);
        if (!act) return null;
        const plans = db._storage.get('supervisor_work_plans') || [];
        return plans.find(p => p.id === act.plan_id);
    } else {
        const res = await db.query(`
            SELECT p.* FROM supervisor_work_plans p
            JOIN supervisor_work_plan_activities a ON a.plan_id = p.id
            WHERE a.id = ?
        `, [activityId]);
        return res.values?.[0];
    }
}

async function getLocalActivities(planId) {
    const db = await getDb();
    if (isMockDb()) {
        return (db._storage.get('supervisor_work_plan_activities') || []).filter(a => a.plan_id === planId);
    } else {
        const res = await db.query('SELECT * FROM supervisor_work_plan_activities WHERE plan_id = ?', [planId]);
        return res.values || [];
    }
}

async function getLocalRecords(activityId) {
    const db = await getDb();
    if (isMockDb()) {
        return (db._storage.get('supervisor_work_plan_records') || []).filter(r => r.activity_id === activityId);
    } else {
        const res = await db.query('SELECT * FROM supervisor_work_plan_records WHERE activity_id = ?', [activityId]);
        return res.values || [];
    }
}
