-- 1. Create asset_types table
CREATE TABLE public.asset_types (
  id serial NOT NULL,
  name text NOT NULL,
  description text NULL,
  created_at timestamptz NULL DEFAULT now(),
  CONSTRAINT asset_types_pkey PRIMARY KEY (id),
  CONSTRAINT asset_types_name_key UNIQUE (name)
);

-- 2. Add RLS
ALTER TABLE public.asset_types ENABLE ROW LEVEL SECURITY;

-- 3. Policies for asset_types
-- Admins can do everything
CREATE POLICY "asset_types_admin_all" ON public.asset_types FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Authenticated users can read
CREATE POLICY "asset_types_auth_read" ON public.asset_types FOR SELECT
  USING (auth.role() = 'authenticated');

-- 4. Seed initial data with the correct list
INSERT INTO public.asset_types (name, description) VALUES
('ENFRIADOR CCV144', 'Activo principal para enfriar bebidas'),
('MATERIAL_POP', 'Material de Publicidad en Punto de Venta'),
('OTRO', 'Cualquier otro tipo de activo no listado'),
('ENFRIADOR CCV192', 'ENFRIADOR CCV192'),
('ENFRIADOR CCV320', 'ENFRIADOR CCV320'),
('ENFRIADOR CCV376', 'ENFRIADOR CCV376'),
('ENFRIADOR CCV500', 'ENFRIADOR CCV500'),
('ENFRIADOR CCV552', 'ENFRIADOR CCV552'),
('ENFRIADOR CCV900', 'ENFRIADOR CCV900'),
('ENFRIADOR CCV1250', 'ENFRIADOR CCV1250'),
('ENFRIADOR Z11', 'ENFRIADOR Z11'),
('MESA PLASTICO', 'MESA PLASTICO'),
('MESA FORMAICA', 'MESA FORMAICA'),
('SILLA PLASTICO', 'SILLA PLASTICO'),
('MESA DE MADERA', 'MESA DE MADERA'),
('SILLA DE MADERA', 'SILLA DE MADERA'),
('FACHADA BASICA', 'FACHADA BASICA'),
('FACHADA HIGH', 'FACHADA HIGH'),
('CARPA 3X3', 'CARPA 3X3'),
('CARPA 5X5', 'CARPA 5X5'),
('INFLABLE', 'INFLABLE')
ON CONFLICT (name) DO NOTHING;
