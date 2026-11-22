-- Create storage bucket for boletines
INSERT INTO storage.buckets (id, name, public)
VALUES ('boletines', 'boletines', false)
ON CONFLICT (id) DO NOTHING;

-- Create boletines table
CREATE TABLE IF NOT EXISTS public.boletines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    title TEXT NOT NULL,
    file_name TEXT,
    file_path TEXT,
    user_id UUID REFERENCES auth.users(id)
);

-- RLS Policies for boletines table
ALTER TABLE public.boletines ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access to boletines"
ON public.boletines
FOR SELECT
USING (true);

-- Allow admin full access
CREATE POLICY "Allow admin full access to boletines"
ON public.boletines
FOR ALL
USING ((select public.is_admin()))
WITH CHECK ((select public.is_admin()));

-- RLS Policies for boletines storage bucket
CREATE POLICY "Allow public read access to boletines storage"
ON storage.objects
FOR SELECT
USING (bucket_id = 'boletines');

CREATE POLICY "Allow admin full access to boletines storage"
ON storage.objects
FOR ALL
USING (bucket_id = 'boletines' AND (select public.is_admin()))
WITH CHECK (bucket_id = 'boletines' AND (select public.is_admin()));
