-- Policy para permitir a usuarios autenticados subir y leer archivos en el bucket 'visitas-fotos'
-- Ejecuta esto en la sección de Storage Policies de Supabase

-- Permitir a usuarios autenticados subir archivos
CREATE POLICY "Authenticated users can upload to visitas-fotos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'visitas-fotos');

-- Permitir a usuarios autenticados leer archivos
CREATE POLICY "Authenticated users can read from visitas-fotos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'visitas-fotos');

-- (Opcional) Permitir borrar solo sus propios archivos
-- CREATE POLICY "Authenticated users can delete their own files from visitas-fotos"
--   ON storage.objects
--   FOR DELETE
--   TO authenticated
--   USING (bucket_id = 'visitas-fotos' AND auth.uid() = owner);
