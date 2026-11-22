-- Policy para que usuarios de 'control interno' puedan leer todos los clientes
-- Idempotente
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN others THEN NULL; END;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='clients'
      AND policyname='clients_select_control_interno'
  ) THEN
    EXECUTE $$
      CREATE POLICY clients_select_control_interno ON public.clients
      FOR SELECT TO authenticated
      USING (
        -- Variantes en claims directos o user_metadata.type
        lower(coalesce(auth.jwt() ->> 'role','')) LIKE 'control-interno%'
        OR lower(coalesce(auth.jwt() #>> '{user_metadata,type}','')) LIKE 'control-interno%'
        OR lower(coalesce(auth.jwt() #>> '{user_metadata,type}','')) = 'control interno'
        OR lower(coalesce(auth.jwt() #>> '{user_metadata,role}','')) LIKE 'control-interno%'
      );
    $$;
  END IF;
END $$;
