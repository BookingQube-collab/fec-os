-- HRMS Phase 1: policy settings store, staff profile ext, salary/status history.
-- Additive only. Termination is never automatic from roster import (app-side).

-- ---------------------------------------------------------------------------
-- HR policy settings (DB-configurable, no hard-coded entitlements in new UI)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_policy_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.hr_companies(id) ON DELETE CASCADE,
  section text NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_policy_settings_section_chk CHECK (
    section IN (
      'leave', 'ot', 'warning', 'probation', 'notice',
      'document', 'air_ticket', 'payroll', 'notification'
    )
  ),
  CONSTRAINT hr_policy_settings_key_chk CHECK (btrim(key) <> '')
);

-- Global (company_id NULL) + per-company uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS hr_policy_settings_section_key_uq
  ON public.hr_policy_settings (section, key, (COALESCE(company_id::text, '')));

CREATE INDEX IF NOT EXISTS hr_policy_settings_section_idx
  ON public.hr_policy_settings (section);

DROP TRIGGER IF EXISTS trg_hr_policy_settings_updated ON public.hr_policy_settings;
CREATE TRIGGER trg_hr_policy_settings_updated
  BEFORE UPDATE ON public.hr_policy_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed defaults from approved brief (sick 15, not 14). Idempotent.
INSERT INTO public.hr_policy_settings (company_id, section, key, value)
SELECT NULL, v.section, v.key, v.value::jsonb
FROM (
  VALUES
    -- leave
    ('leave', 'sick_days', '15'),
    ('leave', 'annual_days', '21'),
    ('leave', 'annual_from_hire_date', 'true'),
    ('leave', 'emergency_days', '7'),
    ('leave', 'maternity_days', '50'),
    ('leave', 'compassionate_inside_qatar_days', '5'),
    ('leave', 'compassionate_outside_qatar_days', '11'),
    -- ot
    ('ot', 'min_claimable_minutes', '60'),
    ('ot', 'rounding', '"down"'),
    ('ot', 'overtime_after_minutes', '480'),
    ('ot', 'max_daily_ot_minutes', 'null'),
    ('ot', 'max_weekly_ot_minutes', 'null'),
    ('ot', 'requires_preapproval', 'false'),
    -- warning
    ('warning', 'active_threshold', '3'),
    ('warning', 'probation_threshold', '1'),
    ('warning', 'auto_terminate', 'false'),
    -- probation
    ('probation', 'default_months', '6'),
    ('probation', 'reminder_days', '[30,15,7]'),
    -- notice (days by employment category)
    ('notice', 'permanent_days', '30'),
    ('notice', 'secondment_days', '14'),
    ('notice', 'joker_days', '7'),
    ('notice', 'family_visa_days', '30'),
    ('notice', 'higher_mgmt_days', '60'),
    ('notice', 'operations_days', '30'),
    -- document expiry
    ('document', 'qid_alert_days', '30'),
    ('document', 'passport_alert_days', '[180,90,60,30]'),
    ('document', 'reminder_frequency_days', '7'),
    -- air ticket
    ('air_ticket', 'cycle_months', '12'),
    ('air_ticket', 'from_hire_date', 'true'),
    ('air_ticket', 'family_eligible_default', 'false'),
    -- payroll
    ('payroll', 'currency', '"QAR"'),
    ('payroll', 'timezone', '"Asia/Qatar"'),
    ('payroll', 'default_payment_by_category', '{"permanent":"wps","secondment":"cheque","joker":"cheque","family_visa":"bank_transfer","higher_mgmt":"wps","operations":"wps"}'),
    -- notification
    ('notification', 'channels', '["in_app","email"]'),
    ('notification', 'qid_alert_days', '30'),
    ('notification', 'passport_alert_days', '[180,90,60,30]'),
    ('notification', 'probation_reminder_days', '[30,15,7]')
) AS v(section, key, value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_policy_settings p
  WHERE p.company_id IS NULL AND p.section = v.section AND p.key = v.key
);

-- ---------------------------------------------------------------------------
-- Staff profile extension (sensitive fields)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_profile_ext (
  staff_id uuid PRIMARY KEY REFERENCES public.staff(id) ON DELETE CASCADE,
  nationality text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,
  reporting_manager_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  employment_category text,
  probation_start date,
  probation_end date,
  passport_number text,
  passport_expiry date,
  visa_number text,
  visa_expiry date,
  sponsorship_info text,
  payment_method text,
  bank_name text,
  iban text,
  wps_employee_id text,
  last_working_date date,
  releasing_date date,
  exit_reason text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_profile_ext_category_chk CHECK (
    employment_category IS NULL OR employment_category IN (
      'permanent', 'secondment', 'joker', 'family_visa', 'higher_mgmt', 'operations'
    )
  ),
  CONSTRAINT staff_profile_ext_payment_chk CHECK (
    payment_method IS NULL OR payment_method IN ('wps', 'cheque', 'bank_transfer')
  ),
  CONSTRAINT staff_profile_ext_manager_chk CHECK (
    reporting_manager_staff_id IS NULL OR reporting_manager_staff_id <> staff_id
  )
);

DROP TRIGGER IF EXISTS trg_staff_profile_ext_updated ON public.staff_profile_ext;
CREATE TRIGGER trg_staff_profile_ext_updated
  BEFORE UPDATE ON public.staff_profile_ext
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- Append-only salary history (current snapshot stays on staff_compensation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_salary_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  effective_on date NOT NULL,
  basic_qar numeric(12, 2),
  allowances jsonb NOT NULL DEFAULT '{}'::jsonb,
  monthly_total_qar numeric(12, 2),
  daily_rate_qar numeric(12, 2),
  currency text NOT NULL DEFAULT 'QAR',
  reason text,
  letter_document_id uuid,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_salary_history_staff_idx
  ON public.staff_salary_history (staff_id, effective_on DESC, created_at DESC);

-- ---------------------------------------------------------------------------
-- Append-only status history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  effective_on date NOT NULL,
  reason text,
  document_id uuid,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_status_history_staff_idx
  ON public.staff_status_history (staff_id, effective_on DESC, created_at DESC);

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_policy_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_profile_ext TO authenticated;
GRANT SELECT, INSERT ON public.staff_salary_history TO authenticated;
GRANT SELECT, INSERT ON public.staff_status_history TO authenticated;
GRANT ALL ON
  public.hr_policy_settings,
  public.staff_profile_ext,
  public.staff_salary_history,
  public.staff_status_history
TO service_role;

-- No UPDATE/DELETE on history tables for authenticated (append-only)
REVOKE UPDATE, DELETE ON public.staff_salary_history FROM authenticated;
REVOKE UPDATE, DELETE ON public.staff_status_history FROM authenticated;

ALTER TABLE public.hr_policy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profile_ext ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_salary_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_status_history ENABLE ROW LEVEL SECURITY;

-- Policy settings: HR+ can read, write via same (app enforces hr.policy.configure)
DROP POLICY IF EXISTS "hr_policy_settings read" ON public.hr_policy_settings;
CREATE POLICY "hr_policy_settings read" ON public.hr_policy_settings
  FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_policy_settings write" ON public.hr_policy_settings;
CREATE POLICY "hr_policy_settings write" ON public.hr_policy_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('ceo', 'coo', 'cfo', 'hr')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('ceo', 'coo', 'cfo', 'hr')
    )
  );

-- Profile ext: salary-viewer roles for sensitive, self may read non-bank later via app
DROP POLICY IF EXISTS "staff_profile_ext read" ON public.staff_profile_ext;
CREATE POLICY "staff_profile_ext read" ON public.staff_profile_ext
  FOR SELECT TO authenticated
  USING (
    public.user_can_view_staff_salary()
    OR staff_id IN (SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "staff_profile_ext write" ON public.staff_profile_ext;
CREATE POLICY "staff_profile_ext write" ON public.staff_profile_ext
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('ceo', 'coo', 'hr')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('ceo', 'coo', 'hr')
    )
  );

DROP POLICY IF EXISTS "staff_salary_history read" ON public.staff_salary_history;
CREATE POLICY "staff_salary_history read" ON public.staff_salary_history
  FOR SELECT TO authenticated
  USING (public.user_can_view_staff_salary());

DROP POLICY IF EXISTS "staff_salary_history insert" ON public.staff_salary_history;
CREATE POLICY "staff_salary_history insert" ON public.staff_salary_history
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_view_staff_salary());

DROP POLICY IF EXISTS "staff_status_history read" ON public.staff_status_history;
CREATE POLICY "staff_status_history read" ON public.staff_status_history
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR staff_id IN (SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "staff_status_history insert" ON public.staff_status_history;
CREATE POLICY "staff_status_history insert" ON public.staff_status_history
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 55);
