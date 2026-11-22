-- ================================================================
-- ACTUALIZACIÓN MANUAL DE BASE DE DATOS (Hostinger / phpMyAdmin)
-- Copia y pega todo este contenido en la pestaña "SQL" de phpMyAdmin
-- ================================================================

USE u815168173_um6pos;

-- 1. Agregar columna 'gec' a usuarios (si no existe)
-- Es seguro correr esto aunque falle si la columna ya existe, pero en SQL puro a veces da error.
-- Si da error "Duplicate column name 'gec'", ignóralo y continúa con el paso 2.
ALTER TABLE shop_client_users ADD COLUMN gec VARCHAR(50) DEFAULT 'Bronce' AFTER client_code;

-- 2. Actualizar Tabla de Promociones para usar PESOS ($) en lugar de PORCENTAJE (%)
-- Si 'discount_percentage' existe, lo cambiamos. Si ya lo cambiaste, dará error (ignora).
ALTER TABLE shop_promotions CHANGE discount_percentage discount_amount DECIMAL(10,2) NOT NULL;
-- Si la tabla estaba vacía o quieres asegurarte de tener la columna:
-- ALTER TABLE shop_promotions ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- 3. Crear tabla de relación Promociones-SKUs (Faltante)
CREATE TABLE IF NOT EXISTS shop_promotion_skus (
  id INT AUTO_INCREMENT PRIMARY KEY,
  promotion_id INT NOT NULL,
  sku VARCHAR(50) NOT NULL,
  FOREIGN KEY (promotion_id) REFERENCES shop_promotions(id) ON DELETE CASCADE,
  UNIQUE KEY unique_promo_sku (promotion_id, sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Crear tabla de Fotos Referencia Enfriador
CREATE TABLE IF NOT EXISTS shop_cooler_reference_photos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  photo_url VARCHAR(500) NOT NULL,
  title VARCHAR(255),
  description TEXT,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Crear tabla de Productos de Canje
CREATE TABLE IF NOT EXISTS shop_point_redemption_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(50) NOT NULL,
  points_required INT NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sku (sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Actualizar Niveles GEC (Elimina los viejos e inserta los correctos)
TRUNCATE TABLE shop_gec_discounts;

INSERT INTO shop_gec_discounts (nivel_gec, discount_percentage) VALUES 
('Bronce', 0.00),
('Plata', 2.00),
('Oro', 5.00),
('Platino', 7.00),
('Titanio', 10.00),
('Titanio 2', 12.00);

-- ================================================================
-- FIN DE ACTUALIZACIÓN
-- ================================================================
