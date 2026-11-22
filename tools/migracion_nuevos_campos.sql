-- ALTER TABLE para visitas: agregar motivo y 3 fotos
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS motivo text;
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS photo_fachada text;
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS photo_interior text;
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS photo_enfriador text;

-- ALTER TABLE para clients: asegurar campos requeridos
ALTER TABLE clients ADD COLUMN IF NOT EXISTS gec text; -- BRONCE, PLATA, ORO, PLATINO, TITANIO
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_type text; -- Punto de venta, centro de consumo, canal moderno, otro
ALTER TABLE clients ADD COLUMN IF NOT EXISTS exclusivity text; -- Mixto, Exclusivo
-- coords ya existe como jsonb, pero si quieres solo lat,lng puedes cambiarlo a text
-- Si quieres que coords sea text, descomenta la siguiente línea:
-- ALTER TABLE clients ALTER COLUMN coords TYPE text;
