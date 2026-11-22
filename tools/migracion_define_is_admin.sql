-- Define una función centralizada is_admin() y la deja lista para usar en policies
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    -- 1) claim directo 'role' = 'admin'
    (lower(coalesce(auth.jwt() ->> 'role', '')) = 'admin')
    -- 2) user_metadata.type o user_metadata.role que empiece por 'admin' (Admin, Administrador)
    OR (lower(coalesce(auth.jwt() #>> '{user_metadata,type}', '')) LIKE 'admin%')
    OR (lower(coalesce(auth.jwt() #>> '{user_metadata,role}', '')) LIKE 'admin%')
    -- 3) profiles.role = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND lower(coalesce(p.role, '')) = 'admin'
    );
$$;
