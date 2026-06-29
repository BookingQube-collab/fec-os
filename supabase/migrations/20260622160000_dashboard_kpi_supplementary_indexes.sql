-- Indexes for dashboard KPI supplementary queries (revenue, shifts, downtime, readiness)

CREATE INDEX IF NOT EXISTS idx_financial_snapshots_loc_period
  ON public.financial_snapshots (location_id, period_kind, period_start);

CREATE INDEX IF NOT EXISTS idx_shifts_location_starts
  ON public.shifts (location_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_downtime_events_location_started
  ON public.downtime_events (location_id, started_at);

CREATE INDEX IF NOT EXISTS idx_facility_tasks_location_category
  ON public.facility_tasks (location_id, category)
  WHERE category = 'site_readiness';
