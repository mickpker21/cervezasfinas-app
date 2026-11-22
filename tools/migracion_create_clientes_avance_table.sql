-- Crea tabla para almacenar TODAS las columnas crudas provenientes de la hoja "clientes" de los archivos XLSX
-- Asunción: cada fila corresponde a un cliente (o código) por periodo y snapshot.
-- Si el mismo (client_code, period_date) llega varias veces, conservamos la última (upsert) pero guardamos un raw_id diferente con created_at si quieres histórico.
-- Si deseas histórico completo sin sobrescritura, elimina la UNIQUE INDEX y cambia ON CONFLICT en la función.

CREATE TABLE IF NOT EXISTS client_sales_sheet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  client_code text,
  period_date date NOT NULL,
  ruta text,
  cajas numeric,
  htls numeric,
  meta numeric,
  dif numeric,
  total numeric,
  con_compra numeric,
  efectividad numeric,
  venta numeric,
  descuento numeric,
  gasto numeric,
  cliente_compra numeric,
  -- JSON completo por si en el futuro aparecen más columnas
  raw jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Evita duplicados lógicos por cliente/periodo si no quieres múltiples snapshots.
CREATE UNIQUE INDEX IF NOT EXISTS ux_client_sales_sheet_client_period ON client_sales_sheet (coalesce(client_id::text, client_code), period_date);
CREATE INDEX IF NOT EXISTS idx_client_sales_sheet_period ON client_sales_sheet (period_date);
-- Índices adicionales para búsquedas rápidas por client_code o client_id
CREATE INDEX IF NOT EXISTS idx_client_sales_sheet_client_code ON client_sales_sheet (client_code);
CREATE INDEX IF NOT EXISTS idx_client_sales_sheet_client_id ON client_sales_sheet (client_id);

-- Constraints (agregadas condicionalmente si faltan)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_sales_sheet_client_presence'
  ) THEN
    ALTER TABLE client_sales_sheet
      ADD CONSTRAINT client_sales_sheet_client_presence CHECK (client_id IS NOT NULL OR client_code IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_sales_sheet_month_floor'
  ) THEN
    ALTER TABLE client_sales_sheet
      ADD CONSTRAINT client_sales_sheet_month_floor CHECK (period_date = date_trunc('month', period_date)::date);
  END IF;
END$$;

-- Trigger para mantener updated_at al hacer UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_client_sales_sheet'
  ) THEN
    CREATE TRIGGER set_timestamp_client_sales_sheet
    BEFORE UPDATE ON client_sales_sheet
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;$$;

ALTER TABLE client_sales_sheet ENABLE ROW LEVEL SECURITY;

-- Políticas similares a client_sales (ajusta a tu modelo de seguridad)
DROP POLICY IF EXISTS "client_sales_sheet_select" ON client_sales_sheet;
CREATE POLICY "client_sales_sheet_select" ON client_sales_sheet
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "client_sales_sheet_write_admin" ON client_sales_sheet;
CREATE POLICY "client_sales_sheet_write_admin" ON client_sales_sheet
  FOR INSERT TO authenticated
  WITH CHECK ( public.is_admin() );

DROP POLICY IF EXISTS "client_sales_sheet_update_admin" ON client_sales_sheet;
CREATE POLICY "client_sales_sheet_update_admin" ON client_sales_sheet
  FOR UPDATE TO public
  USING ( public.is_admin() )
  WITH CHECK ( public.is_admin() );

DROP POLICY IF EXISTS "client_sales_sheet_delete_admin" ON client_sales_sheet;
CREATE POLICY "client_sales_sheet_delete_admin" ON client_sales_sheet
  FOR DELETE TO public
  USING ( public.is_admin() );
