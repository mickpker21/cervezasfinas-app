DROP FUNCTION IF EXISTS public.get_user_call_stats(date);

CREATE OR REPLACE FUNCTION public.get_user_call_stats()
 RETURNS TABLE(user_id uuid, user_name text, total_calls bigint, answered_calls bigint, unanswered_calls bigint, total_sales numeric, average_sale numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
        cs.user_id IS NOT NULL
        OR ss.user_id IS NOT NULL
        OR u.raw_user_meta_data->>'role' IN ('televenta', 'supervisor', 'gerente');
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_call_stats_by_date(filter_date date)
 RETURNS TABLE(user_id uuid, user_name text, total_calls bigint, answered_calls bigint, unanswered_calls bigint, total_sales numeric, average_sale numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
        WHERE c.call_time::date = filter_date
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
        WHERE p.created_at::date = filter_date
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
        cs.user_id IS NOT NULL OR ss.user_id IS NOT NULL;
END;
$function$;