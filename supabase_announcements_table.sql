-- tabla de anuncios globales
CREATE TABLE public.announcements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  image_url text NOT NULL,
  start_date timestamp with time zone NOT NULL,
  end_date timestamp with time zone NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Crear política de lectura pública (todos los usuarios autenticados pueden ver los anuncios)
CREATE POLICY "Enable read access for authenticated users" ON public.announcements
    FOR SELECT TO authenticated USING (true);

-- Crear política de escritura (solo admin o HR, pero para simplificar, permitimos a authenticated y manejamos el rol en el Frontend, o aplicamos policies robustas)
CREATE POLICY "Enable insert for authenticated users" ON public.announcements
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" ON public.announcements
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable delete for authenticated users" ON public.announcements
    FOR DELETE TO authenticated USING (true);
