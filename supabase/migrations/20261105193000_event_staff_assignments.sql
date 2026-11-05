-- ============================================================
-- Event workforce Phase 2 — operational crew assignments (additive)
-- Distinct from event_team_members (PM/coordination) and
-- event_resource_allocations (Phase 5 planning hours).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  assignment_type text NOT NULL
    CHECK (assignment_type IN ('labour', 'loaned', 'event_hire')),
  role_label text NOT NULL DEFAULT 'crew',
  date_from date NOT NULL,
  date_to date NOT NULL,
  pay_on_event_run boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT event_staff_assignments_dates_ok CHECK (date_to >= date_from)
);

CREATE INDEX IF NOT EXISTS idx_event_staff_assignments_event
  ON public.event_staff_assignments (event_id, date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_event_staff_assignments_staff
  ON public.event_staff_assignments (staff_id, date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_event_staff_assignments_type
  ON public.event_staff_assignments (event_id, assignment_type);

COMMENT ON TABLE public.event_staff_assignments IS
  'Operational event crew (labour / loaned / event-only hire) with date ranges. Not PM team (event_team_members) and not Phase 5 resource allocations.';
COMMENT ON COLUMN public.event_staff_assignments.pay_on_event_run IS
  'When true, include this person on a future event pay run for days in range (Phase 4). Default true.';
COMMENT ON COLUMN public.event_staff_assignments.notes IS
  'Optional pay-source / assignment notes. Home employment for loaned staff is unchanged.';

ALTER TABLE public.event_staff_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_staff_assignments_select" ON public.event_staff_assignments;
DROP POLICY IF EXISTS "event_staff_assignments_insert" ON public.event_staff_assignments;
DROP POLICY IF EXISTS "event_staff_assignments_update" ON public.event_staff_assignments;
DROP POLICY IF EXISTS "event_staff_assignments_delete" ON public.event_staff_assignments;

CREATE POLICY "event_staff_assignments_select" ON public.event_staff_assignments
  FOR SELECT TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.view'));
CREATE POLICY "event_staff_assignments_insert" ON public.event_staff_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_staff_assignments_update" ON public.event_staff_assignments
  FOR UPDATE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'))
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_staff_assignments_delete" ON public.event_staff_assignments
  FOR DELETE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));

-- Seed "Event crew" readiness for existing events (new creates use DEFAULT_READINESS_ITEMS).
INSERT INTO public.event_readiness_items (
  event_id, code, title, category, is_required, is_complete, weight, phase_code
)
SELECT
  e.id,
  'event_crew',
  'Event crew assigned',
  'manpower',
  true,
  EXISTS (
    SELECT 1 FROM public.event_staff_assignments a WHERE a.event_id = e.id
  ),
  8,
  'staffing'
FROM public.events e
WHERE e.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.event_readiness_items r
    WHERE r.event_id = e.id AND r.code = 'event_crew'
  );
