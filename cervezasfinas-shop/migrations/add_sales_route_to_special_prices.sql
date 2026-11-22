-- Migración: Agregar columna sales_route a shop_special_prices
-- Fecha: 2026-02-01
-- Propósito: Soporte para precios especiales por ruta de ventas

-- Agregar columna sales_route
ALTER TABLE shop_special_prices 
ADD COLUMN sales_route VARCHAR(50) DEFAULT NULL AFTER zone;

-- Agregar índice compuesto para optimizar búsquedas jerárquicas
CREATE INDEX idx_special_pricing_lookup 
ON shop_special_prices (sku, client_code, sales_route, zone, is_active, start_date, end_date);

-- Comentarios para documentación
ALTER TABLE shop_special_prices 
MODIFY COLUMN client_code VARCHAR(50) NULL COMMENT 'Cliente específico (prioridad 1)',
MODIFY COLUMN sales_route VARCHAR(50) NULL COMMENT 'Ruta de ventas (prioridad 2)',
MODIFY COLUMN zone VARCHAR(50) NULL COMMENT 'Zona comercial (prioridad 3)';

-- Verificar que solo uno de los tres campos esté lleno se manejará a nivel de aplicación
-- ya que MySQL no soporta CHECK constraints complejos en todas las versiones
