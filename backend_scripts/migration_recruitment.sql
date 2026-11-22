-- ============================================================
-- MÓDULO DE RECLUTAMIENTO RRHH
-- migration_recruitment.sql
-- Ejecutar en Supabase SQL Editor (o en tu DB local)
-- ============================================================

-- 1. VACANTES / JOB POSTINGS
CREATE TABLE IF NOT EXISTS job_postings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  position_title TEXT NOT NULL,
  area TEXT NOT NULL, -- Almacen, Transporte, Ventas, etc.
  department TEXT,
  description TEXT,
  requirements TEXT,      -- Texto libre de requisitos
  requirements_image_url TEXT, -- Foto de requisitos subida
  salary_min NUMERIC,
  salary_max NUMERIC,
  contract_type TEXT DEFAULT 'Tiempo Completo', -- Tiempo Completo, Part Time, Por proyecto
  location TEXT,
  vacancies INTEGER DEFAULT 1,
  status TEXT DEFAULT 'activa', -- activa, pausada, cerrada
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CUESTIONARIOS POR VACANTE
CREATE TABLE IF NOT EXISTS job_questionnaires (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_posting_id UUID REFERENCES job_postings(id) ON DELETE CASCADE,
  position_type TEXT, -- Para cuestionarios reutilizables por tipo de puesto
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'text', -- text, yes_no, multiple_choice, scale, number
  is_required BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. OPCIONES DE PREGUNTAS (multiple_choice)
CREATE TABLE IF NOT EXISTS job_questionnaire_options (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID REFERENCES job_questionnaires(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

-- 4. RESPUESTAS DESCALIFICADORAS
CREATE TABLE IF NOT EXISTS job_questionnaire_disqualifiers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID REFERENCES job_questionnaires(id) ON DELETE CASCADE,
  disqualifying_answer TEXT NOT NULL, -- La respuesta que descalifica (ej: "no" para ¿tienes licencia?)
  reason TEXT -- Motivo de descalificación
);

-- 5. POSTULACIONES
CREATE TABLE IF NOT EXISTS job_applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_posting_id UUID REFERENCES job_postings(id),
  -- Datos candidato
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  curp TEXT,
  age INTEGER,
  city TEXT,
  -- Estado del pipeline
  pipeline_status TEXT DEFAULT 'nueva',
  -- nueva | revisada | preseleccionada | contactada |
  -- entrevista_1 | entrevista_2 | estudio_socioeconomico |
  -- examen_medico | oferta | contratada | rechazada
  is_disqualified BOOLEAN DEFAULT false,
  disqualification_reason TEXT,
  auto_score INTEGER, -- 0-100 calculado al enviar la encuesta
  -- Auditoría
  assigned_to UUID REFERENCES auth.users(id), -- Reclutador asignado
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. RESPUESTAS DEL CANDIDATO
CREATE TABLE IF NOT EXISTS job_application_answers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID REFERENCES job_applications(id) ON DELETE CASCADE,
  question_id UUID REFERENCES job_questionnaires(id),
  question_text TEXT, -- Snapshot de la pregunta al momento de aplicar
  answer_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. DOCUMENTOS DEL CANDIDATO
CREATE TABLE IF NOT EXISTS job_application_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID REFERENCES job_applications(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- cv, ine_frente, ine_vuelta, curp, comprobante_domicilio, etc.
  document_name TEXT,
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. ESTUDIO SOCIOECONÓMICO
CREATE TABLE IF NOT EXISTS job_socioeconomic_studies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID REFERENCES job_applications(id) ON DELETE CASCADE UNIQUE,
  -- Sección 1: Datos generales
  marital_status TEXT,
  address TEXT,
  address_type TEXT, -- propio, rentado, familiar
  years_at_address INTEGER,
  -- Sección 2: Composición familiar
  household_members INTEGER,
  dependents INTEGER,
  is_breadwinner BOOLEAN,
  -- Sección 3: Situación económica
  personal_income NUMERIC,
  family_income NUMERIC,
  monthly_expenses NUMERIC,
  has_active_debts BOOLEAN,
  debt_details TEXT,
  has_bank_account BOOLEAN,
  credit_types TEXT, -- hipotecario, automotriz, personal, ninguno
  -- Sección 4: Patrimonio
  has_vehicle BOOLEAN,
  vehicle_year INTEGER,
  has_own_home BOOLEAN,
  other_assets TEXT,
  -- Sección 5: Referencias
  family_ref_1_name TEXT,
  family_ref_1_relation TEXT,
  family_ref_1_phone TEXT,
  family_ref_2_name TEXT,
  family_ref_2_relation TEXT,
  family_ref_2_phone TEXT,
  work_ref_1_name TEXT,
  work_ref_1_company TEXT,
  work_ref_1_position TEXT,
  work_ref_1_phone TEXT,
  work_ref_2_name TEXT,
  work_ref_2_company TEXT,
  work_ref_2_position TEXT,
  work_ref_2_phone TEXT,
  -- Sección 6: Antecedentes
  has_legal_issues BOOLEAN,
  has_health_conditions BOOLEAN,
  health_condition_details TEXT,
  last_employer TEXT,
  reason_for_leaving TEXT,
  -- Metadatos
  conducted_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. EVENTOS / HISTORIAL DEL PIPELINE
CREATE TABLE IF NOT EXISTS job_pipeline_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID REFERENCES job_applications(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- nota, llamada, entrevista, cambio_status, rechazo, documento_solicitado
  description TEXT,
  old_status TEXT,
  new_status TEXT,
  scheduled_at TIMESTAMPTZ, -- Para agendar entrevistas/citas
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_job_applications_posting ON job_applications(job_posting_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_status ON job_applications(pipeline_status);
CREATE INDEX IF NOT EXISTS idx_job_applications_created ON job_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_pipeline_events_app ON job_pipeline_events(application_id);
CREATE INDEX IF NOT EXISTS idx_job_questionnaires_posting ON job_questionnaires(job_posting_id);
CREATE INDEX IF NOT EXISTS idx_job_answers_app ON job_application_answers(application_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_questionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_questionnaire_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_questionnaire_disqualifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_application_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_application_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_socioeconomic_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_pipeline_events ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS: Vacantes públicas (cualquiera puede ver activas)
DROP POLICY IF EXISTS "job_postings_public_read" ON job_postings;
CREATE POLICY "job_postings_public_read" ON job_postings
  FOR SELECT USING (status = 'activa');

DROP POLICY IF EXISTS "job_postings_admin_all" ON job_postings;
CREATE POLICY "job_postings_admin_all" ON job_postings
  FOR ALL USING (
    auth.jwt() ->> 'role' IN ('authenticated') AND (
      (auth.jwt()->'user_metadata'->>'type') IN ('rrhh', 'admin', 'auxiliar_rrhh')
    )
  );

-- POLÍTICAS: Cuestionarios públicos en vacantes activas
DROP POLICY IF EXISTS "job_questionnaires_public_read" ON job_questionnaires;
CREATE POLICY "job_questionnaires_public_read" ON job_questionnaires
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM job_postings p WHERE p.id = job_posting_id AND p.status = 'activa')
  );

DROP POLICY IF EXISTS "job_questionnaires_admin_all" ON job_questionnaires;
CREATE POLICY "job_questionnaires_admin_all" ON job_questionnaires
  FOR ALL USING (
    (auth.jwt()->'user_metadata'->>'type') IN ('rrhh', 'admin', 'auxiliar_rrhh')
  );

-- POLÍTICAS: Candidatos (pueden insertar, pero no leer todas las postulaciones)
DROP POLICY IF EXISTS "job_applications_public_insert" ON job_applications;
CREATE POLICY "job_applications_public_insert" ON job_applications
  FOR INSERT TO anon, authenticated
  WITH CHECK (true); -- Cualquiera puede postularse

-- NOTA: El frontend genera el ID para evitar usar RETURNING, 
-- ya que esto requeriría permisos de SELECT que los candidatos no tienen.

DROP POLICY IF EXISTS "job_applications_rrhh_read" ON job_applications;
CREATE POLICY "job_applications_rrhh_read" ON job_applications
  FOR SELECT TO authenticated
  USING (
    (auth.jwt()->'user_metadata'->>'type') IN ('rrhh', 'admin', 'auxiliar_rrhh')
  );

DROP POLICY IF EXISTS "job_applications_rrhh_update" ON job_applications;
CREATE POLICY "job_applications_rrhh_update" ON job_applications
  FOR UPDATE USING (
    (auth.jwt()->'user_metadata'->>'type') IN ('rrhh', 'admin', 'auxiliar_rrhh')
  );

-- POLÍTICAS: Respuestas y documentos
DROP POLICY IF EXISTS "job_answers_public_insert" ON job_application_answers;
CREATE POLICY "job_answers_public_insert" ON job_application_answers
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "job_answers_rrhh_read" ON job_application_answers;
CREATE POLICY "job_answers_rrhh_read" ON job_application_answers
  FOR SELECT USING (
    (auth.jwt()->'user_metadata'->>'type') IN ('rrhh', 'admin', 'auxiliar_rrhh')
  );

DROP POLICY IF EXISTS "job_docs_public_insert" ON job_application_documents;
CREATE POLICY "job_docs_public_insert" ON job_application_documents
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "job_docs_rrhh_all" ON job_application_documents;
CREATE POLICY "job_docs_rrhh_all" ON job_application_documents
  FOR ALL USING (
    (auth.jwt()->'user_metadata'->>'type') IN ('rrhh', 'admin', 'auxiliar_rrhh')
  );

DROP POLICY IF EXISTS "job_socioeconomic_rrhh_all" ON job_socioeconomic_studies;
CREATE POLICY "job_socioeconomic_rrhh_all" ON job_socioeconomic_studies
  FOR ALL USING (
    (auth.jwt()->'user_metadata'->>'type') IN ('rrhh', 'admin', 'auxiliar_rrhh')
  );

-- POLÍTICAS: Eventos del pipeline
DROP POLICY IF EXISTS "job_pipeline_events_public_insert" ON job_pipeline_events;
CREATE POLICY "job_pipeline_events_public_insert" ON job_pipeline_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "job_pipeline_events_rrhh_all" ON job_pipeline_events;
CREATE POLICY "job_pipeline_events_rrhh_all" ON job_pipeline_events
  FOR ALL TO authenticated
  USING (
    (auth.jwt()->'user_metadata'->>'type') IN ('rrhh', 'admin', 'auxiliar_rrhh')
  );


-- ============================================================
-- CUESTIONARIOS BASE POR TIPO DE PUESTO (seed data)
-- Puedes agregar más preguntas después desde el Admin
-- ============================================================

-- Helper: primero necesitamos IDs de las vacantes para los cuestionarios
-- Pero los cuestionarios pueden existir por "position_type" independientemente
-- Se asocian al job_posting_id cuando se crea la vacante


-- ============================================================
-- STORAGE BUCKETS (se crean automáticamente con este SQL)
-- ============================================================

-- Bucket PRIVADO para documentos de candidatos (CV, INE, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recruitment-docs',
  'recruitment-docs',
  false,                          -- PRIVADO: solo RRHH puede ver
  10485760,                       -- 10 MB máximo por archivo
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Bucket PÚBLICO para imágenes de requisitos de vacantes
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-requirements',
  'job-requirements',
  true,                           -- PÚBLICO: candidatos pueden ver la foto
  5242880,                        -- 5 MB máximo
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage: recruitment-docs (solo RRHH lee, cualquiera sube)
DROP POLICY IF EXISTS "recruitment_docs_public_insert" ON storage.objects;
CREATE POLICY "recruitment_docs_public_insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'recruitment-docs');

-- Necesario para que el cliente Supabase confirme la subida (y para 'upsert: true')
DROP POLICY IF EXISTS "recruitment_docs_public_update" ON storage.objects;
CREATE POLICY "recruitment_docs_public_update" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'recruitment-docs');

DROP POLICY IF EXISTS "recruitment_docs_public_select" ON storage.objects;
CREATE POLICY "recruitment_docs_public_select" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'recruitment-docs');

-- Políticas exclusivas para RRHH
DROP POLICY IF EXISTS "recruitment_docs_rrhh_read" ON storage.objects;
CREATE POLICY "recruitment_docs_rrhh_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'recruitment-docs' AND
    (auth.jwt()->'user_metadata'->>'type') IN ('rrhh', 'admin', 'auxiliar_rrhh')
  );

DROP POLICY IF EXISTS "recruitment_docs_rrhh_delete" ON storage.objects;
CREATE POLICY "recruitment_docs_rrhh_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'recruitment-docs' AND
    (auth.jwt()->'user_metadata'->>'type') IN ('rrhh', 'admin', 'auxiliar_rrhh')
  );

-- Políticas de Storage: job-requirements (público lectura, solo RRHH escribe)
DROP POLICY IF EXISTS "job_requirements_public_read" ON storage.objects;
CREATE POLICY "job_requirements_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'job-requirements');

DROP POLICY IF EXISTS "job_requirements_rrhh_insert" ON storage.objects;
CREATE POLICY "job_requirements_rrhh_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'job-requirements' AND
    (auth.jwt()->'user_metadata'->>'type') IN ('rrhh', 'admin', 'auxiliar_rrhh')
  );

DROP POLICY IF EXISTS "job_requirements_rrhh_delete" ON storage.objects;
CREATE POLICY "job_requirements_rrhh_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'job-requirements' AND
    (auth.jwt()->'user_metadata'->>'type') IN ('rrhh', 'admin', 'auxiliar_rrhh')
  );

-- ============================================================
-- FIN DE MIGRACIÓN
-- ============================================================
