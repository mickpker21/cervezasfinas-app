// Script Node.js para crear usuarios de prueba en Supabase Auth y en la tabla profiles
// Requiere tener configuradas las variables de entorno SUPABASE_URL y SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const users = [
  { name: 'Conquista 1', email: 'conquista1@demo.com', password: 'Test1234!', route: 'R1' },
  { name: 'Conquista 2', email: 'conquista2@demo.com', password: 'Test1234!', route: 'R2' },
  { name: 'Conquista 3', email: 'conquista3@demo.com', password: 'Test1234!', route: 'R3' },
  { name: 'Conquista 4', email: 'conquista4@demo.com', password: 'Test1234!', route: 'R4' },
];

async function createUsers() {
  for (const user of users) {
    // Crear usuario en Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { type: 'Conquista', route: user.route }
    });
    if (error) {
      console.error('Error creando usuario:', user.email, error.message);
      continue;
    }
    const userId = data.user.id;
    // Insertar en profiles
    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId,
      name: user.name,
      email: user.email,
      route: user.route
    });
    if (profileError) {
      console.error('Error insertando en profiles:', user.email, profileError.message);
    } else {
      console.log('Usuario creado:', user.email, 'con ruta', user.route);
    }
  }
}

createUsers();
