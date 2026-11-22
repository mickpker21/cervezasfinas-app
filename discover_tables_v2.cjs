
async function discoverTables() {
  const urlBase = 'https://eskqnlzcswxszlicjppe.supabase.co/rest/v1';
  const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVza3FubHpjc3d4c3psaWNqcHBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwNDUxMTksImV4cCI6MjA2ODYyMTExOX0.ijvDFQu4aE0UjzRey55rZsCiM8dhEGiuyRLs-C_e7VE';

  const potentialTables = ['products', 'marcas', 'catalogo', 'items', 'catalog', 'stock', 'list_precios'];
  
  console.log("--- Discovering Tables ---");
  
  for (const table of potentialTables) {
    try {
      const url = `${urlBase}/${table}?limit=1`;
      const response = await fetch(url, {
        headers: {
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      if (response.ok) {
        console.log(`[FOUND] Table: ${table}`);
      } else {
        // console.log(`[NOT FOUND] ${table} (${response.status})`);
      }
    } catch (err) {
      // console.error(`Error checking ${table}:`, err.message);
    }
  }
}

discoverTables();
