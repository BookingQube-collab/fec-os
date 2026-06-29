-- Executive Weekly Operations Reporting System (comprehensive schema)
-- Supersedes 20260627120000_weekly_reports.sql simplified tables

DROP TABLE IF EXISTS public.executive_weekly_reports CASCADE;
DROP TABLE IF EXISTS public.weekly_supervisor_reports CASCADE;
DROP TYPE IF EXISTS public.weekly_supervisor_report_status CASCADE;
DROP TYPE IF EXISTS public.executive_weekly_report_status CASCADE;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.weekly_report_status AS ENUM (
    'draft',
    'submitted',
    'under_review',
    'sent_back',
    'approved',
    'included_in_executive',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.report_review_priority AS ENUM (
    'critical',
    'high',
    'medium',
    'low'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.executive_report_status AS ENUM (
    'draft',
    'generated',
    'published',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- weekly_reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  reporting_week_start date NOT NULL,
  reporting_week_end date NOT NULL,
  status public.weekly_report_status NOT NULL DEFAULT 'draft',
  priority public.report_review_priority NOT NULL DEFAULT 'medium',
  submitted_by_name text,
  revenue numeric(14, 2) CHECK (revenue IS NULL OR revenue >= 0),
  footfall int CHECK (footfall IS NULL OR footfall >= 0),
  staff_scheduled int NOT NULL DEFAULT 0 CHECK (staff_scheduled >= 0),
  staff_present int NOT NULL DEFAULT 0 CHECK (staff_present >= 0),
  staff_attendance_pct numeric(5, 2) GENERATED ALWAYS AS (
    CASE
      WHEN staff_scheduled > 0
        THEN ROUND((staff_present::numeric / staff_scheduled::numeric) * 100, 2)
      ELSE 0
    END
  ) STORED,
  absentees_late text,
  customer_complaints int NOT NULL DEFAULT 0 CHECK (customer_complaints >= 0),
  positive_feedback text,
  incidents_count int NOT NULL DEFAULT 0 CHECK (incidents_count >= 0),
  incidents_detail text,
  maintenance_issues text,
  maintenance_open int NOT NULL DEFAULT 0 CHECK (maintenance_open >= 0),
  maintenance_closed int NOT NULL DEFAULT 0 CHECK (maintenance_closed >= 0),
  compliance_updates text,
  compliance_score numeric(5, 2) CHECK (compliance_score IS NULL OR (compliance_score >= 0 AND compliance_score <= 100)),
  inventory_issues text,
  cashier_pos_issues text,
  marketing_events text,
  top_achievements text,
  top_challenges text,
  support_required text,
  next_week_action_plan text,
  critical_issues text,
  review_remarks text,
  missing_info_flag boolean NOT NULL DEFAULT false,
  reviewed_at timestamptz,
  submitted_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  executive_report_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, reporting_week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_week
  ON public.weekly_reports (reporting_week_start DESC, status);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_location
  ON public.weekly_reports (location_id, reporting_week_start DESC);

-- ---------------------------------------------------------------------------
-- weekly_report_attachments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_report_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_report_id uuid NOT NULL REFERENCES public.weekly_reports(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size int CHECK (file_size IS NULL OR file_size >= 0),
  storage_path text,
  content_base64 text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weekly_report_attachments_report
  ON public.weekly_report_attachments (weekly_report_id);

-- ---------------------------------------------------------------------------
-- executive_reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.executive_reports (
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

ALTER TABLE public.weekly_reports
  ADD CONSTRAINT weekly_reports_executive_report_fk
  FOREIGN KEY (executive_report_id) REFERENCES public.executive_reports(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- executive_report_actions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.executive_report_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_report_id uuid NOT NULL REFERENCES public.executive_reports(id) ON DELETE CASCADE,
  action_text text NOT NULL,
  owner_role text,
  due_date date,
  priority public.report_review_priority NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_executive_report_actions_report
  ON public.executive_report_actions (executive_report_id);

-- ---------------------------------------------------------------------------
-- report_review_comments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_review_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_report_id uuid NOT NULL REFERENCES public.weekly_reports(id) ON DELETE CASCADE,
  comment_text text NOT NULL,
  is_internal boolean NOT NULL DEFAULT true,
  priority public.report_review_priority,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_review_comments_report
  ON public.report_review_comments (weekly_report_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- report_kpi_snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_kpi_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_report_id uuid NOT NULL REFERENCES public.executive_reports(id) ON DELETE CASCADE,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  kpis jsonb NOT NULL DEFAULT '{}'::jsonb,
  charts jsonb NOT NULL DEFAULT '{}'::jsonb,
  location_rankings jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_report_kpi_snapshots_report
  ON public.report_kpi_snapshots (executive_report_id);

-- ---------------------------------------------------------------------------
-- Grants & RLS
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_report_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.executive_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.executive_report_actions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_review_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_kpi_snapshots TO authenticated;

GRANT ALL ON public.weekly_reports TO service_role;
GRANT ALL ON public.weekly_report_attachments TO service_role;
GRANT ALL ON public.executive_reports TO service_role;
GRANT ALL ON public.executive_report_actions TO service_role;
GRANT ALL ON public.report_review_comments TO service_role;
GRANT ALL ON public.report_kpi_snapshots TO service_role;

ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_report_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executive_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executive_report_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_review_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_kpi_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weekly_reports scoped" ON public.weekly_reports;
CREATE POLICY "weekly_reports scoped" ON public.weekly_reports FOR ALL TO authenticated
  USING (
    public.user_can_access_location(location_id)
    OR public.current_user_role_level() >= 80
  )
  WITH CHECK (
    public.user_can_access_location(location_id)
    OR public.current_user_role_level() >= 80
  );

DROP POLICY IF EXISTS "weekly_report_attachments scoped" ON public.weekly_report_attachments;
CREATE POLICY "weekly_report_attachments scoped" ON public.weekly_report_attachments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.weekly_reports wr
      WHERE wr.id = weekly_report_id
        AND (
          public.user_can_access_location(wr.location_id)
          OR public.current_user_role_level() >= 80
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.weekly_reports wr
      WHERE wr.id = weekly_report_id
        AND (
          public.user_can_access_location(wr.location_id)
          OR public.current_user_role_level() >= 80
        )
    )
  );

DROP POLICY IF EXISTS "executive_reports estate" ON public.executive_reports;
CREATE POLICY "executive_reports estate" ON public.executive_reports FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 70 OR true)
  WITH CHECK (public.current_user_role_level() >= 80);

DROP POLICY IF EXISTS "executive_report_actions estate" ON public.executive_report_actions;
CREATE POLICY "executive_report_actions estate" ON public.executive_report_actions FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 70 OR true)
  WITH CHECK (public.current_user_role_level() >= 80);

DROP POLICY IF EXISTS "report_review_comments scoped" ON public.report_review_comments;
CREATE POLICY "report_review_comments scoped" ON public.report_review_comments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.weekly_reports wr
      WHERE wr.id = weekly_report_id
        AND (
          public.user_can_access_location(wr.location_id)
          OR public.current_user_role_level() >= 80
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.weekly_reports wr
      WHERE wr.id = weekly_report_id
        AND (
          public.user_can_access_location(wr.location_id)
          OR public.current_user_role_level() >= 80
        )
    )
  );

DROP POLICY IF EXISTS "report_kpi_snapshots estate" ON public.report_kpi_snapshots;
CREATE POLICY "report_kpi_snapshots estate" ON public.report_kpi_snapshots FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 70 OR true)
  WITH CHECK (public.current_user_role_level() >= 80);

DROP TRIGGER IF EXISTS trg_weekly_reports_updated ON public.weekly_reports;
CREATE TRIGGER trg_weekly_reports_updated BEFORE UPDATE ON public.weekly_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_executive_reports_updated ON public.executive_reports;
CREATE TRIGGER trg_executive_reports_updated BEFORE UPDATE ON public.executive_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_executive_report_actions_updated ON public.executive_report_actions;
CREATE TRIGGER trg_executive_report_actions_updated BEFORE UPDATE ON public.executive_report_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
