-- ============================================================
-- Sprint 2: Legal & compliance calendar
-- ============================================================

CREATE TABLE public.compliance_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  title text NOT NULL,
  event_type text NOT NULL,
  description text,
  due_date date NOT NULL,
  reminder_days int NOT NULL DEFAULT 30,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'upcoming',
  document_id uuid REFERENCES public.compliance_documents(id) ON DELETE SET NULL,
  proof_file_path text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.compliance_recurring_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  title text NOT NULL,
  task_type text NOT NULL,
  recurrence_rule text NOT NULL DEFAULT 'yearly',
  next_due_date date NOT NULL,
  reminder_days int NOT NULL DEFAULT 30,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.compliance_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.compliance_calendar_events(id) ON DELETE CASCADE,
  recurring_task_id uuid REFERENCES public.compliance_recurring_tasks(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  followup_date date NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_events_due ON public.compliance_calendar_events(due_date, status);
CREATE INDEX idx_compliance_events_location ON public.compliance_calendar_events(location_id);
CREATE INDEX idx_compliance_recurring_next ON public.compliance_recurring_tasks(next_due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.compliance_calendar_events, public.compliance_recurring_tasks, public.compliance_followups
TO authenticated;
GRANT ALL ON
  public.compliance_calendar_events, public.compliance_recurring_tasks, public.compliance_followups
TO service_role;

ALTER TABLE public.compliance_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_recurring_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compliance_calendar_events scoped" ON public.compliance_calendar_events FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE POLICY "compliance_recurring_tasks scoped" ON public.compliance_recurring_tasks FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE POLICY "compliance_followups scoped" ON public.compliance_followups FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE TRIGGER trg_compliance_calendar_events_updated BEFORE UPDATE ON public.compliance_calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_compliance_recurring_tasks_updated BEFORE UPDATE ON public.compliance_recurring_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed recurring compliance items for all active locations
INSERT INTO public.compliance_recurring_tasks (location_id, title, task_type, recurrence_rule, next_due_date, reminder_days)
SELECT l.id, v.title, v.task_type, v.recurrence, (CURRENT_DATE + v.offset_days)::date, v.reminder
FROM public.locations l
CROSS JOIN (VALUES
  ('Trade License Renewal', 'trade_license', 'yearly', 90, 60),
  ('Civil Defense Certificate', 'civil_defense', 'yearly', 120, 45),
  ('Fire Alarm Testing', 'fire_alarm', 'quarterly', 30, 14),
  ('Fire Extinguisher Service', 'fire_extinguisher', 'yearly', 60, 30),
  ('Pest Control Service', 'pest_control', 'monthly', 15, 7),
  ('Insurance Renewal', 'insurance', 'yearly', 180, 60),
  ('Mall Approval Renewal', 'mall_approval', 'yearly', 150, 45)
) AS v(title, task_type, recurrence, offset_days, reminder)
WHERE l.status = 'active';
