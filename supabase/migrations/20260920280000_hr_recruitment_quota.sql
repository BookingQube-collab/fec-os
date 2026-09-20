-- HRMS Phase 9: workforce quotas + job requests + vacancy publish stub (no full ATS).
-- Additive only. Reuses locations, master_departments, staff, hr_employee_documents.
-- Approval ladder mirrors leave/PR step tables.

-- ---------------------------------------------------------------------------
-- Workforce quotas (nullable dimension columns = "any" for that axis)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_workforce_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.master_departments(id) ON DELETE SET NULL,
  designation text,
  employment_category text,
  approved_headcount int NOT NULL,
  effective_on date NOT NULL DEFAULT (CURRENT_DATE),
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_workforce_quotas_headcount_chk CHECK (approved_headcount >= 0),
  CONSTRAINT hr_workforce_quotas_category_chk CHECK (
    employment_category IS NULL
    OR employment_category IN (
      'permanent', 'secondment', 'joker', 'family_visa', 'higher_mgmt', 'operations'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_hr_workforce_quotas_loc
  ON public.hr_workforce_quotas (location_id, effective_on DESC)
  WHERE active;

CREATE INDEX IF NOT EXISTS idx_hr_workforce_quotas_dept
  ON public.hr_workforce_quotas (department_id)
  WHERE active;

DROP TRIGGER IF EXISTS trg_hr_workforce_quotas_updated ON public.hr_workforce_quotas;
CREATE TRIGGER trg_hr_workforce_quotas_updated
  BEFORE UPDATE ON public.hr_workforce_quotas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.hr_workforce_quotas TO authenticated;
GRANT ALL ON public.hr_workforce_quotas TO service_role;

ALTER TABLE public.hr_workforce_quotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_workforce_quotas read" ON public.hr_workforce_quotas;
CREATE POLICY "hr_workforce_quotas read" ON public.hr_workforce_quotas
  FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_workforce_quotas write" ON public.hr_workforce_quotas;
CREATE POLICY "hr_workforce_quotas write" ON public.hr_workforce_quotas
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 70)
  WITH CHECK (public.current_user_role_level() >= 70);

-- ---------------------------------------------------------------------------
-- Job requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_job_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_title text NOT NULL,
  department_id uuid REFERENCES public.master_departments(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  vacancies_count int NOT NULL DEFAULT 1,
  request_type text NOT NULL DEFAULT 'new',
  replaced_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  employment_category text,
  job_description text,
  skills text,
  experience_years numeric(4, 1),
  education text,
  salary_budget_qar numeric(12, 2),
  requires_finance boolean NOT NULL DEFAULT false,
  required_joining_date date,
  justification text,
  priority text NOT NULL DEFAULT 'normal',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  current_step_role text,
  exceeds_quota boolean NOT NULL DEFAULT false,
  quota_override_status text NOT NULL DEFAULT 'none',
  quota_override_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  quota_override_at timestamptz,
  quota_override_reason text,
  return_reason text,
  rejection_reason text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_job_requests_vacancies_chk CHECK (vacancies_count > 0 AND vacancies_count <= 200),
  CONSTRAINT hr_job_requests_type_chk CHECK (request_type IN ('new', 'replacement')),
  CONSTRAINT hr_job_requests_priority_chk CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT hr_job_requests_status_chk CHECK (
    status IN (
      'draft', 'pending', 'approved', 'rejected', 'returned', 'cancelled',
      'published', 'on_hold', 'closed'
    )
  ),
  CONSTRAINT hr_job_requests_step_chk CHECK (
    current_step_role IS NULL
    OR current_step_role IN ('dept_ops', 'hr', 'finance', 'gm', 'quota_override')
  ),
  CONSTRAINT hr_job_requests_override_chk CHECK (
    quota_override_status IN ('none', 'pending', 'approved', 'rejected')
  ),
  CONSTRAINT hr_job_requests_category_chk CHECK (
    employment_category IS NULL
    OR employment_category IN (
      'permanent', 'secondment', 'joker', 'family_visa', 'higher_mgmt', 'operations'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_hr_job_requests_status
  ON public.hr_job_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_job_requests_loc_dept
  ON public.hr_job_requests (location_id, department_id);

CREATE INDEX IF NOT EXISTS idx_hr_job_requests_requester
  ON public.hr_job_requests (requested_by, created_at DESC);

DROP TRIGGER IF EXISTS trg_hr_job_requests_updated ON public.hr_job_requests;
CREATE TRIGGER trg_hr_job_requests_updated
  BEFORE UPDATE ON public.hr_job_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.hr_job_requests TO authenticated;
GRANT ALL ON public.hr_job_requests TO service_role;

ALTER TABLE public.hr_job_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_job_requests read" ON public.hr_job_requests;
CREATE POLICY "hr_job_requests read" ON public.hr_job_requests
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR requested_by = auth.uid()
  );

DROP POLICY IF EXISTS "hr_job_requests insert" ON public.hr_job_requests;
CREATE POLICY "hr_job_requests insert" ON public.hr_job_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role_level() >= 55
    OR requested_by = auth.uid()
  );

DROP POLICY IF EXISTS "hr_job_requests update" ON public.hr_job_requests;
CREATE POLICY "hr_job_requests update" ON public.hr_job_requests
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR requested_by = auth.uid()
  )
  WITH CHECK (
    public.current_user_role_level() >= 55
    OR requested_by = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- Job request approval steps
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_job_request_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_request_id uuid NOT NULL REFERENCES public.hr_job_requests(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  step_role text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  acted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acted_at timestamptz,
  comments text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_job_request_approvals_role_chk CHECK (
    step_role IN ('dept_ops', 'hr', 'finance', 'gm', 'quota_override')
  ),
  CONSTRAINT hr_job_request_approvals_status_chk CHECK (
    status IN ('pending', 'approved', 'skipped', 'rejected')
  ),
  UNIQUE (job_request_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_hr_job_request_approvals_req
  ON public.hr_job_request_approvals (job_request_id, step_order);

CREATE INDEX IF NOT EXISTS idx_hr_job_request_approvals_pending
  ON public.hr_job_request_approvals (step_role, status)
  WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE ON public.hr_job_request_approvals TO authenticated;
GRANT ALL ON public.hr_job_request_approvals TO service_role;

ALTER TABLE public.hr_job_request_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_job_request_approvals read" ON public.hr_job_request_approvals;
CREATE POLICY "hr_job_request_approvals read" ON public.hr_job_request_approvals
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR EXISTS (
      SELECT 1 FROM public.hr_job_requests r
      WHERE r.id = job_request_id AND r.requested_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "hr_job_request_approvals write" ON public.hr_job_request_approvals;
CREATE POLICY "hr_job_request_approvals write" ON public.hr_job_request_approvals
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- ---------------------------------------------------------------------------
-- Vacancies (publish after full approval — ATS candidates = Phase 10)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_vacancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_request_id uuid REFERENCES public.hr_job_requests(id) ON DELETE SET NULL,
  job_title text NOT NULL,
  department_id uuid REFERENCES public.master_departments(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  vacancies_count int NOT NULL DEFAULT 1,
  employment_category text,
  status text NOT NULL DEFAULT 'open',
  recruiter_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  closed_at timestamptz,
  hold_reason text,
  close_reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_vacancies_count_chk CHECK (vacancies_count > 0),
  CONSTRAINT hr_vacancies_status_chk CHECK (
    status IN ('open', 'on_hold', 'closed', 'cancelled', 'filled')
  )
);

CREATE INDEX IF NOT EXISTS idx_hr_vacancies_status
  ON public.hr_vacancies (status, location_id, department_id);

CREATE INDEX IF NOT EXISTS idx_hr_vacancies_job_request
  ON public.hr_vacancies (job_request_id);

DROP TRIGGER IF EXISTS trg_hr_vacancies_updated ON public.hr_vacancies;
CREATE TRIGGER trg_hr_vacancies_updated
  BEFORE UPDATE ON public.hr_vacancies
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.hr_vacancies TO authenticated;
GRANT ALL ON public.hr_vacancies TO service_role;

ALTER TABLE public.hr_vacancies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_vacancies read" ON public.hr_vacancies;
CREATE POLICY "hr_vacancies read" ON public.hr_vacancies
  FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_vacancies write" ON public.hr_vacancies;
CREATE POLICY "hr_vacancies write" ON public.hr_vacancies
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 70)
  WITH CHECK (public.current_user_role_level() >= 70);
