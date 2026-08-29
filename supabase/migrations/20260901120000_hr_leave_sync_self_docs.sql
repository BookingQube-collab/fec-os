-- Leave approval → attendance_leave_records link + staff self-upload for employee docs.
-- Safe to re-run. Does not alter T&A calculation engine.
-- Depends on 20260831120000_hr_advanced_module.sql and attendance_leave_records.

ALTER TABLE public.attendance_leave_records
  ADD COLUMN IF NOT EXISTS hr_leave_request_id uuid REFERENCES public.hr_leave_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_leave_hr_request
  ON public.attendance_leave_records (hr_leave_request_id)
  WHERE hr_leave_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_leave_source
  ON public.attendance_leave_records (source)
  WHERE source = 'hr_leave';

-- Staff may insert their own document rows (HR still has full write).
DROP POLICY IF EXISTS "hr_employee_documents self insert" ON public.hr_employee_documents;
CREATE POLICY "hr_employee_documents self insert" ON public.hr_employee_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    staff_id IN (
      SELECT s.id FROM public.staff s
      WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

-- Storage: staff can upload into their own staff-id folder.
DROP POLICY IF EXISTS "hr_employee_documents_storage_insert" ON storage.objects;
CREATE POLICY "hr_employee_documents_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hr-employee-documents'
    AND (
      public.current_user_role_level() >= 55
      OR (storage.foldername(name))[1] IN (
        SELECT s.id::text FROM public.staff s
        WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
      )
    )
  );
