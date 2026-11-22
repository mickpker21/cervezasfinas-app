-- MIGRACIÓN: Asegura que la tabla 'clients' tenga todas las columnas necesarias
-- Agrega las columnas que falten (no falla si ya existen)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS business_name text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS level text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS exclusivity text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS internal_route text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sales_route text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS coords jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS comments text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_clients_internal_route ON clients (internal_route);
CREATE INDEX IF NOT EXISTS idx_clients_owner_id ON clients (owner_id);
