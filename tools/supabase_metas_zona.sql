-- Tabla de metas por zona y mes
CREATE TABLE IF NOT EXISTS metas_zona (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zona text NOT NULL,
  period_date date NOT NULL, -- primer día del mes
  meta numeric NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Un registro por zona y mes
CREATE UNIQUE INDEX IF NOT EXISTS ux_metas_zona_period ON metas_zona (zona, period_date);
CREATE INDEX IF NOT EXISTS idx_metas_zona_period ON metas_zona (period_date);

-- Políticas básicas
ALTER TABLE metas_zona ENABLE ROW LEVEL SECURITY;

-- Solo admin puede insertar/actualizar/eliminar
DROP POLICY IF EXISTS "metas_zona_write_admin" ON metas_zona;
CREATE POLICY "metas_zona_write_admin" ON metas_zona
  FOR INSERT TO public
  WITH CHECK ( public.is_admin() );
CREATE POLICY "metas_zona_update_admin" ON metas_zona
  FOR UPDATE TO public
  USING ( public.is_admin() )
  WITH CHECK ( public.is_admin() );
CREATE POLICY "metas_zona_delete_admin" ON metas_zona
  FOR DELETE TO public
  USING ( public.is_admin() );

-- Lectura para usuarios autenticados
DROP POLICY IF EXISTS "metas_zona_select_all_auth" ON metas_zona;
CREATE POLICY "metas_zona_select_all_auth" ON metas_zona
  FOR SELECT USING (auth.role() = 'authenticated');
