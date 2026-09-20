-- HRMS Phase 10: Applicant Tracking System (ATS).
-- Additive only. Reuses hr_vacancies / hr_job_requests from Phase 9. No quota rewrite.

-- ---------------------------------------------------------------------------
-- Vacancy recruiter filter weights (optional override of policy defaults)
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_vacancies
  ADD COLUMN IF NOT EXISTS match_weights jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.hr_vacancies
  ADD COLUMN IF NOT EXISTS required_location text;

ALTER TABLE public.hr_vacancies
  ADD COLUMN IF NOT EXISTS requires_qid boolean NOT NULL DEFAULT false;

ALTER TABLE public.hr_vacancies
  ADD COLUMN IF NOT EXISTS requires_visa boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Candidates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text,
  phone text,
  nationality text,
  location text,
  cv_path text,
  cv_file_name text,
  cv_text text,
  qid text,
  visa_status text,
  notice_period_days int,
  expected_salary_qar numeric(12, 2),
  experience_years numeric(4, 1),
  education text,
  skills text,
  consent_at timestamptz,
  consent_note text,
  duplicate_of uuid REFERENCES public.hr_candidates(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_candidates_name_chk CHECK (char_length(trim(full_name)) >= 2),
  CONSTRAINT hr_candidates_source_chk CHECK (
    source IN ('manual', 'cv_upload', 'bulk_upload', 'referral', 'other')
  ),
  CONSTRAINT hr_candidates_notice_chk CHECK (
    notice_period_days IS NULL OR notice_period_days >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_hr_candidates_email
  ON public.hr_candidates (lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hr_candidates_phone
  ON public.hr_candidates (phone)
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hr_candidates_qid
  ON public.hr_candidates (qid)
  WHERE qid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hr_candidates_name
  ON public.hr_candidates (full_name);

CREATE INDEX IF NOT EXISTS idx_hr_candidates_created
  ON public.hr_candidates (created_at DESC);

DROP TRIGGER IF EXISTS trg_hr_candidates_updated ON public.hr_candidates;
CREATE TRIGGER trg_hr_candidates_updated
  BEFORE UPDATE ON public.hr_candidates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.hr_candidates TO authenticated;
GRANT ALL ON public.hr_candidates TO service_role;

ALTER TABLE public.hr_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_candidates read" ON public.hr_candidates;
CREATE POLICY "hr_candidates read" ON public.hr_candidates
  FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_candidates write" ON public.hr_candidates;
CREATE POLICY "hr_candidates write" ON public.hr_candidates
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 70)
  WITH CHECK (public.current_user_role_level() >= 70);

-- ---------------------------------------------------------------------------
-- Applications (pipeline)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.hr_candidates(id) ON DELETE CASCADE,
  vacancy_id uuid NOT NULL REFERENCES public.hr_vacancies(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'new',
  match_score numeric(5, 2),
  match_explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_score numeric(5, 2),
  rejection_reason text,
  hold_reason text,
  assigned_recruiter uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  stage_changed_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_applications_stage_chk CHECK (
    stage IN (
      'new', 'cv_screened', 'shortlisted', 'hr_interview', 'technical_interview',
      'final_interview', 'selected', 'offer_pending', 'offer_issued',
      'offer_accepted', 'offer_declined', 'documentation_pending',
      'ready_to_join', 'joined', 'on_hold', 'rejected', 'talent_pool'
    )
  ),
  CONSTRAINT hr_applications_score_chk CHECK (
    match_score IS NULL OR (match_score >= 0 AND match_score <= 100)
  ),
  CONSTRAINT hr_applications_ai_score_chk CHECK (
    ai_score IS NULL OR (ai_score >= 0 AND ai_score <= 100)
  ),
  UNIQUE (candidate_id, vacancy_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_applications_vacancy_stage
  ON public.hr_applications (vacancy_id, stage, applied_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_applications_candidate
  ON public.hr_applications (candidate_id, applied_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_applications_stage
  ON public.hr_applications (stage, stage_changed_at DESC);

DROP TRIGGER IF EXISTS trg_hr_applications_updated ON public.hr_applications;
CREATE TRIGGER trg_hr_applications_updated
  BEFORE UPDATE ON public.hr_applications
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.hr_applications TO authenticated;
GRANT ALL ON public.hr_applications TO service_role;

ALTER TABLE public.hr_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_applications read" ON public.hr_applications;
CREATE POLICY "hr_applications read" ON public.hr_applications
  FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_applications write" ON public.hr_applications;
CREATE POLICY "hr_applications write" ON public.hr_applications
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 70)
  WITH CHECK (public.current_user_role_level() >= 70);

-- ---------------------------------------------------------------------------
-- Stage + communication history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_application_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.hr_applications(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  note text,
  communication_channel text,
  acted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acted_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT hr_app_stage_hist_channel_chk CHECK (
    communication_channel IS NULL
    OR communication_channel IN ('note', 'email', 'phone', 'in_person', 'other')
  )
);

CREATE INDEX IF NOT EXISTS idx_hr_app_stage_hist_app
  ON public.hr_application_stage_history (application_id, acted_at DESC);

GRANT SELECT, INSERT ON public.hr_application_stage_history TO authenticated;
GRANT ALL ON public.hr_application_stage_history TO service_role;

ALTER TABLE public.hr_application_stage_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_app_stage_hist read" ON public.hr_application_stage_history;
CREATE POLICY "hr_app_stage_hist read" ON public.hr_application_stage_history
  FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_app_stage_hist insert" ON public.hr_application_stage_history;
CREATE POLICY "hr_app_stage_hist insert" ON public.hr_application_stage_history
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 70);

-- ---------------------------------------------------------------------------
-- Offers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.hr_applications(id) ON DELETE CASCADE,
  salary_qar numeric(12, 2),
  currency text NOT NULL DEFAULT 'QAR',
  joining_date date,
  offer_letter_path text,
  status text NOT NULL DEFAULT 'draft',
  issued_at timestamptz,
  responded_at timestamptz,
  decline_reason text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_offers_status_chk CHECK (
    status IN ('draft', 'issued', 'accepted', 'declined', 'withdrawn', 'expired')
  )
);

CREATE INDEX IF NOT EXISTS idx_hr_offers_application
  ON public.hr_offers (application_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_hr_offers_updated ON public.hr_offers;
CREATE TRIGGER trg_hr_offers_updated
  BEFORE UPDATE ON public.hr_offers
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.hr_offers TO authenticated;
GRANT ALL ON public.hr_offers TO service_role;

ALTER TABLE public.hr_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_offers read" ON public.hr_offers;
CREATE POLICY "hr_offers read" ON public.hr_offers
  FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 70);

DROP POLICY IF EXISTS "hr_offers write" ON public.hr_offers;
CREATE POLICY "hr_offers write" ON public.hr_offers
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 70)
  WITH CHECK (public.current_user_role_level() >= 70);

-- ---------------------------------------------------------------------------
-- CV storage bucket
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hr-candidate-cvs',
  'hr-candidate-cvs',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "hr_candidate_cvs read" ON storage.objects;
CREATE POLICY "hr_candidate_cvs read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'hr-candidate-cvs'
    AND public.current_user_role_level() >= 55
  );

DROP POLICY IF EXISTS "hr_candidate_cvs write" ON storage.objects;
CREATE POLICY "hr_candidate_cvs write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hr-candidate-cvs'
    AND public.current_user_role_level() >= 70
  );

DROP POLICY IF EXISTS "hr_candidate_cvs update" ON storage.objects;
CREATE POLICY "hr_candidate_cvs update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'hr-candidate-cvs'
    AND public.current_user_role_level() >= 70
  );
