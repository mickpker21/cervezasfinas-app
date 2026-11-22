-- Añadir columna 'zona' a la tabla profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS zona TEXT;

-- Opcional: Actualizar políticas de RLS si están muy estrictas
-- CREATE POLICY "Enable users to view their own profile" ON profiles ...
