-- HRMS Phase 3: leave v2 (types, balances, multi-step approvals, comp-off) + employee timeline.
-- Additive only. Reuses hr_leave_requests / attendance_leave_records sync on final HR approve.

-- ---------------------------------------------------------------------------
-- Leave types catalog (policy-driven defaults, codes used on requests/balances)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_leave_types (
  code text PRIMARY KEY,
  name_en text NOT NULL,
  name_ar text,
  paid boolean NOT NULL DEFAULT true,
  requires_doc boolean NOT NULL DEFAULT false,
  default_days numeric(5, 1),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_hr_leave_types_updated ON public.hr_leave_types;
CREATE TRIGGER trg_hr_leave_types_updated
  BEFORE UPDATE ON public.hr_leave_types
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.hr_leave_types (code, name_en, name_ar, paid, requires_doc, default_days, config, sort_order)
VALUES
  ('annual', 'Annual', 'سنوية', true, false, 21, '{"accrual":"from_hire_date"}'::jsonb, 10),
  ('sick', 'Sick', 'مرضية', true, true, 15, '{}'::jsonb, 20),
  ('emergency', 'Emergency', 'طارئة', false, false, 7, '{"treatment":["deduct_annual","unpaid","partial"]}'::jsonb, 30),
  ('unpaid', 'Unpaid', 'بدون راتب', false, false, NULL, '{}'::jsonb, 40),
  ('maternity', 'Maternity', 'أمومة', true, true, 50, '{"from":"delivery","attach_annual":true}'::jsonb, 50),
  ('hajj', 'Hajj', 'حج', true, true, 14, '{}'::jsonb, 60),
  ('compassionate', 'Compassionate', 'وفاة', true, true, 5, '{"inside_qatar":5,"outside_qatar":11}'::jsonb, 70),
  ('comp_off', 'Comp Off', 'تعويض', true, false, NULL, '{"requires_balance":true}'::jsonb, 80),
  ('other', 'Other', 'أخرى', false, false, NULL, '{}'::jsonb, 90)
ON CONFLICT (code) DO NOTHING;

GRANT SELECT ON public.hr_leave_types TO authenticated;
GRANT ALL ON public.hr_leave_types TO service_role;

ALTER TABLE public.hr_leave_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_leave_types read" ON public.hr_leave_types;
CREATE POLICY "hr_leave_types read" ON public.hr_leave_types
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "hr_leave_types write" ON public.hr_leave_types;
CREATE POLICY "hr_leave_types write" ON public.hr_leave_types
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

-- ---------------------------------------------------------------------------
-- Expand leave_type CHECKs
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_leave_requests
  DROP CONSTRAINT IF EXISTS hr_leave_requests_type_chk;
ALTER TABLE public.hr_leave_requests
  ADD CONSTRAINT hr_leave_requests_type_chk CHECK (leave_type IN (
    'annual', 'sick', 'unpaid', 'emergency', 'maternity', 'hajj',
    'compassionate', 'comp_off', 'other'
  ));

ALTER TABLE public.hr_leave_balances
  DROP CONSTRAINT IF EXISTS hr_leave_balances_type_chk;
ALTER TABLE public.hr_leave_balances
  ADD CONSTRAINT hr_leave_balances_type_chk CHECK (leave_type IN (
    'annual', 'sick', 'unpaid', 'emergency', 'maternity', 'hajj',
    'compassionate', 'comp_off', 'other'
  ));

-- ---------------------------------------------------------------------------
-- Leave request extras + balance carry/pending/expired
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_leave_requests
  ADD COLUMN IF NOT EXISTS emergency_treatment text,
  ADD COLUMN IF NOT EXISTS maternity_delivery_date date,
  ADD COLUMN IF NOT EXISTS compassionate_scope text,
  ADD COLUMN IF NOT EXISTS attach_annual_before numeric(5, 1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attach_annual_after numeric(5, 1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payroll_impact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_step_role text,
  ADD COLUMN IF NOT EXISTS comp_off_balance_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_leave_requests_emergency_treatment_chk'
  ) THEN
    ALTER TABLE public.hr_leave_requests
      ADD CONSTRAINT hr_leave_requests_emergency_treatment_chk
      CHECK (
        emergency_treatment IS NULL
        OR emergency_treatment IN ('deduct_annual', 'unpaid', 'partial')
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_leave_requests_compassionate_scope_chk'
  ) THEN
    ALTER TABLE public.hr_leave_requests
      ADD CONSTRAINT hr_leave_requests_compassionate_scope_chk
      CHECK (
        compassionate_scope IS NULL
        OR compassionate_scope IN ('inside_qatar', 'outside_qatar')
      );
  END IF;
END $$;

ALTER TABLE public.hr_leave_balances
  ADD COLUMN IF NOT EXISTS carried_forward numeric(5, 1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expired_days numeric(5, 1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_days numeric(5, 1) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_leave_balances_carried_chk'
  ) THEN
    ALTER TABLE public.hr_leave_balances
      ADD CONSTRAINT hr_leave_balances_carried_chk CHECK (carried_forward >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_leave_balances_expired_chk'
  ) THEN
    ALTER TABLE public.hr_leave_balances
      ADD CONSTRAINT hr_leave_balances_expired_chk CHECK (expired_days >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_leave_balances_pending_chk'
  ) THEN
    ALTER TABLE public.hr_leave_balances
      ADD CONSTRAINT hr_leave_balances_pending_chk CHECK (pending_days >= 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Multi-step approvals (mirror pr_approval_steps)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_leave_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_id uuid NOT NULL REFERENCES public.hr_leave_requests(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  step_role text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  acted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acted_at timestamptz,
  comments text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_leave_approvals_role_chk CHECK (step_role IN ('manager', 'ops', 'hr')),
  CONSTRAINT hr_leave_approvals_status_chk CHECK (status IN ('pending', 'approved', 'skipped', 'rejected')),
  UNIQUE (leave_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_hr_leave_approvals_leave
  ON public.hr_leave_approvals (leave_id, step_order);

CREATE INDEX IF NOT EXISTS idx_hr_leave_approvals_pending
  ON public.hr_leave_approvals (step_role, status)
  WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE ON public.hr_leave_approvals TO authenticated;
GRANT ALL ON public.hr_leave_approvals TO service_role;

ALTER TABLE public.hr_leave_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_leave_approvals read" ON public.hr_leave_approvals;
CREATE POLICY "hr_leave_approvals read" ON public.hr_leave_approvals
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR EXISTS (
      SELECT 1 FROM public.hr_leave_requests r
      JOIN public.staff s ON s.id = r.staff_id
      WHERE r.id = leave_id AND s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_leave_approvals write" ON public.hr_leave_approvals;
CREATE POLICY "hr_leave_approvals write" ON public.hr_leave_approvals
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- ---------------------------------------------------------------------------
-- Comp-off balances
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_comp_off_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  earned_on date NOT NULL,
  reason text,
  days numeric(5, 2) NOT NULL DEFAULT 1,
  hours numeric(6, 2),
  expires_on date,
  used_days numeric(5, 2) NOT NULL DEFAULT 0,
  remaining_days numeric(5, 2) GENERATED ALWAYS AS (GREATEST(days - used_days, 0)) STORED,
  hr_exception boolean NOT NULL DEFAULT false,
  leave_request_id uuid REFERENCES public.hr_leave_requests(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_comp_off_days_chk CHECK (days > 0),
  CONSTRAINT hr_comp_off_used_chk CHECK (used_days >= 0 AND used_days <= days)
);

CREATE INDEX IF NOT EXISTS idx_hr_comp_off_staff
  ON public.hr_comp_off_balances (staff_id, earned_on DESC);

DROP TRIGGER IF EXISTS trg_hr_comp_off_updated ON public.hr_comp_off_balances;
CREATE TRIGGER trg_hr_comp_off_updated
  BEFORE UPDATE ON public.hr_comp_off_balances
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- FK from leave requests after comp_off table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_leave_requests_comp_off_fk'
  ) THEN
    ALTER TABLE public.hr_leave_requests
      ADD CONSTRAINT hr_leave_requests_comp_off_fk
      FOREIGN KEY (comp_off_balance_id) REFERENCES public.hr_comp_off_balances(id) ON DELETE SET NULL;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.hr_comp_off_balances TO authenticated;
GRANT ALL ON public.hr_comp_off_balances TO service_role;

ALTER TABLE public.hr_comp_off_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_comp_off read" ON public.hr_comp_off_balances;
CREATE POLICY "hr_comp_off read" ON public.hr_comp_off_balances
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_comp_off write" ON public.hr_comp_off_balances;
CREATE POLICY "hr_comp_off write" ON public.hr_comp_off_balances
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- ---------------------------------------------------------------------------
-- Employee timeline events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_employee_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  effective_on date NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  document_id uuid,
  source_table text,
  source_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_employee_events_type_chk CHECK (btrim(event_type) <> '')
);

CREATE INDEX IF NOT EXISTS idx_hr_employee_events_staff
  ON public.hr_employee_events (staff_id, effective_on DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_employee_events_type
  ON public.hr_employee_events (staff_id, event_type);

GRANT SELECT, INSERT ON public.hr_employee_events TO authenticated;
GRANT ALL ON public.hr_employee_events TO service_role;
REVOKE UPDATE, DELETE ON public.hr_employee_events FROM authenticated;

ALTER TABLE public.hr_employee_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_employee_events read" ON public.hr_employee_events;
CREATE POLICY "hr_employee_events read" ON public.hr_employee_events
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_employee_events insert" ON public.hr_employee_events;
CREATE POLICY "hr_employee_events insert" ON public.hr_employee_events
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 55);

-- ---------------------------------------------------------------------------
-- Extra leave policy seeds (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO public.hr_policy_settings (company_id, section, key, value)
SELECT NULL, v.section, v.key, v.value::jsonb
FROM (
  VALUES
    ('leave', 'hajj_days', '14'),
    ('leave', 'emergency_min_days', '1'),
    ('leave', 'emergency_max_days', '7'),
    ('leave', 'carry_forward_max_days', '5'),
    ('leave', 'carry_forward_expiry_months', '3'),
    ('leave', 'comp_off_expiry_days', '90'),
    ('leave', 'maternity_attach_annual', 'true')
) AS v(section, key, value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_policy_settings p
  WHERE p.company_id IS NULL AND p.section = v.section AND p.key = v.key
);
