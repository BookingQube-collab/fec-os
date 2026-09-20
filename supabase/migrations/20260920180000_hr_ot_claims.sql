-- HRMS Phase 4: OT claims + approval trail + OT rate policy seeds.
-- Additive only. Eligible minutes come from attendance_daily_summary / attendance-hr — no new attendance engine.

-- ---------------------------------------------------------------------------
-- OT claims
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_ot_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  work_date date NOT NULL,
  attendance_daily_id uuid REFERENCES public.attendance_daily_summary(id) ON DELETE SET NULL,
  scheduled_in timestamptz,
  scheduled_out timestamptz,
  actual_in timestamptz,
  actual_out timestamptz,
  eligible_minutes int NOT NULL DEFAULT 0,
  claimed_minutes int NOT NULL DEFAULT 0,
  approved_minutes int,
  rate_type text NOT NULL DEFAULT 'weekday',
  rate_multiplier numeric(6, 3) NOT NULL DEFAULT 1.25,
  amount_qar numeric(12, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  evidence_path text,
  notes text,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  payroll_posted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payroll_posted_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_ot_claims_rate_type_chk CHECK (
    rate_type IN ('weekday', 'weekly_off', 'public_holiday', 'eid')
  ),
  CONSTRAINT hr_ot_claims_status_chk CHECK (
    status IN (
      'draft', 'submitted', 'manager_verified', 'hr_approved',
      'payroll_posted', 'rejected', 'cancelled'
    )
  ),
  CONSTRAINT hr_ot_claims_eligible_chk CHECK (eligible_minutes >= 0),
  CONSTRAINT hr_ot_claims_claimed_chk CHECK (claimed_minutes >= 0),
  CONSTRAINT hr_ot_claims_approved_chk CHECK (
    approved_minutes IS NULL OR approved_minutes >= 0
  ),
  CONSTRAINT hr_ot_claims_amount_chk CHECK (amount_qar >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_ot_claims_active_uq
  ON public.hr_ot_claims (staff_id, work_date, rate_type)
  WHERE status NOT IN ('rejected', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_hr_ot_claims_staff_date
  ON public.hr_ot_claims (staff_id, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_hr_ot_claims_status
  ON public.hr_ot_claims (status, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_hr_ot_claims_location
  ON public.hr_ot_claims (location_id, work_date DESC)
  WHERE location_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_hr_ot_claims_updated ON public.hr_ot_claims;
CREATE TRIGGER trg_hr_ot_claims_updated
  BEFORE UPDATE ON public.hr_ot_claims
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.hr_ot_claims TO authenticated;
GRANT ALL ON public.hr_ot_claims TO service_role;

ALTER TABLE public.hr_ot_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_ot_claims read" ON public.hr_ot_claims;
CREATE POLICY "hr_ot_claims read" ON public.hr_ot_claims
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_ot_claims insert" ON public.hr_ot_claims;
CREATE POLICY "hr_ot_claims insert" ON public.hr_ot_claims
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role_level() >= 55
    OR staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_ot_claims update" ON public.hr_ot_claims;
CREATE POLICY "hr_ot_claims update" ON public.hr_ot_claims
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  )
  WITH CHECK (
    public.current_user_role_level() >= 55
    OR staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

-- ---------------------------------------------------------------------------
-- Approval trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_ot_claim_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.hr_ot_claims(id) ON DELETE CASCADE,
  step text NOT NULL,
  action text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  acted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_ot_claim_approvals_step_chk CHECK (step IN ('submit', 'manager', 'hr', 'payroll')),
  CONSTRAINT hr_ot_claim_approvals_action_chk CHECK (
    action IN ('submitted', 'verified', 'approved', 'rejected', 'cancelled', 'payroll_posted')
  )
);

CREATE INDEX IF NOT EXISTS idx_hr_ot_claim_approvals_claim
  ON public.hr_ot_claim_approvals (claim_id, acted_at DESC);

GRANT SELECT, INSERT ON public.hr_ot_claim_approvals TO authenticated;
GRANT ALL ON public.hr_ot_claim_approvals TO service_role;

ALTER TABLE public.hr_ot_claim_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_ot_claim_approvals read" ON public.hr_ot_claim_approvals;
CREATE POLICY "hr_ot_claim_approvals read" ON public.hr_ot_claim_approvals
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR EXISTS (
      SELECT 1 FROM public.hr_ot_claims c
      JOIN public.staff s ON s.id = c.staff_id
      WHERE c.id = claim_id AND s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_ot_claim_approvals insert" ON public.hr_ot_claim_approvals;
CREATE POLICY "hr_ot_claim_approvals insert" ON public.hr_ot_claim_approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role_level() >= 55
    OR EXISTS (
      SELECT 1 FROM public.hr_ot_claims c
      JOIN public.staff s ON s.id = c.staff_id
      WHERE c.id = claim_id AND s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

-- Append-only for authenticated
REVOKE UPDATE, DELETE ON public.hr_ot_claim_approvals FROM authenticated;

-- ---------------------------------------------------------------------------
-- OT policy seeds (rates + eligibility) — idempotent
-- ---------------------------------------------------------------------------
INSERT INTO public.hr_policy_settings (company_id, section, key, value)
SELECT NULL, v.section, v.key, v.value::jsonb
FROM (
  VALUES
    ('ot', 'eligible_categories', '["secondment"]'),
    ('ot', 'eligible_staff_ids', '[]'),
    ('ot', 'rate_weekday', '1.25'),
    ('ot', 'rate_weekly_off', '1.5'),
    ('ot', 'rate_public_holiday', '1.5'),
    ('ot', 'rate_eid', '2.5'),
    ('ot', 'hours_per_day', '8'),
    ('ot', 'days_per_month', '30')
) AS v(section, key, value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_policy_settings p
  WHERE p.company_id IS NULL AND p.section = v.section AND p.key = v.key
);
