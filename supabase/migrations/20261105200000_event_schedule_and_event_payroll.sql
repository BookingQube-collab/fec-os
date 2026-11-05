-- ============================================================
-- Event workforce Phases 3–4: schedule slots, attendance link,
-- event payroll periods (relax monthly unique).
-- ============================================================

-- ---------- Phase 3: event schedule slots ----------
CREATE TABLE IF NOT EXISTS public.event_schedule_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.event_staff_assignments(id) ON DELETE SET NULL,
  work_date date NOT NULL,
  scheduled_in time NOT NULL,
  scheduled_out time NOT NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  role_label text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT event_schedule_slots_times_ok CHECK (scheduled_out > scheduled_in OR scheduled_out < scheduled_in)
);

-- Allow overnight shifts (out < in) OR same-day (out > in); forbid equal.
ALTER TABLE public.event_schedule_slots
  DROP CONSTRAINT IF EXISTS event_schedule_slots_times_ok;
ALTER TABLE public.event_schedule_slots
  ADD CONSTRAINT event_schedule_slots_times_ok CHECK (scheduled_out <> scheduled_in);

CREATE UNIQUE INDEX IF NOT EXISTS event_schedule_slots_event_staff_day_in_uq
  ON public.event_schedule_slots (event_id, staff_id, work_date, scheduled_in);

CREATE INDEX IF NOT EXISTS idx_event_schedule_slots_event_date
  ON public.event_schedule_slots (event_id, work_date);
CREATE INDEX IF NOT EXISTS idx_event_schedule_slots_staff_date
  ON public.event_schedule_slots (staff_id, work_date);

COMMENT ON TABLE public.event_schedule_slots IS
  'Phase 3 event shift schedule (date + in/out). Distinct from monthly attendance_roster_assignments.';

ALTER TABLE public.event_schedule_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_schedule_slots_select" ON public.event_schedule_slots;
DROP POLICY IF EXISTS "event_schedule_slots_insert" ON public.event_schedule_slots;
DROP POLICY IF EXISTS "event_schedule_slots_update" ON public.event_schedule_slots;
DROP POLICY IF EXISTS "event_schedule_slots_delete" ON public.event_schedule_slots;

CREATE POLICY "event_schedule_slots_select" ON public.event_schedule_slots
  FOR SELECT TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.view'));
CREATE POLICY "event_schedule_slots_insert" ON public.event_schedule_slots
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_schedule_slots_update" ON public.event_schedule_slots
  FOR UPDATE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'))
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_schedule_slots_delete" ON public.event_schedule_slots
  FOR DELETE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));

-- ---------- Phase 3: tag daily attendance + punches with event ----------
ALTER TABLE public.attendance_daily_summary
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_daily_summary_event
  ON public.attendance_daily_summary (event_id, work_date)
  WHERE event_id IS NOT NULL;

COMMENT ON COLUMN public.attendance_daily_summary.event_id IS
  'When set, this day is attributed to an event schedule (Phase 3). Monthly roster days stay null.';

ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_logs_event
  ON public.attendance_logs (event_id, punch_at)
  WHERE event_id IS NOT NULL;

-- ---------- Phase 4: event payroll periods ----------
ALTER TABLE public.hr_payroll_periods
  ADD COLUMN IF NOT EXISTS period_kind text NOT NULL DEFAULT 'monthly';

ALTER TABLE public.hr_payroll_periods
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

ALTER TABLE public.hr_payroll_periods
  DROP CONSTRAINT IF EXISTS hr_payroll_periods_period_kind_chk;

ALTER TABLE public.hr_payroll_periods
  ADD CONSTRAINT hr_payroll_periods_period_kind_chk
  CHECK (period_kind IN ('monthly', 'event'));

ALTER TABLE public.hr_payroll_periods
  DROP CONSTRAINT IF EXISTS hr_payroll_periods_event_kind_chk;

ALTER TABLE public.hr_payroll_periods
  ADD CONSTRAINT hr_payroll_periods_event_kind_chk
  CHECK (
    (period_kind = 'monthly' AND event_id IS NULL)
    OR (period_kind = 'event' AND event_id IS NOT NULL)
  );

-- Replace company+month unique with monthly-only partial unique; event unique on event_id.
DROP INDEX IF EXISTS public.hr_payroll_periods_company_month_uq;

CREATE UNIQUE INDEX IF NOT EXISTS hr_payroll_periods_company_month_monthly_uq
  ON public.hr_payroll_periods (COALESCE(company_id::text, ''), month)
  WHERE period_kind = 'monthly';

CREATE UNIQUE INDEX IF NOT EXISTS hr_payroll_periods_company_event_uq
  ON public.hr_payroll_periods (COALESCE(company_id::text, ''), event_id)
  WHERE period_kind = 'event' AND event_id IS NOT NULL;

-- Allow event source stamp
ALTER TABLE public.hr_payroll_periods
  DROP CONSTRAINT IF EXISTS hr_payroll_periods_source_chk;

ALTER TABLE public.hr_payroll_periods
  ADD CONSTRAINT hr_payroll_periods_source_chk
  CHECK (source IN ('generated', 'excel_import', 'mixed', 'event_generated'));

COMMENT ON COLUMN public.hr_payroll_periods.period_kind IS
  'monthly = FEC 28–27 cycle; event = event-specific pay run (Phase 4).';
COMMENT ON COLUMN public.hr_payroll_periods.event_id IS
  'Set when period_kind=event. One event pay period per company+event.';

CREATE INDEX IF NOT EXISTS idx_hr_payroll_periods_kind
  ON public.hr_payroll_periods (period_kind, month DESC);
