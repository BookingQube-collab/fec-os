-- Payroll Excel / historical import upgrade (additive).
-- Preserves existing periods/lines. Adds snapshots, import recon, adjustments, cash.

-- ---------------------------------------------------------------------------
-- Policy seeds
-- ---------------------------------------------------------------------------
INSERT INTO public.hr_policy_settings (company_id, section, key, value)
SELECT NULL, v.section, v.key, v.value::jsonb
FROM (VALUES
  ('payroll', 'ot_regular_multiplier', '1.25'),
  ('payroll', 'ot_public_holiday_multiplier', '1.5'),
  ('payroll', 'ot_rest_day_multiplier', '1.5'),
  ('payroll', 'historical_import_locks_amounts', 'true'),
  ('payroll', 'statutory_rules', '[]')
) AS v(section, key, value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_policy_settings p
  WHERE p.company_id IS NULL AND p.section = v.section AND p.key = v.key
);

-- ---------------------------------------------------------------------------
-- Period: display name + source + workflow enrichment
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_payroll_periods
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_payroll_periods_source_chk'
  ) THEN
    ALTER TABLE public.hr_payroll_periods
      ADD CONSTRAINT hr_payroll_periods_source_chk
      CHECK (source IN ('generated', 'excel_import', 'mixed'));
  END IF;
END $$;

-- Extend status check: insert attendance_validation between draft and hr_review
ALTER TABLE public.hr_payroll_periods DROP CONSTRAINT IF EXISTS hr_payroll_periods_status_chk;
ALTER TABLE public.hr_payroll_periods
  ADD CONSTRAINT hr_payroll_periods_status_chk CHECK (
    status IN (
      'draft',
      'attendance_validation',
      'hr_review',
      'finance_review',
      'gm_approved',
      'processed',
      'paid',
      'locked'
    )
  );

-- ---------------------------------------------------------------------------
-- Lines: cash payment + snapshots + import reconciliation columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_payroll_lines DROP CONSTRAINT IF EXISTS hr_payroll_lines_payment_chk;
ALTER TABLE public.hr_payroll_lines
  ADD CONSTRAINT hr_payroll_lines_payment_chk CHECK (
    payment_method IN ('wps', 'cheque', 'bank_transfer', 'cash')
  );

ALTER TABLE public.hr_payroll_lines
  ADD COLUMN IF NOT EXISTS employment_category text,
  ADD COLUMN IF NOT EXISTS position_snapshot text,
  ADD COLUMN IF NOT EXISTS workplace_snapshot text,
  ADD COLUMN IF NOT EXISTS working_days numeric(8, 2),
  ADD COLUMN IF NOT EXISTS working_hours numeric(8, 2),
  ADD COLUMN IF NOT EXISTS snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS imported_amounts jsonb,
  ADD COLUMN IF NOT EXISTS imported_net_qar numeric(12, 2),
  ADD COLUMN IF NOT EXISTS system_net_qar numeric(12, 2),
  ADD COLUMN IF NOT EXISTS variance_import_qar numeric(12, 2),
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS line_source text NOT NULL DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS override_meta jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_payroll_lines_review_chk'
  ) THEN
    ALTER TABLE public.hr_payroll_lines
      ADD CONSTRAINT hr_payroll_lines_review_chk
      CHECK (review_status IN (
        'ok', 'matched', 'variance', 'unmatched', 'reviewed', 'excluded'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_payroll_lines_source_chk'
  ) THEN
    ALTER TABLE public.hr_payroll_lines
      ADD CONSTRAINT hr_payroll_lines_source_chk
      CHECK (line_source IN ('generated', 'excel_import', 'manual', 'project_staff'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hr_payroll_lines_review
  ON public.hr_payroll_lines (period_id, review_status);

-- ---------------------------------------------------------------------------
-- Import batches (preview → commit audit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payroll_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid REFERENCES public.hr_payroll_periods(id) ON DELETE SET NULL,
  month text NOT NULL,
  file_name text,
  sheet_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  reconciliation jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'preview',
  committed_at timestamptz,
  committed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_payroll_import_batches_month_chk CHECK (month ~ '^\d{4}-\d{2}$'),
  CONSTRAINT hr_payroll_import_batches_status_chk CHECK (
    status IN ('preview', 'committed', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_hr_payroll_import_batches_month
  ON public.hr_payroll_import_batches (month, created_at DESC);

ALTER TABLE public.hr_payroll_periods
  DROP CONSTRAINT IF EXISTS hr_payroll_periods_import_batch_fkey;
ALTER TABLE public.hr_payroll_periods
  ADD CONSTRAINT hr_payroll_periods_import_batch_fkey
  FOREIGN KEY (import_batch_id) REFERENCES public.hr_payroll_import_batches(id) ON DELETE SET NULL;

GRANT SELECT, INSERT, UPDATE ON public.hr_payroll_import_batches TO authenticated;
GRANT ALL ON public.hr_payroll_import_batches TO service_role;

ALTER TABLE public.hr_payroll_import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_payroll_import_batches read" ON public.hr_payroll_import_batches;
CREATE POLICY "hr_payroll_import_batches read" ON public.hr_payroll_import_batches
  FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_payroll_import_batches write" ON public.hr_payroll_import_batches;
CREATE POLICY "hr_payroll_import_batches write" ON public.hr_payroll_import_batches
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- ---------------------------------------------------------------------------
-- Adjustments (auditable add/deduct rows)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payroll_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.hr_payroll_periods(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  line_id uuid REFERENCES public.hr_payroll_lines(id) ON DELETE SET NULL,
  adj_type text NOT NULL,
  amount_qar numeric(12, 2) NOT NULL,
  reason text,
  document_ref text,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_payroll_adjustments_type_chk CHECK (
    adj_type IN (
      'bonus', 'commission', 'extra', 'salary_adj', 'advance', 'loan_recovery',
      'unpaid_leave', 'absence', 'late_undertime', 'previous_month',
      'ph_adj', 'other_add', 'other_deduct'
    )
  ),
  CONSTRAINT hr_payroll_adjustments_status_chk CHECK (
    status IN ('pending', 'approved', 'rejected', 'posted')
  )
);

CREATE INDEX IF NOT EXISTS idx_hr_payroll_adjustments_period
  ON public.hr_payroll_adjustments (period_id, status);

DROP TRIGGER IF EXISTS trg_hr_payroll_adjustments_updated ON public.hr_payroll_adjustments;
CREATE TRIGGER trg_hr_payroll_adjustments_updated
  BEFORE UPDATE ON public.hr_payroll_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.hr_payroll_adjustments TO authenticated;
GRANT ALL ON public.hr_payroll_adjustments TO service_role;

ALTER TABLE public.hr_payroll_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_payroll_adjustments read" ON public.hr_payroll_adjustments;
CREATE POLICY "hr_payroll_adjustments read" ON public.hr_payroll_adjustments
  FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_payroll_adjustments write" ON public.hr_payroll_adjustments;
CREATE POLICY "hr_payroll_adjustments write" ON public.hr_payroll_adjustments
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- ---------------------------------------------------------------------------
-- Line amount overrides (keep original + override audit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payroll_line_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id uuid NOT NULL REFERENCES public.hr_payroll_lines(id) ON DELETE CASCADE,
  field_code text NOT NULL,
  original_amount_qar numeric(12, 2) NOT NULL,
  override_amount_qar numeric(12, 2) NOT NULL,
  reason text NOT NULL,
  overridden_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  overridden_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_payroll_line_overrides_line
  ON public.hr_payroll_line_overrides (line_id, overridden_at DESC);

GRANT SELECT, INSERT ON public.hr_payroll_line_overrides TO authenticated;
GRANT ALL ON public.hr_payroll_line_overrides TO service_role;

ALTER TABLE public.hr_payroll_line_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_payroll_line_overrides read" ON public.hr_payroll_line_overrides;
CREATE POLICY "hr_payroll_line_overrides read" ON public.hr_payroll_line_overrides
  FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_payroll_line_overrides write" ON public.hr_payroll_line_overrides;
CREATE POLICY "hr_payroll_line_overrides write" ON public.hr_payroll_line_overrides
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 55);
