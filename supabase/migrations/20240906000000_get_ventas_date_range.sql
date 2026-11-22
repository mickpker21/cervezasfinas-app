
CREATE OR REPLACE FUNCTION get_ventas_date_range()
RETURNS json
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN (SELECT json_build_object(
    'min_date', MIN(period_date),
    'max_date', MAX(period_date)
  ) FROM ventas_por_sku);
END;
$$;
