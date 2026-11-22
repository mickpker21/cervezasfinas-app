-- FASE 5: Candados Enterprise (SFA / DSD)

-- 1. Agregar campo de firma a la tabla preventa para el Proof of Delivery
ALTER TABLE public.preventa
ADD COLUMN IF NOT EXISTS signature TEXT;

-- (Opcional) Si en el futuro se requieren imágenes de PoD (fotos de fachada/entrega)
ALTER TABLE public.preventa
ADD COLUMN IF NOT EXISTS pod_photo_url TEXT;

-- 2. Asegurarse de que exista el catálogo de Envase
-- Si no existe una columna en 'precios' o 'sku_descripcion' que indique si es retornable, 
-- crearemos una tabla auxiliar rápida para propósitos del MVP.
CREATE TABLE IF NOT EXISTS public.returnable_skus (
    sku VARCHAR(50) PRIMARY KEY,
    empty_sku VARCHAR(50) NOT NULL -- El código del cartón o envase asociado
);

-- Ejemplos de SKUs retornables (Basado en la industria estándar)
-- Insertar aquí los SKUs que generan obligación de envase
-- INSERT INTO public.returnable_skus (sku, empty_sku) VALUES ('CORONA_MEDIA_RET', 'ENV_CARTON_MED'), ('VICTORIA_CAGUAMA', 'ENV_CARTON_CAG');
