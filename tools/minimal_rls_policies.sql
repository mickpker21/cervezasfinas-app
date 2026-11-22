-- =============================================================
-- Minimal RLS / Policies Baseline (sin recursion) 
-- Tablas cubiertas: profiles, clients, visitas, client_photos, client_sales
-- Ajusta nombres de columnas si difieren (owner_id, user_id, client_id, internal_route, sales_route)
-- Ejecutar completo en Supabase SQL editor.
-- =============================================================

BEGIN;

---------------------------------------------------------------
-- 1. Funciones helper basadas SOLO en JWT (no consultan tablas)
---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jwt_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(trim(lower(coalesce(
    auth.jwt() ->> 'role',
    auth.jwt() #>> '{user_metadata,role}',
    auth.jwt() #>> '{user_metadata,type}',
    auth.jwt() #>> '{app_metadata,role}'
  ))), '')
$$;

CREATE OR REPLACE FUNCTION public.jwt_route()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    auth.jwt() #>> '{user_metadata,route}',
    auth.jwt() ->> 'route'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT jwt_role() LIKE 'admin%'; $$;
CREATE OR REPLACE FUNCTION public.is_control_interno()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT jwt_role() IN ('control-interno','control interno'); $$;
CREATE OR REPLACE FUNCTION public.is_conquista()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT jwt_role() = 'conquista'; $$;
CREATE OR REPLACE FUNCTION public.is_televenta()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT jwt_role() = 'televenta'; $$;
CREATE OR REPLACE FUNCTION public.is_asesor_dinamico()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT jwt_role() IN ('asesor_dinamico','asesor-dinamico'); $$;

-- Si no se usa supervisor, comentar; si se usa y debe ver todo, dejar simple.
CREATE OR REPLACE FUNCTION public.is_supervisor()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT jwt_role() = 'supervisor'; $$;
CREATE OR REPLACE FUNCTION public.is_gerente()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT jwt_role() = 'gerente'; $$;


-- Accesos por ruta (internal_route / sales_route)
CREATE OR REPLACE FUNCTION public.user_route()
RETURNS text LANGUAGE sql STABLE AS $$ SELECT jwt_route(); $$;

---------------------------------------------------------------
-- 2. Activar RLS (idempotente)
---------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_sales ENABLE ROW LEVEL SECURITY;

---------------------------------------------------------------
-- 3. Limpiar policies existentes en tablas objetivo
---------------------------------------------------------------
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname='public'
             AND tablename IN ('profiles','clients','visitas','client_photos','client_sales') LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP; END $$;

---------------------------------------------------------------
-- 4. PROFILES (mínimo seguro)
---------------------------------------------------------------
-- Leer tu propio perfil
CREATE POLICY profiles_select_self ON public.profiles
  FOR SELECT USING (id = auth.uid());
-- Admin / control interno leen todos
CREATE POLICY profiles_select_admin_ci ON public.profiles
  FOR SELECT USING (is_admin() OR is_control_interno());
-- Actualizarse uno mismo
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
-- Admin puede actualizar / insertar / borrar
CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY profiles_insert_admin ON public.profiles
  FOR INSERT WITH CHECK (is_admin());
CREATE POLICY profiles_delete_admin ON public.profiles
  FOR DELETE USING (is_admin());

-- Fallback adicional (solo claims, sin consultar la propia tabla) por si jwt_role() falla:
-- Usa user_metadata.type directamente para permitir admin / control interno leer todos.
CREATE POLICY profiles_select_type_admin_ci_fallback ON public.profiles
  FOR SELECT USING (
    lower(coalesce(auth.jwt() #>> '{user_metadata,type}','')) IN ('admin','control-interno','control interno')
  );

-- (Opcional) Fallback por email específico (ajusta correos si necesitas múltiples admins)
-- CREATE POLICY profiles_select_admin_email_fallback ON public.profiles
--   FOR SELECT USING (auth.jwt() ->> 'email' IN ('admin@demo.com'));

-- Función de depuración (ejecutar vía RPC para ver los claims reales que llega el frontend)
CREATE OR REPLACE FUNCTION public.debug_claims()
RETURNS TABLE(
  raw_jwt json,
  claim_role text,
  claim_app_role text,
  claim_type text,
  computed_jwt_role text,
  is_admin_flag boolean,
  control_flag boolean,
  conquest_flag boolean
) LANGUAGE sql STABLE AS $$
  SELECT auth.jwt(),
         auth.jwt() ->> 'role',
         auth.jwt() #>> '{app_metadata,role}',
         auth.jwt() #>> '{user_metadata,type}',
         public.jwt_role(),
         public.is_admin(),
         public.is_control_interno(),
         public.is_conquista();
$$;

---------------------------------------------------------------
-- 5. CLIENTS (reglas básicas por rol / ownership)
---------------------------------------------------------------
-- Ver todos: admin + control interno
CREATE POLICY clients_select_admin_ci ON public.clients
  FOR SELECT USING (is_admin() OR is_control_interno());
-- Conquista: solo sus propios clientes (ownership)
CREATE POLICY clients_select_conquista ON public.clients
  FOR SELECT USING (is_conquista() AND owner_id = auth.uid());
-- Televenta por sales_route (sin cambios)
CREATE POLICY clients_select_televenta ON public.clients
  FOR SELECT USING (is_televenta() AND sales_route = user_route());
-- Asesor dinámico solo los que posee
CREATE POLICY clients_select_asesor ON public.clients
  FOR SELECT USING (is_asesor_dinamico() AND owner_id = auth.uid());
-- Supervisor (opcional) ver todos (comentar si no se desea)
CREATE POLICY clients_select_supervisor ON public.clients
  FOR SELECT USING (is_supervisor());
CREATE POLICY clients_select_gerente ON public.clients
  FOR SELECT USING (is_gerente());
-- (Nuevo) Cualquier usuario ve clientes donde es owner (evita depender del rol para ver propios)
CREATE POLICY clients_select_owner_generic ON public.clients
  FOR SELECT USING (owner_id = auth.uid());
-- Fallback: si el JWT no trae role, usamos profiles.role para admin / control interno
CREATE POLICY clients_select_role_profiles_fallback ON public.clients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND (
          pr.role ILIKE 'admin%'
          OR pr.role IN ('control interno','control-interno')
        )
    )
  );
-- Fallback supervisor (solo lectura)
CREATE POLICY clients_select_supervisor_profiles_fallback ON public.clients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid() AND pr.role = 'supervisor'
    )
  );

CREATE POLICY clients_select_gerente_profiles_fallback ON public.clients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid() AND pr.role = 'gerente'
    )
  );

-- Insert
CREATE POLICY clients_insert_admin ON public.clients
  FOR INSERT WITH CHECK (is_admin());
-- Conquista: puede crear clientes que pasan a ser suyos (owner_id debe ser auth.uid())
-- NOTA: Para evitar 403 cuando el frontend aún no setea owner_id, relajamos el WITH CHECK a solo is_conquista().
-- Asegura que un trigger o default establezca owner_id = auth.uid().
CREATE POLICY clients_insert_conquista ON public.clients
  FOR INSERT WITH CHECK (is_conquista());
CREATE POLICY clients_insert_asesor ON public.clients
  FOR INSERT WITH CHECK (is_asesor_dinamico() AND owner_id = auth.uid());
-- Inserción genérica: cualquier rol autenticado que provea owner_id = su uid (fallback)
CREATE POLICY clients_insert_owner_generic ON public.clients
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Update (admin o dueño / conquista sobre su ruta)
CREATE POLICY clients_update_admin ON public.clients
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY clients_update_owner ON public.clients
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
-- Conquista: actualizar solo sus propios clientes (ya cubierto por generic owner, se deja explícito)
CREATE POLICY clients_update_conquista ON public.clients
  FOR UPDATE USING (is_conquista() AND owner_id = auth.uid())
             WITH CHECK (is_conquista() AND owner_id = auth.uid());

-- Delete solo admin
CREATE POLICY clients_delete_admin ON public.clients
  FOR DELETE USING (is_admin());

---------------------------------------------------------------
-- 6. VISITAS (user_id = autor)
---------------------------------------------------------------
CREATE POLICY visitas_select_admin_ci ON public.visitas
  FOR SELECT USING (is_admin() OR is_control_interno());
CREATE POLICY visitas_select_owner ON public.visitas
  FOR SELECT USING (user_id = auth.uid());
-- Conquista ve visitas de sus propios clientes
CREATE POLICY visitas_select_conquista ON public.visitas
  FOR SELECT USING (
    is_conquista() AND EXISTS (
      SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.owner_id = auth.uid()
    )
  );
-- Supervisor ve todas las visitas
CREATE POLICY visitas_select_supervisor ON public.visitas
  FOR SELECT USING (is_supervisor());
CREATE POLICY visitas_select_gerente ON public.visitas
  FOR SELECT USING (is_gerente());
-- Fallback: admin / control interno vía profiles.role
CREATE POLICY visitas_select_role_profiles_fallback ON public.visitas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND (
          pr.role ILIKE 'admin%'
          OR pr.role IN ('control interno','control-interno')
        )
    )
  );
-- Fallback supervisor vía profiles.role
CREATE POLICY visitas_select_supervisor_profiles_fallback ON public.visitas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid() AND pr.role = 'supervisor'
    )
  );

CREATE POLICY visitas_select_gerente_profiles_fallback ON public.visitas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid() AND pr.role = 'gerente'
    )
  );

CREATE POLICY visitas_insert_owner ON public.visitas
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY visitas_insert_admin ON public.visitas
  FOR INSERT WITH CHECK (is_admin());
-- Control interno puede evaluar (crear) cualquier visita
CREATE POLICY visitas_insert_control_interno ON public.visitas
  FOR INSERT WITH CHECK (is_control_interno());

CREATE POLICY visitas_update_owner ON public.visitas
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY visitas_update_admin ON public.visitas
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
-- Control interno puede actualizar visitas (evaluaciones) de cualquiera
CREATE POLICY visitas_update_control_interno ON public.visitas
  FOR UPDATE USING (is_control_interno()) WITH CHECK (is_control_interno());

CREATE POLICY visitas_delete_owner ON public.visitas
  FOR DELETE USING (user_id = auth.uid());
CREATE POLICY visitas_delete_admin ON public.visitas
  FOR DELETE USING (is_admin());

---------------------------------------------------------------
-- 7. CLIENT_PHOTOS (lectura condicionada, insert dueño / conquista, delete dueño/admin)
---------------------------------------------------------------
CREATE POLICY client_photos_select ON public.client_photos
  FOR SELECT USING (
    is_admin() OR is_control_interno() OR EXISTS(
      SELECT 1 FROM public.clients c WHERE c.id = client_id AND (
        c.owner_id = auth.uid() OR (is_conquista() AND c.internal_route = user_route()) OR (is_televenta() AND c.sales_route = user_route()) OR is_supervisor() OR is_gerente()
      )
    )
  );

CREATE POLICY client_photos_insert ON public.client_photos
  FOR INSERT WITH CHECK (
    is_admin() OR EXISTS(
      SELECT 1 FROM public.clients c WHERE c.id = client_id AND (
        c.owner_id = auth.uid() OR (is_conquista() AND c.internal_route = user_route())
      )
    )
  );

CREATE POLICY client_photos_delete ON public.client_photos
  FOR DELETE USING (
    is_admin() OR EXISTS(
      SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.owner_id = auth.uid()
    )
  );

---------------------------------------------------------------
-- 8. CLIENT_SALES (solo lectura)
---------------------------------------------------------------
CREATE POLICY client_sales_select ON public.client_sales
  FOR SELECT USING (
    is_admin() OR is_control_interno() OR EXISTS(
      SELECT 1 FROM public.clients c WHERE c.id = client_id AND (
        c.owner_id = auth.uid() OR (is_conquista() AND c.internal_route = user_route()) OR (is_televenta() AND c.sales_route = user_route()) OR is_supervisor() OR is_gerente()
      )
    )
  );

COMMIT;

-- =============================================================
-- 9. BACKFILL DE PERFILES FALTANTES Y TRIGGER AUTO-CREACIÓN
-- Ejecutar este bloque (una sola vez) después de las policies si ves solo tu propio perfil.
-- Crea perfiles para usuarios existentes en auth.users que no tengan fila en public.profiles.
-- Además crea trigger para futuros registros.
-- =============================================================

-- Inserta perfiles faltantes (usa role desde app_metadata.role o user_metadata.type)
INSERT INTO public.profiles (id, email, role, name)
SELECT u.id,
       u.email,
       COALESCE(lower(u.raw_app_meta_data->>'role'), lower(u.raw_user_meta_data->>'type')) AS role,
       COALESCE(u.raw_user_meta_data->>'name', split_part(u.email,'@',1)) AS name
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Función trigger: crea profile al registrarse un nuevo usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles(id, email, role, name)
  VALUES (NEW.id,
          NEW.email,
          COALESCE(lower(NEW.raw_app_meta_data->>'role'), lower(NEW.raw_user_meta_data->>'type')),
          COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_handle_new_user ON auth.users;
CREATE TRIGGER trg_handle_new_user
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Verificaciones sugeridas:
-- SELECT count(*) perfiles_existentes FROM public.profiles;
-- SELECT count(*) usuarios_totales FROM auth.users;
-- SELECT * FROM public.profiles LIMIT 5;

-- Pruebas rápidas sugeridas (ejecutar manualmente después):
-- SELECT jwt_role(), user_route();
-- SELECT count(*) FROM public.clients;
-- SELECT count(*) FROM public.visitas;
-- SELECT count(*) FROM public.client_photos;
-- SELECT count(*) FROM public.client_sales;

-- Rollback de policies (manteniendo funciones):
-- DO $$ DECLARE r record; BEGIN
--   FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' AND tablename IN ('profiles','clients','visitas','client_photos','client_sales') LOOP
--     EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
--   END LOOP; END $$;
