create or replace function public.complete_order (order_id_param uuid)
returns text
language plpgsql
security definer
as $$
declare
  main_warehouse_id uuid;
  order_rec record;
  asset_rec record;
begin
  -- 1. Obtener el ID del almacén principal para los retiros.
  -- Asegúrate de tener un almacén con este nombre en tu tabla `warehouses`.
  select id into main_warehouse_id from public.warehouses where name = 'Almacén Principal' limit 1;
  if main_warehouse_id is null then
    raise exception 'Error: No se encontró el ''Almacén Principal''. Por favor, créalo en la tabla `warehouses`.';
  end if;

  -- 2. Obtener los detalles de la orden, incluyendo el instalador asignado.
  select id, action, client_id, destination_client_id, status, assigned_to
  into order_rec
  from public.installation_orders
  where id = order_id_param;

  if order_rec.id is null then
    raise exception 'Error: Orden no encontrada.';
  end if;

  if order_rec.status = 'COMPLETADA' then
    return 'Aviso: La orden ya está completada.';
  end if;

  -- 3. Iterar sobre los activos asignados para actualizar su estado y registrar el movimiento.
  for asset_rec in
    select 
      a.id as asset_id,
      a.current_client as from_client_id,
      a.current_warehouse as from_warehouse_id
    from public.assigned_assets aa
    join public.assets a on a.id = aa.asset_id
    where aa.order_item_id in (select id from public.installation_order_items where order_id = order_id_param)
  loop
    -- Actualizar la tabla `assets` Y registrar el movimiento en `asset_movements`
    if order_rec.action = 'INSTALAR' then
      -- Mover de un almacén a un cliente
      update public.assets
      set status = 'INSTALADO', current_client = order_rec.client_id, current_warehouse = null, updated_at = now()
      where id = asset_rec.asset_id;
      
      insert into public.asset_movements(asset_id, from_warehouse, to_client, order_id, action, performed_by)
      values (asset_rec.asset_id, asset_rec.from_warehouse_id, order_rec.client_id, order_id_param, 'INSTALAR', order_rec.assigned_to);

    elsif order_rec.action = 'RETIRO' then
      -- Mover de un cliente a un almacén
      update public.assets
      set status = 'EN_ALMACEN', current_client = null, current_warehouse = main_warehouse_id, updated_at = now()
      where id = asset_rec.asset_id;

      insert into public.asset_movements(asset_id, from_client, to_warehouse, order_id, action, performed_by)
      values (asset_rec.asset_id, asset_rec.from_client_id, main_warehouse_id, order_id_param, 'RETIRO', order_rec.assigned_to);

    elsif order_rec.action = 'MOVER' then
      -- Mover de un cliente a otro cliente
      update public.assets
      set status = 'INSTALADO', current_client = order_rec.destination_client_id, updated_at = now()
      where id = asset_rec.asset_id;
      
      insert into public.asset_movements(asset_id, from_client, to_client, order_id, action, performed_by)
      values (asset_rec.asset_id, asset_rec.from_client_id, order_rec.destination_client_id, order_id_param, 'MOVER', order_rec.assigned_to);
    end if;
  end loop;

  -- 4. Finalmente, marcar la orden como completada.
  update public.installation_orders
  set status = 'COMPLETADA', updated_at = now()
  where id = order_id_param;

  return 'Orden ' || order_id_param || ' completada. Activos actualizados y movimientos registrados.';
end;
$$;