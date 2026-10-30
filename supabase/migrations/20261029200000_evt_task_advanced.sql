-- ============================================================
-- Phase 2 — Advanced task management (additive)
-- Attachments, history, reminders log, watchers, saved filters,
-- multi-assignees, recurrence columns on event_tasks.
-- RLS mirrors events_capability_allows + user_can_access_event.
-- Storage paths remain `{event_id}/...` (Phase 0).
-- ============================================================

-- Recurrence + reminder preference on tasks
ALTER TABLE public.event_tasks
  ADD COLUMN IF NOT EXISTS recurrence_freq text
    CHECK (recurrence_freq IS NULL OR recurrence_freq IN ('daily', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS recurrence_interval int NOT NULL DEFAULT 1
    CHECK (recurrence_interval BETWEEN 1 AND 365),
  ADD COLUMN IF NOT EXISTS recurrence_until date,
  ADD COLUMN IF NOT EXISTS recurrence_count int
    CHECK (recurrence_count IS NULL OR recurrence_count BETWEEN 1 AND 500),
  ADD COLUMN IF NOT EXISTS recurrence_source_id uuid REFERENCES public.event_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reminder_days_before int NOT NULL DEFAULT 3
    CHECK (reminder_days_before BETWEEN 0 AND 90);

COMMENT ON COLUMN public.event_tasks.recurrence_freq IS
  'When set, completing the task spawns the next occurrence (Phase 2).';
COMMENT ON COLUMN public.event_tasks.reminder_days_before IS
  'Days before due_date to emit due-soon notifications (Phase 2).';

-- File attachments (storage under event-documents bucket)
CREATE TABLE IF NOT EXISTS public.event_task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.event_tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  content_type text,
  file_size int,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_task_attachments_task
  ON public.event_task_attachments (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_task_attachments_event
  ON public.event_task_attachments (event_id);

-- Append-only task history / activity timeline
CREATE TABLE IF NOT EXISTS public.event_task_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.event_tasks(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  change_type text NOT NULL
    CHECK (change_type IN (
      'created', 'status', 'assignee', 'percent', 'priority',
      'dates', 'watchers', 'attachment', 'bulk', 'recurrence', 'other'
    )),
  field_name text,
  old_value text,
  new_value text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_task_history_task
  ON public.event_task_history (task_id, created_at DESC);

-- Dedup log for due-soon / overdue reminders (no cron required)
CREATE TABLE IF NOT EXISTS public.event_task_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.event_tasks(id) ON DELETE CASCADE,
  reminder_kind text NOT NULL CHECK (reminder_kind IN ('due_soon', 'overdue')),
  due_date date NOT NULL,
  sent_on date NOT NULL DEFAULT (CURRENT_DATE),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, reminder_kind, due_date, sent_on)
);

CREATE INDEX IF NOT EXISTS idx_event_task_reminder_log_event
  ON public.event_task_reminder_log (event_id, sent_on DESC);

-- Watchers: task-level or event-level (task_id null = whole event)
CREATE TABLE IF NOT EXISTS public.event_task_watchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.event_tasks(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, task_id, staff_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_task_watchers_event_staff
  ON public.event_task_watchers (event_id, staff_id)
  WHERE task_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_event_task_watchers_task
  ON public.event_task_watchers (task_id)
  WHERE task_id IS NOT NULL;

-- Per-user saved plan filters
CREATE TABLE IF NOT EXISTS public.event_saved_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_saved_filters_user
  ON public.event_saved_filters (user_id, event_id);

-- Additional assignees (primary mirrored on event_tasks.assignee_staff_id)
CREATE TABLE IF NOT EXISTS public.event_task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.event_tasks(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_event_task_assignees_staff
  ON public.event_task_assignees (staff_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_task_assignees_primary
  ON public.event_task_assignees (task_id)
  WHERE is_primary;

-- ---------- RLS ----------
ALTER TABLE public.event_task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_task_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_task_reminder_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_task_watchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_saved_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_task_assignees ENABLE ROW LEVEL SECURITY;

-- Attachments (event_id keyed)
DROP POLICY IF EXISTS "event_task_attachments_select" ON public.event_task_attachments;
DROP POLICY IF EXISTS "event_task_attachments_insert" ON public.event_task_attachments;
DROP POLICY IF EXISTS "event_task_attachments_update" ON public.event_task_attachments;
DROP POLICY IF EXISTS "event_task_attachments_delete" ON public.event_task_attachments;

CREATE POLICY "event_task_attachments_select" ON public.event_task_attachments
  FOR SELECT TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.view'));
CREATE POLICY "event_task_attachments_insert" ON public.event_task_attachments
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_task_attachments_update" ON public.event_task_attachments
  FOR UPDATE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'))
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_task_attachments_delete" ON public.event_task_attachments
  FOR DELETE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));

-- History: select + insert only (append-only)
DROP POLICY IF EXISTS "event_task_history_select" ON public.event_task_history;
DROP POLICY IF EXISTS "event_task_history_insert" ON public.event_task_history;

CREATE POLICY "event_task_history_select" ON public.event_task_history
  FOR SELECT TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.view'));
CREATE POLICY "event_task_history_insert" ON public.event_task_history
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));

-- Reminder log
DROP POLICY IF EXISTS "event_task_reminder_log_select" ON public.event_task_reminder_log;
DROP POLICY IF EXISTS "event_task_reminder_log_insert" ON public.event_task_reminder_log;

CREATE POLICY "event_task_reminder_log_select" ON public.event_task_reminder_log
  FOR SELECT TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.view'));
CREATE POLICY "event_task_reminder_log_insert" ON public.event_task_reminder_log
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.view'));

-- Watchers
DROP POLICY IF EXISTS "event_task_watchers_select" ON public.event_task_watchers;
DROP POLICY IF EXISTS "event_task_watchers_insert" ON public.event_task_watchers;
DROP POLICY IF EXISTS "event_task_watchers_delete" ON public.event_task_watchers;

CREATE POLICY "event_task_watchers_select" ON public.event_task_watchers
  FOR SELECT TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.view'));
CREATE POLICY "event_task_watchers_insert" ON public.event_task_watchers
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_task_watchers_delete" ON public.event_task_watchers
  FOR DELETE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));

-- Saved filters (owner-only)
DROP POLICY IF EXISTS "event_saved_filters_select" ON public.event_saved_filters;
DROP POLICY IF EXISTS "event_saved_filters_insert" ON public.event_saved_filters;
DROP POLICY IF EXISTS "event_saved_filters_update" ON public.event_saved_filters;
DROP POLICY IF EXISTS "event_saved_filters_delete" ON public.event_saved_filters;

CREATE POLICY "event_saved_filters_select" ON public.event_saved_filters
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "event_saved_filters_insert" ON public.event_saved_filters
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      event_id IS NULL
      OR (
        public.user_can_access_event(event_id)
        AND public.events_capability_allows('events.view')
      )
    )
  );
CREATE POLICY "event_saved_filters_update" ON public.event_saved_filters
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "event_saved_filters_delete" ON public.event_saved_filters
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Assignees (via task → event)
DROP POLICY IF EXISTS "event_task_assignees_select" ON public.event_task_assignees;
DROP POLICY IF EXISTS "event_task_assignees_insert" ON public.event_task_assignees;
DROP POLICY IF EXISTS "event_task_assignees_update" ON public.event_task_assignees;
DROP POLICY IF EXISTS "event_task_assignees_delete" ON public.event_task_assignees;

CREATE POLICY "event_task_assignees_select" ON public.event_task_assignees
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_tasks t
      WHERE t.id = task_id AND public.user_can_access_event(t.event_id)
    )
    AND public.events_capability_allows('events.view')
  );
CREATE POLICY "event_task_assignees_insert" ON public.event_task_assignees
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.event_tasks t
      WHERE t.id = task_id AND public.user_can_access_event(t.event_id)
    )
    AND public.events_capability_allows('events.edit')
  );
CREATE POLICY "event_task_assignees_update" ON public.event_task_assignees
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_tasks t
      WHERE t.id = task_id AND public.user_can_access_event(t.event_id)
    )
    AND public.events_capability_allows('events.edit')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.event_tasks t
      WHERE t.id = task_id AND public.user_can_access_event(t.event_id)
    )
    AND public.events_capability_allows('events.edit')
  );
CREATE POLICY "event_task_assignees_delete" ON public.event_task_assignees
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_tasks t
      WHERE t.id = task_id AND public.user_can_access_event(t.event_id)
    )
    AND public.events_capability_allows('events.edit')
  );

COMMENT ON TABLE public.event_task_attachments IS
  'Task file attachments stored in event-documents under {event_id}/tasks/...';
COMMENT ON TABLE public.event_task_history IS
  'Append-only task change timeline (status/assignee/percent/etc).';
COMMENT ON TABLE public.event_task_reminder_log IS
  'Dedup log for due-soon/overdue task reminders emitted on plan load / upsert.';
COMMENT ON TABLE public.event_task_watchers IS
  'Staff watching a task or entire event for change notifications.';
COMMENT ON TABLE public.event_saved_filters IS
  'Per-user saved filter presets for event plan/register.';
COMMENT ON TABLE public.event_task_assignees IS
  'Additional task assignees; is_primary mirrors event_tasks.assignee_staff_id.';
