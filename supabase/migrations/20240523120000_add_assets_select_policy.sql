-- Grant select permission on the 'assets' table to authenticated users.
-- This is necessary for installers to look up assets by serial number
-- and for the application to retrieve asset details after an assignment.

CREATE POLICY "Allow authenticated users to read assets"
ON public.assets
FOR SELECT
TO authenticated
USING (true);
