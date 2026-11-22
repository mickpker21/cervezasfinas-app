-- Inserta datos de prueba en la tabla clients
INSERT INTO clients (
  name, business_name, type, address, level, exclusivity, internal_route, sales_route, phone, owner_id, coords, comments, created_at
) VALUES
('Juan Perez', 'Bar El Sol', 'Bar', 'Calle 123', 'Oro', 'Exclusivo', 'R1', 'SR1', '555-1234', '21286d01-8053-45a7-bed1-72721bf1a3da', '{"lat":19.4326,"lng":-99.1332}', 'Cliente de prueba 1', NOW()),
('Maria Lopez', 'Restaurante La Luna', 'Restaurante', 'Avenida 456', 'Plata', 'Mixto', 'R2', 'SR2', '555-5678', '21286d01-8053-45a7-bed1-72721bf1a3da', '{"lat":19.4327,"lng":-99.1333}', 'Cliente de prueba 2', NOW()),
('Carlos Ruiz', 'Cantina El Gallo', 'Cantina', 'Boulevard 789', 'Bronce', 'Competencia', 'R1', 'SR3', '555-9012', '21286d01-8053-45a7-bed1-72721bf1a3da', '{"lat":19.4328,"lng":-99.1334}', 'Cliente de prueba 3', NOW());
-- Reemplaza TU_USER_ID por el id real del usuario que usas en tu app
