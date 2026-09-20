-- HRMS Phase 7: air-ticket entitlements + issues.
-- Additive only. Eligibility from staff.hire_date + hr_policy_settings air_ticket section.
-- Invoice/ticket docs reuse hr_employee_documents (air_ticket_receipt). Payroll posting is Phase 8.

-- ---------------------------------------------------------------------------
-- Extra air_ticket policy seeds (carry-forward / horizon) — idempotent
-- ---------------------------------------------------------------------------
INSERT INTO public.hr_policy_settings (company_id, section, key, value)
SELECT NULL, v.section, v.key, v.value::jsonb
FROM (VALUES
  ('air_ticket', 'carry_forward_enabled', 'true'),
  ('air_ticket', 'carry_forward_months', '3'),
  ('air_ticket', 'upcoming_horizon_days', '60')
) AS v(section, key, value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_policy_settings p
  WHERE p.company_id IS NULL AND p.section = v.section AND p.key = v.key
);

-- ---------------------------------------------------------------------------
-- Entitlements (one cycle row per staff)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_air_ticket_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  cycle_start date NOT NULL,
  cycle_end date NOT NULL,
  eligibility_on date NOT NULL,
  destination text,
  family_eligible boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open',
  carry_forward boolean NOT NULL DEFAULT false,
  expiry_on date,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_air_ticket_entitlements_status_chk CHECK (
    status IN ('open', 'eligible', 'issued', 'expired', 'cancelled', 'carried_forward')
  ),
  CONSTRAINT hr_air_ticket_entitlements_cycle_chk CHECK (cycle_end >= cycle_start),
  CONSTRAINT hr_air_ticket_entitlements_elig_chk CHECK (eligibility_on >= cycle_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_air_ticket_entitlements_staff_cycle_uq
  ON public.hr_air_ticket_entitlements (staff_id, cycle_start)
  WHERE status NOT IN ('cancelled');

CREATE INDEX IF NOT EXISTS idx_hr_air_ticket_entitlements_staff
  ON public.hr_air_ticket_entitlements (staff_id, eligibility_on DESC);

CREATE INDEX IF NOT EXISTS idx_hr_air_ticket_entitlements_status_elig
  ON public.hr_air_ticket_entitlements (status, eligibility_on);

CREATE INDEX IF NOT EXISTS idx_hr_air_ticket_entitlements_expiry
  ON public.hr_air_ticket_entitlements (expiry_on)
  WHERE expiry_on IS NOT NULL AND status IN ('open', 'eligible', 'carried_forward');

DROP TRIGGER IF EXISTS trg_hr_air_ticket_entitlements_updated ON public.hr_air_ticket_entitlements;
CREATE TRIGGER trg_hr_air_ticket_entitlements_updated
  BEFORE UPDATE ON public.hr_air_ticket_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.hr_air_ticket_entitlements TO authenticated;
GRANT ALL ON public.hr_air_ticket_entitlements TO service_role;

ALTER TABLE public.hr_air_ticket_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_air_ticket_entitlements read" ON public.hr_air_ticket_entitlements;
CREATE POLICY "hr_air_ticket_entitlements read" ON public.hr_air_ticket_entitlements
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_air_ticket_entitlements insert" ON public.hr_air_ticket_entitlements;
CREATE POLICY "hr_air_ticket_entitlements insert" ON public.hr_air_ticket_entitlements
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_air_ticket_entitlements update" ON public.hr_air_ticket_entitlements;
CREATE POLICY "hr_air_ticket_entitlements update" ON public.hr_air_ticket_entitlements
  FOR UPDATE TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- ---------------------------------------------------------------------------
-- Issues (ticket booking / cash allowance against an entitlement)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_air_ticket_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL REFERENCES public.hr_air_ticket_entitlements(id) ON DELETE CASCADE,
  price_qar numeric(12, 2) NOT NULL DEFAULT 0,
  cash_allowance_qar numeric(12, 2) NOT NULL DEFAULT 0,
  booking_ref text,
  travel_date_from date,
  travel_date_to date,
  invoice_doc_id uuid REFERENCES public.hr_employee_documents(id) ON DELETE SET NULL,
  payroll_payment_status text NOT NULL DEFAULT 'unpaid',
  status text NOT NULL DEFAULT 'draft',
  issued_on date,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_air_ticket_issues_price_chk CHECK (price_qar >= 0),
  CONSTRAINT hr_air_ticket_issues_cash_chk CHECK (cash_allowance_qar >= 0),
  CONSTRAINT hr_air_ticket_issues_payroll_chk CHECK (
    payroll_payment_status IN ('unpaid', 'pending', 'paid')
  ),
  CONSTRAINT hr_air_ticket_issues_status_chk CHECK (
    status IN ('draft', 'approved', 'issued', 'paid', 'cancelled', 'rejected')
  ),
  CONSTRAINT hr_air_ticket_issues_travel_chk CHECK (
    travel_date_to IS NULL
    OR travel_date_from IS NULL
    OR travel_date_to >= travel_date_from
  )
);

CREATE INDEX IF NOT EXISTS idx_hr_air_ticket_issues_entitlement
  ON public.hr_air_ticket_issues (entitlement_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_air_ticket_issues_status
  ON public.hr_air_ticket_issues (status, payroll_payment_status);

CREATE INDEX IF NOT EXISTS idx_hr_air_ticket_issues_invoice
  ON public.hr_air_ticket_issues (invoice_doc_id)
  WHERE invoice_doc_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_hr_air_ticket_issues_updated ON public.hr_air_ticket_issues;
CREATE TRIGGER trg_hr_air_ticket_issues_updated
  BEFORE UPDATE ON public.hr_air_ticket_issues
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.hr_air_ticket_issues TO authenticated;
GRANT ALL ON public.hr_air_ticket_issues TO service_role;

ALTER TABLE public.hr_air_ticket_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_air_ticket_issues read" ON public.hr_air_ticket_issues;
CREATE POLICY "hr_air_ticket_issues read" ON public.hr_air_ticket_issues
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR EXISTS (
      SELECT 1 FROM public.hr_air_ticket_entitlements e
      JOIN public.staff s ON s.id = e.staff_id
      WHERE e.id = entitlement_id AND s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_air_ticket_issues insert" ON public.hr_air_ticket_issues;
CREATE POLICY "hr_air_ticket_issues insert" ON public.hr_air_ticket_issues
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_air_ticket_issues update" ON public.hr_air_ticket_issues;
CREATE POLICY "hr_air_ticket_issues update" ON public.hr_air_ticket_issues
  FOR UPDATE TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- ---------------------------------------------------------------------------
-- Approval / action history (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_air_ticket_issue_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.hr_air_ticket_issues(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  acted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_air_ticket_issue_actions_action_chk CHECK (
    action IN ('created', 'approved', 'issued', 'paid', 'cancelled', 'rejected')
  )
);

CREATE INDEX IF NOT EXISTS idx_hr_air_ticket_issue_actions_issue
  ON public.hr_air_ticket_issue_actions (issue_id, acted_at DESC);

GRANT SELECT, INSERT ON public.hr_air_ticket_issue_actions TO authenticated;
GRANT ALL ON public.hr_air_ticket_issue_actions TO service_role;

ALTER TABLE public.hr_air_ticket_issue_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_air_ticket_issue_actions read" ON public.hr_air_ticket_issue_actions;
CREATE POLICY "hr_air_ticket_issue_actions read" ON public.hr_air_ticket_issue_actions
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR EXISTS (
      SELECT 1 FROM public.hr_air_ticket_issues i
      JOIN public.hr_air_ticket_entitlements e ON e.id = i.entitlement_id
      JOIN public.staff s ON s.id = e.staff_id
      WHERE i.id = issue_id AND s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_air_ticket_issue_actions insert" ON public.hr_air_ticket_issue_actions;
CREATE POLICY "hr_air_ticket_issue_actions insert" ON public.hr_air_ticket_issue_actions
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 55);
