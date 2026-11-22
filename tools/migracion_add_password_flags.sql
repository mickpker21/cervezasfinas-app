-- Agrega columnas para control de cambio de contraseña y función RPC
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

-- RPC para finalizar cambio de contraseña
CREATE OR REPLACE FUNCTION public.finish_password_change()
RETURNS void AS $$
BEGIN
  UPDATE public.profiles
    SET must_change_password = false,
        password_changed_at = now()
    WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.finish_password_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_password_change() TO authenticated;

COMMIT;
