-- RLS policies para public.evaluaciones_pdv (idempotentes)
-- Permite a usuarios autenticados insertar/leer/actualizar/borrar sus propias evaluaciones.
-- Admin (user_metadata.type = 'admin') puede leer/escribir todo.

-- Asegurar RLS habilitado
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'evaluaciones_pdv'
  ) THEN
    EXECUTE 'ALTER TABLE public.evaluaciones_pdv ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- SELECT: dueño o admin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'evaluaciones_pdv'
      AND policyname = 'evaluaciones_select_own_or_admin'
  ) THEN
    CREATE POLICY evaluaciones_select_own_or_admin ON public.evaluaciones_pdv
      FOR SELECT TO authenticated
      USING (
        auth.uid() = user_id OR coalesce((auth.jwt() -> 'user_metadata' ->> 'type') = 'admin', false)
      );
  END IF;
END $$;

-- INSERT: dueño (coincida user_id) o admin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'evaluaciones_pdv'
      AND policyname = 'evaluaciones_insert_own_or_admin'
  ) THEN
    CREATE POLICY evaluaciones_insert_own_or_admin ON public.evaluaciones_pdv
      FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = user_id OR coalesce((auth.jwt() -> 'user_metadata' ->> 'type') = 'admin', false)
      );
  END IF;
END $$;

-- UPDATE: dueño o admin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'evaluaciones_pdv'
      AND policyname = 'evaluaciones_update_own_or_admin'
  ) THEN
    CREATE POLICY evaluaciones_update_own_or_admin ON public.evaluaciones_pdv
      FOR UPDATE TO authenticated
      USING (
        auth.uid() = user_id OR coalesce((auth.jwt() -> 'user_metadata' ->> 'type') = 'admin', false)
      )
      WITH CHECK (
        auth.uid() = user_id OR coalesce((auth.jwt() -> 'user_metadata' ->> 'type') = 'admin', false)
      );
  END IF;
END $$;

-- DELETE: dueño o admin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'evaluaciones_pdv'
      AND policyname = 'evaluaciones_delete_own_or_admin'
  ) THEN
    CREATE POLICY evaluaciones_delete_own_or_admin ON public.evaluaciones_pdv
      FOR DELETE TO authenticated
      USING (
        auth.uid() = user_id OR coalesce((auth.jwt() -> 'user_metadata' ->> 'type') = 'admin', false)
      );
  END IF;
END $$;
