-- ==============================================================================
-- 01_atomic_sales_rpc.sql
-- Enterprise Offline Sync Upgrade - Atomic DB Procedures
-- ==============================================================================
-- IMPORTANTE: Ejecuta este script en el SQL Editor de Supabase
-- ==============================================================================

-- 1. Función Atómica para Direct Sales (Ventas Automáticas con Descuento de Stock)
CREATE OR REPLACE FUNCTION sync_direct_sale_atomic(
  p_sale jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale_id uuid;
  v_item record;
  v_stock record;
BEGIN
  -- 1. Insertar Cabecera de la Venta
  -- Se asume que p_sale tiene los campos coincidentes con la tabla direct_sales
  INSERT INTO direct_sales (
    id, user_id, client_id, total_amount, status, payment_method, 
    created_at, gec_discount, promo_discount, cargo
  ) VALUES (
    (p_sale->>'id')::uuid,
    (p_sale->>'user_id')::uuid,
    (p_sale->>'client_id')::uuid,
    (p_sale->>'total_amount')::numeric,
    COALESCE(p_sale->>'status', 'COMPLETED'),
    COALESCE(p_sale->>'payment_method', 'CASH'),
    COALESCE((p_sale->>'created_at')::timestamp with time zone, now()),
    COALESCE((p_sale->>'gec_discount')::numeric, 0),
    COALESCE((p_sale->>'promo_discount')::numeric, 0),
    p_sale->>'cargo'
  ) RETURNING id INTO v_sale_id;

  -- 2. Procesar Items y Descontar Stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- A) Insertar el Item
    INSERT INTO direct_sales_items (
      sale_id, cve_marca, quantity, unit_price, total_price, des_marca
    ) VALUES (
      v_sale_id,
      v_item.value->>'cve_marca',
      (v_item.value->>'quantity')::integer,
      (v_item.value->>'unit_price')::numeric,
      (v_item.value->>'total_price')::numeric,
      COALESCE(v_item.value->>'des_marca', '')
    );

    -- B) Descontar Stock (Validación Estricta)
    -- Asumiendo que existe decrement_stock o llamando la lógica directamente:
    UPDATE truck_inventory
    SET 
        quantity = quantity - (v_item.value->>'quantity')::integer,
        updated_at = now()
    WHERE 
        user_id = (p_sale->>'user_id')::uuid 
        AND cve_marca = v_item.value->>'cve_marca'
    RETURNING id INTO v_stock;

    -- Si no retornó fila o queremos validar negativos, dependemos de los Constraints de Supabase
    -- Opcional: Levantar error si no existía el registro de inventario (dependiendo de la regla de negocio)
    IF NOT FOUND THEN
       RAISE EXCEPTION 'STOCK_NOT_FOUND: user %, sku %', (p_sale->>'user_id'), (v_item.value->>'cve_marca');
    END IF;
  END LOOP;

  -- Si todo sale bien, retorna éxito
  RETURN json_build_object(
    'success', true,
    'sale_id', v_sale_id
  );

EXCEPTION WHEN unique_violation THEN
  -- Idempotencia: Si ya existía, retornamos una bandera para que la app sepa que es duplicado y lo ignore
  RETURN json_build_object(
    'success', false,
    'error', 'DUPLICATE',
    'details', SQLERRM
  );
WHEN OTHERS THEN
  -- Cualquier otro error forza un rollback automático y lanza la excepción a la app
  RAISE EXCEPTION 'SYNC_FAILED: %', SQLERRM;
END;
$$;

-- ==============================================================================

-- 2. Función Atómica para Preventa (Sin descuento de stock inmediato)
CREATE OR REPLACE FUNCTION sync_preventa_atomic(
  p_preventa jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_preventa_id uuid;
  v_item record;
BEGIN
  -- 1. Insertar Cabecera de Preventa
  INSERT INTO preventa (
    id, user_id, client_id, total_amount, created_at
  ) VALUES (
    (p_preventa->>'id')::uuid,
    (p_preventa->>'user_id')::uuid,
    (p_preventa->>'client_id')::uuid,
    (p_preventa->>'total_amount')::numeric,
    COALESCE((p_preventa->>'created_at')::timestamp with time zone, now())
  ) RETURNING id INTO v_preventa_id;

  -- 2. Procesar Items de Preventa
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO preventa_items ( -- Ajusta los campos según la estructura real de tu base de datos
        preventa_id, cve_marca, quantity, unit_price, total_price, des_marca
      ) VALUES (
        v_preventa_id,
        v_item.value->>'cve_marca',
        (v_item.value->>'quantity')::integer,
        (v_item.value->>'unit_price')::numeric,
        (v_item.value->>'total_price')::numeric,
        COALESCE(v_item.value->>'des_marca', '')
      );
    END LOOP;
  END IF;

  RETURN json_build_object(
    'success', true,
    'preventa_id', v_preventa_id
  );

EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object(
    'success', false,
    'error', 'DUPLICATE',
    'details', SQLERRM
  );
WHEN OTHERS THEN
  RAISE EXCEPTION 'SYNC_FAILED: %', SQLERRM;
END;
$$;
