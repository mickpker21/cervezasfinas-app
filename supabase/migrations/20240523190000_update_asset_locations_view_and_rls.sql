-- This migration updates the `current_asset_locations` view and adds a corrected RLS policy.
-- The policy creation is fixed by using DROP POLICY + CREATE POLICY.
-- FIX 3: Replaces the non-existent auth.jwt() function with the robust current_setting() accessor for JWT claims.

-- 1. Update the view to be more comprehensive
CREATE OR REPLACE VIEW public.current_asset_locations AS
WITH latest_installation AS (
    SELECT
        id,
        asset_id,
        asset_type,
        client_id,
        action,
        finished_at,
        ROW_NUMBER() OVER(PARTITION BY asset_id ORDER BY finished_at DESC) as rn
    FROM
        public.installations
)
SELECT
    li.asset_id,
    li.asset_type,
    li.client_id,
    li.action,
    li.finished_at AS installation_date,
    a.serial AS asset_serial,
    c.name AS client_name,
    c.address AS client_address
FROM
    latest_installation li
JOIN
    public.assets a ON li.asset_id = a.id
JOIN
    public.clients c ON li.client_id = c.id
WHERE
    -- We only want the most recent record for each asset.
    li.rn = 1;

-- 2. Enable RLS on the installations table if it isn't already.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_tables where schemaname = 'public' and tablename = 'installations' and rowsecurity = 't') then
    execute 'alter table public.installations enable row level security';
  end if;
end
$$;

-- 3. Grant usage on the supervisor_can_see_client function to authenticated users.
GRANT EXECUTE ON FUNCTION public.supervisor_can_see_client(public.clients) TO authenticated;


-- 4. FIX 3: Drop the policy and recreate it with the robust JWT accessor.
DROP POLICY IF EXISTS supervisor_can_see_installations ON public.installations;

CREATE POLICY supervisor_can_see_installations ON public.installations
FOR SELECT
TO authenticated
USING (
  -- Allow access if the user's role from the JWT is NOT 'supervisor' (e.g., admin).
  (lower(coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role',''::text)) <> 'supervisor')
  OR
  -- OR if the user IS a supervisor, only allow access if the client is in their route.
  EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = installations.client_id AND public.supervisor_can_see_client(c)
  )
);
