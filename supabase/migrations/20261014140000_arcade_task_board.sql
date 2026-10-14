-- Technician task board. Cards reference a fault, PM schedule, or inspection.
-- They do not copy those records.

CREATE TABLE public.arcade_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  technician_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  machine_id uuid REFERENCES public.arcade_machines(id) ON DELETE SET NULL,
  title text NOT NULL,
  kind text NOT NULL,
  span text NOT NULL DEFAULT 'DAY',
  due_on date NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  estimated_minutes int,
  actual_minutes int,
  status text NOT NULL DEFAULT 'TODO',
  depends_on_id uuid REFERENCES public.arcade_tasks(id) ON DELETE SET NULL,
  source_type text,
  source_id uuid,
  evidence text,
  verification text NOT NULL DEFAULT 'NONE',
  verified_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  verified_at timestamptz,
  verification_note text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_tasks_title_check CHECK (char_length(title) BETWEEN 2 AND 200),
  CONSTRAINT arcade_tasks_kind_check CHECK (kind IN ('REPAIR', 'PM', 'INSPECTION', 'ASSIGNMENT')),
  CONSTRAINT arcade_tasks_span_check CHECK (span IN ('DAY', 'WEEK')),
  CONSTRAINT arcade_tasks_priority_check CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  CONSTRAINT arcade_tasks_status_check CHECK (status IN ('TODO', 'STARTED', 'PAUSED', 'DONE')),
  CONSTRAINT arcade_tasks_source_check CHECK (
    source_type IS NULL OR source_type IN ('fault', 'pm_schedule', 'observation')
  ),
  CONSTRAINT arcade_tasks_source_pair_check CHECK (
    (source_type IS NULL AND source_id IS NULL) OR (source_type IS NOT NULL AND source_id IS NOT NULL)
  ),
  CONSTRAINT arcade_tasks_verification_check CHECK (verification IN ('NONE', 'PENDING', 'APPROVED', 'RETURNED')),
  CONSTRAINT arcade_tasks_minutes_check CHECK (
    (estimated_minutes IS NULL OR (estimated_minutes >= 0 AND estimated_minutes <= 10080))
    AND (actual_minutes IS NULL OR (actual_minutes >= 0 AND actual_minutes <= 10080))
  ),
  CONSTRAINT arcade_tasks_no_self_depend CHECK (depends_on_id IS DISTINCT FROM id)
);

CREATE UNIQUE INDEX arcade_tasks_source_due_uidx
  ON public.arcade_tasks (source_type, source_id, due_on)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

CREATE INDEX arcade_tasks_tech_due_idx ON public.arcade_tasks (technician_staff_id, due_on);
CREATE INDEX arcade_tasks_due_idx ON public.arcade_tasks (due_on);
CREATE INDEX arcade_tasks_depends_idx ON public.arcade_tasks (depends_on_id);

GRANT SELECT, INSERT, UPDATE ON public.arcade_tasks TO authenticated;
GRANT ALL ON public.arcade_tasks TO service_role;

ALTER TABLE public.arcade_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY arcade_tasks_read ON public.arcade_tasks FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id));
CREATE POLICY arcade_tasks_insert ON public.arcade_tasks FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 30);
CREATE POLICY arcade_tasks_update ON public.arcade_tasks FOR UPDATE TO authenticated
  USING (public.current_user_role_level() >= 30)
  WITH CHECK (public.current_user_role_level() >= 30);

CREATE TRIGGER trg_arcade_tasks_updated BEFORE UPDATE ON public.arcade_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE public.arcade_tasks IS
  'Technician planning cards. source_type and source_id point at a fault, PM schedule, or observation. Repair and maintenance rows stay on those tables.';
