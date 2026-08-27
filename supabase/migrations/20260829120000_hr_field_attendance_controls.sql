-- Field & attendance controls: geofences, GPS check-ins, face enrollment, HR rules.
-- Safe to re-run. Does not change ZKTeco punch mapping or attendance listing keys.

CREATE TABLE IF NOT EXISTS public.hr_field_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.hr_companies(id) ON DELETE CASCADE,
  default_geofence_radius_meters int NOT NULL DEFAULT 200,
  notify_missed_punch boolean NOT NULL DEFAULT true,
  notify_late boolean NOT NULL DEFAULT true,
  notify_geofence_exit boolean NOT NULL DEFAULT true,
  notify_corrections boolean NOT NULL DEFAULT true,
  require_gps_on_checkin boolean NOT NULL DEFAULT true,
  require_face_on_checkin boolean NOT NULL DEFAULT false,
  face_liveness_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

INSERT INTO public.hr_field_settings (company_id)
SELECT c.id
FROM public.hr_companies c
WHERE c.code = 'E3'
  AND NOT EXISTS (
    SELECT 1 FROM public.hr_field_settings s WHERE s.company_id = c.id
  );

CREATE TABLE IF NOT EXISTS public.attendance_geofences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL UNIQUE REFERENCES public.locations(id) ON DELETE CASCADE,
  name text NOT NULL,
  latitude numeric(10, 7) NOT NULL,
  longitude numeric(10, 7) NOT NULL,
  radius_meters int NOT NULL DEFAULT 200,
  mode text NOT NULL DEFAULT 'operate',
  active boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_geofences_mode_chk CHECK (mode IN ('operate', 'restrict')),
  CONSTRAINT attendance_geofences_radius_chk CHECK (radius_meters BETWEEN 20 AND 20000)
);

INSERT INTO public.attendance_geofences (location_id, name, latitude, longitude, radius_meters, mode, active)
SELECT l.id, l.name, v.lat, v.lng, 200, 'operate', false
FROM public.locations l
JOIN (
  VALUES
    ('INF-CC', 25.3244000, 51.5310000),
    ('KDS-CC', 25.3244000, 51.5310000),
    ('UA-DM', 25.2615000, 51.4968000),
    ('KDS-DM', 25.2615000, 51.4968000),
    ('CB-VM', 25.4172000, 51.5308000),
    ('WM-VM', 25.4172000, 51.5308000),
    ('CB-DSM', 25.2342000, 51.4338000),
    ('CAR-AP', 25.2632000, 51.4485000)
) AS v(code, lat, lng) ON v.code = l.code
ON CONFLICT (location_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.staff_location_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  geofence_id uuid REFERENCES public.attendance_geofences(id) ON DELETE SET NULL,
  latitude numeric(10, 7) NOT NULL,
  longitude numeric(10, 7) NOT NULL,
  accuracy_meters numeric(8, 2),
  inside_geofence boolean,
  distance_meters int,
  event_type text NOT NULL DEFAULT 'check_in',
  client_event_id text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'web',
  queued_offline boolean NOT NULL DEFAULT false,
  face_liveness_passed boolean,
  face_status text NOT NULL DEFAULT 'not_required',
  photo_path text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_location_events_type_chk CHECK (event_type IN ('check_in', 'check_out', 'ping', 'geofence_exit', 'restricted')),
  CONSTRAINT staff_location_events_face_chk CHECK (face_status IN ('not_required', 'captured', 'liveness_failed', 'enrolled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_location_events_client
  ON public.staff_location_events (client_event_id)
  WHERE client_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_location_events_staff_time
  ON public.staff_location_events (staff_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_staff_location_events_location_time
  ON public.staff_location_events (location_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS public.staff_face_enrollments (
  staff_id uuid PRIMARY KEY REFERENCES public.staff(id) ON DELETE CASCADE,
  storage_path text,
  status text NOT NULL DEFAULT 'enrolled',
  liveness_passed boolean NOT NULL DEFAULT false,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  enrolled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_face_enrollments_status_chk CHECK (status IN ('enrolled', 'revoked'))
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'staff-faces',
  'staff-faces',
  false,
  1048576,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.hr_field_settings,
  public.attendance_geofences,
  public.staff_location_events,
  public.staff_face_enrollments
TO authenticated;

GRANT ALL ON
  public.hr_field_settings,
  public.attendance_geofences,
  public.staff_location_events,
  public.staff_face_enrollments
TO service_role;

ALTER TABLE public.hr_field_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_location_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_face_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_field_settings read" ON public.hr_field_settings;
CREATE POLICY "hr_field_settings read" ON public.hr_field_settings FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 20);

DROP POLICY IF EXISTS "hr_field_settings write" ON public.hr_field_settings;
CREATE POLICY "hr_field_settings write" ON public.hr_field_settings FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "attendance_geofences scoped" ON public.attendance_geofences;
CREATE POLICY "attendance_geofences scoped" ON public.attendance_geofences FOR ALL TO authenticated
  USING (public.user_can_access_attendance(location_id))
  WITH CHECK (public.user_can_access_attendance(location_id));

DROP POLICY IF EXISTS "staff_location_events scoped" ON public.staff_location_events;
CREATE POLICY "staff_location_events scoped" ON public.staff_location_events FOR ALL TO authenticated
  USING (
    public.user_can_access_attendance(location_id)
    OR EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND s.user_id = auth.uid())
  )
  WITH CHECK (
    public.user_can_access_attendance(location_id)
    OR EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND s.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "staff_face_enrollments scoped" ON public.staff_face_enrollments;
CREATE POLICY "staff_face_enrollments scoped" ON public.staff_face_enrollments FOR ALL TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND s.user_id = auth.uid())
  )
  WITH CHECK (
    public.current_user_role_level() >= 55
    OR EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND s.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "staff_faces_storage_read" ON storage.objects;
CREATE POLICY "staff_faces_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'staff-faces');

DROP POLICY IF EXISTS "staff_faces_storage_insert" ON storage.objects;
CREATE POLICY "staff_faces_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'staff-faces');

DROP POLICY IF EXISTS "staff_faces_storage_delete" ON storage.objects;
CREATE POLICY "staff_faces_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'staff-faces' AND public.current_user_role_level() >= 55);

DROP TRIGGER IF EXISTS trg_hr_field_settings_updated ON public.hr_field_settings;
CREATE TRIGGER trg_hr_field_settings_updated BEFORE UPDATE ON public.hr_field_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_attendance_geofences_updated ON public.attendance_geofences;
CREATE TRIGGER trg_attendance_geofences_updated BEFORE UPDATE ON public.attendance_geofences
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_staff_face_enrollments_updated ON public.staff_face_enrollments;
CREATE TRIGGER trg_staff_face_enrollments_updated BEFORE UPDATE ON public.staff_face_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
