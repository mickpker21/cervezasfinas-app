
async function checkGlobalShop() {
  const urlBase = 'https://cervezasfinas.com/api/shop/products/list.php';
  // Try with NO client_code
  const url = `${urlBase}?limit=1000&offset=0&_t=${Date.now()}`;

  console.log(`\n--- Calling GLOBAL Shop API (No client_code) ---`);
  
  try {
    const response = await fetch(url);
    const json = await response.json();
    console.log(`Total items in response: ${json.data?.length || 0}`);
    
    // Check for 7214
    const found = (json.data || []).find(p => p.sku === '7214');
    console.log(`Found SKU 7214? ${!!found}`);
  } catch (err) {
    console.error('Failed to fetch:', err.message);
  }
}

checkGlobalShop();
