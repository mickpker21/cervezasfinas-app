import { Capacitor, CapacitorHttp } from '@capacitor/core';

const API_BASE = Capacitor.isNativePlatform()
    ? "https://cervezasfinas.com/api"
    : "/api";

export async function importHelpdeskApi(data) {
    if (!data.tickets?.length && !data.messages?.length && !data.areas?.length) {
        return { processed_tickets: 0, processed_messages: 0, processed_areas: 0, errors: [] };
    }

    const url = `${API_BASE}/helpdesk-import.php`;
    
    try {
        if (Capacitor.isNativePlatform()) {
            const options = {
                url: url,
                method: 'POST',
                data: data,
                headers: { 'Content-Type': 'application/json' }
            };
            const response = await CapacitorHttp.post(options);
            if (response.status !== 200) throw new Error(`helpdesk-import Native HTTP ${response.status}`);
            return response.data;
        } else {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });

            if (!res.ok) {
                throw new Error(`helpdesk-import HTTP ${res.status}`);
            }
            return await res.json();
        }
    } catch (error) {
        console.error('[mysqlHelpdesk] Error importing helpdesk data:', error);
        throw error;
    }
}

export async function fetchHelpdeskApi(params = {}) {
    let url = `${API_BASE}/helpdesk-read.php`;
    const queryParts = [];
    if (params.user_id) queryParts.push(`user_id=${encodeURIComponent(params.user_id)}`);
    if (params.limit) queryParts.push(`limit=${encodeURIComponent(params.limit)}`);
    
    if (queryParts.length > 0) {
        url += '?' + queryParts.join('&') + `&_t=${Date.now()}`;
    } else {
        url += `?_t=${Date.now()}`;
    }

    try {
        if (Capacitor.isNativePlatform()) {
            const options = {
                url: url,
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            };
            const response = await CapacitorHttp.get(options);
            if (response.status !== 200) throw new Error(`helpdesk-read Native HTTP ${response.status}`);
            return response.data;
        } else {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`helpdesk-read HTTP ${res.status}`);
            return await res.json();
        }
    } catch (error) {
        console.error('[mysqlHelpdesk] Error fetching helpdesk data:', error);
        throw error;
    }
}
