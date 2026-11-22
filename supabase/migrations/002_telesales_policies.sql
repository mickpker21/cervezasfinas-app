-- Policies for telesales_calls (apply if using Row Level Security)
-- Allow authenticated users to insert their own call records and select their records.

-- Enable RLS on table (if desired)
ALTER TABLE IF EXISTS telesales_calls ENABLE ROW LEVEL SECURITY;

-- Function to check televenta role exists in project (if not present reuse existing is_televenta())
-- Assuming is_televenta() exists in DB as in tools/rls_full_policies.sql

DROP POLICY IF EXISTS telesales_calls_insert ON telesales_calls;
CREATE POLICY telesales_calls_insert ON telesales_calls
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS telesales_calls_select ON telesales_calls;
CREATE POLICY telesales_calls_select ON telesales_calls
  FOR SELECT
  USING (auth.uid() = user_id OR is_supervisor() OR is_admin());

DROP POLICY IF EXISTS telesales_calls_update ON telesales_calls;
CREATE POLICY telesales_calls_update ON telesales_calls
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS telesales_calls_delete ON telesales_calls;
CREATE POLICY telesales_calls_delete ON telesales_calls
  FOR DELETE
  USING (auth.uid() = user_id);
