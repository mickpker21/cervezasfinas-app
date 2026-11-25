import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

let db = null;
let isMock = false;
let initPromise = null;

const DB_NAME = 'cervezasfinas.db';
const sqliteConnection = new SQLiteConnection(CapacitorSQLite);

export function initLocalDb() {
  if (db) return Promise.resolve(db);
  if (initPromise) return initPromise;

  initPromise = initializeLocalDb().catch((err) => {
    initPromise = null;
    throw err;
  });
  return initPromise;
}

async function initializeLocalDb() {
  console.log('[localDb] initLocalDb llamado');

  // Debug platform
  const platform = Capacitor.getPlatform();
  const isNative = Capacitor.isNativePlatform();
  console.log(`[localDb] Platform detected: ${platform}, isNative: ${isNative}`);

  if (!isNative) {
    console.log('[localDb] Inicializando almacenamiento persistente para PC/Web (IndexedDB + Disco Electron)...');
    db = await createMockDb();
    isMock = true;
    return db;
  }

  try {
    console.log('[localDb] Intentando inicializar SQLite nativo...');
    // En una recarga OTA puede quedar una conexión nativa abierta por el
    // bundle anterior; sincronizar primero el registro de conexiones.
    try {
      await sqliteConnection.checkConnectionsConsistency();
    } catch (e) {
      console.warn('[localDb] No se pudo sincronizar el registro de conexiones SQLite:', e);
    }

    const { result: connectionExists } = await sqliteConnection.isConnection(DB_NAME, false);
    const connection = connectionExists
      ? await sqliteConnection.retrieveConnection(DB_NAME, false)
      : await sqliteConnection.createConnection(DB_NAME, false, 'no-encryption', 1, false);

    const isDBOpen = (await connection.isDBOpen()).result;
    if (!isDBOpen) {
      console.log('[localDb] Abriendo conexión SQLite...');
      await connection.open();
    } else {
      console.log('[localDb] Conexión SQLite ya estaba abierta, reutilizando de forma segura.');
    }
    db = connection;

    console.log('[localDb] Creando tablas si no existen...');
    await createTables(db);

    console.log('[localDb] Base de datos local inicializada (SQLite)');
    return db;
  } catch (err) {
    console.warn('[localDb] SQLite nativo no disponible en este dispositivo, usando IndexedDB persistente como respaldo seguro:', err);
    try {
      db = await createMockDb();
      isMock = true;
      console.log('[localDb] Respaldo persistente IndexedDB inicializado correctamente.');
      return db;
    } catch (fallbackErr) {
      console.error('[localDb] Error CRÍTICO inicializando respaldo IndexedDB:', fallbackErr);
      db = null;
      isMock = false;
      throw new Error(`No se pudo abrir el almacenamiento local seguro de la APK: ${err?.message || err}`);
    }
  }
}

async function createTables(database) {
  const schema = `
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      client_code TEXT,
      name TEXT,
      business_name TEXT,
      contact TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      cross_street TEXT,
      exterior_number TEXT,
      interior_number TEXT,
      colony TEXT,
      postal_code TEXT,
      city TEXT,
      state TEXT,
      reference TEXT,
      coords TEXT,
      sales_route TEXT,
      internal_route TEXT,
      visit_days TEXT,
      visit_day_televenta TEXT,
      zona_comercial TEXT,
      region TEXT,
      gec TEXT,
      level TEXT,
      cadena TEXT,
      exclusivity TEXT,
      client_type TEXT,
      enfriador TEXT,
      cooler_serials TEXT,
      notes TEXT,
      owner_id TEXT,
      created_by TEXT,
      created_at TEXT,
      updated_at TEXT,
      -- Fiscal fields
      rfc TEXT,
      fiscal_name TEXT,
      fiscal_address TEXT,
      fiscal_colony TEXT,
      fiscal_postal_code TEXT,
      cedula_ieps TEXT,
      -- Sales config
      sales_modality TEXT,
      ritmo TEXT,
      -- Utility columns (kept for app logic)
      synced INTEGER DEFAULT 1,
      lat REAL,
      lng REAL
    );

    CREATE TABLE IF NOT EXISTS visitas (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      client_code TEXT,
      business_name TEXT,
      cliente_nombre TEXT,
      user_id TEXT,
      fecha TEXT,
      hora TEXT,
      ruta TEXT,
      motivo TEXT,
      notes TEXT,
      photo_fachada TEXT,
      photo_interior TEXT,
      photo_enfriador TEXT,
      lat REAL,
      lng REAL,
      inventory TEXT,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS evaluaciones_pdv (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      user_id TEXT,
      fecha TEXT,
      payload TEXT,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS evaluaciones (
      id TEXT PRIMARY KEY,
      tienda_id TEXT,
      fecha TEXT,
      tipo TEXT,
      payload TEXT,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS pending_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT,
      operation TEXT,
      payload TEXT,
      created_at TEXT,
      retry_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ventas_por_sku (
      id TEXT PRIMARY KEY,
      cve_cliente TEXT,
      cve_marca TEXT,
      htls_total REAL,
      fecha TEXT,
      zona TEXT,
      ruta TEXT,
      num_remision TEXT,
      unidades REAL,
      precio_venta_marca REAL,
      venta REAL,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS metas_venta (
      id TEXT PRIMARY KEY,
      sales_route TEXT,
      period_date TEXT,
      meta REAL,
      meta_clientes REAL DEFAULT 0,
      meta_clientes_1htl REAL DEFAULT 0,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS metas_zona (
      id TEXT PRIMARY KEY,
      zona TEXT,
      period_date TEXT,
      meta REAL,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sku_descripcion (
      cve_marca TEXT PRIMARY KEY,
      descripcion TEXT,
      marca TEXT
    );

    CREATE TABLE IF NOT EXISTS sku_images (
      sku TEXT PRIMARY KEY,
      image_url TEXT
    );

    CREATE TABLE IF NOT EXISTS Canal (
      cve_cliente TEXT PRIMARY KEY,
      canal TEXT
    );

    CREATE TABLE IF NOT EXISTS supervisor_allowed_routes (
      supervisor_id TEXT,
      route TEXT,
      PRIMARY KEY (supervisor_id, route)
    );

    CREATE TABLE IF NOT EXISTS supervisor_allowed_sales_routes (
      supervisor_id TEXT,
      sales_route TEXT,
      PRIMARY KEY (supervisor_id, sales_route)
    );

    CREATE TABLE IF NOT EXISTS supervisor_allowed_zonas (
      supervisor_id TEXT,
      zona TEXT,
      PRIMARY KEY (supervisor_id, zona)
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      serial TEXT UNIQUE,
      type TEXT,
      status TEXT,
      brand TEXT,
      model TEXT,
      qr_value TEXT,
      warehouse_id TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      name TEXT,
      address TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS asset_types (
      name TEXT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS current_asset_locations (
      asset_id TEXT PRIMARY KEY,
      asset_serial TEXT,
      asset_type TEXT,
      client_id TEXT,
      action TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS installation_orders (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      destination_client_id TEXT,
      action TEXT,
      assigned_to TEXT,
      created_by TEXT,
      status TEXT,
      notes TEXT,
      created_at TEXT,
      synced INTEGER DEFAULT 0,
      client_name_cached TEXT,
      client_address_cached TEXT,
      destination_client_name_cached TEXT,
      destination_client_address_cached TEXT,
      client_business_name_cached TEXT,
      destination_client_business_name_cached TEXT,
      client_lat REAL,
      client_lng REAL,
      client_coords TEXT,
      destination_client_lat REAL,
      destination_client_lng REAL,
      destination_client_coords TEXT
    );

    CREATE TABLE IF NOT EXISTS supervisor_onboard_supervisions (
      id TEXT PRIMARY KEY,
      supervisor_id TEXT,
      supervisor_name TEXT,
      route_name TEXT,
      vendedor_id TEXT,
      vendedor_name TEXT,
      start_at TEXT,
      end_at TEXT,
      checklist_data TEXT,
      status TEXT,
      score REAL,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS supervisor_onboard_visits (
      id TEXT PRIMARY KEY,
      supervision_id TEXT,
      client_id TEXT,
      client_name TEXT,
      client_code TEXT,
      survey_data TEXT,
      evaluation_pdv_id TEXT,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS installation_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT,
      asset_id TEXT,
      asset_type TEXT,
      asset_serial TEXT,
      quantity INTEGER,
      condition_status TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS truck_inventory (
      user_id TEXT,
      cve_marca TEXT,
      quantity INTEGER,
      updated_at TEXT,
      PRIMARY KEY (user_id, cve_marca)
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, 
      cve_marca TEXT,
      des_marca TEXT,
      name TEXT,
      price REAL,
      image_url TEXT,
      family TEXT,
      presentation TEXT,
      brand TEXT,
      unit_metric TEXT,
      display INTEGER,
      returnable_factor REAL,
      created_at TEXT
    );

    -- Pricing Tables
    CREATE TABLE IF NOT EXISTS gec_discounts (
       id INTEGER PRIMARY KEY,
       gec_level TEXT,
       discount_percentage REAL
    );

    CREATE TABLE IF NOT EXISTS promotions (
       id INTEGER PRIMARY KEY,
       name TEXT,
       discount_amount REAL,
       start_date TEXT,
       end_date TEXT,
       is_active INTEGER,
       skus TEXT,
       zones TEXT,
       promo_type TEXT,
       buy_n INTEGER,
       pay_m INTEGER
    );

    CREATE TABLE IF NOT EXISTS surcharges_config (
       id INTEGER PRIMARY KEY,
       returnable_amount REAL,
       disposable_amount REAL
    );

    CREATE TABLE IF NOT EXISTS special_prices (
       client_code TEXT,
       sku TEXT,
       special_price REAL,
       start_date TEXT,
       end_date TEXT
    );

    CREATE TABLE IF NOT EXISTS stock_requests (
      id TEXT PRIMARY KEY,
      driver_id TEXT,
      status TEXT,
      items TEXT,
      created_at TEXT,
      updated_at TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS direct_sales (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      client_id TEXT,
      total_amount REAL,
      status TEXT,
      payment_method TEXT,
      created_at TEXT,
      synced INTEGER DEFAULT 0,
      gec_discount REAL DEFAULT 0,
      promo_discount REAL DEFAULT 0,
      cargo TEXT
    );

    CREATE TABLE IF NOT EXISTS direct_sales_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT,
      cve_marca TEXT,
      quantity INTEGER,
      unit_price REAL,
      total_price REAL,
      des_marca TEXT
    );

    -- HR MODULE TABLES --
    CREATE TABLE IF NOT EXISTS hr_audit (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      action TEXT,
      target TEXT,
      details TEXT,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS hr_attendance (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      type TEXT,
      timestamp TEXT,
      lat REAL,
      lng REAL,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS hr_commissions_rules (
      id TEXT PRIMARY KEY,
      role TEXT,
      kpi TEXT,
      threshold REAL,
      payout_factor REAL,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS hr_gamification (
      user_id TEXT PRIMARY KEY,
      xp INTEGER,
      level INTEGER,
      badges TEXT,
      streak INTEGER,
      updated_at TEXT
    );
  `;

  await database.execute(schema);

  // ... existing products table creation ...
  await database.execute(`
    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        cve_marca TEXT,
        des_marca TEXT,
        name TEXT,
        price REAL,
        image_url TEXT,
        family TEXT,
        presentation TEXT,
        brand TEXT,
        unit_metric TEXT,
        display TEXT,
        returnable_factor REAL DEFAULT 0,
        created_at TEXT
    );
  `);

  // === PRICING TABLES FOR OFFLINE CALCULATION ===
  await database.execute(`
    CREATE TABLE IF NOT EXISTS gec_discounts (
        gec_level TEXT PRIMARY KEY,
        discount_percentage REAL
    );
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS promotions (
        id INTEGER PRIMARY KEY,
        name TEXT,
        discount_amount REAL,
        start_date TEXT,
        end_date TEXT,
        is_active INTEGER,
        skus TEXT,
        zones TEXT,
        promo_type TEXT,
        buy_n INTEGER,
        pay_m INTEGER
    );
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS special_prices (
        id INTEGER PRIMARY KEY, 
        client_code TEXT,
        sku TEXT,
        special_price REAL,
        start_date TEXT,
        end_date TEXT,
        zone TEXT
    );
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS surcharges_config (
        id INTEGER PRIMARY KEY,
        returnable_amount REAL,
        disposable_amount REAL
    );
  `);

  await database.execute(`CREATE INDEX IF NOT EXISTS idx_special_prices_client_sku ON special_prices(client_code, sku);`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_clients_sales_route ON clients(sales_route);`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_clients_internal_route ON clients(internal_route);`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_clients_client_code ON clients(client_code);`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas_por_sku(fecha);`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_ventas_ruta ON ventas_por_sku(ruta);`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_metas_sales_route ON metas_venta(sales_route);`);

  // Migraciones simples para agregar columnas si no existen (idempotente via try/catch o check)
  try {
    const columnsToAdd = [
      'ALTER TABLE visitas ADD COLUMN client_code TEXT;',
      'ALTER TABLE visitas ADD COLUMN business_name TEXT;',
      'ALTER TABLE visitas ADD COLUMN cliente_nombre TEXT;',
      'ALTER TABLE visitas ADD COLUMN fecha TEXT;',
      'ALTER TABLE visitas ADD COLUMN hora TEXT;',
      'ALTER TABLE visitas ADD COLUMN ruta TEXT;',
      'ALTER TABLE visitas ADD COLUMN motivo TEXT;',
      'ALTER TABLE visitas ADD COLUMN photo_fachada TEXT;',
      'ALTER TABLE visitas ADD COLUMN photo_interior TEXT;',
      'ALTER TABLE visitas ADD COLUMN photo_enfriador TEXT;',
      'ALTER TABLE visitas ADD COLUMN lat REAL;',
      'ALTER TABLE visitas ADD COLUMN lng REAL;',
      // Migraciones para evaluaciones_pdv
      'ALTER TABLE evaluaciones_pdv ADD COLUMN payload TEXT;',
      'ALTER TABLE evaluaciones_pdv ADD COLUMN synced INTEGER DEFAULT 0;',
      // Migraciones para evaluaciones (Canal Moderno)
      'ALTER TABLE evaluaciones ADD COLUMN payload TEXT;',
      'ALTER TABLE evaluaciones ADD COLUMN synced INTEGER DEFAULT 0;',
      // Migraciones para clientes (Zona & Televenta)
      'ALTER TABLE clients ADD COLUMN region TEXT;',
      'ALTER TABLE clients ADD COLUMN zona_comercial TEXT;',
      'ALTER TABLE clients ADD COLUMN visit_day_televenta TEXT;',
      'ALTER TABLE clients ADD COLUMN cadena TEXT;',
      // Migraciones para Clientes (Visit Day - User Requested)
      'ALTER TABLE clients ADD COLUMN visit_days TEXT;',
      // Migraciones para Inventory & Requests
      'CREATE TABLE IF NOT EXISTS truck_inventory (user_id TEXT, cve_marca TEXT, quantity INTEGER, updated_at TEXT, PRIMARY KEY (user_id, cve_marca));',
      'CREATE TABLE IF NOT EXISTS stock_requests (id TEXT PRIMARY KEY, driver_id TEXT, status TEXT, items TEXT, created_at TEXT, updated_at TEXT, synced INTEGER DEFAULT 0);',
      // Migraciones para Direct Sales
      'CREATE TABLE IF NOT EXISTS direct_sales (id TEXT PRIMARY KEY, user_id TEXT, client_id TEXT, total_amount REAL, status TEXT, payment_method TEXT, created_at TEXT, synced INTEGER DEFAULT 0);',
      'ALTER TABLE direct_sales ADD COLUMN promo_discount REAL DEFAULT 0;',
      'ALTER TABLE direct_sales ADD COLUMN gec_discount REAL DEFAULT 0;',
      'ALTER TABLE direct_sales ADD COLUMN cargo TEXT;',
      'CREATE TABLE IF NOT EXISTS direct_sales_items (id TEXT PRIMARY KEY, sale_id TEXT, cve_marca TEXT, quantity INTEGER, unit_price REAL, total_price REAL, des_marca TEXT);',
      // Schema Correction Migrations
      'ALTER TABLE clients ADD COLUMN coords TEXT;',
      'ALTER TABLE clients ADD COLUMN gec TEXT;',
      'ALTER TABLE clients ADD COLUMN client_type TEXT;',
      'ALTER TABLE clients ADD COLUMN enfriador TEXT;',
      'ALTER TABLE clients ADD COLUMN owner_id TEXT;',
      'ALTER TABLE clients ADD COLUMN created_by TEXT;',
      'ALTER TABLE clients ADD COLUMN created_at TEXT;',
      // New address breakdown fields
      'ALTER TABLE clients ADD COLUMN cross_street TEXT;',
      'ALTER TABLE clients ADD COLUMN exterior_number TEXT;',
      'ALTER TABLE clients ADD COLUMN interior_number TEXT;',
      'ALTER TABLE clients ADD COLUMN colony TEXT;',
      'ALTER TABLE clients ADD COLUMN postal_code TEXT;',
      'ALTER TABLE clients ADD COLUMN city TEXT;',
      'ALTER TABLE clients ADD COLUMN state TEXT;',
      'ALTER TABLE clients ADD COLUMN reference TEXT;',
      // Fiscal fields
      'ALTER TABLE clients ADD COLUMN rfc TEXT;',
      'ALTER TABLE clients ADD COLUMN fiscal_name TEXT;',
      'ALTER TABLE clients ADD COLUMN fiscal_address TEXT;',
      'ALTER TABLE clients ADD COLUMN fiscal_colony TEXT;',
      'ALTER TABLE clients ADD COLUMN fiscal_postal_code TEXT;',
      'ALTER TABLE clients ADD COLUMN cedula_ieps TEXT;',
      // Sales config
      'ALTER TABLE clients ADD COLUMN sales_modality TEXT;',
      'ALTER TABLE clients ADD COLUMN ritmo TEXT;',
      // Pricing Features Migrations
      'ALTER TABLE products ADD COLUMN returnable_factor REAL DEFAULT 0;',
      'ALTER TABLE promotions ADD COLUMN zones TEXT;',
      'ALTER TABLE promotions ADD COLUMN promo_type TEXT;',
      'ALTER TABLE promotions ADD COLUMN buy_n INTEGER;',
      'ALTER TABLE promotions ADD COLUMN pay_m INTEGER;',
      // HR Module Migrations
      'CREATE TABLE IF NOT EXISTS hr_audit (id TEXT PRIMARY KEY, actor_id TEXT, action TEXT, target TEXT, details TEXT, created_at TEXT, synced INTEGER DEFAULT 0);',
      'CREATE TABLE IF NOT EXISTS hr_attendance (id TEXT PRIMARY KEY, user_id TEXT, type TEXT, timestamp TEXT, lat REAL, lng REAL, created_at TEXT, synced INTEGER DEFAULT 0);',
      'ALTER TABLE ventas_por_sku ADD COLUMN num_remision TEXT;',
      'ALTER TABLE ventas_por_sku ADD COLUMN unidades REAL;',
      'ALTER TABLE ventas_por_sku ADD COLUMN precio_venta_marca REAL;',
      'ALTER TABLE ventas_por_sku ADD COLUMN venta REAL;',
      'CREATE TABLE IF NOT EXISTS hr_commissions_rules (id TEXT PRIMARY KEY, role TEXT, kpi TEXT, threshold REAL, payout_factor REAL, created_at TEXT);',
      'CREATE TABLE IF NOT EXISTS hr_gamification (user_id TEXT PRIMARY KEY, xp INTEGER, level INTEGER, badges TEXT, streak INTEGER, updated_at TEXT);',
      // Sync Queue Resiliency Migration
      'ALTER TABLE pending_operations ADD COLUMN retry_count INTEGER DEFAULT 0;',
      // Censos Supervisor (Enfriador Census)
      `CREATE TABLE IF NOT EXISTS censos_supervisor (
        id TEXT PRIMARY KEY,
        client_id TEXT,
        client_code TEXT,
        client_name TEXT,
        supervisor_id TEXT,
        supervisor_name TEXT,
        survey_type TEXT,
        tiene_fachada INTEGER DEFAULT 0,
        tipo_fachada TEXT,
        tiene_enfriador INTEGER DEFAULT 0,
        modelo TEXT,
        serial TEXT,
        posicion TEXT,
        invadido INTEGER DEFAULT 0,
        photo_url TEXT,
        photo_fachada TEXT,
        lat REAL,
        lng REAL,
        notas TEXT,
        created_at TEXT,
        synced INTEGER DEFAULT 0,
        validated_assets TEXT
      );`,
      'ALTER TABLE censos_supervisor ADD COLUMN tiene_fachada INTEGER DEFAULT 0;',
      'ALTER TABLE censos_supervisor ADD COLUMN tipo_fachada TEXT;',
      'ALTER TABLE censos_supervisor ADD COLUMN photo_fachada TEXT;',
      // Work Orders Expansion
      'ALTER TABLE installation_orders ADD COLUMN assigned_to TEXT;',
      'CREATE TABLE IF NOT EXISTS installation_order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT, asset_id TEXT, asset_type TEXT, asset_serial TEXT, quantity INTEGER, condition_status TEXT, notes TEXT);',
      'CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, serial TEXT UNIQUE, type TEXT, status TEXT, created_at TEXT);',
      'ALTER TABLE assets ADD COLUMN brand TEXT;',
      'ALTER TABLE assets ADD COLUMN model TEXT;',
      'ALTER TABLE assets ADD COLUMN qr_value TEXT;',
      'ALTER TABLE assets ADD COLUMN warehouse_id TEXT;',
      'CREATE TABLE IF NOT EXISTS warehouses (id TEXT PRIMARY KEY, name TEXT, address TEXT, created_at TEXT);',
      'CREATE TABLE IF NOT EXISTS asset_types (name TEXT PRIMARY KEY);',
      'ALTER TABLE installation_orders ADD COLUMN client_name_cached TEXT;',
      'ALTER TABLE installation_orders ADD COLUMN client_address_cached TEXT;',
      'ALTER TABLE installation_orders ADD COLUMN destination_client_name_cached TEXT;',
      'ALTER TABLE installation_orders ADD COLUMN destination_client_address_cached TEXT;',
      'ALTER TABLE installation_orders ADD COLUMN client_business_name_cached TEXT;',
      'ALTER TABLE installation_orders ADD COLUMN destination_client_business_name_cached TEXT;',
      'ALTER TABLE installation_orders ADD COLUMN client_lat REAL;',
      'ALTER TABLE installation_orders ADD COLUMN client_lng REAL;',
      'ALTER TABLE installation_orders ADD COLUMN client_coords TEXT;',
      'ALTER TABLE installation_orders ADD COLUMN destination_client_lat REAL;',
      'ALTER TABLE installation_orders ADD COLUMN destination_client_lng REAL;',
      'ALTER TABLE installation_orders ADD COLUMN destination_client_coords TEXT;',
      'ALTER TABLE censos_supervisor ADD COLUMN validated_assets TEXT;',
      // Helpdesk Tickets Expansion
      `CREATE TABLE IF NOT EXISTS support_ticket_areas (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS support_tickets (
        id TEXT PRIMARY KEY,
        creator_id TEXT NOT NULL,
        creator_name TEXT NOT NULL,
        area_id TEXT NOT NULL,
        area_name TEXT,
        subject TEXT NOT NULL,
        description TEXT,
        priority TEXT DEFAULT 'MEDIA',
        status TEXT DEFAULT 'OPEN',
        assigned_to TEXT,
        image_url TEXT,
        created_at TEXT,
        synced INTEGER DEFAULT 0
      );`,
      `CREATE TABLE IF NOT EXISTS support_ticket_messages (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        message TEXT NOT NULL,
        image_url TEXT,
        created_at TEXT,
        synced INTEGER DEFAULT 0
      );`,
      'ALTER TABLE support_tickets ADD COLUMN image_url TEXT;',
      'ALTER TABLE support_ticket_messages ADD COLUMN image_url TEXT;',
      // Supervisor Work Plan
      'CREATE TABLE IF NOT EXISTS supervisor_work_plans (id TEXT PRIMARY KEY, supervisor_id TEXT, month_year TEXT, status TEXT, progress REAL, created_at TEXT, updated_at TEXT, synced INTEGER DEFAULT 0);',
      'CREATE TABLE IF NOT EXISTS supervisor_work_plan_activities (id TEXT PRIMARY KEY, plan_id TEXT, type TEXT, target TEXT, duration TEXT, notes TEXT, created_at TEXT, synced INTEGER DEFAULT 0);',
      'ALTER TABLE supervisor_work_plan_activities ADD COLUMN duration TEXT;',
      'CREATE TABLE IF NOT EXISTS supervisor_work_plan_records (id TEXT PRIMARY KEY, activity_id TEXT, day_date TEXT, status TEXT, notes TEXT, updated_at TEXT, synced INTEGER DEFAULT 0);',
      // Profiles cache (para WorkPlan y Kiosco offline)
      'CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, full_name TEXT, email TEXT, role TEXT, avatar_url TEXT, face_descriptor TEXT, payroll_config TEXT, updated_at TEXT);',
      'ALTER TABLE profiles ADD COLUMN face_descriptor TEXT;',
      'ALTER TABLE profiles ADD COLUMN payroll_config TEXT;',
      'CREATE TABLE IF NOT EXISTS global_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);',
      // sku_descripcion: agregar columna marca para Scorecard offline
      'ALTER TABLE sku_descripcion ADD COLUMN marca TEXT;',
      // metas_venta: columnas de metas de clientes para Conquista y Asesor offline
      'ALTER TABLE metas_venta ADD COLUMN meta_clientes REAL DEFAULT 0;',
      'ALTER TABLE metas_venta ADD COLUMN meta_clientes_1htl REAL DEFAULT 0;',
      'ALTER TABLE supervisor_onboard_supervisions ADD COLUMN supervisor_name TEXT;',
      // Performance indexes for ultra-fast offline queries
      'CREATE INDEX IF NOT EXISTS idx_clients_sales_route ON clients(sales_route);',
      'CREATE INDEX IF NOT EXISTS idx_clients_internal_route ON clients(internal_route);',
      'CREATE INDEX IF NOT EXISTS idx_clients_client_code ON clients(client_code);',
      'CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas_por_sku(fecha);',
      'CREATE INDEX IF NOT EXISTS idx_ventas_ruta ON ventas_por_sku(ruta);',
      'CREATE INDEX IF NOT EXISTS idx_metas_sales_route ON metas_venta(sales_route);',
    ];
    for (const sql of columnsToAdd) {
      try { await database.execute(sql); } catch (e) { /* Ignorar si ya existe */ }
    }
  } catch (e) {
    console.warn('[localDb] Error en migraciones:', e);
  }
}

const IDB_NAME = 'cervezasfinas_pc_db';
const IDB_STORE = 'tables';

function openPcIndexedDb() {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const idb = e.target.result;
        if (!idb.objectStoreNames.contains(IDB_STORE)) {
          idb.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function loadAllFromIdb() {
  const idb = await openPcIndexedDb();
  if (!idb) return {};
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const out = {};
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          out[cursor.key] = cursor.value;
          cursor.continue();
        } else {
          resolve(out);
        }
      };
      cursorReq.onerror = () => resolve(out);
    } catch {
      resolve({});
    }
  });
}

async function saveToIdb(tableName, data) {
  const idb = await openPcIndexedDb();
  if (!idb) return;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(data, tableName);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function createMockDb() {
  console.log('[localDb] Creando DB Persistente para PC/Web (IndexedDB + Electron Disk + localStorage)');

  const PREFIX = 'mockdb_table_';
  const SKIP_LOCALSTORAGE = ['visitas', 'ventas_por_sku', 'evaluaciones_pdv', 'evaluaciones', 'clients'];
  const memoryCache = new Map();

  const loadTableFromLocalStorage = (tableName) => {
    try {
      const raw = localStorage.getItem(PREFIX + tableName);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn(`[MockDB] Failed to load table ${tableName}`, e);
      return [];
    }
  };

  // 1. Precargar desde Disco Electron (si está en el .exe) e IndexedDB
  try {
    if (typeof window !== 'undefined' && window.electronDesktop?.loadAllTables) {
      const diskTables = await window.electronDesktop.loadAllTables();
      if (diskTables && typeof diskTables === 'object') {
        for (const [k, v] of Object.entries(diskTables)) {
          if (Array.isArray(v)) memoryCache.set(k, v);
        }
      }
    }
  } catch (e) {
    console.warn('[MockDB] No se pudo precargar desde disco Electron:', e);
  }

  try {
    const idbTables = await loadAllFromIdb();
    for (const [k, v] of Object.entries(idbTables)) {
      if (Array.isArray(v) && (!memoryCache.has(k) || memoryCache.get(k).length === 0)) {
        memoryCache.set(k, v);
      }
    }
  } catch (e) {
    console.warn('[MockDB] No se pudo precargar desde IndexedDB:', e);
  }

  const saveTable = (tableName, data) => {
    // Guardar SIEMPRE en IndexedDB y en Disco Electron (sin límite de 5MB)
    saveToIdb(tableName, data).catch(() => {});
    if (typeof window !== 'undefined' && window.electronDesktop?.saveTable) {
      window.electronDesktop.saveTable(tableName, data).catch(() => {});
    }

    if (SKIP_LOCALSTORAGE.includes(tableName)) {
      return;
    }

    try {
      localStorage.setItem(PREFIX + tableName, JSON.stringify(data));
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        console.warn(`[MockDB] localStorage lleno para ${tableName} (respaldado en IndexedDB/Disco).`);
      } else {
        console.error(`[MockDB] Failed to save table ${tableName}`, e);
      }
    }
  };

  const _storage = {
    get: (key) => {
      if (memoryCache.has(key)) return memoryCache.get(key);
      const val = loadTableFromLocalStorage(key);
      memoryCache.set(key, val);
      return val;
    },
    set: (key, value) => {
      memoryCache.set(key, value);
      saveTable(key, value);
    }
  };

  return {
    async execute(sql) {
      // Simple mock parser for CREATE TABLE could go here if we wanted to init tables
      // For now, we trust the repositories to just "get" and "set" arrays directly via db._storage
      return { changes: { changes: 0 } };
    },
    async query(sql, params = []) {
      // Very basic query support could be implemented here if needed for reads
      // But our web repositories mostly use db._storage directly now.
      return { values: [] };
    },
    async run(sql, params = []) {
      return { changes: { changes: 0 }, lastId: 0 };
    },
    // Expose storage for directSalesRepository to use
    _storage: _storage
  };
}

export async function getDb() {
  if (!db) {
    return await initLocalDb();
  }
  return db;
}

export const getDbConnection = getDb;

export function isMockDb() {
  return isMock;
}

export function isWeb() {
  return !Capacitor.isNativePlatform();
}
