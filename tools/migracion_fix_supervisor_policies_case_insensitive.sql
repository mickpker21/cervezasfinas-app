-- Actualiza/crea policies para que reconozcan 'Supervisor' sin importar mayúsculas
-- Idempotente: elimina las policies antiguas (sensibles a mayúsculas) y crea nuevas con lower()

-- Asegurar RLS habilitado en tablas objetivo
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='evaluaciones_pdv') THEN
    BEGIN EXECUTE 'ALTER TABLE public.evaluaciones_pdv ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN NULL; END;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='visitas') THEN
    BEGIN EXECUTE 'ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN NULL; END;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clients') THEN
    BEGIN EXECUTE 'ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN NULL; END;
  END IF;
END $$;

-- evaluaciones_pdv: DROP si existe la policy antigua y CREATE con lower()
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='evaluaciones_pdv' AND policyname='evaluaciones_select_supervisor'
  ) THEN
    EXECUTE 'DROP POLICY evaluaciones_select_supervisor ON public.evaluaciones_pdv';
  END IF;

  EXECUTE $policy$
    CREATE POLICY evaluaciones_select_supervisor ON public.evaluaciones_pdv
    FOR SELECT TO authenticated
    USING (
      COALESCE(LOWER((auth.jwt() -> 'user_metadata' ->> 'type')) = 'supervisor', false)
    )
  $policy$;
END $$;

-- visitas: DROP si existe la policy antigua y CREATE con lower()
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='visitas' AND policyname='visitas_select_supervisor'
  ) THEN
    EXECUTE 'DROP POLICY visitas_select_supervisor ON public.visitas';
  END IF;

  EXECUTE $policy$
    CREATE POLICY visitas_select_supervisor ON public.visitas
    FOR SELECT TO authenticated
    USING (
      COALESCE(LOWER((auth.jwt() -> 'user_metadata' ->> 'type')) = 'supervisor', false)
    )
  $policy$;
END $$;

-- clients: agrega una policy adicional basada en JWT (no interfiere con otras)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='clients' AND policyname='clients_select_supervisor_jwt'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY clients_select_supervisor_jwt ON public.clients
      FOR SELECT TO authenticated
      USING (
        COALESCE(LOWER((auth.jwt() -> 'user_metadata' ->> 'type')) = 'supervisor', false)
      )
    $policy$;
  END IF;
END $$;
