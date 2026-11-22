-- ================================================================
-- SCHEMA COMPLETO MYSQL PARA E-COMMERCE CERVEZASFINAS.SHOP
-- CON PREFIJO shop_ PARA NO INTERFERIR CON TABLAS EXISTENTES
-- ================================================================

USE u815168173_um6pos;

-- Tabla de usuarios clientes (autenticación)
CREATE TABLE IF NOT EXISTS shop_client_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_code VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP NULL,
  INDEX idx_client_code (client_code),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de productos
CREATE TABLE IF NOT EXISTS shop_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  base_price DECIMAL(10,2) NOT NULL,
  category VARCHAR(100),
  image_url VARCHAR(500),
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sku (sku),
  INDEX idx_active (is_active),
  INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de promociones
CREATE TABLE IF NOT EXISTS shop_promotions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  discount_percentage DECIMAL(5,2) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dates (start_date, end_date),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de descuentos GEC
CREATE TABLE IF NOT EXISTS shop_gec_discounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nivel_gec VARCHAR(10) NOT NULL UNIQUE,
  discount_percentage DECIMAL(5,2) NOT NULL,
  is_active TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de precios especiales
CREATE TABLE IF NOT EXISTS shop_special_prices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_code VARCHAR(50) NOT NULL,
  sku VARCHAR(50) NOT NULL,
  special_price DECIMAL(10,2) NOT NULL,
  start_date DATE,
  end_date DATE,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_client_sku (client_code, sku),
  INDEX idx_client (client_code),
  INDEX idx_dates (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de pedidos
CREATE TABLE IF NOT EXISTS shop_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(50) NOT NULL UNIQUE,
  client_code VARCHAR(50) NOT NULL,
  status ENUM('pending', 'confirmed', 'delivered', 'cancelled') DEFAULT 'pending',
  total_amount DECIMAL(10,2) NOT NULL,
  notes TEXT,
  delivery_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP NULL,
  delivered_at TIMESTAMP NULL,
  INDEX idx_client (client_code),
  INDEX idx_status (status),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de items de pedido
CREATE TABLE IF NOT EXISTS shop_order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  sku VARCHAR(50) NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  discount_applied DECIMAL(10,2) DEFAULT 0,
  subtotal DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES shop_orders(id) ON DELETE CASCADE,
  INDEX idx_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de balance de puntos
CREATE TABLE IF NOT EXISTS shop_client_points (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_code VARCHAR(50) NOT NULL UNIQUE,
  points_balance INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_client (client_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de configuración de puntos
CREATE TABLE IF NOT EXISTS shop_points_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  points_per_peso DECIMAL(10,4) DEFAULT 0.1000,
  min_purchase_for_points DECIMAL(10,2) DEFAULT 0.00,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de ejecuciones de enfriador
CREATE TABLE IF NOT EXISTS shop_cooler_executions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_code VARCHAR(50) NOT NULL,
  photo_url VARCHAR(500) NOT NULL,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  points_awarded INT DEFAULT 0,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_client (client_code),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de fotos de referencia de enfriador
CREATE TABLE IF NOT EXISTS shop_cooler_reference_photos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  photo_url VARCHAR(500) NOT NULL,
  title VARCHAR(255),
  description TEXT,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de productos canjeables por puntos
CREATE TABLE IF NOT EXISTS shop_point_redemption_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(50) NOT NULL,
  points_required INT NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sku (sku),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de solicitudes de canje
CREATE TABLE IF NOT EXISTS shop_point_redemptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_code VARCHAR(50) NOT NULL,
  product_sku VARCHAR(50) NOT NULL,
  points_used INT NOT NULL,
  status ENUM('pending', 'approved', 'delivered', 'cancelled') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP NULL,
  INDEX idx_client (client_code),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de transacciones de puntos
CREATE TABLE IF NOT EXISTS shop_points_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_code VARCHAR(50) NOT NULL,
  type ENUM('earned', 'redeemed', 'expired') NOT NULL,
  points INT NOT NULL,
  reason VARCHAR(255),
  related_execution_id INT NULL,
  related_order_id INT NULL,
  related_redemption_id INT NULL,
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_client (client_code),
  INDEX idx_expires (expires_at),
  INDEX idx_created (created_at),
  INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de contactos de televenta
CREATE TABLE IF NOT EXISTS shop_televenta_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  zona VARCHAR(100) NOT NULL,
  contact_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  is_active TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de marcas
CREATE TABLE IF NOT EXISTS shop_brands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  logo_url VARCHAR(500),
  color_gradient VARCHAR(255) DEFAULT 'from-gray-500 to-gray-700',
  display_order INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_active (is_active),
  INDEX idx_order (display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================================================
-- DATOS INICIALES
-- ================================================================

-- Descuentos GEC
INSERT INTO shop_gec_discounts (nivel_gec, discount_percentage, is_active) VALUES
('A', 5.00, 1),
('B', 3.00, 1),
('C', 2.00, 1),
('D', 0.00, 1);

-- Configuración de puntos
INSERT INTO shop_points_config (points_per_peso, min_purchase_for_points) VALUES
(0.1000, 100.00);

-- Productos de prueba
INSERT INTO shop_products (sku, name, description, base_price, category, is_active) VALUES
('CORONA355', 'Corona Extra 355ml', 'Cerveza clara importada', 15.50, 'Cerveza', 1),
('VICTORIA355', 'Victoria 355ml', 'Cerveza tipo Viena', 14.00, 'Cerveza', 1),
('MODELO355', 'Modelo Especial 355ml', 'Cerveza clara tipo Pilsner', 14.50, 'Cerveza', 1),
('PACIFICO355', 'Pacífico Clara 355ml', 'Cerveza clara estilo Pilsner', 14.00, 'Cerveza', 1),
('NEGMOD355', 'Negra Modelo 355ml', 'Cerveza oscura tipo Munich', 15.00, 'Cerveza', 1);

-- Usuario de prueba (password: password123)
INSERT INTO shop_client_users (client_code, password_hash, is_active) VALUES 
('TEST001', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 1);

-- ================================================================
-- SQL COMPLETADO EXITOSAMENTE
-- ================================================================
