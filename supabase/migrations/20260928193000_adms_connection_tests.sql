-- ADMS connection diagnostics. The terminal still initiates every request.
-- CHECK is queued beside adms_pending_cmd so a test cannot replace a punch fetch.

ALTER TABLE public.attendance_devices
  ADD COLUMN IF NOT EXISTS last_adms_endpoint text,
  ADD COLUMN IF NOT EXISTS last_adms_source_ip text,
  ADD COLUMN IF NOT EXISTS last_adms_pushver text,
  ADD COLUMN IF NOT EXISTS adms_diag_cmd_id integer NOT NULL DEFAULT 1000000000;

COMMENT ON COLUMN public.attendance_devices.last_adms_endpoint IS
  'Last iClock path this serial called, e.g. cdata or getrequest.';
COMMENT ON COLUMN public.attendance_devices.last_adms_source_ip IS
  'Source IP of the last ADMS request. Used only to compare unknown serials.';
COMMENT ON COLUMN public.attendance_devices.last_adms_pushver IS
  'pushver query value from the last ADMS request, when the terminal sent one.';
COMMENT ON COLUMN public.attendance_devices.adms_diag_cmd_id IS
  'Command id space for connection-test CHECK. Starts at 1000000000 so it cannot collide with fetch ids.';

CREATE TABLE IF NOT EXISTS public.attendance_adms_connection_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.attendance_devices (id) ON DELETE CASCADE,
  location_id uuid NOT NULL,
  serial_number text,
  status text NOT NULL DEFAULT 'queued',
  diagnosis text,
  command_id integer,
  command_body text,
  queued_at timestamptz,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  round_trip_ms integer,
  result_code integer,
  timeout_ms integer NOT NULL DEFAULT 30000,
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_contact_at timestamptz,
  last_endpoint text,
  last_source_ip text,
  pushver text,
  contact_class text,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT attendance_adms_connection_tests_status_chk
    CHECK (status IN ('queued', 'running', 'passed', 'failed', 'timed_out')),
  CONSTRAINT attendance_adms_connection_tests_command_chk
    CHECK (command_body IS NULL OR command_body = 'CHECK')
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_adms_connection_tests_one_active
  ON public.attendance_adms_connection_tests (device_id)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS attendance_adms_connection_tests_device_created
  ON public.attendance_adms_connection_tests (device_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.attendance_adms_diagnostic_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid,
  location_id uuid,
  serial_number text,
  test_id uuid REFERENCES public.attendance_adms_connection_tests (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  endpoint text,
  command_id integer,
  result text,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_adms_diagnostic_events_test_created
  ON public.attendance_adms_diagnostic_events (test_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.attendance_adms_unknown_serials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number text NOT NULL,
  source_ip text,
  endpoint text,
  seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_adms_unknown_serials_ip_seen
  ON public.attendance_adms_unknown_serials (source_ip, seen_at DESC);

COMMENT ON TABLE public.attendance_adms_connection_tests IS
  'One ADMS CHECK round-trip per device. The browser polls status; the handler does not block.';
COMMENT ON TABLE public.attendance_adms_diagnostic_events IS
  'Connection-test timeline. Do not store comm keys or credentials.';
COMMENT ON TABLE public.attendance_adms_unknown_serials IS
  'Serials rejected by the ADMS allowlist. Compared with a device source IP before SERIAL_MISMATCH.';

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.attendance_adms_connection_tests,
  public.attendance_adms_diagnostic_events
TO authenticated;

GRANT ALL ON
  public.attendance_adms_connection_tests,
  public.attendance_adms_diagnostic_events,
  public.attendance_adms_unknown_serials
TO service_role;

ALTER TABLE public.attendance_adms_connection_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_adms_diagnostic_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_adms_unknown_serials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_adms_connection_tests scoped"
  ON public.attendance_adms_connection_tests
  FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE POLICY "attendance_adms_diagnostic_events scoped"
  ON public.attendance_adms_diagnostic_events
  FOR ALL TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id))
  WITH CHECK (location_id IS NULL OR public.user_can_access_location(location_id));

DROP TRIGGER IF EXISTS trg_attendance_adms_connection_tests_updated ON public.attendance_adms_connection_tests;
CREATE TRIGGER trg_attendance_adms_connection_tests_updated
  BEFORE UPDATE ON public.attendance_adms_connection_tests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
