// Ejemplo de cómo probar el endpoint desde el frontend o Postman:
//
// fetch('http://localhost:4000/api/update-user-metadata', {
//   method: 'POST',
//   headers: { 'Content-Type': 'application/json' },
//   body: JSON.stringify({
//     user_id: 'el-uuid-del-usuario',
//     type: 'Conquista',
//     route_number: 'R2'
//   })
// })
//   .then(res => res.json())
//   .then(data => console.log(data))
//   .catch(err => console.error(err));


import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from './logger.js';

dotenv.config();


const app = express();

// Seguridad básica y parsing
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
  credentials: false
}));
app.use(express.json({ limit: '256kb' }));

// Rate limiting (defensivo)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Helper de respuesta uniforme
function send(res, { success = true, status = 200, data = null, error = null, details = null }) {
  const body = { success };
  if (success && data !== null) body.data = data;
  if (!success) body.error = error || 'error';
  if (details) body.details = details;
  return res.status(status).json(body);
}

// Cliente con service key (operaciones privilegiadas)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || '' // Service key nunca en frontend
);

// Middleware autenticación y autorización admin
async function authenticateAdmin(req, res, next) {
  try {
    // Permitir bypass inicial si se define un secreto manual para bootstrap (creación primer admin)
    const bypass = req.headers['x-admin-secret'];
    if (process.env.ADMIN_BYPASS_SECRET && bypass === process.env.ADMIN_BYPASS_SECRET) {
      logger.warn('Admin bypass usado', { path: req.path });
      return next();
    }

    if (process.env.DISABLE_AUTH === 'true') {
      logger.warn('Auth deshabilitada por DISABLE_AUTH=true (no usar en prod)');
      return next();
    }

    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'NO_AUTH', details: 'Falta bearer token' });
    }
    if (!process.env.SUPABASE_ANON_KEY) {
      return res.status(500).json({ error: 'CONFIG', details: 'Falta SUPABASE_ANON_KEY para validar tokens' });
    }
    // Cliente temporal ligado al token
    const userClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return res.status(401).json({ error: 'INVALID_TOKEN', details: userErr?.message || 'Token inválido' });
    }
    const uid = userData.user.id;
    // Verificar rol admin en profiles (usar service client para evitar RLS problemas si existieran)
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', uid)
      .maybeSingle();
    if (profErr) {
      logger.error('Error consultando profile para auth', { error: profErr.message });
      return res.status(500).json({ error: 'PROFILE_LOOKUP_FAILED', details: profErr.message });
    }
    const role = (profile?.role || '').toLowerCase();
    if (role !== 'admin') {
      return res.status(403).json({ error: 'FORBIDDEN', details: 'Requiere rol admin' });
    }
    // Attach user id for uso posterior si se requiere
    req.adminUserId = uid;
    next();
  } catch (err) {
    logger.error('Error en authenticateAdmin', { error: err.message });
    return res.status(500).json({ error: 'AUTH_MIDDLEWARE_FAILED', details: err.message });
  }
}

logger.info('API iniciando');
if (!process.env.SUPABASE_URL) logger.warn('SUPABASE_URL no está definida');
if (!process.env.SUPABASE_SERVICE_KEY) logger.warn('SUPABASE_SERVICE_KEY no está definida');

// Middleware para validar configuración antes de atender endpoints (excepto health)
app.use((req, res, next) => {
  if (req.path === '/api/health') return next();
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({
      error: 'API sin configurar',
      details: 'Define SUPABASE_URL y SUPABASE_SERVICE_KEY antes de usar los endpoints.',
    });
  }
  next();
});

// Endpoint seguro para actualizar user_metadata y/o contraseña de un usuario
app.post('/api/update-user-metadata', authenticateAdmin, async (req, res) => {
  try {
    const { user_id, type, route, password } = req.body;
    if (!user_id || !type) return send(res, { success: false, status: 400, error: 'VALIDATION_ERROR', details: 'user_id y type requeridos' });

    const updateData = {
      user_metadata: { type, role: type, route: route || null }
    };

    if (password) {
        updateData.password = password;
    }

    const { data, error } = await supabase.auth.admin.updateUserById(user_id, updateData);
    if (error) return send(res, { success: false, status: 500, error: 'UPDATE_FAILED', details: error.message });
    return send(res, { data: { user: data.user } });
  } catch (err) {
    logger.error('Error inesperado en update-user-metadata', { error: err.message });
    return send(res, { success: false, status: 500, error: 'UNEXPECTED', details: err.message });
  }
});

// Endpoint para crear usuarios (admin/service role)
app.post('/api/create-user', authenticateAdmin, async (req, res) => {
  try {
    const startedAt = Date.now();
  let { name, email, password, role, route, force_change_password, phone, job_title, department, employee_id, start_date, emergency_contact } = req.body || {};
    const normRole = typeof role === 'string' ? role.trim().toLowerCase() : '';
    const payloadLog = { email, role: normRole, hasPassword: Boolean(password), route: route || null };
    logger.info('create-user attempt', payloadLog);

    // Validaciones
    if (!email || !normRole) {
      return send(res, { success: false, status: 400, error: 'VALIDATION_ERROR', details: 'email y role requeridos' });
    }
    // Generar password temporal si no viene (admin permite dejar vacío para generar)
    if (!password) {
      password = generateTempPassword();
    }
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!emailRegex.test(email)) {
      return send(res, { success: false, status: 400, error: 'INVALID_EMAIL', details: 'Formato de email inválido' });
    }
    // Política de contraseña (coincide con frontend + fallback si cambian reglas supabase)
    const pwd = String(password);
    const pwdPolicy = [
      { test: (v) => v.length >= 8, code: 'min8' },
      { test: (v) => /[A-Z]/.test(v), code: 'upper' },
      { test: (v) => /[a-z]/.test(v), code: 'lower' },
      { test: (v) => /\d/.test(v), code: 'digit' }
    ];
    const pwdFails = pwdPolicy.filter(p => !p.test(pwd)).map(p => p.code);
    if (pwdFails.length) {
      return send(res, { success: false, status: 400, error: 'WEAK_PASSWORD', details: `No cumple reglas: ${pwdFails.join(',')}` });
    }

    // Requerir route para conquista
    if (normRole === 'conquista' && !String(route || '').trim()) {
      return send(res, { success: false, status: 400, error: 'MISSING_ROUTE', details: 'route requerido para rol conquista' });
    }

    // Crear usuario en Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: name || '', role: normRole, type: normRole, route: route || null, must_change_password: force_change_password !== false }
    });
    if (error) {
      logger.error('create-user error', { error: error.message, code: error.status || error.code, stack: error.stack });
      const msg = String(error.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('exists') || msg.includes('duplicate')) {
        return send(res, { success: false, status: 409, error: 'EMAIL_EXISTS', details: error.message });
      }
      if (msg.includes('password')) {
        return send(res, { success: false, status: 400, error: 'PASSWORD_POLICY', details: error.message });
      }
      return send(res, { success: false, status: 500, error: 'CREATE_FAILED', details: error.message + (process.env.NODE_ENV !== 'production' ? ` | code=${error.status || error.code || 'n/a'}` : '') });
    }

    const user = data.user;
    // Upsert perfil (tolerar error, solo loggear)
    const { error: upsertErr } = await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      name: name || '',
      role: normRole,
      route: route || null,
      must_change_password: force_change_password !== false,
      phone: phone || null,
      job_title: job_title || null,
      department: department || null,
      employee_id: employee_id || null,
      start_date: start_date || null,
      emergency_contact: emergency_contact || null
    }, { onConflict: 'id' });
    if (upsertErr) {
      logger.warn('upsert profiles fallo', { error: upsertErr.message });
    }
    logger.info('create-user success', { email: user.email, ms: Date.now() - startedAt });
  return send(res, { data: { user, temp_password: password, must_change_password: force_change_password !== false } });
  } catch (err) {
    logger.error('Error en create-user', { error: err.message, stack: err.stack });
    return send(res, { success: false, status: 500, error: 'UNEXPECTED', details: (err?.message || String(err)) + (process.env.NODE_ENV !== 'production' ? ` | stack=${(err.stack||'').split('\n')[0]}` : '') });
  }
});

// Generador de contraseña temporal fuerte
function generateTempPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$%&*!?';
  const all = upper + lower + digits + symbols;
  function pick(set) { return set[Math.floor(Math.random() * set.length)]; }
  let pwd = pick(upper) + pick(lower) + pick(digits) + pick(symbols);
  for (let i = pwd.length; i < 12; i++) pwd += pick(all);
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

// Endpoint de debug (solo en desarrollo) para ver configuración básica sin exponer secretos
app.get('/api/debug/config', (req, res) => {
  const isDev = process.env.NODE_ENV !== 'production';
  if (!isDev) return res.status(404).end();
  return send(res, {
    data: {
      node_env: process.env.NODE_ENV,
      supabase_url_present: Boolean(process.env.SUPABASE_URL),
      service_key_present: Boolean(process.env.SUPABASE_SERVICE_KEY),
      cors_origin: process.env.CORS_ORIGIN || '*'
    }
  });
});

// Healthcheck
app.get('/api/health', (req, res) => {
  return send(res, { data: { ok: true, version: '1.0.0', time: new Date().toISOString() } });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => logger.info('API escuchando', { port: PORT }));
