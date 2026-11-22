-- Function to get clients with installed assets but no sales in a given month.
CREATE OR REPLACE FUNCTION get_clients_with_assets_no_sales(p_month text)
RETURNS TABLE(
    id uuid,
    name text,
    business_name text,
    client_code text,
    coords jsonb,
    gec text
) AS $$
BEGIN
    RETURN QUERY
    WITH clients_with_assets AS (
        -- Get distinct clients that have at least one asset installed
        SELECT DISTINCT c.id, c.name, c.business_name, c.client_code, c.coords, c.gec
        FROM clients c
        JOIN assets a ON c.id = a.current_client_id
        WHERE a.status = 'INSTALADO'
    ),
    clients_with_sales AS (
        -- Get distinct clients that have sales in the given month
        SELECT DISTINCT s.client_code
        FROM client_sales_sheet s
        WHERE to_char(s.period_date, 'YYYY-MM') = p_month
    )
    SELECT
        cwa.id,
        cwa.name,
        cwa.business_name,
        cwa.client_code,
        cwa.coords,
        cwa.gec
    FROM clients_with_assets cwa
    LEFT JOIN clients_with_sales cws ON cwa.client_code = cws.client_code
    WHERE cws.client_code IS NULL;
END;
$$ LANGUAGE plpgsql;
