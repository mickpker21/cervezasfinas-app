-- Asegura que la columna advertencias exista como text[] en evaluaciones_pdv
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'evaluaciones_pdv'
  ) THEN
    RAISE NOTICE 'La tabla public.evaluaciones_pdv no existe; no se aplican cambios.';
    RETURN;
  END IF;

  BEGIN
    ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS advertencias text[];
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'No se pudo agregar advertencias: %', SQLERRM;
  END;
END $$;
