import { getDb, isMockDb } from './localDb';
import { logger } from './logger';

/**
 * Safe Upsert: Prevents overwriting local records that have not been synced.
 * @param {string} table - Table name
 * @param {object} record - The record to upsert (must contain PK and synced fields ideally)
 * @param {string} pkField - The Primary Key field name (e.g., 'id')
 */
export async function safeUpsert(table, record, pkField = 'id') {
    try {
        const db = await getDb();
        const pkValue = record[pkField];

        if (!pkValue) {
            logger.error('DB_HELPER', 'SAFE_UPSERT_FAIL', { reason: 'No PK value', record });
            return false;
        }

        // 1. Check Local State
        let localRecord = null;
        if (isMockDb()) {
            const all = db._storage.get(table) || [];
            localRecord = all.find(r => r[pkField] === pkValue);
        } else {
            const res = await db.query(`SELECT * FROM ${table} WHERE ${pkField} = ?`, [pkValue]);
            localRecord = res.values?.[0];
        }

        // 2. Anti-Overwrite Rule
        // If local exists AND is dirty (synced=0), DO NOT overwrite with incoming data (usually from server sync or generic fetch).
        // EXCEPT if the incoming record ITSELF implies a sync confirmation (but usually this func is used for "saving fetched data").
        // We assume 'record' is the "New Truth" (e.g. from Server).
        // If Local is Dirty, Local is the "Truth" until synced.
        if (localRecord && localRecord.synced === 0) {
            logger.warn('DB_HELPER', 'SAFE_UPSERT_SKIPPED', {
                reason: 'Local record is dirty (synced=0)',
                table,
                id: pkValue
            });
            return false;
        }

        // 3. Perform Upsert
        if (isMockDb()) {
            const all = db._storage.get(table) || [];
            const filtered = all.filter(r => r[pkField] !== pkValue);
            db._storage.set(table, [...filtered, record]);
        } else {
            const keys = Object.keys(record);
            const values = Object.values(record);
            const placeholders = keys.map(() => '?').join(',');
            const sql = `INSERT OR REPLACE INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`;
            await db.run(sql, values);
        }

        // logger.info('DB_HELPER', 'SAFE_UPSERT_SUCCESS', { table, id: pkValue });
        return true;

    } catch (e) {
        logger.error('DB_HELPER', 'SAFE_UPSERT_ERROR', e);
        return false;
    }
}
