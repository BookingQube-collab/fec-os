-- Leave ladder: supervisor (manager) → Sr. Site Supervisor (site) → HoO / F&B (ops).
-- Ops finalizes attendance/roster; HR is notify-only. Legacy `hr` rows remain readable.

ALTER TABLE public.hr_leave_approvals
  DROP CONSTRAINT IF EXISTS hr_leave_approvals_role_chk;

ALTER TABLE public.hr_leave_approvals
  ADD CONSTRAINT hr_leave_approvals_role_chk
  CHECK (step_role IN ('manager', 'site', 'ops', 'hr'));

COMMENT ON COLUMN public.hr_leave_approvals.step_role IS
  'Approval seat: manager (line/venue supervisor), site (Sr. Site Supervisor), ops (HoO/F&B, terminal), hr (legacy).';
