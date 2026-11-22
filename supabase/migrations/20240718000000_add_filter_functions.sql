CREATE OR REPLACE FUNCTION get_distinct_client_zones()
RETURNS TABLE(distinct_value TEXT) AS $$
BEGIN
    RETURN QUERY SELECT DISTINCT zona::text AS distinct_value FROM clients WHERE zona IS NOT NULL AND zona <> '';
END; 
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_distinct_client_internal_routes()
RETURNS TABLE(distinct_value TEXT) AS $$
BEGIN
    RETURN QUERY SELECT DISTINCT internal_route::text AS distinct_value FROM clients WHERE internal_route IS NOT NULL AND internal_route <> '';
END; 
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_distinct_client_sales_routes()
RETURNS TABLE(distinct_value TEXT) AS $$
BEGIN
    RETURN QUERY SELECT DISTINCT sales_route::text AS distinct_value FROM clients WHERE sales_route IS NOT NULL AND sales_route <> '';
END; 
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_distinct_client_zones_for_supervisor(p_internal_routes TEXT[], p_sales_routes TEXT[])
RETURNS TABLE(distinct_value TEXT) AS $$
BEGIN
    RETURN QUERY 
    SELECT DISTINCT zona::text AS distinct_value 
    FROM clients 
    WHERE 
        (p_internal_routes IS NULL OR internal_route = ANY(p_internal_routes) OR p_internal_routes = '{}') AND
        (p_sales_routes IS NULL OR sales_route = ANY(p_sales_routes) OR p_sales_routes = '{}') AND
        zona IS NOT NULL AND zona <> '';
END; 
$$ LANGUAGE plpgsql;
