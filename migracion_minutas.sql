-- =====================================================
-- Migración: Sistema de Minutas
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. Extensión UUID
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Tabla de minutas (sesión/reunión)
CREATE TABLE IF NOT EXISTS public.minutas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'activa',  -- activa, cerrada
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Tabla de items/actividades de cada minuta
CREATE TABLE IF NOT EXISTS public.minuta_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minuta_id uuid NOT NULL REFERENCES public.minutas(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  due_date date,
  status text NOT NULL DEFAULT 'pendiente',
  -- Valores posibles: pendiente | en_progreso | evidencia_enviada | aprobada | rechazada
  evidence_urls text[] DEFAULT '{}',
  evidence_notes text,
  rejection_reason text,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_minuta_items_minuta ON public.minuta_items(minuta_id);
CREATE INDEX IF NOT EXISTS idx_minuta_items_assigned ON public.minuta_items(assigned_to);
CREATE INDEX IF NOT EXISTS idx_minutas_created_by ON public.minutas(created_by);
CREATE INDEX IF NOT EXISTS idx_minutas_status ON public.minutas(status);
CREATE INDEX IF NOT EXISTS idx_minuta_items_status ON public.minuta_items(status);

-- 5. RLS
ALTER TABLE public.minutas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minuta_items ENABLE ROW LEVEL SECURITY;

-- Política: Cualquier usuario autenticado puede leer minutas
DROP POLICY IF EXISTS minutas_select_auth ON public.minutas;
CREATE POLICY minutas_select_auth ON public.minutas
  FOR SELECT USING (auth.role() = 'authenticated');

-- Política: Solo admin/analista pueden insertar minutas
DROP POLICY IF EXISTS minutas_insert_auth ON public.minutas;
CREATE POLICY minutas_insert_auth ON public.minutas
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Política: Solo admin/analista pueden actualizar minutas
DROP POLICY IF EXISTS minutas_update_auth ON public.minutas;
CREATE POLICY minutas_update_auth ON public.minutas
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Política: Selección de items — usuario asignado o cualquier autenticado
DROP POLICY IF EXISTS minuta_items_select_auth ON public.minuta_items;
CREATE POLICY minuta_items_select_auth ON public.minuta_items
  FOR SELECT USING (auth.role() = 'authenticated');

-- Política: Inserción de items
DROP POLICY IF EXISTS minuta_items_insert_auth ON public.minuta_items;
CREATE POLICY minuta_items_insert_auth ON public.minuta_items
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Política: Actualización de items (usuario asignado puede subir evidencia, admin puede aprobar)
DROP POLICY IF EXISTS minuta_items_update_auth ON public.minuta_items;
CREATE POLICY minuta_items_update_auth ON public.minuta_items
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Política: Eliminación de items
DROP POLICY IF EXISTS minuta_items_delete_auth ON public.minuta_items;
CREATE POLICY minuta_items_delete_auth ON public.minuta_items
  FOR DELETE USING (auth.role() = 'authenticated');

-- 6. Storage bucket para evidencia fotográfica
-- NOTA: Ejecutar esto en la consola de Supabase -> Storage -> Create Bucket
-- Nombre: minuta-evidence
-- Public: true (para poder ver las fotos)
-- O usar la API:
INSERT INTO storage.buckets (id, name, public)
VALUES ('minuta-evidence', 'minuta-evidence', true)
ON CONFLICT (id) DO NOTHING;

-- Política de Storage: usuarios autenticados pueden subir
DROP POLICY IF EXISTS minuta_evidence_insert ON storage.objects;
CREATE POLICY minuta_evidence_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'minuta-evidence' AND auth.role() = 'authenticated'
  );

-- Política de Storage: lectura pública
DROP POLICY IF EXISTS minuta_evidence_select ON storage.objects;
CREATE POLICY minuta_evidence_select ON storage.objects
  FOR SELECT USING (bucket_id = 'minuta-evidence');

-- 7. Añadir 'analista' al enum user_role si existe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    BEGIN
      EXECUTE 'ALTER TYPE user_role ADD VALUE IF NOT EXISTS ' || quote_literal('analista');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- 8. Insertar 'analista' en user_types si existe la tabla
INSERT INTO public.user_types (name) VALUES ('analista')
ON CONFLICT DO NOTHING;

-- Fin migración minutas
