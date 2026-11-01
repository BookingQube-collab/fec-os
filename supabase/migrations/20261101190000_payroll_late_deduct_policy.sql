-- Configurable late-punch salary deduction on payroll policy section.
-- Default matches prior hardcode: each late worked day → half day paid.
-- Optional escalation: after N lates in the period, deduct extra day-units once.

INSERT INTO public.hr_policy_settings (company_id, section, key, value)
SELECT NULL, v.section, v.key, v.value::jsonb
FROM (
  VALUES
    ('payroll', 'late_deduct_enabled', 'true'),
    ('payroll', 'late_deduct_units_per_day', '0.5'),
    ('payroll', 'late_escalate_after_count', '0'),
    ('payroll', 'late_escalate_extra_units', '1')
) AS v(section, key, value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_policy_settings p
  WHERE p.company_id IS NULL AND p.section = v.section AND p.key = v.key
);
