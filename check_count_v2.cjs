
async function checkCount() {
  const urlBase = 'https://eskqnlzcswxszlicjppe.supabase.co/rest/v1';
  const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVza3FubHpjc3d4c3psaWNqcHBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwNDUxMTksImV4cCI6MjA2ODYyMTExOX0.ijvDFQu4aE0UjzRey55rZsCiM8dhEGiuyRLs-C_e7VE';

  try {
    const url = `${urlBase}/precios?select=count`;
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Prefer': 'count=exact'
      }
    });
    
    console.log('Status:', response.status);
    const countRange = response.headers.get('content-range');
    console.log('Content-Range:', countRange);
  } catch (err) {
    console.error('Failed to get count:', err.message);
  }
}

checkCount();
