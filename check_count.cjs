
async function checkCount() {
  const urlBase = 'https://eobqozqjyytkzyuyzqjz.supabase.co/rest/v1';
  const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvYnFvem9qeXl0a3p5dXl6cWp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg3NjcyMDQsImV4cCI6MjA1NDM0MzIwNH0.8zV6U9-Vp7_v3sS-X9_1_o_E_V_O_N_E_R_Y_E_A_R';

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
    
    const countRange = response.headers.get('content-range');
    console.log('Content-Range:', countRange);
  } catch (err) {
    console.error('Failed to get count:', err.message);
  }
}

checkCount();
