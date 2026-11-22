CREATE TABLE IF NOT EXISTS global_settings (
  key VARCHAR PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Iniciar con el PIN default del Kiosko
INSERT INTO global_settings (key, value)
VALUES ('kiosk_pin', '"56765"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- RLS (Row Level Security)
ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;

-- Politica para leer (todos pueden leer: logueados y no logueados)
CREATE POLICY "Enable read access for everyone" 
ON global_settings FOR SELECT 
USING (true);

-- Politica para actualizar
CREATE POLICY "Enable update for admins and HR" 
ON global_settings FOR UPDATE 
TO authenticated 
USING (
  auth.jwt() -> 'user_metadata' ->> 'type' IN ('admin', 'rh', 'gerente') 
  OR 
  auth.jwt() -> 'app_metadata' ->> 'role' IN ('admin', 'rh', 'gerente')
);

CREATE POLICY "Enable insert for admins and HR" 
ON global_settings FOR INSERT 
TO authenticated 
WITH CHECK (
  auth.jwt() -> 'user_metadata' ->> 'type' IN ('admin', 'rh', 'gerente') 
  OR 
  auth.jwt() -> 'app_metadata' ->> 'role' IN ('admin', 'rh', 'gerente')
);
