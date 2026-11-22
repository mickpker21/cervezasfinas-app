-- Migración: funciones seguras para roles y actualización de policies

-- 1. Función base: texto de role desde JWT (role o type en user_metadata)
CREATE OR REPLACE FUNCTION public.jwt_role_text()
RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(COALESCE(
    auth.jwt()->>'role',
    auth.jwt()#>>'{user_metadata,role}',
    auth.jwt()#>>'{user_metadata,type}',
    ''), '')
$$;

-- 2. Función enum seguro
CREATE OR REPLACE FUNCTION public.jwt_role_enum()
RETURNS user_role
LANGUAGE plpgsql STABLE AS $$
DECLARE
  r text := public.jwt_role_text();
BEGIN
  IF r IS NULL THEN
    RETURN 'unknown'::user_role; -- debe existir en enum
  END IF;
  IF r = ANY(ARRAY['admin','supervisor','conquista','control-interno','televenta','asesor_dinamico','unknown']) THEN
    RETURN r::user_role;
  END IF;
  RETURN 'unknown'::user_role;
END;$$;

-- 3. Reemplazar is_admin y helpers
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.jwt_role_enum() = 'admin'::user_role $$;
CREATE OR REPLACE FUNCTION public.is_supervisor()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.jwt_role_enum() = 'supervisor'::user_role $$;
CREATE OR REPLACE FUNCTION public.is_control_interno()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.jwt_role_enum() = 'control-interno'::user_role $$;
CREATE OR REPLACE FUNCTION public.is_conquista()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.jwt_role_enum() = 'conquista'::user_role $$;

-- 4. Vista diagnóstica
CREATE OR REPLACE VIEW public.debug_current_role AS
  SELECT public.jwt_role_text() AS raw_text_role, public.jwt_role_enum() AS enum_role;

-- 5. NOTA: Actualizar policies existentes para usar public.jwt_role_enum()
-- Ejemplo:
-- ALTER POLICY clients_select_control_interno ON public.clients USING (
--   public.jwt_role_enum() IN ('control-interno','admin')
-- );

-- Fin migración
