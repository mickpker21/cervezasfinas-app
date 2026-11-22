
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://eobqozqjyytkzyuyzqjz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvYnFvem9qeXl0a3p5dXl6cWp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg3NjcyMDQsImV4cCI6MjA1NDM0MzIwNH0.8zV6U9-Vp7_v3sS-X9_1_o_E_V_O_N_E_R_Y_E_A_R' 
);

async function checkSku(sku) {
  console.log(`Checking SKU: ${sku}...`);
  try {
    const { data: preco, error: precoError } = await supabase
      .from('precios')
      .select('*')
      .filter('sku', 'like', `%${sku}%`);
    
    if (precoError) throw precoError;
    console.log('Results in "precios" table:', JSON.stringify(preco, null, 2));

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .filter('sku', 'like', `%${sku}%`);
    
    if (productError) throw productError;
    console.log('Results in "products" table:', JSON.stringify(product, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkSku('72');
checkSku('7214');
