import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const schemaPath = path.join(rootDir, 'sql', 'schema.sql');

async function readJson(name) {
  try {
    const filePath = path.join(dataDir, `${name}.json`);
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function applySchema(connection) {
  const sql = await fs.readFile(schemaPath, 'utf-8');
  await connection.query(sql);
}

async function seedStores(connection, stores) {
  if (!stores.length) return;
  for (const store of stores) {
    await connection.execute(
      `INSERT INTO stores (code, name, address, manager_email, max_capacity, min_capacity)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         address = VALUES(address),
         manager_email = VALUES(manager_email),
         max_capacity = VALUES(max_capacity),
         min_capacity = VALUES(min_capacity)`,
      [
        store.code,
        store.name,
        store.address || null,
        store.managerEmail || null,
        store.maxCapacity ?? null,
        store.minCapacity ?? null
      ]
    );
  }
}

async function seedProducts(connection, products) {
  if (!products.length) return;
  for (const product of products) {
    await connection.execute(
      `INSERT INTO products (sku, name, category, uom, active)
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         category = VALUES(category),
         uom = VALUES(uom),
         active = VALUES(active)`,
      [product.sku, product.name, product.category || null, product.uom || 'caja']
    );
  }
}

async function fetchStoreIds(connection, codes) {
  if (!codes.length) return new Map();
  const [rows] = await connection.query(
    `SELECT id, code FROM stores WHERE code IN (?)`,
    [codes]
  );
  return new Map(rows.map((row) => [row.code, row.id]));
}

async function fetchProductIds(connection, skus) {
  if (!skus.length) return new Map();
  const [rows] = await connection.query(
    `SELECT id, sku FROM products WHERE sku IN (?)`,
    [skus]
  );
  return new Map(rows.map((row) => [row.sku, row.id]));
}

async function seedInventory(connection, inventory, storeMap, productMap) {
  if (!inventory.length) return;
  for (const item of inventory) {
    const storeId = storeMap.get(item.storeCode);
    const productId = productMap.get(item.sku);
    if (!storeId || !productId) {
      console.warn(`⚠️  No se encontró store/producto para ${item.storeCode} / ${item.sku}`);
      continue;
    }
    await connection.execute(
      `INSERT INTO inventories (store_id, product_id, on_hand, reserved, max_level, min_level)
       VALUES (?, ?, ?, 0, ?, ?)
       ON DUPLICATE KEY UPDATE
         on_hand = VALUES(on_hand),
         max_level = VALUES(max_level),
         min_level = VALUES(min_level)`,
      [
        storeId,
        productId,
        Number(item.onHand ?? 0),
        item.maxLevel ?? null,
        item.minLevel ?? null
      ]
    );
  }
}

async function ensureIndexes(connection) {
  const indexes = [
    {
      table: 'inventory_movements',
      name: 'idx_movements_store_created',
      definition: '(store_id, created_at DESC)'
    },
    {
      table: 'orders',
      name: 'idx_orders_store_status',
      definition: '(store_id, status)'
    },
    {
      table: 'planograms',
      name: 'idx_planograms_store_version',
      definition: '(store_id, version DESC)'
    }
  ];

  for (const index of indexes) {
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS count
         FROM information_schema.statistics
        WHERE table_schema = ?
          AND table_name = ?
          AND index_name = ?`,
      [env.MYSQL_DATABASE, index.table, index.name]
    );

    if (!rows[0].count) {
      await connection.query(
        `ALTER TABLE ${index.table} ADD INDEX ${index.name} ${index.definition}`
      );
    }
  }
}

async function main() {
  console.log('🔌 Conectando a MySQL...');
  const connection = await mysql.createConnection({
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    database: env.MYSQL_DATABASE,
    multipleStatements: true
  });

  try {
    console.log('📐 Aplicando schema.sql');
    await applySchema(connection);
    await ensureIndexes(connection);

    const [stores, products, inventory] = await Promise.all([
      readJson('stores'),
      readJson('products'),
      readJson('inventory')
    ]);

    console.log(`🏬 Sembrando ${stores.length} tiendas base`);
    await seedStores(connection, stores);

    console.log(`📦 Sembrando ${products.length} productos base`);
    await seedProducts(connection, products);

    const storeCodesFromInventory = inventory.map((i) => i.storeCode).filter(Boolean);
    const storeCodesFromStores = stores.map((s) => s.code).filter(Boolean);
    const uniqueStoreCodes = [...new Set([...storeCodesFromInventory, ...storeCodesFromStores])];

    const skusFromInventory = inventory.map((i) => i.sku).filter(Boolean);
    const skusFromProducts = products.map((p) => p.sku).filter(Boolean);
    const uniqueSkus = [...new Set([...skusFromInventory, ...skusFromProducts])];

    const [storeMap, productMap] = await Promise.all([
      fetchStoreIds(connection, uniqueStoreCodes),
      fetchProductIds(connection, uniqueSkus)
    ]);

    console.log(`📊 Sembrando ${inventory.length} registros de inventario`);
    await seedInventory(connection, inventory, storeMap, productMap);

    console.log('✅ Base UM6 lista. Ya puedes arrancar `npm run dev`.');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('⛔️ No se pudo preparar la base UM6.');
  if (error.code === 'ECONNREFUSED') {
    console.error('MySQL rechazó la conexión. Verifica host, puerto y que el servicio acepte conexiones remotas.');
  } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('Credenciales MySQL inválidas. Revisa usuario/contraseña en backend/um6-pos/.env');
  } else if (error.code === 'ENOTFOUND') {
    console.error('No se pudo resolver el host de MySQL. Confirma el nombre del servidor en tu panel (Hostinger suele usar srvXXXX.hstgr.io).');
  } else {
    console.error(error);
  }
  process.exit(1);
});
