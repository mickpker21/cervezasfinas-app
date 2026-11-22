-- Elimina el CHECK en public.evaluaciones_pdv.tipo_cliente para permitir valores libres o nulos (idempotente)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'evaluaciones_pdv'
      AND constraint_name = 'evaluaciones_pdv_tipo_cliente_check'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE public.evaluaciones_pdv DROP CONSTRAINT IF EXISTS evaluaciones_pdv_tipo_cliente_check';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'DROP CONSTRAINT evaluaciones_pdv_tipo_cliente_check: %', SQLERRM;
    END;
  END IF;
END $$;
