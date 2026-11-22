ALTER TABLE public.client_visits
ADD COLUMN IF NOT EXISTS reason text;
