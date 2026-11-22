-- Permitir SELECT de todas las evaluaciones a usuarios cuyo profiles.role = 'supervisor' (case-insensitive)
-- Más robusto que depender del claim en JWT

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'evaluaciones_pdv'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE public.evaluaciones_pdv ENABLE ROW LEVEL SECURITY';
    EXCEPTION WHEN others THEN NULL;
    END;
  ELSE
    RAISE NOTICE 'Tabla public.evaluaciones_pdv no existe; omitiendo.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'evaluaciones_pdv'
      AND policyname = 'evaluaciones_select_supervisor_profiles'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY evaluaciones_select_supervisor_profiles ON public.evaluaciones_pdv
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND lower(p.role) = 'supervisor'
        )
      )
    $policy$;
  END IF;
END $$;
