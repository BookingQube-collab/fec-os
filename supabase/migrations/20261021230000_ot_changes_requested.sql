-- OT "Change request" send-back (parity with missed-punch change_required / job return).

ALTER TABLE public.hr_ot_claims DROP CONSTRAINT IF EXISTS hr_ot_claims_status_chk;
ALTER TABLE public.hr_ot_claims
  ADD CONSTRAINT hr_ot_claims_status_chk CHECK (
    status IN (
      'draft', 'submitted', 'manager_verified', 'ops_approved', 'hr_approved',
      'payroll_posted', 'changes_requested', 'rejected', 'cancelled'
    )
  );

ALTER TABLE public.hr_ot_claim_approvals DROP CONSTRAINT IF EXISTS hr_ot_claim_approvals_action_chk;
ALTER TABLE public.hr_ot_claim_approvals
  ADD CONSTRAINT hr_ot_claim_approvals_action_chk CHECK (
    action IN (
      'submitted', 'verified', 'approved', 'rejected', 'cancelled',
      'payroll_posted', 'changes_requested', 'resubmitted'
    )
  );
