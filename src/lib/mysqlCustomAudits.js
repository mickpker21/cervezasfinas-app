import { Capacitor } from '@capacitor/core';
import { isOnline } from './network';

const API_BASE = Capacitor.isNativePlatform()
    ? "https://cervezasfinas.com/api"
    : "/api";

export async function fetchCustomAuditTemplates(showAll = false) {
    if (!(await isOnline())) return [];
    try {
        const url = `${API_BASE}/custom_audits_api.php?action=get_templates${showAll ? '&all=1' : ''}`;
        const res = await fetch(url);
        const json = await res.json();
        return json.success ? json.data : [];
    } catch (e) {
        console.error('fetchCustomAuditTemplates err', e);
        return [];
    }
}

export async function saveCustomAuditTemplate(template) {
    if (!(await isOnline())) throw new Error("Debe tener internet para guardar la plantilla");
    const url = `${API_BASE}/custom_audits_api.php?action=save_template`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template)
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.id;
}

export async function deleteCustomAuditTemplate(id) {
    if (!(await isOnline())) throw new Error("Debe tener internet para eliminar la plantilla");
    const url = `${API_BASE}/custom_audits_api.php?action=delete_template`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return true;
}

export async function fetchCustomAuditResponses(templateId = null) {
    if (!(await isOnline())) return [];
    try {
        const url = `${API_BASE}/custom_audits_api.php?action=get_responses${templateId ? `&template_id=${templateId}` : ''}`;
        const res = await fetch(url);
        const json = await res.json();
        return json.success ? json.data : [];
    } catch (e) {
        console.error('fetchCustomAuditResponses err', e);
        return [];
    }
}

export async function saveCustomAuditResponse(responseObj) {
    if (!(await isOnline())) throw new Error("Debe tener internet para enviar la auditoría"); // Por ahora online only o manejar en Preferences
    const url = `${API_BASE}/custom_audits_api.php?action=save_response`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(responseObj)
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.id;
}
