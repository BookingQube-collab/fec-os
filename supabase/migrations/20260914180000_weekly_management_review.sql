-- Weekly Management Review (estate Tuesday pack)
-- Audit (requirement -> existing -> decision):
-- venues -> locations (INF-CC, KDS-CC, UA-DM, CB-DSM, CB-VM, KDS-DM) -> reuse as location_id
-- users/roles/RLS helpers -> user_roles, has_role, current_user_role_level -> reuse
-- weekly ops reports -> weekly_reports (per-site supervisor pack) -> keep, sibling module
-- decisions voting register -> decisions -> keep, meeting decisions are week-scoped -> create
-- incidents log -> incidents -> keep as live log, meeting snapshot -> create weekly_review_incidents
-- corporate deals / aggregators / social / loyalty / action carry-forward -> none -> create
-- sidebar / theme / table / input / toast / recharts / print CSS -> reuse
-- company_id -> ops is location-scoped, not multi-company -> omit

CREATE TABLE IF NOT EXISTS public.weekly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_label text NOT NULL,
  week_start date NOT NULL,
  week_end date NOT NULL,
  meeting_date date NOT NULL,
  prepared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'presented')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_start)
);

CREATE TABLE IF NOT EXISTS public.weekly_review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.weekly_reviews(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  venue_text text,
  matter text NOT NULL DEFAULT '',
  decision_required text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'other'
    CHECK (priority IN ('critical', 'safety', 'security', 'commercial', 'other')),
  outcome text NOT NULL DEFAULT 'pending'
    CHECK (outcome IN ('pending', 'approved', 'declined', 'deferred')),
  note text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weekly_review_aggregators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.weekly_reviews(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('Entertainer', 'Urban Point', 'DealsGo', 'MyBook')),
  redemptions int NOT NULL DEFAULT 0 CHECK (redemptions >= 0),
  saving_qar numeric(14, 2) NOT NULL DEFAULT 0 CHECK (saving_qar >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, location_id, platform)
);

CREATE TABLE IF NOT EXISTS public.weekly_review_corporate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.weekly_reviews(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  company text NOT NULL DEFAULT '',
  deals int NOT NULL DEFAULT 0 CHECK (deals >= 0),
  revenue_qar numeric(14, 2) NOT NULL DEFAULT 0 CHECK (revenue_qar >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weekly_review_social (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.weekly_reviews(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  google_rating numeric(2, 1),
  total_reviews int NOT NULL DEFAULT 0 CHECK (total_reviews >= 0),
  new_reviews_campaign int NOT NULL DEFAULT 0 CHECK (new_reviews_campaign >= 0),
  new_reviews_organic int NOT NULL DEFAULT 0 CHECK (new_reviews_organic >= 0),
  ig_followers int NOT NULL DEFAULT 0 CHECK (ig_followers >= 0),
  rewards_15min int NOT NULL DEFAULT 0 CHECK (rewards_15min >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, location_id)
);

CREATE TABLE IF NOT EXISTS public.weekly_review_loyalty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.weekly_reviews(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  new_members int NOT NULL DEFAULT 0 CHECK (new_members >= 0),
  active_members int NOT NULL DEFAULT 0 CHECK (active_members >= 0),
  rewards_redeemed int NOT NULL DEFAULT 0 CHECK (rewards_redeemed >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, location_id)
);

CREATE TABLE IF NOT EXISTS public.weekly_review_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.weekly_reviews(id) ON DELETE CASCADE,
  venue_text text,
  action text NOT NULL DEFAULT '',
  owner text,
  due text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'wip', 'done')),
  update_note text,
  carried_from uuid REFERENCES public.weekly_review_actions(id) ON DELETE SET NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weekly_review_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.weekly_reviews(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '',
  action_taken text,
  closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weekly_reviews_week ON public.weekly_reviews (week_start DESC);
CREATE INDEX IF NOT EXISTS idx_wrd_review ON public.weekly_review_decisions (review_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_wra_review ON public.weekly_review_aggregators (review_id);
CREATE INDEX IF NOT EXISTS idx_wrc_review ON public.weekly_review_corporate (review_id);
CREATE INDEX IF NOT EXISTS idx_wrs_review ON public.weekly_review_social (review_id);
CREATE INDEX IF NOT EXISTS idx_wrl_review ON public.weekly_review_loyalty (review_id);
CREATE INDEX IF NOT EXISTS idx_wract_review ON public.weekly_review_actions (review_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_wri_review ON public.weekly_review_incidents (review_id);

DROP TRIGGER IF EXISTS trg_weekly_reviews_updated ON public.weekly_reviews;
CREATE TRIGGER trg_weekly_reviews_updated BEFORE UPDATE ON public.weekly_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_wrd_updated ON public.weekly_review_decisions;
CREATE TRIGGER trg_wrd_updated BEFORE UPDATE ON public.weekly_review_decisions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_wragg_updated ON public.weekly_review_aggregators;
CREATE TRIGGER trg_wragg_updated BEFORE UPDATE ON public.weekly_review_aggregators
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_wrcorp_updated ON public.weekly_review_corporate;
CREATE TRIGGER trg_wrcorp_updated BEFORE UPDATE ON public.weekly_review_corporate
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_wrsoc_updated ON public.weekly_review_social;
CREATE TRIGGER trg_wrsoc_updated BEFORE UPDATE ON public.weekly_review_social
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_wrloy_updated ON public.weekly_review_loyalty;
CREATE TRIGGER trg_wrloy_updated BEFORE UPDATE ON public.weekly_review_loyalty
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_wract_updated ON public.weekly_review_actions;
CREATE TRIGGER trg_wract_updated BEFORE UPDATE ON public.weekly_review_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_wrinc_updated ON public.weekly_review_incidents;
CREATE TRIGGER trg_wrinc_updated BEFORE UPDATE ON public.weekly_review_incidents
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE VIEW public.weekly_review_summary
WITH (security_invoker = true) AS
WITH totals AS (
  SELECT
    r.id AS review_id,
    r.week_start,
    r.week_label,
    COALESCE((SELECT SUM(a.redemptions) FROM public.weekly_review_aggregators a WHERE a.review_id = r.id), 0)::int AS aggregator_redemptions,
    COALESCE((SELECT SUM(c.deals) FROM public.weekly_review_corporate c WHERE c.review_id = r.id), 0)::int AS corporate_deals,
    COALESCE((SELECT COUNT(*) FROM public.weekly_review_decisions d WHERE d.review_id = r.id AND d.outcome = 'pending'), 0)::int AS decisions_pending,
    COALESCE((SELECT COUNT(*) FROM public.weekly_review_actions x WHERE x.review_id = r.id AND x.status <> 'done'), 0)::int AS actions_open,
    COALESCE((SELECT COUNT(*) FROM public.weekly_review_actions x WHERE x.review_id = r.id), 0)::int AS actions_total,
    COALESCE((SELECT COUNT(*) FROM public.weekly_review_incidents i WHERE i.review_id = r.id), 0)::int AS incidents,
    COALESCE((
      SELECT SUM(s.new_reviews_campaign + s.new_reviews_organic)
      FROM public.weekly_review_social s WHERE s.review_id = r.id
    ), 0)::int AS new_reviews
  FROM public.weekly_reviews r
)
SELECT
  t.*,
  LAG(t.aggregator_redemptions) OVER (ORDER BY t.week_start) AS prev_aggregator_redemptions,
  LAG(t.corporate_deals) OVER (ORDER BY t.week_start) AS prev_corporate_deals,
  LAG(t.decisions_pending) OVER (ORDER BY t.week_start) AS prev_decisions_pending,
  LAG(t.actions_open) OVER (ORDER BY t.week_start) AS prev_actions_open,
  LAG(t.actions_total) OVER (ORDER BY t.week_start) AS prev_actions_total,
  LAG(t.incidents) OVER (ORDER BY t.week_start) AS prev_incidents,
  LAG(t.new_reviews) OVER (ORDER BY t.week_start) AS prev_new_reviews
FROM totals t;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_review_decisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_review_aggregators TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_review_corporate TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_review_social TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_review_loyalty TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_review_actions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_review_incidents TO authenticated;
GRANT SELECT ON public.weekly_review_summary TO authenticated;

GRANT ALL ON public.weekly_reviews TO service_role;
GRANT ALL ON public.weekly_review_decisions TO service_role;
GRANT ALL ON public.weekly_review_aggregators TO service_role;
GRANT ALL ON public.weekly_review_corporate TO service_role;
GRANT ALL ON public.weekly_review_social TO service_role;
GRANT ALL ON public.weekly_review_loyalty TO service_role;
GRANT ALL ON public.weekly_review_actions TO service_role;
GRANT ALL ON public.weekly_review_incidents TO service_role;
GRANT ALL ON public.weekly_review_summary TO service_role;

ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_review_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_review_aggregators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_review_corporate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_review_social ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_review_loyalty ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_review_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_review_incidents ENABLE ROW LEVEL SECURITY;

-- Read: HR (55) and above. Write: Admin / Head of Operations (ceo, coo, regional_ops).
CREATE OR REPLACE FUNCTION public.can_edit_weekly_review()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'ceo')
      OR public.has_role(auth.uid(), 'coo')
      OR public.has_role(auth.uid(), 'regional_ops');
$$;

CREATE OR REPLACE FUNCTION public.can_view_weekly_review()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role_level() >= 55
      OR public.can_edit_weekly_review();
$$;

DROP POLICY IF EXISTS "weekly_reviews read" ON public.weekly_reviews;
CREATE POLICY "weekly_reviews read" ON public.weekly_reviews FOR SELECT TO authenticated
  USING (public.can_view_weekly_review());
DROP POLICY IF EXISTS "weekly_reviews write" ON public.weekly_reviews;
CREATE POLICY "weekly_reviews write" ON public.weekly_reviews FOR ALL TO authenticated
  USING (public.can_edit_weekly_review())
  WITH CHECK (public.can_edit_weekly_review());

DROP POLICY IF EXISTS "weekly_review_decisions read" ON public.weekly_review_decisions;
CREATE POLICY "weekly_review_decisions read" ON public.weekly_review_decisions FOR SELECT TO authenticated
  USING (public.can_view_weekly_review());
DROP POLICY IF EXISTS "weekly_review_decisions write" ON public.weekly_review_decisions;
CREATE POLICY "weekly_review_decisions write" ON public.weekly_review_decisions FOR ALL TO authenticated
  USING (public.can_edit_weekly_review())
  WITH CHECK (public.can_edit_weekly_review());

DROP POLICY IF EXISTS "weekly_review_aggregators read" ON public.weekly_review_aggregators;
CREATE POLICY "weekly_review_aggregators read" ON public.weekly_review_aggregators FOR SELECT TO authenticated
  USING (public.can_view_weekly_review());
DROP POLICY IF EXISTS "weekly_review_aggregators write" ON public.weekly_review_aggregators;
CREATE POLICY "weekly_review_aggregators write" ON public.weekly_review_aggregators FOR ALL TO authenticated
  USING (public.can_edit_weekly_review())
  WITH CHECK (public.can_edit_weekly_review());

DROP POLICY IF EXISTS "weekly_review_corporate read" ON public.weekly_review_corporate;
CREATE POLICY "weekly_review_corporate read" ON public.weekly_review_corporate FOR SELECT TO authenticated
  USING (public.can_view_weekly_review());
DROP POLICY IF EXISTS "weekly_review_corporate write" ON public.weekly_review_corporate;
CREATE POLICY "weekly_review_corporate write" ON public.weekly_review_corporate FOR ALL TO authenticated
  USING (public.can_edit_weekly_review())
  WITH CHECK (public.can_edit_weekly_review());

DROP POLICY IF EXISTS "weekly_review_social read" ON public.weekly_review_social;
CREATE POLICY "weekly_review_social read" ON public.weekly_review_social FOR SELECT TO authenticated
  USING (public.can_view_weekly_review());
DROP POLICY IF EXISTS "weekly_review_social write" ON public.weekly_review_social;
CREATE POLICY "weekly_review_social write" ON public.weekly_review_social FOR ALL TO authenticated
  USING (public.can_edit_weekly_review())
  WITH CHECK (public.can_edit_weekly_review());

DROP POLICY IF EXISTS "weekly_review_loyalty read" ON public.weekly_review_loyalty;
CREATE POLICY "weekly_review_loyalty read" ON public.weekly_review_loyalty FOR SELECT TO authenticated
  USING (public.can_view_weekly_review());
DROP POLICY IF EXISTS "weekly_review_loyalty write" ON public.weekly_review_loyalty;
CREATE POLICY "weekly_review_loyalty write" ON public.weekly_review_loyalty FOR ALL TO authenticated
  USING (public.can_edit_weekly_review())
  WITH CHECK (public.can_edit_weekly_review());

DROP POLICY IF EXISTS "weekly_review_actions read" ON public.weekly_review_actions;
CREATE POLICY "weekly_review_actions read" ON public.weekly_review_actions FOR SELECT TO authenticated
  USING (public.can_view_weekly_review());
DROP POLICY IF EXISTS "weekly_review_actions write" ON public.weekly_review_actions;
CREATE POLICY "weekly_review_actions write" ON public.weekly_review_actions FOR ALL TO authenticated
  USING (public.can_edit_weekly_review())
  WITH CHECK (public.can_edit_weekly_review());

DROP POLICY IF EXISTS "weekly_review_incidents read" ON public.weekly_review_incidents;
CREATE POLICY "weekly_review_incidents read" ON public.weekly_review_incidents FOR SELECT TO authenticated
  USING (public.can_view_weekly_review());
DROP POLICY IF EXISTS "weekly_review_incidents write" ON public.weekly_review_incidents;
CREATE POLICY "weekly_review_incidents write" ON public.weekly_review_incidents FOR ALL TO authenticated
  USING (public.can_edit_weekly_review())
  WITH CHECK (public.can_edit_weekly_review());

CREATE OR REPLACE FUNCTION public.create_next_weekly_review()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev public.weekly_reviews%ROWTYPE;
  v_id uuid;
  v_start date;
  v_end date;
  v_meeting date;
  v_label text;
  v_loc uuid;
  v_plat text;
BEGIN
  IF NOT public.can_edit_weekly_review() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_prev FROM public.weekly_reviews ORDER BY week_start DESC LIMIT 1;

  IF v_prev.id IS NULL THEN
    v_start := date_trunc('week', CURRENT_DATE)::date;
  ELSE
    v_start := v_prev.week_start + 7;
  END IF;
  v_end := v_start + 6;
  v_meeting := v_start + 1;
  v_label := 'Week ' || EXTRACT(WEEK FROM v_start)::int;

  SELECT id INTO v_id FROM public.weekly_reviews WHERE week_start = v_start;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.weekly_reviews (
    week_label, week_start, week_end, meeting_date, prepared_by, status
  ) VALUES (
    v_label, v_start, v_end, v_meeting, auth.uid(), 'draft'
  ) RETURNING id INTO v_id;

  IF v_prev.id IS NOT NULL THEN
    INSERT INTO public.weekly_review_actions (
      review_id, venue_text, action, owner, due, status, update_note, carried_from, sort_order
    )
    SELECT v_id, venue_text, action, owner, due, status, NULL, id, sort_order
    FROM public.weekly_review_actions
    WHERE review_id = v_prev.id AND status <> 'done';

    INSERT INTO public.weekly_review_decisions (
      review_id, location_id, venue_text, matter, decision_required, priority, outcome, note, sort_order
    )
    SELECT v_id, location_id, venue_text, matter, decision_required, priority, 'pending', NULL, sort_order
    FROM public.weekly_review_decisions
    WHERE review_id = v_prev.id AND outcome IN ('pending', 'deferred');
  END IF;

  FOR v_loc IN
    SELECT id FROM public.locations WHERE code IN ('INF-CC', 'KDS-CC', 'UA-DM', 'CB-DSM', 'CB-VM')
  LOOP
    FOREACH v_plat IN ARRAY ARRAY['Entertainer', 'Urban Point', 'DealsGo', 'MyBook']
    LOOP
      INSERT INTO public.weekly_review_aggregators (review_id, location_id, platform)
      VALUES (v_id, v_loc, v_plat)
      ON CONFLICT (review_id, location_id, platform) DO NOTHING;
    END LOOP;
  END LOOP;

  FOR v_loc IN
    SELECT id FROM public.locations WHERE code IN ('INF-CC', 'KDS-CC', 'UA-DM')
  LOOP
    INSERT INTO public.weekly_review_social (review_id, location_id)
    VALUES (v_id, v_loc)
    ON CONFLICT (review_id, location_id) DO NOTHING;
    INSERT INTO public.weekly_review_loyalty (review_id, location_id)
    VALUES (v_id, v_loc)
    ON CONFLICT (review_id, location_id) DO NOTHING;
  END LOOP;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_next_weekly_review() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_weekly_review() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_weekly_review() TO authenticated;
