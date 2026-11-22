-- Endurece el trigger de profiles y corrige políticas para evitar errores al crear usuarios en Auth
-- Seguro para re-ejecutar (idempotente)

-- 1) Asegurar RLS habilitado y no forzado (para permitir bypass del owner/postgres en SECURITY DEFINER)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles NO FORCE ROW LEVEL SECURITY;

-- 2) Asegurar columnas necesarias
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS route TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 3) Trigger robusto con SECURITY DEFINER y search_path explícito
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, route, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'role',''), NEW.raw_user_meta_data->>'type', ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'route',''), NEW.raw_user_meta_data->>'route_number', ''),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        name = COALESCE(NULLIF(EXCLUDED.name,''), public.profiles.name),
        role = COALESCE(NULLIF(EXCLUDED.role,''), public.profiles.role),
        route = COALESCE(NULLIF(EXCLUDED.route,''), public.profiles.route);
  RETURN NEW;
END;
$$;

-- Opcional: asegurar owner postgres para BYPASSRLS
DO $$ BEGIN
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE proname = 'handle_new_user') <> 'postgres' THEN
    ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
  END IF;
END $$;

-- 4) Re-crear trigger en auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5) Políticas: permitir a admin y service_role operar sobre profiles
-- Admin (via JWT/policies): SELECT/UPDATE ya agregadas en otra migración; aquí añadimos INSERT por consistencia
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_insert_admin'
  ) THEN
  EXECUTE 'CREATE POLICY profiles_insert_admin ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.is_admin())';
  END IF;
END $$;

-- service_role (clave de servicio): inserción/actualización/selección sin restricciones
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_all_service_role'
  ) THEN
    EXECUTE 'CREATE POLICY profiles_all_service_role ON public.profiles FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- 6) Verificaciones rápidas (opcionales):
-- SELECT relrowsecurity, relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='profiles';
-- SELECT tgname FROM pg_trigger WHERE tgname='on_auth_user_created';
-- SELECT proname, prosecdef AS security_definer FROM pg_proc WHERE proname='handle_new_user';
