-- Permitir que usuarios con user_metadata.type = 'supervisor' LEAN todas las visitas (solo lectura)
-- Idempotente y compatible con RLS existente

-- Asegurar que la tabla existe y RLS esté habilitado
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'visitas'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY';
    EXCEPTION WHEN others THEN
      NULL;
    END;
  ELSE
    RAISE NOTICE 'Tabla public.visitas no existe; omitiendo.';
  END IF;
END $$;

-- Policy de solo lectura para Supervisores (se OR-ea con otras policies de SELECT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'visitas'
      AND policyname = 'visitas_select_supervisor'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY visitas_select_supervisor ON public.visitas
      FOR SELECT TO authenticated
      USING ( coalesce((auth.jwt() -> 'user_metadata' ->> 'type') = 'supervisor', false) )
    $policy$;
  END IF;
END $$;
