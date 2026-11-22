-- Admin puede actualizar/eliminar clientes
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN others THEN NULL; END;

  -- UPDATE para admin
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='clients' AND policyname='clients_update_admin'
  ) THEN
    EXECUTE 'CREATE POLICY clients_update_admin ON public.clients FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())';
  END IF;

  -- DELETE para admin
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='clients' AND policyname='clients_delete_admin'
  ) THEN
    EXECUTE 'CREATE POLICY clients_delete_admin ON public.clients FOR DELETE TO authenticated USING (public.is_admin())';
  END IF;
END $$;
