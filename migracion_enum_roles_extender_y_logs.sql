-- Migración complementaria: extender enum user_role y completar creación de logs
-- Úsala después del error 22P02 (valor 'televenta' / 'asesor_dinamico').

-- 1. Agregar valores faltantes al enum existente (si ya fue creado con menos valores)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    BEGIN EXECUTE 'ALTER TYPE user_role ADD VALUE IF NOT EXISTS ' || quote_literal('televenta'); EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN EXECUTE 'ALTER TYPE user_role ADD VALUE IF NOT EXISTS ' || quote_literal('asesor_dinamico'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  ELSE
    CREATE TYPE user_role AS ENUM ('admin','supervisor','conquista','control-interno','televenta','asesor_dinamico');
  END IF;
END $$;

-- 2. Normalizar valores previos en profiles.role (sigue siendo text si ALTER falló)
UPDATE profiles SET role = 'control-interno' WHERE lower(role) IN ('control interno','control-interno');
UPDATE profiles SET role = 'conquista' WHERE lower(role) IN ('conquista');
UPDATE profiles SET role = 'supervisor' WHERE lower(role) IN ('supervisor','sup');
UPDATE profiles SET role = 'admin' WHERE lower(role) IN ('admin','administrator');
UPDATE profiles SET role = 'televenta' WHERE lower(role) IN ('televenta','telesales','tele-venta');
UPDATE profiles SET role = 'asesor_dinamico' WHERE lower(role) IN ('asesor_dinamico','asesor-dinamico','dynamic','dynamic_advisor');

-- 3. Alterar columna si aún no es enum
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'role' AND udt_name <> 'user_role'
  ) THEN
    ALTER TABLE profiles ALTER COLUMN role TYPE user_role USING lower(role)::user_role;
  END IF;
END $$;

-- 4. Extensión uuid
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 5. Crear tabla logs si falta
CREATE TABLE IF NOT EXISTS public.logs_admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. RLS
ALTER TABLE public.logs_admin_actions ENABLE ROW LEVEL SECURITY;

-- 7. Función para registrar acciones
CREATE OR REPLACE FUNCTION public.record_admin_action(
  p_admin_id uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_details jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.logs_admin_actions(admin_id, action, entity, entity_id, details)
  VALUES (p_admin_id, p_action, p_entity, p_entity_id, p_details);
END;$$;

-- 8. Políticas admin
DROP POLICY IF EXISTS logs_admin_actions_select_admin ON public.logs_admin_actions;
CREATE POLICY logs_admin_actions_select_admin ON public.logs_admin_actions
  FOR SELECT USING ( public.is_admin() );

DROP POLICY IF EXISTS logs_admin_actions_insert_admin ON public.logs_admin_actions;
CREATE POLICY logs_admin_actions_insert_admin ON public.logs_admin_actions
  FOR INSERT WITH CHECK ( public.is_admin() );

DROP POLICY IF EXISTS logs_admin_actions_update_admin ON public.logs_admin_actions;
CREATE POLICY logs_admin_actions_update_admin ON public.logs_admin_actions
  FOR UPDATE USING ( public.is_admin() ) WITH CHECK ( public.is_admin() );

DROP POLICY IF EXISTS logs_admin_actions_delete_admin ON public.logs_admin_actions;
CREATE POLICY logs_admin_actions_delete_admin ON public.logs_admin_actions
  FOR DELETE USING ( public.is_admin() );

-- Fin migración complementaria
