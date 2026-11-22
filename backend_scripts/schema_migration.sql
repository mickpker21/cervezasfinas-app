-- Script para completar las columnas faltantes en la tabla 'clients' existente.
-- Ejecuta todo el bloque. Si alguna columna ya existe, podrías recibir un error, 
-- pero el objetivo es asegurar que todas estas estén presentes.

-- Asegurar que la tabla use UTF-8mb4 para evitar caracteres extraños (mojibake)
ALTER TABLE clients CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE clients
    ADD COLUMN email VARCHAR(255),
    ADD COLUMN phone VARCHAR(50),
    ADD COLUMN address TEXT,
    ADD COLUMN sales_route VARCHAR(50),      -- Faltaba
    ADD COLUMN visit_days VARCHAR(255),
    ADD COLUMN visit_day_televenta VARCHAR(255), -- La nueva columna
    ADD COLUMN coords JSON,
    ADD COLUMN cooler_serials JSON,
    ADD COLUMN exclusivity VARCHAR(50),
    ADD COLUMN zona_comercial VARCHAR(100),
    ADD COLUMN region VARCHAR(100),
    ADD COLUMN contact VARCHAR(255),
    ADD COLUMN notes TEXT,
    ADD COLUMN client_type VARCHAR(50),
    ADD COLUMN enfriador VARCHAR(50),
    ADD COLUMN cadena VARCHAR(255),
    ADD COLUMN owner_id VARCHAR(36),
    ADD COLUMN created_by VARCHAR(36);

-- Asegurar índices útiles
CREATE INDEX idx_sales_route ON clients(sales_route);
CREATE INDEX idx_internal_route ON clients(internal_route);
-- CRÍTICO: Índice único para que el UPSERT funcione y no duplique clientes
CREATE UNIQUE INDEX idx_unique_client_code ON clients(client_code);
