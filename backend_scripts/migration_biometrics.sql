-- Agregar soporte para biometría en la tabla de perfiles
-- Se usa JSONB para almacenar el array de 128 floats del descriptor facial.

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS face_descriptor JSONB,
ADD COLUMN IF NOT EXISTS biometrics_updated_at TIMESTAMPTZ;

-- Comentario de seguridad: 
-- No se guardan fotos, solo una representación matemática (vector) del rostro.
