-- Create Sales Tables for MySQL Migration

-- 1. Direct Sales Header
CREATE TABLE IF NOT EXISTS direct_sales (
    id VARCHAR(50) PRIMARY KEY, -- UUID from App
    user_id VARCHAR(50) NOT NULL,
    client_id INT NOT NULL,     -- Matches clients.id (MySQL ID)
    total_amount DECIMAL(10, 2),
    status VARCHAR(50) DEFAULT 'COMPLETED',
    payment_method VARCHAR(50) DEFAULT 'CASH',
    gec_discount DECIMAL(10, 2) DEFAULT 0,
    promo_discount DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_client_id (client_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Direct Sales Items
CREATE TABLE IF NOT EXISTS direct_sales_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_id VARCHAR(50) NOT NULL,
    cve_marca VARCHAR(50),      -- SKU
    des_marca VARCHAR(255),     -- Product Name (Snapshotted)
    quantity INT DEFAULT 1,
    unit_price DECIMAL(10, 2),
    total_price DECIMAL(10, 2),
    FOREIGN KEY (sale_id) REFERENCES direct_sales(id) ON DELETE CASCADE,
    INDEX idx_sku (cve_marca)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
