-- Table for admin-editable evaluation configuration
create table if not exists public.evaluation_config (
  id text primary key,
  config jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.evaluation_config enable row level security;

-- Only admins can read/write. Adjust this to your roles/claims model.
-- Assuming we store user_metadata.type = 'admin' in JWT as claim 'role' or 'user_metadata' mapping.
-- Here we use a secure function that checks a claim namespaced in auth.jwt().

-- Helper: checks if the authenticated user is admin based on JWT claim 'user_metadata' -> 'type'
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'user_metadata' ->> 'type') = 'admin', false);
$$;

grant usage on schema public to authenticated;


-- Policies
create policy "evaluation_config_read_admin" on public.evaluation_config
for select to authenticated
using (public.is_admin());

create policy "evaluation_config_write_admin" on public.evaluation_config
for insert to authenticated
with check (public.is_admin());

create policy "evaluation_config_update_admin" on public.evaluation_config
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "evaluation_config_delete_admin" on public.evaluation_config
for delete to authenticated
using (public.is_admin());

-- Seed default row
insert into public.evaluation_config (id, config)
values ('default', jsonb_build_object(
  'weights', jsonb_build_object('surtido',10,'planograma',10,'exterior',20,'interior',10,'capacidad',20,'frio',30),
  'thresholds', jsonb_build_object('surtidoMinPercent',80,'interiorMinElements',3,'capacidadMin',10,'capacidadMax',100),
  'presentaciones', to_jsonb(array['1¼','12oz','16oz','355ml','473ml','710ml','1L','1.2L','1.5L','2L','3L']),
  'zonas', to_jsonb(array['Oaxaca','Serdan','Izucar','Chilchotla','Palmarito']),
  'presentacionesByZona', jsonb_build_object(
    'Oaxaca', to_jsonb(array['1¼','12oz','16oz','355ml','473ml','710ml','1L','1.2L','1.5L','2L','3L']),
    'Serdan', to_jsonb(array['1¼','12oz','16oz','355ml','473ml','710ml','1L','1.2L','1.5L','2L','3L']),
    'Izucar', to_jsonb(array['1¼','12oz','16oz','355ml','473ml','710ml','1L','1.2L','1.5L','2L','3L']),
    'Chilchotla', to_jsonb(array['1¼','12oz','16oz','355ml','473ml','710ml','1L','1.2L','1.5L','2L','3L']),
    'Palmarito', to_jsonb(array['1¼','12oz','16oz','355ml','473ml','710ml','1L','1.2L','1.5L','2L','3L'])
  ),
  'tiposCliente', to_jsonb(array['Bronce','Plata','Oro','Platino','Titanio']),
  'estadosNegocio', to_jsonb(array['Abierto','Cerrado','Enrejado']),
  'elementosExterior', to_jsonb(array['Banderola','Vinil','Lona','Letrero luminoso']),
  'elementosInterior', to_jsonb(array['Porta poster 1','Porta poster 2','Porta poster 3','Cooler blade','Refricalco','Preciador'])
))
on conflict (id) do nothing;
