import { Capacitor } from '@capacitor/core';
import { isOnline } from './network';

const API_BASE = Capacitor.isNativePlatform()
    ? "https://cervezasfinas.com/api"
    : "/api";

export async function fetchCustomSurveyTemplates(showAll = false) {
    if (!(await isOnline())) return [];
    try {
        const url = `${API_BASE}/custom_surveys_api.php?action=get_templates${showAll ? '&all=1' : ''}`;
        const res = await fetch(url);
        const json = await res.json();
        return json.success ? json.data : [];
    } catch (e) {
        console.error('fetchCustomSurveyTemplates err', e);
        return [];
    }
}

export async function saveCustomSurveyTemplate(template) {
    if (!(await isOnline())) throw new Error("Debe tener internet para guardar la encuesta");
    const url = `${API_BASE}/custom_surveys_api.php?action=save_template`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template)
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.id;
}

export async function deleteCustomSurveyTemplate(id) {
    if (!(await isOnline())) throw new Error("Debe tener internet para eliminar la encuesta");
    const url = `${API_BASE}/custom_surveys_api.php?action=delete_template`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return true;
}

export async function fetchCustomSurveyResponses(templateId = null, clientId = null) {
    if (!(await isOnline())) return [];
    try {
        let url = `${API_BASE}/custom_surveys_api.php?action=get_responses`;
        if (templateId) url += `&template_id=${templateId}`;
        if (clientId) url += `&client_id=${clientId}`;
        const res = await fetch(url);
        const json = await res.json();
        return json.success ? json.data : [];
    } catch (e) {
        console.error('fetchCustomSurveyResponses err', e);
        return [];
    }
}

export async function saveCustomSurveyResponse(responseObj) {
    if (!(await isOnline())) throw new Error("Debe tener internet para enviar la encuesta");
    const url = `${API_BASE}/custom_surveys_api.php?action=save_response`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(responseObj)
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.id;
}
