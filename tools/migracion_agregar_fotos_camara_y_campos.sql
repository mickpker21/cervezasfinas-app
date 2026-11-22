-- Agrega (si no existen) columnas de fotos para evaluaciones tomadas con cámara
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'evaluaciones_pdv'
  ) THEN
    RAISE NOTICE 'La tabla public.evaluaciones_pdv no existe; no se aplican cambios.';
    RETURN;
  END IF;

  -- Columnas para URLs públicas de fotos (fachada, interior, enfriador)
  BEGIN
    ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS photo_fachada text;
  EXCEPTION WHEN others THEN RAISE NOTICE 'No se pudo agregar photo_fachada: %', SQLERRM; END;

  BEGIN
    ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS photo_interior text;
  EXCEPTION WHEN others THEN RAISE NOTICE 'No se pudo agregar photo_interior: %', SQLERRM; END;

  BEGIN
    ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS photo_enfriador text;
  EXCEPTION WHEN others THEN RAISE NOTICE 'No se pudo agregar photo_enfriador: %', SQLERRM; END;

  -- Opcional: marca temporal de carga y usuario
  BEGIN
    ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS photos_uploaded_at timestamptz;
  EXCEPTION WHEN others THEN RAISE NOTICE 'No se pudo agregar photos_uploaded_at: %', SQLERRM; END;
  BEGIN
    ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS photos_uploaded_by uuid;
  EXCEPTION WHEN others THEN RAISE NOTICE 'No se pudo agregar photos_uploaded_by: %', SQLERRM; END;
END $$;

-- Índices útiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'evaluaciones_pdv'
  ) THEN
    RETURN;
  END IF;
  BEGIN
    CREATE INDEX IF NOT EXISTS idx_evaluaciones_pdv_photos_by ON public.evaluaciones_pdv (photos_uploaded_by);
  EXCEPTION WHEN others THEN RAISE NOTICE 'No se pudo crear índice idx_evaluaciones_pdv_photos_by: %', SQLERRM; END;
END $$;
