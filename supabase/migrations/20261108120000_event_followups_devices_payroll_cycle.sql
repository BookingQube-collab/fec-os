-- ============================================================
-- Event follow-ups: dedicated event devices + HO payroll_cycle.
-- Additive; sites keep FEC 28–27 unless explicitly overridden.
-- ============================================================

-- ---------- Event biometric device set ----------
CREATE TABLE IF NOT EXISTS public.event_attendance_devices (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.attendance_devices(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (event_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_event_attendance_devices_device
  ON public.event_attendance_devices (device_id);

COMMENT ON TABLE public.event_attendance_devices IS
  'Optional dedicated biometric devices for an event. When present, event attendance process prefers these; else host-site devices.';

ALTER TABLE public.event_attendance_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_attendance_devices_select" ON public.event_attendance_devices;
DROP POLICY IF EXISTS "event_attendance_devices_insert" ON public.event_attendance_devices;
DROP POLICY IF EXISTS "event_attendance_devices_delete" ON public.event_attendance_devices;

CREATE POLICY "event_attendance_devices_select" ON public.event_attendance_devices
  FOR SELECT TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.view'));
CREATE POLICY "event_attendance_devices_insert" ON public.event_attendance_devices
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_attendance_devices_delete" ON public.event_attendance_devices
  FOR DELETE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));

-- ---------- Per-site payroll cycle (HO override stub) ----------
ALTER TABLE public.attendance_site_settings
  ADD COLUMN IF NOT EXISTS payroll_cycle text NOT NULL DEFAULT 'fec_28_27';

ALTER TABLE public.attendance_site_settings
  DROP CONSTRAINT IF EXISTS attendance_site_settings_payroll_cycle_chk;

ALTER TABLE public.attendance_site_settings
  ADD CONSTRAINT attendance_site_settings_payroll_cycle_chk
  CHECK (payroll_cycle IN ('fec_28_27', 'calendar_month'));

COMMENT ON COLUMN public.attendance_site_settings.payroll_cycle IS
  'Additive HO/site cycle. Default fec_28_27 matches company monthly. calendar_month = 1–last for HO-only period windows.';
