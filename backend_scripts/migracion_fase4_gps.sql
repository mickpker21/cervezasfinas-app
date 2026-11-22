-- FASE 4: Rastreo GPS y Trade Marketing (Supabase)

-- 1. Tabla para rastreo de ubicaciones en tiempo real (GPS Background)
CREATE TABLE IF NOT EXISTS public.user_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy DECIMAL,
    heading DECIMAL,
    speed DECIMAL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS para user_locations
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

-- Políticas para user_locations
CREATE POLICY "Users can insert their own locations"
    ON public.user_locations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own locations"
    ON public.user_locations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Supervisors and Admins can read all locations"
    ON public.user_locations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'ADMIN', 'supervisor', 'gerente', 'coortrade')
        )
    );

-- Índice para optimizar consultas de tiempo real por usuario
CREATE INDEX IF NOT EXISTS idx_user_locations_user_time 
ON public.user_locations (user_id, timestamp DESC);


-- 2. Tabla para Trade Marketing (Promociones y Campañas)
CREATE TABLE IF NOT EXISTS public.trade_promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    discount_percent DECIMAL(5,2),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    target_role VARCHAR(50), -- e.g., 'autoventa', 'preventa'
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS para trade_promotions
ALTER TABLE public.trade_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active promotions"
    ON public.trade_promotions FOR SELECT
    USING (status = 'ACTIVE');

CREATE POLICY "Admins and Coortrade can manage promotions"
    ON public.trade_promotions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'ADMIN', 'coortrade')
        )
    );
