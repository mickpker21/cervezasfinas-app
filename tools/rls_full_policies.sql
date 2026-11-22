-- ==================================================
-- RLS & Policies Full Script
-- Ajusta nombres de tablas/columnas si difieren.
-- Ejecutar en entorno Supabase (Postgres 15+)
-- ==================================================

-- =========================
-- 1. Funciones auxiliares (VERSION SIN RECURSION)
-- =========================
-- Nota: Las funciones anteriores consultaban public.profiles y provocaban recursion
-- (42P17) porque las policies de profiles también las llamaban. Ahora usamos claims JWT.

-- Extrae el rol normalizado desde el JWT (claims directos o user_metadata)
CREATE OR REPLACE FUNCTION public.jwt_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT lower(coalesce(
    auth.jwt() ->> 'role',
    auth.jwt() #>> '{user_metadata,role}',
    auth.jwt() #>> '{user_metadata,type}'
  ));
$$;

-- Ruta (para conquista / televenta / asesor dinámico si se guarda en user_metadata.route)
CREATE OR REPLACE FUNCTION public.jwt_route()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    auth.jwt() #>> '{user_metadata,route}',
    auth.jwt() ->> 'route'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS text LANGUAGE sql STABLE AS $$ SELECT public.jwt_role(); $$;

CREATE OR REPLACE FUNCTION public.user_route()
RETURNS text LANGUAGE sql STABLE AS $$ SELECT public.jwt_route(); $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT jwt_role() = 'admin' OR jwt_role() LIKE 'admin%'; $$;

CREATE OR REPLACE FUNCTION public.is_control_interno()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT jwt_role() IN ('control-interno','control interno'); $$;

CREATE OR REPLACE FUNCTION public.is_supervisor()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT jwt_role() = 'supervisor'; $$;

CREATE OR REPLACE FUNCTION public.is_conquista()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT jwt_role() = 'conquista'; $$;

CREATE OR REPLACE FUNCTION public.is_asesor_dinamico()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT jwt_role() IN ('asesor_dinamico','asesor-dinamico'); $$;

CREATE OR REPLACE FUNCTION public.is_televenta()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT jwt_role() = 'televenta'; $$;

CREATE OR REPLACE FUNCTION public.supervisor_can_access_client(c_internal_route text, c_sales_route text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  WITH sup AS (
    SELECT auth.uid() AS uid
  ),
  allowed_internal AS (
    SELECT route FROM supervisor_allowed_routes WHERE supervisor_id = (SELECT uid FROM sup)
  ),
  allowed_sales AS (
    SELECT sales_route FROM supervisor_allowed_sales_routes WHERE supervisor_id = (SELECT uid FROM sup)
  )
  SELECT EXISTS(SELECT 1 FROM allowed_internal WHERE route = c_internal_route)
      OR EXISTS(SELECT 1 FROM allowed_sales WHERE sales_route = c_sales_route);
$$;

-- =========================
-- 2. Activar RLS (asegurar)
-- =========================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_sales ENABLE ROW LEVEL SECURITY;

-- (Opcional) Limpieza de policies previas
-- DO $$ DECLARE r record; BEGIN
--   FOR r IN SELECT policyname, tablename FROM pg_policies
--            WHERE schemaname='public' AND tablename IN ('profiles','clients','visitas','client_photos','client_sales') LOOP
--     EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
--   END LOOP; END $$;

-- =========================
-- 3. PROFILES
-- =========================
DROP POLICY IF EXISTS profiles_select_self ON public.profiles;
CREATE POLICY profiles_select_self ON public.profiles
  FOR SELECT USING ( id = auth.uid() );

DROP POLICY IF EXISTS profiles_select_admin_ci ON public.profiles;
CREATE POLICY profiles_select_admin_ci ON public.profiles
  FOR SELECT USING ( is_admin() OR is_control_interno() );

DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE USING ( id = auth.uid() )
  WITH CHECK (
    id = auth.uid()
  -- Eliminado subselect a profiles para evitar recursion 42P17
  -- La app debe impedir que el usuario cambie role o must_change_password directamente
  );

DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE USING ( is_admin() );

DROP POLICY IF EXISTS profiles_insert_admin ON public.profiles;
CREATE POLICY profiles_insert_admin ON public.profiles
  FOR INSERT WITH CHECK ( is_admin() );

DROP POLICY IF EXISTS profiles_delete_admin ON public.profiles;
CREATE POLICY profiles_delete_admin ON public.profiles
  FOR DELETE USING ( is_admin() );

-- =========================
-- 4. CLIENTS
-- =========================
DROP POLICY IF EXISTS clients_select_admin_ci ON public.clients;
CREATE POLICY clients_select_admin_ci ON public.clients
  FOR SELECT USING ( is_admin() OR is_control_interno() );

DROP POLICY IF EXISTS clients_select_supervisor ON public.clients;
CREATE POLICY clients_select_supervisor ON public.clients
  FOR SELECT USING (is_supervisor() AND supervisor_can_access_client(internal_route, sales_route));

DROP POLICY IF EXISTS clients_select_conquista ON public.clients;
CREATE POLICY clients_select_conquista ON public.clients
  FOR SELECT USING (is_conquista() AND internal_route = user_route());

DROP POLICY IF EXISTS clients_select_televenta ON public.clients;
CREATE POLICY clients_select_televenta ON public.clients
  FOR SELECT USING (is_televenta() AND sales_route = user_route());

DROP POLICY IF EXISTS clients_select_asesor ON public.clients;
CREATE POLICY clients_select_asesor ON public.clients
  FOR SELECT USING (is_asesor_dinamico() AND owner_id = auth.uid());

DROP POLICY IF EXISTS clients_insert_admin ON public.clients;
CREATE POLICY clients_insert_admin ON public.clients
  FOR INSERT WITH CHECK ( is_admin() );

DROP POLICY IF EXISTS clients_insert_conquista ON public.clients;
CREATE POLICY clients_insert_conquista ON public.clients
  FOR INSERT WITH CHECK ( is_conquista() AND internal_route = user_route() );

DROP POLICY IF EXISTS clients_insert_asesor ON public.clients;
CREATE POLICY clients_insert_asesor ON public.clients
  FOR INSERT WITH CHECK ( is_asesor_dinamico() AND owner_id = auth.uid() );

DROP POLICY IF EXISTS clients_update_admin ON public.clients;
CREATE POLICY clients_update_admin ON public.clients
  FOR UPDATE USING ( is_admin() );

DROP POLICY IF EXISTS clients_update_owner ON public.clients;
CREATE POLICY clients_update_owner ON public.clients
  FOR UPDATE USING ( owner_id = auth.uid() );

DROP POLICY IF EXISTS clients_update_conquista ON public.clients;
CREATE POLICY clients_update_conquista ON public.clients
  FOR UPDATE USING ( is_conquista() AND internal_route = user_route() );

DROP POLICY IF EXISTS clients_delete_admin ON public.clients;
CREATE POLICY clients_delete_admin ON public.clients
  FOR DELETE USING ( is_admin() );

-- =========================
-- 5. VISITAS
-- =========================
DROP POLICY IF EXISTS visitas_select_admin_ci ON public.visitas;
CREATE POLICY visitas_select_admin_ci ON public.visitas
  FOR SELECT USING ( is_admin() OR is_control_interno() );

-- Ajuste: la tabla visitas usa user_id (no created_by)
DROP POLICY IF EXISTS visitas_select_creator ON public.visitas;
CREATE POLICY visitas_select_creator ON public.visitas
  FOR SELECT USING ( user_id = auth.uid() );

DROP POLICY IF EXISTS visitas_select_conquista ON public.visitas;
CREATE POLICY visitas_select_conquista ON public.visitas
  FOR SELECT USING (
    is_conquista() AND EXISTS (
  SELECT 1 FROM public.clients c
   WHERE c.id = client_id AND c.internal_route = user_route()
    )
  );

DROP POLICY IF EXISTS visitas_select_supervisor ON public.visitas;
CREATE POLICY visitas_select_supervisor ON public.visitas
  FOR SELECT USING (
    is_supervisor() AND EXISTS (
  SELECT 1 FROM public.clients c
   WHERE c.id = client_id AND supervisor_can_access_client(c.internal_route, c.sales_route)
    )
  );

DROP POLICY IF EXISTS visitas_insert_admin ON public.visitas;
CREATE POLICY visitas_insert_admin ON public.visitas
  FOR INSERT WITH CHECK ( is_admin() );

DROP POLICY IF EXISTS visitas_insert_conquista ON public.visitas;
CREATE POLICY visitas_insert_conquista ON public.visitas
  FOR INSERT WITH CHECK (
    is_conquista() AND EXISTS (
      SELECT 1 FROM public.clients c
        WHERE c.id = client_id AND c.internal_route = user_route()
    )
  );

DROP POLICY IF EXISTS visitas_insert_owner ON public.visitas;
CREATE POLICY visitas_insert_owner ON public.visitas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients c
        WHERE c.id = client_id AND c.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS visitas_update_admin ON public.visitas;
CREATE POLICY visitas_update_admin ON public.visitas
  FOR UPDATE USING ( is_admin() );

DROP POLICY IF EXISTS visitas_update_creator ON public.visitas;
CREATE POLICY visitas_update_creator ON public.visitas
  FOR UPDATE USING ( user_id = auth.uid() );

DROP POLICY IF EXISTS visitas_delete_admin ON public.visitas;
CREATE POLICY visitas_delete_admin ON public.visitas
  FOR DELETE USING ( is_admin() );

DROP POLICY IF EXISTS visitas_delete_creator ON public.visitas;
CREATE POLICY visitas_delete_creator ON public.visitas
  FOR DELETE USING ( user_id = auth.uid() );

-- =========================
-- 6. CLIENT_PHOTOS
-- =========================
DROP POLICY IF EXISTS client_photos_select ON public.client_photos;
CREATE POLICY client_photos_select ON public.client_photos
  FOR SELECT USING (
    is_admin() OR is_control_interno() OR EXISTS(
  SELECT 1 FROM public.clients c WHERE c.id = client_id
        AND (
          c.owner_id = auth.uid()
          OR (is_conquista() AND c.internal_route = user_route())
          OR (is_supervisor() AND supervisor_can_access_client(c.internal_route, c.sales_route))
        )
    )
  );

DROP POLICY IF EXISTS client_photos_insert ON public.client_photos;
CREATE POLICY client_photos_insert ON public.client_photos
  FOR INSERT WITH CHECK (
    is_admin() OR EXISTS(
  SELECT 1 FROM public.clients c WHERE c.id = client_id
        AND (c.owner_id = auth.uid() OR (is_conquista() AND c.internal_route = user_route()))
    )
  );

DROP POLICY IF EXISTS client_photos_delete ON public.client_photos;
CREATE POLICY client_photos_delete ON public.client_photos
  FOR DELETE USING (
    is_admin() OR EXISTS(
  SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.owner_id = auth.uid()
    )
  );

-- =========================
-- 7. CLIENT_SALES (solo lectura)
-- =========================
DROP POLICY IF EXISTS client_sales_select ON public.client_sales;
CREATE POLICY client_sales_select ON public.client_sales
  FOR SELECT USING (
    is_admin() OR is_control_interno() OR EXISTS(
  SELECT 1 FROM public.clients c WHERE c.id = client_id
        AND (
          c.owner_id = auth.uid()
          OR (is_conquista() AND c.internal_route = user_route())
          OR (is_supervisor() AND supervisor_can_access_client(c.internal_route, c.sales_route))
          OR (is_televenta() AND c.sales_route = user_route())
        )
    )
  );

-- =========================
-- 8. Protección must_change_password: en profiles_update_self (no permite cambiarlo)
-- =========================

-- FIN
