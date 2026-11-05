-- ============================================================
-- Phase 5 — event crew close workflow + schedule guard.
-- Additive: assignment status/closed stamps; no monthly payroll changes.
-- ============================================================

ALTER TABLE public.event_staff_assignments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.event_staff_assignments
  DROP CONSTRAINT IF EXISTS event_staff_assignments_status_chk;

ALTER TABLE public.event_staff_assignments
  ADD CONSTRAINT event_staff_assignments_status_chk
  CHECK (status IN ('active', 'closed'));

ALTER TABLE public.event_staff_assignments
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

ALTER TABLE public.event_staff_assignments
  ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_event_staff_assignments_status
  ON public.event_staff_assignments (event_id, status);

COMMENT ON COLUMN public.event_staff_assignments.status IS
  'active = open for schedule/pay; closed = end-of-event stamped (Phase 5).';
COMMENT ON COLUMN public.event_staff_assignments.closed_at IS
  'When the assignment was closed via event close workflow.';
COMMENT ON COLUMN public.event_staff_assignments.closed_by IS
  'User who closed the assignment.';
