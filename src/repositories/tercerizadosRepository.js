import { Capacitor } from '@capacitor/core';
import { isOnline } from '@/lib/network';

const API_BASE = Capacitor.isNativePlatform() ? 'https://cervezasfinas.com/api' : '/api';
export async function getTercerizados() {
  try {
    const response = await fetch(`${API_BASE}/tercerizados-read.php`);
    const data = await response.json();
    return data.rows || [];
  } catch (error) {
    console.error('[tercerizadosRepository] Error fetching:', error);
    return [];
  }
}

export async function addTercerizado(payload) {
  try {
    const response = await fetch(`${API_BASE}/tercerizados-import.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await response.json();
  } catch (error) {
    console.error('[tercerizadosRepository] Error adding:', error);
    return { success: false, message: error.message };
  }
}
