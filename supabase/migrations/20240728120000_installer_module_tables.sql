-- Perfil Instalador - Migration File

-- 1. Enums
create type public.asset_type as enum ('ENFRIADOR','FACHADA','MESA','SILLA','CARPA','LONA','INFLABLE');
create type public.movement_type as enum ('ENTRADA','SALIDA','AJUSTE');
create type public.action_type as enum ('INSTALAR','RETIRAR','MOVER');
create type public.order_status as enum ('PENDIENTE','APROBADA','RECHAZADA','EN_RUTA','EN_PROCESO','COMPLETADA','CANCELADA');

-- 2. Catálogos y maestros

-- Almacenes de los instaladores (o centrales)
create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_profile uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- Instaladores (perfil) y su almacén por defecto
create table public.installers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  default_warehouse uuid references public.warehouses(id),
  phone text,
  active boolean default true,
  created_at timestamptz default now(),
  unique(profile_id)
);

-- Activos (pieza individual con serie)
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  type public.asset_type not null,
  brand text,
  model text,
  serial text unique,
  qr_value text unique,
  status text not null default 'EN_ALMACEN',
  current_warehouse uuid references public.warehouses(id),
  current_client uuid references public.clients(id),
  photo_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on public.assets(type);
create index on public.assets(current_client);

-- 3. Solicitudes y sus ítems

-- Solicitud de instalación/retiro/movimiento
create table public.installation_orders (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  assigned_to uuid references public.installers(id),
  client_id uuid not null references public.clients(id),
  action public.action_type not null,
  scheduled_at timestamptz,
  status public.order_status not null default 'PENDIENTE',
  rejection_reason text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Ítems solicitados
create table public.installation_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.installation_orders(id) on delete cascade,
  asset_type public.asset_type not null,
  quantity int not null default 1,
  asset_id uuid references public.assets(id),
  notes text
);
create index on public.installation_order_items(order_id);

-- 4. Ejecución, movimientos e inventario

-- Ejecución (evento atómico con evidencia)
create table public.installations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.installation_orders(id) on delete set null,
  installer_id uuid references public.installers(id),
  client_id uuid not null references public.clients(id),
  asset_id uuid references public.assets(id),
  asset_type public.asset_type not null,
  action public.action_type not null,
  started_at timestamptz,
  finished_at timestamptz,
  checklist jsonb,
  photos jsonb,
  gps jsonb,
  signature_url text,
  created_at timestamptz default now()
);
create index on public.installations(client_id);
create index on public.installations(action);
create index on public.installations(asset_type);

-- Movimientos de activos
create table public.asset_movements (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  from_warehouse uuid references public.warehouses(id),
  to_warehouse uuid references public.warehouses(id),
  from_client uuid references public.clients(id),
  to_client uuid references public.clients(id),
  order_id uuid references public.installation_orders(id),
  action public.action_type not null,
  performed_by uuid references public.installers(id),
  at timestamptz default now(),
  photos jsonb
);
create index on public.asset_movements(asset_id);
create index on public.asset_movements(order_id);

-- Transacciones de inventario
create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  asset_id uuid not null references public.assets(id),
  type public.movement_type not null,
  reason text,
  ref_id uuid,
  created_at timestamptz default now(),
  unique(warehouse_id, asset_id, created_at)
);

-- 5. Relación cliente–activo (histórico)
create table public.client_assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  asset_id uuid not null references public.assets(id),
  installed_at timestamptz,
  removed_at timestamptz
);
create index on public.client_assets(client_id);
create unique index on public.client_assets(asset_id) where removed_at is null;

-- 6. Bitácora de notificaciones
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  to_profile uuid references public.profiles(id),
  payload jsonb,
  status text default 'SENT',
  error text,
  created_at timestamptz default now()
);
