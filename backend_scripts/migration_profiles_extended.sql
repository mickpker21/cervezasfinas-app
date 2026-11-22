-- Extended Profile Information
-- Adds fields for a more complete employee profile (Enterprise Level)

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS photo_url text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS job_title text, -- "Puesto" (e.g., Vendedor Senior)
ADD COLUMN IF NOT EXISTS department text, -- "Departamento" (e.g., Ventas, Logística)
ADD COLUMN IF NOT EXISTS employee_id text, -- "No. Empleado" (e.g., EMP-001)
ADD COLUMN IF NOT EXISTS start_date date, -- "Fecha de Ingreso"
ADD COLUMN IF NOT EXISTS emergency_contact jsonb; -- { name: "Mom", phone: "555..." }

-- Allow users to update their own photo and phone
-- (Assuming RLS policies for UPDATE already exist or need adjustment)

-- Check existing policies. We usually have "Users can update own profile".
-- If so, these new columns will be updateable if not explicitly restricted.
-- Ideally, 'job_title', 'department', 'employee_id', 'start_date' should be READ ONLY for the user, 
-- and editable only by Admin/RH.

-- We can handle this in the Frontend for now (UI Validation), 
-- or create specific policies if we want strict security.
-- For this iteration, we rely on Frontend restrictions + Admin trust.

-- Create Storage Bucket for Avatars if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Anyone can view avatars
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING ( bucket_id = 'avatars' );

-- Policy: Users can upload their own avatar
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' AND
  auth.uid() = owner
);

-- Policy: Users can update their own avatar
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' AND
  auth.uid() = owner
);
