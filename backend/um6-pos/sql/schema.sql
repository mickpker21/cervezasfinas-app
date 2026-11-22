-- Base de datos: um6_pos

CREATE TABLE IF NOT EXISTS stores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  address TEXT,
  manager_email VARCHAR(120),
  max_capacity INT,
  min_capacity INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(80),
  uom VARCHAR(16) DEFAULT 'caja',
  active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  product_id INT NOT NULL,
  on_hand DECIMAL(10,2) DEFAULT 0,
  reserved DECIMAL(10,2) DEFAULT 0,
  max_level DECIMAL(10,2),
  min_level DECIMAL(10,2),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_store_product (store_id, product_id),
  CONSTRAINT fk_inventory_store FOREIGN KEY (store_id) REFERENCES stores(id),
  CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  product_id INT NOT NULL,
  type ENUM('SALE','ADJUSTMENT','STOCK_IN','STOCK_OUT','ORDER_ACCEPT') NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  reference VARCHAR(64),
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mov_store FOREIGN KEY (store_id) REFERENCES stores(id),
  CONSTRAINT fk_mov_product FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  status ENUM('DRAFT','SENT','IN_TRANSIT','RECEIVED','REJECTED') DEFAULT 'DRAFT',
  suggested TINYINT(1) DEFAULT 0,
  notes TEXT,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_store FOREIGN KEY (store_id) REFERENCES stores(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS planograms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  file_url TEXT NOT NULL,
  version INT DEFAULT 1,
  uploaded_by CHAR(36) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_planograms_store FOREIGN KEY (store_id) REFERENCES stores(id)
);
