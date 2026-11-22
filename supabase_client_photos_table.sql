-- Tabla para almacenar múltiples fotos por cliente
CREATE TABLE IF NOT EXISTS client_photos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    photo_type text NOT NULL, -- 'facade', 'interior', 'cooler', etc.
    photo_url text NOT NULL,  -- URL pública en Supabase Storage
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_photos_client_id ON client_photos (client_id);
CREATE INDEX IF NOT EXISTS idx_client_photos_type ON client_photos (photo_type);
