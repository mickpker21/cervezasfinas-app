-- Añade columna client_code a clients si no existe y crea índice único
-- También rellena opcionalmente con un placeholder basado en name si quieres (comentado)

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_code text;

-- Índice único (permite múltiples NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ux_clients_client_code'
  ) THEN
    BEGIN
      CREATE UNIQUE INDEX ux_clients_client_code ON public.clients (client_code);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'No se pudo crear índice ux_clients_client_code: %', SQLERRM;
    END;
  END IF;
END$$;

-- (Opcional) Autogenerar códigos para filas existentes sin client_code (descomenta si quieres)
-- UPDATE public.clients
--    SET client_code = lower(regexp_replace(name, '\\s+', '_', 'g'))
--  WHERE client_code IS NULL AND name IS NOT NULL;

-- Nota RLS: asegúrate de tener el rol correcto (admin / conquista / asesor) en el JWT para insertar.
