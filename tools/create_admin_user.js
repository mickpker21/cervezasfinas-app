// Crea un usuario admin en Supabase Auth y su profile asociado
// Requiere variables de entorno: SUPABASE_URL y SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function createAdmin({ name, email, password }) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      type: 'admin',
      role: 'admin',
      name,
      route: null
    }
  });
  if (error) throw error;
  const user = data.user;

  // Intenta insertar/actualizar el profile por si el trigger no está activo
  const { error: upsertErr } = await supabase.from('profiles').upsert({
    id: user.id,
    email: user.email,
    name,
    role: 'admin',
    route: null
  }, { onConflict: 'id' });
  if (upsertErr) console.warn('Aviso: no se pudo upsert profile (puede ser normal si hay trigger):', upsertErr.message);

  console.log('Admin creado:', email, 'id:', user.id);
}

// Lee args simples desde CLI
const [,, name, email, password] = process.argv;
if (!name || !email || !password) {
  console.log('Uso: node tools/create_admin_user.js "Nombre" admin@demo.com "Password123!"');
  process.exit(1);
}

createAdmin({ name, email, password }).catch((e) => {
  console.error('Error creando admin:', e.message);
  process.exit(1);
});
