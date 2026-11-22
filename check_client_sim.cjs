
async function checkClient() {
  const url = 'https://cervezasfinas.com/api/clients-read.php?id=6fe93afc-c7ef-45b8-aff0-dd263f84ce80';

  try {
    const response = await fetch(url);
    const json = await response.json();
    console.log("--- CLIENT DATA ---");
    console.log(JSON.stringify(json.data?.[0], null, 2));
  } catch (err) {
    console.error("Error fetching client:", err.message);
  }
}

checkClient();
