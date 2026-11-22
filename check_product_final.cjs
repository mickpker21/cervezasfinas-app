
async function checkProductFinal() {
  const url = 'https://cervezasfinas.com/api/shop/products/list.php?client_code=6fe93afc-c7ef-45b8-aff0-dd263f84ce80&limit=1000';

  try {
    const response = await fetch(url);
    const json = await response.json();
    const p = json.data.find(x => x.sku === '7214');
    console.log("--- PRODUCT FINAL (MYSQL) ---");
    console.log(JSON.stringify(p, null, 2));
  } catch (err) {
    console.error("Error fetching product:", err.message);
  }
}

checkProductFinal();
