import { Capacitor } from '@capacitor/core';

const API_BASE = Capacitor.isNativePlatform()
    ? "https://cervezasfinas.com/api"
    : "/api";

export async function getPortfolioItems() {
    try {
        const response = await fetch(`${API_BASE}/api_portfolio.php`);
        if (!response.ok) throw new Error("Error fetching portfolio items");
        const json = await response.json();
        return json.data || [];
    } catch (e) {
        console.error("getPortfolioItems error:", e);
        return [];
    }
}

export async function createPortfolioItem(formData) {
    try {
        const response = await fetch(`${API_BASE}/api_portfolio.php`, {
            method: 'POST',
            body: formData, // FormData directly
        });
        const json = await response.json();
        if (json.status !== 'success') throw new Error(json.message);
        return json;
    } catch (e) {
        console.error("createPortfolioItem error:", e);
        throw e;
    }
}

export async function deletePortfolioItem(id) {
    try {
        const response = await fetch(`${API_BASE}/api_portfolio.php?id=${id}`, {
            method: 'DELETE',
        });
        const json = await response.json();
        if (json.status !== 'success') throw new Error(json.message);
        return json;
    } catch (e) {
        console.error("deletePortfolioItem error:", e);
        throw e;
    }
}

export async function updatePortfolioOrder(items) {
    try {
        const response = await fetch(`${API_BASE}/api_portfolio.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reorder', items }),
        });
        const json = await response.json();
        if (json.status !== 'success') throw new Error(json.message);
        return json;
    } catch (e) {
        console.error("updatePortfolioOrder error:", e);
        throw e;
    }
}

export async function getAboutUsContent() {
    try {
        const response = await fetch(`${API_BASE}/api_about_us.php`);
        if (!response.ok) throw new Error("Error fetching about us content");
        const json = await response.json();
        return json.data || {};
    } catch (e) {
        console.error("getAboutUsContent error:", e);
        return {};
    }
}

export async function updateAboutUsContent(formData) {
    try {
        const response = await fetch(`${API_BASE}/api_about_us.php`, {
            method: 'POST',
            body: formData, // FormData directly
        });
        const json = await response.json();
        if (json.status !== 'success') throw new Error(json.message);
        return json;
    } catch (e) {
        console.error("updateAboutUsContent error:", e);
        throw e;
    }
}
