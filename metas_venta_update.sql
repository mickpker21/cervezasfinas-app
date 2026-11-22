-- Add new columns for client goals to the metas_venta table
ALTER TABLE metas_venta 
ADD COLUMN IF NOT EXISTS meta_clientes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS meta_clientes_1htl integer DEFAULT 0;

-- Comment on columns for clarity
COMMENT ON COLUMN metas_venta.meta_clientes IS 'Goal for total number of clients';
COMMENT ON COLUMN metas_venta.meta_clientes_1htl IS 'Goal for number of clients with > 1HL volume';
