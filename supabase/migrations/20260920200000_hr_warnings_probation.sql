-- HRMS Phase 5: warnings / disciplinary + probation reviews.
-- Additive only. NEVER auto-terminate staff from warnings or probation decisions.
-- Probation dates live on staff_profile_ext. Warning letters reuse hr_employee_documents (warning_letter).

-- ---------------------------------------------------------------------------
-- Warnings / disciplinary
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  incident_on date NOT NULL,
  category text NOT NULL DEFAULT 'conduct',
  description text NOT NULL DEFAULT '',
  location text,
  reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_explanation text,
  witnesses text,
  evidence text,
  warning_level text NOT NULL DEFAULT 'written',
  issued_on date NOT NULL,
  valid_until date,
  status text NOT NULL DEFAULT 'active',
  letter_document_id uuid NOT NULL REFERENCES public.hr_employee_documents(id) ON DELETE RESTRICT,
  acknowledgement jsonb NOT NULL DEFAULT '{}'::jsonb,
  appeal jsonb NOT NULL DEFAULT '{}'::jsonb,
  management_decision jsonb NOT NULL DEFAULT '{}'::jsonb,
  requires_formal_review boolean NOT NULL DEFAULT false,
  blocks_casual_leave boolean NOT NULL DEFAULT false,
  triggers_probation_review boolean NOT NULL DEFAULT false,
  active_count_at_issue int NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_warnings_category_chk CHECK (
    category IN ('conduct', 'attendance', 'performance', 'safety', 'policy', 'other')
  ),
  CONSTRAINT hr_warnings_level_chk CHECK (
    warning_level IN ('verbal', 'written', 'final', 'other')
  ),
  CONSTRAINT hr_warnings_status_chk CHECK (
    status IN (
      'active', 'acknowledged', 'appealed', 'withdrawn', 'expired', 'amended'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_hr_warnings_staff_status
  ON public.hr_warnings (staff_id, status, issued_on DESC);

CREATE INDEX IF NOT EXISTS idx_hr_warnings_active
  ON public.hr_warnings (staff_id, valid_until)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_hr_warnings_escalation
  ON public.hr_warnings (requires_formal_review)
  WHERE requires_formal_review = true AND status = 'active';

DROP TRIGGER IF EXISTS trg_hr_warnings_updated ON public.hr_warnings;
CREATE TRIGGER trg_hr_warnings_updated
  BEFORE UPDATE ON public.hr_warnings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.hr_warnings TO authenticated;
GRANT ALL ON public.hr_warnings TO service_role;

ALTER TABLE public.hr_warnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_warnings read" ON public.hr_warnings;
CREATE POLICY "hr_warnings read" ON public.hr_warnings
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_warnings insert" ON public.hr_warnings;
CREATE POLICY "hr_warnings insert" ON public.hr_warnings
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_warnings update" ON public.hr_warnings;
CREATE POLICY "hr_warnings update" ON public.hr_warnings
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

-- Append-only decision / amend trail
CREATE TABLE IF NOT EXISTS public.hr_warning_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warning_id uuid NOT NULL REFERENCES public.hr_warnings(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  acted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_warning_actions_action_chk CHECK (
    action IN (
      'issued', 'acknowledged', 'appealed', 'withdrawn', 'amended',
      'management_decision', 'expired'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_hr_warning_actions_warning
  ON public.hr_warning_actions (warning_id, acted_at DESC);

GRANT SELECT, INSERT ON public.hr_warning_actions TO authenticated;
GRANT ALL ON public.hr_warning_actions TO service_role;

ALTER TABLE public.hr_warning_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_warning_actions read" ON public.hr_warning_actions;
CREATE POLICY "hr_warning_actions read" ON public.hr_warning_actions
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR EXISTS (
      SELECT 1 FROM public.hr_warnings w
      JOIN public.staff s ON s.id = w.staff_id
      WHERE w.id = warning_id AND s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_warning_actions insert" ON public.hr_warning_actions;
CREATE POLICY "hr_warning_actions insert" ON public.hr_warning_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role_level() >= 55
    OR EXISTS (
      SELECT 1 FROM public.hr_warnings w
      JOIN public.staff s ON s.id = w.staff_id
      WHERE w.id = warning_id AND s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

REVOKE UPDATE, DELETE ON public.hr_warning_actions FROM authenticated;

-- ---------------------------------------------------------------------------
-- Probation reviews (dates from staff_profile_ext)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_probation_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  probation_start date NOT NULL,
  probation_end date NOT NULL,
  manager_feedback text,
  performance_rating text,
  performance_evaluation_id uuid,
  supporting_comments text,
  decision text,
  decision_note text,
  status text NOT NULL DEFAULT 'open',
  flags_phase6_termination boolean NOT NULL DEFAULT false,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approval_note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_probation_reviews_decision_chk CHECK (
    decision IS NULL OR decision IN ('confirm', 'extend', 'terminate', 'further_review')
  ),
  CONSTRAINT hr_probation_reviews_status_chk CHECK (
    status IN ('open', 'pending_approval', 'decided', 'cancelled')
  ),
  CONSTRAINT hr_probation_reviews_dates_chk CHECK (probation_end >= probation_start)
);

CREATE INDEX IF NOT EXISTS idx_hr_probation_reviews_staff
  ON public.hr_probation_reviews (staff_id, probation_end DESC);

CREATE INDEX IF NOT EXISTS idx_hr_probation_reviews_upcoming
  ON public.hr_probation_reviews (probation_end, status)
  WHERE status IN ('open', 'pending_approval');

DROP TRIGGER IF EXISTS trg_hr_probation_reviews_updated ON public.hr_probation_reviews;
CREATE TRIGGER trg_hr_probation_reviews_updated
  BEFORE UPDATE ON public.hr_probation_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.hr_probation_reviews TO authenticated;
GRANT ALL ON public.hr_probation_reviews TO service_role;

ALTER TABLE public.hr_probation_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_probation_reviews read" ON public.hr_probation_reviews;
CREATE POLICY "hr_probation_reviews read" ON public.hr_probation_reviews
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_probation_reviews write" ON public.hr_probation_reviews;
CREATE POLICY "hr_probation_reviews write" ON public.hr_probation_reviews
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

-- Probation reminder cadence (mirrors document expiry reminders)
CREATE TABLE IF NOT EXISTS public.hr_probation_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  probation_end date NOT NULL,
  milestone_days integer NOT NULL,
  channel text NOT NULL DEFAULT 'in_app',
  sent_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_probation_reminders_channel_chk CHECK (channel IN ('in_app', 'email')),
  CONSTRAINT hr_probation_reminders_uq UNIQUE (staff_id, probation_end, milestone_days, channel)
);

CREATE INDEX IF NOT EXISTS idx_hr_probation_reminders_staff
  ON public.hr_probation_reminders (staff_id, sent_at DESC);

ALTER TABLE public.hr_probation_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_probation_reminders read" ON public.hr_probation_reminders;
CREATE POLICY "hr_probation_reminders read" ON public.hr_probation_reminders
  FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_probation_reminders write" ON public.hr_probation_reminders;
CREATE POLICY "hr_probation_reminders write" ON public.hr_probation_reminders
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

GRANT SELECT, INSERT, UPDATE ON public.hr_probation_reminders TO authenticated;
GRANT ALL ON public.hr_probation_reminders TO service_role;

-- ---------------------------------------------------------------------------
-- Policy seeds (idempotent) — warning thresholds + probation reminders
-- ---------------------------------------------------------------------------
INSERT INTO public.hr_policy_settings (company_id, section, key, value)
SELECT NULL, v.section, v.key, v.value::jsonb
FROM (
  VALUES
    ('warning', 'active_threshold', '3'),
    ('warning', 'probation_threshold', '1'),
    ('warning', 'auto_terminate', 'false'),
    ('probation', 'default_months', '6'),
    ('probation', 'reminder_days', '[30, 15, 7]'),
    ('notification', 'probation_reminder_days', '[30, 15, 7]')
) AS v(section, key, value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_policy_settings p
  WHERE p.company_id IS NULL AND p.section = v.section AND p.key = v.key
);
