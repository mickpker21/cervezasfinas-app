import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { getDb, isMockDb } from '@/lib/localDb';

const isNative = Capacitor.isNativePlatform();

/**
 * Key-Value Storage abstraction with DUAL-LAYER persistence:
 * 1. Primary: SQLite (durable local DB)
 * 2. Secondary: Capacitor Preferences (Android SharedPreferences - immune to DB connection drops)
 * 3. Web: localStorage
 */
export const kvStorage = {
    /**
     * Get value by key.
     * @param {string} key 
     * @returns {Promise<any|null>} Parsed JSON value or null
     */
    async getItem(key) {
        try {
            if (isNative) {
                // 1. Try SQLite first
                try {
                    const db = await getDb();
                    if (db && !isMockDb()) {
                        const res = await db.query('SELECT value FROM kv_store WHERE key = ?', [key]);
                        if (res.values && res.values.length > 0 && res.values[0].value) {
                            return JSON.parse(res.values[0].value);
                        }
                    }
                } catch (dbErr) {
                    console.warn(`[kvStorage] SQLite lookup failed for "${key}", checking Preferences fallback:`, dbErr?.message || dbErr);
                }

                // 2. Fallback to native Preferences (SharedPreferences on Android)
                try {
                    const pref = await Preferences.get({ key });
                    if (pref && pref.value) {
                        return JSON.parse(pref.value);
                    }
                } catch (prefErr) {
                    console.warn(`[kvStorage] Preferences fallback failed for "${key}":`, prefErr);
                }

                return this._getWeb(key);
            } else {
                return this._getWeb(key);
            }
        } catch (e) {
            console.error(`[kvStorage] Error getting ${key}:`, e);
            return null;
        }
    },

    /**
     * Set value by key.
     * Persists to BOTH SQLite and Android SharedPreferences.
     * @param {string} key 
     * @param {any} value - Will be JSON.stringified
     */
    async setItem(key, value) {
        try {
            const strVal = JSON.stringify(value);
            if (isNative) {
                // Dual-write: SharedPreferences (fast, OS-level)
                Preferences.set({ key, value: strVal }).catch(e => {
                    console.warn(`[kvStorage] Error writing ${key} to Preferences:`, e);
                });

                // Dual-write: SQLite kv_store
                try {
                    const db = await getDb();
                    if (db && !isMockDb()) {
                        const now = new Date().toISOString();
                        await db.run(
                            `INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)`,
                            [key, strVal, now]
                        );
                        return;
                    }
                } catch (dbErr) {
                    console.warn(`[kvStorage] SQLite set failed for "${key}", backed by Preferences:`, dbErr?.message || dbErr);
                }

                this._setWeb(key, strVal);
            } else {
                this._setWeb(key, strVal);
            }
        } catch (e) {
            console.error(`[kvStorage] Error setting ${key}:`, e);
        }
    },

    /**
     * Remove item by key.
     * @param {string} key 
     */
    async removeItem(key) {
        try {
            if (isNative) {
                Preferences.remove({ key }).catch(() => {});
                try {
                    const db = await getDb();
                    if (db && !isMockDb()) {
                        await db.run('DELETE FROM kv_store WHERE key = ?', [key]);
                    }
                } catch (e) { }
                this._removeWeb(key);
            } else {
                this._removeWeb(key);
            }
        } catch (e) {
            console.error(`[kvStorage] Error removing ${key}:`, e);
        }
    },

    /**
     * Get all items starting with prefix.
     * @param {string} prefix 
     * @returns {Promise<Array<{key: string, value: any}>>}
     */
    async getItemsByPrefix(prefix) {
        try {
            if (isNative) {
                const db = await getDb();
                if (isMockDb()) return this._getByPrefixWeb(prefix);

                const res = await db.query('SELECT key, value FROM kv_store WHERE key LIKE ?', [`${prefix}%`]);
                const rows = res.values || [];
                return rows.map(r => ({
                    key: r.key,
                    value: JSON.parse(r.value)
                }));
            } else {
                return this._getByPrefixWeb(prefix);
            }
        } catch (e) {
            console.error(`[kvStorage] Error getting prefix ${prefix}:`, e);
            return [];
        }
    },

    // --- Web Fallbacks ---
    _getWeb(key) {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
    },
    _setWeb(key, valueStr) { // valueStr is already stringified by public method usually, but let's handle inconsistent calls
        // Public setItem handles stringify. Here we expect raw string or handle double stringify if needed?
        // Let's keep public API separate. Public setItem calls with string value for Web?
        // Actually, public setItem calls _setWeb with String.
        // But localStorage stores strings.
        localStorage.setItem(key, valueStr);
    },
    _removeWeb(key) {
        localStorage.removeItem(key);
    },
    _getByPrefixWeb(prefix) {
        const results = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                try {
                    const item = localStorage.getItem(key);
                    const val = item ? JSON.parse(item) : null;
                    results.push({ key, value: val });
                } catch (e) { }
            }
        }
        return results;
    }
};
