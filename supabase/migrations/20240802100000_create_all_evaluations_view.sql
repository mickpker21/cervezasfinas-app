DROP VIEW IF EXISTS public.all_evaluations_view;

CREATE VIEW public.all_evaluations_view AS
-- Part 1: From 'evaluaciones' table (for Canal Moderno, CC)
SELECT
    e.id,
    e.tipo as tipo, -- FIX: Changed alias to 'tipo' for the component to read
    e.created_at as fecha,
    CONCAT_WS(' - ', e.cadena, e.payload->>'formato') as punto_venta,
    e.client_code,
    COALESCE(NULLIF(c.sales_route, ''), NULLIF(c.internal_route, '')) AS client_route,
    -- FIX: Add fallback to email if full_name is not available
    COALESCE(u.raw_user_meta_data->>'full_name', u.email) as evaluator_name,
    e.score_final as score,
    jsonb_build_object(
        'id', e.id,
        'tipo', e.tipo,
        'fecha', e.created_at,
        'punto_venta', CONCAT_WS(' - ', e.cadena, e.payload->>'formato'),
        'client_code', e.client_code,
        'client_route', COALESCE(NULLIF(c.sales_route, ''), NULLIF(c.internal_route, '')),
        'cadena', e.cadena,
        'formato', e.payload->>'formato',
        'evaluator_name', COALESCE(u.raw_user_meta_data->>'full_name', u.email),
        'score_final', e.score_final,
        'sections', e.payload->'sections',
        'photos', to_jsonb(COALESCE(e.photo_urls, ARRAY[]::text[]))
    ) as payload,
    e.tipo || '-' || e.id::text as composite_id
FROM
    public.evaluaciones e
LEFT JOIN public.clients c ON c.client_code = e.client_code
LEFT JOIN auth.users u ON e.user_id = u.id
WHERE e.tipo IN ('CANAL MODERNO', 'CC')

UNION ALL

-- Part 2: From 'evaluaciones_pdv' table (for PDV)
SELECT
    p.id,
    'PDV' as tipo, -- FIX: Changed alias to 'tipo'
    p.created_at as fecha,
    p.punto_venta,
    p.client_code,
    COALESCE(NULLIF(c.sales_route, ''), NULLIF(c.internal_route, '')) AS client_route,
    -- FIX: Add fallback to email if full_name is not available
    COALESCE(u.raw_user_meta_data->>'full_name', u.email) as evaluator_name,
    p.puntaje_total as score,
    jsonb_build_object(
        'id', p.id,
        'tipo', 'PDV',
        'fecha', p.created_at,
        'nombre', COALESCE(u.raw_user_meta_data->>'full_name', u.email),
        'punto_venta', p.punto_venta,
        'client_code', p.client_code,
        'client_route', COALESCE(NULLIF(c.sales_route, ''), NULLIF(c.internal_route, '')),
        'puntaje_total', p.puntaje_total,
        'criterios', (
            SELECT jsonb_agg(criterion)
            FROM unnest(ARRAY[p.surtido, p.planograma, p.comunicacion_exterior, p.comunicacion_interior, p.capacidad_fria]) as criterion
            WHERE criterion IS NOT NULL AND criterion::text <> 'null'
        ),
        'fotos', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object('url', photo_url)), '[]'::jsonb)
            FROM unnest(ARRAY[p.photo_fachada, p.photo_interior, p.photo_enfriador]) AS photo_url
            WHERE photo_url IS NOT NULL
        )
    ) as payload,
    'pdv-' || p.id::text as composite_id
FROM
    public.evaluaciones_pdv p
LEFT JOIN public.clients c ON c.client_code = p.client_code
LEFT JOIN auth.users u ON p.user_id = u.id;
