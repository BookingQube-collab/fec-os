-- ============================================================
-- Event Project Management — Phase 3
-- WBS depth, advanced tasks, unique task IDs, milestone links,
-- richer schedule baseline snapshots. Does not rebuild Phase 2.
-- ============================================================

-- ---------- Task number sequence (TSK-YYYY-NNNN) ----------
CREATE SEQUENCE IF NOT EXISTS public.tsk_number_seq START WITH 1 INCREMENT BY 1;

ALTER TABLE public.evt_settings
  ADD COLUMN IF NOT EXISTS tsk_prefix text NOT NULL DEFAULT 'TSK',
  ADD COLUMN IF NOT EXISTS tsk_pad int NOT NULL DEFAULT 4;

CREATE OR REPLACE FUNCTION public.next_tsk_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  n bigint;
  prefix text;
  pad int;
BEGIN
  SELECT COALESCE(tsk_prefix, 'TSK'), COALESCE(tsk_pad, 4)
    INTO prefix, pad
    FROM public.evt_settings
    WHERE id = 1;
  IF prefix IS NULL THEN
    prefix := 'TSK';
    pad := 4;
  END IF;
  n := nextval('public.tsk_number_seq');
  RETURN prefix || '-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(n::text, pad, '0');
END;
$$;

GRANT USAGE, SELECT ON SEQUENCE public.tsk_number_seq TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_tsk_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_tsk_number() TO service_role;

-- ---------- WBS: 4 practical levels + node facts ----------
ALTER TABLE public.event_wbs_nodes DROP CONSTRAINT IF EXISTS event_wbs_nodes_node_type_check;
ALTER TABLE public.event_wbs_nodes
  ADD CONSTRAINT event_wbs_nodes_node_type_check
  CHECK (node_type IN ('phase', 'workstream', 'task', 'subtask'));

ALTER TABLE public.event_wbs_nodes
  ADD COLUMN IF NOT EXISTS owner_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS budget_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS percent_complete int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_wbs_nodes_pct_check'
  ) THEN
    ALTER TABLE public.event_wbs_nodes
      ADD CONSTRAINT event_wbs_nodes_pct_check CHECK (percent_complete BETWEEN 0 AND 100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_event_wbs_parent ON public.event_wbs_nodes (parent_id)
  WHERE deleted_at IS NULL;

-- ---------- Tasks: IDs, people, hours, checklist, comments ----------
ALTER TABLE public.event_tasks DROP CONSTRAINT IF EXISTS event_tasks_status_check;
ALTER TABLE public.event_tasks
  ADD CONSTRAINT event_tasks_status_check
  CHECK (status IN (
    'not_started', 'planned', 'in_progress', 'waiting',
    'blocked', 'under_review', 'completed', 'cancelled'
  ));

ALTER TABLE public.event_tasks DROP CONSTRAINT IF EXISTS event_tasks_priority_check;
ALTER TABLE public.event_tasks
  ADD CONSTRAINT event_tasks_priority_check
  CHECK (priority IN ('low', 'normal', 'high', 'urgent', 'critical'));

ALTER TABLE public.event_tasks
  ADD COLUMN IF NOT EXISTS task_number text,
  ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES public.event_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignee_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.master_departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duration_days int,
  ADD COLUMN IF NOT EXISTS estimated_hours numeric(8,2),
  ADD COLUMN IF NOT EXISTS actual_hours numeric(8,2),
  ADD COLUMN IF NOT EXISTS estimated_cost numeric(14,2),
  ADD COLUMN IF NOT EXISTS actual_cost numeric(14,2),
  ADD COLUMN IF NOT EXISTS is_milestone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS comments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.event_tasks
SET task_number = 'TSK-' || to_char(COALESCE(created_at, now()), 'YYYY') || '-' ||
  lpad(nextval('public.tsk_number_seq')::text, 4, '0')
WHERE task_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_tasks_number_unique
  ON public.event_tasks (task_number)
  WHERE task_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_tasks_parent ON public.event_tasks (parent_task_id)
  WHERE deleted_at IS NULL AND parent_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_tasks_assignee ON public.event_tasks (assignee_staff_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_tasks_dept ON public.event_tasks (department_id)
  WHERE deleted_at IS NULL;

-- ---------- Milestones: owner + WBS/task link ----------
ALTER TABLE public.event_milestones
  ADD COLUMN IF NOT EXISTS owner_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wbs_id uuid REFERENCES public.event_wbs_nodes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.event_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text;

CREATE INDEX IF NOT EXISTS idx_event_milestones_wbs ON public.event_milestones (wbs_id)
  WHERE wbs_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_milestones_task ON public.event_milestones (task_id)
  WHERE task_id IS NOT NULL;
