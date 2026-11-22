-- This migration completely rewrites the `complete_order` function.
-- The previous version was based on an obsolete data model and had critical logic flaws.
-- This new version correctly uses the `installations` table as the single source of truth for asset locations.

create or replace function public.complete_order(order_id_param uuid)
returns text
language plpgsql
security definer
as $$
declare
  order_rec record;
  item_rec record;
  installer_id uuid;
begin
  -- 1. Get the order details, including the assigned user who is completing the action.
  select * into order_rec
  from public.installation_orders
  where id = order_id_param;

  if order_rec.id is null then
    raise exception 'Error: Orden no encontrada.';
  end if;

  if order_rec.status = 'COMPLETADA' then
    return 'Aviso: La orden ya está completada.';
  end if;

  -- The user who completes the order is the one it was assigned to.
  installer_id := order_rec.assigned_to;
  if installer_id is null then
      raise exception 'Error: La orden no tiene un técnico asignado.';
  end if;

  -- 2. Process based on the order's action type.
  if order_rec.action = 'INSTALAR' then
    -- For an installation, we iterate over all items in the order.
    -- An admin has previously assigned specific assets (serials) to this order.
    for item_rec in
      select 
        ioi.id as item_id, 
        ioi.asset_type, 
        aa.asset_id
      from public.installation_order_items ioi
      join public.assigned_assets aa on aa.order_item_id = ioi.id
      where ioi.order_id = order_id_param
    loop
      -- Create a new record in the installations table to represent the new location.
      insert into public.installations (asset_id, asset_type, client_id, order_id, action, performed_by, finished_at)
      values (item_rec.asset_id, item_rec.asset_type, order_rec.client_id, order_id_param, 'INSTALAR', installer_id, now());
    end loop;

  elsif order_rec.action = 'RETIRAR' then
    -- For a removal, there is only one item: the asset being removed.
    select asset_id, asset_type into item_rec
    from public.installation_order_items
    where order_id = order_id_param limit 1;

    -- Create a new record indicating the removal from the original client.
    insert into public.installations (asset_id, asset_type, client_id, order_id, action, performed_by, finished_at)
    values (item_rec.asset_id, item_rec.asset_type, order_rec.client_id, order_id_param, 'RETIRAR', installer_id, now());

  elsif order_rec.action = 'MOVER' then
    -- For a move, there is also only one item: the asset being moved.
    select asset_id, asset_type into item_rec
    from public.installation_order_items
    where order_id = order_id_param limit 1;

    -- Create a new record indicating the new location at the destination client.
    insert into public.installations (asset_id, asset_type, client_id, order_id, action, performed_by, finished_at)
    values (item_rec.asset_id, item_rec.asset_type, order_rec.destination_client_id, order_id_param, 'MOVER', installer_id, now());

  end if;

  -- 3. Finally, mark the order as completed and set the finished timestamp.
  update public.installation_orders
  set status = 'COMPLETADA', finished_at = now(), updated_at = now()
  where id = order_id_param;

  return 'Orden ' || order_id_param || ' completada con éxito.';
end;
$$;