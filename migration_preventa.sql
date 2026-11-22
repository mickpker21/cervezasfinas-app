-- MIGRACIÓN PARA TABLA PREVENTA
-- Ejecutar este script en el Editor SQL de Supabase para añadir soporte para descuentos y cargos.

ALTER TABLE public.preventa 
ADD COLUMN IF NOT EXISTS gec_discount NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS promo_discount NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS cargo NUMERIC(10, 2) DEFAULT 0;

-- Opcional: Notificar al PostgREST del cambio de esquema (aunque suele ser automático)
NOTIFY pgrst, 'reload schema';
