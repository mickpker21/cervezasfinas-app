-- Rellena/actualiza perfiles existentes con name, role y route tomando auth.users.raw_user_meta_data
-- Idempotente y seguro

-- Asegura columnas
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS route TEXT;

-- Inserta perfiles faltantes
INSERT INTO public.profiles (id, email, name, role, route, created_at)
SELECT u.id,
       u.email,
       COALESCE(u.raw_user_meta_data->>'name',''),
       COALESCE(NULLIF(u.raw_user_meta_data->>'role',''), u.raw_user_meta_data->>'type',''),
       COALESCE(NULLIF(u.raw_user_meta_data->>'route',''), u.raw_user_meta_data->>'route_number',''),
       NOW()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Actualiza perfiles existentes con datos faltantes (sin sobreescribir valores ya presentes)
UPDATE public.profiles p
SET name = COALESCE(NULLIF(p.name,''), u.raw_user_meta_data->>'name', p.name),
    role = COALESCE(NULLIF(p.role,''), NULLIF(u.raw_user_meta_data->>'role',''), u.raw_user_meta_data->>'type', p.role),
    route = COALESCE(NULLIF(p.route,''), NULLIF(u.raw_user_meta_data->>'route',''), u.raw_user_meta_data->>'route_number', p.route)
FROM auth.users u
WHERE u.id = p.id;
