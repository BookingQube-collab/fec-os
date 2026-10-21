-- Qatar salary bifurcation on the live compensation snapshot + OT claim pay audit.
-- History already stores basic_qar + allowances jsonb (housing/transportation/food/other).
-- staff_compensation previously held only monthly_salary_qar (package total) / daily_rate_qar;
-- OT was incorrectly treating the package total as basic.

ALTER TABLE public.staff_compensation
  ADD COLUMN IF NOT EXISTS basic_qar numeric(12, 2),
  ADD COLUMN IF NOT EXISTS housing_qar numeric(12, 2),
  ADD COLUMN IF NOT EXISTS transport_qar numeric(12, 2);

COMMENT ON COLUMN public.staff_compensation.basic_qar IS
  'Qatar basic salary (QAR). OT hourly rate uses this, not monthly_salary_qar.';
COMMENT ON COLUMN public.staff_compensation.housing_qar IS
  'Housing / home allowance (QAR). Matches staff_salary_history.allowances.housing.';
COMMENT ON COLUMN public.staff_compensation.transport_qar IS
  'Transport allowance (QAR). Matches staff_salary_history.allowances.transportation.';
COMMENT ON COLUMN public.staff_compensation.monthly_salary_qar IS
  'Package total (basic + housing + transport + other allowances). Not used for OT.';

-- Backfill components from the latest salary history row when compensation has no basic yet.
UPDATE public.staff_compensation sc
SET
  basic_qar = COALESCE(sc.basic_qar, hist.basic_qar),
  housing_qar = COALESCE(
    sc.housing_qar,
    NULLIF((hist.allowances ->> 'housing')::numeric, 0)
  ),
  transport_qar = COALESCE(
    sc.transport_qar,
    NULLIF((hist.allowances ->> 'transportation')::numeric, 0)
  )
FROM (
  SELECT DISTINCT ON (staff_id)
    staff_id,
    basic_qar,
    allowances
  FROM public.staff_salary_history
  ORDER BY staff_id, effective_on DESC, created_at DESC
) hist
WHERE sc.staff_id = hist.staff_id
  AND sc.basic_qar IS NULL
  AND hist.basic_qar IS NOT NULL;

-- Legacy rows that only had a package total: treat it as basic until HR splits it.
UPDATE public.staff_compensation
SET basic_qar = monthly_salary_qar
WHERE basic_qar IS NULL
  AND monthly_salary_qar IS NOT NULL
  AND monthly_salary_qar > 0
  AND (daily_rate_qar IS NULL OR daily_rate_qar <= 0);

ALTER TABLE public.hr_ot_claims
  ADD COLUMN IF NOT EXISTS basic_qar_snapshot numeric(12, 2),
  ADD COLUMN IF NOT EXISTS housing_qar_snapshot numeric(12, 2),
  ADD COLUMN IF NOT EXISTS transport_qar_snapshot numeric(12, 2),
  ADD COLUMN IF NOT EXISTS hours_per_day_snapshot numeric(6, 2),
  ADD COLUMN IF NOT EXISTS days_per_month_snapshot numeric(6, 2);

COMMENT ON COLUMN public.hr_ot_claims.basic_qar_snapshot IS
  'Basic salary (QAR) used when amount_qar was computed.';
COMMENT ON COLUMN public.hr_ot_claims.housing_qar_snapshot IS
  'Housing allowance snapshot at claim time (audit; not used in OT amount).';
COMMENT ON COLUMN public.hr_ot_claims.transport_qar_snapshot IS
  'Transport allowance snapshot at claim time (audit; not used in OT amount).';
COMMENT ON COLUMN public.hr_ot_claims.hours_per_day_snapshot IS
  'OT policy hours_per_day (default 8) used as the daily hour divisor.';
COMMENT ON COLUMN public.hr_ot_claims.days_per_month_snapshot IS
  'Monthly day divisor: 26/28 contract days for supervisor OT, else policy days_per_month (default 30).';
