-- Admin puede ver/editar/eliminar todas las visitas
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN others THEN NULL; END;

  -- SELECT para admin
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='visitas' AND policyname='visitas_select_admin'
  ) THEN
    EXECUTE 'CREATE POLICY visitas_select_admin ON public.visitas FOR SELECT TO authenticated USING (public.is_admin())';
  END IF;

  -- UPDATE para admin
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='visitas' AND policyname='visitas_update_admin'
  ) THEN
    EXECUTE 'CREATE POLICY visitas_update_admin ON public.visitas FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())';
  END IF;

  -- DELETE para admin
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='visitas' AND policyname='visitas_delete_admin'
  ) THEN
    EXECUTE 'CREATE POLICY visitas_delete_admin ON public.visitas FOR DELETE TO authenticated USING (public.is_admin())';
  END IF;
END $$;
