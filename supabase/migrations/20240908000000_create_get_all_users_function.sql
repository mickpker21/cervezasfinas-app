CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE(user_id uuid, user_name text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        id,
        COALESCE(raw_user_meta_data->>'full_name', email, id::text)
    FROM
        auth.users
    WHERE
        raw_user_meta_data->>'role' IN ('televenta', 'supervisor', 'gerente');
END;
$$;