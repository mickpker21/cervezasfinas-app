-- Enable Row Level Security on 'precios'
ALTER TABLE public.precios ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists to avoid conflicts
DROP POLICY IF EXISTS "Enable read access for all users" ON "public"."precios";

-- Create Policy for Public Read Access (Anon)
CREATE POLICY "Enable read access for all users" ON "public"."precios"
AS PERMISSIVE FOR SELECT
TO public
USING (true);
