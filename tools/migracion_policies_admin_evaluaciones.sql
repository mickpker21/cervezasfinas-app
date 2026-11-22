-- Actualiza las policies de evaluaciones_pdv para usar public.is_admin()
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='evaluaciones_pdv'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE public.evaluaciones_pdv ENABLE ROW LEVEL SECURITY';
    EXCEPTION WHEN others THEN NULL; END;

    -- Reemplazar policies con versión que usa is_admin()
    IF EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='evaluaciones_pdv' AND policyname='evaluaciones_select_own_or_admin'
    ) THEN
      EXECUTE 'DROP POLICY evaluaciones_select_own_or_admin ON public.evaluaciones_pdv';
    END IF;
    EXECUTE $$
      CREATE POLICY evaluaciones_select_own_or_admin ON public.evaluaciones_pdv
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id OR public.is_admin());
    $$;

    IF EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='evaluaciones_pdv' AND policyname='evaluaciones_insert_own_or_admin'
    ) THEN
      EXECUTE 'DROP POLICY evaluaciones_insert_own_or_admin ON public.evaluaciones_pdv';
    END IF;
    EXECUTE $$
      CREATE POLICY evaluaciones_insert_own_or_admin ON public.evaluaciones_pdv
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id OR public.is_admin());
    $$;

    IF EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='evaluaciones_pdv' AND policyname='evaluaciones_update_own_or_admin'
    ) THEN
      EXECUTE 'DROP POLICY evaluaciones_update_own_or_admin ON public.evaluaciones_pdv';
    END IF;
    EXECUTE $$
      CREATE POLICY evaluaciones_update_own_or_admin ON public.evaluaciones_pdv
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id OR public.is_admin())
      WITH CHECK (auth.uid() = user_id OR public.is_admin());
    $$;

    IF EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='evaluaciones_pdv' AND policyname='evaluaciones_delete_own_or_admin'
    ) THEN
      EXECUTE 'DROP POLICY evaluaciones_delete_own_or_admin ON public.evaluaciones_pdv';
    END IF;
    EXECUTE $$
      CREATE POLICY evaluaciones_delete_own_or_admin ON public.evaluaciones_pdv
      FOR DELETE TO authenticated
      USING (auth.uid() = user_id OR public.is_admin());
    $$;
  END IF;
END $$;
