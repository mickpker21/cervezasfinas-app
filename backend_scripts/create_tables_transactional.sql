-- Create Transactional Tables for MySQL Migration

-- 1. Visitas (Visits)
CREATE TABLE IF NOT EXISTS visitas (
    id VARCHAR(50) PRIMARY KEY, -- UUID from App
    client_id INT NOT NULL,     -- Matches clients.id
    user_id VARCHAR(50) NOT NULL,
    fecha DATE,
    hora TIME,
    ruta VARCHAR(50),
    motivo TEXT,
    notes TEXT,
    photo_fachada TEXT,
    photo_interior TEXT,
    photo_enfriador TEXT,
    lat DECIMAL(10, 8),
    lng DECIMAL(11, 8),
    inventory JSON,             -- Stores inventory check details
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_client_id (client_id),
    INDEX idx_ruta (ruta),
    INDEX idx_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Evaluaciones PDV (Point of Sale Evaluations)
CREATE TABLE IF NOT EXISTS evaluaciones_pdv (
    id VARCHAR(50) PRIMARY KEY,
    client_id INT NOT NULL,
    user_id VARCHAR(50),
    fecha DATE,
    puntaje_total DECIMAL(10, 2),
    surtido_porcentaje DECIMAL(5, 2),
    payload JSON,               -- Stores entire evaluation object for flexibility
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_client_id (client_id),
    INDEX idx_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Evaluaciones Canal Moderno (Modern Channel / Competencia)
CREATE TABLE IF NOT EXISTS evaluaciones (
    id VARCHAR(50) PRIMARY KEY,
    tienda_id INT NOT NULL,     -- Maps to client_id
    fecha DATE,
    tipo VARCHAR(50),           -- 'Canal Moderno' or similar
    payload JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tienda_id (tienda_id),
    INDEX idx_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Installation Orders (Ordenes de Instalación)
CREATE TABLE IF NOT EXISTS installation_orders (
    id VARCHAR(50) PRIMARY KEY,
    client_id INT NOT NULL,
    created_by VARCHAR(50),
    status VARCHAR(50) DEFAULT 'PENDIENTE',
    action VARCHAR(50),
    destination_client_id INT, -- For transfers/movements
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_client_id (client_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Installation Order Items
CREATE TABLE IF NOT EXISTS installation_order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    asset_type VARCHAR(100),
    asset_serial VARCHAR(100),
    quantity INT DEFAULT 1,
    condition_status VARCHAR(50), -- 'good', 'damaged', etc (optional)
    notes TEXT,
    FOREIGN KEY (order_id) REFERENCES installation_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
