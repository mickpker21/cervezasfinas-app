
async function checkShopApi(clientCode, query) {
  const urlBase = 'https://cervezasfinas.com/api/shop/products/list.php';
  const url = `${urlBase}?client_code=${clientCode}&limit=1000&offset=0&_t=${Date.now()}`;

  console.log(`\n--- Calling Shop API for: ${clientCode} ---`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
        console.error(`Error: ${response.status} ${response.statusText}`);
        return;
    }
    
    const json = await response.json();
    if (!json.success) {
        console.error('API Error:', json.error);
        return;
    }

    console.log(`Total items in response: ${json.data?.length || 0}`);
    
    const matches = (json.data || []).filter(p => 
        (p.sku && p.sku.includes(query)) || 
        (p.name && p.name.toLowerCase().includes(query.toLowerCase()))
    );

    console.log(`Matches for "${query}":`, JSON.stringify(matches, null, 2));

  } catch (err) {
    console.error('Failed to fetch:', err.message);
  }
}

async function run() {
  // Use 'BASE_SYNC' like the app does for catalogue
  await checkShopApi('BASE_SYNC', '72');
  // Use the actual client from the screenshot
  await checkShopApi('6fe93afc-c7ef-45b8-aff0-dd263f84ce80', '72');
}

run();
