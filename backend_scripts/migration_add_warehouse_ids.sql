-- Añadir columna para control de acceso a almacenes (Múltiples almacenes por usuario)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS warehouse_ids JSONB DEFAULT '[]'::jsonb;

-- Comentario descriptivo de la columna
COMMENT ON COLUMN public.profiles.warehouse_ids IS 'Array de IDs de almacén a los que el usuario tiene acceso. Ejemplo: ["uuid-1", "uuid-2"]';
