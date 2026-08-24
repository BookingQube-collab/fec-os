-- ============================================================
-- Attendance consolidation & HR reporting
-- Extends ZKTeco-ready attendance tables with import batches,
-- biometric user mapping, configurable shifts/rules, corrections,
-- and encrypted original-file storage.
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_can_access_attendance(_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND (
        role_level >= 80
        OR role IN ('hr', 'auditor')
        OR _location_id = ANY (location_ids)
      )
  );
$$;

-- Existing attendance policies: HR/auditor can combine all sites
DROP POLICY IF EXISTS "attendance_devices scoped" ON public.attendance_devices;
CREATE POLICY "attendance_devices scoped" ON public.attendance_devices FOR ALL TO authenticated
  USING (public.user_can_access_attendance(location_id))
  WITH CHECK (public.user_can_access_attendance(location_id));

DROP POLICY IF EXISTS "attendance_logs scoped" ON public.attendance_logs;
CREATE POLICY "attendance_logs scoped" ON public.attendance_logs FOR ALL TO authenticated
  USING (public.user_can_access_attendance(location_id))
  WITH CHECK (public.user_can_access_attendance(location_id));

DROP POLICY IF EXISTS "attendance_daily_summary scoped" ON public.attendance_daily_summary;
CREATE POLICY "attendance_daily_summary scoped" ON public.attendance_daily_summary FOR ALL TO authenticated
  USING (public.user_can_access_attendance(location_id))
  WITH CHECK (public.user_can_access_attendance(location_id));

DROP POLICY IF EXISTS "attendance_exceptions scoped" ON public.attendance_exceptions;
CREATE POLICY "attendance_exceptions scoped" ON public.attendance_exceptions FOR ALL TO authenticated
  USING (public.user_can_access_attendance(location_id))
  WITH CHECK (public.user_can_access_attendance(location_id));

DROP POLICY IF EXISTS "attendance_sync_jobs scoped" ON public.attendance_sync_jobs;
CREATE POLICY "attendance_sync_jobs scoped" ON public.attendance_sync_jobs FOR ALL TO authenticated
  USING (location_id IS NULL OR public.user_can_access_attendance(location_id))
  WITH CHECK (location_id IS NULL OR public.user_can_access_attendance(location_id));

-- ------------------------------------------------------------
-- Companies
-- ------------------------------------------------------------
CREATE TABLE public.hr_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.hr_companies (code, name)
VALUES ('E3', 'Events & Entertainment Enterprises E3')
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------
-- Site attendance settings (locations remain the site master)
-- ------------------------------------------------------------
CREATE TABLE public.attendance_site_settings (
  location_id uuid PRIMARY KEY REFERENCES public.locations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.hr_companies(id) ON DELETE RESTRICT,
  attendance_enabled boolean NOT NULL DEFAULT true,
  timezone text NOT NULL DEFAULT 'Asia/Qatar',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.attendance_site_settings (location_id, company_id, attendance_enabled)
SELECT l.id, c.id, true
FROM public.locations l
CROSS JOIN public.hr_companies c
WHERE c.code = 'E3'
  AND l.status = 'active'
ON CONFLICT (location_id) DO NOTHING;

-- ------------------------------------------------------------
-- Extend devices / punches / daily rows
-- ------------------------------------------------------------
ALTER TABLE public.attendance_devices
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Qatar',
  ADD COLUMN IF NOT EXISTS last_user_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS connection_mode text NOT NULL DEFAULT 'file',
  ADD COLUMN IF NOT EXISTS sync_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.hr_companies(id) ON DELETE SET NULL;

UPDATE public.attendance_devices d
SET company_id = s.company_id
FROM public.attendance_site_settings s
WHERE s.location_id = d.location_id
  AND d.company_id IS NULL;

ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS punch_hash text,
  ADD COLUMN IF NOT EXISTS import_id uuid,
  ADD COLUMN IF NOT EXISTS verify_method int,
  ADD COLUMN IF NOT EXISTS in_out_status int,
  ADD COLUMN IF NOT EXISTS work_code int,
  ADD COLUMN IF NOT EXISTS reserved_field text,
  ADD COLUMN IF NOT EXISTS probable_duplicate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excluded_from_calc boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attendance_date date,
  ADD COLUMN IF NOT EXISTS device_user_name text,
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.hr_companies(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_logs_punch_hash
  ON public.attendance_logs (punch_hash)
  WHERE punch_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_logs_device_user_time
  ON public.attendance_logs (device_id, biometric_user_id, punch_at);

ALTER TABLE public.attendance_daily_summary
  ADD COLUMN IF NOT EXISTS punch_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS raw_punch_times jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS worked_minutes int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS regular_minutes int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exception_reason text,
  ADD COLUMN IF NOT EXISTS hr_remarks text,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS biometric_user_id text,
  ADD COLUMN IF NOT EXISTS device_id uuid REFERENCES public.attendance_devices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.hr_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shift_template_id uuid,
  ADD COLUMN IF NOT EXISTS status_flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS subject_key text;

UPDATE public.attendance_daily_summary
SET subject_key = CASE
  WHEN staff_id IS NOT NULL THEN 'staff:' || staff_id::text
  ELSE 'unmapped:' || id::text
END
WHERE subject_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_daily_subject
  ON public.attendance_daily_summary (location_id, subject_key, work_date)
  WHERE subject_key IS NOT NULL;

-- ------------------------------------------------------------
-- Shift templates & rules
-- ------------------------------------------------------------
CREATE TABLE public.attendance_shift_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.hr_companies(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  overnight boolean NOT NULL DEFAULT false,
  grace_minutes int NOT NULL DEFAULT 10,
  break_minutes int NOT NULL DEFAULT 0,
  min_work_minutes int NOT NULL DEFAULT 480,
  overtime_after_minutes int NOT NULL DEFAULT 480,
  early_in_window_minutes int NOT NULL DEFAULT 120,
  late_out_window_minutes int NOT NULL DEFAULT 180,
  day_cutoff_time time NOT NULL DEFAULT '06:00',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.attendance_rule_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'global',
  company_id uuid REFERENCES public.hr_companies(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  duplicate_window_seconds int NOT NULL DEFAULT 60,
  file_retention_days int NOT NULL DEFAULT 365,
  max_upload_bytes int NOT NULL DEFAULT 20971520,
  auto_map_employee_code boolean NOT NULL DEFAULT false,
  absent_requires_roster boolean NOT NULL DEFAULT true,
  odd_punches_need_review boolean NOT NULL DEFAULT true,
  extra_punches_need_review boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'Asia/Qatar',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_rule_sets_scope_chk CHECK (scope IN ('global', 'company', 'location'))
);

INSERT INTO public.attendance_rule_sets (scope, duplicate_window_seconds)
SELECT 'global', 60
WHERE NOT EXISTS (SELECT 1 FROM public.attendance_rule_sets WHERE scope = 'global');

INSERT INTO public.attendance_shift_templates (
  company_id, name, start_time, end_time, overnight, grace_minutes, break_minutes,
  min_work_minutes, overtime_after_minutes
)
SELECT c.id, x.name, x.start_time::time, x.end_time::time, x.overnight, 10, 60, 480, 480
FROM public.hr_companies c
CROSS JOIN (
  VALUES
    ('Morning', '08:00', '17:00', false),
    ('Evening', '14:00', '23:00', false),
    ('Night', '22:00', '07:00', true)
) AS x(name, start_time, end_time, overnight)
WHERE c.code = 'E3'
  AND NOT EXISTS (
    SELECT 1 FROM public.attendance_shift_templates t
    WHERE t.company_id = c.id AND t.name = x.name AND t.location_id IS NULL
  );

-- ------------------------------------------------------------
-- Biometric users (never match user id alone across the company)
-- ------------------------------------------------------------
CREATE TABLE public.attendance_biometric_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.hr_companies(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.attendance_devices(id) ON DELETE CASCADE,
  biometric_user_id text NOT NULL,
  device_name text,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  employee_code text,
  full_name text,
  department text,
  job_title text,
  employment_status text NOT NULL DEFAULT 'unknown',
  mapped_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  mapped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, location_id, device_id, biometric_user_id)
);

CREATE INDEX IF NOT EXISTS idx_att_bio_users_staff
  ON public.attendance_biometric_users (staff_id)
  WHERE staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_att_bio_users_unmapped
  ON public.attendance_biometric_users (location_id)
  WHERE staff_id IS NULL;

-- ------------------------------------------------------------
-- Roster, holidays, leave
-- ------------------------------------------------------------
CREATE TABLE public.attendance_roster_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  shift_template_id uuid REFERENCES public.attendance_shift_templates(id) ON DELETE SET NULL,
  is_week_off boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, work_date)
);

CREATE TABLE public.attendance_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.hr_companies(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.attendance_leave_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_date date NOT NULL,
  leave_type text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, leave_date)
);

-- ------------------------------------------------------------
-- Imports, files, errors
-- ------------------------------------------------------------
CREATE TABLE public.attendance_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.hr_companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'preview',
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  date_from date,
  date_to date,
  file_count int NOT NULL DEFAULT 0,
  row_count int NOT NULL DEFAULT 0,
  imported_count int NOT NULL DEFAULT 0,
  duplicate_count int NOT NULL DEFAULT 0,
  rejected_count int NOT NULL DEFAULT 0,
  unmatched_count int NOT NULL DEFAULT 0,
  error_message text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT attendance_imports_status_chk CHECK (
    status IN ('preview', 'queued', 'processing', 'completed', 'partial', 'failed', 'cancelled')
  )
);

CREATE TABLE public.attendance_import_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.attendance_imports(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.attendance_devices(id) ON DELETE CASCADE,
  original_filename text NOT NULL,
  file_type text NOT NULL,
  file_hash text NOT NULL,
  storage_path text,
  encrypted boolean NOT NULL DEFAULT true,
  byte_size int NOT NULL DEFAULT 0,
  row_count int NOT NULL DEFAULT 0,
  imported_count int NOT NULL DEFAULT 0,
  duplicate_count int NOT NULL DEFAULT 0,
  rejected_count int NOT NULL DEFAULT 0,
  unmatched_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'preview',
  error_message text,
  preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  retention_until date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_att_import_files_hash
  ON public.attendance_import_files (file_hash);

ALTER TABLE public.attendance_logs
  ADD CONSTRAINT attendance_logs_import_fk
  FOREIGN KEY (import_id) REFERENCES public.attendance_imports(id) ON DELETE SET NULL;

CREATE TABLE public.attendance_import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.attendance_imports(id) ON DELETE CASCADE,
  file_id uuid REFERENCES public.attendance_import_files(id) ON DELETE CASCADE,
  row_number int,
  code text NOT NULL,
  message text NOT NULL,
  raw_row jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Corrections (never overwrite raw punches)
-- ------------------------------------------------------------
CREATE TABLE public.attendance_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  work_date date,
  summary_id uuid REFERENCES public.attendance_daily_summary(id) ON DELETE SET NULL,
  punch_id uuid REFERENCES public.attendance_logs(id) ON DELETE SET NULL,
  kind text NOT NULL,
  original_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL,
  attachment_path text,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  CONSTRAINT attendance_corrections_kind_chk CHECK (
    kind IN (
      'add_punch', 'edit_in', 'edit_out', 'mark_leave', 'mark_holiday',
      'mark_week_off', 'approve_overtime', 'ignore_duplicate', 'map_user'
    )
  ),
  CONSTRAINT attendance_corrections_status_chk CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_att_corrections_pending
  ON public.attendance_corrections (status, location_id)
  WHERE status = 'pending';

-- ------------------------------------------------------------
-- Audit
-- ------------------------------------------------------------
CREATE TABLE public.attendance_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_att_audit_created
  ON public.attendance_audit_events (created_at DESC);

-- ------------------------------------------------------------
-- Seed default ZKTeco devices for known FEC sites
-- ------------------------------------------------------------
INSERT INTO public.attendance_devices (location_id, device_code, device_name, vendor, company_id, timezone)
SELECT l.id, 'ZK-1', 'ZKTeco Device 1', 'zkteco', s.company_id, 'Asia/Qatar'
FROM public.locations l
JOIN public.attendance_site_settings s ON s.location_id = l.id
WHERE l.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.attendance_devices d
    WHERE d.location_id = l.id AND d.device_code = 'ZK-1'
  );

-- ------------------------------------------------------------
-- Grants, RLS, triggers
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.hr_companies,
  public.attendance_site_settings,
  public.attendance_shift_templates,
  public.attendance_rule_sets,
  public.attendance_biometric_users,
  public.attendance_roster_assignments,
  public.attendance_holidays,
  public.attendance_leave_records,
  public.attendance_imports,
  public.attendance_import_files,
  public.attendance_import_errors,
  public.attendance_corrections,
  public.attendance_audit_events
TO authenticated;

GRANT ALL ON
  public.hr_companies,
  public.attendance_site_settings,
  public.attendance_shift_templates,
  public.attendance_rule_sets,
  public.attendance_biometric_users,
  public.attendance_roster_assignments,
  public.attendance_holidays,
  public.attendance_leave_records,
  public.attendance_imports,
  public.attendance_import_files,
  public.attendance_import_errors,
  public.attendance_corrections,
  public.attendance_audit_events
TO service_role;

ALTER TABLE public.hr_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_shift_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_rule_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_biometric_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_roster_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_leave_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_import_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_companies read" ON public.hr_companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "hr_companies write" ON public.hr_companies FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

CREATE POLICY "attendance_site_settings scoped" ON public.attendance_site_settings FOR ALL TO authenticated
  USING (public.user_can_access_attendance(location_id))
  WITH CHECK (public.user_can_access_attendance(location_id));

CREATE POLICY "attendance_shift_templates scoped" ON public.attendance_shift_templates FOR ALL TO authenticated
  USING (location_id IS NULL OR public.user_can_access_attendance(location_id))
  WITH CHECK (location_id IS NULL OR public.user_can_access_attendance(location_id));

CREATE POLICY "attendance_rule_sets scoped" ON public.attendance_rule_sets FOR ALL TO authenticated
  USING (location_id IS NULL OR public.user_can_access_attendance(location_id))
  WITH CHECK (location_id IS NULL OR public.user_can_access_attendance(location_id));

CREATE POLICY "attendance_biometric_users scoped" ON public.attendance_biometric_users FOR ALL TO authenticated
  USING (public.user_can_access_attendance(location_id))
  WITH CHECK (public.user_can_access_attendance(location_id));

CREATE POLICY "attendance_roster_assignments scoped" ON public.attendance_roster_assignments FOR ALL TO authenticated
  USING (public.user_can_access_attendance(location_id))
  WITH CHECK (public.user_can_access_attendance(location_id));

CREATE POLICY "attendance_holidays scoped" ON public.attendance_holidays FOR ALL TO authenticated
  USING (location_id IS NULL OR public.user_can_access_attendance(location_id))
  WITH CHECK (location_id IS NULL OR public.user_can_access_attendance(location_id));

CREATE POLICY "attendance_leave_records scoped" ON public.attendance_leave_records FOR ALL TO authenticated
  USING (public.user_can_access_attendance(location_id))
  WITH CHECK (public.user_can_access_attendance(location_id));

CREATE POLICY "attendance_imports read" ON public.attendance_imports FOR SELECT TO authenticated USING (true);
CREATE POLICY "attendance_imports write" ON public.attendance_imports FOR ALL TO authenticated
  USING (uploaded_by = auth.uid() OR public.current_user_role_level() >= 55)
  WITH CHECK (uploaded_by = auth.uid() OR public.current_user_role_level() >= 55);

CREATE POLICY "attendance_import_files scoped" ON public.attendance_import_files FOR ALL TO authenticated
  USING (public.user_can_access_attendance(location_id))
  WITH CHECK (public.user_can_access_attendance(location_id));

CREATE POLICY "attendance_import_errors read" ON public.attendance_import_errors FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.attendance_import_files f
      WHERE f.id = file_id AND public.user_can_access_attendance(f.location_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.attendance_imports i
      WHERE i.id = import_id AND (i.uploaded_by = auth.uid() OR public.current_user_role_level() >= 55)
    )
  );

CREATE POLICY "attendance_import_errors write" ON public.attendance_import_errors FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "attendance_corrections scoped" ON public.attendance_corrections FOR ALL TO authenticated
  USING (public.user_can_access_attendance(location_id))
  WITH CHECK (public.user_can_access_attendance(location_id));

CREATE POLICY "attendance_audit_events read" ON public.attendance_audit_events FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_access_attendance(location_id));

CREATE POLICY "attendance_audit_events insert" ON public.attendance_audit_events FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE TRIGGER trg_hr_companies_updated BEFORE UPDATE ON public.hr_companies
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_attendance_site_settings_updated BEFORE UPDATE ON public.attendance_site_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_attendance_shift_templates_updated BEFORE UPDATE ON public.attendance_shift_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_attendance_rule_sets_updated BEFORE UPDATE ON public.attendance_rule_sets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_attendance_biometric_users_updated BEFORE UPDATE ON public.attendance_biometric_users
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Encrypted original files (application layer also AES-GCM encrypts bytes)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attendance-imports',
  'attendance-imports',
  false,
  20971520,
  ARRAY[
    'application/octet-stream',
    'text/plain',
    'text/csv',
    'text/tab-separated-values',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "attendance_imports_storage_read" ON storage.objects;
CREATE POLICY "attendance_imports_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'attendance-imports');

DROP POLICY IF EXISTS "attendance_imports_storage_insert" ON storage.objects;
CREATE POLICY "attendance_imports_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attendance-imports');

DROP POLICY IF EXISTS "attendance_imports_storage_delete" ON storage.objects;
CREATE POLICY "attendance_imports_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'attendance-imports' AND public.current_user_role_level() >= 55);
