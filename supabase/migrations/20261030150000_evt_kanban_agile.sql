-- ============================================================
-- Event PM Phase 4 — Kanban & thin Agile overlay (additive)
-- Reuses event_tasks. No duplicate task system.
-- Do NOT apply to production without staging verify.
-- ============================================================

-- Lightweight sprints (optional overlay on existing tasks)
CREATE TABLE IF NOT EXISTS public.event_sprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  goal text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT event_sprints_dates_ok CHECK (
    start_date IS NULL OR end_date IS NULL OR end_date >= start_date
  )
);

CREATE INDEX IF NOT EXISTS idx_event_sprints_event
  ON public.event_sprints (event_id, status, start_date);

COMMENT ON TABLE public.event_sprints IS
  'Thin sprint overlay for event Kanban/Scrum board (Phase 4). Not a full Scrum suite.';

-- Story points + sprint assignment on existing tasks
ALTER TABLE public.event_tasks
  ADD COLUMN IF NOT EXISTS story_points numeric(6,1)
    CHECK (story_points IS NULL OR story_points >= 0),
  ADD COLUMN IF NOT EXISTS sprint_id uuid REFERENCES public.event_sprints(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_event_tasks_sprint
  ON public.event_tasks (sprint_id)
  WHERE deleted_at IS NULL AND sprint_id IS NOT NULL;

COMMENT ON COLUMN public.event_tasks.story_points IS
  'Optional lightweight story points for burndown/velocity (Phase 4).';
COMMENT ON COLUMN public.event_tasks.sprint_id IS
  'Optional sprint assignment; null = backlog (Phase 4).';

-- ---------- RLS ----------
ALTER TABLE public.event_sprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_sprints_select" ON public.event_sprints;
DROP POLICY IF EXISTS "event_sprints_insert" ON public.event_sprints;
DROP POLICY IF EXISTS "event_sprints_update" ON public.event_sprints;
DROP POLICY IF EXISTS "event_sprints_delete" ON public.event_sprints;

CREATE POLICY "event_sprints_select" ON public.event_sprints
  FOR SELECT TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.view'));
CREATE POLICY "event_sprints_insert" ON public.event_sprints
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_sprints_update" ON public.event_sprints
  FOR UPDATE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'))
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_sprints_delete" ON public.event_sprints
  FOR DELETE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));

-- Cross-event integrity: task.sprint_id must share event_id
CREATE OR REPLACE FUNCTION public.enforce_event_task_same_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_event uuid;
BEGIN
  IF NEW.wbs_id IS NOT NULL THEN
    SELECT event_id INTO ref_event FROM public.event_wbs_nodes WHERE id = NEW.wbs_id;
    IF ref_event IS NULL OR ref_event <> NEW.event_id THEN
      RAISE EXCEPTION 'event_tasks.wbs_id must belong to the same event';
    END IF;
  END IF;
  IF NEW.parent_task_id IS NOT NULL THEN
    SELECT event_id INTO ref_event FROM public.event_tasks WHERE id = NEW.parent_task_id;
    IF ref_event IS NULL OR ref_event <> NEW.event_id THEN
      RAISE EXCEPTION 'event_tasks.parent_task_id must belong to the same event';
    END IF;
  END IF;
  IF NEW.sprint_id IS NOT NULL THEN
    SELECT event_id INTO ref_event FROM public.event_sprints WHERE id = NEW.sprint_id;
    IF ref_event IS NULL OR ref_event <> NEW.event_id THEN
      RAISE EXCEPTION 'event_tasks.sprint_id must belong to the same event';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_task_same_event ON public.event_tasks;
CREATE TRIGGER trg_event_task_same_event
  BEFORE INSERT OR UPDATE OF event_id, wbs_id, parent_task_id, sprint_id ON public.event_tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_task_same_event();
