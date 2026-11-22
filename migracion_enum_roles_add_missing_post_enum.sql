-- Migración para añadir valores faltantes al enum user_role cuando la columna ya es enum
-- Soluciona error: function lower(user_role) does not exist
-- Usa role::text para comparaciones y no invoca lower() sobre enum

-- 1. Agregar valores si faltan
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    BEGIN EXECUTE 'ALTER TYPE user_role ADD VALUE IF NOT EXISTS ' || quote_literal('televenta'); EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN EXECUTE 'ALTER TYPE user_role ADD VALUE IF NOT EXISTS ' || quote_literal('asesor_dinamico'); EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN EXECUTE 'ALTER TYPE user_role ADD VALUE IF NOT EXISTS ' || quote_literal('unknown'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  ELSE
    RAISE EXCEPTION 'El tipo user_role no existe todavía';
  END IF;
END $$;

-- 2. (Opcional) Mapear variantes antiguas si persisten en texto (no debería suceder si ya es enum)
-- UPDATE profiles SET role = 'control-interno' WHERE role::text = 'control interno';

-- 3. Asegurar que no haya NULL: asignar 'unknown'
UPDATE profiles SET role = 'unknown' WHERE role IS NULL;

-- 4. Verificación rápida (ejecutar manual):
-- SELECT unnest(enum_range(NULL::user_role));
-- SELECT DISTINCT role FROM profiles ORDER BY 1;

-- Fin
