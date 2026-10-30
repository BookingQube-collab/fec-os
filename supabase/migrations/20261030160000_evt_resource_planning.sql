-- ============================================================
-- Event PM Phase 5 — Resource & workforce planning (additive)
-- Reuses staff + event_tasks / event_team_members. No duplicate employees.
-- Do NOT apply to production without staging verify.
-- ============================================================

-- Per-staff weekly capacity (hours). Defaults applied in app when missing.
CREATE TABLE IF NOT EXISTS public.event_staff_capacity (
  staff_id uuid PRIMARY KEY REFERENCES public.staff(id) ON DELETE CASCADE,
  weekly_hours numeric(6,1) NOT NULL DEFAULT 40
    CHECK (weekly_hours > 0 AND weekly_hours <= 168),
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.event_staff_capacity IS
  'Modest weekly capacity for event resource planning (Phase 5). Reuses staff — not a second HRMS.';

-- Allocations: staff capacity assigned to an event (optional task), date range + hours and/or %
CREATE TABLE IF NOT EXISTS public.event_resource_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.event_tasks(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  allocated_hours numeric(8,2)
    CHECK (allocated_hours IS NULL OR allocated_hours >= 0),
  allocation_pct numeric(5,2)
    CHECK (allocation_pct IS NULL OR (allocation_pct >= 0 AND allocation_pct <= 100)),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT event_resource_allocations_dates_ok CHECK (end_date >= start_date),
  CONSTRAINT event_resource_allocations_qty_ok CHECK (
    allocated_hours IS NOT NULL OR allocation_pct IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_event_resource_alloc_event
  ON public.event_resource_allocations (event_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_event_resource_alloc_staff
  ON public.event_resource_allocations (staff_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_event_resource_alloc_task
  ON public.event_resource_allocations (task_id)
  WHERE task_id IS NOT NULL;

COMMENT ON TABLE public.event_resource_allocations IS
  'Staff capacity assigned to events/tasks (Phase 5). Not a second employee directory.';

-- Timesheets against events (optional task). Approve rolls into event_tasks.actual_hours.
CREATE TABLE IF NOT EXISTS public.event_timesheet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.event_tasks(id) ON DELETE SET NULL,
  work_date date NOT NULL,
  hours numeric(6,2) NOT NULL
    CHECK (hours > 0 AND hours <= 24),
  note text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_timesheet_event
  ON public.event_timesheet_entries (event_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_event_timesheet_staff
  ON public.event_timesheet_entries (staff_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_event_timesheet_task
  ON public.event_timesheet_entries (task_id)
  WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_timesheet_status
  ON public.event_timesheet_entries (event_id, status);

COMMENT ON TABLE public.event_timesheet_entries IS
  'Event timesheets (Phase 5). Approve adds hours to event_tasks.actual_hours when task_id set.';

-- ---------- RLS ----------
ALTER TABLE public.event_staff_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_resource_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_timesheet_entries ENABLE ROW LEVEL SECURITY;

-- Capacity is staff-keyed (no event_id). Gate on events.view / events.edit capability.
DROP POLICY IF EXISTS "event_staff_capacity_select" ON public.event_staff_capacity;
DROP POLICY IF EXISTS "event_staff_capacity_upsert" ON public.event_staff_capacity;
DROP POLICY IF EXISTS "event_staff_capacity_update" ON public.event_staff_capacity;
DROP POLICY IF EXISTS "event_staff_capacity_delete" ON public.event_staff_capacity;

CREATE POLICY "event_staff_capacity_select" ON public.event_staff_capacity
  FOR SELECT TO authenticated
  USING (public.events_capability_allows('events.view'));
CREATE POLICY "event_staff_capacity_insert" ON public.event_staff_capacity
  FOR INSERT TO authenticated
  WITH CHECK (public.events_capability_allows('events.edit'));
CREATE POLICY "event_staff_capacity_update" ON public.event_staff_capacity
  FOR UPDATE TO authenticated
  USING (public.events_capability_allows('events.edit'))
  WITH CHECK (public.events_capability_allows('events.edit'));
CREATE POLICY "event_staff_capacity_delete" ON public.event_staff_capacity
  FOR DELETE TO authenticated
  USING (public.events_capability_allows('events.edit'));

DROP POLICY IF EXISTS "event_resource_allocations_select" ON public.event_resource_allocations;
DROP POLICY IF EXISTS "event_resource_allocations_insert" ON public.event_resource_allocations;
DROP POLICY IF EXISTS "event_resource_allocations_update" ON public.event_resource_allocations;
DROP POLICY IF EXISTS "event_resource_allocations_delete" ON public.event_resource_allocations;

CREATE POLICY "event_resource_allocations_select" ON public.event_resource_allocations
  FOR SELECT TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.view'));
CREATE POLICY "event_resource_allocations_insert" ON public.event_resource_allocations
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_resource_allocations_update" ON public.event_resource_allocations
  FOR UPDATE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'))
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_resource_allocations_delete" ON public.event_resource_allocations
  FOR DELETE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));

DROP POLICY IF EXISTS "event_timesheet_entries_select" ON public.event_timesheet_entries;
DROP POLICY IF EXISTS "event_timesheet_entries_insert" ON public.event_timesheet_entries;
DROP POLICY IF EXISTS "event_timesheet_entries_update" ON public.event_timesheet_entries;
DROP POLICY IF EXISTS "event_timesheet_entries_delete" ON public.event_timesheet_entries;

CREATE POLICY "event_timesheet_entries_select" ON public.event_timesheet_entries
  FOR SELECT TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.view'));
CREATE POLICY "event_timesheet_entries_insert" ON public.event_timesheet_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_timesheet_entries_update" ON public.event_timesheet_entries
  FOR UPDATE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'))
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_timesheet_entries_delete" ON public.event_timesheet_entries
  FOR DELETE TO authenticated
  USING (
    public.user_can_access_event(event_id)
    AND public.events_capability_allows('events.edit')
    AND status IN ('draft', 'rejected')
  );

-- Same-event integrity: allocation/timesheet task_id must share event_id
CREATE OR REPLACE FUNCTION public.enforce_event_resource_same_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_event uuid;
BEGIN
  IF NEW.task_id IS NOT NULL THEN
    SELECT event_id INTO ref_event FROM public.event_tasks WHERE id = NEW.task_id;
    IF ref_event IS NULL OR ref_event <> NEW.event_id THEN
      RAISE EXCEPTION '% task_id must belong to the same event', TG_TABLE_NAME;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_resource_alloc_same_event ON public.event_resource_allocations;
CREATE TRIGGER trg_event_resource_alloc_same_event
  BEFORE INSERT OR UPDATE OF event_id, task_id ON public.event_resource_allocations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_resource_same_event();

DROP TRIGGER IF EXISTS trg_event_timesheet_same_event ON public.event_timesheet_entries;
CREATE TRIGGER trg_event_timesheet_same_event
  BEFORE INSERT OR UPDATE OF event_id, task_id ON public.event_timesheet_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_resource_same_event();
