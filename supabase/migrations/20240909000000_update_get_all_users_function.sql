DROP FUNCTION IF EXISTS public.get_all_users(date);
DROP FUNCTION IF EXISTS public.get_all_users();

CREATE OR REPLACE FUNCTION public.get_all_users(filter_date date DEFAULT NULL)
RETURNS TABLE(
    user_id uuid,
    user_name text,
    total_calls bigint,
    answered_calls bigint,
    unanswered_calls bigint,
    ventas_totales_cajas numeric,
    promedio_compra_cajas numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH user_base AS (
        SELECT DISTINCT u.id, COALESCE(u.raw_user_meta_data->>'''full_name''', u.email, u.id::text) as name
        FROM auth.users u
        JOIN public.telesales_calls tc ON u.id = tc.user_id
    ),
    call_and_sales_stats AS (
        -- Calculate call and sales stats together for each user from the telesales_calls table
        SELECT
            tc.user_id,
            COUNT(tc.id) AS total_calls,
            COUNT(tc.id) FILTER (WHERE tc.answered = true) AS answered_calls,
            COUNT(tc.id) FILTER (WHERE tc.answered = false) AS unanswered_calls,
            SUM(tc.boxes_sold) AS total_cajas_vendidas,
            -- Average boxes sold only for calls that resulted in a sale
            AVG(tc.boxes_sold) FILTER (WHERE tc.boxes_sold > 0) AS avg_cajas_por_venta
        FROM
            public.telesales_calls tc
        WHERE
            (filter_date IS NULL OR tc.call_time::date = filter_date)
        GROUP BY
            tc.user_id
    )
    -- Final select joining user info with their stats
    SELECT
        ub.id AS user_id,
        ub.name AS user_name,
        COALESCE(css.total_calls, 0) AS total_calls,
        COALESCE(css.answered_calls, 0) AS answered_calls,
        COALESCE(css.unanswered_calls, 0) AS unanswered_calls,
        COALESCE(css.total_cajas_vendidas, 0)::numeric AS ventas_totales_cajas,
        COALESCE(css.avg_cajas_por_venta, 0)::numeric AS promedio_compra_cajas
    FROM
        user_base ub
    LEFT JOIN
        call_and_sales_stats css ON ub.id = css.user_id;
END;
$$;
