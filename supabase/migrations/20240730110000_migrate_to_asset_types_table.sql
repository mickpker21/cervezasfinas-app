-- 1. Add new columns for foreign keys
ALTER TABLE public.assets ADD COLUMN asset_type_id INT;
ALTER TABLE public.installation_order_items ADD COLUMN asset_type_id INT;

-- 2. Update the new columns with data from asset_types table
UPDATE public.assets a
SET asset_type_id = at.id
FROM public.asset_types at
WHERE a.type::text = at.name;

UPDATE public.installation_order_items ioi
SET asset_type_id = at.id
FROM public.asset_types at
WHERE ioi.asset_type::text = at.name;

-- 3. Add foreign key constraints
ALTER TABLE public.assets ADD CONSTRAINT fk_asset_type FOREIGN KEY (asset_type_id) REFERENCES public.asset_types(id);
ALTER TABLE public.installation_order_items ADD CONSTRAINT fk_asset_type FOREIGN KEY (asset_type_id) REFERENCES public.asset_types(id);

-- 4. Drop old enum columns
ALTER TABLE public.assets DROP COLUMN type;
ALTER TABLE public.installation_order_items DROP COLUMN asset_type;

-- 5. Rename new columns to original names
ALTER TABLE public.assets RENAME COLUMN asset_type_id TO type;
ALTER TABLE public.installation_order_items RENAME COLUMN asset_type_id TO asset_type;

-- 6. Create the new type
CREATE TYPE public.asset_type AS ENUM (
  'ENFRIADOR CCV144',
  'MATERIAL_POP',
  'OTRO',
  'ENFRIADOR CCV192',
  'ENFRIADOR CCV320',
  'ENFRIADOR CCV376',
  'ENFRIADOR CCV500',
  'ENFRIADOR CCV552',
  'ENFRIADOR CCV900',
  'ENFRIADOR CCV1250',
  'ENFRIADOR Z11',
  'MESA PLASTICO',
  'MESA FORMAICA',
  'SILLA PLASTICO',
  'MESA DE MADERA',
  'SILLA DE MADERA',
  'FACHADA BASICA',
  'FACHADA HIGH',
  'CARPA 3X3',
  'CARPA 5X5',
  'INFLABLE'
);
