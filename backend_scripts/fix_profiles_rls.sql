-- POLICY: Permitir a 'administrador' y 'gerente' actualizar cualquier perfil
-- Esto es necesario para que puedan guardar la biometría de otros empleados.

-- 1. Habilitar RLS (por si acaso no está)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar políticas viejas conflictivas (opcional, para limpiar)
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Enable update for users based on email" ON public.profiles;

-- 3. Crear la política de actualización para Admins
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
USING (
  -- El usuario que intenta hacer la update (auth.uid()) debe ser admin/gerente
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('administrador', 'admin', 'gerente', 'superadmin')
  )
);

-- 4. Crear política básica de lectura (si no existe, nadie ve nada)
CREATE POLICY "Enable read access for all users"
ON public.profiles
FOR SELECT
USING (true);

-- 5. Política para que cada usuario pueda editarse a sí mismo (opcional pero buena práctica)
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id);
