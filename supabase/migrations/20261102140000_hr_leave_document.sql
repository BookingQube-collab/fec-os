-- Link optional supporting document (e.g. sick medical certificate) to a leave request.
-- Safe to re-run. Does not change leave approval ladder or attendance sync.

ALTER TABLE public.hr_leave_requests
  ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.hr_employee_documents(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hr_leave_requests.document_id IS
  'Optional supporting document (medical certificate for sick leave) from hr_employee_documents.';

CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_document_id
  ON public.hr_leave_requests (document_id)
  WHERE document_id IS NOT NULL;
