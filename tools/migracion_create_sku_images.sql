-- Migración para crear la tabla sku_images
create table if not exists sku_images (
  sku text primary key,
  image_url text not null,
  updated_at timestamptz default now()
);
