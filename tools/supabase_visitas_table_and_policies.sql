-- Tabla de visitas para registrar visitas de clientes
CREATE TABLE IF NOT EXISTS visitas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_nombre text NOT NULL,
    fecha date NOT NULL DEFAULT CURRENT_DATE,
  ruta text,
  notes text,
  lat text NOT NULL,
  lng text NOT NULL,
  photo_url text,
    user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

-- Policy: cualquier usuario autenticado puede insertar visitas propias
CREATE POLICY "Insertar visitas propias"
  ON visitas
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: los usuarios pueden ver solo sus visitas
CREATE POLICY "Ver solo mis visitas"
  ON visitas
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: permitir update solo al dueño
CREATE POLICY "Modificar solo mis visitas"
  ON visitas
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: permitir delete solo al dueño
CREATE POLICY "Eliminar solo mis visitas"
  ON visitas
  FOR DELETE
  USING (auth.uid() = user_id);
