-- OT approval order: HOO → HR → GM → payroll (HR before General Manager).
-- In-flight remapping:
--   gm_approved without HR stamp (old: waiting for HR after GM)
--     → ops_approved, clear GM stamp (HR then GM again)
--   hr_approved with GM stamp (old: ready for payroll after both)
--     → gm_approved (new payroll-ready status)

COMMENT ON COLUMN public.hr_ot_claims.gm_approved_by IS
  'General Manager who approved this claim after HR and before payroll.';
COMMENT ON COLUMN public.hr_ot_claims.gm_approved_at IS
  'When the General Manager approved this claim (after HR).';
COMMENT ON COLUMN public.hr_ot_claims.approved_signer_name IS
  'Display name of the HR approver (before GM); shown on the OT print slip.';

-- Old chain: GM signed, HR not yet — send back to post-HOO so HR goes first.
UPDATE public.hr_ot_claims
SET
  status = 'ops_approved',
  gm_approved_by = NULL,
  gm_approved_at = NULL,
  gm_approved_signer_name = NULL,
  updated_at = now()
WHERE status = 'gm_approved'
  AND approved_by IS NULL
  AND approved_at IS NULL;

-- Old chain: both GM and HR done (payroll-ready) — new payroll-ready status is gm_approved.
-- Only remap rows that already have a GM stamp so mid-flight new-chain hr_approved is untouched.
UPDATE public.hr_ot_claims
SET
  status = 'gm_approved',
  updated_at = now()
WHERE status = 'hr_approved'
  AND gm_approved_by IS NOT NULL;
