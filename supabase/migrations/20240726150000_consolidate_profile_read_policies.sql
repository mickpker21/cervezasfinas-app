-- 1. Cleanup: Drop conflicting policies that cause recursion.
DROP POLICY IF EXISTS supervisor_read_limited_profiles ON public.profiles;
DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;

-- 2. Create recursion-safe helper functions with SECURITY DEFINER.
-- These run with the permissions of the function owner, bypassing user RLS.

-- Checks if the current user is an admin.
CREATE OR REPLACE FUNCTION is_admin_safe()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND lower(role) = 'admin'
  );
END;
$$;

-- Checks if the current user is a supervisor.
CREATE OR REPLACE FUNCTION is_supervisor_safe()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND lower(role) = 'supervisor'
  );
END;
$$;

-- Grant necessary permissions to let authenticated users run these checks.
GRANT EXECUTE ON FUNCTION is_admin_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION is_supervisor_safe() TO authenticated;

-- 3. Create a single, consolidated SELECT policy for the profiles table.
-- This policy combines all read logic into one place.
CREATE POLICY "Allow read access based on role" ON public.profiles
FOR SELECT
TO authenticated
USING (
  (
    -- Condition 1: Admins can see all profiles.
    is_admin_safe()
  ) OR (
    -- Condition 2: Supervisors can see their own profile and those of non-admin/non-supervisor roles.
    is_supervisor_safe() AND (
      auth.uid() = id OR -- Can see their own profile
      lower(role) NOT IN ('admin', 'supervisor', 'gerente') -- Can see lower-ranked roles
    )
  ) OR (
    -- Condition 3: Non-admin/non-supervisor users can only see their own profile.
    auth.uid() = id
  )
);

-- 4. Ensure RLS is enabled on the profiles table.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
