-- Fix route_sessions query error by referencing public.profiles
-- Error was: PGRST200 foreign key relationship not found
-- Fix: Make user_id reference profiles(id) instead of auth.users(id) for easier PostgREST joins

-- 1. Drop old constraint (name might vary, so we handle generic naming if created by referencing type)
-- Usually: route_sessions_user_id_fkey
ALTER TABLE public.route_sessions DROP CONSTRAINT IF EXISTS route_sessions_user_id_fkey;

-- 2. Add new constraint pointing to public.profiles
ALTER TABLE public.route_sessions
  ADD CONSTRAINT route_sessions_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- 3. Verify RLS (Policies rely on auth.uid() = user_id which is still valid as UUIDs match)
