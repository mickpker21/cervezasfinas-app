-- Policies idempotentes para el bucket 'evaluaciones-fotos'. Ejecuta esto en el SQL editor de Supabase.
-- Paso previo: crea el bucket si no existe (requiere service role, puedes hacerlo desde la UI de Storage)
-- select storage.create_bucket('evaluaciones-fotos', public := true);

DO $$
BEGIN
  -- INSERT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can upload to evaluaciones-fotos'
  ) THEN
    CREATE POLICY "Authenticated users can upload to evaluaciones-fotos"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'evaluaciones-fotos');
  END IF;

  -- SELECT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can read from evaluaciones-fotos'
  ) THEN
    CREATE POLICY "Authenticated users can read from evaluaciones-fotos"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'evaluaciones-fotos');
  END IF;

  -- (Opcional) UPDATE: sólo sus propios archivos
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can update their own files from evaluaciones-fotos'
  ) THEN
    CREATE POLICY "Authenticated users can update their own files from evaluaciones-fotos"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = 'evaluaciones-fotos' AND owner = auth.uid())
      WITH CHECK (bucket_id = 'evaluaciones-fotos' AND owner = auth.uid());
  END IF;

  -- (Opcional) DELETE: sólo sus propios archivos
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can delete their own files from evaluaciones-fotos'
  ) THEN
    CREATE POLICY "Authenticated users can delete their own files from evaluaciones-fotos"
      ON storage.objects
      FOR DELETE
      TO authenticated
  USING (bucket_id = 'evaluaciones-fotos' AND owner = auth.uid());
  END IF;
END $$;
