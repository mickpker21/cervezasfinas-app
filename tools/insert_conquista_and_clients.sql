-- 1. Actualiza el user_metadata del usuario Conquista para agregarle la ruta 1
update auth.users
set raw_user_meta_data = jsonb_set(raw_user_meta_data, '{route_number}', '"R1"', true)
where id = '21286d01-8053-45a7-bed1-72721bf1a3da';

-- 2. Inserta 3 clientes de prueba para la ruta 1 y ese usuario
insert into clients (
  name, business_name, type, address, level, exclusivity, internal_route, sales_route, phone, owner_id, coords, comments, created_at
) values
('Cliente Ruta 1-A', 'Negocio A', 'Bar', 'Calle 1', 'Oro', 'Exclusivo', 'R1', 'SR1', '555-0001', '21286d01-8053-45a7-bed1-72721bf1a3da', '{"lat":19.4321,"lng":-99.1331}', 'Cliente de prueba ruta 1A', now()),
('Cliente Ruta 1-B', 'Negocio B', 'Restaurante', 'Calle 2', 'Plata', 'Mixto', 'R1', 'SR2', '555-0002', '21286d01-8053-45a7-bed1-72721bf1a3da', '{"lat":19.4322,"lng":-99.1332}', 'Cliente de prueba ruta 1B', now()),
('Cliente Ruta 1-C', 'Negocio C', 'Cantina', 'Calle 3', 'Bronce', 'Competencia', 'R1', 'SR3', '555-0003', '21286d01-8053-45a7-bed1-72721bf1a3da', '{"lat":19.4323,"lng":-99.1333}', 'Cliente de prueba ruta 1C', now());
