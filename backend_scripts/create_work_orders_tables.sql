-- Create tables for Work Orders and Assets tracking
-- Execute this on your MySQL server

-- 1. Assets Table
CREATE TABLE IF NOT EXISTS assets (
    id VARCHAR(50) PRIMARY KEY,
    serial VARCHAR(100) UNIQUE NOT NULL,
    type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'DISPONIBLE', -- DISPONIBLE, ASIGNADO, EN_MANTENIMIENTO, RETIRADO
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Installation Orders Table
CREATE TABLE IF NOT EXISTS installation_orders (
    id VARCHAR(50) PRIMARY KEY,
    client_id VARCHAR(50),
    destination_client_id VARCHAR(50) DEFAULT NULL,
    action VARCHAR(50), -- INSTALAR, RETIRAR, MOVER, MANTENIMIENTO
    assigned_to VARCHAR(50) DEFAULT NULL, -- user_id (installer)
    created_by VARCHAR(50), -- user_id
    status VARCHAR(50) DEFAULT 'PENDIENTE', -- PENDING, ASIGNADA, EN_RUTA, COMPLETADA, CANCELADA
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (client_id),
    INDEX (assigned_to),
    INDEX (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Installation Order Items Table
CREATE TABLE IF NOT EXISTS installation_order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id VARCHAR(50),
    asset_id VARCHAR(50) DEFAULT NULL,
    asset_type VARCHAR(50),
    asset_serial VARCHAR(100),
    quantity INTEGER DEFAULT 1,
    condition_status VARCHAR(50),
    notes TEXT,
    FOREIGN KEY (order_id) REFERENCES installation_orders(id) ON DELETE CASCADE,
    INDEX (asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Current Asset Locations (Tracking Table)
CREATE TABLE IF NOT EXISTS current_asset_locations (
    asset_id VARCHAR(50) PRIMARY KEY,
    asset_serial VARCHAR(100),
    asset_type VARCHAR(50),
    client_id VARCHAR(50),
    action VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (client_id),
    INDEX (asset_serial)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Asset Movements (History Table)
CREATE TABLE IF NOT EXISTS asset_movements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    asset_id VARCHAR(50),
    order_id VARCHAR(50),
    action VARCHAR(50),
    from_client_id VARCHAR(50),
    to_client_id VARCHAR(50),
    performer_id VARCHAR(50), -- user_id
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (asset_id),
    INDEX (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
