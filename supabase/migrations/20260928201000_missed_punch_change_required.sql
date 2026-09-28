-- Missed punch "Change required" sends one request back to the employee.
-- They edit that same correction and submit it again for the site supervisor.
-- Rejected and approved stay as they are.

ALTER TABLE public.attendance_corrections
  DROP CONSTRAINT IF EXISTS attendance_corrections_status_chk;

ALTER TABLE public.attendance_corrections
  ADD CONSTRAINT attendance_corrections_status_chk
  CHECK (status IN ('pending', 'approved', 'rejected', 'change_required'));

NOTIFY pgrst, 'reload schema';
