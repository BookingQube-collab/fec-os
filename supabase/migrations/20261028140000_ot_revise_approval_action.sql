-- Allow audit rows when HOO/HR/submitter revises OT fields without resubmitting
-- (status stays put; previously only `resubmitted` was allowed after changes_requested).

ALTER TABLE public.hr_ot_claim_approvals DROP CONSTRAINT IF EXISTS hr_ot_claim_approvals_action_chk;
ALTER TABLE public.hr_ot_claim_approvals
  ADD CONSTRAINT hr_ot_claim_approvals_action_chk CHECK (
    action IN (
      'submitted', 'verified', 'approved', 'rejected', 'cancelled',
      'payroll_posted', 'changes_requested', 'resubmitted', 'revised'
    )
  );
