-- Relaja NOT NULL en public.evaluaciones_pdv.tipo_cliente y lo alinea con nivel (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'evaluaciones_pdv' AND column_name = 'tipo_cliente'
  ) THEN
    RAISE NOTICE 'La columna tipo_cliente no existe; no se aplican cambios.';
    RETURN;
  END IF;

  -- Quitar NOT NULL si existe la restricción
  BEGIN
    EXECUTE 'ALTER TABLE public.evaluaciones_pdv ALTER COLUMN tipo_cliente DROP NOT NULL';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'DROP NOT NULL tipo_cliente: %', SQLERRM;
  END;

  -- Backfill: si nivel está vacío pero tipo_cliente tiene dato, copiar
  BEGIN
    UPDATE public.evaluaciones_pdv
       SET nivel = COALESCE(NULLIF(nivel, ''), tipo_cliente)
     WHERE (nivel IS NULL OR nivel = '') AND tipo_cliente IS NOT NULL;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'Backfill nivel desde tipo_cliente: %', SQLERRM;
  END;
END $$;
