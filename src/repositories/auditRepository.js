import { getDb, isMockDb } from '@/lib/localDb';
import { isOnline } from '@/lib/network';
import { supabase } from '@/supabaseClient';
import { v4 as uuidv4 } from 'uuid';

/**
 * Enterprise Audit Logging Repository
 * "The Black Box" - Tracks all sensitive actions.
 */

export async function logAction({ actorId, action, target, details }) {
    const entry = {
        id: uuidv4(),
        actor_id: actorId,
        action,
        target,
        details: typeof details === 'object' ? JSON.stringify(details) : details,
        created_at: new Date().toISOString(),
        synced: 0
    };

    console.log('[Audit] Logging action:', entry);

    try {
        await saveAuditToLocal(entry);

        // Try to sync immediately if online (fire and forget)
        if (await isOnline()) {
            syncAuditLog().catch(e => console.warn('[Audit] Background sync failed', e));
        }
    } catch (e) {
        console.error('[Audit] Failed to log action:', e);
    }
}

async function saveAuditToLocal(entry) {
    const db = await getDb();
    if (isMockDb()) {
        const current = db._storage.get('hr_audit') || [];
        current.push(entry);
        db._storage.set('hr_audit', current);
        return;
    }

    await db.run(`
        INSERT INTO hr_audit (id, actor_id, action, target, details, created_at, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [entry.id, entry.actor_id, entry.action, entry.target, entry.details, entry.created_at, entry.synced]);
}

export async function syncAuditLog() {
    const db = await getDb();
    let pending = [];

    if (isMockDb()) {
        const all = db._storage.get('hr_audit') || [];
        pending = all.filter(x => x.synced === 0);
    } else {
        const res = await db.query('SELECT * FROM hr_audit WHERE synced = 0');
        pending = res.values || [];
    }

    if (pending.length === 0) return;

    console.log(`[Audit] Syncing ${pending.length} logs...`);

    // In a real scenario, this would POST to an endpoint or Supabase table
    // For now, we'll just mark them as synced to simulate the process
    // const { error } = await supabase.from('audit_logs').insert(pending); 

    // Mock success
    const ids = pending.map(p => p.id);
    await markAsSynced(ids);
}

async function markAsSynced(ids) {
    if (!ids.length) return;
    const db = await getDb();
    if (isMockDb()) {
        const all = db._storage.get('hr_audit') || [];
        all.forEach(x => { if (ids.includes(x.id)) x.synced = 1; });
        db._storage.set('hr_audit', all);
    } else {
        const placeholders = ids.map(() => '?').join(',');
        await db.run(`UPDATE hr_audit SET synced = 1 WHERE id IN (${placeholders})`, ids);
    }
}
