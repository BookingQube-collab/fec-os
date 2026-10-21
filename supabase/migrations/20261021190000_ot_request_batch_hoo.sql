-- OT request batches (one UI request for multi-date / multi-staff submits)
-- + Head of Operations step between site supervisor and HR.

ALTER TABLE public.hr_ot_claims
  ADD COLUMN IF NOT EXISTS request_batch_id uuid,
  ADD COLUMN IF NOT EXISTS ops_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ops_approved_at timestamptz;

COMMENT ON COLUMN public.hr_ot_claims.request_batch_id IS
  'Groups claim day-rows from one supervisor OT submit into a single request in the UI.';
COMMENT ON COLUMN public.hr_ot_claims.ops_approved_by IS
  'Head of Operations (ops step) who approved this claim before HR.';
COMMENT ON COLUMN public.hr_ot_claims.ops_approved_at IS
  'When Head of Operations approved this claim.';

CREATE INDEX IF NOT EXISTS idx_hr_ot_claims_request_batch
  ON public.hr_ot_claims (request_batch_id, work_date DESC)
  WHERE request_batch_id IS NOT NULL;

-- Allow ops_approved in status check.
ALTER TABLE public.hr_ot_claims DROP CONSTRAINT IF EXISTS hr_ot_claims_status_chk;
ALTER TABLE public.hr_ot_claims
  ADD CONSTRAINT hr_ot_claims_status_chk CHECK (
    status IN (
      'draft', 'submitted', 'manager_verified', 'ops_approved', 'hr_approved',
      'payroll_posted', 'rejected', 'cancelled'
    )
  );

-- Approval trail: ops step.
ALTER TABLE public.hr_ot_claim_approvals DROP CONSTRAINT IF EXISTS hr_ot_claim_approvals_step_chk;
ALTER TABLE public.hr_ot_claim_approvals
  ADD CONSTRAINT hr_ot_claim_approvals_step_chk CHECK (
    step IN ('submit', 'manager', 'ops', 'hr', 'payroll')
  );

-- Backfill batch ids for existing supervisor multi-day submits that share
-- submitter + timestamp + purpose (typical same-transaction insert).
WITH keys AS (
  SELECT
    submitted_by,
    date_trunc('second', submitted_at) AS submitted_sec,
    COALESCE(purpose, notes, '') AS purpose_key,
    gen_random_uuid() AS batch_id
  FROM public.hr_ot_claims
  WHERE claim_source = 'supervisor'
    AND submitted_by IS NOT NULL
    AND submitted_at IS NOT NULL
    AND request_batch_id IS NULL
  GROUP BY submitted_by, date_trunc('second', submitted_at), COALESCE(purpose, notes, '')
)
UPDATE public.hr_ot_claims c
SET request_batch_id = keys.batch_id
FROM keys
WHERE c.claim_source = 'supervisor'
  AND c.request_batch_id IS NULL
  AND c.submitted_by = keys.submitted_by
  AND date_trunc('second', c.submitted_at) = keys.submitted_sec
  AND COALESCE(c.purpose, c.notes, '') = keys.purpose_key;

-- Singleton batches for remaining supervisor rows without a batch.
UPDATE public.hr_ot_claims
SET request_batch_id = id
WHERE claim_source = 'supervisor'
  AND request_batch_id IS NULL;
