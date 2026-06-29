-- Per-location maintenance weekly reports (mirrors operations weekly_reports)

ALTER TABLE public.maintenance_weekly_reports
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE;

UPDATE public.maintenance_weekly_reports mwr
SET location_id = (
  SELECT l.id FROM public.locations l
  WHERE l.status IN ('active', 'maintenance')
  ORDER BY l.code
  LIMIT 1
)
WHERE mwr.location_id IS NULL;

ALTER TABLE public.maintenance_weekly_reports
  ALTER COLUMN location_id SET NOT NULL;

ALTER TABLE public.maintenance_weekly_reports
  DROP CONSTRAINT IF EXISTS maintenance_weekly_reports_team_reporting_week_start_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_maintenance_weekly_reports_team_location_week
  ON public.maintenance_weekly_reports (team, location_id, reporting_week_start);

CREATE INDEX IF NOT EXISTS idx_maintenance_weekly_reports_location
  ON public.maintenance_weekly_reports (location_id, reporting_week_start DESC);

DROP POLICY IF EXISTS "maintenance_weekly_reports estate" ON public.maintenance_weekly_reports;
CREATE POLICY "maintenance_weekly_reports scoped" ON public.maintenance_weekly_reports FOR ALL TO authenticated
  USING (
    public.user_can_access_location(location_id)
    OR public.current_user_role_level() >= 80
  )
  WITH CHECK (
    public.user_can_access_location(location_id)
    OR public.current_user_role_level() >= 80
  );

DROP POLICY IF EXISTS "maintenance_weekly_report_attachments scoped" ON public.maintenance_weekly_report_attachments;
CREATE POLICY "maintenance_weekly_report_attachments scoped" ON public.maintenance_weekly_report_attachments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.maintenance_weekly_reports wr
      WHERE wr.id = maintenance_weekly_report_id
        AND (
          public.user_can_access_location(wr.location_id)
          OR public.current_user_role_level() >= 80
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.maintenance_weekly_reports wr
      WHERE wr.id = maintenance_weekly_report_id
        AND (
          public.user_can_access_location(wr.location_id)
          OR public.current_user_role_level() >= 80
        )
    )
  );
