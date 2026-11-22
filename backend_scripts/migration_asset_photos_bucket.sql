-- Crear el bucket de almacenamiento para las fotos de los activos (fachadas y futuras instalaciones)
INSERT INTO storage.buckets (id, name, public)
VALUES ('asset-photos', 'asset-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Dar permisos para que cualquier rol pueda leer las imagenes
CREATE POLICY "Public Access to asset photos" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'asset-photos' );

-- Dar permisos para que los usuarios autenticados y anonimos puedan insertar (la app sube directo)
CREATE POLICY "Allow public uploads to asset photos" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'asset-photos' );

-- Dar permisos para actualizar si es necesario
CREATE POLICY "Allow public updates to asset photos" 
ON storage.objects FOR UPDATE 
USING ( bucket_id = 'asset-photos' );
