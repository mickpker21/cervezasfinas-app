-- Migración Fase 6: Módulo de Flota Estricto

-- 1. Catálogo de Vehículos
CREATE TABLE IF NOT EXISTS public.fleet_vehicles (
    id SERIAL PRIMARY KEY,
    plate VARCHAR(20) NOT NULL UNIQUE,
    brand VARCHAR(50),
    model VARCHAR(50),
    year INT,
    status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'MAINTENANCE', 'INACTIVE')),
    current_mileage INT DEFAULT 0,
    assigned_route VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Inspecciones / Start of Day Checklist
CREATE TABLE IF NOT EXISTS public.fleet_inspections (
    id SERIAL PRIMARY KEY,
    vehicle_id INT REFERENCES public.fleet_vehicles(id),
    driver_id UUID NOT NULL, -- auth.users id
    inspection_date DATE NOT NULL DEFAULT CURRENT_DATE,
    mileage_start INT NOT NULL,
    tires_ok BOOLEAN DEFAULT TRUE,
    lights_ok BOOLEAN DEFAULT TRUE,
    fluids_ok BOOLEAN DEFAULT TRUE,
    brakes_ok BOOLEAN DEFAULT TRUE,
    clean_ok BOOLEAN DEFAULT TRUE,
    damage_notes TEXT,
    status VARCHAR(50) DEFAULT 'PASSED' CHECK (status IN ('PASSED', 'WARNING', 'FAILED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Evitar que un chofer llene dos veces el checklist para la misma ruta el mismo día
ALTER TABLE public.fleet_inspections ADD CONSTRAINT unique_daily_inspection UNIQUE (driver_id, inspection_date);

-- 3. Mantenimiento y Gastos
CREATE TABLE IF NOT EXISTS public.fleet_maintenance (
    id SERIAL PRIMARY KEY,
    vehicle_id INT REFERENCES public.fleet_vehicles(id),
    type VARCHAR(50) NOT NULL CHECK (type IN ('FUEL', 'SERVICE', 'REPAIR', 'OTHER')),
    amount DECIMAL(10,2) NOT NULL,
    mileage_at_event INT,
    description TEXT,
    reported_by UUID NOT NULL,
    event_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS para seguridad
ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_maintenance ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para desarrollo/producción controlada
CREATE POLICY "Permitir lectura general en fleet_vehicles" ON public.fleet_vehicles FOR SELECT USING (true);
CREATE POLICY "Permitir insertar a todos fleet_vehicles" ON public.fleet_vehicles FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir update a todos fleet_vehicles" ON public.fleet_vehicles FOR UPDATE USING (true);

CREATE POLICY "Permitir lectura general en fleet_inspections" ON public.fleet_inspections FOR SELECT USING (true);
CREATE POLICY "Permitir insertar a todos fleet_inspections" ON public.fleet_inspections FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir lectura general en fleet_maintenance" ON public.fleet_maintenance FOR SELECT USING (true);
CREATE POLICY "Permitir insertar a todos fleet_maintenance" ON public.fleet_maintenance FOR INSERT WITH CHECK (true);

-- Insertar Vehículos de Prueba
INSERT INTO public.fleet_vehicles (plate, brand, model, year, assigned_route) VALUES
('ABC-1234', 'Isuzu', 'Elf 300', 2021, 'RUTA 1'),
('XYZ-9876', 'Hino', 'Serie 300', 2022, 'RUTA 2')
ON CONFLICT (plate) DO NOTHING;
