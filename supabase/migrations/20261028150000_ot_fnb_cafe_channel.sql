-- F&B Cafe OT: separate claim_source from Operations supervisor/attendance OT.
-- Auto-approved on submit (no Sr. Site / HOO / HR / GM chain). Period From–To
-- lives on period_from / period_to; one day-row uses work_date = period_to for
-- monthly summary bucketing. No 26/28 contract gate.

ALTER TABLE public.hr_ot_claims
  DROP CONSTRAINT IF EXISTS hr_ot_claims_source_chk;

ALTER TABLE public.hr_ot_claims
  ADD CONSTRAINT hr_ot_claims_source_chk
  CHECK (claim_source IN ('attendance', 'supervisor', 'fnb_cafe'));

ALTER TABLE public.hr_ot_claims
  ADD COLUMN IF NOT EXISTS period_from date,
  ADD COLUMN IF NOT EXISTS period_to date;

COMMENT ON COLUMN public.hr_ot_claims.claim_source IS
  'attendance: eligible minutes from attendance. supervisor: Ops 26/28-day request. fnb_cafe: F&B Manager period OT (auto gm_approved).';

COMMENT ON COLUMN public.hr_ot_claims.period_from IS
  'F&B Cafe OT period start (inclusive). NULL for attendance/supervisor claims.';

COMMENT ON COLUMN public.hr_ot_claims.period_to IS
  'F&B Cafe OT period end (inclusive). Also used as work_date for monthly summary. NULL for attendance/supervisor claims.';

ALTER TABLE public.hr_ot_claims
  DROP CONSTRAINT IF EXISTS hr_ot_claims_period_range_chk;

ALTER TABLE public.hr_ot_claims
  ADD CONSTRAINT hr_ot_claims_period_range_chk
  CHECK (
    (period_from IS NULL AND period_to IS NULL)
    OR (
      claim_source = 'fnb_cafe'
      AND period_from IS NOT NULL
      AND period_to IS NOT NULL
      AND period_from <= period_to
    )
  );
