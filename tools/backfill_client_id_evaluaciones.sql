-- Intenta vincular evaluaciones existentes con clients por nombre del negocio
-- Usa coincidencias parciales entre puntoVenta/punto_venta y clients.business_name/name
-- Revísalo primero en el editor de SQL de Supabase y ejecuta bajo tu criterio.

UPDATE public.evaluaciones_pdv e
SET client_id = c.id
FROM public.clients c
WHERE e.client_id IS NULL
  AND (
    (e.puntoVenta IS NOT NULL AND (c.business_name ILIKE ('%' || e.puntoVenta || '%') OR e.puntoVenta ILIKE ('%' || c.business_name || '%')))
    OR (e.punto_venta IS NOT NULL AND (c.business_name ILIKE ('%' || e.punto_venta || '%') OR e.punto_venta ILIKE ('%' || c.business_name || '%')))
    OR (e.puntoVenta IS NOT NULL AND (c.name ILIKE ('%' || e.puntoVenta || '%') OR e.puntoVenta ILIKE ('%' || c.name || '%')))
    OR (e.punto_venta IS NOT NULL AND (c.name ILIKE ('%' || e.punto_venta || '%') OR e.punto_venta ILIKE ('%' || c.name || '%')))
  );

-- Opcional: establece zona desde clients si existe columna zona en clients
-- UPDATE public.evaluaciones_pdv e
-- SET zona = c.zona
-- FROM public.clients c
-- WHERE e.client_id IS NULL AND e.zona IS NULL AND c.id = e.client_id;
