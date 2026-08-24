-- Temporary API hit logs for external attendance ingest (POST /api/public/attendance-ingest)

CREATE TABLE public.attendance_ingest_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  log_api_hits boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.attendance_ingest_settings (id, log_api_hits) VALUES (true, true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.attendance_ingest_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  called_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}',
  record_count int NOT NULL DEFAULT 0,
  imported_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  response_summary jsonb NOT NULL DEFAULT '{}',
  source_ip text,
  location_codes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_attendance_ingest_hits_called_at ON public.attendance_ingest_hits (called_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_ingest_settings, public.attendance_ingest_hits TO authenticated;
GRANT ALL ON public.attendance_ingest_settings, public.attendance_ingest_hits TO service_role;

ALTER TABLE public.attendance_ingest_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_ingest_hits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_ingest_settings_read" ON public.attendance_ingest_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "attendance_ingest_settings_write" ON public.attendance_ingest_settings
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

CREATE POLICY "attendance_ingest_hits_read" ON public.attendance_ingest_hits
  FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 55);

CREATE POLICY "attendance_ingest_hits_delete" ON public.attendance_ingest_hits
  FOR DELETE TO authenticated
  USING (public.current_user_role_level() >= 55);
