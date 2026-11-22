import { pool } from '../db/pool.js';

export async function findStoreByCode(code, connection = null) {
  const executor = connection || pool;
  const [rows] = await executor.execute(
    'SELECT id, code, name FROM stores WHERE code = ? LIMIT 1',
    [code]
  );
  return rows[0] || null;
}

export async function requireStoreByCode(code, connection = null) {
  const store = await findStoreByCode(code, connection);
  if (!store) {
    const err = new Error('Store not found');
    err.status = 404;
    throw err;
  }
  return store;
}

export async function getStoreForUser(user, queryStoreCode) {
  const role = (user.role || '').toLowerCase();
  if (['gerente', 'admin', 'administrador'].includes(role)) {
    if (!queryStoreCode) {
      const err = new Error('storeCode requerido');
      err.status = 400;
      throw err;
    }
    return requireStoreByCode(queryStoreCode);
  }
  const fallbackRoute =
    user.route ||
    user.route_number ||
    user.routeNumber ||
    user.user_metadata?.route_number ||
    user.user_metadata?.route ||
    user.user_metadata?.routeNumber ||
    user.raw_user_meta_data?.route_number ||
    user.raw_user_meta_data?.route;

  if (!fallbackRoute) {
    const err = new Error('Usuario sin ruta asignada');
    err.status = 400;
    throw err;
  }

  return requireStoreByCode(fallbackRoute);
}
