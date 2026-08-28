-- HR leave requests: employee submit + HR approve/reject.
-- Safe to re-run. Does not change attendance punches or payroll workbooks.

CREATE TABLE IF NOT EXISTS public.hr_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_type text NOT NULL DEFAULT 'annual',
  date_from date NOT NULL,
  date_to date NOT NULL,
  days numeric(5, 1) NOT NULL DEFAULT 1,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_leave_requests_type_chk CHECK (leave_type IN ('annual', 'sick', 'unpaid', 'emergency', 'other')),
  CONSTRAINT hr_leave_requests_status_chk CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT hr_leave_requests_dates_chk CHECK (date_to >= date_from)
);

CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_staff_dates
  ON public.hr_leave_requests (staff_id, date_from, date_to);

CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_status
  ON public.hr_leave_requests (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.hr_leave_requests TO authenticated;
GRANT ALL ON public.hr_leave_requests TO service_role;

ALTER TABLE public.hr_leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_leave_requests read" ON public.hr_leave_requests;
CREATE POLICY "hr_leave_requests read" ON public.hr_leave_requests FOR SELECT TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "hr_leave_requests insert self" ON public.hr_leave_requests;
CREATE POLICY "hr_leave_requests insert self" ON public.hr_leave_requests FOR INSERT TO authenticated
  WITH CHECK (
    staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
    OR public.current_user_role_level() >= 55
  );

DROP POLICY IF EXISTS "hr_leave_requests update" ON public.hr_leave_requests;
CREATE POLICY "hr_leave_requests update" ON public.hr_leave_requests FOR UPDATE TO authenticated
  USING (
    public.current_user_role_level() >= 55
    OR (
      status = 'pending'
      AND staff_id IN (
        SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
      )
    )
  )
  WITH CHECK (
    public.current_user_role_level() >= 55
    OR staff_id IN (
      SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL
    )
  );
