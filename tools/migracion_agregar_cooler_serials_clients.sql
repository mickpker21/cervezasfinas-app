-- Migración: Agregar campo para múltiples números de serie de enfriadores en la tabla clients
ALTER TABLE clients
ADD COLUMN cooler_serials jsonb DEFAULT '[]';
-- El campo cooler_serials almacenará un array de strings con los números de serie escaneados.
