-- Joining and exit journeys extend the existing checklist tables.
-- Compensation stays on staff_salary_history / staff_compensation.

ALTER TABLE public.hr_checklist_templates
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.hr_checklist_template_items
  ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS owner_role text NOT NULL DEFAULT 'hr',
  ADD COLUMN IF NOT EXISTS due_offset_days int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidence_hint text;

ALTER TABLE public.hr_checklist_template_items
  DROP CONSTRAINT IF EXISTS hr_checklist_template_items_section_chk;
ALTER TABLE public.hr_checklist_template_items
  ADD CONSTRAINT hr_checklist_template_items_section_chk
  CHECK (section IN (
    'preboarding', 'day1', 'first30', 'handover', 'access', 'equipment',
    'finance', 'leave', 'end_of_service', 'interview', 'documents', 'payroll', 'general'
  ));

ALTER TABLE public.hr_checklist_template_items
  DROP CONSTRAINT IF EXISTS hr_checklist_template_items_role_chk;
ALTER TABLE public.hr_checklist_template_items
  ADD CONSTRAINT hr_checklist_template_items_role_chk
  CHECK (owner_role IN ('hr', 'manager', 'it', 'finance', 'employee'));

ALTER TABLE public.hr_staff_checklists
  ADD COLUMN IF NOT EXISTS reference_code text,
  ADD COLUMN IF NOT EXISTS anchor_date date,
  ADD COLUMN IF NOT EXISTS owner_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS role_title text,
  ADD COLUMN IF NOT EXISTS department_name text,
  ADD COLUMN IF NOT EXISTS exit_cause text,
  ADD COLUMN IF NOT EXISTS notice_days int,
  ADD COLUMN IF NOT EXISTS reason_note text,
  ADD COLUMN IF NOT EXISTS template_title text,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS payroll_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payroll_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS eligibility_checked_at timestamptz;

ALTER TABLE public.hr_staff_checklists
  DROP CONSTRAINT IF EXISTS hr_staff_checklists_exit_cause_chk;
ALTER TABLE public.hr_staff_checklists
  ADD CONSTRAINT hr_staff_checklists_exit_cause_chk
  CHECK (exit_cause IS NULL OR exit_cause IN ('resignation', 'end_of_contract', 'termination'));

ALTER TABLE public.hr_staff_checklists
  DROP CONSTRAINT IF EXISTS hr_staff_checklists_notice_chk;
ALTER TABLE public.hr_staff_checklists
  ADD CONSTRAINT hr_staff_checklists_notice_chk
  CHECK (notice_days IS NULL OR notice_days BETWEEN 0 AND 365);

CREATE UNIQUE INDEX IF NOT EXISTS hr_staff_checklists_reference_uidx
  ON public.hr_staff_checklists (reference_code)
  WHERE reference_code IS NOT NULL;

ALTER TABLE public.hr_staff_checklist_items
  ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS owner_role text NOT NULL DEFAULT 'hr',
  ADD COLUMN IF NOT EXISTS owner_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_on date,
  ADD COLUMN IF NOT EXISTS evidence_note text,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS reviewer_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_reason text;

ALTER TABLE public.hr_staff_checklist_items
  DROP CONSTRAINT IF EXISTS hr_staff_checklist_items_section_chk;
ALTER TABLE public.hr_staff_checklist_items
  ADD CONSTRAINT hr_staff_checklist_items_section_chk
  CHECK (section IN (
    'preboarding', 'day1', 'first30', 'handover', 'access', 'equipment',
    'finance', 'leave', 'end_of_service', 'interview', 'documents', 'payroll', 'general'
  ));

ALTER TABLE public.hr_staff_checklist_items
  DROP CONSTRAINT IF EXISTS hr_staff_checklist_items_role_chk;
ALTER TABLE public.hr_staff_checklist_items
  ADD CONSTRAINT hr_staff_checklist_items_role_chk
  CHECK (owner_role IN ('hr', 'manager', 'it', 'finance', 'employee'));

ALTER TABLE public.hr_staff_checklist_items
  DROP CONSTRAINT IF EXISTS hr_staff_checklist_items_review_chk;
ALTER TABLE public.hr_staff_checklist_items
  ADD CONSTRAINT hr_staff_checklist_items_review_chk
  CHECK (review_status IN ('not_required', 'awaiting', 'cleared'));

CREATE INDEX IF NOT EXISTS hr_staff_checklist_items_owner_due_idx
  ON public.hr_staff_checklist_items (owner_staff_id, due_on);

CREATE SEQUENCE IF NOT EXISTS public.hr_journey_ref_seq START WITH 100001;

CREATE OR REPLACE FUNCTION public.hr_staff_checklists_assign_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reference_code IS NULL OR btrim(NEW.reference_code) = '' THEN
    NEW.reference_code :=
      CASE WHEN NEW.kind = 'offboarding' THEN 'EXT-' ELSE 'ONB-' END
      || nextval('public.hr_journey_ref_seq')::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_staff_checklists_assign_ref ON public.hr_staff_checklists;
CREATE TRIGGER trg_hr_staff_checklists_assign_ref
  BEFORE INSERT ON public.hr_staff_checklists
  FOR EACH ROW EXECUTE FUNCTION public.hr_staff_checklists_assign_ref();

UPDATE public.hr_staff_checklists
SET reference_code = CASE WHEN kind = 'offboarding' THEN 'EXT-' ELSE 'ONB-' END || nextval('public.hr_journey_ref_seq')::text
WHERE reference_code IS NULL;

CREATE TABLE IF NOT EXISTS public.hr_checklist_template_acks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.hr_checklist_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.hr_checklist_template_training (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.hr_checklist_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  due_offset_days int NOT NULL DEFAULT 30,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.hr_journey_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.hr_staff_checklists(id) ON DELETE CASCADE,
  title text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending',
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sort_order int NOT NULL DEFAULT 0,
  CONSTRAINT hr_journey_acknowledgments_status_chk CHECK (status IN ('pending', 'acknowledged'))
);

CREATE TABLE IF NOT EXISTS public.hr_journey_training (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.hr_staff_checklists(id) ON DELETE CASCADE,
  title text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'assigned',
  due_on date,
  course_id uuid,
  assignment_id uuid,
  reason text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_journey_training_status_chk CHECK (status IN ('assigned', 'completed', 'waived'))
);

CREATE TABLE IF NOT EXISTS public.hr_journey_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.hr_staff_checklists(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_journey_events_checklist_idx
  ON public.hr_journey_events (checklist_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.hr_approval_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  title text NOT NULL,
  approver_role text NOT NULL DEFAULT 'hr',
  required boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_approval_rules_kind_chk CHECK (kind IN ('onboarding', 'offboarding')),
  CONSTRAINT hr_approval_rules_role_chk CHECK (approver_role IN ('hr', 'manager', 'it', 'finance', 'employee'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.hr_checklist_template_acks,
  public.hr_checklist_template_training,
  public.hr_journey_acknowledgments,
  public.hr_journey_training,
  public.hr_journey_events,
  public.hr_approval_rules
TO authenticated;

GRANT ALL ON
  public.hr_checklist_template_acks,
  public.hr_checklist_template_training,
  public.hr_journey_acknowledgments,
  public.hr_journey_training,
  public.hr_journey_events,
  public.hr_approval_rules
TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.hr_journey_ref_seq TO authenticated, service_role;

ALTER TABLE public.hr_checklist_template_acks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_checklist_template_training ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_journey_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_journey_training ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_journey_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_approval_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_checklist_template_acks read" ON public.hr_checklist_template_acks;
CREATE POLICY "hr_checklist_template_acks read" ON public.hr_checklist_template_acks
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "hr_checklist_template_acks write" ON public.hr_checklist_template_acks;
CREATE POLICY "hr_checklist_template_acks write" ON public.hr_checklist_template_acks
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_checklist_template_training read" ON public.hr_checklist_template_training;
CREATE POLICY "hr_checklist_template_training read" ON public.hr_checklist_template_training
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "hr_checklist_template_training write" ON public.hr_checklist_template_training;
CREATE POLICY "hr_checklist_template_training write" ON public.hr_checklist_template_training
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_journey_acknowledgments read" ON public.hr_journey_acknowledgments;
CREATE POLICY "hr_journey_acknowledgments read" ON public.hr_journey_acknowledgments
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR checklist_id IN (
      SELECT c.id FROM public.hr_staff_checklists c
      JOIN public.staff s ON s.id = c.staff_id
      WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );
DROP POLICY IF EXISTS "hr_journey_acknowledgments write" ON public.hr_journey_acknowledgments;
CREATE POLICY "hr_journey_acknowledgments write" ON public.hr_journey_acknowledgments
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_journey_training read" ON public.hr_journey_training;
CREATE POLICY "hr_journey_training read" ON public.hr_journey_training
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR checklist_id IN (
      SELECT c.id FROM public.hr_staff_checklists c
      JOIN public.staff s ON s.id = c.staff_id
      WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );
DROP POLICY IF EXISTS "hr_journey_training write" ON public.hr_journey_training;
CREATE POLICY "hr_journey_training write" ON public.hr_journey_training
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_journey_events read" ON public.hr_journey_events;
CREATE POLICY "hr_journey_events read" ON public.hr_journey_events
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR checklist_id IN (
      SELECT c.id FROM public.hr_staff_checklists c
      JOIN public.staff s ON s.id = c.staff_id
      WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );
DROP POLICY IF EXISTS "hr_journey_events write" ON public.hr_journey_events;
CREATE POLICY "hr_journey_events write" ON public.hr_journey_events
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_approval_rules read" ON public.hr_approval_rules;
CREATE POLICY "hr_approval_rules read" ON public.hr_approval_rules
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "hr_approval_rules write" ON public.hr_approval_rules;
CREATE POLICY "hr_approval_rules write" ON public.hr_approval_rules
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

INSERT INTO public.hr_checklist_templates (kind, title, description, sort_order)
SELECT v.kind, v.title, v.description, v.sort_order
FROM (
  VALUES
    (
      'onboarding'::text,
      'Joining journey'::text,
      'Pre-boarding, day 1, and the first 30 days. Required work blocks closure.'::text,
      10
    ),
    (
      'offboarding'::text,
      'Exit clearance'::text,
      'Manager handover through final pay. Gratuity stays on End of Service.'::text,
      10
    )
) AS v(kind, title, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_checklist_templates t
  WHERE t.kind = v.kind AND t.title = v.title
);

INSERT INTO public.hr_checklist_template_items
  (template_id, title, sort_order, section, required, owner_role, due_offset_days, needs_review, evidence_hint)
SELECT t.id, i.title, i.sort_order, i.section, i.required, i.owner_role, i.due_offset_days, i.needs_review, i.evidence_hint
FROM public.hr_checklist_templates t
JOIN (
  VALUES
    ('onboarding', 'Signed contract on file', 1, 'preboarding', true, 'hr', -7, false, 'Contract reference or file note'),
    ('onboarding', 'QID or passport copies checked', 2, 'preboarding', true, 'hr', -5, false, 'Document numbers verified, not copied here'),
    ('onboarding', 'Salary package recorded in compensation history', 3, 'preboarding', true, 'hr', -2, false, 'Version recorded on salary history'),
    ('onboarding', 'System access created', 4, 'day1', true, 'it', 0, false, 'Account or ticket reference'),
    ('onboarding', 'Equipment issued', 5, 'day1', true, 'it', 0, false, 'Asset tag'),
    ('onboarding', 'Manager day-1 briefing', 6, 'day1', true, 'manager', 0, false, 'What was covered'),
    ('onboarding', 'Site and shift assigned', 7, 'day1', true, 'hr', 0, false, 'Site and shift'),
    ('onboarding', 'Required induction completed', 8, 'first30', true, 'hr', 30, false, 'Enrollment or completion note'),
    ('onboarding', 'Independent first-month review', 9, 'first30', true, 'manager', 30, true, 'Reviewer is not the task owner')
) AS i(kind, title, sort_order, section, required, owner_role, due_offset_days, needs_review, evidence_hint)
  ON i.kind = t.kind AND t.title = 'Joining journey'
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_checklist_template_items x
  WHERE x.template_id = t.id AND x.title = i.title
);

INSERT INTO public.hr_checklist_template_items
  (template_id, title, sort_order, section, required, owner_role, due_offset_days, needs_review, evidence_hint)
SELECT t.id, i.title, i.sort_order, i.section, i.required, i.owner_role, i.due_offset_days, i.needs_review, i.evidence_hint
FROM public.hr_checklist_templates t
JOIN (
  VALUES
    ('offboarding', 'Manager handover of duties', 1, 'handover', true, 'manager', 0, false, 'Handover note'),
    ('offboarding', 'IT access removed', 2, 'access', true, 'it', 0, false, 'Systems closed'),
    ('offboarding', 'Equipment returned', 3, 'equipment', true, 'it', 0, false, 'Assets received'),
    ('offboarding', 'Advances and loans cleared', 4, 'finance', true, 'finance', 0, false, 'Balance confirmed'),
    ('offboarding', 'Leave balance confirmed', 5, 'leave', true, 'hr', 0, false, 'Balance used in final pay'),
    ('offboarding', 'End-of-service benefit reviewed', 6, 'end_of_service', true, 'hr', 0, false, 'Open End of Service for the gratuity'),
    ('offboarding', 'Exit interview', 7, 'interview', true, 'hr', 1, false, 'Interview note'),
    ('offboarding', 'Certificate of service prepared', 8, 'documents', true, 'hr', 2, false, 'Letter reference'),
    ('offboarding', 'Final payroll signed off', 9, 'payroll', true, 'finance', 0, true, 'Reviewer is not the task owner')
) AS i(kind, title, sort_order, section, required, owner_role, due_offset_days, needs_review, evidence_hint)
  ON i.kind = t.kind AND t.title = 'Exit clearance'
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_checklist_template_items x
  WHERE x.template_id = t.id AND x.title = i.title
);

INSERT INTO public.hr_checklist_template_acks (template_id, title, required, sort_order)
SELECT t.id, a.title, true, a.sort_order
FROM public.hr_checklist_templates t
JOIN (
  VALUES
    ('Joining journey', 'Employee handbook', 1),
    ('Joining journey', 'Code of conduct', 2),
    ('Joining journey', 'Attendance and leave policy', 3),
    ('Exit clearance', 'Exit clearance form', 1),
    ('Exit clearance', 'Company property declaration', 2)
) AS a(template_title, title, sort_order) ON a.template_title = t.title
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_checklist_template_acks x
  WHERE x.template_id = t.id AND x.title = a.title
);

INSERT INTO public.hr_checklist_template_training (template_id, title, required, due_offset_days, sort_order)
SELECT t.id, 'Mandatory first-month induction', true, 30, 1
FROM public.hr_checklist_templates t
WHERE t.kind = 'onboarding' AND t.title = 'Joining journey'
  AND NOT EXISTS (
    SELECT 1 FROM public.hr_checklist_template_training x
    WHERE x.template_id = t.id AND x.title = 'Mandatory first-month induction'
  );

INSERT INTO public.hr_approval_rules (kind, title, approver_role, required, sort_order)
SELECT v.kind, v.title, v.approver_role, true, v.sort_order
FROM (
  VALUES
    ('onboarding', 'HR owns the case and records evidence on required tasks', 'hr', 1),
    ('onboarding', 'Line manager confirms day-1 readiness', 'manager', 2),
    ('onboarding', 'Independent review is signed by someone other than the task owner', 'hr', 3),
    ('offboarding', 'Initiating manager records the exit cause, notice, and last working day', 'manager', 1),
    ('offboarding', 'Finance signs final pay after advances, loans, and leave are confirmed', 'finance', 2),
    ('offboarding', 'HR cannot close the exit while a required clearance is open', 'hr', 3)
) AS v(kind, title, approver_role, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_approval_rules r
  WHERE r.kind = v.kind AND r.title = v.title
);
