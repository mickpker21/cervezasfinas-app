-- Migración Fase 2 ERP: Load Sheets y Reparto

-- 1. Tabla de Cargas / Manifiestos de Reparto (Load Sheets)
CREATE TABLE IF NOT EXISTS warehouse_load_sheets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    load_date DATE NOT NULL,
    delivery_route VARCHAR(100) NOT NULL,
    driver_id VARCHAR(100) NOT NULL, -- UUID de Supabase del Chofer
    warehouse_user_id VARCHAR(100) NOT NULL, -- Quién autorizó la carga
    status ENUM('DRAFT', 'APPROVED', 'DISPATCHED', 'RETURNED', 'LIQUIDATED') DEFAULT 'DRAFT',
    total_cases INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_route_date (delivery_route, load_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla de Items del Manifiesto de Carga
CREATE TABLE IF NOT EXISTS warehouse_load_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    load_sheet_id INT NOT NULL,
    product_sku VARCHAR(50) NOT NULL,
    planned_quantity INT DEFAULT 0, -- Lo que dice el sistema
    loaded_quantity INT DEFAULT 0, -- Lo que realmente se subió al camión
    returned_full_quantity INT DEFAULT 0, -- Lo que regresa lleno (no vendido)
    returned_empty_quantity INT DEFAULT 0, -- Envase vacío recuperado
    FOREIGN KEY (load_sheet_id) REFERENCES warehouse_load_sheets(id) ON DELETE CASCADE,
    FOREIGN KEY (product_sku) REFERENCES products(sku) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Actualización opcional a pre_sales / orders (Si existen en MySQL)
-- En caso de tener pedidos locales, asociamos el pedido a la hoja de carga.
-- (De momento, la relación se hará lógica a nivel de App mediante delivery_route y Date)
