-- Head Office Leave Planner (Excel E3 Leave Planner → FEC).
-- Rules + planner events for HO blackouts / dept quotas / overall cap.
-- Emergency leave may override DECLINE; stamp override columns on the request.

-- ---------------------------------------------------------------------------
-- Rules (single active HO row seeded below)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_leave_planner_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'ho' CHECK (scope = 'ho'),
  activation_rule_set text NOT NULL DEFAULT 'as_stated'
    CHECK (activation_rule_set IN ('as_stated', 'lighter')),
  major_before_days int NOT NULL DEFAULT 40 CHECK (major_before_days >= 0 AND major_before_days <= 120),
  major_after_days int NOT NULL DEFAULT 10 CHECK (major_after_days >= 0 AND major_after_days <= 60),
  activation_before_as_stated int NOT NULL DEFAULT 20 CHECK (activation_before_as_stated >= 0 AND activation_before_as_stated <= 120),
  activation_after_as_stated int NOT NULL DEFAULT 5 CHECK (activation_after_as_stated >= 0 AND activation_after_as_stated <= 60),
  activation_before_lighter int NOT NULL DEFAULT 15 CHECK (activation_before_lighter >= 0 AND activation_before_lighter <= 120),
  activation_after_lighter int NOT NULL DEFAULT 3 CHECK (activation_after_lighter >= 0 AND activation_after_lighter <= 60),
  overall_max_away int NOT NULL DEFAULT 27 CHECK (overall_max_away >= 1 AND overall_max_away <= 500),
  max_away_per_department int NOT NULL DEFAULT 2 CHECK (max_away_per_department >= 1 AND max_away_per_department <= 50),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT hr_leave_planner_rules_scope_uq UNIQUE (scope)
);

COMMENT ON TABLE public.hr_leave_planner_rules IS
  'HO leave planner parameters (blackout lead/trail, dept quota, overall cap). Mirrors E3 Leave Planner Rules sheet.';

DROP TRIGGER IF EXISTS trg_hr_leave_planner_rules_updated ON public.hr_leave_planner_rules;
CREATE TRIGGER trg_hr_leave_planner_rules_updated
  BEFORE UPDATE ON public.hr_leave_planner_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.hr_leave_planner_rules (
  scope,
  activation_rule_set,
  major_before_days,
  major_after_days,
  activation_before_as_stated,
  activation_after_as_stated,
  activation_before_lighter,
  activation_after_lighter,
  overall_max_away,
  max_away_per_department
)
VALUES ('ho', 'as_stated', 40, 10, 20, 5, 15, 3, 27, 2)
ON CONFLICT (scope) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Planner events (Major / Activation calendar — not FEC ops events)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_leave_planner_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('major', 'activation')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  basis text,
  linked_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT hr_leave_planner_events_dates_chk CHECK (end_date >= start_date),
  CONSTRAINT hr_leave_planner_events_name_ok CHECK (char_length(trim(name)) >= 1)
);

CREATE INDEX IF NOT EXISTS idx_hr_leave_planner_events_dates
  ON public.hr_leave_planner_events (start_date, end_date)
  WHERE active;

COMMENT ON TABLE public.hr_leave_planner_events IS
  'HO leave blackout source events (Major/Activation). Blackout windows are derived from rules, not stored.';

DROP TRIGGER IF EXISTS trg_hr_leave_planner_events_updated ON public.hr_leave_planner_events;
CREATE TRIGGER trg_hr_leave_planner_events_updated
  BEFORE UPDATE ON public.hr_leave_planner_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed from E3 Leave Planner Events sheet (Assumed dates kept as basis notes).
INSERT INTO public.hr_leave_planner_events (name, event_type, start_date, end_date, basis)
SELECT v.name, v.event_type, v.start_date::date, v.end_date::date, v.basis
FROM (
  VALUES
    ('Lego Shows Qatar (Place Vendome)', 'major', '2026-12-16', '2026-12-31', 'Confirmed'),
    ('Rixos National Day', 'activation', '2026-12-18', '2026-12-18', 'Assumed date'),
    ('Qanat Quartier Evenings', 'major', '2027-01-11', '2027-01-24', 'Assumed dates (January 2027, TBC)'),
    ('National Sports Day activation', 'activation', '2027-02-09', '2027-02-09', 'Assumed (second Tuesday of February)'),
    ('Eid Al Adha celebration', 'major', '2027-05-16', '2027-05-20', 'Assumed (about 16 May 2027)'),
    ('Hala Summer 2027', 'major', '2027-08-01', '2027-08-14', 'Assumed; subject to Visit Qatar award'),
    ('Year-end major', 'major', '2027-12-16', '2027-12-31', 'Assumed repeat of 2026'),
    ('National Day 2027 activation', 'activation', '2027-12-18', '2027-12-18', 'Assumed')
) AS v(name, event_type, start_date, end_date, basis)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_leave_planner_events e
  WHERE e.name = v.name AND e.start_date = v.start_date::date
);

-- ---------------------------------------------------------------------------
-- Stamp emergency planner overrides on leave requests
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_leave_requests
  ADD COLUMN IF NOT EXISTS planner_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS planner_override_reasons text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.hr_leave_requests.planner_override IS
  'True when emergency leave was submitted despite HO planner DECLINE (blackout / quota / cap).';
COMMENT ON COLUMN public.hr_leave_requests.planner_override_reasons IS
  'Human-readable DECLINE reasons that were overridden by emergency leave.';

CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_planner_override
  ON public.hr_leave_requests (planner_override)
  WHERE planner_override;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_leave_planner_rules TO authenticated;
GRANT ALL ON public.hr_leave_planner_rules TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_leave_planner_events TO authenticated;
GRANT ALL ON public.hr_leave_planner_events TO service_role;

ALTER TABLE public.hr_leave_planner_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leave_planner_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_leave_planner_rules read" ON public.hr_leave_planner_rules;
CREATE POLICY "hr_leave_planner_rules read" ON public.hr_leave_planner_rules
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "hr_leave_planner_rules write" ON public.hr_leave_planner_rules;
CREATE POLICY "hr_leave_planner_rules write" ON public.hr_leave_planner_rules
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "hr_leave_planner_events read" ON public.hr_leave_planner_events;
CREATE POLICY "hr_leave_planner_events read" ON public.hr_leave_planner_events
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "hr_leave_planner_events write" ON public.hr_leave_planner_events;
CREATE POLICY "hr_leave_planner_events write" ON public.hr_leave_planner_events
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);
