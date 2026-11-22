-- Add discount/cargo columns to direct_sales table
ALTER TABLE public.direct_sales ADD COLUMN IF NOT EXISTS gec_discount NUMERIC DEFAULT 0;
ALTER TABLE public.direct_sales ADD COLUMN IF NOT EXISTS promo_discount NUMERIC DEFAULT 0;
ALTER TABLE public.direct_sales ADD COLUMN IF NOT EXISTS cargo TEXT;
