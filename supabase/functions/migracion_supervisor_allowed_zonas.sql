-- Migración: tabla para zonas permitidas por supervisor
create table if not exists supervisor_allowed_zonas (
  id bigserial primary key,
  supervisor_id uuid references profiles(id) on delete cascade,
  zona text not null,
  created_at timestamp with time zone default now()
);
create index if not exists idx_supervisor_allowed_zonas_supervisor_id on supervisor_allowed_zonas(supervisor_id);
create index if not exists idx_supervisor_allowed_zonas_zona on supervisor_allowed_zonas(zona);
