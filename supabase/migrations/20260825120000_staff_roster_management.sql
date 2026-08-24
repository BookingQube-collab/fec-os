-- Employee Roster Management: extend public.staff, isolate compensation,
-- import batches (not attendance_imports), transfers, and salary RLS.

-- ------------------------------------------------------------
-- Staff directory columns
-- ------------------------------------------------------------
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS qid text,
  ADD COLUMN IF NOT EXISTS e3_enrolled boolean,
  ADD COLUMN IF NOT EXISTS employment_type text,
  ADD COLUMN IF NOT EXISTS source_row_no int;

ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_employment_type_chk;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_employment_type_chk
  CHECK (employment_type IS NULL OR employment_type IN ('permanent', 'temporary'));

CREATE UNIQUE INDEX IF NOT EXISTS staff_qid_active_uidx
  ON public.staff (qid)
  WHERE qid IS NOT NULL AND btrim(qid) <> '' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS staff_location_status_active_idx
  ON public.staff (location_id, status)
  WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Compensation — never on public.staff (SELECT * must not leak salary)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_compensation (
  staff_id uuid PRIMARY KEY REFERENCES public.staff(id) ON DELETE CASCADE,
  monthly_salary_qar numeric(12, 2),
  daily_rate_qar numeric(12, 2),
  currency text NOT NULL DEFAULT 'QAR',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION public.user_can_view_staff_salary()
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
      AND role_level >= 55
      AND role IN ('ceo', 'coo', 'cfo', 'hr')
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_import_staff_roster()
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
      AND role IN ('ceo', 'coo', 'regional_ops', 'hr', 'branch_gm', 'duty_manager')
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_view_staff_salary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_can_import_staff_roster() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_view_staff_salary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_import_staff_roster() TO authenticated, service_role;

ALTER TABLE public.staff_compensation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_compensation_select" ON public.staff_compensation;
CREATE POLICY "staff_compensation_select" ON public.staff_compensation
  FOR SELECT TO authenticated
  USING (public.user_can_view_staff_salary());

DROP POLICY IF EXISTS "staff_compensation_write" ON public.staff_compensation;
CREATE POLICY "staff_compensation_write" ON public.staff_compensation
  FOR ALL TO authenticated
  USING (public.user_can_view_staff_salary())
  WITH CHECK (public.user_can_view_staff_salary());

DROP TRIGGER IF EXISTS trg_staff_compensation_updated ON public.staff_compensation;
CREATE TRIGGER trg_staff_compensation_updated
  BEFORE UPDATE ON public.staff_compensation
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ------------------------------------------------------------
-- Location transfers
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  from_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  to_location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  effective_on date NOT NULL,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_transfers_staff_idx
  ON public.staff_transfers (staff_id, effective_on DESC);

ALTER TABLE public.staff_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_transfers_select" ON public.staff_transfers;
CREATE POLICY "staff_transfers_select" ON public.staff_transfers
  FOR SELECT TO authenticated
  USING (
    public.user_can_access_location(to_location_id)
    OR (from_location_id IS NOT NULL AND public.user_can_access_location(from_location_id))
  );

DROP POLICY IF EXISTS "staff_transfers_insert" ON public.staff_transfers;
CREATE POLICY "staff_transfers_insert" ON public.staff_transfers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_access_location(to_location_id)
    AND (
      from_location_id IS NULL
      OR public.user_can_access_location(from_location_id)
    )
  );

-- ------------------------------------------------------------
-- Roster import batches (do not reuse attendance_imports)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'preview',
  mode text NOT NULL DEFAULT 'safe_sync',
  confirm_hard_delete boolean NOT NULL DEFAULT false,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  file_count int NOT NULL DEFAULT 0,
  row_count int NOT NULL DEFAULT 0,
  create_count int NOT NULL DEFAULT 0,
  update_count int NOT NULL DEFAULT 0,
  unchanged_count int NOT NULL DEFAULT 0,
  archive_count int NOT NULL DEFAULT 0,
  delete_count int NOT NULL DEFAULT 0,
  review_count int NOT NULL DEFAULT 0,
  error_message text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  rolled_back_at timestamptz,
  CONSTRAINT staff_import_batches_status_chk CHECK (
    status IN ('preview', 'queued', 'applied', 'rolled_back', 'failed')
  ),
  CONSTRAINT staff_import_batches_mode_chk CHECK (
    mode IN ('safe_sync', 'authoritative_replace')
  )
);

CREATE TABLE IF NOT EXISTS public.staff_import_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.staff_import_batches(id) ON DELETE CASCADE,
  filename text NOT NULL,
  file_type text NOT NULL,
  file_hash text NOT NULL,
  storage_path text,
  worksheet_name text,
  byte_size int NOT NULL DEFAULT 0,
  encrypted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_import_files_hash_idx
  ON public.staff_import_files (file_hash);

CREATE TABLE IF NOT EXISTS public.staff_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.staff_import_batches(id) ON DELETE CASCADE,
  row_number int NOT NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  match_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  match_rule text,
  action text NOT NULL,
  warnings text[] NOT NULL DEFAULT '{}',
  old_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_diffs jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT staff_import_rows_action_chk CHECK (
    action IN ('create', 'update', 'unchanged', 'archive', 'delete', 'review')
  )
);

CREATE INDEX IF NOT EXISTS staff_import_rows_batch_idx
  ON public.staff_import_rows (batch_id, action);

CREATE TABLE IF NOT EXISTS public.staff_import_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.staff_import_batches(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  before jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, staff_id)
);

ALTER TABLE public.staff_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_import_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_import_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_import_batches_read" ON public.staff_import_batches;
CREATE POLICY "staff_import_batches_read" ON public.staff_import_batches
  FOR SELECT TO authenticated
  USING (public.user_can_import_staff_roster());

DROP POLICY IF EXISTS "staff_import_batches_write" ON public.staff_import_batches;
CREATE POLICY "staff_import_batches_write" ON public.staff_import_batches
  FOR ALL TO authenticated
  USING (public.user_can_import_staff_roster())
  WITH CHECK (public.user_can_import_staff_roster());

DROP POLICY IF EXISTS "staff_import_files_read" ON public.staff_import_files;
CREATE POLICY "staff_import_files_read" ON public.staff_import_files
  FOR SELECT TO authenticated
  USING (public.user_can_import_staff_roster());

DROP POLICY IF EXISTS "staff_import_files_write" ON public.staff_import_files;
CREATE POLICY "staff_import_files_write" ON public.staff_import_files
  FOR ALL TO authenticated
  USING (public.user_can_import_staff_roster())
  WITH CHECK (public.user_can_import_staff_roster());

DROP POLICY IF EXISTS "staff_import_rows_read" ON public.staff_import_rows;
CREATE POLICY "staff_import_rows_read" ON public.staff_import_rows
  FOR SELECT TO authenticated
  USING (public.user_can_import_staff_roster());

DROP POLICY IF EXISTS "staff_import_rows_write" ON public.staff_import_rows;
CREATE POLICY "staff_import_rows_write" ON public.staff_import_rows
  FOR ALL TO authenticated
  USING (public.user_can_import_staff_roster())
  WITH CHECK (public.user_can_import_staff_roster());

DROP POLICY IF EXISTS "staff_import_snapshots_read" ON public.staff_import_snapshots;
CREATE POLICY "staff_import_snapshots_read" ON public.staff_import_snapshots
  FOR SELECT TO authenticated
  USING (public.user_can_import_staff_roster());

DROP POLICY IF EXISTS "staff_import_snapshots_write" ON public.staff_import_snapshots;
CREATE POLICY "staff_import_snapshots_write" ON public.staff_import_snapshots
  FOR ALL TO authenticated
  USING (public.user_can_import_staff_roster())
  WITH CHECK (public.user_can_import_staff_roster());

-- ------------------------------------------------------------
-- Private storage for original workbooks
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'staff-roster-imports',
  'staff-roster-imports',
  false,
  15728640,
  ARRAY[
    'application/octet-stream',
    'text/plain',
    'text/csv',
    'text/html',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "staff_roster_imports_storage_read" ON storage.objects;
CREATE POLICY "staff_roster_imports_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'staff-roster-imports' AND public.user_can_import_staff_roster());

DROP POLICY IF EXISTS "staff_roster_imports_storage_insert" ON storage.objects;
CREATE POLICY "staff_roster_imports_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'staff-roster-imports' AND public.user_can_import_staff_roster());

DROP POLICY IF EXISTS "staff_roster_imports_storage_delete" ON storage.objects;
CREATE POLICY "staff_roster_imports_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'staff-roster-imports' AND public.user_can_import_staff_roster());
