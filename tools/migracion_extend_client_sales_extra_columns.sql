-- Migración: extender client_sales con columnas adicionales de la hoja mensual
-- Ejecutar una sola vez.

ALTER TABLE client_sales ADD COLUMN IF NOT EXISTS cajas numeric;
ALTER TABLE client_sales ADD COLUMN IF NOT EXISTS htls numeric;
ALTER TABLE client_sales ADD COLUMN IF NOT EXISTS meta numeric;
ALTER TABLE client_sales ADD COLUMN IF NOT EXISTS dif numeric;
ALTER TABLE client_sales ADD COLUMN IF NOT EXISTS total numeric;
ALTER TABLE client_sales ADD COLUMN IF NOT EXISTS con_compra numeric;
ALTER TABLE client_sales ADD COLUMN IF NOT EXISTS efectividad numeric;
ALTER TABLE client_sales ADD COLUMN IF NOT EXISTS venta numeric;
ALTER TABLE client_sales ADD COLUMN IF NOT EXISTS descuento numeric;
ALTER TABLE client_sales ADD COLUMN IF NOT EXISTS gasto numeric;
ALTER TABLE client_sales ADD COLUMN IF NOT EXISTS cliente_compra numeric;

-- Opcional: índices si se harán consultas filtrando por algunas métricas.
-- CREATE INDEX IF NOT EXISTS idx_client_sales_cajas ON client_sales(cajas);
-- etc.

-- Nota: amount seguirá representando la métrica principal consolidada; 'venta' se conserva cruda.
