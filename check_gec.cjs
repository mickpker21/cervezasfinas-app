
async function checkGecRules() {
  const urlBase = 'https://eskqnlzcswxszlicjppe.supabase.co/rest/v1';
  const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVza3FubHpjc3d4c3psaWNqcHBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwNDUxMTksImV4cCI6MjA2ODYyMTExOX0.ijvDFQu4aE0UjzRey55rZsCiM8dhEGiuyRLs-C_e7VE';

  try {
    const response = await fetch(`${urlBase}/gec_discounts`, {
      headers: { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` }
    });
    const data = await response.json();
    console.log("--- GEC DISCOUNTS ---");
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error fetching GEC rules:", err.message);
  }
}

checkGecRules();
