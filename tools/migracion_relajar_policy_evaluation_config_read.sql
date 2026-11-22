-- Relaja la policy de lectura en evaluation_config para que TODOS los usuarios autenticados puedan leerla
-- Esto permite que los cambios del panel de admin se reflejen en tiempo real en la evaluación (p. ej., Surtido)

DO $$
BEGIN
  -- Asegurar que la tabla existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'evaluation_config'
  ) THEN
    RAISE NOTICE 'La tabla public.evaluation_config no existe; omitiendo cambios de policies.';
    RETURN;
  END IF;

  -- Habilitar RLS por seguridad (si no estuviera ya habilitado)
  BEGIN
    EXECUTE 'ALTER TABLE public.evaluation_config ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN others THEN
    -- ignorar si ya está habilitado
    NULL;
  END;

  -- Eliminar policy de lectura solo-admin si existe
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'evaluation_config' AND policyname = 'evaluation_config_read_admin'
  ) THEN
    BEGIN
      EXECUTE 'DROP POLICY IF EXISTS "evaluation_config_read_admin" ON public.evaluation_config';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'No se pudo eliminar policy evaluation_config_read_admin: %', SQLERRM;
    END;
  END IF;

  -- Crear policy de lectura para todos los usuarios autenticados
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'evaluation_config' AND policyname = 'evaluation_config_read_all'
  ) THEN
    BEGIN
      EXECUTE 'CREATE POLICY "evaluation_config_read_all" ON public.evaluation_config FOR SELECT TO authenticated USING (true)';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'No se pudo crear policy evaluation_config_read_all: %', SQLERRM;
    END;
  END IF;
END $$;
