const BASE_URL = (import.meta.env.VITE_UM6_POS_API_URL || '').replace(/\/$/, '');

async function request(path, { method = 'GET', body, token } = {}) {
  if (!BASE_URL) {
    throw new Error('VITE_UM6_POS_API_URL no está configurado');
  }
  if (!token) {
    throw new Error('Token de sesión no disponible');
  }

  const headers = {
    Authorization: `Bearer ${token}`,
  };

  let payload;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && body !== null) {
    if (isFormData) {
      payload = body;
    } else {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
  }

  // Si BASE_URL ya tiene query (por ejemplo ...index.php?route=),
  // evitamos anidar otro '?' dentro de path y usamos '&' para los parámetros adicionales.
  let finalPath = path;
  if (BASE_URL.includes("?") && path.includes("?")) {
    const [basePath, query] = path.split("?", 2);
    finalPath = `${basePath}${query ? `&${query}` : ""}`;
  }

  const response = await fetch(`${BASE_URL}${finalPath}`, {
    method,
    headers,
    body: payload,
  });

  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  if (!response.ok) {
    const message = data?.message || `Error ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

export const um6Api = {
  listStores: (token, search) =>
    request(`/api/stores${search ? `?search=${encodeURIComponent(search)}` : ''}`, { token }),
  getStore: (token, storeCode) =>
    request(`/api/stores/me${storeCode ? `?storeCode=${encodeURIComponent(storeCode)}` : ''}`, { token }),
  getInventory: (token, storeCode) =>
    request(`/api/stores/me/inventory${storeCode ? `?storeCode=${encodeURIComponent(storeCode)}` : ''}`, { token }),
  registerSale: (token, payload) =>
    request('/api/pos/sales', { method: 'POST', body: payload, token }),
  getSalesSummary: (token) =>
    request('/api/pos/sales/summary', { token }),
  registerMovement: (token, payload) =>
    request('/api/pos/movements', { method: 'POST', body: payload, token }),
  updateInventoryLevels: (token, payload) =>
    request('/api/stores/inventory-levels', { method: 'PATCH', body: payload, token }),
  listOrders: (token, storeCode) =>
    request(`/api/orders${storeCode ? `?storeCode=${encodeURIComponent(storeCode)}` : ''}`, { token }),
  getOrderSuggestion: (token, storeCode) =>
    request(`/api/orders/suggestions?storeCode=${encodeURIComponent(storeCode)}`, { token }),
  createOrder: (token, payload) =>
    request('/api/orders', { method: 'POST', body: payload, token }),
  updateOrderStatus: (token, orderId, payload) =>
    request(`/api/orders/${orderId}/status`, { method: 'PATCH', body: payload, token }),
  acceptOrder: (token, orderId) =>
    request(`/api/orders/${orderId}/accept`, { method: 'POST', token }),
  getLatestPlanogram: (token) =>
    request('/api/planograms/me', { token }),
  listPlanograms: (token, storeCode) =>
    request(`/api/planograms${storeCode ? `?storeCode=${encodeURIComponent(storeCode)}` : ''}`, { token }),
  createPlanogram: (token, payload) =>
    request('/api/planograms', { method: 'POST', body: payload, token }),
  listProducts: (token, search) =>
    request(`/api/products${search ? `?search=${encodeURIComponent(search)}` : ''}`, { token }),
  saveProduct: (token, payload) =>
    request('/api/products', { method: 'POST', body: payload, token }),
  deleteProduct: (token, productId) =>
    request(`/api/products/${productId}`, { method: 'DELETE', token }),

  // --- New Methods for Professional POS ---
  createInventoryValidation: (token, payload) =>
    request('/api/pos/inventory-validations', { method: 'POST', body: payload, token }),

  getStoreValidations: (token, storeCode) =>
    request(`/api/pos/inventory-validations?storeCode=${encodeURIComponent(storeCode)}`, { token }),

  createAuditLog: (token, payload) =>
    request('/api/pos/audit-logs', { method: 'POST', body: payload, token }),
};
