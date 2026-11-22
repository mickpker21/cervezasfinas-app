-- Tabla de configuración de puntos
CREATE TABLE IF NOT EXISTS points_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  points_per_peso DECIMAL(10,4) NOT NULL DEFAULT 0.1,
  min_purchase_for_points DECIMAL(10,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de productos canjeables por puntos
CREATE TABLE IF NOT EXISTS point_redemption_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(50) NOT NULL,
  points_required INT NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sku (sku),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insertar configuración inicial si no existe
INSERT INTO points_config (points_per_peso, min_purchase_for_points)
SELECT 0.1, 0
WHERE NOT EXISTS (SELECT 1 FROM points_config LIMIT 1);
