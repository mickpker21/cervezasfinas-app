-- Enable 'rh' role to manage profiles (including biometrics)
-- This updates the existing policy or creates a new one if needed.

-- Since we can't easily edit an existing policy in SQL without dropping it, 
-- we will drop the policies related to updating profiles and recreate them including 'rh'.

-- 1. Policy for Updating Profiles (Biometrics, etc.)
DROP POLICY IF EXISTS "Admins and Managers can update profiles" ON profiles;

CREATE POLICY "Admins and Managers can update profiles"
ON profiles FOR UPDATE
TO authenticated
USING (
  (select role from profiles where id = auth.uid()) IN ('administrador', 'admin', 'gerente', 'superadmin', 'rh')
)
WITH CHECK (
  (select role from profiles where id = auth.uid()) IN ('administrador', 'admin', 'gerente', 'superadmin', 'rh')
);

-- 2. Policy for Viewing Profiles (HR needs to see everyone)
-- Check if a restrictive select policy exists. Usually profiles are public or viewable by authenticated.
-- If we have a restrictive policy, we should ensure 'rh' is included.
-- Assuming standard RLS:
-- If there is a "Profiles are viewable by everyone" policy, we are good.
-- If there is a specific admin policy, we might need to check.

-- Let's explicitly allow 'rh' to see all profiles just in case.
DROP POLICY IF EXISTS "HR can view all profiles" ON profiles;
CREATE POLICY "HR can view all profiles"
ON profiles FOR SELECT
TO authenticated
USING (
  (select role from profiles where id = auth.uid()) = 'rh'
);
