-- ============================================================
-- Event PM Phase 7 — Governance & approvals (additive)
-- Budget approval workflow columns, risk/issue polish.
-- Change Request (CR) pack deferred — no CR tables here.
-- Do NOT apply to production without staging verify.
-- ============================================================

-- ---------- Budget approval state machine ----------
ALTER TABLE public.event_budgets
  DROP CONSTRAINT IF EXISTS event_budgets_status_check;

ALTER TABLE public.event_budgets
  ADD CONSTRAINT event_budgets_status_check
  CHECK (status IN ('draft', 'submitted', 'approved', 'locked', 'rejected'));

ALTER TABLE public.event_budgets
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.event_budgets.submitted_at IS
  'Phase 7 — when budget left draft for approval.';
COMMENT ON COLUMN public.event_budgets.rejection_reason IS
  'Phase 7 — required when rejecting or reopening from approved/locked.';

-- Approvers (events.approve) may UPDATE budget rows for workflow transitions.
-- SELECT remains finance-gated so non-finance approvers use overview notifications.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'event_budgets' AND policyname = 'event_budgets_update'
  ) THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "event_budgets_update" ON public.event_budgets
    $p$;
    EXECUTE $p$
      CREATE POLICY "event_budgets_update" ON public.event_budgets
        FOR UPDATE TO authenticated
        USING (
          public.user_can_access_event(event_id)
          AND (
            public.events_capability_allows('events.finance')
            OR public.events_capability_allows('events.approve')
            OR public.events_capability_allows('events.manage')
          )
        )
        WITH CHECK (
          public.user_can_access_event(event_id)
          AND (
            public.events_capability_allows('events.finance')
            OR public.events_capability_allows('events.approve')
            OR public.events_capability_allows('events.manage')
          )
        )
    $p$;
  END IF;
END $$;

-- ---------- Risk register polish ----------
ALTER TABLE public.event_risks
  ADD COLUMN IF NOT EXISTS owner_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mitigation text,
  ADD COLUMN IF NOT EXISTS likelihood text
    CHECK (likelihood IS NULL OR likelihood IN ('low', 'medium', 'high', 'critical')),
  ADD COLUMN IF NOT EXISTS impact text
    CHECK (impact IS NULL OR impact IN ('low', 'medium', 'high', 'critical')),
  ADD COLUMN IF NOT EXISTS escalation_level text NOT NULL DEFAULT 'none'
    CHECK (escalation_level IN ('none', 'team', 'pm', 'director', 'exec')),
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_event_risks_owner
  ON public.event_risks (owner_staff_id)
  WHERE owner_staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_risks_due
  ON public.event_risks (event_id, due_date)
  WHERE status <> 'closed' AND due_date IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_event_risks_updated'
  ) THEN
    CREATE TRIGGER trg_event_risks_updated
      BEFORE UPDATE ON public.event_risks
      FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END $$;

-- ---------- Issue register polish (link ↔ tasks + light SLA) ----------
ALTER TABLE public.event_issues
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.event_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sla_due_date date;

CREATE INDEX IF NOT EXISTS idx_event_issues_task
  ON public.event_issues (task_id)
  WHERE task_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_event_issues_sla
  ON public.event_issues (event_id, sla_due_date)
  WHERE deleted_at IS NULL AND sla_due_date IS NOT NULL;

-- Keep issue.task_id on the same event as the issue (when both set)
CREATE OR REPLACE FUNCTION public.tg_event_issue_task_same_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  task_event uuid;
BEGIN
  IF NEW.task_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT event_id INTO task_event FROM public.event_tasks WHERE id = NEW.task_id;
  IF task_event IS NULL THEN
    RAISE EXCEPTION 'event_issues.task_id % not found', NEW.task_id;
  END IF;
  IF task_event <> NEW.event_id THEN
    RAISE EXCEPTION 'event_issues.task_id must belong to the same event';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_issue_task_same_event ON public.event_issues;
CREATE TRIGGER trg_event_issue_task_same_event
  BEFORE INSERT OR UPDATE OF task_id, event_id ON public.event_issues
  FOR EACH ROW EXECUTE FUNCTION public.tg_event_issue_task_same_event();

COMMENT ON TABLE public.event_budgets IS
  'Event budget header. Phase 7 workflow: draft → submitted → approved → locked (reject/reopen). Full Change Request pack deferred.';
