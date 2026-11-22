-- Políticas para proteger must_change_password y password_changed_at
-- Asume que ya existe RLS activado en profiles.

-- Asegurar RLS activado
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Profiles select self'
	) THEN
		CREATE POLICY "Profiles select self" ON public.profiles
			FOR SELECT USING ( auth.uid() = id );
	END IF;
END$$;

-- Permitir admin leer todo (requiere rol admin en columna role)
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Profiles select admin'
	) THEN
		CREATE POLICY "Profiles select admin" ON public.profiles
			FOR SELECT USING ( EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.role = 'admin') );
	END IF;
END$$;

-- Actualizar sólo campos propios excepto must_change_password (autogestionar otros campos permitidos)
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Profiles update self basic'
	) THEN
		CREATE POLICY "Profiles update self basic" ON public.profiles
			FOR UPDATE USING ( auth.uid() = id )
			WITH CHECK (
			  auth.uid() = id
			  AND must_change_password = (
			    SELECT cur.must_change_password FROM public.profiles cur WHERE cur.id = auth.uid()
			  )
			);
	END IF;
END$$;

-- Admin puede actualizar cualquier fila (incluyendo must_change_password)
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Profiles update admin'
	) THEN
		CREATE POLICY "Profiles update admin" ON public.profiles
			FOR UPDATE USING ( EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.role = 'admin') );
	END IF;
END$$;

-- finish_password_change() ya hace el UPDATE como SECURITY DEFINER; asegurar que sólo cambie su propia fila (ya filtrado por WHERE id = auth.uid()).
