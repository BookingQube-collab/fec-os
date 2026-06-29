-- Daily Operations roster: staff-linked shifts + upload audit trail

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shifts_staff_id ON public.shifts (staff_id);
CREATE INDEX IF NOT EXISTS idx_shifts_location_starts_staff
  ON public.shifts (location_id, starts_at DESC, staff_id);

-- Backfill staff_id from employee_code hash where possible
UPDATE public.shifts s
SET staff_id = st.id
FROM public.staff st
WHERE s.staff_id IS NULL
  AND st.deleted_at IS NULL
  AND st.location_id = s.location_id
  AND st.user_id IS NOT NULL
  AND st.user_id = s.user_id;

CREATE TABLE IF NOT EXISTS public.daily_ops_roster_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text,
  file_type text NOT NULL DEFAULT 'csv',
  period_start date,
  period_end date,
  rows_imported int NOT NULL DEFAULT 0 CHECK (rows_imported >= 0),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_ops_roster_uploads_location
  ON public.daily_ops_roster_uploads (location_id, created_at DESC);

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS roster_upload_id uuid
    REFERENCES public.daily_ops_roster_uploads(id) ON DELETE SET NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_ops_roster_uploads TO authenticated;
GRANT ALL ON public.daily_ops_roster_uploads TO service_role;

ALTER TABLE public.daily_ops_roster_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_ops_roster_uploads scoped" ON public.daily_ops_roster_uploads;
CREATE POLICY "daily_ops_roster_uploads scoped" ON public.daily_ops_roster_uploads
  FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'daily-ops-rosters',
  'daily-ops-rosters',
  false,
  5242880,
  ARRAY['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "daily-ops-rosters read" ON storage.objects;
CREATE POLICY "daily-ops-rosters read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'daily-ops-rosters');

DROP POLICY IF EXISTS "daily-ops-rosters write" ON storage.objects;
CREATE POLICY "daily-ops-rosters write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'daily-ops-rosters');
