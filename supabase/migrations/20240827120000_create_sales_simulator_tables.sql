-- PRECIOS
CREATE TABLE IF NOT EXISTS public.precios (
    cve_marca TEXT PRIMARY KEY,
    des_marca TEXT,
    bronce NUMERIC,
    plata NUMERIC,
    oro NUMERIC,
    platino NUMERIC,
    titanio NUMERIC,
    titanio2 NUMERIC
);

ALTER TABLE public.precios ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist, then create them
DROP POLICY IF EXISTS "Allow read access to all users on precios" ON public.precios;
CREATE POLICY "Allow read access to all users on precios" ON public.precios FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow full access to admins on precios" ON public.precios;
CREATE POLICY "Allow full access to admins on precios" ON public.precios FOR ALL USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

-- PREVENTA
CREATE TABLE IF NOT EXISTS public.preventa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID REFERENCES auth.users(id),
    client_id UUID REFERENCES public.clients(id),
    total_amount NUMERIC
);

ALTER TABLE public.preventa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow insert and select for authenticated users on preventa" ON public.preventa;
CREATE POLICY "Allow insert and select for authenticated users on preventa" ON public.preventa FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow read access to all users on preventa" ON public.preventa;
CREATE POLICY "Allow read access to all users on preventa" ON public.preventa FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow full access to admins on preventa" ON public.preventa;
CREATE POLICY "Allow full access to admins on preventa" ON public.preventa FOR ALL USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

-- PREVENTA ITEMS
CREATE TABLE IF NOT EXISTS public.preventa_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    preventa_id UUID REFERENCES public.preventa(id) ON DELETE CASCADE,
    cve_marca TEXT REFERENCES public.precios(cve_marca),
    quantity INTEGER,
    unit_price NUMERIC,
    total_price NUMERIC
);

ALTER TABLE public.preventa_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow insert and select for authenticated users on preventa_items" ON public.preventa_items;
CREATE POLICY "Allow insert and select for authenticated users on preventa_items" ON public.preventa_items FOR ALL USING (EXISTS (SELECT 1 FROM preventa WHERE preventa.id = preventa_id AND preventa.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM preventa WHERE preventa.id = preventa_id AND preventa.user_id = auth.uid()));

DROP POLICY IF EXISTS "Allow read access to all users on preventa_items" ON public.preventa_items;
CREATE POLICY "Allow read access to all users on preventa_items" ON public.preventa_items FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow full access to admins on preventa_items" ON public.preventa_items;
CREATE POLICY "Allow full access to admins on preventa_items" ON public.preventa_items FOR ALL USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

-- SKU IMAGES (Corrected Structure)
-- Drop the table to ensure the new structure is applied
DROP TABLE IF EXISTS public.sku_images;

CREATE TABLE public.sku_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The column name here is 'sku', not 'cve_marca', to match the rest of the application
    sku TEXT NOT NULL UNIQUE,
    image_url TEXT
);

ALTER TABLE public.sku_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access for authenticated users on sku_images" ON public.sku_images;
CREATE POLICY "Allow read access for authenticated users on sku_images" ON public.sku_images FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all access for admins on sku_images" ON public.sku_images;
CREATE POLICY "Allow all access for admins on sku_images" ON public.sku_images FOR ALL USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));
