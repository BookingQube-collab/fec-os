-- HRMS Phase 8: payroll periods / lines / payslips / locks.
-- Additive only. Reuses FEC 28–27 cycle (app: roster-period.ts). Currency QAR.
-- Does not replace attendance readiness / attendance-hr payroll export.

-- ---------------------------------------------------------------------------
-- Extra payroll policy seeds — idempotent
-- ---------------------------------------------------------------------------
INSERT INTO public.hr_policy_settings (company_id, section, key, value)
SELECT NULL, v.section, v.key, v.value::jsonb
FROM (VALUES
  ('payroll', 'cycle', '"fec_28_27"'),
  ('payroll', 'days_per_month', '30'),
  ('payroll', 'wps_export_note', '"SIF-like columns for Finance validation — not bank-certified"')
) AS v(section, key, value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_policy_settings p
  WHERE p.company_id IS NULL AND p.section = v.section AND p.key = v.key
);

-- ---------------------------------------------------------------------------
-- Periods
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.hr_companies(id) ON DELETE CASCADE,
  month text NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'QAR',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_payroll_periods_month_chk CHECK (month ~ '^\d{4}-\d{2}$'),
  CONSTRAINT hr_payroll_periods_range_chk CHECK (date_to >= date_from),
  CONSTRAINT hr_payroll_periods_currency_chk CHECK (currency = 'QAR'),
  CONSTRAINT hr_payroll_periods_status_chk CHECK (
    status IN (
      'draft', 'hr_review', 'finance_review', 'gm_approved',
      'processed', 'paid', 'locked'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_payroll_periods_company_month_uq
  ON public.hr_payroll_periods (COALESCE(company_id::text, ''), month);

CREATE INDEX IF NOT EXISTS idx_hr_payroll_periods_status
  ON public.hr_payroll_periods (status, month DESC);

DROP TRIGGER IF EXISTS trg_hr_payroll_periods_updated ON public.hr_payroll_periods;
CREATE TRIGGER trg_hr_payroll_periods_updated
  BEFORE UPDATE ON public.hr_payroll_periods
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.hr_payroll_periods TO authenticated;
GRANT ALL ON public.hr_payroll_periods TO service_role;

ALTER TABLE public.hr_payroll_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_payroll_periods read" ON public.hr_payroll_periods;
CREATE POLICY "hr_payroll_periods read" ON public.hr_payroll_periods
  FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_payroll_periods insert" ON public.hr_payroll_periods;
CREATE POLICY "hr_payroll_periods insert" ON public.hr_payroll_periods
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_payroll_periods update" ON public.hr_payroll_periods;
CREATE POLICY "hr_payroll_periods update" ON public.hr_payroll_periods
  FOR UPDATE TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- ---------------------------------------------------------------------------
-- Lines earnings deductions jsonb. Locked periods resist edit in app.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.hr_payroll_periods(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  payment_method text NOT NULL,
  earnings jsonb NOT NULL DEFAULT '{}'::jsonb,
  deductions jsonb NOT NULL DEFAULT '{}'::jsonb,
  gross_qar numeric(12, 2) NOT NULL DEFAULT 0,
  net_qar numeric(12, 2) NOT NULL DEFAULT 0,
  wps_eligible boolean NOT NULL DEFAULT false,
  variance_vs_prev numeric(12, 2),
  proration_factor numeric(8, 6) NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_payroll_lines_payment_chk CHECK (
    payment_method IN ('wps', 'cheque', 'bank_transfer')
  ),
  CONSTRAINT hr_payroll_lines_gross_chk CHECK (gross_qar >= 0),
  CONSTRAINT hr_payroll_lines_unique_staff UNIQUE (period_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_payroll_lines_period_method
  ON public.hr_payroll_lines (period_id, payment_method);

CREATE INDEX IF NOT EXISTS idx_hr_payroll_lines_staff
  ON public.hr_payroll_lines (staff_id, period_id);

DROP TRIGGER IF EXISTS trg_hr_payroll_lines_updated ON public.hr_payroll_lines;
CREATE TRIGGER trg_hr_payroll_lines_updated
  BEFORE UPDATE ON public.hr_payroll_lines
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payroll_lines TO authenticated;
GRANT ALL ON public.hr_payroll_lines TO service_role;

ALTER TABLE public.hr_payroll_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_payroll_lines read" ON public.hr_payroll_lines;
CREATE POLICY "hr_payroll_lines read" ON public.hr_payroll_lines
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_payroll_lines write" ON public.hr_payroll_lines;
CREATE POLICY "hr_payroll_lines write" ON public.hr_payroll_lines
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- ---------------------------------------------------------------------------
-- Payslips
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id uuid NOT NULL REFERENCES public.hr_payroll_lines(id) ON DELETE CASCADE,
  file_path text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_payslips_line_uq UNIQUE (line_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_payslips_generated
  ON public.hr_payslips (generated_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.hr_payslips TO authenticated;
GRANT ALL ON public.hr_payslips TO service_role;

ALTER TABLE public.hr_payslips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_payslips read" ON public.hr_payslips;
CREATE POLICY "hr_payslips read" ON public.hr_payslips
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR EXISTS (
      SELECT 1 FROM public.hr_payroll_lines l
      JOIN public.staff s ON s.id = l.staff_id
      WHERE l.id = line_id AND s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_payslips write" ON public.hr_payslips;
CREATE POLICY "hr_payslips write" ON public.hr_payslips
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- ---------------------------------------------------------------------------
-- Locks / reopen audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payroll_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.hr_payroll_periods(id) ON DELETE CASCADE,
  locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  reopen_reason text,
  reopen_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reopened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_payroll_locks_period
  ON public.hr_payroll_locks (period_id, locked_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.hr_payroll_locks TO authenticated;
GRANT ALL ON public.hr_payroll_locks TO service_role;

ALTER TABLE public.hr_payroll_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_payroll_locks read" ON public.hr_payroll_locks;
CREATE POLICY "hr_payroll_locks read" ON public.hr_payroll_locks
  FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_payroll_locks write" ON public.hr_payroll_locks;
CREATE POLICY "hr_payroll_locks write" ON public.hr_payroll_locks
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- ---------------------------------------------------------------------------
-- OT claim to payroll period link (consume once as payroll_posted)
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_ot_claims
  ADD COLUMN IF NOT EXISTS payroll_period_id uuid REFERENCES public.hr_payroll_periods(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hr_ot_claims_payroll_period
  ON public.hr_ot_claims (payroll_period_id)
  WHERE payroll_period_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Air-ticket issue → payroll period when allowance included
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_air_ticket_issues
  ADD COLUMN IF NOT EXISTS payroll_period_id uuid REFERENCES public.hr_payroll_periods(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hr_air_ticket_issues_payroll_period
  ON public.hr_air_ticket_issues (payroll_period_id)
  WHERE payroll_period_id IS NOT NULL;
