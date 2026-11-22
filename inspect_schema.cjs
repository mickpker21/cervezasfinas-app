
async function inspectSchema() {
  const urlBase = 'https://eskqnlzcswxszlicjppe.supabase.co/rest/v1';
  const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVza3FubHpjc3d4c3psaWNqcHBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwNDUxMTksImV4cCI6MjA2ODYyMTExOX0.ijvDFQu4aE0UjzRey55rZsCiM8dhEGiuyRLs-C_e7VE';

  try {
    const url = `${urlBase}/precios?limit=1`;
    const response = await fetch(url, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!response.ok) {
        console.error(`Error: ${response.status} ${response.statusText}`);
        return;
    }
    
    const data = await response.json();
    console.log('Sample row from "precios":', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to fetch:', err.message);
  }
}

inspectSchema();
