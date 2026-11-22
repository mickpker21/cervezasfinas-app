-- Enable Row Level Security (Recommended for all tables in Supabase)
ALTER TABLE public.stock_requests ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow everyone (authenticated users) to READ requests
-- (Warehouse needs to see all, Drivers need to see their own)
-- For simplicity, we allow authenticated users to see all, or you can restrict drivers to see only their own.
CREATE POLICY "Enable read access for authenticated users" 
ON public.stock_requests
FOR SELECT 
TO authenticated 
USING (true);

-- Policy 2: Allow drivers (authenticated users) to INSERT their own requests
CREATE POLICY "Enable insert for authenticated users" 
ON public.stock_requests
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = driver_id);

-- Policy 3: Allow warehouse/admin to UPDATE requests (e.g. status)
CREATE POLICY "Enable update for authenticated users" 
ON public.stock_requests
FOR UPDATE 
TO authenticated 
USING (true);

-- Optional: Verify that the foreign key constraint is correct (it looks correct in your snippet)
-- constraint stock_requests_driver_id_fkey foreign KEY (driver_id) references profiles (id)
