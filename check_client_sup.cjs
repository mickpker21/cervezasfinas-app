
async function checkClientSupabase() {
  const urlBase = 'https://eskqnlzcswxszlicjppe.supabase.co/rest/v1';
  const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVza3FubHpjc3d4c3psaWNqcHBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwNDUxMTksImV4cCI6MjA2ODYyMTExOX0.ijvDFQu4aE0UjzRey55rZsCiM8dhEGiuyRLs-C_e7VE';

  try {
    const response = await fetch(`${urlBase}/clients?id=eq.6fe93afc-c7ef-45b8-aff0-dd263f84ce80&select=name,gec,level`, {
      headers: { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` }
    });
    const data = await response.json();
    console.log("--- CLIENT DATA (SUPABASE) ---");
    console.log(JSON.stringify(data?.[0], null, 2));
  } catch (err) {
    console.error("Error fetching client:", err.message);
  }
}

checkClientSupabase();
