-- Asegura columnas base usadas por la app en public.evaluaciones_pdv (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'evaluaciones_pdv'
  ) THEN
    RAISE NOTICE 'La tabla public.evaluaciones_pdv no existe; no se aplican cambios.';
    RETURN;
  END IF;

  -- Tipos y campos base
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS nombre text; EXCEPTION WHEN others THEN RAISE NOTICE 'nombre: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS fecha date; EXCEPTION WHEN others THEN RAISE NOTICE 'fecha: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS punto_venta text; EXCEPTION WHEN others THEN RAISE NOTICE 'punto_venta: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS zona text; EXCEPTION WHEN others THEN RAISE NOTICE 'zona: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS client_id uuid; EXCEPTION WHEN others THEN RAISE NOTICE 'client_id: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS client_code text; EXCEPTION WHEN others THEN RAISE NOTICE 'client_code: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS nivel text; EXCEPTION WHEN others THEN RAISE NOTICE 'nivel: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS estado_negocio text; EXCEPTION WHEN others THEN RAISE NOTICE 'estado_negocio: %', SQLERRM; END;

  -- Surtido
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS presentaciones text[]; EXCEPTION WHEN others THEN RAISE NOTICE 'presentaciones: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS enfriador_primera_pos text; EXCEPTION WHEN others THEN RAISE NOTICE 'enfriador_primera_pos: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS surtido_porcentaje int; EXCEPTION WHEN others THEN RAISE NOTICE 'surtido_porcentaje: %', SQLERRM; END;

  -- Planograma
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS invasion text; EXCEPTION WHEN others THEN RAISE NOTICE 'invasion: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS huecos text; EXCEPTION WHEN others THEN RAISE NOTICE 'huecos: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS sku_individual text; EXCEPTION WHEN others THEN RAISE NOTICE 'sku_individual: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS sku_familiar text; EXCEPTION WHEN others THEN RAISE NOTICE 'sku_familiar: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS indispensable_planograma boolean; EXCEPTION WHEN others THEN RAISE NOTICE 'indispensable_planograma: %', SQLERRM; END;

  -- Comunicación exterior / interior
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS fachada_banderola text; EXCEPTION WHEN others THEN RAISE NOTICE 'fachada_banderola: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS cumple_exterior boolean; EXCEPTION WHEN others THEN RAISE NOTICE 'cumple_exterior: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS elementos_exterior text[]; EXCEPTION WHEN others THEN RAISE NOTICE 'elementos_exterior: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS indispensable_exterior boolean; EXCEPTION WHEN others THEN RAISE NOTICE 'indispensable_exterior: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS elementos_interior text[]; EXCEPTION WHEN others THEN RAISE NOTICE 'elementos_interior: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS cumple_interior boolean; EXCEPTION WHEN others THEN RAISE NOTICE 'cumple_interior: %', SQLERRM; END;

  -- Capacidad / Frío
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS productividad text; EXCEPTION WHEN others THEN RAISE NOTICE 'productividad: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS capacidad_actual int; EXCEPTION WHEN others THEN RAISE NOTICE 'capacidad_actual: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS capacidad_min int; EXCEPTION WHEN others THEN RAISE NOTICE 'capacidad_min: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS capacidad_max int; EXCEPTION WHEN others THEN RAISE NOTICE 'capacidad_max: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS cumple_capacidad boolean; EXCEPTION WHEN others THEN RAISE NOTICE 'cumple_capacidad: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS enfriador_funciona text; EXCEPTION WHEN others THEN RAISE NOTICE 'enfriador_funciona: %', SQLERRM; END;

  -- Puntaje / advertencias / usuario
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS puntaje_total int; EXCEPTION WHEN others THEN RAISE NOTICE 'puntaje_total: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS advertencias text[]; EXCEPTION WHEN others THEN RAISE NOTICE 'advertencias: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS user_id uuid; EXCEPTION WHEN others THEN RAISE NOTICE 'user_id: %', SQLERRM; END;

  -- Fotos / auditoría (por si faltan)
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS photo_fachada text; EXCEPTION WHEN others THEN RAISE NOTICE 'photo_fachada: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS photo_interior text; EXCEPTION WHEN others THEN RAISE NOTICE 'photo_interior: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS photo_enfriador text; EXCEPTION WHEN others THEN RAISE NOTICE 'photo_enfriador: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS photos_uploaded_at timestamptz; EXCEPTION WHEN others THEN RAISE NOTICE 'photos_uploaded_at: %', SQLERRM; END;
  BEGIN ALTER TABLE public.evaluaciones_pdv ADD COLUMN IF NOT EXISTS photos_uploaded_by uuid; EXCEPTION WHEN others THEN RAISE NOTICE 'photos_uploaded_by: %', SQLERRM; END;
END $$;
