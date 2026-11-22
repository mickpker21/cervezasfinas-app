-- Asegurar explícitamente que 'supervisor' puede leer todos los clientes bajo RLS

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'clients'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY';
    EXCEPTION WHEN others THEN NULL;
    END;
  ELSE
    RAISE NOTICE 'Tabla public.clients no existe; omitiendo.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'clients'
      AND policyname = 'clients_select_supervisor'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY clients_select_supervisor ON public.clients
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
