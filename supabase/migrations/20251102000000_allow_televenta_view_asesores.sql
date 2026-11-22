-- Permitir que usuarios televenta consulten el perfil de asesores dinámicos

CREATE OR REPLACE FUNCTION public.is_televenta_safe()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND lower(role) = 'televenta'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_televenta_safe() TO authenticated;

CREATE POLICY "Allow televenta to read dynamic advisors"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  is_televenta_safe() AND lower(role) = 'asesor-dinamico'
);
