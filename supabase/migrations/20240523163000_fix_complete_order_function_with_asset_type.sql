
-- Replaces the existing complete_installation_order function with a corrected version.
-- The fix adds the `asset_type` column to the INSERT statement for the `installations` table,
-- resolving the "not-null constraint" violation.

CREATE OR REPLACE FUNCTION public.complete_installation_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  item record;
BEGIN
  -- Obtener los detalles de la orden
  SELECT * INTO v_order FROM public.installation_orders WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Orden con ID % no encontrada.', p_order_id;
  END IF;

  IF v_order.status = 'COMPLETADA' THEN
    RAISE NOTICE 'La orden % ya está completada.', p_order_id;
    RETURN;
  END IF;

  -- Crear registros en la tabla 'installations' para cada item de la orden
  FOR item IN
    SELECT * FROM public.installation_order_items WHERE order_id = p_order_id
  LOOP
    IF item.asset_id IS NOT NULL THEN
      INSERT INTO public.installations (
        order_id,
        asset_id,
        asset_type, -- <<< CORRECCIÓN: Columna añadida
        client_id,
        installer_id,
        action,
        status,
        finished_at
      )
      VALUES (
        v_order.id,
        item.asset_id,
        item.asset_type, -- <<< CORRECCIÓN: Valor añadido
        CASE
          WHEN v_order.action = 'MOVER' THEN v_order.destination_client_id
          ELSE v_order.client_id
        END,
        v_order.assigned_to,
        v_order.action,
        'COMPLETADA',
        now()
      );
    END IF;
  END LOOP;

  -- Actualizar el estado de la orden a 'COMPLETADA'
  UPDATE public.installation_orders
  SET status = 'COMPLETADA'
  WHERE id = p_order_id;

END;
$$;
