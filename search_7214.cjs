
async function searchSku7214() {
  const url = 'https://cervezasfinas.com/api/shop/products/list.php?client_code=6fe93afc-c7ef-45b8-aff0-dd263f84ce80&limit=2000';

  try {
    const response = await fetch(url);
    const json = await response.json();
    const matches = json.data.filter(x => x.sku === '7214' || x.cve_marca === '7214');
    console.log("--- MATCHES FOR SKU 7214 ---");
    console.log(JSON.stringify(matches, null, 2));
  } catch (err) {
    console.error("Error searching SKU:", err.message);
  }
}

searchSku7214();
