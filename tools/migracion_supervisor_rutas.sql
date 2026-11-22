-- Permisos de rutas por supervisor y RLS para filtrar clientes por rutas asignadas
-- Idempotente y acotado a rol supervisor

-- 1) Tablas de permisos
CREATE TABLE IF NOT EXISTS public.supervisor_allowed_routes (
  supervisor_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  route text NOT NULL,
  PRIMARY KEY (supervisor_id, route)
);

CREATE TABLE IF NOT EXISTS public.supervisor_allowed_sales_routes (
  supervisor_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  sales_route text NOT NULL,
  PRIMARY KEY (supervisor_id, sales_route)
);

-- 2) Función para evaluar si un supervisor puede ver un cliente
CREATE OR REPLACE FUNCTION public.supervisor_can_see_client(c public.clients)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid() AND lower(coalesce(p.role,'')) = 'supervisor'
  ) AND (
    EXISTS (
      SELECT 1 FROM public.supervisor_allowed_routes ar
      WHERE ar.supervisor_id = auth.uid() AND ar.route = coalesce(c.internal_route, '')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.supervisor_allowed_sales_routes asr
      WHERE asr.supervisor_id = auth.uid() AND asr.sales_route = coalesce(c.sales_route, '')
    )
  );
$$;

-- 3) Políticas RLS en clients para supervisor (reemplaza la previa si existía)
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN others THEN NULL; END;

  -- Elimina política vieja si existía
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='clients' AND policyname='clients_select_supervisor'
  ) THEN
    EXECUTE 'DROP POLICY clients_select_supervisor ON public.clients';
  END IF;

  -- Crea la política restringida
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='clients' AND policyname='clients_select_supervisor_restringido'
  ) THEN
    EXECUTE 'CREATE POLICY clients_select_supervisor_restringido ON public.clients FOR SELECT TO authenticated USING (public.supervisor_can_see_client(clients))';
  END IF;

  -- Opcional: si existiera una política demasiado permisiva "Authenticated users can read clients", eliminarla
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='clients' AND policyname='Authenticated users can read clients'
  ) THEN
    EXECUTE 'DROP POLICY "Authenticated users can read clients" ON public.clients';
  END IF;
END $$;

-- 4) Políticas para que admin pueda gestionar permisos de rutas
DO $$
BEGIN
  -- Rutas internas
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supervisor_allowed_routes' AND policyname='supervisor_allowed_routes_admin_all'
  ) THEN
    EXECUTE 'CREATE POLICY supervisor_allowed_routes_admin_all ON public.supervisor_allowed_routes FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())';
  END IF;
  -- Rutas de venta
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supervisor_allowed_sales_routes' AND policyname='supervisor_allowed_sales_routes_admin_all'
  ) THEN
    EXECUTE 'CREATE POLICY supervisor_allowed_sales_routes_admin_all ON public.supervisor_allowed_sales_routes FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())';
  END IF;
END $$;

-- 5) service_role acceso total (para tareas batch si aplica)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supervisor_allowed_routes' AND policyname='supervisor_allowed_routes_service_role'
  ) THEN
    EXECUTE 'CREATE POLICY supervisor_allowed_routes_service_role ON public.supervisor_allowed_routes FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supervisor_allowed_sales_routes' AND policyname='supervisor_allowed_sales_routes_service_role'
  ) THEN
    EXECUTE 'CREATE POLICY supervisor_allowed_sales_routes_service_role ON public.supervisor_allowed_sales_routes FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;
