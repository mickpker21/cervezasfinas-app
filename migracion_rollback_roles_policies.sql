-- ================================
-- ROLLBACK SCRIPT (defensivo)
-- Revertir cambios: enum user_role, funciones jwt_role_*, vista debug_current_role,
-- tabla logs_admin_actions y sus policies, funciones helper adicionales.
-- Ajusta/quita secciones según lo que realmente quieras revertir.
-- ================================

BEGIN;

-- 0. (Opcional) Inspección (ejecutar aparte si quieres)
-- SELECT * FROM information_schema.columns WHERE table_name='profiles' AND column_name='role';
-- SELECT DISTINCT role FROM profiles;
-- SELECT proname FROM pg_proc WHERE proname IN ('jwt_role_text','jwt_role_enum','is_supervisor','is_control_interno','is_conquista','record_admin_action');
-- SELECT policyname, tablename FROM pg_policies WHERE tablename IN ('clients','logs_admin_actions','visitas','evaluaciones','profiles');

-- 1. Vista diagnóstica
DROP VIEW IF EXISTS public.debug_current_role;

-- 2. Policies de logs_admin_actions
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename='logs_admin_actions' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.logs_admin_actions;', r.policyname);
  END LOOP;
END $$;

-- 3. Backup y drop condicional de logs_admin_actions
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'logs_admin_actions' AND n.nspname = 'public'
  ) THEN
    RAISE NOTICE 'logs_admin_actions existe: creando backup y eliminando...';
    DROP TABLE IF EXISTS public.logs_admin_actions_backup;
    EXECUTE 'CREATE TABLE public.logs_admin_actions_backup AS SELECT * FROM public.logs_admin_actions';
    DROP TABLE IF EXISTS public.logs_admin_actions;
  ELSE
    RAISE NOTICE 'logs_admin_actions NO existe: se omite backup y drop.';
  END IF;
END$$;

-- 4. Drop funciones nuevas
DROP FUNCTION IF EXISTS public.jwt_role_enum();
DROP FUNCTION IF EXISTS public.jwt_role_text();
DROP FUNCTION IF EXISTS public.is_supervisor();
DROP FUNCTION IF EXISTS public.is_control_interno();
DROP FUNCTION IF EXISTS public.is_conquista();
DROP FUNCTION IF EXISTS public.record_admin_action(uuid,text,text,uuid,jsonb);
-- Quitar la versión actual de is_admin para reemplazarla por una simple
-- NO eliminar is_admin si hay policies dependientes; lo sobrescribimos directamente
-- DROP FUNCTION IF EXISTS public.is_admin(); -- (comentado para evitar 2BP01)

-- 5. Restaurar is_admin simple (basada en claims previos)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT (
    lower(coalesce(auth.jwt()->>'role','')) = 'admin'
    OR lower(coalesce(auth.jwt()#>>'{user_metadata,role}','')) = 'admin'
    OR lower(coalesce(auth.jwt()#>>'{user_metadata,type}','')) = 'admin'
  )
$$;

-- 6. Limpiar / ajustar policies en clients (DESCOMENTA según necesidad)
-- Ejemplos de drop (personaliza nombres exactos si difieren):
-- DROP POLICY IF EXISTS clients_select_control_interno ON public.clients;
-- DROP POLICY IF EXISTS clients_select_admin ON public.clients;
-- DROP POLICY IF EXISTS clients_select_supervisor ON public.clients;
-- Policy temporal abierta (quitar después):
-- CREATE POLICY clients_select_all_temp ON public.clients FOR SELECT USING (true);

-- 7. Ajustar policies que usen jwt_role_enum() en otras tablas (visitas / evaluaciones)
-- Ejemplo genérico (editar names):
-- ALTER POLICY visitas_supervisor_read ON public.visitas USING (
--   lower(coalesce(auth.jwt()->>'role','')) = 'supervisor'
--   OR lower(coalesce(auth.jwt()#>>'{user_metadata,role}','')) = 'supervisor'
--   OR lower(coalesce(auth.jwt()#>>'{user_metadata,type}','')) = 'supervisor'
--   OR public.is_admin()
-- );

-- 8. Convertir profiles.role a text si hoy es enum user_role
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='profiles' AND column_name='role' AND udt_name='user_role'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN role TYPE text USING role::text;
  END IF;
END $$;

-- 9. Intentar eliminar enum user_role (si ya no hay dependencias)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname='user_role') THEN
    BEGIN
      DROP TYPE user_role;
    EXCEPTION WHEN dependent_objects_still_exist THEN
      RAISE NOTICE 'No se pudo eliminar user_role: dependencias existentes.';
    END;
  END IF;
END $$;

COMMIT;

-- Versión rollback v2 (sección 3 segura)

-- ================================
-- Post pasos manuales:
--  * Revisar policies vigentes: SELECT policyname, tablename FROM pg_policies;
--  * Volver a iniciar sesión (logout/login) para regenerar JWT limpio.
--  * Reponer sólo las policies necesarias.
-- ================================
