import { supabaseAdmin } from '../lib/supabaseAdmin.js';

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Token requerido' });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ message: 'Token invalido' });
    }

    const user = data.user;
    const meta = user?.user_metadata || {};

    req.user = {
      id: user.id,
      email: user.email,
      role: meta.role || meta.type || meta.user_role || null,
      route: meta.route || meta.route_number || meta.routeNumber || null
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireRole(...roles) {
  const allowed = roles.map((r) => String(r).toLowerCase());
  return function roleGuard(req, res, next) {
    if (!req.user) {
      return res.status(403).json({ message: 'No autorizado' });
    }
    const currentRole = String(req.user.role || '').toLowerCase();
    if (!allowed.includes(currentRole)) {
      return res.status(403).json({ message: 'No autorizado' });
    }
    return next();
  };
}
