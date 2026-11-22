
async function checkSku(sku) {
  const urlBase = 'https://eskqnlzcswxszlicjppe.supabase.co/rest/v1';
  const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVza3FubHpjc3d4c3psaWNqcHBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwNDUxMTksImV4cCI6MjA2ODYyMTExOX0.ijvDFQu4aE0UjzRey55rZsCiM8dhEGiuyRLs-C_e7VE';

  console.log(`\n--- Searching SKU: ${sku} ---`);
  
  const tables = ['precios', 'products'];
  
  for (const table of tables) {
    try {
      const url = `${urlBase}/${table}?sku=eq.${sku}&select=*`;
      const response = await fetch(url, {
        headers: {
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      if (!response.ok) {
        console.error(`Error in ${table}: ${response.status} ${response.statusText}`);
        continue;
      }
      
      const data = await response.json();
      console.log(`Results in "${table}":`, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error(`Failed to fetch from ${table}:`, err.message);
    }
  }
}

async function run() {
  await checkSku('7214');
  await checkSku('726');
}

run();
