CREATE OR REPLACE FUNCTION get_user_call_stats(filter_date date DEFAULT NULL)
RETURNS TABLE(
    user_id UUID,
    user_name TEXT,
    total_calls BIGINT,
    answered_calls BIGINT,
    unanswered_calls BIGINT,
    total_sales NUMERIC,
    average_sale NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH call_stats AS (
        SELECT
            c.user_id,
            COUNT(c.id) AS total_calls,
            COUNT(CASE WHEN c.answered = true THEN 1 END) AS answered_calls,
            COUNT(CASE WHEN c.answered = false THEN 1 END) AS unanswered_calls
        FROM
            public.telesales_calls c
        WHERE (filter_date IS NULL OR c.call_time::date = filter_date)
        GROUP BY
            c.user_id
    ),
    sale_stats AS (
        SELECT
            p.user_id,
            COALESCE(SUM(p.total_amount), 0) AS total_sales,
            COALESCE(AVG(p.total_amount), 0) AS average_sale
        FROM
            public.preventa p
        WHERE (filter_date IS NULL OR p.created_at::date = filter_date) -- Asumo que la tabla preventa tiene `created_at`
        GROUP BY
            p.user_id
    )
    SELECT
        u.id AS user_id,
        COALESCE(u.raw_user_meta_data->>'full_name', u.email, u.id::text) AS user_name,
        COALESCE(cs.total_calls, 0),
        COALESCE(cs.answered_calls, 0),
        COALESCE(cs.unanswered_calls, 0),
        COALESCE(ss.total_sales, 0),
        COALESCE(ss.average_sale, 0)
    FROM
        auth.users u
    LEFT JOIN call_stats cs ON u.id = cs.user_id
    LEFT JOIN sale_stats ss ON u.id = ss.user_id
    WHERE
        -- Si se elige una fecha, mostrar solo usuarios con actividad en ese día
        (filter_date IS NOT NULL AND (cs.user_id IS NOT NULL OR ss.user_id IS NOT NULL))
        OR
        -- Si no hay fecha, mostrar todos los usuarios con actividad o roles relevantes
        (filter_date IS NULL AND (
            cs.user_id IS NOT NULL
            OR ss.user_id IS NOT NULL
            OR u.raw_user_meta_data->>'role' IN ('televenta', 'supervisor', 'gerente')
        ));
END;
$$;