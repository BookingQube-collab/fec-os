-- OT hourly divisor: align with site permanent 9h day (not unpaid-break net 8).
-- Formula: basic / days_per_month / hours_per_day × rate × OT hours.
-- Supervisor 26/28 contracts still use contract days; others keep policy days_per_month (30).

UPDATE public.hr_policy_settings
SET value = '9'::jsonb,
    updated_at = now()
WHERE section = 'ot'
  AND key = 'hours_per_day'
  AND (
    value = '8'::jsonb
    OR value = '8'
    OR trim(both '"' from value::text) = '8'
  );

INSERT INTO public.hr_policy_settings (company_id, section, key, value)
SELECT NULL, 'ot', 'hours_per_day', '9'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_policy_settings p
  WHERE p.company_id IS NULL AND p.section = 'ot' AND p.key = 'hours_per_day'
);

COMMENT ON COLUMN public.hr_ot_claims.hours_per_day_snapshot IS
  'OT policy hours_per_day (default 9) used as the daily hour divisor.';

-- Recalculate pending OT amounts that used the old 8h divisor (or lack a snapshot).
-- amount = round(minutes/60 * basic / days / hours * rate_multiplier, 2)
WITH pending AS (
  SELECT
    c.id,
    c.amount_qar AS old_amount,
    GREATEST(
      COALESCE(c.approved_minutes, 0),
      COALESCE(c.claimed_minutes, 0)
    ) AS minutes,
    COALESCE(c.rate_multiplier, 1)::numeric AS rate_multiplier,
    CASE
      WHEN c.contract_working_days IN (26, 28) THEN c.contract_working_days::numeric
      ELSE COALESCE(c.days_per_month_snapshot, 30)::numeric
    END AS days,
    COALESCE(
      NULLIF(c.basic_qar_snapshot, 0),
      (
        SELECT sc.basic_qar
        FROM public.staff_compensation sc
        WHERE sc.staff_id = c.staff_id
          AND sc.basic_qar IS NOT NULL
          AND sc.basic_qar > 0
      ),
      (
        SELECT h.basic_qar
        FROM public.staff_salary_history h
        WHERE h.staff_id = c.staff_id
          AND h.basic_qar IS NOT NULL
          AND h.basic_qar > 0
        ORDER BY h.effective_on DESC NULLS LAST
        LIMIT 1
      )
    ) AS basic_qar
  FROM public.hr_ot_claims c
  WHERE c.status NOT IN ('rejected', 'cancelled', 'payroll_posted')
    AND (
      c.hours_per_day_snapshot IS NULL
      OR c.hours_per_day_snapshot = 8
    )
),
recomputed AS (
  SELECT
    id,
    old_amount,
    basic_qar,
    days,
    CASE
      WHEN basic_qar IS NULL OR basic_qar <= 0 OR minutes <= 0 OR days <= 0 THEN NULL
      ELSE round((minutes::numeric / 60) * (basic_qar / days / 9) * rate_multiplier, 2)
    END AS new_amount
  FROM pending
)
UPDATE public.hr_ot_claims c
SET
  amount_qar = r.new_amount,
  basic_qar_snapshot = COALESCE(c.basic_qar_snapshot, r.basic_qar),
  hours_per_day_snapshot = 9,
  days_per_month_snapshot = r.days,
  updated_at = now()
FROM recomputed r
WHERE c.id = r.id
  AND r.new_amount IS NOT NULL
  AND r.new_amount > 0
  AND abs(COALESCE(c.amount_qar, 0) - r.new_amount) >= 0.01;
