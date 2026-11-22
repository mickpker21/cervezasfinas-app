-- Corrección Fase 8: Evitar recursividad infinita (Error 500) en la tabla profiles

-- Al usar un SELECT directo hacia public.profiles dentro de una política de la misma tabla,
-- se genera un bucle infinito (Stack depth limit exceeded / Error 500).
-- Debemos usar la función segura 'get_my_role()' que ya habíamos creado antes y que
-- cuenta con 'SECURITY DEFINER' para saltar las políticas RLS de forma segura.

DROP POLICY IF EXISTS "Sistemas can update all profiles" ON public.profiles;
CREATE POLICY "Sistemas can update all profiles"
ON public.profiles FOR UPDATE
USING ( get_my_role() = 'sistemas' )
WITH CHECK ( get_my_role() = 'sistemas' );

DROP POLICY IF EXISTS "Sistemas can view all profiles" ON public.profiles;
CREATE POLICY "Sistemas can view all profiles"
ON public.profiles FOR SELECT
USING ( get_my_role() = 'sistemas' );
