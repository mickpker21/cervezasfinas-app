-- Crear tabla para datos manuales de rutas
create table if not exists public.indicadores_ruta_manual (
    id uuid default gen_random_uuid() primary key,
    ruta text not null,
    periodo date not null, -- Primer dia del mes
    faltas integer default 0,
    minutos integer default 0,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique(ruta, periodo)
);

-- RLS
alter table public.indicadores_ruta_manual enable row level security;

create policy "Permitir lectura a todos los autenticados"
on public.indicadores_ruta_manual for select
to authenticated
using (true);

create policy "Permitir inserción/actualización a analistas y admins"
on public.indicadores_ruta_manual for all
to authenticated
using (true)
with check (true);
