-- Roots of the operations org chart have no reporting manager, which is also the
-- default for everyone not on the chart. This flag marks an explicit root.
-- Reporting lines stay on reporting_manager_staff_id. Missed-punch approval reads
-- that column and is not rewritten here.

ALTER TABLE public.staff_profile_ext
  ADD COLUMN IF NOT EXISTS org_chart_placed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staff_profile_ext.org_chart_placed IS
  'True when this staff member is an explicit node on the operations org chart. Chart roots combine this flag with a null reporting_manager_staff_id. Anyone with a reporting manager is on the chart whether or not the flag is set.';
