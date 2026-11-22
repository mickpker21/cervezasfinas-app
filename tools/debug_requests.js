
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Try to load env vars
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
}

// Fallback or explicit values if needed (Assuming standard Vite env vars)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Missing Supabase credentials in environment variables.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('--- Debugging Stock Requests ---');

    // 1. Check all requests unfiltered
    const { data: allRequests, error: errorAll } = await supabase
        .from('stock_requests')
        .select('*');

    if (errorAll) {
        console.error('Error fetching ALL stock_requests:', errorAll.message);
        console.error('Hint: This likely indicates missing RLS policies (SELECT denied).');
    } else {
        console.log(`Total requests visible: ${allRequests.length}`);
        if (allRequests.length > 0) {
            console.log('Sample requests:', allRequests.slice(0, 3));
        } else {
            console.log('No requests returned using current credentials. Table might be empty or hidden by RLS.');
        }
    }

    // 2. Check Profiles to see if drivers exist
    const { data: profiles, error: errorProfiles } = await supabase
        .from('profiles')
        .select('id, name, email, role')
        .in('role', ['autoventa', 'chofer']);

    if (errorProfiles) {
        console.error('Error fetching profiles:', errorProfiles.message);
    } else {
        console.log(`Found ${profiles.length} drivers (autoventa/chofer).`);
        profiles.forEach(p => console.log(` - [${p.role}] ${p.name} (${p.email}) ID: ${p.id}`));
    }
}

run();
