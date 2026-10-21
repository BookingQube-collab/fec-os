-- OT hourly rate: basic / (30 × staff.expected_hours) × rate × OT hours.
-- Days: always policy days_per_month (30) — not supervisor contract 26/28.
-- Hours: staff.expected_hours when set; else claim/policy snapshot; else 9.

COMMENT ON COLUMN public.hr_ot_claims.days_per_month_snapshot IS
  'Monthly day divisor for OT pay (policy days_per_month, default 30). Not contract 26/28.';
COMMENT ON COLUMN public.hr_ot_claims.hours_per_day_snapshot IS
  'Daily hour divisor: staff.expected_hours when set, else OT policy hours_per_day (default 9).';

COMMENT ON COLUMN public.staff_profile_ext.contract_working_days IS
  'Monthly working-day contract for supervisor OT claim path (26 or 28). Does not change OT hourly day divisor (always 30).';

-- Recalculate pending OT amounts that used contract 26/28 days or a stale hours divisor.
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
    30::numeric AS days,
    COALESCE(
      NULLIF(s.expected_hours, 0),
      NULLIF(c.hours_per_day_snapshot, 0),
      9
    )::numeric AS hours,
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
  LEFT JOIN public.staff s ON s.id = c.staff_id
  WHERE c.status NOT IN ('rejected', 'cancelled', 'payroll_posted')
    AND (
      c.days_per_month_snapshot IS DISTINCT FROM 30
      OR c.contract_working_days IN (26, 28)
      OR c.hours_per_day_snapshot IS NULL
      OR (
        s.expected_hours IS NOT NULL
        AND s.expected_hours > 0
        AND c.hours_per_day_snapshot IS DISTINCT FROM s.expected_hours
      )
    )
),
recomputed AS (
  SELECT
    id,
    old_amount,
    basic_qar,
    days,
    hours,
    CASE
      WHEN basic_qar IS NULL OR basic_qar <= 0 OR minutes <= 0 OR days <= 0 OR hours <= 0 THEN NULL
      ELSE round((minutes::numeric / 60) * (basic_qar / days / hours) * rate_multiplier, 2)
    END AS new_amount
  FROM pending
)
UPDATE public.hr_ot_claims c
SET
  amount_qar = r.new_amount,
  basic_qar_snapshot = COALESCE(c.basic_qar_snapshot, r.basic_qar),
  hours_per_day_snapshot = r.hours,
  days_per_month_snapshot = r.days,
  updated_at = now()
FROM recomputed r
WHERE c.id = r.id
  AND r.new_amount IS NOT NULL
  AND r.new_amount > 0
  AND abs(COALESCE(c.amount_qar, 0) - r.new_amount) >= 0.01;
