-- OT General Manager step between HOO and HR, plus signer-name snapshots for print slips.

ALTER TABLE public.hr_ot_claims
  ADD COLUMN IF NOT EXISTS verified_signer_name text,
  ADD COLUMN IF NOT EXISTS ops_approved_signer_name text,
  ADD COLUMN IF NOT EXISTS gm_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gm_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS gm_approved_signer_name text,
  ADD COLUMN IF NOT EXISTS approved_signer_name text;

COMMENT ON COLUMN public.hr_ot_claims.verified_signer_name IS
  'Display name of the site supervisor who verified; shown on the OT print slip.';
COMMENT ON COLUMN public.hr_ot_claims.ops_approved_signer_name IS
  'Display name of the Head of Operations who approved; shown on the OT print slip.';
COMMENT ON COLUMN public.hr_ot_claims.gm_approved_by IS
  'General Manager who approved this claim after HOO and before HR.';
COMMENT ON COLUMN public.hr_ot_claims.gm_approved_at IS
  'When the General Manager approved this claim.';
COMMENT ON COLUMN public.hr_ot_claims.gm_approved_signer_name IS
  'Display name of the General Manager who approved; shown on the OT print slip.';
COMMENT ON COLUMN public.hr_ot_claims.approved_signer_name IS
  'Display name of the HR approver; shown on the OT print slip.';

ALTER TABLE public.hr_ot_claims DROP CONSTRAINT IF EXISTS hr_ot_claims_status_chk;
ALTER TABLE public.hr_ot_claims
  ADD CONSTRAINT hr_ot_claims_status_chk CHECK (
    status IN (
      'draft', 'submitted', 'manager_verified', 'ops_approved', 'gm_approved',
      'hr_approved', 'payroll_posted', 'changes_requested', 'rejected', 'cancelled'
    )
  );

ALTER TABLE public.hr_ot_claim_approvals DROP CONSTRAINT IF EXISTS hr_ot_claim_approvals_step_chk;
ALTER TABLE public.hr_ot_claim_approvals
  ADD CONSTRAINT hr_ot_claim_approvals_step_chk CHECK (
    step IN ('submit', 'manager', 'ops', 'gm', 'hr', 'payroll')
  );
