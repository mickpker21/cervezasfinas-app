-- Admin puede ver todos los clientes (SELECT)
DO $$
BEGIN
  -- Asegurar RLS habilitado en clients
  BEGIN
    EXECUTE 'ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN others THEN NULL; END;

  -- SELECT para admin (usa la función centralizada public.is_admin())
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='clients' AND policyname='clients_select_admin'
  ) THEN
    EXECUTE 'CREATE POLICY clients_select_admin ON public.clients FOR SELECT TO authenticated USING (public.is_admin())';
  END IF;
END $$;
