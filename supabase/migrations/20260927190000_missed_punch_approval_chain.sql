-- Missed punch requests follow the same manager, ops, HR ladder as leave.
-- current_step_role records which approver the request is waiting on.
-- attendance_correction_approvals records who approved each step.
-- Existing attendance_corrections RLS policies are unchanged.
-- The new table has no authenticated policies. The server writes it with the service role
-- after the caller is confirmed as the current approver.

ALTER TABLE public.attendance_corrections
  ADD COLUMN IF NOT EXISTS current_step_role text;

ALTER TABLE public.attendance_corrections
  DROP CONSTRAINT IF EXISTS attendance_corrections_step_role_chk;

ALTER TABLE public.attendance_corrections
  ADD CONSTRAINT attendance_corrections_step_role_chk
  CHECK (current_step_role IS NULL OR current_step_role IN ('manager', 'ops', 'hr'));

CREATE INDEX IF NOT EXISTS idx_att_corrections_current_step
  ON public.attendance_corrections (current_step_role, status)
  WHERE status = 'pending' AND current_step_role IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.attendance_correction_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correction_id uuid NOT NULL REFERENCES public.attendance_corrections(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  step_role text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  acted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acted_at timestamptz,
  comments text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_correction_approvals_role_chk CHECK (step_role IN ('manager', 'ops', 'hr')),
  CONSTRAINT attendance_correction_approvals_status_chk CHECK (status IN ('pending', 'approved', 'skipped', 'rejected')),
  UNIQUE (correction_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_att_correction_approvals_correction
  ON public.attendance_correction_approvals (correction_id, step_order);

ALTER TABLE public.attendance_correction_approvals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.attendance_correction_approvals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.attendance_correction_approvals TO service_role;

NOTIFY pgrst, 'reload schema';
