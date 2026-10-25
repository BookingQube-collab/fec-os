-- Missed punch / punch correction: add General Manager after HR
-- (supervisor submit → Sr. Site Supervisor → HoO → HR → GM).

ALTER TABLE public.attendance_corrections
  DROP CONSTRAINT IF EXISTS attendance_corrections_step_role_chk;

ALTER TABLE public.attendance_corrections
  ADD CONSTRAINT attendance_corrections_step_role_chk
  CHECK (current_step_role IS NULL OR current_step_role IN ('manager', 'ops', 'hr', 'gm'));

ALTER TABLE public.attendance_correction_approvals
  DROP CONSTRAINT IF EXISTS attendance_correction_approvals_role_chk;

ALTER TABLE public.attendance_correction_approvals
  ADD CONSTRAINT attendance_correction_approvals_role_chk
  CHECK (step_role IN ('manager', 'ops', 'hr', 'gm'));

-- Seed a pending GM seat on open corrections that do not already have one.
INSERT INTO public.attendance_correction_approvals (
  correction_id,
  step_order,
  step_role,
  status
)
SELECT
  c.id,
  4,
  'gm',
  'pending'
FROM public.attendance_corrections c
WHERE c.status = 'pending'
  AND NOT EXISTS (
    SELECT 1
    FROM public.attendance_correction_approvals a
    WHERE a.correction_id = c.id
      AND a.step_role = 'gm'
  );

NOTIFY pgrst, 'reload schema';
