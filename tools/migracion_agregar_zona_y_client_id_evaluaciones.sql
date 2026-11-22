-- Agrega columnas y índices necesarios para soportar zona y client_id en evaluaciones_pdv
-- Segura para re-ejecución (usa IF NOT EXISTS y guardas)

DO $$
BEGIN
  -- Verificar existencia de la tabla
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'evaluaciones_pdv'
  ) THEN
    RAISE NOTICE 'La tabla public.evaluaciones_pdv no existe; no se aplican cambios.';
    RETURN;
  END IF;

  -- Agregar columna zona si no existe
  BEGIN
    ALTER TABLE public.evaluaciones_pdv
      ADD COLUMN IF NOT EXISTS zona text;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'No se pudo agregar columna zona: %', SQLERRM;
  END;

  -- Agregar columna client_id si no existe
  BEGIN
    ALTER TABLE public.evaluaciones_pdv
      ADD COLUMN IF NOT EXISTS client_id uuid;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'No se pudo agregar columna client_id: %', SQLERRM;
  END;

  -- Agregar columna client_code si no existe
  BEGIN
    ALTER TABLE public.evaluaciones_pdv
      ADD COLUMN IF NOT EXISTS client_code text;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'No se pudo agregar columna client_code: %', SQLERRM;
  END;

  -- Agregar FK a clients(id) si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema='public' AND tc.table_name='evaluaciones_pdv'
      AND tc.constraint_type='FOREIGN KEY' AND tc.constraint_name='fk_evaluaciones_pdv_client_id'
  ) THEN
    BEGIN
      ALTER TABLE public.evaluaciones_pdv
        ADD CONSTRAINT fk_evaluaciones_pdv_client_id
        FOREIGN KEY (client_id)
        REFERENCES public.clients(id)
        ON DELETE SET NULL;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'No se pudo crear la FK fk_evaluaciones_pdv_client_id: %', SQLERRM;
    END;
  END IF;

  -- Índices útiles para filtros
  BEGIN
    CREATE INDEX IF NOT EXISTS idx_evaluaciones_pdv_zona ON public.evaluaciones_pdv (zona);
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'No se pudo crear índice idx_evaluaciones_pdv_zona: %', SQLERRM;
  END;

  BEGIN
    CREATE INDEX IF NOT EXISTS idx_evaluaciones_pdv_client_id ON public.evaluaciones_pdv (client_id);
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'No se pudo crear índice idx_evaluaciones_pdv_client_id: %', SQLERRM;
  END;

  BEGIN
    CREATE INDEX IF NOT EXISTS idx_evaluaciones_pdv_client_code ON public.evaluaciones_pdv (client_code);
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'No se pudo crear índice idx_evaluaciones_pdv_client_code: %', SQLERRM;
  END;
END $$;

-- Opcional: columnas para guardar URLs de fotos de referencia de la evaluación
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'evaluaciones_pdv'
  ) THEN
    RETURN;
  END IF;

  BEGIN
    ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS photo_fachada text;
  EXCEPTION WHEN others THEN RAISE NOTICE 'No se pudo agregar photo_fachada: %', SQLERRM; END;

  BEGIN
    ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS photo_interior text;
  EXCEPTION WHEN others THEN RAISE NOTICE 'No se pudo agregar photo_interior: %', SQLERRM; END;

  BEGIN
    ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS photo_enfriador text;
  EXCEPTION WHEN others THEN RAISE NOTICE 'No se pudo agregar photo_enfriador: %', SQLERRM; END;
END $$;

-- Opcional: columna para guardar el nivel del cliente en la evaluación
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'evaluaciones_pdv'
  ) THEN
    RETURN;
  END IF;

  BEGIN
    ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS nivel text;
  EXCEPTION WHEN others THEN RAISE NOTICE 'No se pudo agregar columna nivel: %', SQLERRM; END;
END $$;
