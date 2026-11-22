create table if not exists route_sessions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) not null,
  date date not null,
  status text not null check (status in ('OPEN', 'CLOSED')),
  closed_at timestamptz,
  summary_stats jsonb,
  created_at timestamptz default now(),
  unique(user_id, date)
);

-- RLS Policies
alter table route_sessions enable row level security;

-- Autoventa can insert/update their own rows
create policy "Users can manage their own sessions"
  on route_sessions for all
  using (auth.uid() = user_id);

-- Televenta/Admins/Warehouse can view all
create policy "Staff can view all sessions"
  on route_sessions for select
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
      and role in ('televenta', 'almacenista', 'admin', 'supervisor')
    )
  );
