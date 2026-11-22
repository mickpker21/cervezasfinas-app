
// tools/run-migration-node.js
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config'; // Carga las variables de entorno desde .env

async function run() {
  // Ahora process.env.VITE_SUPABASE_URL debería estar disponible
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY deben estar en tu archivo .env');
    process.exit(1);
  }

  // Crea un cliente de Supabase específico para este script
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('Leyendo el archivo de migración SQL...');
    const sql = fs.readFileSync('tools/migration_clients_no_sales.sql', 'utf8');

    console.log('Aplicando la migración a la base de datos...');
    
    // Asumimos que tienes una función RPC llamada 'eval' para ejecutar SQL.
    // Si esto falla, necesitaremos un enfoque diferente.
    const { error } = await supabase.rpc('eval', { query: sql });

    if (error) {
      console.error('Error al aplicar la migración:', error);
      process.exit(1);
    } else {
      console.log('¡Migración aplicada con éxito!');
    }
  } catch (err) {
    console.error('Fallo al ejecutar el script de migración:', err);
    process.exit(1);
  }
}

run();
