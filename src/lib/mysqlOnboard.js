import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { resilientFetch } from './network';

const API_BASE = Capacitor.isNativePlatform()
    ? "https://cervezasfinas.com/api"
    : "/api";

/**
 * Imports Onboard Supervisions and Visits to MySQL.
 */
export async function importOnboardSupervisionApi({ supervisions = [], visits = [] }) {
    if (!supervisions.length && !visits.length) return { processed_supervisions: 0, processed_visits: 0, errors: [] };

    const url = `${API_BASE}/onboard-supervision-import.php`;
    
    try {
        if (Capacitor.isNativePlatform()) {
            const options = {
                url: url,
                method: 'POST',
                data: { supervisions, visits },
                headers: { 'Content-Type': 'application/json' }
            };
            const response = await CapacitorHttp.post(options);
            if (response.status !== 200) throw new Error(`onboard-import Native HTTP ${response.status}`);
            return response.data;
        } else {
            const res = await resilientFetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ supervisions, visits })
            });

            if (!res.ok) {
                throw new Error(`onboard-import HTTP ${res.status}`);
            }
            return await res.json();
        }
    } catch (error) {
        console.error('[mysqlOnboard] Error importing supervision data:', error);
        throw error;
    }
}
/**
 * Reads Onboard Supervisions from MySQL.
 */
export async function fetchOnboardSupervisionsApi(params = {}) {
    const q = new URLSearchParams(params).toString();
    const url = `${API_BASE}/onboard-supervision-read.php?${q}`;
    
    try {
        if (Capacitor.isNativePlatform()) {
            const options = { url, method: 'GET', headers: { 'Content-Type': 'application/json' } };
            const response = await CapacitorHttp.get(options);
            if (response.status !== 200) throw new Error(`onboard-read Native HTTP ${response.status}`);
            return response.data;
        } else {
            const res = await resilientFetch(url);
            if (!res.ok) throw new Error(`onboard-read HTTP ${res.status}`);
            return await res.json();
        }
    } catch (error) {
        console.error('[mysqlOnboard] Error fetching supervision data:', error);
        throw error;
    }
}
