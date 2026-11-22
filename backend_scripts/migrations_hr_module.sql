-- 1. Auditoría (Enterprise)
-- Registra todas las acciones críticas.
CREATE TABLE IF NOT EXISTS public.hr_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,       -- ej: 'CHECK_IN', 'UPDATE_COMMISSION'
    target TEXT,                -- ej: 'hr_attendance', 'users'
    details JSONB,              -- Detalles flexibles del evento
    created_at TIMESTAMPTZ DEFAULT now(),
    synced BOOLEAN DEFAULT false -- Para control interno de sincronización
);

-- RLS: Solo el usuario puede ver sus propias acciones, o admin puede ver todo
ALTER TABLE public.hr_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden insertar sus propios logs" 
ON public.hr_audit FOR INSERT 
WITH CHECK (auth.uid() = actor_id);

CREATE POLICY "Admins pueden ver todo" 
ON public.hr_audit FOR SELECT 
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'gerente', 'control-interno')));

-- 2. Asistencia (Reloj Checador)
CREATE TABLE IF NOT EXISTS public.hr_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('check_in', 'check_out')),
    timestamp TIMESTAMPTZ DEFAULT now(),
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT now(),
    synced BOOLEAN DEFAULT false
);

ALTER TABLE public.hr_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver su propia asistencia" 
ON public.hr_attendance FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Usuarios pueden registrar su propia asistencia" 
ON public.hr_attendance FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Supervisores pueden ver asistencia de todos" 
ON public.hr_attendance FOR SELECT 
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'gerente', 'supervisor')));

-- 3. Reglas de Juego (Gamificación)
CREATE TABLE IF NOT EXISTS public.hr_gamification (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id),
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    badges JSONB DEFAULT '[]'::jsonb, -- Array de medallas ganadas
    streak INTEGER DEFAULT 0,         -- Días consecutivos
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.hr_gamification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos pueden ver gamificación (Ranking público)" 
ON public.hr_gamification FOR SELECT 
USING (true);

-- 4. Motor de Comisiones (Reglas)
CREATE TABLE IF NOT EXISTS public.hr_commissions_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL,             -- ej: 'chofer', 'preventa'
    kpi TEXT NOT NULL,              -- ej: 'volumen_cajas', 'cobertura'
    threshold NUMERIC,              -- Meta a alcanzar (ej: 100)
    payout_factor NUMERIC,          -- Cuánto paga (ej: 5.50)
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.hr_commissions_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de reglas" 
ON public.hr_commissions_rules FOR SELECT 
USING (true);

CREATE POLICY "Solo admins modifican reglas" 
ON public.hr_commissions_rules FOR ALL 
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'gerente')));
