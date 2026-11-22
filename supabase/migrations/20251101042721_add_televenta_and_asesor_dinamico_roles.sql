
CREATE OR REPLACE FUNCTION public.is_televenta()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.jwt_role_enum() = 'televenta'::user_role $$;

CREATE OR REPLACE FUNCTION public.is_asesor_dinamico()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.jwt_role_enum() = 'asesor_dinamico'::user_role $$;
