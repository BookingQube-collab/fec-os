-- ============================================================
-- Sprint 2: Attendance automation (ZKTeco-ready)
-- ============================================================

CREATE TABLE public.attendance_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  device_code text NOT NULL,
  device_name text NOT NULL,
  vendor text NOT NULL DEFAULT 'zkteco',
  ip_address text,
  serial_number text,
  active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, device_code)
);

CREATE TABLE public.attendance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.attendance_devices(id) ON DELETE SET NULL,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  biometric_user_id text,
  punch_at timestamptz NOT NULL,
  punch_type text NOT NULL DEFAULT 'in',
  source text NOT NULL DEFAULT 'device',
  raw_payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_attendance_logs_location_date ON public.attendance_logs(location_id, punch_at);
CREATE INDEX idx_attendance_logs_staff ON public.attendance_logs(staff_id);
CREATE INDEX idx_attendance_logs_biometric ON public.attendance_logs(biometric_user_id);

CREATE TABLE public.attendance_daily_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  work_date date NOT NULL,
  shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  scheduled_in timestamptz,
  scheduled_out timestamptz,
  actual_in timestamptz,
  actual_out timestamptz,
  status text NOT NULL DEFAULT 'present',
  late_minutes int NOT NULL DEFAULT 0,
  early_leave_minutes int NOT NULL DEFAULT 0,
  overtime_minutes int NOT NULL DEFAULT 0,
  missed_punch boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, staff_id, work_date)
);

CREATE TABLE public.attendance_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id uuid NOT NULL REFERENCES public.attendance_daily_summary(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  exception_type text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  correction_in timestamptz,
  correction_out timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.attendance_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid REFERENCES public.attendance_devices(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  records_received int NOT NULL DEFAULT 0,
  records_processed int NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.attendance_devices, public.attendance_logs, public.attendance_daily_summary,
  public.attendance_exceptions, public.attendance_sync_jobs
TO authenticated;
GRANT ALL ON
  public.attendance_devices, public.attendance_logs, public.attendance_daily_summary,
  public.attendance_exceptions, public.attendance_sync_jobs
TO service_role;

ALTER TABLE public.attendance_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_daily_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_devices scoped" ON public.attendance_devices FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE POLICY "attendance_logs scoped" ON public.attendance_logs FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE POLICY "attendance_daily_summary scoped" ON public.attendance_daily_summary FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE POLICY "attendance_exceptions scoped" ON public.attendance_exceptions FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE POLICY "attendance_sync_jobs scoped" ON public.attendance_sync_jobs FOR ALL TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id))
  WITH CHECK (location_id IS NULL OR public.user_can_access_location(location_id));

CREATE TRIGGER trg_attendance_devices_updated BEFORE UPDATE ON public.attendance_devices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_attendance_daily_summary_updated BEFORE UPDATE ON public.attendance_daily_summary
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_attendance_exceptions_updated BEFORE UPDATE ON public.attendance_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
