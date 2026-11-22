/**
 * pushService.js
 * 
 * Facilita el envío de notificaciones push llamando al backend de PHP.
 */

const PUSH_API_URL = "/api/send-push.php";

async function parseJsonResponse(response) {
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { success: false, error: text || `HTTP ${response.status}` };
  }
  if (!response.ok) {
    return { success: false, error: data?.error || data?.message || `HTTP ${response.status}` };
  }
  return data;
}

export const pushService = {
  /**
   * Envía una notificación a un usuario específico por su ID de Supabase.
   */
  async sendToUser(userId, title, body, url = null) {
    try {
      const response = await fetch(PUSH_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          title: title,
          body: body,
          data: { url: url || "" }
        })
      });
      return await parseJsonResponse(response);
    } catch (error) {
      console.error("[pushService] Error sending to user:", error);
      return { success: false, error: error.message || String(error) };
    }
  },

  /**
   * Envía una notificación global a todos los usuarios que tengan token registrado.
   */
  async broadcast(title, body, url = null, role = 'all', jobTitle = null, department = null) {
    try {
      if (role === 'shop_clients') {
        const { getShopAuthHeaders, API_URL } = await import('@/lib/api');
        const endpoint = `${API_URL || '/api/shop'}/notifications/broadcast.php`;
        const authHeaders = await getShopAuthHeaders({ 'Content-Type': 'application/json' });
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            title: title,
            body: body,
            url: url || '/catalog'
          })
        });
        return await parseJsonResponse(response);
      }

      const response = await fetch(PUSH_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          broadcast: true,
          role: role,
          job_title: jobTitle,
          department: department,
          title: title,
          body: body,
          data: { url: url || "" }
        })
      });
      return await parseJsonResponse(response);
    } catch (error) {
      console.error("[pushService] Error sending broadcast:", error);
      return { success: false, error: error.message || String(error) };
    }
  }
};
