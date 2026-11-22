-- Migration to update assets table and create warehouses table
-- Execute this on your MySQL server (srv564.hstgr.io)

-- 1. Create Warehouses Table
CREATE TABLE IF NOT EXISTS warehouses (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Update Assets Table Schema
ALTER TABLE assets 
ADD COLUMN IF NOT EXISTS brand VARCHAR(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS model VARCHAR(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS qr_value VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS warehouse_id VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
ADD CONSTRAINT fk_asset_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL;

-- 3. Initial basic warehouses if needed (optional, sync from Supabase normally)
INSERT IGNORE INTO warehouses (id, name) VALUES ('ALM-GEN', 'Almacén General');
