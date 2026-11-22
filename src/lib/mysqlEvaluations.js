import { Capacitor } from '@capacitor/core';
import { resilientFetch } from './network';

const API_BASE = Capacitor.isNativePlatform()
    ? "https://cervezasfinas.com/api"
    : "/api";

/**
 * Imports PDV Evaluations to MySQL.
 */
export async function importEvaluationsPDVApi(evaluationsArray) {
    if (!evaluationsArray?.length) return { processed: 0, errors: [] };

    const url = `${API_BASE}/evaluations-pdv-import.php`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluations: evaluationsArray })
    });

    if (!res.ok) {
        throw new Error(`evaluations-pdv-import HTTP ${res.status}`);
    }
    return await res.json();
}

/**
 * Imports Canal Moderno Evaluations to MySQL.
 */
export async function importEvaluationsCMApi(evaluationsArray) {
    if (!evaluationsArray?.length) return { processed: 0, errors: [] };

    const url = `${API_BASE}/evaluations-import.php`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluations: evaluationsArray })
    });

    if (!res.ok) {
        throw new Error(`evaluations-import HTTP ${res.status}`);
    }
    return await res.json();
}

/**
 * Reads PDV Evaluations from MySQL.
 */
/**
 * Reads PDV Evaluations from MySQL.
 */
export async function fetchEvaluationsPDVApi(params = {}) {
    const q = new URLSearchParams(params).toString();
    const url = `${API_BASE}/evaluations-pdv-read.php?${q}`;
    const res = await resilientFetch(url);
    const json = await res.json();
    return Array.isArray(json) ? json : (json.rows || []);
}

/**
 * Reads Canal Moderno Evaluations from MySQL.
 */
export async function fetchEvaluationsCMApi(params = {}) {
    const q = new URLSearchParams(params).toString();
    const url = `${API_BASE}/evaluations-read.php?${q}`;
    const res = await resilientFetch(url);
    const json = await res.json();
    return Array.isArray(json) ? json : (json.rows || []);
}
