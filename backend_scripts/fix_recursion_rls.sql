-- Fix Infinite Recursion in Profiles RLS
-- The previous policy caused a loop because querying 'profiles' to check the role triggered the policy again.

-- 1. Create a secure function to get the current user's role without triggering RLS
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER -- Bypass RLS
SET search_path = public
STABLE
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- 2. Drop the problematic policies
DROP POLICY IF EXISTS "Admins and Managers can update profiles" ON profiles;
DROP POLICY IF EXISTS "HR can view all profiles" ON profiles;

-- 3. Recreate policies using the secure function

-- Policy: Who can UPDATE profiles? (Admins, Managers, RH)
CREATE POLICY "Admins and Managers can update profiles"
ON profiles FOR UPDATE
TO authenticated
USING (
  get_my_role() IN ('administrador', 'admin', 'gerente', 'superadmin', 'rh')
)
WITH CHECK (
  get_my_role() IN ('administrador', 'admin', 'gerente', 'superadmin', 'rh')
);

-- Policy: Who can SELECT (view) all profiles?
-- (Admins, RH, etc. usually need to see everyone. Regular users might only see themselves)
-- Checking if there is a generic select policy. If not, we add one for privileged roles.

CREATE POLICY "Privileged users can view all profiles"
ON profiles FOR SELECT
TO authenticated
USING (
  -- Users can see their own profile OR privileged users can see everyone
  auth.uid() = id OR
  get_my_role() IN ('administrador', 'admin', 'gerente', 'superadmin', 'rh', 'control_interno')
);
