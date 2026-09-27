-- Roster amend "Comp off": the worked day being compensated.
-- The explanation stays on attendance_leave_records.notes.
-- Additive and nullable. Existing leave rows are unchanged.

ALTER TABLE public.attendance_leave_records
  ADD COLUMN IF NOT EXISTS comp_off_for_date date;

COMMENT ON COLUMN public.attendance_leave_records.comp_off_for_date IS
  'Worked day a roster comp-off compensates. Set only when leave_type = comp_off.';
