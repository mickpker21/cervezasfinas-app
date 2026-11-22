-- 1. Create missing table for Asset Locations (Coolers)
-- Removed Foreign Key to 'clients' because 'clients' table does not exist in Supabase (it's in MySQL).
CREATE TABLE IF NOT EXISTS public.current_asset_locations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL, -- Storing UUID but NO Foreign Key constraint
    asset_serial TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_asset_locations_client ON public.current_asset_locations(client_id);

-- 2. Add missing 'ruta' column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ruta TEXT;

-- 3. Fix Foreign Key relationship for Preventa -> Clients?
-- CANNOT create FK because 'clients' table does not exist.
-- We ensured the code does not rely on this FK anymore (Split DB logic).
-- However, we can drop the constraint if it was somehow erroneously created or partially applied to avoid confusion.
ALTER TABLE public.preventa DROP CONSTRAINT IF EXISTS preventa_client_id_fkey;

-- 4. Enable RLS for the new table (Best Practice)
ALTER TABLE public.current_asset_locations ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can read asset locations
CREATE POLICY "Enable read access for authenticated users" ON public.current_asset_locations
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Authenticated users can insert/update
CREATE POLICY "Enable write access for authenticated users" ON public.current_asset_locations
    FOR ALL
    TO authenticated
    USING (true);
