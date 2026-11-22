INSERT INTO clients (
    id, client_code, name, business_name, 
    address, cross_street, exterior_number, interior_number, colony, postal_code, city, state, reference,
    phone, email, contact,
    sales_route, internal_route,
    visit_days, visit_day_televenta,
    sales_modality, ritmo,
    rfc, fiscal_name, fiscal_address, fiscal_colony, fiscal_postal_code, cedula_ieps,
    gec, level, exclusivity, client_type, cadena,
    created_at, updated_at
) VALUES (
    UUID(), 'TEST_R1_001', 'Juan Pérez Prueba', 'Abarrotes La Prueba R1',
    'Av. Principal', 'Calle Norte y Sur', '123', 'Local A', 'Centro', '20000', 'Aguascalientes', 'Aguascalientes', 'Frente al parque',
    '4491234567', 'prueba@ejemplo.com', 'Juan Pérez',
    'R1', 'R1',
    'Lunes,Jueves', 'Martes',
    'Preventa', 'Semanal',
    'XAXX010101000', 'Juan Pérez Prueba SA de CV', 'Av. Fiscal 555', 'Industrial', '20200', 'IEPS-12345',
    'Plata', 'PLATA', 'Exclusivo', 'Punto de Venta', 'OXXO',
    NOW(), NOW()
);
