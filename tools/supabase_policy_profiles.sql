
-- Permitir lectura solo al owner
CREATE POLICY "Allow select for owner"
ON profiles FOR SELECT
USING (auth.uid() = id);

-- Permitir update solo al owner
CREATE POLICY "Allow update for owner"
ON profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Permitir insert solo al owner
CREATE POLICY "Allow insert for authenticated users"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);
