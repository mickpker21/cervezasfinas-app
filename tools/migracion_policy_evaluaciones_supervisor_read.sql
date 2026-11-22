-- Permitir que usuarios con user_metadata.type = 'supervisor' LEAN todas las evaluaciones
-- Idempotente y compatible con RLS existente

-- Asegurar que la tabla existe y RLS esté habilitado
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'evaluaciones_pdv'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE public.evaluaciones_pdv ENABLE ROW LEVEL SECURITY';
    EXCEPTION WHEN others THEN
      NULL;
    END;
  ELSE
    RAISE NOTICE 'Tabla public.evaluaciones_pdv no existe; omitiendo.';
  END IF;
END $$;

-- Policy de solo lectura para Supervisores (se OR-ea con otras policies de SELECT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'evaluaciones_pdv'
      AND policyname = 'evaluaciones_select_supervisor'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY evaluaciones_select_supervisor ON public.evaluaciones_pdv
      FOR SELECT TO authenticated
      USING ( coalesce((auth.jwt() -> 'user_metadata' ->> 'type') = 'supervisor', false) )
    $policy$;
  END IF;
END $$;
