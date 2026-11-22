import { getDb, isMockDb } from '@/lib/localDb';
import { isOnline } from '@/lib/network';
import { supabase } from '@/supabaseClient';

export async function getInstallerProfile(userId) {
    const online = await isOnline();

    if (online) {
        try {
            const { data, error } = await supabase
                .from('installers')
                .select('id, profile:profiles(name)')
                .eq('profile_id', userId)
                .single();

            if (error) throw error;
            if (data) {
                await saveInstallerProfileToLocal(userId, data);
                return data;
            }
        } catch (e) {
            console.error('[installationsRepository] Error fetching profile online:', e);
            return await loadLocalInstallerProfile(userId);
        }
    } else {
        return await loadLocalInstallerProfile(userId);
    }
}

async function loadLocalInstallerProfile(userId) {
    try {
        const db = await getDb();
        if (isMockDb()) {
            const all = db._storage.get('installers') || [];
            return all.find(i => i.profile_id === userId);
        }
        const res = await db.query('SELECT * FROM installers WHERE profile_id = ?', [userId]);
        const row = res.values?.[0];
        if (row) {
            return {
                id: row.id,
                profile: { name: row.profile_name }
            };
        }
        return null;
    } catch (e) {
        console.error('[installationsRepository] Error loading local profile:', e);
        return null;
    }
}

async function saveInstallerProfileToLocal(userId, data) {
    try {
        const db = await getDb();
        if (isMockDb()) {
            const current = db._storage.get('installers') || [];
            const others = current.filter(i => i.profile_id !== userId);
            db._storage.set('installers', [...others, { ...data, profile_id: userId }]);
            return;
        }

        await db.run(`
      INSERT OR REPLACE INTO installers (id, profile_id, profile_name, synced)
      VALUES (?, ?, ?, 1)
    `, [data.id, userId, data.profile?.name]);
    } catch (e) {
        console.error('[installationsRepository] Error saving local profile:', e);
    }
}

export async function getInstallationOrders(installerId) {
    const online = await isOnline();

    if (online) {
        try {
            const { data, error } = await supabase
                .from('installation_orders')
                .select(`
          id,
          action,
          status,
          created_at,
          origin_client:client_id(name, address),
          destination_client:destination_client_id(name, address),
          client_id,
          destination_client_id,
          assigned_to
        `)
                .eq('assigned_to', installerId)
                .in('status', ['APROBADA', 'EN_RUTA'])
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (data) {
                await saveInstallationOrdersToLocal(installerId, data);
                return data;
            }
        } catch (e) {
            console.error('[installationsRepository] Error fetching orders online:', e);
            return await loadLocalInstallationOrders(installerId);
        }
    } else {
        return await loadLocalInstallationOrders(installerId);
    }
}

async function loadLocalInstallationOrders(installerId) {
    try {
        const db = await getDb();
        if (isMockDb()) {
            const all = db._storage.get('installation_orders') || [];
            return all.filter(o => o.assigned_to === installerId);
        }

        const res = await db.query(`
      SELECT * FROM installation_orders 
      WHERE assigned_to = ? 
      AND status IN ('APROBADA', 'EN_RUTA')
      ORDER BY created_at DESC
    `, [installerId]);

        return (res.values || []).map(row => ({
            ...row,
            origin_client: row.origin_client ? JSON.parse(row.origin_client) : null,
            destination_client: row.destination_client ? JSON.parse(row.destination_client) : null
        }));
    } catch (e) {
        console.error('[installationsRepository] Error loading local orders:', e);
        return [];
    }
}

async function saveInstallationOrdersToLocal(installerId, orders) {
    try {
        const db = await getDb();
        if (isMockDb()) {
            // Mock impl
            return;
        }

        // Transaction-like
        for (const order of orders) {
            await db.run(`
        INSERT OR REPLACE INTO installation_orders (
          id, action, status, created_at, 
          origin_client, destination_client, 
          client_id, destination_client_id, assigned_to, synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
                order.id,
                order.action,
                order.status,
                order.created_at,
                JSON.stringify(order.origin_client),
                JSON.stringify(order.destination_client),
                order.client_id,
                order.destination_client_id,
                order.assigned_to
            ]);
        }
    } catch (e) {
        console.error('[installationsRepository] Error saving local orders:', e);
    }
}
