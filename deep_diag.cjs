
async function diagnostic() {
  const url = 'https://eobqozqjyytkzyuyzqjz.supabase.co/rest/v1';
  const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvYnFvem9qeXl0a3p5dXl6cWp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg3NjcyMDQsImV4cCI6MjA1NDM0MzIwNH0.8zV6U9-Vp7_v3sS-X9_1_o_E_V_O_N_E_R_Y_E_A_R';

  console.log("--- Diagnostic Start ---");
  
  try {
    // 1. Check all table names via PostgREST schema (if possible)
    // 2. Search SKU 7214 in 'precios'
    const resPrecios = await fetch(`${url}/precios?sku=eq.7214&select=*`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const dataPrecios = await resPrecios.json();
    console.log("SKU 7214 in precios:", dataPrecios);

    // 3. Search SKU 7214 in 'products'
    const resProducts = await fetch(`${url}/products?sku=eq.7214&select=*`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const dataProducts = await resProducts.json();
    console.log("SKU 7214 in products:", dataProducts);

    // 4. Try 'cve_marca' instead of 'sku'
    const resCve = await fetch(`${url}/precios?cve_marca=eq.7214&select=*`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const dataCve = await resCve.json();
    console.log("SKU 7214 in precios (cve_marca):", dataCve);

  } catch (e) {
    console.error("DIAGNOSTIC FAILED:", e.message);
  }
}

diagnostic();
