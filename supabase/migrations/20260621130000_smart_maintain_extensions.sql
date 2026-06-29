-- ============================================================
-- SmartMaintain extensions: utilities, risk, planned notifications, facility
-- ============================================================

CREATE TABLE public.utility_consumption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  utility_type text NOT NULL,
  meter_account_number text,
  period_month date NOT NULL,
  opening_reading numeric(14,3),
  closing_reading numeric(14,3),
  consumption numeric(14,3) GENERATED ALWAYS AS (
    CASE WHEN opening_reading IS NOT NULL AND closing_reading IS NOT NULL
      THEN GREATEST(closing_reading - opening_reading, 0) ELSE NULL END
  ) STORED,
  bill_amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'QAR',
  file_path text,
  file_name text,
  remarks text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, utility_type, period_month)
);

CREATE TABLE public.risk_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  risk_category text NOT NULL,
  description text NOT NULL,
  impact int NOT NULL CHECK (impact BETWEEN 1 AND 5),
  likelihood int NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
  risk_score int GENERATED ALWAYS AS (impact * likelihood) STORED,
  mitigation_action text,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_date date,
  status text NOT NULL DEFAULT 'open',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.planned_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  reminder_type text NOT NULL,
  title text NOT NULL,
  body text,
  source_type text,
  source_id uuid,
  due_date date NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.facility_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  due_date date,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_utility_location_month ON public.utility_consumption(location_id, period_month DESC);
CREATE INDEX idx_risk_register_location ON public.risk_register(location_id);
CREATE INDEX idx_risk_register_score ON public.risk_register(risk_score DESC);
CREATE INDEX idx_planned_notifications_due ON public.planned_notifications(due_date, status);
CREATE INDEX idx_facility_tasks_location ON public.facility_tasks(location_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.utility_consumption, public.risk_register, public.planned_notifications, public.facility_tasks
TO authenticated;
GRANT ALL ON
  public.utility_consumption, public.risk_register, public.planned_notifications, public.facility_tasks
TO service_role;

ALTER TABLE public.utility_consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planned_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "utility_consumption scoped" ON public.utility_consumption FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE POLICY "risk_register scoped" ON public.risk_register FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE POLICY "planned_notifications read" ON public.planned_notifications FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid() OR public.current_user_role_level() >= 70);

CREATE POLICY "planned_notifications write" ON public.planned_notifications FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 60)
  WITH CHECK (public.current_user_role_level() >= 60);

CREATE POLICY "facility_tasks scoped" ON public.facility_tasks FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE TRIGGER trg_utility_consumption_updated BEFORE UPDATE ON public.utility_consumption
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_risk_register_updated BEFORE UPDATE ON public.risk_register
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_planned_notifications_updated BEFORE UPDATE ON public.planned_notifications
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_facility_tasks_updated BEFORE UPDATE ON public.facility_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('utility-bills', 'utility-bills', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "utility_bills read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'utility-bills');
CREATE POLICY "utility_bills insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'utility-bills');

-- Seed utility readings (4 sites, current + prior month)
DO $$
DECLARE
  loc_inf uuid; loc_kds uuid; loc_ua uuid; loc_kds_dm uuid;
  m0 date := date_trunc('month', CURRENT_DATE)::date;
  m1 date := (date_trunc('month', CURRENT_DATE) - interval '1 month')::date;
BEGIN
  SELECT id INTO loc_inf FROM locations WHERE code = 'INF-CC';
  SELECT id INTO loc_kds FROM locations WHERE code = 'KDS-CC';
  SELECT id INTO loc_ua FROM locations WHERE code = 'UA-DM';
  SELECT id INTO loc_kds_dm FROM locations WHERE code = 'KDS-DM';
  IF loc_inf IS NULL THEN RETURN; END IF;

  INSERT INTO utility_consumption (location_id, utility_type, meter_account_number, period_month, opening_reading, closing_reading, bill_amount, remarks) VALUES
    (loc_inf, 'electricity', 'KAH-CC-EL-001', m1, 12500, 13280, 4200, 'City Center mall meter'),
    (loc_inf, 'electricity', 'KAH-CC-EL-001', m0, 13280, 14120, 4500, NULL),
    (loc_inf, 'water', 'KAH-CC-WT-001', m0, 820, 890, 680, NULL),
    (loc_kds, 'electricity', 'KDS-CC-EL-001', m0, 5400, 5890, 2100, NULL),
    (loc_ua, 'electricity', 'UA-DM-EL-001', m0, 9800, 10450, 3800, 'Doha Mall supply'),
    (loc_ua, 'internet', 'UA-DM-NET-01', m0, NULL, NULL, 1200, 'Fiber 500Mbps'),
    (loc_kds_dm, 'electricity', 'KDS-DM-EL-001', m0, 3100, 3420, 1350, NULL),
    (loc_kds_dm, 'gas', 'N/A', m0, NULL, NULL, 400, 'Generator fuel allocation')
  ON CONFLICT (location_id, utility_type, period_month) DO NOTHING;

  INSERT INTO risk_register (location_id, risk_category, description, impact, likelihood, mitigation_action, status, target_date) VALUES
    (loc_inf, 'fire_safety', 'Fire panel communication fault during peak hours', 5, 2, 'AMC vendor SLA review + backup panel test', 'open', CURRENT_DATE + 30),
    (loc_kds, 'operational', 'Driving school vehicle brake wear on high-traffic days', 4, 3, 'Weekly inspection checklist + spare parts stock', 'in_progress', CURRENT_DATE + 14),
    (loc_ua, 'customer_safety', 'Trampoline net clip failure risk', 5, 2, 'Daily pre-open safety walk + vendor audit', 'open', CURRENT_DATE + 7),
    (loc_kds_dm, 'compliance', 'Trade license renewal documentation incomplete', 3, 4, 'Legal team follow-up with municipality', 'open', CURRENT_DATE + 45)
  ON CONFLICT DO NOTHING;

  INSERT INTO facility_tasks (location_id, category, title, description, priority, status, due_date) VALUES
    (loc_inf, 'cleaning', 'Deep clean inflatables zone', 'Post-weekend deep clean', 'normal', 'open', CURRENT_DATE + 2),
    (loc_inf, 'fire_systems', 'Fire extinguisher monthly check', 'All zones', 'high', 'open', CURRENT_DATE + 5),
    (loc_kds, 'site_readiness', 'Opening readiness checklist', 'Vehicles + track inspection', 'high', 'in_progress', CURRENT_DATE),
    (loc_ua, 'hvac', 'HVAC filter replacement', 'Arena zone filters', 'normal', 'open', CURRENT_DATE + 7),
    (loc_kds_dm, 'mall_approvals', 'Mall NOC for weekend promotion', 'Submit to mall management', 'urgent', 'open', CURRENT_DATE + 3)
  ON CONFLICT DO NOTHING;
END $$;
