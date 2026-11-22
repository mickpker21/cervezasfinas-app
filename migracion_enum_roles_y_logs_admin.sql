-- Migración: Enum de roles y tabla de auditoría de acciones admin
-- Ejecutar en Supabase

-- 1. Crear enum user_role (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('admin','supervisor','conquista','control-interno');
  END IF;
END $$;

-- 2. Normalizar valores actuales en profiles.role a minúsculas con guiones esperados
UPDATE profiles SET role = 'control-interno' WHERE lower(role) IN ('control interno','control-interno');
UPDATE profiles SET role = 'conquista' WHERE lower(role) IN ('conquista');
UPDATE profiles SET role = 'supervisor' WHERE lower(role) IN ('supervisor','sup');
UPDATE profiles SET role = 'admin' WHERE lower(role) IN ('admin','administrator');

-- 3. Alterar tipo de columna a enum (si aún es text)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'role' AND udt_name <> 'user_role'
  ) THEN
    ALTER TABLE profiles ALTER COLUMN role TYPE user_role USING lower(role)::user_role;
  END IF;
END $$;

-- 4. Extensión para uuid (si no está)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 5. Tabla de logs (idempotente gentil)
CREATE TABLE IF NOT EXISTS public.logs_admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Habilitar RLS
ALTER TABLE public.logs_admin_actions ENABLE ROW LEVEL SECURITY;

-- 7. Crear función utilitaria (SECURITY DEFINER) para insertar logs desde SQL si se desea
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

-- 8. Políticas: sólo admin puede ver e insertar
DROP POLICY IF EXISTS logs_admin_actions_select_admin ON public.logs_admin_actions;
CREATE POLICY logs_admin_actions_select_admin ON public.logs_admin_actions
  FOR SELECT USING ( public.is_admin() );

DROP POLICY IF EXISTS logs_admin_actions_insert_admin ON public.logs_admin_actions;
CREATE POLICY logs_admin_actions_insert_admin ON public.logs_admin_actions
  FOR INSERT WITH CHECK ( public.is_admin() );

-- (Opcional) evitar UPDATE/DELETE directos salvo admin
DROP POLICY IF EXISTS logs_admin_actions_update_admin ON public.logs_admin_actions;
CREATE POLICY logs_admin_actions_update_admin ON public.logs_admin_actions
  FOR UPDATE USING ( public.is_admin() ) WITH CHECK ( public.is_admin() );

DROP POLICY IF EXISTS logs_admin_actions_delete_admin ON public.logs_admin_actions;
CREATE POLICY logs_admin_actions_delete_admin ON public.logs_admin_actions
  FOR DELETE USING ( public.is_admin() );

-- Fin migración
