
async function compareSources() {
  const shopUrl = 'https://cervezasfinas.com/api/shop/products/list.php';
  const supabaseUrl = 'https://eskqnlzcswxszlicjppe.supabase.co/rest/v1/precios';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVza3FubHpjc3d4c3psaWNqcHBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwNDUxMTksImV4cCI6MjA2ODYyMTExOX0.ijvDFQu4aE0UjzRey55rZsCiM8dhEGiuyRLs-C_e7VE';

  console.log("--- Comparación de Fuentes ---");

  try {
    // 1. Supabase Count
    const resSup = await fetch(`${supabaseUrl}?select=count`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Prefer': 'count=exact' } });
    console.log("Supabase (precios) Total:", resSup.headers.get('content-range'));

    // 2. Shop API (BASE_SYNC)
    const resBase = await fetch(`${shopUrl}?client_code=BASE_SYNC&limit=1000`);
    const jsonBase = await resBase.json();
    console.log("Shop API (BASE_SYNC) Total:", jsonBase.data?.length || 0);

    // 3. Shop API (CLIENTE REAL)
    const resClient = await fetch(`${shopUrl}?client_code=6fe93afc-c7ef-45b8-aff0-dd263f84ce80&limit=1000`);
    const jsonClient = await resClient.json();
    console.log("Shop API (CLIENTE REAL) Total:", jsonClient.data?.length || 0);

    // Check SKU 7214 in all
    console.log("\n--- Búsqueda de SKU 7214 ---");
    const inSup = (await (await fetch(`${supabaseUrl}?cve_marca=eq.7214`, { headers: { apikey: supabaseKey } })).json()).length > 0;
    const inBase = (jsonBase.data || []).some(p => p.sku === '7214');
    const inClient = (jsonClient.data || []).some(p => p.sku === '7214');

    console.log("¿Está en Supabase?", inSup);
    console.log("¿Está en Shop (BASE_SYNC)?", inBase);
    console.log("¿Está en Shop (CLIENTE REAL)?", inClient);

  } catch (e) {
    console.error("Error en comparación:", e.message);
  }
}

compareSources();
