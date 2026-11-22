
async function checkSku(sku) {
  const urlBase = 'https://eobqozqjyytkzyuyzqjz.supabase.co/rest/v1';
  const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvYnFvem9qeXl0a3p5dXl6cWp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg3NjcyMDQsImV4cCI6MjA1NDM0MzIwNH0.8zV6U9-Vp7_v3sS-X9_1_o_E_V_O_N_E_R_Y_E_A_R';

  console.log(`\n--- Searching SKU: ${sku} ---`);
  
  const tables = ['precios', 'products'];
  
  for (const table of tables) {
    try {
      const url = `${urlBase}/${table}?sku=like.*${sku}*&select=*`;
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
  await checkSku('72');
  await checkSku('7214');
}

run();
