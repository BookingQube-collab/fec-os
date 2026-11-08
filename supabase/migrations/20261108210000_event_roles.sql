-- ============================================================
-- Event roles master data (shift vs labour) — additive.
-- Roles are defined per event (seeded at create; editable on setup).
-- Staffing assigns into these roles; Crew schedule chips use them.
-- Labour roles: day charge + hours-in-day (no traditional shift module).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'shift'
    CHECK (kind IN ('shift', 'labour')),
  default_hours_per_day numeric(6,2) NOT NULL DEFAULT 10
    CHECK (default_hours_per_day >= 1 AND default_hours_per_day <= 24),
  default_day_rate_qar numeric(12,2)
    CHECK (default_day_rate_qar IS NULL OR default_day_rate_qar >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT event_roles_code_ok CHECK (char_length(trim(code)) >= 1),
  CONSTRAINT event_roles_name_ok CHECK (char_length(trim(name)) >= 1),
  CONSTRAINT event_roles_event_code_uq UNIQUE (event_id, code)
);

CREATE INDEX IF NOT EXISTS idx_event_roles_event
  ON public.event_roles (event_id, sort_order, name);

COMMENT ON TABLE public.event_roles IS
  'Per-event crew role catalog. kind=shift → date+start/end roster; kind=labour → day charge + hours (no shift module).';
COMMENT ON COLUMN public.event_roles.default_hours_per_day IS
  'Labour baseline hours in a day for payroll: (hours_worked / hours_in_day) × day charge. Shift roles keep default 10 unused.';
COMMENT ON COLUMN public.event_roles.default_day_rate_qar IS
  'Optional default per-day labour charge (QAR). Assignments may override.';

ALTER TABLE public.event_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_roles_select" ON public.event_roles;
DROP POLICY IF EXISTS "event_roles_insert" ON public.event_roles;
DROP POLICY IF EXISTS "event_roles_update" ON public.event_roles;
DROP POLICY IF EXISTS "event_roles_delete" ON public.event_roles;

CREATE POLICY "event_roles_select" ON public.event_roles
  FOR SELECT TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.view'));
CREATE POLICY "event_roles_insert" ON public.event_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_roles_update" ON public.event_roles
  FOR UPDATE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'))
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_roles_delete" ON public.event_roles
  FOR DELETE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));

-- Link assignments / schedule slots to event roles; labour charge overrides.
ALTER TABLE public.event_staff_assignments
  ADD COLUMN IF NOT EXISTS event_role_id uuid REFERENCES public.event_roles(id) ON DELETE SET NULL;

ALTER TABLE public.event_staff_assignments
  ADD COLUMN IF NOT EXISTS hours_per_day numeric(6,2)
    CHECK (hours_per_day IS NULL OR (hours_per_day >= 1 AND hours_per_day <= 24));

ALTER TABLE public.event_staff_assignments
  ADD COLUMN IF NOT EXISTS day_rate_qar numeric(12,2)
    CHECK (day_rate_qar IS NULL OR day_rate_qar >= 0);

CREATE INDEX IF NOT EXISTS idx_event_staff_assignments_role
  ON public.event_staff_assignments (event_role_id)
  WHERE event_role_id IS NOT NULL;

COMMENT ON COLUMN public.event_staff_assignments.event_role_id IS
  'Optional FK to event_roles. role_label remains denormalized for display / legacy.';
COMMENT ON COLUMN public.event_staff_assignments.hours_per_day IS
  'Labour hours-in-day override (else event_roles.default_hours_per_day, else 10).';
COMMENT ON COLUMN public.event_staff_assignments.day_rate_qar IS
  'Labour per-day charge override (else event_roles.default_day_rate_qar, else staff compensation).';

ALTER TABLE public.event_schedule_slots
  ADD COLUMN IF NOT EXISTS event_role_id uuid REFERENCES public.event_roles(id) ON DELETE SET NULL;

ALTER TABLE public.event_schedule_slots
  ADD COLUMN IF NOT EXISTS hours_per_day numeric(6,2)
    CHECK (hours_per_day IS NULL OR (hours_per_day >= 1 AND hours_per_day <= 24));

ALTER TABLE public.event_schedule_slots
  ADD COLUMN IF NOT EXISTS day_rate_qar numeric(12,2)
    CHECK (day_rate_qar IS NULL OR day_rate_qar >= 0);

CREATE INDEX IF NOT EXISTS idx_event_schedule_slots_role
  ON public.event_schedule_slots (event_role_id)
  WHERE event_role_id IS NOT NULL;

-- Seed default roles for existing events that have none yet.
INSERT INTO public.event_roles (
  event_id, code, name, kind, default_hours_per_day, default_day_rate_qar, sort_order, is_active
)
SELECT
  e.id,
  d.code,
  d.name,
  d.kind,
  d.hours,
  NULL,
  d.sort_order,
  true
FROM public.events e
CROSS JOIN (
  VALUES
    ('crew', 'Crew', 'shift', 10::numeric, 0),
    ('cleaner', 'Cleaner', 'labour', 10::numeric, 1),
    ('maintenance', 'Maintenance Team', 'labour', 10::numeric, 2),
    ('management', 'Management Team', 'shift', 10::numeric, 3),
    ('labour', 'Labour', 'labour', 10::numeric, 4)
) AS d(code, name, kind, hours, sort_order)
WHERE e.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.event_roles r WHERE r.event_id = e.id
  );
