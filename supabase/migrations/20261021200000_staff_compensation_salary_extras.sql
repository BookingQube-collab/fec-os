-- Custom titled salary extras on the live compensation snapshot.
-- History continues to store the same list under allowances.extras (jsonb array).

ALTER TABLE public.staff_compensation
  ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.staff_compensation.extras IS
  'Custom package lines: [{id, title, amount_qar}, ...]. Summed into monthly_salary_qar with basic/housing/transport.';

COMMENT ON COLUMN public.staff_compensation.monthly_salary_qar IS
  'Package total (basic + housing + transport + custom extras). Not used for OT.';
