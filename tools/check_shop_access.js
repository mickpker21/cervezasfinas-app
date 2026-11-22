
import { createClient } from "@supabase/supabase-js";

// Credentials from Shop .env (Anon Key)
const supabaseUrl = 'https://eskqnlzcswxszlicjppe.supabase.co';
const supabaseAnon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVza3FubHpjc3d4c3psaWNqcHBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwNDUxMTksImV4cCI6MjA2ODYyMTExOX0.ijvDFQu4aE0UjzRey55rZsCiM8dhEGiuyRLs-C_e7VE';

const supabase = createClient(supabaseUrl, supabaseAnon);

async function run() {
    console.log("Testing public access to 'precios'...");

    // Check 'precios'
    const { data: pData, error: pError } = await supabase.from('precios').select('count', { count: 'exact', head: true });
    console.log("Precios Count (Anon):", pData, pError?.message || 'OK');

    // Check 'cat_marcas'
    const { data: cData, error: cError } = await supabase.from('cat_marcas').select('count', { count: 'exact', head: true });
    console.log("Cat_marcas Count (Anon):", cData, cError?.message || 'OK');

    // Check 'direct_sales_items' structure (to see if des_marca exists)
    const { data: iData } = await supabase.from('direct_sales_items').select('*').limit(1);
    console.log("DirectSalesItem Sample:", iData?.[0]);
}

run();
