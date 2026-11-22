-- Añadir columna 'payroll_config' a la tabla profiles para el Motor de Nómina y KPIs
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payroll_config JSONB DEFAULT '{}'::jsonb;
