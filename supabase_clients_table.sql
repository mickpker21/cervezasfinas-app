-- SQL para la tabla 'clients' compatible con tu código React
CREATE TABLE IF NOT EXISTS clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    business_name text,
    type text,
    address text,
    level text,
    exclusivity text,
    internal_route text,
    sales_route text,
    phone text,
    coords jsonb,
    comments text,
    owner_id uuid,
    created_at timestamptz DEFAULT now()
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_clients_internal_route ON clients (internal_route);
CREATE INDEX IF NOT EXISTS idx_clients_owner_id ON clients (owner_id);

-- NOTA: Si usas fotos, deberías usar una tabla aparte (client_photos) y no una columna 'photos' en clients.
-- Si necesitas la tabla de fotos, avísame y la agrego.
