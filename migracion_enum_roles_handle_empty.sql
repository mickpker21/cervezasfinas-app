-- Migración para manejar valores vacíos antes de castear a enum user_role
-- Problema: error 22P02 por valores '' (cadena vacía) al ejecutar USING lower(role)::user_role
-- Solución: introducir valor 'unknown' en el enum (si no existe) y mapear vacíos a 'unknown'

-- 1. Asegurar enum completo y agregar 'unknown'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    BEGIN EXECUTE 'ALTER TYPE user_role ADD VALUE IF NOT EXISTS ' || quote_literal('unknown'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  ELSE
    CREATE TYPE user_role AS ENUM ('admin','supervisor','conquista','control-interno','televenta','asesor_dinamico','unknown');
  END IF;
END $$;

-- 2. Normalizar valores conocidos (por si vienen con mayúsculas / variantes)
UPDATE profiles SET role = lower(role) WHERE role IS NOT NULL;

-- 3. Mapear null o vacío a 'unknown'
UPDATE profiles SET role = 'unknown' WHERE role IS NULL OR trim(role) = '';

-- 4. Validar que ya no queden valores fuera del set permitido
-- (Opcional) SELECT DISTINCT role FROM profiles WHERE role NOT IN ('admin','supervisor','conquista','control-interno','televenta','asesor_dinamico','unknown');

-- 5. Alterar tipo si sigue siendo text
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='profiles' AND column_name='role' AND udt_name <> 'user_role'
  ) THEN
    ALTER TABLE profiles ALTER COLUMN role TYPE user_role USING 
      CASE 
        WHEN role IS NULL OR trim(role) = '' THEN 'unknown'
        ELSE role
      END::user_role;
  END IF;
END $$;

-- 6. (Opcional) Si más adelante quieres eliminar 'unknown', primero asigna roles reales y luego:
-- ALTER TYPE user_role RENAME VALUE 'unknown' TO 'deprecated_unknown'; (no se puede eliminar directamente en versiones actuales)

-- Fin migración
