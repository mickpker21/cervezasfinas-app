
async function checkShopPricing() {
  const url = 'https://cervezasfinas.com/api/shop/products/sync_pricing.php';

  try {
    const response = await fetch(url);
    const json = await response.json();
    console.log("--- SHOP PRICING RULES ---");
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error("Error fetching shop pricing:", err.message);
  }
}

checkShopPricing();
