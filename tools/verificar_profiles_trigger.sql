-- Verificar existencia de la tabla y columnas
SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles';

-- Verificar existencia del trigger
SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- Verificar existencia de la función
SELECT proname FROM pg_proc WHERE proname = 'handle_new_user';

-- Verificar si hay registros en profiles
SELECT * FROM public.profiles LIMIT 10;
