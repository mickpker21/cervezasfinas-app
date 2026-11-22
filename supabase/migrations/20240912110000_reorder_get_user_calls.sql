CREATE OR REPLACE FUNCTION public.get_user_calls(p_user_id uuid, p_filter_date date DEFAULT NULL)
RETURNS TABLE(
    client_name text,
    call_time timestamptz,
    answered boolean,
    boxes_sold integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.name AS client_name,
        tc.call_time,
        tc.answered,
        tc.boxes_sold
    FROM
        public.telesales_calls tc
    LEFT JOIN
        public.clients c ON tc.client_id = c.id
    WHERE
        tc.user_id = p_user_id
        AND (p_filter_date IS NULL OR tc.call_time::date = p_filter_date)
    ORDER BY
        tc.call_time ASC;
END;
$$;
