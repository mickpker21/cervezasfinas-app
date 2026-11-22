-- Tabla de relación zonas <-> rutas
create table if not exists zonas_rutas (
  id uuid primary key default gen_random_uuid(),
  zona text not null,
  ruta text not null,
  created_at timestamp with time zone default now()
);

-- Índices para búsquedas rápidas
create index if not exists idx_zonas_rutas_zona on zonas_rutas(zona);
create index if not exists idx_zonas_rutas_ruta on zonas_rutas(ruta);
