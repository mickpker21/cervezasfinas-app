-- Migración Fase 7: Arquitectura Multi-Bodega y Aislamiento de Datos

-- 1. Crear Catálogo Maestro de Bodegas (Branches)
CREATE TABLE IF NOT EXISTS public.branches (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    location VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Insertar Bodegas Base de Ejemplo
INSERT INTO public.branches (name, code, location) VALUES
('Bodega Central México', 'MEX-01', 'CDMX'),
('Bodega Norte Monterrey', 'MTY-01', 'Nuevo León'),
('Bodega Colombia', 'COL-01', 'Bogotá')
ON CONFLICT (code) DO NOTHING;

-- 2. Alterar Perfiles de Usuario (profiles)
-- Supabase no permite modificar auth.users libremente, usamos la tabla pública 'profiles'
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS branch_id INT REFERENCES public.branches(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assigned_zones TEXT[]; -- Ejemplo: '{"RUTA 1", "RUTA 2"}'

-- 3. Alterar Flota Vehicular
ALTER TABLE public.fleet_vehicles ADD COLUMN IF NOT EXISTS branch_id INT REFERENCES public.branches(id);

-- 4. Alterar Tabla de Ventas (Preventa)
ALTER TABLE public.preventa ADD COLUMN IF NOT EXISTS branch_id INT REFERENCES public.branches(id);

-- 5. POLÍTICAS RLS (Row Level Security) - Aislamiento Fuerte
-- Nota: Para que esto aplique, RLS debe estar habilitado en 'preventa' y 'fleet_vehicles'

-- A. Políticas para Preventa (Almacenistas solo ven su bodega)
-- Asumimos que la tabla de perfiles nos dice qué bodega tiene el usuario. 
-- Para RLS estricto, creamos una función helper de Postgres:
CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS INT
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT branch_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Borramos políticas anteriores permisivas si es que existen (opcional, ajustado a tu entorno)
-- DROP POLICY IF EXISTS "Permitir select" ON public.preventa;

CREATE POLICY "Solo ver preventas de mi bodega o todo si soy admin"
ON public.preventa
FOR SELECT
USING (
  branch_id = public.get_user_branch_id() 
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'operaciones', 'gerente', 'control-interno')
  OR branch_id IS NULL -- Para datos viejos sin bodega
);

-- B. Políticas para Vehículos (Aislamiento visual en la BD)
CREATE POLICY "Ver vehiculos de mi bodega o todos si soy global"
ON public.fleet_vehicles
FOR SELECT
USING (
  branch_id = public.get_user_branch_id() 
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'operaciones', 'flota', 'gerente')
  OR branch_id IS NULL
);

-- 6. Actualización de datos huérfanos (asignar bodega 1 por defecto a los datos viejos)
UPDATE public.preventa SET branch_id = 1 WHERE branch_id IS NULL;
UPDATE public.fleet_vehicles SET branch_id = 1 WHERE branch_id IS NULL;
UPDATE public.profiles SET branch_id = 1 WHERE branch_id IS NULL;
