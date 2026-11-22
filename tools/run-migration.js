import fs from 'fs';
import { supabase } from '../src/supabaseClient.js';

async function runMigration() {
  try {
    const sql = fs.readFileSync('tools/migration_clients_no_sales.sql', 'utf8');
    const { error } = await supabase.rpc('eval', { query: sql });

    if (error) {
      console.error('Error applying migration:', error);
    } else {
      console.log('Migration applied successfully!');
    }
  } catch (err) {
    console.error('Failed to run migration:', err);
  }
}

runMigration();
