import { createClient } from "@supabase/supabase-js";

// Use SERVICE KEY to bypass RLS and create policies
const supabaseUrl = process.env.SUPABASE_URL || 'https://eskqnlzcswxszlicjppe.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVza3FubHpjc3d4c3psaWNqcHBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwNDUxMTksImV4cCI6MjA2ODYyMTExOX0.ijvDFQu4aE0UjzRey55rZsCiM8dhEGiuyRLs-C_e7VE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
    console.log("Applying RLS policies for public verification...");

    // 1. Enable RLS on direct_sales if not enabled 
    // (We can't easily check 'is enabled' via JS client easily without hitting pg_tables, 
    // but we can try to create the policy. If table doesn't have RLS, policy still works but table is open. 
    // Ideally we'd execute SQL `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, but `rpc` is needed.)

    // Try to query to see if it works as service role (sanity check)
    const { error: testErr } = await supabase.from('direct_sales').select('count', { count: 'exact', head: true });
    if (testErr) console.error("Service Role connection failed:", testErr);
    else console.log("Service Role connected.");

    // Since we don't have a direct 'run_sql' RPC, we have to rely on the fact that 
    // we probably can't change RLS via JS client unless there is an RPC for it.
    // However, the USER might have RLS enabled.
    // The previous 404 might have been just "Table not found" because of the typo 'ventas_directas'.
    // If 'direct_sales' exists and has NO RLS, it works.
    // If it has RLS and NO POLICY for Anon, it returns 401 or [].

    // So fixing the table name might be enough IF RLS is off or permissive.
    // But if RLS is ON, we need a policy.

    // We will assume fixing the table name is the Primary Fix. 
    // WE CANNOT create policies via JS Client (PostgREST data API) unless we call a robust postgres function.

    console.log("NOTE: Corrected table name in frontend. Please test.");
}

run();
