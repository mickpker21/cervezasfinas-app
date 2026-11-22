import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { supabase } from '@/supabaseClient';

const API_BASE = Capacitor.isNativePlatform() ? 'https://cervezasfinas.com/api' : '/api';

async function getBearerHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Sesión de administrador requerida (vuelve a iniciar sesión).');
  }
  return `Bearer ${session.access_token}`;
}

async function postAdminEndpoint(endpoint, payload) {
  const authHeader = await getBearerHeader();
  const url = `${API_BASE}/${endpoint}`;

  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.post({
      url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      data: payload,
    });

    const data = typeof response.data === 'string'
      ? JSON.parse(response.data || '{}')
      : (response.data || {});

    if (response.status < 200 || response.status >= 300 || data?.success === false) {
      const msg = data?.details || data?.error || `HTTP ${response.status}`;
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    return data;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    const msg = data?.details || data?.error || `Error HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

export async function createAdminUser(userData) {
  return postAdminEndpoint('admin_create_user.php', userData);
}

export async function updateAdminUser(userData) {
  return postAdminEndpoint('admin_update_user.php', userData);
}

export async function deleteAdminUser(userId) {
  return postAdminEndpoint('admin_delete_user.php', { user_id: userId });
}
