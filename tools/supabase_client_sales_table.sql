-- Tabla de ventas por cliente (mensual)
CREATE TABLE IF NOT EXISTS client_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period_date date NOT NULL, -- usar primer día del mes (YYYY-MM-01)
  amount numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Un registro por cliente y mes
CREATE UNIQUE INDEX IF NOT EXISTS ux_client_sales_client_period ON client_sales (client_id, period_date);
CREATE INDEX IF NOT EXISTS idx_client_sales_period ON client_sales (period_date);

-- Políticas básicas (ajusta según tu seguridad)
ALTER TABLE client_sales ENABLE ROW LEVEL SECURITY;

-- Helper para determinar si el usuario actual es admin
-- Considera:
-- 1) claim directo 'role' = 'admin'
-- 2) user_metadata.type o user_metadata.role que empiece por 'admin' (ej. 'Administrador')
-- 3) profiles.role = 'admin' para el usuario actual
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    (coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'admin')
    OR (lower(coalesce(current_setting('request.jwt.claims', true)::jsonb #>> '{user_metadata,type}', '')) LIKE 'admin%')
    OR (lower(coalesce(current_setting('request.jwt.claims', true)::jsonb #>> '{user_metadata,role}', '')) LIKE 'admin%')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND lower(coalesce(p.role, '')) = 'admin'
    );
$$;

-- Lectura para usuarios autenticados
DROP POLICY IF EXISTS "client_sales_select_all_auth" ON client_sales;
CREATE POLICY "client_sales_select_all_auth" ON client_sales
  FOR SELECT USING (auth.role() = 'authenticated');

-- Inserción/actualización/eliminación solo para admin.
-- Opción 1: si usas un claim jwt 'role' con valor 'admin':
DROP POLICY IF EXISTS "client_sales_write_admin" ON client_sales;
CREATE POLICY "client_sales_write_admin" ON client_sales
  FOR INSERT TO public
  WITH CHECK ( public.is_admin() );

DROP POLICY IF EXISTS "client_sales_update_admin" ON client_sales;
CREATE POLICY "client_sales_update_admin" ON client_sales
  FOR UPDATE TO public
  USING ( public.is_admin() )
  WITH CHECK ( public.is_admin() );

DROP POLICY IF EXISTS "client_sales_delete_admin" ON client_sales;
CREATE POLICY "client_sales_delete_admin" ON client_sales
  FOR DELETE TO public
  USING ( public.is_admin() );
