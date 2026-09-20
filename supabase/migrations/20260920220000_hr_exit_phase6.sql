-- HRMS Phase 6: resignations, terminations, clearance.
-- Additive only. NEVER auto-terminate from cron/import/warnings/probation.
-- Probation flags_phase6_termination opens a draft termination for review only.
-- Final staff.terminated / serving_notice always goes through staff_status_history.

-- ---------------------------------------------------------------------------
-- Notice policy bands (editable via hr_policy_settings section=notice)
-- ---------------------------------------------------------------------------
INSERT INTO public.hr_policy_settings (company_id, section, key, value)
SELECT NULL, v.section, v.key, v.value::jsonb
FROM (
  VALUES
    ('notice', 'higher_mgmt_lte_2y_days', '30'),
    ('notice', 'higher_mgmt_gt_2_lte_4y_days', '60'),
    ('notice', 'higher_mgmt_gt_4y_days', '90'),
    ('notice', 'secondment_contractual', 'false'),
    ('notice', 'secondment_days', '7')
) AS v(section, key, value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_policy_settings p
  WHERE p.company_id IS NULL AND p.section = v.section AND p.key = v.key
);

-- Upsert secondment_days to 7 (≥1 week) when still at legacy 14
UPDATE public.hr_policy_settings
SET value = '7'::jsonb, updated_at = now()
WHERE company_id IS NULL
  AND section = 'notice'
  AND key = 'secondment_days'
  AND value::text IN ('14', '14.0');

-- ---------------------------------------------------------------------------
-- Resignations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_resignations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  submitted_on date NOT NULL,
  letter_document_id uuid REFERENCES public.hr_employee_documents(id) ON DELETE RESTRICT,
  reason text NOT NULL DEFAULT '',
  employment_category text,
  length_of_service_days int,
  suggested_notice_days int NOT NULL DEFAULT 30,
  required_notice_days int NOT NULL DEFAULT 30,
  notice_override boolean NOT NULL DEFAULT false,
  notice_override_reason text,
  notice_override_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notice_override_approved_at timestamptz,
  proposed_lwd date,
  approved_lwd date,
  notice_waiver boolean NOT NULL DEFAULT false,
  notice_recovery boolean NOT NULL DEFAULT false,
  handover_notes text,
  asset_clearance boolean NOT NULL DEFAULT false,
  dept_clearance boolean NOT NULL DEFAULT false,
  finance_clearance boolean NOT NULL DEFAULT false,
  final_settlement_stub jsonb NOT NULL DEFAULT '{}'::jsonb,
  air_ticket_eligible boolean NOT NULL DEFAULT false,
  releasing_date date,
  status text NOT NULL DEFAULT 'draft',
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approval_note text,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_resignations_status_chk CHECK (
    status IN (
      'draft', 'submitted', 'pending_override_approval',
      'approved', 'serving_notice', 'completed', 'cancelled', 'withdrawn'
    )
  ),
  CONSTRAINT hr_resignations_override_chk CHECK (
    notice_override = false
    OR (notice_override_reason IS NOT NULL AND length(trim(notice_override_reason)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_hr_resignations_staff
  ON public.hr_resignations (staff_id, submitted_on DESC);

CREATE INDEX IF NOT EXISTS idx_hr_resignations_status
  ON public.hr_resignations (status, submitted_on DESC);

DROP TRIGGER IF EXISTS trg_hr_resignations_updated ON public.hr_resignations;
CREATE TRIGGER trg_hr_resignations_updated
  BEFORE UPDATE ON public.hr_resignations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.hr_resignations TO authenticated;
GRANT ALL ON public.hr_resignations TO service_role;

ALTER TABLE public.hr_resignations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_resignations read" ON public.hr_resignations;
CREATE POLICY "hr_resignations read" ON public.hr_resignations
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_resignations write" ON public.hr_resignations;
CREATE POLICY "hr_resignations write" ON public.hr_resignations
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- ---------------------------------------------------------------------------
-- Terminations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_terminations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  termination_type text NOT NULL DEFAULT 'with_notice',
  employment_category text,
  reason text NOT NULL DEFAULT '',
  effective_on date NOT NULL,
  last_working_date date NOT NULL,
  notice_treatment text NOT NULL DEFAULT 'with_notice',
  supporting_document_id uuid REFERENCES public.hr_employee_documents(id) ON DELETE RESTRICT,
  leave_treatment text,
  loan_treatment text,
  air_ticket_eligible boolean NOT NULL DEFAULT false,
  asset_clearance boolean NOT NULL DEFAULT false,
  dept_clearance boolean NOT NULL DEFAULT false,
  finance_clearance boolean NOT NULL DEFAULT false,
  final_settlement_stub jsonb NOT NULL DEFAULT '{}'::jsonb,
  releasing_date date,
  status text NOT NULL DEFAULT 'draft',
  -- Dual approval: HR Manager + GM/CEO (distinct users)
  hr_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  hr_approved_at timestamptz,
  hr_approval_note text,
  exec_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  exec_approved_at timestamptz,
  exec_approval_note text,
  source_probation_review_id uuid REFERENCES public.hr_probation_reviews(id) ON DELETE SET NULL,
  initiated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  applied_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_terminations_type_chk CHECK (
    termination_type IN (
      'immediate', 'defined_lwd', 'with_notice', 'payment_in_lieu', 'selected_lwd'
    )
  ),
  CONSTRAINT hr_terminations_notice_chk CHECK (
    notice_treatment IN (
      'immediate', 'with_notice', 'payment_in_lieu', 'waived', 'none'
    )
  ),
  CONSTRAINT hr_terminations_status_chk CHECK (
    status IN (
      'draft', 'pending_hr_approval', 'pending_exec_approval',
      'approved', 'applied', 'cancelled', 'withdrawn'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_hr_terminations_staff
  ON public.hr_terminations (staff_id, effective_on DESC);

CREATE INDEX IF NOT EXISTS idx_hr_terminations_status
  ON public.hr_terminations (status, effective_on DESC);

CREATE INDEX IF NOT EXISTS idx_hr_terminations_probation
  ON public.hr_terminations (source_probation_review_id)
  WHERE source_probation_review_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_hr_terminations_updated ON public.hr_terminations;
CREATE TRIGGER trg_hr_terminations_updated
  BEFORE UPDATE ON public.hr_terminations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.hr_terminations TO authenticated;
GRANT ALL ON public.hr_terminations TO service_role;

ALTER TABLE public.hr_terminations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_terminations read" ON public.hr_terminations;
CREATE POLICY "hr_terminations read" ON public.hr_terminations
  FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_terminations write" ON public.hr_terminations;
CREATE POLICY "hr_terminations write" ON public.hr_terminations
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- ---------------------------------------------------------------------------
-- Clearance checklist items (linked to resignation OR termination)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_clearance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  resignation_id uuid REFERENCES public.hr_resignations(id) ON DELETE CASCADE,
  termination_id uuid REFERENCES public.hr_terminations(id) ON DELETE CASCADE,
  item_kind text NOT NULL DEFAULT 'department',
  label text NOT NULL,
  department text,
  completed boolean NOT NULL DEFAULT false,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_clearance_items_kind_chk CHECK (
    item_kind IN ('department', 'asset', 'finance', 'it', 'other')
  ),
  CONSTRAINT hr_clearance_items_parent_chk CHECK (
    (resignation_id IS NOT NULL AND termination_id IS NULL)
    OR (resignation_id IS NULL AND termination_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_hr_clearance_items_staff
  ON public.hr_clearance_items (staff_id, completed);

CREATE INDEX IF NOT EXISTS idx_hr_clearance_resignation
  ON public.hr_clearance_items (resignation_id)
  WHERE resignation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hr_clearance_termination
  ON public.hr_clearance_items (termination_id)
  WHERE termination_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_hr_clearance_items_updated ON public.hr_clearance_items;
CREATE TRIGGER trg_hr_clearance_items_updated
  BEFORE UPDATE ON public.hr_clearance_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.hr_clearance_items TO authenticated;
GRANT ALL ON public.hr_clearance_items TO service_role;

ALTER TABLE public.hr_clearance_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_clearance_items read" ON public.hr_clearance_items;
CREATE POLICY "hr_clearance_items read" ON public.hr_clearance_items
  FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_clearance_items write" ON public.hr_clearance_items;
CREATE POLICY "hr_clearance_items write" ON public.hr_clearance_items
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);
