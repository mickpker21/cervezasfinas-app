-- Migración Fase 1 ERP: WMS y Multiruta

-- 1. Tabla Global de Productos (SKUs)
CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(50) PRIMARY KEY,
    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) DEFAULT NULL,
    price DECIMAL(10,2) DEFAULT 0.00,
    is_returnable BOOLEAN DEFAULT FALSE,
    returnable_container_sku VARCHAR(50) DEFAULT NULL, -- SKU of the empty container (e.g. envase vacio caguama)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla de Inventario de Almacén Central (Cedis)
CREATE TABLE IF NOT EXISTS warehouse_inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_sku VARCHAR(50) NOT NULL,
    quantity INT DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_sku) REFERENCES products(sku) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabla de Movimientos de Almacén (Kárdex / Historial)
CREATE TABLE IF NOT EXISTS warehouse_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_sku VARCHAR(50) NOT NULL,
    transaction_type ENUM('INGRESO_FABRICA', 'SALIDA_REPARTO', 'RETORNO_REPARTO', 'MERMA', 'AJUSTE') NOT NULL,
    quantity INT NOT NULL, -- Positivo o negativo
    reference_id VARCHAR(100) DEFAULT NULL, -- ID del viaje, de la factura, etc.
    user_id VARCHAR(100) NOT NULL, -- Quién hizo el movimiento (Almacenista)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_sku) REFERENCES products(sku) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Actualización de Topología de Clientes
-- La tabla `clients` ya cuenta con `sales_route` y `internal_route` (que funge como ruta de conquista).
-- Agregamos la ruta de reparto.
ALTER TABLE clients
ADD COLUMN delivery_route VARCHAR(100) DEFAULT NULL AFTER sales_route;
