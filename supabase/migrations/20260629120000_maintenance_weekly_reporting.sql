-- Maintenance & Logistics Weekly Reporting (mirrors operations weekly_reports pattern)

DO $$ BEGIN
  CREATE TYPE public.maintenance_report_team AS ENUM ('maintenance', 'logistics');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- maintenance_weekly_reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team public.maintenance_report_team NOT NULL,
  reporting_week_start date NOT NULL,
  reporting_week_end date NOT NULL,
  status public.weekly_report_status NOT NULL DEFAULT 'draft',
  priority public.report_review_priority NOT NULL DEFAULT 'medium',
  submitted_by_name text,
  kpi_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_achievements text,
  top_challenges text,
  support_required text,
  next_week_action_plan text,
  critical_issues text,
  operational_notes text,
  review_remarks text,
  missing_info_flag boolean NOT NULL DEFAULT false,
  reviewed_at timestamptz,
  submitted_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  executive_report_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team, reporting_week_start)
);

CREATE INDEX IF NOT EXISTS idx_maintenance_weekly_reports_week
  ON public.maintenance_weekly_reports (reporting_week_start DESC, status);
CREATE INDEX IF NOT EXISTS idx_maintenance_weekly_reports_team
  ON public.maintenance_weekly_reports (team, reporting_week_start DESC);

-- ---------------------------------------------------------------------------
-- maintenance_weekly_report_attachments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_weekly_report_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_weekly_report_id uuid NOT NULL REFERENCES public.maintenance_weekly_reports(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size int CHECK (file_size IS NULL OR file_size >= 0),
  storage_path text,
  content_base64 text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_weekly_report_attachments_report
  ON public.maintenance_weekly_report_attachments (maintenance_weekly_report_id);

-- ---------------------------------------------------------------------------
-- maintenance_executive_reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_executive_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporting_week_start date NOT NULL,
  reporting_week_end date NOT NULL,
  title text NOT NULL,
  status public.executive_report_status NOT NULL DEFAULT 'draft',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  narrative text,
  ai_generated boolean NOT NULL DEFAULT false,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporting_week_start)
);

ALTER TABLE public.maintenance_weekly_reports
  ADD CONSTRAINT maintenance_weekly_reports_executive_fk
  FOREIGN KEY (executive_report_id) REFERENCES public.maintenance_executive_reports(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- maintenance_report_review_comments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_report_review_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_weekly_report_id uuid NOT NULL REFERENCES public.maintenance_weekly_reports(id) ON DELETE CASCADE,
  comment_text text NOT NULL,
  is_internal boolean NOT NULL DEFAULT true,
  priority public.report_review_priority,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_report_review_comments_report
  ON public.maintenance_report_review_comments (maintenance_weekly_report_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- maintenance_report_kpi_snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_report_kpi_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_executive_report_id uuid NOT NULL REFERENCES public.maintenance_executive_reports(id) ON DELETE CASCADE,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  kpis jsonb NOT NULL DEFAULT '{}'::jsonb,
  charts jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_maintenance_report_kpi_snapshots_report
  ON public.maintenance_report_kpi_snapshots (maintenance_executive_report_id);

-- ---------------------------------------------------------------------------
-- Grants & RLS
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_weekly_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_weekly_report_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_executive_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_report_review_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_report_kpi_snapshots TO authenticated;

GRANT ALL ON public.maintenance_weekly_reports TO service_role;
GRANT ALL ON public.maintenance_weekly_report_attachments TO service_role;
GRANT ALL ON public.maintenance_executive_reports TO service_role;
GRANT ALL ON public.maintenance_report_review_comments TO service_role;
GRANT ALL ON public.maintenance_report_kpi_snapshots TO service_role;

ALTER TABLE public.maintenance_weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_weekly_report_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_executive_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_report_review_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_report_kpi_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "maintenance_weekly_reports estate" ON public.maintenance_weekly_reports;
CREATE POLICY "maintenance_weekly_reports estate" ON public.maintenance_weekly_reports FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 30 OR true)
  WITH CHECK (public.current_user_role_level() >= 30);

DROP POLICY IF EXISTS "maintenance_weekly_report_attachments scoped" ON public.maintenance_weekly_report_attachments;
CREATE POLICY "maintenance_weekly_report_attachments scoped" ON public.maintenance_weekly_report_attachments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.maintenance_weekly_reports wr
      WHERE wr.id = maintenance_weekly_report_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.maintenance_weekly_reports wr
      WHERE wr.id = maintenance_weekly_report_id
    )
  );

DROP POLICY IF EXISTS "maintenance_executive_reports estate" ON public.maintenance_executive_reports;
CREATE POLICY "maintenance_executive_reports estate" ON public.maintenance_executive_reports FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 50 OR true)
  WITH CHECK (public.current_user_role_level() >= 50);

DROP POLICY IF EXISTS "maintenance_report_review_comments scoped" ON public.maintenance_report_review_comments;
CREATE POLICY "maintenance_report_review_comments scoped" ON public.maintenance_report_review_comments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.maintenance_weekly_reports wr
      WHERE wr.id = maintenance_weekly_report_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.maintenance_weekly_reports wr
      WHERE wr.id = maintenance_weekly_report_id
    )
  );

DROP POLICY IF EXISTS "maintenance_report_kpi_snapshots estate" ON public.maintenance_report_kpi_snapshots;
CREATE POLICY "maintenance_report_kpi_snapshots estate" ON public.maintenance_report_kpi_snapshots FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 50 OR true)
  WITH CHECK (public.current_user_role_level() >= 50);

DROP TRIGGER IF EXISTS trg_maintenance_weekly_reports_updated ON public.maintenance_weekly_reports;
CREATE TRIGGER trg_maintenance_weekly_reports_updated BEFORE UPDATE ON public.maintenance_weekly_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_maintenance_executive_reports_updated ON public.maintenance_executive_reports;
CREATE TRIGGER trg_maintenance_executive_reports_updated BEFORE UPDATE ON public.maintenance_executive_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
